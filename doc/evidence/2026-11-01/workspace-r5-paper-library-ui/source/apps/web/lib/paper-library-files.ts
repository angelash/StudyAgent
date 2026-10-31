import { apiBaseUrl, getAuthToken, ApiRequestError } from './api';
import { paperLibraryExportViewSchema, paperSelectionIdSchema, type PaperLibraryExportView } from '@study-agent/contracts';
import { paperCaptureBytesHash } from './paper-capture-copy';

/** Exact published bytes only; no HTML print substitute or arbitrary URL. */
export async function readPaperLibraryArtifact(actorIdValue: string, viewValue: PaperLibraryExportView, book: 'practice' | 'answers', format: 'pdf' | 'docx', signal?: AbortSignal) {
  const actorId = paperSelectionIdSchema.parse(actorIdValue);
  const view = paperLibraryExportViewSchema.parse(viewValue), slot = view.slots.find(row => row.book === book && row.format === format);
  if (!slot?.downloadUrl || !slot.publication || slot.state !== 'succeeded' || !view.availability.available) throw Error('这个实际文件当前不可读取，请先刷新导出状态。');
  const token = getAuthToken(), response = await fetch(apiBaseUrl + slot.downloadUrl, { credentials: 'include', headers: { 'X-Study-Actor': actorId, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, signal });
  if (!response.ok) { let message = '实际文件当前不能读取，请重新核对来源和导出状态。'; try { const value = await response.json(); if (typeof value?.error?.message === 'string') message = value.error.message; } catch {} throw new ApiRequestError(message, response.status); }
  const type = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (response.headers.get('content-type')?.split(';')[0].trim() !== type || Number(response.headers.get('content-length')) !== slot.publication.bytes || response.headers.get('etag') !== '"' + slot.publication.sha256 + '"') throw Error('实际文件的类型、大小或版本与当前产物不同，请刷新后再读取。');
  const reader = response.body?.getReader(); if (!reader) throw Error('浏览器暂不能完整读取这个文件，请保留导出状态后重试。');
  const chunks: Uint8Array[] = []; let total = 0, finished = false;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > slot.publication.bytes) throw Error('实际文件超出已发布大小，已停止读取。'); chunks.push(value); }
    if (total !== slot.publication.bytes) throw Error('实际文件尚未完整读取，请保留当前导出后重试。');
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (await paperCaptureBytesHash(bytes) !== slot.publication.sha256 || signal?.aborted) throw Error('实际文件校验未完成，请刷新导出状态后再读取。');
    finished = true; return { blob: new Blob([bytes], { type }), filename: (book === 'practice' ? '练习册' : '答案册') + '-' + view.id + '.' + format };
  } finally { if (!finished) await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
