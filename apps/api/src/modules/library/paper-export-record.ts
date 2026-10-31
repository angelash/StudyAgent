import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  paperExportBookSchema, paperExportFormatSchema, paperExportCommandSchema, paperExportDocumentSchema, paperExportMediaSchema,
  paperExportResultSchema, paperExportSourceMapSchema, paperSelectionHashSchema as hash, paperSelectionIdSchema as id,
  paperSelectionRequestKeySchema, paperSelectionScopeSchema, paperSelectionTimeSchema as time,
  type PaperExportCommand, type PaperExportDocument, type PaperExportSourceMap, type PaperSelectionSource,
} from '@study-agent/contracts';
import type { TaskIntent, TaskOperation, TaskRow } from '../../infrastructure/task-repository';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { assertPaperSelectionAuthorization, assertPaperSelectionList, paperSelectionAuthorizationSchema,
  type PaperSelectionAuthorization, type PaperSelectionListRecord } from './paper-selection-record';

export const PAPER_EXPORT_TASK_KIND = 'library.paper-export.render';
export const PAPER_EXPORT_CLEANUP_KIND = 'library.paper-export.cleanup';
const same = (left: unknown, right: unknown) => digest(left) === digest(right);
function fail(): never { throw Error('paper_export_original_record_changed'); }
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ?
  Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, stable(item)])) : value;
/** The precise renderer input bytes: sorted JSON keys, UTF-8, no BOM/newline. */
export const paperExportDocumentBytes = (document: PaperExportDocument) => Buffer.from(JSON.stringify(stable(document)), 'utf8');
export const paperExportDocumentSha256 = (document: PaperExportDocument) => createHash('sha256').update(paperExportDocumentBytes(document)).digest('hex');
export const paperExportSource = (source: PaperSelectionSource): PaperExportDocument['items'][number]['source'] => ({
  paperId: source.paperId, position: source.position, sourceQuestionId: source.sourceQuestionId, detailSha256: source.detailSha256,
  publicationVersion: source.publicationVersion === null ? 'research-v1' : `published-v${source.publicationVersion}`,
  paperTitle: source.title, pageNumber: source.originalPage,
});
export const paperExportCommandId = (actorId: string, requestKey: string) => 'paper_export_command_' + digest({ actorId, requestKey });
export const paperExportId = (actorId: string, requestKey: string) => 'paper_export_' + digest({ actorId, requestKey });
export const paperExportTaskId = (exportId: string, book: string, format: string) => 'paper_export_task_' + digest({ exportId, book, format });
export const paperExportTaskKey = (exportId: string, book: string, format: string) => 'paper-export:' + digest({ exportId, book, format });
export const paperExportExposureKey = (commandId: string, paperId: string) => 'export:' + digest({ commandId, paperId });
export const paperExportMediaId = (media: { paperId: string; sourceUrl: string; sha256: string }) => 'paper_export_media_' + digest(media);

export const paperExportPublicationSchema = z.object({ fileId: id, generation: z.number().int().positive(), sha256: hash,
  bytes: z.number().int().min(1).max(80 * 1024 * 1024), pageCount: z.number().int().min(1).max(120), sourceMap: paperExportSourceMapSchema,
  publishedAt: time, fingerprint: hash }).strict();
export type PaperExportPublication = z.infer<typeof paperExportPublicationSchema>;
export const paperExportIntentSchema = z.object({ protocol: z.literal('paper-export-intent-v1'), listId: id,
  listRevision: z.number().int().min(1).max(1000), listFingerprint: hash, document: paperExportDocumentSchema, documentSha256: hash,
  media: z.array(paperExportMediaSchema).max(500), books: z.array(paperExportBookSchema).min(1).max(2),
  formats: z.array(paperExportFormatSchema).min(1).max(2), commandId: id, createdAt: time, fingerprint: hash }).strict();
export type PaperExportIntent = z.infer<typeof paperExportIntentSchema>;
export const paperExportRecordSchema = z.object({ protocol: z.literal('paper-export-record-v1'), id, actorId: id,
  scope: paperSelectionScopeSchema, authorization: paperSelectionAuthorizationSchema, createdAt: time, intent: paperExportIntentSchema,
  slots: z.array(z.object({ book: paperExportBookSchema, format: paperExportFormatSchema, taskId: id,
    published: paperExportPublicationSchema.nullable() }).strict()).min(1).max(4) }).strict();
export type PaperExportRecord = z.infer<typeof paperExportRecordSchema>;
export const paperExportCommandRecordSchema = z.object({ protocol: z.literal('paper-export-command-record-v1'), id, actorId: id,
  scope: paperSelectionScopeSchema, authorization: paperSelectionAuthorizationSchema, requestKey: paperSelectionRequestKeySchema,
  requestHash: hash, input: paperExportCommandSchema, at: time, result: paperExportResultSchema, resultHash: hash }).strict();
export type PaperExportCommandRecord = z.infer<typeof paperExportCommandRecordSchema>;
export const paperExportTaskPayload = (row: PaperExportRecord, slot: PaperExportRecord['slots'][number]) => ({
  exportId: row.id, intentFingerprint: row.intent.fingerprint, book: slot.book, format: slot.format,
});
export function assertPaperExportSourceMap(document: PaperExportDocument, map: PaperExportSourceMap, pageCount: number) {
  if (!same(paperExportSourceMapSchema.parse(map), map) || map.length !== document.items.length || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 120) fail();
  for (const [index, entry] of map.entries()) {
    const item = document.items[index], suffix = String(index + 1).padStart(4, '0');
    if (entry.itemId !== item.id || entry.number !== index + 1 || !same(entry.source, item.source) || entry.startPage > entry.endPage ||
        entry.endPage > pageCount || index > 0 && map[index - 1].endPage > entry.startPage || entry.bookmark !== 'PaperItem' + suffix ||
        entry.pdfDestinationName !== entry.bookmark || entry.endBookmark !== 'PaperEnd' + suffix) fail();
  }
}
export function assertPaperExportDocument(document: PaperExportDocument) {
  if (!same(paperExportDocumentSchema.parse(document), document) || paperExportDocumentBytes(document).length > 12 * 1024 * 1024) fail();
  const seenIds = new Set<string>(), seenSources = new Set<string>(), papers = new Map<string, string>();
  let textBytes = Buffer.byteLength(document.title);
  for (const item of document.items) {
    const key = JSON.stringify([item.source.paperId, item.source.position, item.source.sourceQuestionId]);
    const paper = digest({ sha256: item.source.detailSha256, version: item.source.publicationVersion, title: item.source.paperTitle });
    if (seenIds.has(item.id) || seenSources.has(key) || papers.has(item.source.paperId) && papers.get(item.source.paperId) !== paper) fail();
    seenIds.add(item.id); seenSources.add(key); papers.set(item.source.paperId, paper);
    // Python's source serialization includes a space after each separator.
    textBytes += Buffer.byteLength('{' + Object.entries(item.source).map(([key, value]) => JSON.stringify(key) + ': ' + JSON.stringify(value)).join(', ') + '}');
    for (const value of [item.promptHtml, ...item.optionHtml.flatMap(option => [option.label, option.html]), item.reference?.answerHtml ?? '', item.reference?.analysisHtml ?? '']) textBytes += Buffer.byteLength(value);
  }
  if (papers.size > 10 || textBytes > 8 * 1024 * 1024 || new Set(document.media.map(media => media.path)).size !== document.media.length ||
      document.media.some(media => media.path !== `media/${media.sha256}.png`) || document.media.reduce((sum, media) => sum + media.bytes, 0) > 80 * 1024 * 1024 ||
      document.media.reduce((sum, media) => sum + media.width * media.height, 0) > 120_000_000) fail();
}
export function assertPaperExportRecord(value: unknown): PaperExportRecord {
  const row = paperExportRecordSchema.parse(value), { fingerprint, ...intent } = row.intent;
  assertPaperSelectionAuthorization(row.scope, row.authorization); assertPaperExportDocument(row.intent.document);
  if (!same(row, value) || row.createdAt !== intent.createdAt || fingerprint !== digest(intent) || row.intent.documentSha256 !== paperExportDocumentSha256(intent.document) ||
      new Set(intent.books).size !== intent.books.length || new Set(intent.formats).size !== intent.formats.length || new Set(intent.media.map(media => media.id)).size !== intent.media.length) fail();
  const expected = intent.books.flatMap(book => intent.formats.map(format => ({ book, format, taskId: paperExportTaskId(row.id, book, format) })));
  if (!same(expected, row.slots.map(({ published: _published, ...slot }) => slot))) fail();
  const paths = new Map<string, PaperExportDocument['media'][number]>();
  for (const media of intent.media) {
    if (media.id !== paperExportMediaId({ paperId: media.paperId, sourceUrl: media.sourceUrl, sha256: media.sha256 }) ||
        !intent.document.items.some(item => item.source.paperId === media.paperId)) fail();
    const descriptor = { path: `media/${media.sha256}.png`, sha256: media.sha256, bytes: media.bytes, width: media.width, height: media.height };
    if (paths.has(descriptor.path) && !same(paths.get(descriptor.path), descriptor)) fail(); paths.set(descriptor.path, descriptor);
  }
  if (!same([...paths.values()].sort((a, b) => a.path.localeCompare(b.path)), intent.document.media)) fail();
  for (const slot of row.slots) if (slot.published) {
    const { fingerprint, ...publication } = slot.published;
    if (fingerprint !== digest(publication) || publication.publishedAt < row.createdAt) fail();
    assertPaperExportSourceMap(intent.document, publication.sourceMap, publication.pageCount);
  }
  return row;
}
export function assertPaperExportCommand(value: unknown): PaperExportCommandRecord {
  const row = paperExportCommandRecordSchema.parse(value), input = row.input, result = row.result;
  assertPaperSelectionAuthorization(row.scope, row.authorization);
  if (!same(row, value) || row.id !== paperExportCommandId(row.actorId, row.requestKey) || row.requestKey !== input.requestKey ||
      row.requestHash !== digest({ actorId: row.actorId, scope: row.scope, input }) || row.resultHash !== digest(result) || row.at !== result.at || result.kind !== input.kind) fail();
  if (input.kind === 'create') {
    if (result.kind !== 'create' || result.exportId !== paperExportId(row.actorId, row.requestKey) || !same(result.slots,
      input.books.flatMap(book => input.formats.map(format => ({ book, format, taskId: paperExportTaskId(result.exportId, book, format), generation: 1 }))))) fail();
  } else if (result.kind === 'create' || result.exportId !== input.exportId || result.book !== input.book || result.format !== input.format ||
      result.taskId !== paperExportTaskId(input.exportId, input.book, input.format) || result.previousVersion !== input.expectedTaskVersion ||
      result.generation !== input.expectedGeneration + (input.kind === 'retry' ? 1 : 0)) fail();
  return row;
}
function commandRecord(actorId: string, authorization: PaperSelectionAuthorization, scope: PaperExportRecord['scope'], input: PaperExportCommand,
  at: string, result: PaperExportCommandRecord['result']): PaperExportCommandRecord {
  return assertPaperExportCommand({ protocol: 'paper-export-command-record-v1', id: paperExportCommandId(actorId, input.requestKey), actorId, scope,
    authorization, requestKey: input.requestKey, requestHash: digest({ actorId, scope, input }), input, at, result, resultHash: digest(result) });
}
/** Resolved document/media are server inputs. This pure step neither resolves
 * current source permissions nor replaces their transactional recheck. */
export function preparePaperExport(input: { actorId: string; authorization: PaperSelectionAuthorization;
  input: Extract<PaperExportCommand, { kind: 'create' }>; list: PaperSelectionListRecord; document: PaperExportDocument;
  media: PaperExportIntent['media']; at: string }): { record: PaperExportRecord; command: PaperExportCommandRecord; tasks: TaskIntent[] } {
  id.parse(input.actorId); time.parse(input.at); const commandInput = paperExportCommandSchema.parse(input.input);
  if (commandInput.kind !== 'create' || !same(commandInput, input.input)) fail();
  const list = assertPaperSelectionList(input.list), saved = list.history[commandInput.listRevision - 1];
  if (list.actorId !== input.actorId || list.id !== commandInput.listId || !saved || saved.fingerprint !== commandInput.listFingerprint || input.at < saved.at ||
      !saved.snapshot.items.length || commandInput.title !== input.document.title || !same(commandInput.layout, input.document.layout) ||
      !same(saved.snapshot.items.map(item => ({ id: item.id, source: paperExportSource(item.source) })), input.document.items.map(({ id, source }) => ({ id, source })))) fail();
  if (saved.snapshot.items.some(item => item.research && !['admin', 'teacher', 'operator'].includes(input.authorization.actorRole) ||
      !item.research && item.source.publicationVersion === null)) fail();
  const exportId = paperExportId(input.actorId, commandInput.requestKey), commandId = paperExportCommandId(input.actorId, commandInput.requestKey);
  const intent = { protocol: 'paper-export-intent-v1' as const, listId: list.id, listRevision: saved.revision, listFingerprint: saved.fingerprint,
    document: structuredClone(input.document), documentSha256: paperExportDocumentSha256(input.document), media: structuredClone(input.media),
    books: commandInput.books, formats: commandInput.formats, commandId, createdAt: input.at };
  const record = assertPaperExportRecord({ protocol: 'paper-export-record-v1', id: exportId, actorId: input.actorId, scope: list.scope,
    authorization: input.authorization, createdAt: input.at, intent: { ...intent, fingerprint: digest(intent) },
    slots: commandInput.books.flatMap(book => commandInput.formats.map(format => ({ book, format, taskId: paperExportTaskId(exportId, book, format), published: null }))) });
  const result = { kind: 'create' as const, exportId, intentFingerprint: record.intent.fingerprint,
    slots: record.slots.map(({ published: _published, ...slot }) => ({ ...slot, generation: 1 as const })), at: input.at };
  const command = commandRecord(input.actorId, input.authorization, list.scope, commandInput, input.at, result);
  const tasks = record.slots.map(slot => ({ id: slot.taskId, kind: PAPER_EXPORT_TASK_KIND, ownerUserId: input.actorId,
    requestKey: paperExportTaskKey(exportId, slot.book, slot.format), payload: paperExportTaskPayload(record, slot),
    payloadHash: digest(paperExportTaskPayload(record, slot)), createdAt: input.at, maxAttempts: 3 }));
  return structuredClone({ record, command, tasks });
}
export function preparePaperExportControl(input: { actorId: string; authorization: PaperSelectionAuthorization;
  input: Exclude<PaperExportCommand, { kind: 'create' }>; record: PaperExportRecord; task: TaskRow; at: string }) {
  const record = assertPaperExportRecord(input.record), task = input.task, commandInput = paperExportCommandSchema.parse(input.input);
  if (commandInput.kind === 'create' || !same(commandInput, input.input)) fail();
  const slot = record.slots.find(slot => slot.book === commandInput.book && slot.format === commandInput.format);
  if (record.actorId !== input.actorId || record.id !== commandInput.exportId || !slot || task.id !== slot.taskId || task.kind !== PAPER_EXPORT_TASK_KIND ||
      task.ownerUserId !== input.actorId || !same(task.payload, paperExportTaskPayload(record, slot)) || task.payloadHash !== digest(task.payload) ||
      task.version !== commandInput.expectedTaskVersion || task.generation !== commandInput.expectedGeneration || slot.published || task.state === 'succeeded' ||
      input.at < record.createdAt || input.at < task.updatedAt || commandInput.kind === 'retry' && !['cancelled', 'failed'].includes(task.state)) fail();
  const result = { kind: commandInput.kind, exportId: record.id, book: slot.book, format: slot.format, taskId: slot.taskId,
    previousVersion: task.version, generation: task.generation + (commandInput.kind === 'retry' ? 1 : 0), at: input.at };
  const command = commandRecord(input.actorId, input.authorization, record.scope, commandInput, input.at, result);
  const operation: TaskOperation = { id: task.id, actorId: input.actorId, action: commandInput.kind, expectedVersion: task.version,
    paperExportControl: { commandId: command.id, at: input.at, expectedGeneration: task.generation } };
  return { command, operation };
}
