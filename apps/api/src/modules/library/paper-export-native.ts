import { z } from 'zod';
import { paperExportErasureProofSchema, paperSelectionHashSchema as hash, paperSelectionIdSchema as id,
  paperSelectionTimeSchema as time, type PaperExportErasureProof, type PrivacyReceipt, type PaperSelectionItem } from '@study-agent/contracts';
import type { TaskRow } from '../../infrastructure/task-repository';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { assertPaperSelectionNativeRows } from './paper-selection-native';
import { assertPaperSourceExposure, preparePaperSourceExposure } from './paper-source-exposure-record';
import { assertPaperExportCommand, assertPaperExportRecord, preparePaperExport, paperExportExposureKey, paperExportTaskId,
  paperExportTaskKey, paperExportTaskPayload, PAPER_EXPORT_CLEANUP_KIND, PAPER_EXPORT_TASK_KIND } from './paper-export-record';
import { assertPaperExportFile, paperExportCleanupPayload, paperExportCleanupTaskId, paperExportFileIdentityFingerprint,
  paperExportFileProgress, paperExportProgressSchema, paperExportPublicationResult } from './paper-export-file-record';
import { assertPaperSelectionList, type PaperSelectionAuthorization } from './paper-selection-record';

type Row = { collection: string; record_id?: string; body: unknown };
const same = (left: unknown, right: unknown) => digest(left) === digest(right);
function fail(): never { throw Error('paper_export_native_relation_changed'); }
const unique = <T>(values: readonly T[], key: (value: T) => string) => { if (new Set(values.map(key)).size !== values.length) fail(); };
const decode = (value: unknown): any => typeof value === 'string' ? JSON.parse(value) : value;
const object = z.record(z.string(), z.unknown());
const taskSchema = z.object({ id, kind: z.enum([PAPER_EXPORT_TASK_KIND, PAPER_EXPORT_CLEANUP_KIND]), ownerUserId: id, requestKey: z.string().min(1).max(200),
  payloadHash: hash, payload: object, createdAt: time, maxAttempts: z.number().int().positive(),
  state: z.enum(['queued', 'running', 'retry_wait', 'cancel_requested', 'cancelled', 'succeeded', 'failed']), attempts: z.number().int().nonnegative(),
  generation: z.number().int().positive(), version: z.number().int().positive(), availableAt: z.number().int().nonnegative(),
  leaseToken: z.string().nullable(), leaseUntil: z.number().int().nonnegative().nullable(), progress: object, result: object.nullable(),
  errorCode: z.string().nullable(), updatedAt: time }).strict();
/** Actual queue rows, including SQL backup rows; never fabricate a task from an intent. */
export function paperExportNativeTasks(values: readonly unknown[]): TaskRow[] {
  return values.filter(value => [PAPER_EXPORT_TASK_KIND, PAPER_EXPORT_CLEANUP_KIND].includes((value as any)?.kind)).map(value => {
    const raw = value as Record<string, any>, projected = 'owner_id' in raw ? {
      id: raw.id, kind: raw.kind, ownerUserId: raw.owner_id, requestKey: raw.request_key, payloadHash: raw.payload_hash, payload: decode(raw.payload),
      state: raw.state, attempts: raw.attempts, maxAttempts: raw.max_attempts, generation: raw.generation, version: raw.version,
      availableAt: Number(raw.available_at), leaseToken: raw.lease_token, leaseUntil: raw.lease_until === null ? null : Number(raw.lease_until),
      progress: decode(raw.progress), result: decode(raw.result), errorCode: raw.error_code, createdAt: raw.created_at, updatedAt: raw.updated_at,
    } : raw;
    const task = taskSchema.parse(projected);
    const leased = ['running', 'cancel_requested'].includes(task.state);
    if (!same(task, projected) || task.payloadHash !== digest(task.payload) || task.updatedAt < task.createdAt || task.attempts > task.maxAttempts ||
        leased !== (task.leaseToken !== null && task.leaseUntil !== null) || !leased && (task.leaseToken !== null || task.leaseUntil !== null) ||
        task.state === 'succeeded' && task.result === null || task.state !== 'succeeded' && task.result !== null) fail();
    return task;
  });
}
const historySchema = z.object({ id: z.string().min(1).max(200), taskId: id, action: z.string().min(1).max(100), actorId: id, at: time, detail: object }).strict();
function histories(values: readonly unknown[], taskIds: Set<string>) {
  return values.map(value => { const raw = value as Record<string, any>; if (!raw || typeof raw !== 'object') return fail();
    return 'task_id' in raw ? { id: raw.id, taskId: raw.task_id, action: raw.action, actorId: raw.actor_id, at: raw.at, detail: decode(raw.detail) } : raw;
  }).filter(value => taskIds.has(value.taskId)).map(value => historySchema.parse(value));
}
export function assertPaperExportErasureProofs(receipt: PrivacyReceipt): PaperExportErasureProof[] {
  if (receipt.erasedPaperExports === undefined) return [];
  if (!['account_delete', 'student_delete'].includes(receipt.kind) || !id.safeParse(receipt.id).success || !id.safeParse(receipt.actorId).success ||
      !hash.safeParse(receipt.inputHash).success || !hash.safeParse(receipt.subjectHash).success || !time.safeParse(receipt.completedAt).success ||
      !receipt.requestKey || !receipt.counts || !['records', 'observations', 'activities', 'plans', 'conversations', 'accessRecords'].every(key =>
        Number.isSafeInteger(receipt.counts[key as keyof typeof receipt.counts]) && receipt.counts[key as keyof typeof receipt.counts] >= 0) ||
      !Array.isArray(receipt.erasedStudentHashes) || !Array.isArray(receipt.retainedStudentHashes) || receipt.erasedStudentHashes.length > 10000 ||
      receipt.retainedStudentHashes.length > 10000 || [...receipt.erasedStudentHashes, ...receipt.retainedStudentHashes].some(value => !hash.safeParse(value).success) ||
      new Set([...receipt.erasedStudentHashes, ...receipt.retainedStudentHashes]).size !== receipt.erasedStudentHashes.length + receipt.retainedStudentHashes.length ||
      receipt.kind === 'account_delete' && receipt.subjectHash !== digest({ id: receipt.actorId }) ||
      receipt.kind === 'student_delete' && (!same(receipt.erasedStudentHashes, [receipt.subjectHash]) || receipt.retainedStudentHashes.length) ||
      !Array.isArray(receipt.erasedPaperExports) || receipt.erasedPaperExports.length > 100000) fail();
  const proofs = receipt.erasedPaperExports.map(value => paperExportErasureProofSchema.parse(value));
  if (!same(proofs, receipt.erasedPaperExports)) fail();
  unique(proofs, proof => proof.exportId); unique(proofs.flatMap(proof => proof.tasks), task => task.id); unique(proofs.flatMap(proof => proof.files), file => file.id);
  for (const proof of proofs) if (!(receipt.kind === 'account_delete' && proof.actorFingerprint === receipt.subjectHash) &&
      !(proof.studentFingerprint !== null && receipt.erasedStudentHashes.includes(proof.studentFingerprint))) fail();
  return proofs;
}

/** Pre-registration verifier for all six collections. Application/schema32
 * activation is deliberately separate from this candidate's pure reader. */
export function assertPaperExportNativeRows(rows: readonly Row[], taskValues: readonly unknown[], historyValues: readonly unknown[]) {
  try {
    const state: Record<string, any[]> = {};
    for (const row of rows) { const body = decode(row.body); if (!body || typeof body !== 'object' || row.record_id !== undefined && (body.id ?? body.eventId) !== row.record_id) fail();
      (state[row.collection] ??= []).push(body); }
    assertPaperSelectionNativeRows(rows.filter(row => ['users', 'students', 'privacyRequests', 'paperSelectionLists', 'paperSelectionCommands', 'paperSourceExposures'].includes(row.collection) &&
      !(row.collection === 'paperSourceExposures' && decode(row.body).input?.kind === 'export')));
    const exports = (state.paperExports ?? []).map(assertPaperExportRecord), commands = (state.paperExportCommands ?? []).map(assertPaperExportCommand),
      files = (state.paperExportFiles ?? []).map(assertPaperExportFile), lists = (state.paperSelectionLists ?? []).map(assertPaperSelectionList),
      exposures = (state.paperSourceExposures ?? []).filter(value => value.input?.kind === 'export').map(assertPaperSourceExposure), tasks = paperExportNativeTasks(taskValues);
    unique(exports, row => row.id); unique(commands, row => row.id); unique(commands, row => JSON.stringify([row.actorId, row.requestKey]));
    unique(files, row => row.id); unique(files, row => row.workspace); unique(tasks, row => row.id); unique(exposures, row => row.id);
    const exportMap = new Map(exports.map(row => [row.id, row])), commandMap = new Map(commands.map(row => [row.id, row])),
      taskMap = new Map(tasks.map(task => [task.id, task])), fileMap = new Map(files.map(file => [file.id, file]));
    const history = histories(historyValues, new Set(tasks.map(task => task.id))); unique(history, row => row.id);
    const receipts = state.privacyRequests as PrivacyReceipt[] ?? [], proofMap = new Map<string, { receipt: PrivacyReceipt; proof: PaperExportErasureProof }>();
    for (const receipt of receipts) for (const proof of assertPaperExportErasureProofs(receipt)) {
      if (proofMap.has(proof.exportId)) fail(); proofMap.set(proof.exportId, { receipt, proof });
    }
    const authors = (actorId: string, scope: { studentId: string | null }, authorization: PaperSelectionAuthorization, at: string) => {
      if (!(state.users ?? []).some(user => user.id === actorId) || scope.studentId !== null && !(state.students ?? []).some(student => student.id === scope.studentId && student.userId === actorId)) fail();
      const access = authorization.learningAccess;
      if (access && !(state.users ?? []).some(user => user.id === access.guardianId) && !receipts.some(receipt => receipt.kind === 'account_delete' &&
          receipt.actorId === access.guardianId && receipt.subjectHash === digest({ id: access.guardianId }) && receipt.retainedStudentHashes?.includes(digest({ id: scope.studentId })) &&
          !receipt.erasedStudentHashes?.includes(digest({ id: scope.studentId })) && receipt.completedAt >= at)) fail();
    };
    const usedCommands = new Set<string>(), expectedExposures = new Set<string>();
    for (const row of exports) {
      if (proofMap.has(row.id)) fail();
      const original = commandMap.get(row.intent.commandId), list = lists.find(list => list.id === row.intent.listId);
      if (!original || original.input.kind !== 'create' || !list) fail();
      authors(row.actorId, row.scope, row.authorization, row.createdAt);
      const reconstructed = preparePaperExport({ actorId: row.actorId, authorization: row.authorization, input: original.input, list,
        document: row.intent.document, media: row.intent.media, at: row.createdAt });
      if (!same(reconstructed.command, original) || !same(reconstructed.record, { ...row, slots: row.slots.map(slot => ({ ...slot, published: null })) })) fail();
      usedCommands.add(original.id);
      const selected = list.history[row.intent.listRevision - 1].snapshot.items;
      if (selected.some(item => item.research && !['admin', 'teacher', 'operator'].includes(row.authorization.actorRole) || !item.research && item.source.publicationVersion === null)) fail();
      if (row.scope.kind === 'student_self') {
        const papers = new Map<string, PaperSelectionItem[]>();
        for (const item of selected) { const group = papers.get(item.source.paperId) ?? []; group.push(item); papers.set(item.source.paperId, group); }
        for (const [paperId, group] of papers) {
          const source = group[0].source; if (group.some(item => item.research || item.source.publicationVersion === null)) fail();
          const expected = preparePaperSourceExposure({ actorId: row.actorId, studentId: row.scope.studentId, authorization: row.authorization, at: row.createdAt,
            input: { kind: 'export', requestKey: paperExportExposureKey(original.id, paperId), paperId, detailSha256: source.detailSha256,
              publicationVersion: source.publicationVersion!, positions: group.map(item => ({ position: item.source.position, sourceQuestionId: item.source.sourceQuestionId })),
              answers: row.intent.books.includes('answers'), origin: { kind: 'export_command', id: original.id } }, sources: group.map(item => item.source) });
          if (!exposures.some(exposure => same(exposure, expected))) fail(); expectedExposures.add(expected.id);
        }
      }
      for (const slot of row.slots) {
        const task = taskMap.get(slot.taskId), intent = reconstructed.tasks.find(task => task.id === slot.taskId);
        if (!task || !intent || !same(Object.fromEntries(Object.keys(intent).map(key => [key, task[key as keyof TaskRow]])), intent)) fail();
        if (slot.published) {
          const file = fileMap.get(slot.published.fileId);
          if (!file || file.state !== 'available' || file.exportId !== row.id || file.taskId !== slot.taskId || task.state !== 'succeeded' ||
              file.generation !== task.generation || slot.published.generation !== task.generation || !same(task.result, paperExportPublicationResult(row, slot)) ||
              !same(file.output, { book: slot.book, format: slot.format, sha256: slot.published.sha256, bytes: slot.published.bytes,
                pageCount: slot.published.pageCount, sourceMapHash: digest(slot.published.sourceMap) })) fail();
        } else if (task.state === 'succeeded') fail();
      }
    }
    for (const command of commands) {
      if (usedCommands.has(command.id)) continue;
      const input = command.input, result = command.result;
      if (input.kind === 'create' || result.kind === 'create') fail();
      const row = exportMap.get(input.exportId), task = taskMap.get(result.taskId);
      if (!row || !task || row.actorId !== command.actorId || !same(row.scope, command.scope) || command.at < row.createdAt ||
          result.previousVersion > task.version || result.generation > task.generation) fail();
      authors(command.actorId, command.scope, command.authorization, command.at);
      const matches = history.filter(event => event.taskId === task.id && event.actorId === command.actorId && event.detail.commandId === command.id &&
        event.detail.acceptedAt === command.at && event.detail.previousVersion === input.expectedTaskVersion && event.detail.generation === result.generation && event.at >= command.at &&
        (input.kind === 'retry' ? event.action === 'retried' : ['cancel_requested', 'cancel_confirmed'].includes(event.action)));
      if (matches.length !== 1) fail(); usedCommands.add(command.id);
    }
    if (usedCommands.size !== commands.length || expectedExposures.size !== exposures.length) fail();
    for (const task of tasks.filter(task => task.kind === PAPER_EXPORT_TASK_KIND)) {
      const payload = z.object({ exportId: id, intentFingerprint: hash, book: z.enum(['practice', 'answers']), format: z.enum(['pdf', 'docx']) }).strict().parse(task.payload);
      if (task.id !== paperExportTaskId(payload.exportId, payload.book, payload.format) || task.requestKey !== paperExportTaskKey(payload.exportId, payload.book, payload.format) || task.maxAttempts !== 3) fail();
      const events = history.filter(event => event.taskId === task.id), requested = events.filter(event => event.action === 'requested');
      if (requested.length !== 1 || requested[0].actorId !== task.ownerUserId || !same(requested[0].detail, { kind: task.kind }) || requested[0].at < task.createdAt) fail();
      const restored = events.filter(event => event.action === 'restored');
      if (restored.some(event => event.actorId !== 'local-restore' || !['running', 'cancel_requested'].includes(String(event.detail.previousState)) ||
          !['cancelled', 'failed', 'retry_wait'].includes(String(event.detail.state)) || typeof event.detail.backupId !== 'string' || !event.detail.backupId ||
          !(state.events ?? []).some(saved => saved.eventName === 'operations.restored' && saved.eventVersion === 1 && saved.occurredAt === event.at &&
            saved.payload?.backupId === event.detail.backupId && Number.isSafeInteger(saved.payload?.fencedTasks) && saved.payload.fencedTasks > 0))) fail();
      if (task.generation !== 1 + events.filter(event => event.action === 'retried').length + restored.length) fail();
      if (Object.keys(task.progress).length && !same(task.progress, { stage: 'completed' })) {
        const progress = paperExportProgressSchema.parse(task.progress), file = fileMap.get(progress.fileId);
        if (!file || file.taskId !== task.id || !same(progress, paperExportFileProgress(file, progress.stage))) fail();
      }
      const row = exportMap.get(payload.exportId);
      if (!row) {
        const erased = proofMap.get(payload.exportId);
        if (!erased || erased.proof.intentFingerprint !== payload.intentFingerprint || erased.proof.actorFingerprint !== digest({ id: task.ownerUserId }) ||
            !erased.proof.tasks.some(saved => saved.id === task.id && saved.payloadHash === task.payloadHash) || erased.receipt.completedAt < task.createdAt ||
            !['failed', 'cancelled', 'succeeded', 'cancel_requested'].includes(task.state)) fail();
      }
      for (const event of events) if (['retried', 'cancel_requested', 'cancel_confirmed'].includes(event.action) && row &&
          (!event.detail.commandId || !usedCommands.has(String(event.detail.commandId)))) fail();
      for (const event of events.filter(event => event.action === 'checkpoint')) {
        const progress = paperExportProgressSchema.parse(event.detail.progress), file = fileMap.get(progress.fileId);
        if (!file || file.taskId !== task.id || event.actorId !== 'worker' || event.detail.generation !== file.generation || file.generation > task.generation ||
            !same(progress, paperExportFileProgress(file, progress.stage)) || event.at < file.createdAt) fail();
      }
    }
    for (const file of files) {
      const task = taskMap.get(file.taskId), row = exportMap.get(file.exportId), erased = proofMap.get(file.exportId);
      if (!task || task.kind !== PAPER_EXPORT_TASK_KIND || task.payload.exportId !== file.exportId || task.payload.intentFingerprint !== file.intentFingerprint ||
          file.actorFingerprint !== digest({ id: task.ownerUserId }) || file.createdAt < task.createdAt || file.generation > task.generation) fail();
      if (row) {
        if (file.intentFingerprint !== row.intent.fingerprint || file.studentFingerprint !== (row.scope.studentId === null ? null : digest({ id: row.scope.studentId })) || file.deletionReceiptId) fail();
      } else if (!erased || file.deletionReceiptId !== erased.receipt.id || file.intentFingerprint !== erased.proof.intentFingerprint ||
          file.actorFingerprint !== erased.proof.actorFingerprint || file.studentFingerprint !== erased.proof.studentFingerprint || file.createdAt > erased.receipt.completedAt ||
          !erased.proof.files.some(saved => saved.id === file.id && saved.identityFingerprint === paperExportFileIdentityFingerprint(file))) fail();
      const checkpoints = history.filter(event => event.taskId === task.id && event.action === 'checkpoint' && (event.detail.progress as any)?.fileId === file.id);
      if (!checkpoints.some(event => (event.detail.progress as any).stage === 'reserved') || file.output && !checkpoints.some(event => (event.detail.progress as any).stage === 'rendered')) fail();
      if (file.output && (file.output.book !== task.payload.book || file.output.format !== task.payload.format)) fail();
      if (file.state === 'available' && !row?.slots.some(slot => slot.published?.fileId === file.id)) fail();
      if (file.cleanupTaskId) {
        const cleanup = taskMap.get(file.cleanupTaskId), payload = paperExportCleanupPayload(file);
        if (row?.slots.some(slot => slot.published?.fileId === file.id) || !cleanup || cleanup.id !== paperExportCleanupTaskId(file) || cleanup.kind !== PAPER_EXPORT_CLEANUP_KIND ||
            cleanup.ownerUserId !== 'system-paper-export' || cleanup.requestKey !== 'paper-export-cleanup:' + file.id || !same(cleanup.payload, payload) || cleanup.maxAttempts !== 5 ||
            cleanup.createdAt < file.createdAt || file.deletionReceiptId && cleanup.createdAt < erased!.receipt.completedAt ||
            (file.state === 'deleted') !== (cleanup.state === 'succeeded') || cleanup.state === 'succeeded' && !same(cleanup.result, { ...payload, filesFinished: true })) fail();
      }
    }
    for (const task of tasks) {
      const successes = history.filter(event => event.taskId === task.id && event.action === 'succeeded');
      if (task.state === 'succeeded' ? successes.length !== 1 || successes[0].actorId !== 'worker' || !same(successes[0].detail, task.result) : successes.length !== 0) fail();
      if (task.kind === PAPER_EXPORT_CLEANUP_KIND && !files.some(file => file.cleanupTaskId === task.id)) fail();
    }
  } catch (error) { throw Error('paper_export_native_integrity_failed', { cause: error }); }
}
