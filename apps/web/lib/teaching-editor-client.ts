import { textbookTeachingCommandSchema, textbookTeachingHeaderSchema, textbookTeachingResultSchema, type TextbookTeachingPackageHeader } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from './api';
import { assertTeachingEditorJournal, teachingJournalEntry, teachingEditorValueHash as hash, type TeachingEditorOwner, type TeachingEditorJournal } from './teaching-editor-copy';

export type TeachingEditorTransport = (path: string, options: RequestInit) => Promise<unknown>;
export type TeachingEditorLookup = { verified: true; entry: TeachingEditorJournal; current: TextbookTeachingPackageHeader } | { verified: false; entry: TeachingEditorJournal; current: null };
const route = '/admin/curriculum/teaching-packages/commands';
function stopped(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('原教学操作核对已停止，完整原命令仍保留。', 'AbortError'); }
const message = (error: unknown) => (error instanceof Error ? error.message : '原教学操作结果暂时不能核对，请保留完整原请求。').slice(0, 2000);
const uncertain = (entry: TeachingEditorJournal, reason: string): TeachingEditorJournal => ({ ...structuredClone(entry), phase: entry.result ? 'received' : 'unknown', message: reason.slice(0, 2000) });
async function receipt(owner: TeachingEditorOwner, entry: TeachingEditorJournal, value: unknown, confirmed: boolean) {
  const result = textbookTeachingResultSchema.parse(value);
  if (entry.result && await hash(entry.result) !== await hash(result)) throw Error('服务器原回执与本机保留的回执不同，请保留两份原信息并核对，未自动覆盖。');
  return assertTeachingEditorJournal(owner, { ...entry, phase: confirmed ? 'confirmed' : 'received', result, message: '' });
}
/** A null lookup cannot prove that an earlier POST will never commit. */
export async function lookupTeachingEditorCommand(owner: TeachingEditorOwner, value: TeachingEditorJournal, signal?: AbortSignal, transport: TeachingEditorTransport = apiRequest): Promise<TeachingEditorLookup> {
  stopped(signal); const entry = await assertTeachingEditorJournal(owner, structuredClone(value)); stopped(signal);
  const response = await transport(route + '/' + encodeURIComponent(entry.input.requestKey), { signal, headers: { 'X-Study-Actor': owner.actorId } }); stopped(signal);
  if (response === null) return { verified: false, entry: uncertain(entry, '暂未查到原回执，原请求仍可能稍后完成。请保留完整稿，继续核对或用同一份原命令恢复。'), current: null };
  if (!response || typeof response !== 'object' || Object.keys(response).sort().join(',') !== 'current,input,result') throw Error('服务器原教学命令不完整，请保留当前完整稿。');
  const original = response as { input: unknown; result: unknown; current: unknown }, input = textbookTeachingCommandSchema.parse(original.input),
    current = textbookTeachingHeaderSchema.parse(original.current);
  if (await hash(input) !== await hash(original.input) || (await teachingJournalEntry(owner, input)).requestFingerprint !== entry.requestFingerprint)
    throw Error('这个请求键对应另一份完整教学命令，未覆盖当前稿件或重发。');
  if (current.id !== input.packageId || current.actorId !== owner.actorId || current.bookId !== owner.bookId || current.bookVersion !== owner.bookVersion || current.lessonId !== owner.lessonId)
    throw Error('原回执的当前包头不属于本账号与教材课时，请保留完整稿后核对。');
  const accepted = await receipt(owner, entry, original.result, true); stopped(signal);
  if (current.revision < accepted.result!.revision) throw Error('当前包头早于原回执，请保留原稿并重新核对。');
  return { verified: true, entry: accepted, current: structuredClone(current) };
}
/** Every complete state is retained before I/O. Only an original-command lookup
 * confirms a receipt; this client never changes the original key or input. */
export async function sendTeachingEditorCommand(owner: TeachingEditorOwner, value: TeachingEditorJournal, retain: (entry: TeachingEditorJournal) => Promise<void>,
  signal?: AbortSignal, transport: TeachingEditorTransport = apiRequest): Promise<TeachingEditorLookup> {
  stopped(signal); let entry = uncertain(await assertTeachingEditorJournal(owner, structuredClone(value)), '正在提交原教学操作；离开或中断后请先核对原结果。');
  await retain(structuredClone(entry)); stopped(signal);
  try {
    const result = await transport(route, { method: 'POST', body: JSON.stringify(entry.input), signal, headers: { 'X-Study-Actor': owner.actorId } }); stopped(signal);
    entry = await receipt(owner, entry, result, false); stopped(signal); await retain(structuredClone(entry)); stopped(signal);
  } catch (error) { stopped(signal); entry = uncertain(entry, message(error)); await retain(structuredClone(entry)); stopped(signal);
    if (error instanceof ApiRequestError && [401, 403].includes(error.status)) throw error;
  }
  try {
    const actual = await lookupTeachingEditorCommand(owner, entry, signal, transport); stopped(signal); await retain(structuredClone(actual.entry)); stopped(signal); return actual;
  } catch (error) { stopped(signal); entry = uncertain(entry, message(error)); await retain(structuredClone(entry)); stopped(signal);
    if (error instanceof ApiRequestError && [401, 403].includes(error.status)) throw error;
    return { verified: false, entry, current: null };
  }
}
