import type { KnowledgeAtom,MeasurementItem,QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { mediaModeAvailable } from '../student-media/media-normalization';
import { measurementDefinitionMatches,measurementContentMatches } from './measurement-definition';

const immutableInputSupport = new WeakMap<QuestionAnswerSchema, boolean>();
const immutableDefinitionMatches = new WeakMap<MeasurementItem, WeakMap<KnowledgeAtom, boolean>>();
export function availableMeasurementInput(schema: QuestionAnswerSchema) {
  // inspect() exposes deeply frozen snapshots. An edited schema is a different snapshot; mutable rows are never cached.
  let supported = Object.isFrozen(schema) ? immutableInputSupport.get(schema) : undefined;
  if (supported === undefined) {
    supported = answerInputConfiguration(schema).supported;
    if (Object.isFrozen(schema)) immutableInputSupport.set(schema, supported);
  }
  // Tool availability can change independently of the immutable answer configuration.
  return supported && mediaModeAvailable(schema.mode);
}

export function measuredAgainstDefinition(store: InMemoryStoreService, mapping: MeasurementItem, atom: KnowledgeAtom) {
  if (!Object.isFrozen(mapping) || !Object.isFrozen(atom)) return measurementDefinitionMatches(store, mapping, atom);
  let matches = immutableDefinitionMatches.get(mapping);
  if (!matches) { matches = new WeakMap(); immutableDefinitionMatches.set(mapping, matches); }
  const previous = matches.get(atom); if (previous !== undefined) return previous;
  const current = measurementDefinitionMatches(store, mapping, atom); matches.set(atom, current); return current;
}

/** A reviewed map is usable only while its question, source and document version remain eligible. */
export function eligibleMeasurements(store: InMemoryStoreService, atomIds?: string[]) {
  const mappings = atomIds ? store.select('measurementItems', { atomId: atomIds }) : store.inspect('measurementItems');
  const questionIds = [...new Set(mappings.map(item => item.questionId))];
  const atoms = new Map((atomIds ? store.select('knowledgeAtoms', { id: atomIds }) : store.inspect('knowledgeAtoms')).map((a) => [a.id, a]));
  const questions = new Map((atomIds ? store.select('questions', { id: questionIds }) : store.inspect('questions')).map((q) => [q.id, q]));
  const sourceRows = atomIds ? store.select('questionSources', { questionId: questionIds }) : store.inspect('questionSources');
  const documentRows = atomIds ? store.select('questionDocuments', { questionId: questionIds }) : store.inspect('questionDocuments');
  const schemaRows = atomIds ? store.select('questionAnswerSchemas', { questionId: questionIds }) : store.inspect('questionAnswerSchemas');
  const sources = new Map(sourceRows.map((s) => [s.questionId, s])), documents = new Map(documentRows.map((d) => [d.questionId, d]));
  const schemas = new Map(schemaRows.map(schema => [schema.questionId, schema]));
  // The unfiltered overview can contain more than the selector's bounded
  // value-array limit. Its other source collections are already full inspected
  // snapshots, so use the same immutable full view for candidate rows.
  const candidateRows = atomIds ? store.select('measurementCandidates', { questionId: questionIds }) : store.inspect('measurementCandidates');
  const candidates = new Map(candidateRows.map(candidate => [candidate.questionId, candidate]));
  // Match find()'s first-record semantics for the same complete reviewed packet, without per-item mutable lookups.
  const firstByQuestion = <T extends { questionId: string }>(rows: readonly T[]) => {
    const first = new Map<string, T>(); for (const row of rows) if (!first.has(row.questionId)) first.set(row.questionId, row); return first;
  };
  const contentDocuments = firstByQuestion(documentRows), contentSchemas = firstByQuestion(schemaRows), contentSources = firstByQuestion(sourceRows);
  return mappings.filter((item) => {
    const atom = atoms.get(item.atomId), question = questions.get(item.questionId), source = sources.get(item.questionId);
    return item.reviewStatus === 'approved' && atom?.status === 'published' && question?.status === 'published' &&
      question.subject === atom.subject && source?.reviewStatus === 'approved' && source.licenseClass !== 'C_PUBLIC_REFERENCE_ONLY' &&
      item.questionVersion === (documents.get(item.questionId)?.version ?? 1) && measuredAgainstDefinition(store, item, atom) &&
      measurementContentMatches(store, item, candidates.get(item.questionId) ?? null, { question: question ?? null,
        document: contentDocuments.get(item.questionId) ?? null, answerSchema: contentSchemas.get(item.questionId) ?? null,
        source: contentSources.get(item.questionId) ?? null }) &&
      !!schemas.get(item.questionId) && availableMeasurementInput(schemas.get(item.questionId)!);
  });
}
