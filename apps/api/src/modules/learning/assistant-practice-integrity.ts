import { assertAssistantPracticeArtifact } from './assistant-practice-record';
import { assertAssistantPracticeAssignment, assignmentPayload, assignmentPublisherFingerprint } from './assistant-practice-assignment-record';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

type Row = { collection: string; record_id?: string; body: unknown };
/** Cold semantic checks never grant live access or turn a private candidate into a learner response. */
export function assertAssistantPracticeRecords(rows: Row[]) {
  try {
    if (rows.some(row => row.collection === 'assistantTeachingPracticeSessions'))
      throw Error('assistant_practice_phase_not_supported');
    const saved = rows.filter(row => row.collection === 'assistantPracticeArtifacts');
    const assignments = rows.filter(row => row.collection === 'assistantPracticeAssignments'); if (!saved.length && !assignments.length) return;
    const decoded = rows.map(row => ({ ...row, body: typeof row.body === 'string' ? JSON.parse(row.body) : row.body as any }));
    const sessions = new Map(decoded.filter(row => row.collection === 'assistantSessions').map(row => [row.body.id, row.body]));
    const students = new Set(decoded.filter(row => row.collection === 'students').map(row => row.body.id));
    const users = new Map(decoded.filter(row => row.collection === 'users').map(row => [row.body.id, row.body]));
    const artifacts = new Map<string, ReturnType<typeof assertAssistantPracticeArtifact>>();
    const ids = new Set<string>(), requests = new Set<string>();
    for (const entry of saved) {
      const value = typeof entry.body === 'string' ? JSON.parse(entry.body) : entry.body;
      const row = assertAssistantPracticeArtifact(value), session = sessions.get(row.sourceSessionId), origin = row.bank.source.origin;
      const request = JSON.stringify([row.ownerUserId, row.requestKey]);
      if (entry.record_id !== undefined && entry.record_id !== row.id || ids.has(row.id) || requests.has(request)
        || !session || session.ownerUserId !== row.ownerUserId || session.studentId !== origin.studentId || (session.subject ?? null) !== origin.subject
        || !students.has(row.studentId) || !users.has(row.ownerUserId)) throw Error();
      ids.add(row.id); requests.add(request);
      artifacts.set(row.id, row);
    }
    const assignmentIds = new Set<string>(), assignmentKeys = new Set<string>();
    for (const entry of assignments) {
      const row = assertAssistantPracticeAssignment(typeof entry.body === 'string' ? JSON.parse(entry.body) : entry.body);
      const key = JSON.stringify([row.publisherFingerprint, row.requestKey]);
      if (entry.record_id !== undefined && entry.record_id !== row.id || assignmentIds.has(row.id) || assignmentKeys.has(key) || !students.has(row.studentId)) throw Error();
      assignmentIds.add(row.id); assignmentKeys.add(key);
      if (row.sourceState === 'linked') {
        const artifact = artifacts.get(row.privateOrigin!.artifactId), publisher = users.get(row.publisherUserId!);
        const originalVersion = artifact?.history.find(item => item.revision === row.artifactRevision);
        if (!artifact || !publisher || artifact.ownerUserId !== row.publisherUserId || publisher.role !== row.publisherRole
          || artifact.ownerRole !== row.publisherRole || artifact.studentId !== row.studentId || artifact.subject !== row.subject
          || originalVersion?.contentFingerprint !== row.artifactContentFingerprint
          || digest(assignmentPayload(artifact, row.artifactRevision)) !== row.payloadFingerprint) throw Error();
      } else {
        const childHash = digest({ id: row.studentId });
        const deletion = decoded.some(item => item.collection === 'privacyRequests' && item.body.kind === 'account_delete'
          && typeof item.body.actorId === 'string' && assignmentPublisherFingerprint(item.body.actorId) === row.publisherFingerprint
          && item.body.subjectHash === digest({ id: item.body.actorId })
          && Array.isArray(item.body.retainedStudentHashes) && Array.isArray(item.body.erasedStudentHashes)
          && !item.body.erasedStudentHashes.includes(childHash)
          && (item.body.retainedStudentHashes.includes(childHash) || row.publisherRole === 'admin'));
        if (!deletion) throw Error();
      }
    }
  } catch { throw Error('assistant_practice_saved_integrity_failed'); }
}
