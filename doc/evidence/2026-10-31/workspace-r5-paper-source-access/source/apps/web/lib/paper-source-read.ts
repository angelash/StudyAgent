'use client';
import type { PaperSelectionSourceIdentity, PaperSourceReadCommand, PaperSourceReadResult } from '@study-agent/contracts';
import { ApiRequestError, apiBaseUrl, apiRequest, getAuthToken } from './api';
import type { SessionUser } from './session-user';

export type PaperReadingSource = { detailSha256: string; publicationVersion: number | null };
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ?
  Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)])) : value;
const same = (left: unknown, right: unknown) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
/** Every student opening/print gets an explicit exact read before body GET.
 * One ambiguous POST recovers its original key/input; it never switches to a
 * fresh command while trying to determine that command's result. */
export async function readPaperPreview<T extends { sourceIdentity: PaperReadingSource }>(actor: SessionUser, paperId: string, answers: boolean,
  options: { signal?: AbortSignal; expectedSource?: PaperReadingSource } = {}): Promise<T> {
  const token = getAuthToken(), headers = { 'X-Study-Actor': actor.id }, path = '/library/papers/' + encodeURIComponent(paperId);
  let expected = options.expectedSource;
  if (actor.role === 'student') {
    const metadata = await apiRequest<PaperReadingSource & { paperId: string; positions: PaperSelectionSourceIdentity[]; document: boolean }>(path + '/metadata', { signal: options.signal, headers }, token);
    const identity = { detailSha256: metadata.detailSha256, publicationVersion: metadata.publicationVersion };
    if (metadata.paperId !== paperId || !metadata.publicationVersion || expected && !same(expected, identity)) throw new Error('原卷版本已变化，请重新打开核对后再读取或打印。');
    expected = identity;
    if (metadata.document || metadata.positions.length) {
      const command: PaperSourceReadCommand = { kind: 'read', requestKey: crypto.randomUUID(), paperId, detailSha256: metadata.detailSha256,
        publicationVersion: metadata.publicationVersion, positions: metadata.document ? 'document' : metadata.positions.map(({ position, sourceQuestionId }) => ({ position, sourceQuestionId })),
        answers: metadata.document || answers, origin: null };
      try { await apiRequest<PaperSourceReadResult>('/library/source-reads', { method: 'POST', body: JSON.stringify(command), signal: options.signal, headers }, token); }
      catch (error) {
        if (options.signal?.aborted || error instanceof ApiRequestError && error.status < 500) throw error;
        const original = await apiRequest<{ input: PaperSourceReadCommand; result: PaperSourceReadResult } | null>('/library/source-reads/' + encodeURIComponent(command.requestKey), { signal: options.signal, headers }, token);
        if (!original || !same(original.input, command)) throw error;
      }
    }
  }
  const preview = await apiRequest<T>(path + '?answers=' + answers, { signal: options.signal, headers }, token);
  if (!preview.sourceIdentity || expected && !same(preview.sourceIdentity, expected)) throw new Error('原卷版本已变化，请重新打开核对后再读取或打印。');
  return preview;
}

/** A one-byte Range still performs the server's full-file integrity/current
 * authorization checks. The file stays streamed by the existing PDF window. */
export async function checkOriginalPaperPdf(actor: SessionUser, url: string, signal?: AbortSignal) {
  const token = getAuthToken(), headers: Record<string, string> = { 'X-Study-Actor': actor.id, Range: 'bytes=0-0' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(apiBaseUrl + url, { credentials: 'include', headers, signal }).catch(error => {
    if (error.name === 'AbortError') throw error;
    throw new Error('暂时无法核对原PDF，请检查连接后重试。');
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiRequestError(payload?.error?.message ?? '原PDF当前不可读取，请重新核对来源。', response.status, payload?.error?.code);
  }
  if (response.status !== 206 || !response.headers.get('content-type')?.includes('application/pdf')) {
    await response.body?.cancel(); throw new Error('原PDF格式或读取范围无法核对，请先恢复原资料。');
  }
  const prefix = new Uint8Array(await response.arrayBuffer());
  if (prefix.length !== 1 || prefix[0] !== 37) throw new Error('原PDF的实际字节无法核对，请先恢复原资料。');
}
