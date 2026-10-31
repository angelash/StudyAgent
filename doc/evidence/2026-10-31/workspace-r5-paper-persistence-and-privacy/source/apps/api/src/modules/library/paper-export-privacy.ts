import type { PrivacyReceipt } from '@study-agent/contracts';
import type { TaskIntent } from '../../infrastructure/task-repository';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { assertPaperExportRecord, type PaperExportRecord } from './paper-export-record';
import { assertPaperExportFile, collectPaperExportFile, paperExportErasureProof, paperExportFileIdentityFingerprint, type PaperExportFileRecord } from './paper-export-file-record';
import { assertPaperExportErasureProofs } from './paper-export-native';

export const paperLibraryPrivateCollections = ['paperSelectionLists', 'paperSelectionCommands', 'paperExports', 'paperExportCommands'] as const;
export const paperLibraryCollections = [...paperLibraryPrivateCollections, 'paperSourceExposures', 'paperExportFiles'] as const;
type State = Record<string, any[]>;
const same = (a: unknown, b: unknown) => digest(a) === digest(b);
function fail(): never { throw Error('paper_export_deletion_original_missing'); }

/** Capture actual present identities for a live deletion, or bind an older
 * backup to the independently supplied latest receipt. Never create rows which
 * only occur in that later receipt. Caller removes the selected private rows. */
export function preparePaperLibraryErasure(state: State, selected: readonly unknown[], receipt: PrivacyReceipt,
  mode: 'live' | 'restore'): { files: PaperExportFileRecord[]; enqueue: TaskIntent[] } {
  const records = selected.map(assertPaperExportRecord), ids = new Set(records.map(row => row.id));
  if (ids.size !== records.length || records.some(row => !(state.paperExports ?? []).some(saved => saved.id === row.id && same(saved, row)))) fail();
  const files = (state.paperExportFiles ?? []).map(assertPaperExportFile);
  if (mode === 'live') {
    if (receipt.erasedPaperExports !== undefined) fail();
    if (records.length) receipt.erasedPaperExports = records.map(row => paperExportErasureProof(row, files.filter(file => file.exportId === row.id)));
  }
  const proofs = assertPaperExportErasureProofs(receipt), proofMap = new Map(proofs.map(proof => [proof.exportId, proof]));
  const enqueue: TaskIntent[] = [];
  for (const row of records) {
    const proof = proofMap.get(row.id), expected = paperExportErasureProof(row, []);
    if (!proof || row.createdAt > receipt.completedAt || !same({ ...proof, files: [] }, expected)) fail();
  }
  const updated = files.map(file => {
    if (!ids.has(file.exportId)) return file;
    const proof = proofMap.get(file.exportId);
    if (!proof?.files.some(saved => saved.id === file.id && saved.identityFingerprint === paperExportFileIdentityFingerprint(file)) ||
        file.createdAt > receipt.completedAt || file.deletionReceiptId && file.deletionReceiptId !== receipt.id) fail();
    if (file.cleanupTaskId) {
      // The original cleanup may already be running or complete. Its immutable
      // task still owns this workspace; bind the receipt without replacing it.
      return assertPaperExportFile({ ...file, deletionReceiptId: receipt.id, updatedAt: file.updatedAt > receipt.completedAt ? file.updatedAt : receipt.completedAt });
    }
    const collected = collectPaperExportFile(file, receipt.id, receipt.completedAt); enqueue.push(collected.task); return collected.file;
  });
  return { files: updated, enqueue };
}

/** Runs inside the caller's real SQL transaction, after receipt/private-row
 * changes. All task eligibility comes from persisted rows in that transaction. */
export async function fenceErasedPaperExportTasks(query: (sql: string, args?: any[]) => Promise<any[]>, at: string) {
  const rows = await query("SELECT collection,record_id,body FROM domain_records WHERE collection IN ('paperExports','privacyRequests')"), exports = new Set<string>();
  const proofs = new Map<string, { receipt: PrivacyReceipt; proof: ReturnType<typeof assertPaperExportErasureProofs>[number] }>();
  for (const row of rows) {
    const body = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
    if (row.collection === 'paperExports') { exports.add(assertPaperExportRecord(body).id); continue; }
    for (const proof of assertPaperExportErasureProofs(body)) { if (proofs.has(proof.exportId)) fail(); proofs.set(proof.exportId, { receipt: body, proof }); }
  }
  if (!proofs.size) return 0;
  const tasks = await query("SELECT * FROM durable_tasks WHERE kind='library.paper-export.render' LIMIT 100001"); if (tasks.length > 100000) fail();
  let fenced = 0;
  for (const task of tasks) {
    const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload;
    if (exports.has(payload.exportId)) continue;
    const erased = proofs.get(payload.exportId);
    if (!erased || erased.proof.intentFingerprint !== payload.intentFingerprint || erased.proof.actorFingerprint !== digest({ id: task.owner_id }) ||
        !erased.proof.tasks.some(saved => saved.id === task.id && saved.payloadHash === task.payload_hash) || task.created_at > erased.receipt.completedAt) fail();
    const historyId = 'paper-export-erased:' + digest({ taskId: task.id, receiptId: erased.receipt.id });
    const previous = (await query('SELECT detail FROM durable_task_history WHERE id=?', [historyId]))[0];
    if (previous) continue;
    const active = ['queued', 'running', 'retry_wait', 'cancel_requested'].includes(task.state);
    const next = ['running', 'cancel_requested'].includes(task.state) && task.lease_until > Date.parse(at) ? 'cancel_requested' : 'cancelled';
    if (active) await query('UPDATE durable_tasks SET state=?,version=version+1,updated_at=?,lease_token=CASE WHEN ?=1 THEN lease_token ELSE NULL END,lease_until=CASE WHEN ?=1 THEN lease_until ELSE NULL END WHERE id=?',
      [next, at, next === 'cancel_requested' ? 1 : 0, next === 'cancel_requested' ? 1 : 0, task.id]);
    const detail = { receiptId: erased.receipt.id, exportId: payload.exportId, intentFingerprint: payload.intentFingerprint,
      generation: task.generation, previousState: task.state, state: active ? next : task.state };
    await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)', [historyId, task.id, 'privacy_erased', 'system-paper-export', at, JSON.stringify(detail)]); fenced++;
  }
  return fenced;
}

/** A retained learner keeps originals/exposure facts when an old guardian is
 * erased. Only tasks still using that erased guardian's activation are fenced. */
export async function fencePaperLibraryRevokedGuardians(query: (sql: string, args?: any[]) => Promise<any[]>, at: string) {
  const rows = await query("SELECT collection,body FROM domain_records WHERE collection IN ('paperExports','paperExportCommands','privacyRequests','users')"), state: State = {};
  for (const row of rows) (state[row.collection] ??= []).push(typeof row.body === 'string' ? JSON.parse(row.body) : row.body);
  const records = (state.paperExports ?? []).filter(row => row.scope.kind === 'student_self'); if (!records.length) return 0;
  const tasks = await query("SELECT * FROM durable_tasks WHERE kind='library.paper-export.render' AND state IN ('queued','running','retry_wait','cancel_requested') LIMIT 100001");
  if (tasks.length > 100000) fail(); let fenced = 0;
  for (const task of tasks) {
    const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload, record = records.find(row => row.id === payload.exportId);
    if (!record) continue;
    const activation = state.paperExportCommands?.find(command => command.input.kind === 'retry' && command.result.kind === 'retry' && command.result.taskId === task.id && command.result.generation === task.generation),
      authorization = activation?.authorization ?? record.authorization, access = authorization.learningAccess;
    if (!access || state.users?.some(user => user.id === access.guardianId)) continue;
    const receipt = state.privacyRequests?.find(receipt => receipt.kind === 'account_delete' && receipt.actorId === access.guardianId && receipt.subjectHash === digest({ id: access.guardianId }) &&
      receipt.retainedStudentHashes?.includes(digest({ id: record.scope.studentId })) && !receipt.erasedStudentHashes?.includes(digest({ id: record.scope.studentId })) &&
      receipt.completedAt >= (activation?.at ?? record.createdAt));
    if (!receipt) fail();
    const authorizationFingerprint = digest(authorization), historyId = 'paper-export-guardian:' + digest({ taskId: task.id, generation: task.generation, receiptId: receipt.id, authorizationFingerprint });
    if ((await query('SELECT id FROM durable_task_history WHERE id=?', [historyId])).length) continue;
    const next = ['running', 'cancel_requested'].includes(task.state) && task.lease_until > Date.parse(at) ? 'cancel_requested' : 'cancelled';
    await query('UPDATE durable_tasks SET state=?,version=version+1,updated_at=?,lease_token=CASE WHEN ?=1 THEN lease_token ELSE NULL END,lease_until=CASE WHEN ?=1 THEN lease_until ELSE NULL END WHERE id=?', [next, at, next === 'cancel_requested' ? 1 : 0, next === 'cancel_requested' ? 1 : 0, task.id]);
    await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)', [historyId, task.id, 'authorization_fenced', 'system-paper-export', at,
      JSON.stringify({ receiptId: receipt.id, authorizationFingerprint, generation: task.generation, previousState: task.state, state: next })]); fenced++;
  }
  return fenced;
}

export async function fencePaperLibraryPrivacy(query: (sql: string, args?: any[]) => Promise<any[]>, at: string) {
  return await fenceErasedPaperExportTasks(query, at) + await fencePaperLibraryRevokedGuardians(query, at);
}
