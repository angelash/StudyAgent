import { learningScopeSchema, type PrivacyReceipt } from '@study-agent/contracts';
import { controlledActorFingerprint } from './controlled-actor-identity';
import { assertControlledPublication, type ControlledContrastPublication } from './controlled-contrast-publication';
import { assertControlledDiagnosticSession, prepareControlledDiagnosticSession, type ControlledDiagnosticSession } from './controlled-session-origin';
import { controlledPreviewFingerprint, controlledPreviewId, controlledPreviewInputSchema, controlledPreviewRequestHash,
  controlledStartInputSchema, controlledStartRequestHash, type ControlledPreviewRecord } from './controlled-preview-record';
import { retentionDigest } from './retention-anchor';

type Records = { previews: readonly ControlledPreviewRecord[]; publications: readonly ControlledContrastPublication[];
  sessions: readonly ControlledDiagnosticSession[]; students: readonly { id: string; userId?: string | null }[];
  users: readonly { id: string; role: string }[]; receipts: readonly PrivacyReceipt[] };
const same = (left: unknown, right: unknown) => retentionDigest(left) === retentionDigest(right);
const fail = () => { throw Error('controlled_preview_saved_original_integrity_failed'); };

/** Native verification uses original publication/child/start relations, never
 * today's mutable scope, source eligibility or a user-supplied deletion flag.
 * Session activation stays fenced until response and disclosure gates are ready.
 */
export function assertControlledPreviewRecords(records: Records) {
  try {
    const previews = new Set<string>(), linkedSessions = new Set<string>();
    for (const row of records.previews) {
      const allowed = ['protocol','id','arrangedBy','arrangerFingerprint','arrangerDeletionHash','command','studentId','subject','requestKey','input','requestHash',
        'publicationId','publicationFingerprint','scopeSnapshot','seed','blueprint','fingerprint','createdAt','expiresAt','sessionId','starts'];
      if (!row || Object.keys(row).some(key => !allowed.includes(key)) || row.protocol !== 'controlled-preview-record-v1' || previews.has(row.id) ||
          !/^[a-f0-9]{64}$/.test(row.arrangerFingerprint) || !/^[a-f0-9]{64}$/.test(row.requestHash) || !row.seed ||
          !Number.isFinite(Date.parse(row.createdAt)) || Date.parse(row.expiresAt) !== Date.parse(row.createdAt) + 30 * 60_000 ||
          controlledPreviewFingerprint(row) !== row.fingerprint || !Array.isArray(row.starts) || row.starts.length > 1) fail();
      previews.add(row.id);
      const scope = learningScopeSchema.parse(row.scopeSnapshot), student = records.students.find(child => child.id === row.studentId);
      const command = controlledPreviewInputSchema.parse({ ...row.command, requestKey: 'native-shared-command' });
      const { requestKey: _private, ...selection } = command;
      if (!same(scope, row.scopeSnapshot) || !same(selection, row.command) || !student || row.studentId !== row.command.studentId || row.subject !== row.command.subject ||
          scope.studentId !== row.studentId || scope.subject !== row.subject || scope.id !== row.command.expectedScopeId || scope.version !== row.command.expectedScopeVersion ||
          row.publicationId !== row.command.publicationId || row.publicationFingerprint !== row.command.expectedPublicationFingerprint ||
          row.blueprint.seed !== row.seed || row.blueprint.requiredIndependentUnits !== row.command.independentUnits ||
          row.blueprint.units.length * 2 > row.command.maxItems || row.blueprint.expectedSeconds > Math.min(row.command.maxSeconds, scope.minutesPerSession * 60, 600)) fail();
      const publication = records.publications.find(value => value.id === row.publicationId);
      if (!publication || assertControlledPublication(publication).fingerprint !== row.publicationFingerprint) fail();
      prepareControlledDiagnosticSession({ id: row.id, arrangedBy: 'controlled-actor:' + row.arrangerFingerprint, startedAt: row.createdAt,
        scope, publication: publication!, blueprint: row.blueprint, allowIncompletePreview: true });
      if (row.arrangedBy !== null) {
        if (!records.users.some(user => user.id === row.arrangedBy) || row.arrangerDeletionHash !== undefined || row.input === null || row.requestKey === null ||
            controlledActorFingerprint(row.arrangedBy) !== row.arrangerFingerprint || controlledPreviewId(row.arrangedBy, row.requestKey) !== row.id ||
            !same(controlledPreviewInputSchema.parse(row.input), row.input) || !same(row.input, { ...row.command, requestKey: row.requestKey }) ||
            controlledPreviewRequestHash(row.arrangedBy, row.input) !== row.requestHash) fail();
      } else {
        const receipt = records.receipts.find(value => value.kind === 'account_delete' && value.subjectHash === row.arrangerFingerprint &&
          controlledActorFingerprint(value.actorId) === row.arrangerFingerprint && value.retainedStudentHashes?.includes(controlledActorFingerprint(row.studentId)) &&
          Date.parse(value.completedAt) >= Date.parse(row.starts[0]?.at ?? row.createdAt));
        if (row.arrangerDeletionHash !== row.arrangerFingerprint || row.input !== null || row.requestKey !== null || !row.sessionId || !receipt) fail();
      }
      if (row.sessionId === null) { if (row.starts.length) fail(); continue; }
      const session = records.sessions.find(value => value.id === row.sessionId), start = row.starts[0];
      if (!session || !start || linkedSessions.has(row.sessionId) || !student?.userId || start.actorId !== student.userId ||
          !records.users.some(user => user.id === start.actorId && user.role === 'student') ||
          !same(controlledStartInputSchema.parse(start.input), start.input) || start.input.requestKey !== start.requestKey ||
          start.input.expectedPreviewFingerprint !== row.fingerprint || controlledStartRequestHash(start.actorId, row.id, start.input) !== start.requestHash ||
          start.resultHash !== retentionDigest(start.result) || !same(start.result, { protocol: 'controlled-start-receipt-v1', previewId: row.id,
            studentId: row.studentId, sessionId: row.sessionId, startedAt: start.at }) ||
          !same(Object.keys(start).sort(), ['actorId','requestKey','input','requestHash','at','result','resultHash'].sort()) ||
          session.startedAt !== start.at || Date.parse(start.at) < Date.parse(row.createdAt) || Date.parse(start.at) >= Date.parse(row.expiresAt) ||
          !same(session.scopeSnapshot, scope) || !same(session.controlledContrast, row.blueprint) ||
          session.controlledOrigin?.arrangedBy !== 'controlled-actor:' + row.arrangerFingerprint) fail();
      assertControlledDiagnosticSession(session!, publication!); linkedSessions.add(row.sessionId);
    }
    if (records.sessions.some(session => !linkedSessions.has(session.id))) fail();
  } catch (error) {
    throw Error('controlled_preview_saved_original_integrity_failed', { cause: error });
  }
}
