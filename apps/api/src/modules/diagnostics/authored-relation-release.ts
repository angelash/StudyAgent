import { isDeepStrictEqual } from 'node:util';
import { knowledgeAtomSchema, type CurriculumRevision, type KnowledgeAtom, type MeasurementItem, type Question, type QuestionAnswerSchema,
  type QuestionDocument, type QuestionSourceRecord } from '@study-agent/contracts';
import rawRelease from '../../../../../resources/curriculum/authored-relations-2026-10-20-v1.json';
import type { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { FoundationDefinition } from './foundation-curriculum';
import { blueprintContentHash } from './assessment-blueprint';

export const authoredRelationRelease = { ...rawRelease, before: knowledgeAtomSchema.strict().parse(rawRelease.before),
  after: knowledgeAtomSchema.strict().parse(rawRelease.after) };
export const authoredRelationActor: InMemoryUserAccount = { id: `system:${authoredRelationRelease.releaseId}`, principal: '', passwordHash: '',
  displayName: '原创先修关系与对应题目复核', role: 'admin', status: 'active' };

/** This is an explicit authored release, not permission to infer new dependencies from question text. */
export function addAuthoredRelationRelease(definitions: FoundationDefinition[]) {
  const target = definitions.find(row => row.atom.id === authoredRelationRelease.before.id);
  if (!target || !isDeepStrictEqual(target.atom, authoredRelationRelease.before)) throw new Error('The authored relation release no longer matches its original source definition; review a new release.');
  target.atom = structuredClone(authoredRelationRelease.after);
  return definitions;
}

/** Human edits and unknown revision histories remain under the existing curriculum review workflow. */
export function authoredRelationDefinitionUpdate(previous: KnowledgeAtom | undefined, revisions: readonly CurriculumRevision[]) {
  if (!previous || previous.id !== authoredRelationRelease.before.id) return null;
  const original = authoredRelationRelease.before, { teaching: _teaching, ...withoutTeaching } = original;
  const exactV1 = previous.version === 1 && (isDeepStrictEqual(previous, original) || isDeepStrictEqual(previous, withoutTeaching));
  const knownTeachingMigration = previous.version === 2 && isDeepStrictEqual(previous, { ...original, version: 2 }) &&
    revisions.some(row => row.kind === 'atom' && row.entityId === previous.id && row.version === 1 && isDeepStrictEqual(row.snapshot, withoutTeaching)) &&
    revisions.some(row => row.kind === 'atom' && row.entityId === previous.id && row.version === 2 && row.actorId === 'system:authored-teaching-v1' && isDeepStrictEqual(row.snapshot, previous));
  return exactV1 || knownTeachingMigration ? { atom: structuredClone(authoredRelationRelease.after), expectedVersion: previous.version } : null;
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

export function reviewedAuthoredRelationMappings(store: InMemoryStoreService): MeasurementItem[] {
  const current = store.find('knowledgeAtoms', { id: authoredRelationRelease.after.id });
  if (!current || !isDeepStrictEqual(current, { ...authoredRelationRelease.after, version: current.version })) return [];
  return authoredRelationRelease.questions.flatMap(review => {
    const mapping = store.find('measurementItems', { id: `measurement:${review.questionId}` });
    if (!mapping || blueprintContentHash(mapping) !== review.mappingSha256 || store.find('measurementCandidates', { questionId: review.questionId })) return [];
    const question = store.find('questions', { id: review.questionId }), document = store.find('questionDocuments', { questionId: review.questionId });
    const answerSchema = store.find('questionAnswerSchemas', { questionId: review.questionId }), source = store.find('questionSources', { questionId: review.questionId });
    if (!question || !document || !answerSchema || !source || authoredContentReviewFingerprint({ question, document, answerSchema, source }) !== review.contentSha256) return [];
    return [structuredClone(mapping)];
  });
}
