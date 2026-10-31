import { paperLibraryJournalSchema, paperSelectionCommandSchema, paperSelectionResultSchema, paperExportCommandSchema, paperExportResultSchema,
  type PaperLibraryCopyOwner, type PaperLibraryJournal } from '@study-agent/contracts';
import { apiRequest } from './api';
import { assertPaperLibraryJournal, paperLibraryRequestFingerprint, paperLibraryValueHash as hash } from './paper-library-copy';

export type PaperLibraryTransport = (path: string, options: RequestInit) => Promise<unknown>;
export type PaperLibraryLookup = { verified: true; entry: PaperLibraryJournal; current: unknown } | { verified: false; entry: PaperLibraryJournal; current: null };
const route = (family: PaperLibraryJournal['family']) => family === 'selection' ? '/library/selection-commands' : '/library/export-commands';
function stopped(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('原请求核对已停止，完整原命令仍保留。', 'AbortError'); }
const message = (error: unknown) => (error instanceof Error ? error.message : '原结果暂时不能核对，请保留完整原请求。').slice(0, 4000);
const uncertain = (entry: PaperLibraryJournal, reason: string): PaperLibraryJournal => paperLibraryJournalSchema.parse({ ...entry, phase: entry.result ? 'received' : 'unknown', message: reason });
async function receipt(owner: PaperLibraryCopyOwner, entry: PaperLibraryJournal, resultValue: unknown) {
  const result = (entry.family === 'selection' ? paperSelectionResultSchema : paperExportResultSchema).parse(resultValue);
  if (entry.result && await hash(entry.result) !== await hash(result)) throw new Error('服务器原回执与这份副本不同。两份原信息仍保留，请先核对，未自动采用或重发。');
  return assertPaperLibraryJournal(owner, { ...entry, phase: 'received', result, message: '' });
}
/** Only the actual original-command response can confirm a local receipt.
 * A null GET does not prove that an earlier POST cannot still commit. */
export async function lookupPaperLibraryCommand(owner: PaperLibraryCopyOwner, value: PaperLibraryJournal, signal?: AbortSignal, transport: PaperLibraryTransport = apiRequest): Promise<PaperLibraryLookup> {
  stopped(signal); const entry = await assertPaperLibraryJournal(owner, structuredClone(value)); stopped(signal);
  const response = await transport(route(entry.family) + '/' + encodeURIComponent(entry.input.requestKey), { signal }); stopped(signal);
  if (response === null) return { verified: false, entry: uncertain(entry, '还未查询到原回执，原请求仍可能稍后完成。请保留完整稿，核对或按原命令重试。'), current: null };
  if (!response || typeof response !== 'object' || Object.keys(response).sort().join(',') !== 'current,input,result') throw new Error('服务器返回的原命令不完整，请保留当前完整稿。');
  const original = response as { input: unknown; result: unknown; current: unknown }, input = (entry.family === 'selection' ? paperSelectionCommandSchema : paperExportCommandSchema).parse(original.input);
  if (await hash(input) !== await hash(original.input) || await paperLibraryRequestFingerprint(owner, entry.family, input) !== entry.requestFingerprint) throw new Error('这个请求键对应另一份完整命令，未覆盖当前编辑或重发。');
  const verified = await receipt(owner, entry, original.result); stopped(signal);
  return { verified: true, entry: verified, current: structuredClone(original.current) };
}
/** The caller retains each complete state before IO. Storage failure policy
 * stays visible in the workspace; this client never invents another key. */
export async function sendPaperLibraryCommand(owner: PaperLibraryCopyOwner, value: PaperLibraryJournal,
  retain: (entry: PaperLibraryJournal) => Promise<void>, signal?: AbortSignal, transport: PaperLibraryTransport = apiRequest): Promise<PaperLibraryLookup> {
  stopped(signal); let entry = uncertain(await assertPaperLibraryJournal(owner, structuredClone(value)), '正在提交原请求；离开或中断后请先核对原结果。');
  await retain(structuredClone(entry)); stopped(signal);
  try {
    const result = await transport(route(entry.family), { method: 'POST', body: JSON.stringify(entry.input), signal }); stopped(signal);
    entry = await receipt(owner, entry, result); stopped(signal); await retain(structuredClone(entry)); stopped(signal);
  } catch (error) {
    stopped(signal); entry = uncertain(entry, message(error)); await retain(structuredClone(entry)); stopped(signal);
  }
  try {
    const actual = await lookupPaperLibraryCommand(owner, entry, signal, transport); stopped(signal); await retain(structuredClone(actual.entry)); stopped(signal); return actual;
  } catch (error) {
    stopped(signal); entry = uncertain(entry, message(error)); await retain(structuredClone(entry)); stopped(signal); return { verified: false, entry, current: null };
  }
}
