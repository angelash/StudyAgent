import type { PrivacyReceipt } from '@study-agent/contracts';
import type { ControlledEditorialRepository } from './controlled-editorial-workflow';
import { controlledActorFingerprint, controlledActorIdentity } from './controlled-actor-identity';
import { assertControlledEditorialRecords } from './controlled-editorial-integrity';
import { retentionDigest } from './retention-anchor';

/** The privacy transaction supplies its actual completed account receipt. No
 * user-input redaction flag can waive native original-source verification.
 * This draft returns replacements; no collection or HTTP handler is activated.
 */
export function anonymizeControlledEditorial(repository: Pick<ControlledEditorialRepository, 'reviews'|'publications'|'releases'|'commands'>,
  actorId: string, receipt: PrivacyReceipt, priorReceipts: readonly PrivacyReceipt[] = []) {
  const fingerprint = controlledActorFingerprint(actorId), identity = controlledActorIdentity(actorId);
  if (receipt.kind !== 'account_delete' || receipt.actorId !== actorId || receipt.subjectHash !== fingerprint || !Number.isFinite(Date.parse(receipt.completedAt))) throw Error('controlled_original_account_deletion_receipt_required');
  const receipts = [...priorReceipts, receipt]; assertControlledEditorialRecords(repository, receipts);
  const publishedReviews = new Set(repository.publications.flatMap(row => row.originals.map(original => original.review.id)));
  const publications = structuredClone([...repository.publications]);
  const reviews = repository.reviews.flatMap(row => row.actorId !== actorId ? [structuredClone(row)] :
    !publishedReviews.has(row.id) ? [] : [{ ...structuredClone(row), actorId: null, commandId: null, actorDeletionHash: fingerprint }]);
  const commands = repository.commands.filter(row => row.actorId !== actorId).map(row => structuredClone(row));
  const releases = repository.releases.map(row => ({ ...structuredClone(row), history: row.history.map(event => event.actorId !== identity ? structuredClone(event) :
    { ...structuredClone(event), commandId: null, actorDeletionHash: fingerprint, reason: event.state === 'withdrawn' ? '' : event.reason }) }));
  const result = { reviews, publications, releases, commands };
  if (retentionDigest(publications) !== retentionDigest(repository.publications)) throw Error('controlled_shared_publication_changed_during_deletion');
  assertControlledEditorialRecords(result, receipts); return result;
}
