import { isDeepStrictEqual } from 'node:util';
import { componentBindingSchema, knowledgeAtomSchema, type ComponentBinding, type CurriculumRevision, type KnowledgeAtom, type MeasurementItem, type Question, type QuestionAnswerSchema,
  type QuestionDocument, type QuestionSourceRecord } from '@study-agent/contracts';
import rawRelease from '../../../../../resources/curriculum/authored-relations-2026-10-20-v1.json';
import rawAtomicRelease from '../../../../../resources/curriculum/authored-atomic-relations-2026-10-20-v1.json';
import type { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { FoundationDefinition } from './foundation-curriculum';
import { blueprintContentHash } from './assessment-blueprint';
import { atomDefinitionFingerprint } from './measurement-definition';

type RawRelease = { releaseId: string; before: unknown; after: unknown; reviewKind: string;
  questions: Array<{ questionId: string; contentSha256: string; mappingSha256: string; seedMappingSha256?: string; componentBindings?: ComponentBinding[] }> };
const parseRelease = <T extends RawRelease>(raw: T): Omit<T, 'before' | 'after' | 'questions'> & {
  before: KnowledgeAtom; after: KnowledgeAtom; questions: RawRelease['questions'];
} => ({ ...raw, before: knowledgeAtomSchema.strict().parse(raw.before),
  after: knowledgeAtomSchema.strict().parse(raw.after), questions: raw.questions.map(review => ({ ...review,
    ...(review.componentBindings ? { componentBindings: review.componentBindings.map(binding => componentBindingSchema.parse(binding)) } : {}) })) });
export const authoredRelationRelease = parseRelease(rawRelease);
export const authoredAtomicRelationRelease = parseRelease(rawAtomicRelease);
export const authoredRelationReleases = [authoredRelationRelease, authoredAtomicRelationRelease];
type AuthoredRelease = typeof authoredRelationReleases[number];
export const authoredRelationReleaseActor = (release: AuthoredRelease): InMemoryUserAccount => ({ id: `system:${release.releaseId}`, principal: '', passwordHash: '',
  displayName: '原创先修关系与对应题目复核', role: 'admin', status: 'active' });
export const authoredRelationActor = authoredRelationReleaseActor(authoredRelationRelease);

/** This release does not grant a fresh install broader approval than the frozen reviewed list. */
export function authoredSeedMeasurementFingerprint(atom: KnowledgeAtom, questionId: string) {
  const release = authoredAtomicRelationRelease;
  return atom.id === release.after.id && !release.questions.some(review => review.questionId === questionId)
    ? atomDefinitionFingerprint(release.before) : atomDefinitionFingerprint(atom);
}

export function authoredRelationTargetsCompatible(store: InMemoryStoreService, release: AuthoredRelease) {
  if (release.releaseId !== authoredAtomicRelationRelease.releaseId) return true;
  return rawAtomicRelease.componentTargetDefinitions.every(definition => {
    const target = store.find('knowledgeAtoms', { id: definition.id });
    return target?.status === 'published' && target.parentId === definition.parentId && atomDefinitionFingerprint(target) === atomDefinitionFingerprint(knowledgeAtomSchema.parse(definition));
  });
}

/** This is an explicit authored release, not permission to infer new dependencies from question text. */
export function addAuthoredRelationRelease(definitions: FoundationDefinition[]) {
  for (const release of authoredRelationReleases) {
    const target = definitions.find(row => row.atom.id === release.before.id);
    if (!target || !isDeepStrictEqual(target.atom, release.before)) throw new Error('The authored relation release no longer matches its original source definition; review a new release.');
    target.atom = structuredClone(release.after);
  }
  return definitions;
}

/** Human edits and unknown revision histories remain under the existing curriculum review workflow. */
export function authoredRelationDefinitionUpdate(previous: KnowledgeAtom | undefined, revisions: readonly CurriculumRevision[], release: AuthoredRelease = authoredRelationRelease) {
  if (!previous || previous.id !== release.before.id) return null;
  const original = release.before, { teaching: _teaching, ...withoutTeaching } = original;
  const exactV1 = previous.version === 1 && (isDeepStrictEqual(previous, original) || isDeepStrictEqual(previous, withoutTeaching));
  const knownTeachingMigration = previous.version === 2 && isDeepStrictEqual(previous, { ...original, version: 2 }) &&
    revisions.some(row => row.kind === 'atom' && row.entityId === previous.id && row.version === 1 && isDeepStrictEqual(row.snapshot, withoutTeaching)) &&
    revisions.some(row => row.kind === 'atom' && row.entityId === previous.id && row.version === 2 && row.actorId === 'system:authored-teaching-v1' && isDeepStrictEqual(row.snapshot, previous));
  return exactV1 || knownTeachingMigration ? { atom: structuredClone(release.after), expectedVersion: previous.version } : null;
}

export type AuthoredReviewPacket = { question: Question; document: QuestionDocument; answerSchema: QuestionAnswerSchema; source: QuestionSourceRecord };
/** A generated prompt block's opaque ID varies per installation. Every actual content field remains bound. */
export function authoredContentReviewFingerprint(packet: AuthoredReviewPacket) {
  const document = structuredClone(packet.document);
  if (!document.blocks[0]) return null;
  document.blocks[0].id = 'original-prompt';
  return blueprintContentHash({ format: 'authored-content-review-v1', question: packet.question, document,
    answerSchema: packet.answerSchema, source: packet.source });
}

export function reviewedAuthoredRelationMappings(store: InMemoryStoreService, release: AuthoredRelease = authoredRelationRelease): MeasurementItem[] {
  const current = store.find('knowledgeAtoms', { id: release.after.id });
  if (!current || !isDeepStrictEqual(current, { ...release.after, version: current.version }) || !authoredRelationTargetsCompatible(store, release)) return [];
  return release.questions.flatMap(review => {
    const mapping = store.find('measurementItems', { id: `measurement:${review.questionId}` });
    if (!mapping || ![review.mappingSha256, review.seedMappingSha256].includes(blueprintContentHash(mapping)) || store.find('measurementCandidates', { questionId: review.questionId })) return [];
    if (review.componentBindings?.some(binding => {
      const child = store.find('knowledgeAtoms', { id: binding.atomId });
      return !child || child.status !== 'published' || child.parentId !== current.id || !current.prerequisiteIds.includes(child.id) ||
        binding.atomDefinitionFingerprint !== atomDefinitionFingerprint(child);
    })) return [];
    const question = store.find('questions', { id: review.questionId }), document = store.find('questionDocuments', { questionId: review.questionId });
    const answerSchema = store.find('questionAnswerSchemas', { questionId: review.questionId }), source = store.find('questionSources', { questionId: review.questionId });
    if (!question || !document || !answerSchema || !source || authoredContentReviewFingerprint({ question, document, answerSchema, source }) !== review.contentSha256) return [];
    return [{ ...structuredClone(mapping), ...(review.componentBindings ? { componentBindings: structuredClone(review.componentBindings) } : {}) }];
  });
}
