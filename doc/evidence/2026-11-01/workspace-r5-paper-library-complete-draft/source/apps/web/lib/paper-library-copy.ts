import { paperLibraryCompleteCopySchema, paperLibraryCopyOwnerSchema, paperLibraryDraftSlotSchema, paperLibraryJournalSchema,
  paperSelectionCommandSchema, paperSelectionResultSchema, paperExportCommandSchema, paperExportResultSchema,
  type PaperLibraryCompleteCopy, type PaperLibraryCopyOwner, type PaperLibraryDraftBody, type PaperLibraryJournal,
  type PaperSelectionCommand, type PaperExportCommand } from '@study-agent/contracts';
import { paperCaptureValueHash as valueHash } from './paper-capture-copy';

export const paperLibraryCopyByteLimit = 2 * 1024 * 1024;
export const paperLibraryValueHash = valueHash;
const issue = () => new Error('完整稿的归属、原命令或回执对应关系无法核对，未覆盖当前草稿。');
export function emptyPaperLibraryDraft(owner: PaperLibraryCopyOwner, slot: string): PaperLibraryDraftBody {
  return { protocol: 'paper-library-complete-copy-v1', owner: paperLibraryCopyOwnerSchema.parse(owner), slot: paperLibraryDraftSlotSchema.parse(slot),
    title: '我的选题清单', items: [], baseline: null, exportSettings: { title: '我的练习题单', answerLines: '3', breakBetweenQuestions: false, books: ['practice'], formats: ['pdf'] },
    editor: { pane: 'selection', listPage: 1, exportPage: 1, exportId: null }, journal: [], requiresOriginalResultLookup: true };
}
function stopped(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('完整稿操作已停止，当前输入仍保留。', 'AbortError'); }
export async function paperLibraryRequestFingerprint(ownerValue: PaperLibraryCopyOwner, family: PaperLibraryJournal['family'], input: unknown) {
  const owner = paperLibraryCopyOwnerSchema.parse(ownerValue), actual = (family === 'selection' ? paperSelectionCommandSchema : paperExportCommandSchema).parse(input);
  if (family === 'selection' && actual.kind === 'create' && 'scope' in actual && await valueHash(actual.scope) !== await valueHash(owner.scope)) throw issue();
  return valueHash({ owner, family, input: actual });
}
export async function paperLibraryJournalEntry(owner: PaperLibraryCopyOwner, family: 'selection', input: PaperSelectionCommand): Promise<PaperLibraryJournal>;
export async function paperLibraryJournalEntry(owner: PaperLibraryCopyOwner, family: 'export', input: PaperExportCommand): Promise<PaperLibraryJournal>;
export async function paperLibraryJournalEntry(owner: PaperLibraryCopyOwner, family: PaperLibraryJournal['family'], input: PaperSelectionCommand | PaperExportCommand): Promise<PaperLibraryJournal> {
  return paperLibraryJournalSchema.parse({ family, input: structuredClone(input), requestFingerprint: await paperLibraryRequestFingerprint(owner, family, input), phase: 'prepared', result: null, message: '' });
}
/** Structural result checks do not authenticate a receipt. Import always
 * requires a real original-command lookup before dependent actions. */
export async function assertPaperLibraryJournal(owner: PaperLibraryCopyOwner, value: unknown) {
  const entry = paperLibraryJournalSchema.parse(value);
  if (await valueHash(entry) !== await valueHash(value) || entry.requestFingerprint !== await paperLibraryRequestFingerprint(owner, entry.family, entry.input)) throw issue();
  if (!entry.result) return entry;
  if (entry.family === 'selection') {
    const input = entry.input, result = paperSelectionResultSchema.parse(entry.result);
    if (input.kind === 'create' ? result.listId !== 'paper_selection_' + await valueHash({ actorId: owner.actorId, requestKey: input.requestKey }) || result.revision !== 1 : result.listId !== input.listId || result.revision !== input.expectedRevision + 1) throw issue();
  } else {
    const input = entry.input, result = paperExportResultSchema.parse(entry.result);
    if (input.kind !== result.kind) throw issue();
    if (input.kind === 'create' && result.kind === 'create') {
      if (result.exportId !== 'paper_export_' + await valueHash({ actorId: owner.actorId, requestKey: input.requestKey })) throw issue();
      const expected = [];
      for (const book of input.books) for (const format of input.formats) expected.push({ book, format, taskId: 'paper_export_task_' + await valueHash({ exportId: result.exportId, book, format }), generation: 1 });
      if (await valueHash(expected) !== await valueHash(result.slots)) throw issue();
    } else if (input.kind !== 'create' && result.kind !== 'create' && (result.exportId !== input.exportId || result.book !== input.book || result.format !== input.format ||
        result.previousVersion !== input.expectedTaskVersion || result.generation !== input.expectedGeneration + (input.kind === 'retry' ? 1 : 0) ||
        result.taskId !== 'paper_export_task_' + await valueHash({ exportId: input.exportId, book: input.book, format: input.format }))) throw issue();
  }
  return entry;
}
export async function completePaperLibraryCopy(body: PaperLibraryDraftBody, signal?: AbortSignal): Promise<PaperLibraryCompleteCopy> {
  stopped(signal); const copy = paperLibraryCompleteCopySchema.parse({ ...body, fingerprint: '0'.repeat(64) });
  if (await valueHash(copy) !== await valueHash({ ...body, fingerprint: '0'.repeat(64) })) throw issue();
  for (const entry of copy.journal) { stopped(signal); await assertPaperLibraryJournal(copy.owner, entry); }
  const { fingerprint: _fingerprint, ...actual } = copy; const final = { ...actual, fingerprint: await valueHash(actual) };
  if (new TextEncoder().encode(JSON.stringify(final)).length > paperLibraryCopyByteLimit) throw new Error('完整稿已达到2MiB，请先下载当前完整副本并另建清单；没有截断原请求。');
  stopped(signal); return final;
}
/** No network or replay. A valid public hash is not server authority. */
export async function readPaperLibraryCopy(value: unknown, ownerValue: PaperLibraryCopyOwner, signal?: AbortSignal) {
  stopped(signal); const owner = paperLibraryCopyOwnerSchema.parse(ownerValue), copy = paperLibraryCompleteCopySchema.parse(value), { fingerprint, ...body } = copy;
  if (await valueHash(owner) !== await valueHash(copy.owner) || await valueHash(body) !== fingerprint || await valueHash(value) !== await valueHash(copy)) throw issue();
  const rebuilt = await completePaperLibraryCopy(body, signal); if (rebuilt.fingerprint !== fingerprint) throw issue();
  return { copy: rebuilt, verifiedOriginalRequests: [] as string[], requiresOriginalResultLookup: true as const };
}
export async function downloadPaperLibraryCopy(body: PaperLibraryDraftBody) {
  const copy = await completePaperLibraryCopy(body), bytes = JSON.stringify(copy), url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' })), anchor = document.createElement('a');
  try { anchor.href = url; anchor.download = '选题与导出完整稿-' + copy.slot + '.json'; document.body.append(anchor); anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return copy.fingerprint;
}
