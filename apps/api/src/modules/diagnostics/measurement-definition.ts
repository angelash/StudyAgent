import { createHash } from 'node:crypto';
import type { DiagnosticResponse, DiagnosticSession, KnowledgeAtom, MeasurementItem, MeasurementContentCandidate } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { blueprintContentHash } from './assessment-blueprint';

/** Binds a new approval to the full rendered and scored content, including source eligibility. */
export function questionContentFingerprint(store: InMemoryStoreService, questionId: string) {
  return blueprintContentHash({ format: 'reviewed-question-content-v1',
    question: store.find('questions', { id: questionId }) ?? null,
    document: store.find('questionDocuments', { questionId }) ?? null,
    answerSchema: store.find('questionAnswerSchemas', { questionId }) ?? null,
    source: store.find('questionSources', { questionId }) ?? null });
}

export function measurementContentMatches(store: InMemoryStoreService, mapping: MeasurementItem, knownCandidate?: MeasurementContentCandidate | null) {
  const candidate = knownCandidate === undefined ? store.find('measurementCandidates', { questionId: mapping.questionId }) : knownCandidate;
  if (!mapping.contentFingerprint && !candidate) return true;
  const fingerprint = questionContentFingerprint(store, mapping.questionId);
  return (!mapping.contentFingerprint || mapping.contentFingerprint === fingerprint) &&
    (!candidate || candidate.status === 'published' && candidate.publishedHash === fingerprint);
}

/** Changes to labels or teaching do not change the measured construct. */
export function atomDefinitionFingerprint(atom: KnowledgeAtom) {
  return createHash('sha256').update(JSON.stringify({ format: 'atom-measurement-definition-v1', id: atom.id, subject: atom.subject,
    grade: atom.grade, term: atom.term, objective: atom.objective, successCriterion: atom.successCriterion,
    prerequisiteIds: [...atom.prerequisiteIds].sort() })).digest('hex');
}

/** Legacy approvals are usable only when the unchanged initial definition is known. */
export function measurementDefinitionMatches(store: InMemoryStoreService, mapping: MeasurementItem, atom: KnowledgeAtom) {
  if (mapping.atomDefinitionFingerprint) return mapping.atomDefinitionFingerprint === atomDefinitionFingerprint(atom);
  const original = atom.version === 1 ? atom : store.find('curriculumRevisions', { entityId: atom.id, kind: 'atom', version: 1 })?.snapshot as KnowledgeAtom | undefined;
  return !!original && atomDefinitionFingerprint(original) === atomDefinitionFingerprint(atom);
}

export function responseDefinitionFingerprint(response: DiagnosticResponse, sessions: Map<string, DiagnosticSession>) {
  if (response.atomDefinitionFingerprint) return response.atomDefinitionFingerprint;
  const atom = sessions.get(response.sessionId)?.atomSnapshots?.find(atom => atom.id === response.atomId);
  return atom ? atomDefinitionFingerprint(atom) : null;
}

export function compatibleDefinitionEvidence(atoms: readonly KnowledgeAtom[], responses: DiagnosticResponse[], sessions: Map<string, DiagnosticSession>, known = true) {
  const definitions = new Map(atoms.map(atom => [atom.id, atomDefinitionFingerprint(atom)]));
  const compatible: DiagnosticResponse[] = [], incompatibleEvidenceIds: string[] = [], unverifiedEvidenceIds: string[] = [];
  for (const response of responses) {
    const expected = definitions.get(response.atomId); if (!expected) continue;
    const actual = responseDefinitionFingerprint(response, sessions);
    if (!known || !actual) unverifiedEvidenceIds.push(response.id);
    else if (actual !== expected) incompatibleEvidenceIds.push(response.id);
    else compatible.push(response);
  }
  return { compatible, incompatibleEvidenceIds, unverifiedEvidenceIds };
}
