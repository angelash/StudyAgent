import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { assertControlledPublication, type ControlledContrastPublication } from './controlled-contrast-publication';
import { actualControlledPacketMatches } from './controlled-contrast-materials';
import { selectControlledContrasts } from './controlled-contrast-selection';
import { independentFamilyKey } from './family-identity';
import { originalPaperExposure } from './paper-exposure';
import { retentionDigest } from './retention-anchor';

/** Current availability and the child's real retained exposures, never a caller's
 * invented seen list. The service performs current student/scope authorization.
 */
export function selectCurrentControlledContrasts(store: InMemoryStoreService, publicationValue: ControlledContrastPublication,
  studentId: string, seed: string, limits: { independentUnits: number; items: number; seconds: number }) {
  const publication = assertControlledPublication(publicationValue), release = store.find('controlledContrastReleases', { logicalId: publication.logicalId });
  if (release?.history.at(-1)?.state !== 'published' || release.history.at(-1)?.publicationId !== publication.id) throw Error('controlled_publication_current_release_unavailable');
  const diagnostics = store.select('diagnosticSessions', { studentId }), practices = store.select('practiceSessions', { studentId });
  const seenQuestionIds = new Set([...diagnostics.flatMap(row => row.questionSnapshots.map(question => question.id)),
    ...practices.flatMap(row => row.questionIds), ...originalPaperExposure(store, studentId)]);
  const originalMappings = [...diagnostics.flatMap(row => row.itemSnapshots), ...practices.flatMap(row => row.itemSnapshots ?? [])];
  // A later mapping edit must not erase the original family exposure. Retain
  // both current and historically saved mappings for an already exposed question.
  const historicalMappings = store.select('curriculumRevisions', { kind: 'measurement', 'snapshot.atomId': publication.content.atomId }).map(row => row.snapshot as any);
  const mappings = [...originalMappings, ...store.select('measurementItems', { atomId: publication.content.atomId }), ...historicalMappings];
  const seenFamilyKeys = new Set(originalMappings.filter(row => row.atomId === publication.content.atomId).map(independentFamilyKey));
  for (const mapping of mappings) if (mapping.atomId === publication.content.atomId && seenQuestionIds.has(mapping.questionId)) seenFamilyKeys.add(independentFamilyKey(mapping));
  const unknownLegacyPractice = practices.some(row => row.atomId === publication.content.atomId && row.questionIds.some(questionId =>
    !mappings.some(mapping => mapping.atomId === publication.content.atomId && mapping.questionId === questionId)));
  if (unknownLegacyPractice) for (const unit of publication.content.units) seenFamilyKeys.add(independentFamilyKey({ atomId: publication.content.atomId, family: unit.family }));
  const blueprint = selectControlledContrasts({ protocol: publication.content, studentId, seed, requiredIndependentUnits: limits.independentUnits,
    itemLimit: limits.items, secondsLimit: limits.seconds, seenQuestionIds, seenFamilyKeys,
    packetAvailable: packet => {
      const original = publication.originals.find(row => row.review.id === packet.materialReviewId);
      return !!original && actualControlledPacketMatches(store, packet, original.review, original);
    } });
  if (!unknownLegacyPractice) return blueprint;
  const { fingerprint: _fingerprint, ...body } = blueprint, next = { ...body, gaps: [...blueprint.gaps, '历史练习没有可核对的原题族来源，当前不能确认新的独立对照，请保留原记录后核查。'] };
  return { ...next, fingerprint: retentionDigest(next) };
}
