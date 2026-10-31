import type { PrivacyReceipt } from '@study-agent/contracts';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { paperLibraryPrivateCollections } from './paper-export-privacy';
import type { PaperSelectionAuthorization } from './paper-selection-record';
import { paperExportFileIdentityFingerprint } from './paper-export-file-record';

type State = Record<string, any[]>;
type Change = { collection: string; id: string; body: string | null };
const same = (a: unknown, b: unknown) => digest(a) === digest(b);
function fail(): never { throw Error('paper_library_write_integrity_failed'); }
function deletion(receipt: PrivacyReceipt, row: any, studentFact = false) {
  const studentId = studentFact ? row.studentId : row.scope?.studentId;
  return ['account_delete', 'student_delete'].includes(receipt.kind) && receipt.completedAt >= (row.createdAt ?? row.at) &&
    ((!studentFact && receipt.kind === 'account_delete' && receipt.actorId === row.actorId && receipt.subjectHash === digest({ id: row.actorId })) ||
      studentId !== null && studentId !== undefined && receipt.erasedStudentHashes?.includes(digest({ id: studentId })));
}
function currentAuthor(state: State, row: { actorId: string; scope: { studentId: string | null }; authorization: PaperSelectionAuthorization }, allowDiagnostic = false) {
  const actor = state.users?.find(user => user.id === row.actorId), auth = row.authorization;
  if (!actor || actor.status !== 'active' || actor.role !== auth.actorRole || (actor.version ?? 1) !== auth.actorVersion) fail();
  if (auth.actorRole === 'student') {
    const access = auth.learningAccess, student = state.students?.find(student => student.id === row.scope.studentId && student.userId === row.actorId),
      guardian = access && state.users?.find(user => user.id === access.guardianId && user.status === 'active' && ['parent', 'admin'].includes(user.role));
    if (!student || !access || !guardian || !state.studentLearningAccess?.some(saved => saved.studentId === row.scope.studentId && saved.userId === row.actorId &&
        saved.status === 'enabled' && saved.version === access.accessVersion) || guardian.role !== 'admin' && !state.bindings?.some(binding =>
        binding.studentId === row.scope.studentId && binding.parentUserId === guardian.id && binding.status === 'active')) fail();
    if (!allowDiagnostic && state.diagnosticSessions?.some(session => session.studentId === row.scope.studentId && session.status === 'in_progress')) fail();
  }
}
function sources(state: State, role: string, values: readonly { source: { paperId: string; publicationVersion: number | null }; research?: boolean }[]) {
  const privileged = ['admin', 'teacher', 'operator'].includes(role);
  for (const value of values) {
    const publication = state.paperPublications?.find(saved => saved.paperId === value.source.paperId);
    if ((publication?.version ?? null) !== value.source.publicationVersion || (!privileged || !value.research) && publication?.status !== 'published') fail();
  }
}
function exportAuthorization(state: State, record: any, taskId: string, generation: number) {
  const activation = state.paperExportCommands?.find(command => command.input.kind === 'retry' && command.result.kind === 'retry' &&
    command.result.taskId === taskId && command.result.generation === generation);
  const authorization = activation?.authorization ?? record.authorization;
  currentAuthor(state, { ...record, authorization });
  const list = state.paperSelectionLists?.find(list => list.id === record.intent.listId), selected = list?.history[record.intent.listRevision - 1]?.snapshot.items;
  if (!selected) fail(); sources(state, authorization.actorRole, selected);
}
/** Runs against persisted current rows in the same SQL transaction as writes.
 * It supplements request CAS and the complete cold relation reader. */
export function assertPaperLibraryWrites(previous: State, current: State, changes: readonly Change[]) {
  const receipts = current.privacyRequests ?? [];
  for (const change of changes) {
    const old = previous[change.collection]?.find(row => (row.id ?? row.eventId) === change.id), next = change.body === null ? null : JSON.parse(change.body);
    if ((paperLibraryPrivateCollections as readonly string[]).includes(change.collection) || change.collection === 'paperSourceExposures') {
      if (old && !next) {
        if (!receipts.some(receipt => deletion(receipt, old, change.collection === 'paperSourceExposures'))) fail();
        continue;
      }
      if (!next) continue;
      if (['paperSelectionCommands', 'paperExportCommands', 'paperSourceExposures'].includes(change.collection) && old && !same(old, next)) fail();
      if (change.collection === 'paperSelectionLists') {
        if (old && (next.actorId !== old.actorId || !same(next.scope, old.scope) || next.createdAt !== old.createdAt || next.history.length !== old.history.length + 1 ||
            !same(next.history.slice(0, -1), old.history)) || !old && next.history.length !== 1) fail();
      } else if (change.collection === 'paperExports' && old) {
        if (!same({ ...old, slots: [] }, { ...next, slots: [] }) || next.slots.length !== old.slots.length || next.slots.some((slot: any, index: number) =>
          !same({ ...slot, published: null }, { ...old.slots[index], published: null }) || old.slots[index].published && !same(slot.published, old.slots[index].published))) fail();
        for (const [index, slot] of next.slots.entries()) if (slot.published && !old.slots[index].published) exportAuthorization(current, next, slot.taskId, slot.published.generation);
      }
      if (!old && change.collection === 'paperSelectionCommands') {
        const list = current.paperSelectionLists?.find(list => list.id === next.result.listId), selected = list?.history[next.result.revision - 1]?.snapshot.items;
        if (!selected) fail(); currentAuthor(current, next, selected.length === 0); sources(current, next.authorization.actorRole, selected);
      }
      if (!old && change.collection === 'paperExportCommands') {
        currentAuthor(current, next, next.input.kind === 'cancel');
        if (next.input.kind !== 'cancel') {
          const record = current.paperExports?.find(row => row.id === next.result.exportId), list = record && current.paperSelectionLists?.find(list => list.id === record.intent.listId),
            selected = list?.history[record.intent.listRevision - 1]?.snapshot.items;
          if (!selected) fail(); sources(current, next.authorization.actorRole, selected);
        }
      }
      if (!old && change.collection === 'paperSourceExposures') {
        currentAuthor(current, { ...next, scope: { studentId: next.studentId } });
        sources(current, 'student', [{ source: next.input, research: false }]);
      }
    } else if (change.collection === 'paperExportFiles') {
      if (old && (!next || paperExportFileIdentityFingerprint(old) !== paperExportFileIdentityFingerprint(next) || old.output && !same(old.output, next.output) ||
          old.state === 'deleted' && next.state !== 'deleted' || old.state === 'collecting' && !['collecting', 'deleted'].includes(next.state) ||
          old.state === 'available' && next.state === 'reserved' || old.deletionReceiptId && next.deletionReceiptId !== old.deletionReceiptId ||
          old.cleanupTaskId && next.cleanupTaskId !== old.cleanupTaskId || next.updatedAt < old.updatedAt)) fail();
      if (next && (!old || !old.output && next.output)) {
        const record = current.paperExports?.find(row => row.id === next.exportId);
        if (!record || next.state !== 'reserved') fail(); exportAuthorization(current, record, next.taskId, next.generation);
      }
    }
  }
}
