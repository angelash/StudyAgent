import { z } from 'zod';
import { textbookTeachingHeaderSchema, textbookTeachingSourceSnapshotSchema, textbookTeachingDraftContentSchema, textbookTeachingSourceReviewSchema,
  textbookTeachingTargetSnapshotSchema, textbookTeachingMaterialSnapshotSchema, textbookTeachingPreflightSchema, textbookTeachingRevisionBaseSchema,
  textbookTeachingSaveSchema, textbookTeachingResultSchema, textbookTeachingMaterialRefSchema, questionAnswerModeSchema,
  type TextbookTeachingEditorDetail, type TextbookTeachingMaterialCatalog, type TextbookTeachingSave } from '@study-agent/contracts';
import { apiRequest } from './api';
import { teachingEditorValueHash as hash, emptyTeachingEditorDraft, completeTeachingEditorCopy, type TeachingEditorOwner } from './teaching-editor-copy';
import type { TeachingEditorTransport } from './teaching-editor-client';

const key = z.string().min(1).max(180), fingerprint = z.string().regex(/^[a-f0-9]{64}$/), positive = z.number().int().min(1);
const availability = z.object({ available: z.boolean(), code: z.enum(['available', 'draft', 'withdrawn', 'author_unavailable', 'restore_confirmation_required', 'source_or_material_changed']), message: z.string().max(2000) }).strict();
const bodySchema = z.object({ sourceFingerprint: fingerprint, sourceReview: textbookTeachingSourceReviewSchema, content: textbookTeachingDraftContentSchema,
  targets: z.array(textbookTeachingTargetSnapshotSchema).min(1).max(8), prerequisites: z.array(textbookTeachingTargetSnapshotSchema).max(20), materials: z.array(textbookTeachingMaterialSnapshotSchema).max(1280) }).strict();
export const teachingEditorDetailSchema = z.object({ header: textbookTeachingHeaderSchema, source: textbookTeachingSourceSnapshotSchema,
  version: z.object({ protocol: z.literal('textbook-teaching-version-record-v1'), id: key, actorId: key, packageId: key, contentVersion: positive.max(1000),
    basedOn: textbookTeachingRevisionBaseSchema, sourceId: key, createdAt: z.string().datetime(), commandId: key, body: bodySchema, report: textbookTeachingPreflightSchema }).strict(),
  savedBy: z.object({ input: textbookTeachingSaveSchema, result: textbookTeachingResultSchema }).strict(), availability,
}).strict();
export const teachingEditorDirectorySchema = z.object({ total: z.number().int().nonnegative(), page: positive.max(10000), pageSize: positive.max(30),
  items: z.array(textbookTeachingHeaderSchema.extend({ availability }).strict()).max(30) }).strict();
export type TeachingEditorDirectory = z.infer<typeof teachingEditorDirectorySchema>;
export const teachingEditorMaterialCatalogSchema = z.object({ atom: textbookTeachingTargetSnapshotSchema, page: positive.max(10000), pageSize: positive.max(50), total: z.number().int().nonnegative(),
  items: z.array(z.object({ reference: textbookTeachingMaterialRefSchema, atomId: key, family: key, familyKey: key, familyIdentityVersion: key,
    dimension: z.enum(['understanding', 'procedure', 'transfer', 'retention']), probeRole: z.enum(['anchor', 'prerequisite', 'contrast', 'transfer', 'retention']), expectedSeconds: positive.max(3600),
    stem: z.string(), answerMode: questionAnswerModeSchema }).strict()).max(50) }).strict();
const route = '/admin/curriculum/teaching-packages';
function stopped(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('教学稿读取已停止，当前完整稿仍保留。', 'AbortError'); }
const same = async (a: unknown, b: unknown) => await hash(a) === await hash(b);
function owns(owner: TeachingEditorOwner, source: { bookId: string; bookVersion: string; lessonId: string }) { return owner.bookId === source.bookId && owner.bookVersion === source.bookVersion && owner.lessonId === source.lessonId; }
const fail = () => Error('服务器教学稿、教材课时或原保存基准不一致，当前完整稿没有被覆盖。');

export async function readTeachingEditorDetail(owner: TeachingEditorOwner, packageId: string, contentVersion?: number, signal?: AbortSignal,
  transport: TeachingEditorTransport = apiRequest): Promise<TextbookTeachingEditorDetail> {
  stopped(signal); const response = await transport(route + '/' + encodeURIComponent(packageId) + (contentVersion === undefined ? '' : '?version=' + contentVersion), { signal, headers: { 'X-Study-Actor': owner.actorId } }); stopped(signal);
  const detail = teachingEditorDetailSchema.parse(response), { header, source, version, savedBy } = detail, input = savedBy.input, result = savedBy.result, body = version.body, report = version.report;
  if (!await same(detail, response) || header.actorId !== owner.actorId || header.id !== packageId || !owns(owner, header) || !owns(owner, source) || !owns(owner, input.source) ||
      version.actorId !== owner.actorId || version.packageId !== packageId || version.contentVersion !== (contentVersion ?? header.contentVersion) || version.contentVersion > header.contentVersion ||
      input.packageId !== packageId || result.packageId !== packageId || result.action !== 'save' || result.revision !== input.expectedRevision + 1 || result.revision > header.revision ||
      result.contentVersion !== version.contentVersion || result.affectedVersion !== version.contentVersion || result.at !== version.createdAt ||
      !await same(version.basedOn, input.basedOn) || result.contentFingerprint !== report.contentFingerprint || body.sourceFingerprint !== source.fingerprint || input.sourceFingerprint !== source.fingerprint || report.sourceFingerprint !== source.fingerprint ||
      !await same(body.content, input.content) || !await same(body.sourceReview, input.sourceReview) || !await same(input.targetRefs, body.targets.map(({ atomId, version, definitionFingerprint }) => ({ atomId, version, definitionFingerprint }))) ||
      !await same(body.targets, report.targets) || !await same(body.prerequisites, report.prerequisites) || !await same(body.materials, report.materials)) throw fail();
  const { fingerprint: sourceFingerprint, ...sourceBody } = source, { fingerprint: reportFingerprint, ...reportBody } = report;
  if (sourceFingerprint !== await hash(sourceBody) || reportFingerprint !== await hash(reportBody) || report.contentFingerprint !== await hash({ protocol: 'textbook-teaching-content-v1', ...body }) ||
      version.id !== 'textbook_teaching_version_' + await hash({ packageId, contentVersion: version.contentVersion }) ||
      version.sourceId !== 'textbook_teaching_source_' + await hash({ packageId, sourceFingerprint }) || version.commandId !== 'textbook_teaching_command_' + await hash({ actorId: owner.actorId, requestKey: input.requestKey })) throw fail();
  stopped(signal); return detail;
}
export async function readTeachingEditorDirectory(owner: TeachingEditorOwner, page = 1, signal?: AbortSignal, transport: TeachingEditorTransport = apiRequest): Promise<TeachingEditorDirectory> {
  stopped(signal); const query = new URLSearchParams({ bookId: owner.bookId, bookVersion: owner.bookVersion, lessonId: owner.lessonId, page: String(page), pageSize: '10' }),
    response = await transport(route + '?' + query, { signal, headers: { 'X-Study-Actor': owner.actorId } }); stopped(signal);
  const directory = teachingEditorDirectorySchema.parse(response);
  if (!await same(directory, response) || directory.page !== page || directory.items.some(row => row.actorId !== owner.actorId || !owns(owner, row))) throw fail();
  stopped(signal); return directory;
}
export async function readTeachingMaterialCatalog(owner: TeachingEditorOwner, atomId: string, page = 1, signal?: AbortSignal, transport: TeachingEditorTransport = apiRequest): Promise<TextbookTeachingMaterialCatalog> {
  stopped(signal); const response = await transport(route + '/materials?' + new URLSearchParams({ atomId, page: String(page), pageSize: '20' }), { signal, headers: { 'X-Study-Actor': owner.actorId } }); stopped(signal);
  const catalog = teachingEditorMaterialCatalogSchema.parse(response);
  if (!await same(catalog, response) || catalog.page !== page || catalog.atom.atomId !== atomId || catalog.items.some(item => item.atomId !== atomId || item.reference.definitionFingerprint !== catalog.atom.definitionFingerprint)) throw fail();
  stopped(signal); return catalog;
}

export async function readTeachingEditorSource(owner: TeachingEditorOwner, range: { start: string; end: string }, signal?: AbortSignal, transport: TeachingEditorTransport = apiRequest) {
  if (!/^\d+$/.test(range.start) || !/^\d+$/.test(range.end)) throw Error('请填写完整的PDF物理页起止范围。');
  const pageStart = Number(range.start), pageEnd = Number(range.end);
  if (!Number.isSafeInteger(pageStart) || pageStart < 1 || pageEnd < pageStart || pageEnd > 10000 || pageEnd - pageStart >= 40) throw Error('请选择连续且不超过40页的完整课时范围。');
  stopped(signal); const response = await transport(route + '/source-preview', { method: 'POST', signal, headers: { 'X-Study-Actor': owner.actorId },
    body: JSON.stringify({ bookId: owner.bookId, bookVersion: owner.bookVersion, lessonId: owner.lessonId, pageStart, pageEnd }) }); stopped(signal);
  const source = textbookTeachingSourceSnapshotSchema.parse(response);
  if (!await same(source, response) || !owns(owner, source) || source.pageStart !== pageStart || source.pageEnd !== pageEnd) throw fail();
  const draft = emptyTeachingEditorDraft(owner, 'source-verification', 'source-verification'); draft.source = source;
  await completeTeachingEditorCopy(draft, signal); stopped(signal); return source;
}

export async function readTeachingEditorPreflight(owner: TeachingEditorOwner, input: TextbookTeachingSave, signal?: AbortSignal, transport: TeachingEditorTransport = apiRequest) {
  stopped(signal); const response = await transport(route + '/preflight', { method: 'POST', signal, headers: { 'X-Study-Actor': owner.actorId }, body: JSON.stringify(input) }); stopped(signal);
  const report = textbookTeachingPreflightSchema.parse(response), { fingerprint, ...body } = report;
  if (!await same(report, response) || fingerprint !== await hash(body) || report.sourceFingerprint !== input.sourceFingerprint ||
      !await same(input.targetRefs, report.targets.map(({ atomId, version, definitionFingerprint }) => ({ atomId, version, definitionFingerprint }))) ||
      report.contentFingerprint !== await hash({ protocol: 'textbook-teaching-content-v1', sourceFingerprint: input.sourceFingerprint, sourceReview: input.sourceReview,
        content: input.content, targets: report.targets, prerequisites: report.prerequisites, materials: report.materials })) throw fail();
  stopped(signal); return report;
}
