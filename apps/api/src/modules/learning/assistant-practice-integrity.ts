import { assertAssistantPracticeArtifact } from './assistant-practice-record';

type Row = { collection: string; record_id?: string; body: unknown };
/** Cold semantic checks never grant live access or turn a private candidate into a learner response. */
export function assertAssistantPracticeRecords(rows: Row[]) {
  try {
    if (rows.some(row => ['assistantPracticeAssignments', 'assistantTeachingPracticeSessions'].includes(row.collection)))
      throw Error('assistant_practice_phase_not_supported');
    const saved = rows.filter(row => row.collection === 'assistantPracticeArtifacts'); if (!saved.length) return;
    const decoded = rows.map(row => ({ ...row, body: typeof row.body === 'string' ? JSON.parse(row.body) : row.body as any }));
    const sessions = new Map(decoded.filter(row => row.collection === 'assistantSessions').map(row => [row.body.id, row.body]));
    const students = new Set(decoded.filter(row => row.collection === 'students').map(row => row.body.id));
    const users = new Set(decoded.filter(row => row.collection === 'users').map(row => row.body.id));
    const ids = new Set<string>(), requests = new Set<string>();
    for (const entry of saved) {
      const value = typeof entry.body === 'string' ? JSON.parse(entry.body) : entry.body;
      const row = assertAssistantPracticeArtifact(value), session = sessions.get(row.sourceSessionId), origin = row.bank.source.origin;
      const request = JSON.stringify([row.ownerUserId, row.requestKey]);
      if (entry.record_id !== undefined && entry.record_id !== row.id || ids.has(row.id) || requests.has(request)
        || !session || session.ownerUserId !== row.ownerUserId || session.studentId !== origin.studentId || (session.subject ?? null) !== origin.subject
        || !students.has(row.studentId) || !users.has(row.ownerUserId)) throw Error();
      ids.add(row.id); requests.add(request);
    }
  } catch { throw Error('assistant_practice_saved_integrity_failed'); }
}
