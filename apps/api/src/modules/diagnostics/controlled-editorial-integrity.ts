import { controlledActorIdentity,controlledActorFingerprint,isControlledActorIdentity } from './controlled-actor-identity';
import type { PrivacyReceipt } from '@study-agent/contracts';
import { controlledMaterialApprovalInputSchema, controlledPublicationInputSchema, controlledEditorialCommandId } from './controlled-editorial-command';
import { controlledWithdrawalInputSchema, controlledReleaseId, controlledWorkflowCommandHash, type ControlledEditorialRepository, type ControlledEditorialCommand } from './controlled-editorial-workflow';
import { assertControlledMaterialOriginal } from './controlled-contrast-snapshot';
import { assertControlledPublicationHistory, prepareControlledPublication } from './controlled-contrast-publication';
import { retentionDigest } from './retention-anchor';

const same = (left: unknown, right: unknown) => {
  if (retentionDigest(left) !== retentionDigest(right)) throw Error('controlled_editorial_original_relation_changed');
};
const unique = <T>(rows: readonly T[], key: (row: T) => string) => {
  const keys = rows.map(key);
  if (new Set(keys).size !== keys.length) throw Error('controlled_editorial_duplicate_original');
};

/** Rebuild private editorial relations from retained original commands and snapshots.
 * This draft is not registered as a database reader until the actual29 reader is sealed.
 * Current mutable question state is deliberately not an input to historical validation.
 */
export function assertControlledEditorialRecords(repository: Pick<ControlledEditorialRepository, 'reviews' | 'publications' | 'releases' | 'commands'>, deletionReceipts: readonly PrivacyReceipt[] = []) {
  try {
    const { reviews, publications, releases, commands } = repository;
    unique(reviews, row => row.id); unique(publications, row => row.id);
    unique(releases, row => row.id); unique(releases, row => row.logicalId);
    unique(commands, row => row.id); unique(commands, row => JSON.stringify([row.actorId, row.requestKey]));
    assertControlledPublicationHistory(publications);
    const deletedAt = (fingerprint: string, at: string) => /^[a-f0-9]{64}$/.test(fingerprint) && deletionReceipts.some(row => row.kind === 'account_delete' && row.subjectHash === fingerprint && controlledActorFingerprint(row.actorId) === fingerprint &&
      Number.isFinite(Date.parse(row.completedAt)) && Date.parse(row.completedAt) >= Date.parse(at));
    for (const publication of publications) for (const original of publication.originals) {
      const retained = reviews.find(row => row.id === original.review.id);
      if (!retained || Date.parse(retained.createdAt) > Date.parse(publication.content.publishedAt)) throw Error('controlled_publication_actual_review_missing');
      same(retained.snapshot, original);
    }
    const usedCommands = new Set<string>(), publishedIds = new Set<string>();
    const command = (id: string, kind: ControlledEditorialCommand['kind']) => {
      const row = commands.find(value => value.id === id);
      if (!row || row.protocol !== 'controlled-editorial-command-v1' || row.kind !== kind || usedCommands.has(id) ||
          row.id !== controlledEditorialCommandId(row.actorId, row.requestKey) || !Number.isFinite(Date.parse(row.at))) throw Error('controlled_editorial_original_command_missing');
      const input = (kind === 'material-approve' ? controlledMaterialApprovalInputSchema : kind === 'protocol-publish' ? controlledPublicationInputSchema : controlledWithdrawalInputSchema).parse(row.input);
      same(input, row.input);
      if (input.requestKey !== row.requestKey || row.requestHash !== controlledWorkflowCommandHash(kind, row.actorId, input) || row.resultHash !== retentionDigest(row.result)) throw Error('controlled_editorial_original_command_changed');
      usedCommands.add(id); return row;
    };
    for (const row of reviews) {
      const snapshot = assertControlledMaterialOriginal(row.snapshot), review = snapshot.review;
      if (Object.keys(row).some(key => !['protocol','id','snapshot','actorId','commandId','actorDeletionHash','createdAt'].includes(key)) ||
          row.protocol !== 'controlled-material-review-record-v1' || row.id !== review.id || row.createdAt !== review.reviewedAt) throw Error('controlled_material_original_review_missing');
      if (row.actorId === null) {
        if (row.commandId !== null || !row.actorDeletionHash || !deletedAt(row.actorDeletionHash,row.createdAt) ||
            review.reviewerId !== 'controlled-actor:' + row.actorDeletionHash || !publications.some(publication => publication.originals.some(original => original.review.id === row.id))) throw Error('controlled_material_original_deletion_receipt_missing');
        continue;
      }
      if (!row.commandId || row.actorDeletionHash !== undefined) throw Error('controlled_material_private_command_required');
      const saved = command(row.commandId, 'material-approve');
      const input = controlledMaterialApprovalInputSchema.parse(saved.input);
      if (row.protocol !== 'controlled-material-review-record-v1' || row.id !== review.id || controlledActorIdentity(row.actorId) !== review.reviewerId ||
          row.actorId !== saved.actorId || row.id !== saved.resourceId || row.createdAt !== saved.at || row.createdAt !== review.reviewedAt ||
          row.id !== 'controlled_review:' + retentionDigest({ actorId: row.actorId, requestKey: input.requestKey })) throw Error('controlled_material_original_review_missing');
      same(input, { protocol: 'controlled-material-approval-input-v1', itemId: review.itemId,
        expectedMappingVersion: review.mappingVersion, expectedContentFingerprint: review.contentFingerprint,
        expectedDefinitionFingerprint: review.definitionFingerprint, expectedPrerequisiteFingerprint: review.prerequisiteFingerprint,
        operation: review.operation, representation: review.representation, requiredConditions: review.requiredConditions,
        reason: review.reason, acknowledgeHumanReview: true, acknowledgeSharedMaterial: true, requestKey: saved.requestKey });
      same(saved.result, { protocol: 'controlled-material-approval-receipt-v1', id: row.id, reviewedAt: row.createdAt,
        reviewerId: controlledActorIdentity(row.actorId), snapshotFingerprint: snapshot.fingerprint, packet: snapshot.packet });
    }
    for (const release of releases) {
      if (release.protocol !== 'controlled-contrast-release-v1' || release.id !== controlledReleaseId(release.logicalId) ||
          !release.history.length || release.revision !== release.history.length || release.createdAt !== release.history[0].at ||
          release.updatedAt !== release.history.at(-1)!.at) throw Error('controlled_release_original_history_missing');
      let priorPublicationId: string | null = null, priorAt: string | undefined, publicationRevision = 0;
      for (const [index, event] of release.history.entries()) {
        const kind = event.state === 'published' ? 'protocol-publish' : event.state === 'withdrawn' ? 'protocol-withdraw' : undefined;
        if (!kind || event.revision !== index + 1 || event.previousPublicationId !== priorPublicationId ||
            !Number.isFinite(Date.parse(event.at)) || priorAt && Date.parse(event.at) < Date.parse(priorAt)) throw Error('controlled_release_original_history_changed');
        if (!isControlledActorIdentity(event.actorId) || Object.keys(event).some(key => !['revision','publicationId','previousPublicationId','state','actorId','commandId','actorDeletionHash','at','reason'].includes(key))) throw Error('controlled_release_original_author_invalid');
        let saved: ControlledEditorialCommand | undefined;
        if (event.commandId === null) {
          if (!event.actorDeletionHash || !deletedAt(event.actorDeletionHash,event.at) || event.actorId !== 'controlled-actor:' + event.actorDeletionHash) throw Error('controlled_release_original_deletion_receipt_missing');
        } else {
          if (event.actorDeletionHash !== undefined) throw Error('controlled_release_private_command_required');
          saved = command(event.commandId, kind);
          if (controlledActorIdentity(saved.actorId) !== event.actorId || saved.at !== event.at || saved.resourceId !== release.id) throw Error('controlled_release_original_command_mismatch');
        }
        const publication = publications.find(row => row.id === (event.publicationId ?? event.previousPublicationId));
        if (!publication || publication.logicalId !== release.logicalId) throw Error('controlled_release_original_publication_missing');
        if (kind === 'protocol-publish') {
          const previous = publications.find(row => row.id === priorPublicationId);
          if (publishedIds.has(publication.id) || publication.revision !== ++publicationRevision || publication.publisher.id !== event.actorId ||
              publication.content.publishedAt !== event.at || publication.previousFingerprint !== (previous?.fingerprint ?? null)) throw Error('controlled_publication_original_command_mismatch');
          if (saved) {
          const input = controlledPublicationInputSchema.parse(saved.input);
          if (input.logicalId !== release.logicalId || input.expectedRevision !== publication.revision - 1 || input.expectedPreviousFingerprint !== (previous?.fingerprint ?? null)) throw Error('controlled_publication_original_command_mismatch');
          const originals = input.units.flatMap(unit => [unit.controlMaterialReviewId, unit.challengeMaterialReviewId]).map(id => {
            const original = reviews.find(row => row.id === id);
            if (!original || Date.parse(original.createdAt) > Date.parse(event.at)) throw Error('controlled_publication_actual_review_missing');
            return original.snapshot;
          });
          const packet = (id: string) => originals.find(row => row.review.id === id)!.packet;
          const content = { protocol: 'controlled-cause-contrast-v1', sharing: 'shared-controlled-protocol-v1', id: input.logicalId, revision: publication.revision,
            cause: input.cause, subject: input.subject, atomId: input.atomId, definitionFingerprint: input.expectedDefinitionFingerprint,
            familyIdentityVersion: publication.content.familyIdentityVersion, controlCondition: input.controlCondition,
            challengeCondition: input.challengeCondition, allowedChange: input.allowedChange, publishedBy: controlledActorIdentity(saved.actorId), publishedAt: event.at,
            units: input.units.map(unit => ({ id: unit.id, family: unit.family, control: packet(unit.controlMaterialReviewId),
              challenge: packet(unit.challengeMaterialReviewId), changedCondition: unit.changedCondition, changedSourceLocators: unit.changedSourceLocators,
              heldConditions: unit.heldConditions, additionalKnowledgeExcluded: unit.additionalKnowledgeExcluded,
              difficultyRationale: unit.difficultyRationale, review: { decision: 'approved', reviewerId: controlledActorIdentity(saved.actorId), reviewedAt: event.at, reason: unit.reviewReason } })) };
          same(prepareControlledPublication(content, publication.publisher, originals, previous), publication);
          }
          if (event.reason !== '教研主体逐项核对实际原题与控制变量后明确发布。') throw Error('controlled_release_original_reason_changed');
          publishedIds.add(publication.id); priorPublicationId = publication.id;
        } else {
          const previous = release.history[index - 1];
          if (!previous || previous.state !== 'published' || event.publicationId !== null) throw Error('controlled_release_original_withdrawal_changed');
          if (saved) {
            const input = controlledWithdrawalInputSchema.parse(saved.input);
            if (input.logicalId !== release.logicalId || input.expectedReleaseRevision !== index || input.expectedPublicationId !== publication.id ||
                input.expectedContentFingerprint !== publication.contentFingerprint || input.reason !== event.reason) throw Error('controlled_release_original_withdrawal_changed');
          } else if (event.reason !== '') throw Error('controlled_release_private_reason_not_removed');
        }
        if (saved) same(saved.result, { protocol: 'controlled-publication-operation-receipt-v1', releaseId: release.id,
          logicalId: release.logicalId, releaseRevision: event.revision, state: event.state, publicationId: publication.id,
          publicationRevision: publication.revision, contentFingerprint: publication.contentFingerprint, at: event.at });
        priorAt = event.at;
      }
    }
    if (usedCommands.size !== commands.length || publishedIds.size !== publications.length) throw Error('controlled_editorial_original_reverse_relation_missing');
  } catch (error) { throw Error('controlled_editorial_saved_integrity_failed', { cause: error }); }
}
