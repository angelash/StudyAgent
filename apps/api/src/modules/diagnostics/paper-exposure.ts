import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';

/** Reserving an original for the learner is conservative prior exposure, not proof of answering it. */
export function originalPaperExposure(store: InMemoryStoreService, studentId: string): Set<string> {
  const originals = new Set<string>(), documents = new Set<string>();
  for (const session of store.select('paperPracticeSessions', { studentId })) {
    // A guardian's private rehearsal must never become the child's learning evidence.
    if (!store.find('users', { id: session.ownerUserId, role: 'student' })) continue;
    for (const item of session.items) {
      if (item.kind === 'document') documents.add(item.paperId);
      if (item.kind === 'question') originals.add(JSON.stringify([item.paperId, item.position, item.sourceQuestionId]));
    }
  }
  if (!originals.size && !documents.size) return new Set();
  // Keep the provenance link even across withdrawal/republication or packet revisions.
  // Candidate and paper hashes describe different packets and cannot be compared for equality.
  return new Set(store.inspect('measurementCandidates').filter(candidate => candidate.questionId &&
    (documents.has(candidate.paperId) || originals.has(JSON.stringify([candidate.paperId, candidate.position, candidate.sourceQuestionId]))))
    .map(candidate => candidate.questionId!));
}
