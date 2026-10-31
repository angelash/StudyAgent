import { z } from 'zod';
import { paperExportBookSchema, paperExportFormatSchema, paperSelectionHashSchema as hash, paperSelectionIdSchema as id,
  paperSelectionTimeSchema as time, type PaperExportErasureProof, type PaperExportSourceMap } from '@study-agent/contracts';
import type { TaskCheckpointFence, TaskCompletionFence, TaskIntent, TaskRow } from '../../infrastructure/task-repository';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { assertPaperExportRecord, assertPaperExportSourceMap, paperExportTaskPayload, PAPER_EXPORT_CLEANUP_KIND,
  PAPER_EXPORT_TASK_KIND, type PaperExportRecord } from './paper-export-record';

const same = (left: unknown, right: unknown) => digest(left) === digest(right);
function fail(): never { throw Error('paper_export_original_file_changed'); }
export const paperExportFileOutputSchema = z.object({ book: paperExportBookSchema, format: paperExportFormatSchema, sha256: hash,
  bytes: z.number().int().min(1).max(80 * 1024 * 1024), pageCount: z.number().int().min(1).max(120), sourceMapHash: hash }).strict();
export type PaperExportFileOutput = z.infer<typeof paperExportFileOutputSchema>;
export const paperExportFileRecordSchema = z.object({ protocol: z.literal('paper-export-file-record-v1'), id, exportId: id,
  intentFingerprint: hash, actorFingerprint: hash, studentFingerprint: hash.nullable(), taskId: id,
  generation: z.number().int().positive(), token: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  createdAt: time, updatedAt: time, state: z.enum(['reserved', 'available', 'collecting', 'deleted']),
  workspace: z.string().regex(/^paper-exports\/[a-f0-9]{64}$/), output: paperExportFileOutputSchema.nullable(),
  cleanupTaskId: id.nullable(), deletionReceiptId: id.nullable() }).strict();
export type PaperExportFileRecord = z.infer<typeof paperExportFileRecordSchema>;
export const paperExportFileId = (value: { taskId: string; generation: number; token: string }) => 'paper_export_file_' + digest(value);
export const paperExportFileWorkspace = (value: { taskId: string; generation: number; token: string }) => 'paper-exports/' + digest(value);
export function paperExportFileIdentity(row: PaperExportFileRecord) {
  const { state: _state, updatedAt: _updatedAt, output: _output, cleanupTaskId: _cleanup, deletionReceiptId: _receipt, ...identity } = row;
  return identity;
}
export const paperExportFileIdentityFingerprint = (row: PaperExportFileRecord) => digest(paperExportFileIdentity(row));
export function assertPaperExportFile(value: unknown): PaperExportFileRecord {
  const row = paperExportFileRecordSchema.parse(value), identity = { taskId: row.taskId, generation: row.generation, token: row.token };
  if (!same(row, value) || row.id !== paperExportFileId(identity) || row.workspace !== paperExportFileWorkspace(identity) || row.updatedAt < row.createdAt ||
      row.state === 'available' && !row.output || ['collecting', 'deleted'].includes(row.state) !== Boolean(row.cleanupTaskId) ||
      row.deletionReceiptId && !['collecting', 'deleted'].includes(row.state)) fail();
  return row;
}
export const paperExportProgressSchema = z.object({ protocol: z.literal('paper-export-progress-v1'), stage: z.enum(['reserved', 'rendered']),
  fileId: id, identityFingerprint: hash, generation: z.number().int().positive(), token: paperExportFileRecordSchema.shape.token,
  output: paperExportFileOutputSchema.nullable() }).strict().superRefine((value, context) => {
    if ((value.stage === 'reserved') !== (value.output === null)) context.addIssue({ code: 'custom', message: '文件检查点内容不完整' });
  });
export function paperExportFileProgress(file: PaperExportFileRecord, stage: 'reserved' | 'rendered') {
  return paperExportProgressSchema.parse({ protocol: 'paper-export-progress-v1', stage, fileId: file.id,
    identityFingerprint: paperExportFileIdentityFingerprint(file), generation: file.generation, token: file.token,
    output: stage === 'reserved' ? null : file.output });
}
function running(record: PaperExportRecord, task: TaskRow, at: string) {
  assertPaperExportRecord(record); time.parse(at);
  const slot = record.slots.find(slot => slot.taskId === task.id);
  if (!slot || slot.published || task.kind !== PAPER_EXPORT_TASK_KIND || task.state !== 'running' || !task.leaseToken ||
      task.ownerUserId !== record.actorId || !same(task.payload, paperExportTaskPayload(record, slot)) || task.payloadHash !== digest(task.payload) ||
      task.leaseUntil === null || task.leaseUntil <= Date.parse(at) || at < task.updatedAt || task.generation < 1) fail();
  return slot;
}
function belongs(file: PaperExportFileRecord, record: PaperExportRecord, task: TaskRow) {
  if (file.taskId !== task.id || file.generation !== task.generation || file.token !== task.leaseToken || file.exportId !== record.id ||
      file.intentFingerprint !== record.intent.fingerprint || file.actorFingerprint !== digest({ id: record.actorId }) ||
      file.studentFingerprint !== (record.scope.studentId === null ? null : digest({ id: record.scope.studentId }))) fail();
}
export function reservePaperExportFile(record: PaperExportRecord, task: TaskRow, at: string): { file: PaperExportFileRecord; fence: TaskCheckpointFence } {
  running(record, task, at);
  const identity = { taskId: task.id, generation: task.generation, token: task.leaseToken! };
  const file = assertPaperExportFile({ protocol: 'paper-export-file-record-v1', id: paperExportFileId(identity), exportId: record.id,
    intentFingerprint: record.intent.fingerprint, actorFingerprint: digest({ id: record.actorId }),
    studentFingerprint: record.scope.studentId === null ? null : digest({ id: record.scope.studentId }), ...identity, createdAt: at, updatedAt: at,
    state: 'reserved', workspace: paperExportFileWorkspace(identity), output: null, cleanupTaskId: null, deletionReceiptId: null });
  return { file, fence: { id: task.id, token: task.leaseToken!, mode: 'checkpoint', progress: paperExportFileProgress(file, 'reserved') } };
}
export function recordPaperExportRendered(record: PaperExportRecord, file: PaperExportFileRecord, task: TaskRow,
  output: PaperExportFileOutput, sourceMap: PaperExportSourceMap, at: string): { file: PaperExportFileRecord; fence: TaskCheckpointFence } {
  const slot = running(record, task, at); assertPaperExportFile(file); paperExportFileOutputSchema.parse(output);
  belongs(file, record, task);
  assertPaperExportSourceMap(record.intent.document, sourceMap, output.pageCount);
  if (file.state !== 'reserved' || file.output || file.taskId !== task.id || file.generation !== task.generation || file.token !== task.leaseToken ||
      file.exportId !== record.id || file.intentFingerprint !== record.intent.fingerprint || at < file.updatedAt ||
      output.book !== slot.book || output.format !== slot.format || output.sourceMapHash !== digest(sourceMap) || !same(task.progress, paperExportFileProgress(file, 'reserved'))) fail();
  const rendered = assertPaperExportFile({ ...file, output: structuredClone(output), updatedAt: at });
  return { file: rendered, fence: { id: task.id, token: task.leaseToken!, mode: 'checkpoint', progress: paperExportFileProgress(rendered, 'rendered') } };
}
export function paperExportPublicationResult(record: PaperExportRecord, slot: PaperExportRecord['slots'][number]) {
  const publication = slot.published; if (!publication) return fail();
  return { exportId: record.id, intentFingerprint: record.intent.fingerprint, book: slot.book, format: slot.format,
    fileId: publication.fileId, generation: publication.generation, sha256: publication.sha256, bytes: publication.bytes,
    pageCount: publication.pageCount, sourceMapHash: digest(publication.sourceMap), publishedAt: publication.publishedAt };
}
export function publishPaperExportFile(record: PaperExportRecord, file: PaperExportFileRecord, task: TaskRow, sourceMap: PaperExportSourceMap, at: string):
  { record: PaperExportRecord; file: PaperExportFileRecord; fence: TaskCompletionFence } {
  const slot = running(record, task, at); assertPaperExportFile(file);
  belongs(file, record, task);
  if (file.state !== 'reserved' || !file.output || file.taskId !== task.id || file.generation !== task.generation || file.token !== task.leaseToken ||
      file.exportId !== record.id || file.intentFingerprint !== record.intent.fingerprint || file.output.sourceMapHash !== digest(sourceMap) ||
      file.output.book !== slot.book || file.output.format !== slot.format || at < file.updatedAt || !same(task.progress, paperExportFileProgress(file, 'rendered'))) fail();
  const publication = { fileId: file.id, generation: file.generation, sha256: file.output.sha256, bytes: file.output.bytes,
    pageCount: file.output.pageCount, sourceMap: structuredClone(sourceMap), publishedAt: at };
  const next = structuredClone(record); next.slots.find(value => value.taskId === task.id)!.published = { ...publication, fingerprint: digest(publication) };
  assertPaperExportRecord(next);
  return { record: next, file: assertPaperExportFile({ ...file, state: 'available', updatedAt: at }),
    fence: { id: task.id, token: task.leaseToken!, result: paperExportPublicationResult(next, next.slots.find(value => value.taskId === task.id)!) } };
}
export const paperExportCleanupTaskId = (file: PaperExportFileRecord) => 'paper_export_cleanup_' + digest({ fileId: file.id, identityFingerprint: paperExportFileIdentityFingerprint(file) });
export const paperExportCleanupPayload = (file: PaperExportFileRecord) => ({ fileId: file.id, identityFingerprint: paperExportFileIdentityFingerprint(file), deletionReceiptId: file.deletionReceiptId });
/** Caller proves deletion or absence of any live publication before committing. */
export function collectPaperExportFile(file: PaperExportFileRecord, deletionReceiptId: string | null, at: string): { file: PaperExportFileRecord; task: TaskIntent } {
  assertPaperExportFile(file); time.parse(at); if (file.cleanupTaskId || at < file.updatedAt) fail();
  const next = assertPaperExportFile({ ...file, state: 'collecting', deletionReceiptId, cleanupTaskId: paperExportCleanupTaskId(file), updatedAt: at });
  const payload = paperExportCleanupPayload(next);
  return { file: next, task: { id: next.cleanupTaskId!, kind: PAPER_EXPORT_CLEANUP_KIND, ownerUserId: 'system-paper-export', requestKey: 'paper-export-cleanup:' + file.id,
    payload, payloadHash: digest(payload), createdAt: at, maxAttempts: 5 } };
}
export function paperExportErasureProof(record: PaperExportRecord, files: readonly PaperExportFileRecord[]): PaperExportErasureProof {
  assertPaperExportRecord(record);
  for (const file of files) if (assertPaperExportFile(file).exportId !== record.id || file.intentFingerprint !== record.intent.fingerprint ||
      file.actorFingerprint !== digest({ id: record.actorId }) || file.studentFingerprint !== (record.scope.studentId === null ? null : digest({ id: record.scope.studentId })) ||
      !record.slots.some(slot => slot.taskId === file.taskId)) fail();
  if (new Set(files.map(file => file.id)).size !== files.length) fail();
  return { exportId: record.id, intentFingerprint: record.intent.fingerprint, actorFingerprint: digest({ id: record.actorId }),
    studentFingerprint: record.scope.studentId === null ? null : digest({ id: record.scope.studentId }),
    tasks: record.slots.map(slot => ({ id: slot.taskId, payloadHash: digest(paperExportTaskPayload(record, slot)) })),
    files: files.map(file => ({ id: file.id, identityFingerprint: paperExportFileIdentityFingerprint(file) })) };
}
