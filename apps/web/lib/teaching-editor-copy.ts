import { z } from 'zod';
import { textbookTeachingDraftContentSchema, textbookTeachingDraftVisualSchema, textbookTeachingSourceReviewSchema, textbookTeachingSourceSnapshotSchema,
  textbookTeachingCommandSchema, textbookTeachingResultSchema, textbookTeachingTargetRefSchema, textbookTeachingHeaderSchema, textbookTeachingSaveSchema,
  type TextbookTeachingCommand } from '@study-agent/contracts';
import { paperCaptureValueHash as hash } from './paper-capture-copy';

const key = z.string().min(1).max(180), fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const visualRawInputsSchema = z.record(z.string().regex(/^visual:[0-3]:(?:value:(?:[0-9]|1[0-5])|(?:hour|minute):[0-3])$/), z.string().max(100));
export const teachingEditorCopyByteLimit = 8 * 1024 * 1024;
export const teachingEditorArchiveByteLimit = 256 * 1024 * 1024;
export const teachingEditorValueHash = hash;
export const teachingEditorOwnerSchema = z.object({ actorId: key, bookId: key, bookVersion: key, lessonId: key }).strict();
export type TeachingEditorOwner = z.infer<typeof teachingEditorOwnerSchema>;
export const teachingEditorJournalSchema = z.object({ input: textbookTeachingCommandSchema, requestFingerprint: fingerprint,
  phase: z.enum(['prepared', 'unknown', 'received', 'confirmed', 'rejected']), result: textbookTeachingResultSchema.nullable(), message: z.string().max(2000) }).strict();
export const teachingEditorCopySchema = z.object({ protocol: z.literal('textbook-teaching-editor-copy-v1'), owner: teachingEditorOwnerSchema, slot: key,
  packageId: key, range: z.object({ start: z.string().max(30), end: z.string().max(30) }).strict(), source: textbookTeachingSourceSnapshotSchema.nullable(),
  sourceHistory: z.array(textbookTeachingSourceSnapshotSchema).max(4), sourceReview: textbookTeachingSourceReviewSchema,
  targetRefs: z.array(textbookTeachingTargetRefSchema).max(8), content: textbookTeachingDraftContentSchema,
  visualHistory: z.array(z.object({ index: z.number().int().min(0).max(3), visual: textbookTeachingDraftVisualSchema, rawInputs: visualRawInputsSchema.optional() }).strict()).max(20),
  rawInputs: visualRawInputsSchema,
  baseline: z.object({ header: textbookTeachingHeaderSchema, contentVersion: z.number().int().min(1).max(1000), contentFingerprint: fingerprint,
    preflightFingerprint: fingerprint, bodyFingerprint: fingerprint }).strict().nullable(),
  editor: z.object({ section: z.enum(['source', 'goals', 'explanation', 'visuals', 'checks', 'summary', 'versions']), activeSourcePage: z.number().int().min(1).max(10000).nullable(),
    publishReason: z.string().max(2000), withdrawReason: z.string().max(2000), reviewed: z.boolean(), originalTeaching: z.boolean() }).strict(),
  journal: z.array(teachingEditorJournalSchema).max(30), requiresOriginalResultLookup: z.literal(true), fingerprint,
}).strict();
export type TeachingEditorCopy = z.infer<typeof teachingEditorCopySchema>;
export type TeachingEditorDraft = Omit<TeachingEditorCopy, 'fingerprint'>;
export type TeachingEditorJournal = z.infer<typeof teachingEditorJournalSchema>;
const same = async (a: unknown, b: unknown) => await hash(a) === await hash(b);
const fail = () => Error('完整教学稿的账号、教材课时、原命令或回执无法核对；当前稿件没有被覆盖。');
function stopped(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('完整教学稿操作已停止，当前输入仍保留。', 'AbortError'); }
const ownsSource = (owner: TeachingEditorOwner, source: { bookId: string; bookVersion: string; lessonId: string }) =>
  owner.bookId === source.bookId && owner.bookVersion === source.bookVersion && owner.lessonId === source.lessonId;

export function teachingClockInput(raw: string, field: 'hour' | 'minute'): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw); return Number.isSafeInteger(value) && value >= (field === 'hour' ? 1 : 0) && value <= (field === 'hour' ? 12 : 59) ? value : null;
}
/** Keep unfinished characters with their original visual, then relocate only
 * the surviving originals. A new visual never inherits the removed one's input. */
export function replaceTeachingVisual(copy: TeachingEditorDraft, index: number, replacement?: TeachingEditorDraft['content']['visuals'][number]) {
  if (!copy.content.visuals[index] || copy.visualHistory.length >= 20) throw Error('请先下载当前完整稿再调整旧表征。');
  const rawInputs = Object.fromEntries(Object.entries(copy.rawInputs).filter(([field]) => Number(field.split(':')[1]) === index));
  copy.visualHistory.push({ index, visual: structuredClone(copy.content.visuals[index]), ...(Object.keys(rawInputs).length ? { rawInputs } : {}) });
  copy.rawInputs = Object.fromEntries(Object.entries(copy.rawInputs).flatMap(([field, value]) => {
    const parts = field.split(':'), oldIndex = Number(parts[1]); if (oldIndex === index) return [];
    if (!replacement && oldIndex > index) parts[1] = String(oldIndex - 1); return [[parts.join(':'), value]];
  }));
  if (replacement) copy.content.visuals[index] = structuredClone(replacement); else copy.content.visuals.splice(index, 1);
}
export function restoreTeachingVisual(copy: TeachingEditorDraft, historyIndex: number) {
  const saved = copy.visualHistory[historyIndex]; if (!saved || copy.content.visuals.length >= 4) throw Error('当前表征已达到上限。');
  const index = copy.content.visuals.length; copy.content.visuals.push(structuredClone(saved.visual));
  for (const [field, value] of Object.entries(saved.rawInputs ?? {})) {
    const parts = field.split(':'); parts[1] = String(index); copy.rawInputs[parts.join(':')] = value;
  }
}
export function removeTeachingClock(copy: TeachingEditorDraft, visualIndex: number, clockIndex: number) {
  const visual = copy.content.visuals[visualIndex]; if (visual?.kind !== 'math' || visual.figure.kind !== 'clocks' || visual.figure.clocks.length <= 1) return;
  if (copy.visualHistory.length >= 20) throw Error('请先下载当前完整稿再调整旧表征。');
  const originalRaw = Object.fromEntries(Object.entries(copy.rawInputs).filter(([field]) => Number(field.split(':')[1]) === visualIndex));
  copy.visualHistory.push({ index: visualIndex, visual: structuredClone(visual), ...(Object.keys(originalRaw).length ? { rawInputs: originalRaw } : {}) });
  visual.figure.clocks.splice(clockIndex, 1);
  copy.rawInputs = Object.fromEntries(Object.entries(copy.rawInputs).flatMap(([field, value]) => {
    const parts = field.split(':'); if (Number(parts[1]) !== visualIndex || !['hour', 'minute'].includes(parts[2])) return [[field, value]];
    const oldIndex = Number(parts[3]); if (oldIndex === clockIndex) return [];
    if (oldIndex > clockIndex) parts[3] = String(oldIndex - 1); return [[parts.join(':'), value]];
  }));
}
export function removeTeachingDiagramLabel(copy: TeachingEditorDraft, visualIndex: number, labelIndex: number) {
  const visual = copy.content.visuals[visualIndex]; if (visual?.kind !== 'diagram' || visual.diagram.labels.length <= 2) return;
  if (copy.visualHistory.length >= 20) throw Error('请先下载当前完整稿再调整旧表征。');
  const rawInputs = Object.fromEntries(Object.entries(copy.rawInputs).filter(([field]) => Number(field.split(':')[1]) === visualIndex));
  copy.visualHistory.push({ index: visualIndex, visual: structuredClone(visual), ...(Object.keys(rawInputs).length ? { rawInputs } : {}) });
  visual.diagram.labels.splice(labelIndex, 1); visual.diagram.values?.splice(labelIndex, 1);
  copy.rawInputs = Object.fromEntries(Object.entries(copy.rawInputs).flatMap(([field, value]) => {
    const parts = field.split(':'); if (Number(parts[1]) !== visualIndex || parts[2] !== 'value') return [[field, value]];
    const index = Number(parts[3]); if (index === labelIndex) return []; if (index > labelIndex) parts[3] = String(index - 1); return [[parts.join(':'), value]];
  }));
}

export function emptyTeachingEditorDraft(owner: TeachingEditorOwner, slot: string, packageId: string, range?: { start: number; end: number }): TeachingEditorDraft {
  return { protocol: 'textbook-teaching-editor-copy-v1', owner: teachingEditorOwnerSchema.parse(owner), slot, packageId,
    range: { start: range ? String(range.start) : '', end: range ? String(range.end) : '' }, source: null, sourceHistory: [], sourceReview: { confirmedRange: false, statement: '', pages: [] },
    targetRefs: [], content: { title: '', goals: [], prerequisites: [], activation: { prompt: '', expectedObservation: '', bridge: '' }, concept: { explanation: '', points: [] },
      example: { situation: '', steps: [], conclusion: '' }, visuals: [], misconceptions: [], checks: [], transfer: { scenario: '', prompt: '', expectedStrategy: '' }, summary: { synthesis: '', takeaways: [] },
      retention: { intervalDays: [1, 3, 7, 14], anchor: 'last_relevant_teaching_or_help', instructions: '' }, citations: [] }, visualHistory: [], rawInputs: {}, baseline: null,
    editor: { section: 'source', activeSourcePage: null, publishReason: '', withdrawReason: '', reviewed: false, originalTeaching: false }, journal: [], requiresOriginalResultLookup: true };
}
export async function teachingJournalEntry(owner: TeachingEditorOwner, input: TextbookTeachingCommand): Promise<TeachingEditorJournal> {
  const actual = textbookTeachingCommandSchema.parse(input);
  if (!await same(actual, input) || actual.action === 'save' && !ownsSource(owner, actual.source)) throw fail();
  return { input: structuredClone(actual), requestFingerprint: await hash({ owner, input: actual }), phase: 'prepared', result: null, message: '' };
}
export async function assertTeachingEditorJournal(owner: TeachingEditorOwner, value: unknown) {
  const entry = teachingEditorJournalSchema.parse(value), input = entry.input;
  if (!await same(entry, value) || entry.requestFingerprint !== (await teachingJournalEntry(owner, input)).requestFingerprint || (entry.phase === 'received' || entry.phase === 'confirmed') !== Boolean(entry.result)) throw fail();
  if (entry.result) {
    const result = entry.result;
    if (result.packageId !== input.packageId || result.action !== input.action || result.revision !== input.expectedRevision + 1 ||
        input.action !== 'save' && (result.affectedVersion !== input.contentVersion || result.contentFingerprint !== input.contentFingerprint) ||
        input.action === 'save' && (result.affectedVersion !== result.contentVersion || input.expectedRevision === 0 && result.contentVersion !== 1) ||
        input.action === 'publish' && (result.status !== 'published' || result.published?.contentVersion !== input.contentVersion) ||
        input.action === 'withdraw' && (result.status !== 'withdrawn' || result.published !== null)) throw fail();
  }
  return entry;
}
/** A complete private copy is local recovery data. Its hash never authenticates
 * a server receipt or gives permission to publish/adopt anything. */
export async function completeTeachingEditorCopy(value: TeachingEditorDraft, signal?: AbortSignal): Promise<TeachingEditorCopy> {
  stopped(signal); const copy = teachingEditorCopySchema.parse({ ...value, fingerprint: '0'.repeat(64) });
  if (!await same(copy, { ...value, fingerprint: '0'.repeat(64) }) || copy.source && !ownsSource(copy.owner, copy.source) || copy.sourceHistory.some(source => !ownsSource(copy.owner, source)) ||
      copy.baseline && (copy.baseline.header.actorId !== copy.owner.actorId || copy.baseline.header.id !== copy.packageId || !ownsSource(copy.owner, copy.baseline.header)) ||
      new Set(copy.targetRefs.map(ref => ref.atomId)).size !== copy.targetRefs.length || new Set(copy.journal.map(entry => entry.input.requestKey)).size !== copy.journal.length) throw fail();
  for (const source of [copy.source, ...copy.sourceHistory]) {
    if (!source) continue; const { fingerprint, ...body } = source;
    if (fingerprint !== await hash(body)) throw fail();
    for (const page of source.pages) {
      stopped(signal); const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(page.text));
      if (Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') !== page.textSha256) throw fail();
    }
  }
  for (const entry of copy.journal) { stopped(signal); await assertTeachingEditorJournal(copy.owner, entry); if (entry.input.packageId !== copy.packageId) throw fail(); }
  const { fingerprint: _fingerprint, ...body } = copy, final = { ...body, fingerprint: await hash(body) };
  if (new TextEncoder().encode(JSON.stringify(final)).length > teachingEditorArchiveByteLimit) throw Error('完整教学稿超过256MiB读取预算，请保留原文件另行核对，没有截断原输入或原命令。');
  stopped(signal); return final;
}
export async function readTeachingEditorCopy(value: unknown, owner: TeachingEditorOwner, signal?: AbortSignal) {
  stopped(signal); const copy = teachingEditorCopySchema.parse(value), { fingerprint, ...body } = copy;
  if (!await same(copy.owner, owner) || !await same(copy, value) || fingerprint !== await hash(body)) throw fail();
  const verified = await completeTeachingEditorCopy(body, signal); if (verified.fingerprint !== fingerprint) throw fail();
  return { copy: verified, verifiedOriginalRequests: [] as string[], requiresOriginalResultLookup: true as const };
}
export function teachingEditorSaveCommand(copy: TeachingEditorDraft, requestKey: string, proof: { baselineVerified?: boolean; verifiedOriginalRequests?: readonly string[] } = {}): TextbookTeachingCommand {
  if (copy.baseline && !proof.baselineVerified || copy.journal.some(entry => !proof.verifiedOriginalRequests?.includes(entry.input.requestKey)))
    throw Error('请先向服务器核对原稿基准、完整原命令与原回执，再准备新的保存。');
  if (copy.journal.some(entry => entry.phase === 'prepared' || entry.phase === 'unknown' || entry.phase === 'received')) throw Error('原操作结果尚待确认，请先恢复同一个原请求；当前完整稿仍保留。');
  if (!copy.source) throw Error('请先完整核对当前课时来源，原稿继续保留。');
  if (Number(copy.range.start) !== copy.source.pageStart || Number(copy.range.end) !== copy.source.pageEnd) throw Error('页码范围已改变，请先核对这个完整范围的来源再保存；原稿继续保留。');
  for (const [field, value] of Object.entries(copy.rawInputs)) {
    const [, index, kind, item] = field.split(':'), visual = copy.content.visuals[Number(index)];
    const valid = kind === 'value' ? visual?.kind === 'diagram' && visual.diagram.kind === 'bars' && Number(item) < visual.diagram.labels.length && value.trim() && Number.isFinite(Number(value)) && visual.diagram.values?.[Number(item)] === Number(value) :
      (kind === 'hour' || kind === 'minute') && visual?.kind === 'math' && visual.figure.kind === 'clocks' && teachingClockInput(value, kind) !== null && visual.figure.clocks[Number(item)]?.[kind] === teachingClockInput(value, kind);
    if (!valid)
      throw Error('图形数值仍有未完成输入，请修正后保存；原数值文字已保留在完整本机稿中。');
  }
  const { bookId, bookVersion, lessonId, sourceBookId, sourceSha256, extractedSha256, lessonFingerprint, editionProofFingerprint, pageStart, pageEnd } = copy.source;
  return textbookTeachingSaveSchema.parse({ action: 'save', packageId: copy.packageId, requestKey, expectedRevision: copy.baseline?.header.revision ?? 0,
    basedOn: copy.baseline ? { contentVersion: copy.baseline.contentVersion, contentFingerprint: copy.baseline.contentFingerprint } : null,
    source: { bookId, bookVersion, lessonId, sourceBookId, sourceSha256, extractedSha256, lessonFingerprint, ...(editionProofFingerprint ? { editionProofFingerprint } : {}), pageStart, pageEnd }, sourceFingerprint: copy.source.fingerprint,
    targetRefs: structuredClone(copy.targetRefs), sourceReview: structuredClone(copy.sourceReview), content: structuredClone(copy.content) });
}
/** The server saves numeric values and an exact source range. Raw characters
 * remain in the complete local copy and must pass SaveCommand before publish. */
export const teachingEditorBodyFingerprint = (copy: TeachingEditorDraft) => hash({ sourceFingerprint: copy.source?.fingerprint ?? null,
  range: { start: Number(copy.range.start), end: Number(copy.range.end) }, sourceReview: copy.sourceReview, targetRefs: copy.targetRefs, content: copy.content });
export async function downloadTeachingEditorCopy(body: TeachingEditorDraft) {
  const copy = await completeTeachingEditorCopy(body), url = URL.createObjectURL(new Blob([JSON.stringify(copy)], { type: 'application/json' })), anchor = document.createElement('a');
  try { anchor.href = url; anchor.download = '教材课时完整教学稿-' + copy.slot + '.json'; document.body.append(anchor); anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return copy.fingerprint;
}
