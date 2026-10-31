import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Parser } from 'htmlparser2';
import sharp from 'sharp';
import type { PaperExportDocument } from '@study-agent/contracts';
import type { LibraryRepository } from './library.repository';
import type { ResolvedPaperSelection } from './paper-selection-source';
import { assertPaperExportDocument, paperExportMediaId, paperExportSource, type PaperExportIntent } from './paper-export-record';
import { openVerifiedLibraryMedia } from './verified-library-media';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const failure = () => new ConflictException({ code: 'paper_export_media_invalid', message: '原题图片暂不能完整导出，请保留清单并核对原始PNG资料。' });
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Preserve all original markup outside rewritten image start tags. Unsupported
 * tags/attributes reach the real parser and are refused, never silently dropped. */
export function rewritePaperExportImages(value: string, image: (url: string) => string) {
  if (Buffer.byteLength(value) > 8 * 1024 * 1024) throw new ConflictException('原题正文超过导出预算，请保留清单后核对。');
  const edits: Array<{ start: number; end: number; text: string }> = [];
  let names = new Set<string>(), count = 0;
  const parser = new Parser({
    onopentagname() { names = new Set(); if (++count > 120000) throw new ConflictException('原题结构超过导出预算。'); },
    onattribute(name) { if (names.has(name)) throw new ConflictException('原题含重复属性，请先核对原件。'); names.add(name); },
    onopentag(name, attributes) {
      if (name !== 'img') return;
      const local = image(attributes.src ?? '');
      edits.push({ start: parser.startIndex, end: parser.endIndex + 1,
        text: '<img ' + Object.entries({ ...attributes, src: local }).map(([name, value]) => name + '="' + escape(value) + '"').join(' ') + '>' });
    },
  }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  parser.end(value);
  let previous = 0, result = '';
  for (const edit of edits) { if (edit.start < previous || edit.end > value.length) throw failure(); result += value.slice(previous, edit.start) + edit.text; previous = edit.end; }
  return result + value.slice(previous);
}
const text = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ConflictException('原题字段不能完整解析，请先核对原资料。');
  return value;
};
export type PaperExportResolvedDocument = { document: PaperExportDocument; media: PaperExportIntent['media']; mediaBytes: Map<string, Buffer> };
export async function buildPaperExportDocument(input: { title: string; layout: PaperExportDocument['layout']; resolved: readonly ResolvedPaperSelection[];
  repo: Pick<LibraryRepository, 'media'>; signal?: AbortSignal }): Promise<PaperExportResolvedDocument> {
  const urls = new Map<string, { paperId: string; sourceUrl: string }>();
  const raw = input.resolved.map(({ item, original }) => {
    if (!Array.isArray(original.options) && original.options != null) throw new ConflictException('原选项结构无法完整解析。');
    const options = (original.options as unknown[] | undefined ?? []).map((value, index) => {
      const label = value && typeof value === 'object' && !Array.isArray(value) && 'label' in value ? text(value.label) : null;
      const html = typeof value === 'string' ? value : value && typeof value === 'object' && !Array.isArray(value) && 'title' in value ? text(value.title) : null;
      if (html === null) throw new ConflictException('原选项正文无法完整解析。');
      return { label: label ?? (index < 26 ? String.fromCharCode(65 + index) : String(index + 1)), html };
    });
    const reference = { answerHtml: text(original.answer), analysisHtml: text(original.details) };
    const result = { id: item.id, source: paperExportSource(item.source), promptHtml: text(original.title) ?? '', optionHtml: options,
      reference: reference.answerHtml !== null || reference.analysisHtml !== null ? reference : null };
    for (const html of [result.promptHtml, ...options.map(option => option.html), reference.answerHtml, reference.analysisHtml]) if (html !== null)
      rewritePaperExportImages(html, sourceUrl => { if (!/^https?:\/\//i.test(sourceUrl) || sourceUrl.length > 3000) throw failure(); urls.set(JSON.stringify([item.source.paperId, sourceUrl]), { paperId: item.source.paperId, sourceUrl }); return sourceUrl; });
    return result;
  });
  if (urls.size > 500) throw failure();
  const media: PaperExportIntent['media'] = [], mediaBytes = new Map<string, Buffer>(), paths = new Map<string, string>();
  let pixels = 0, bytes = 0;
  for (const [key, identity] of urls) {
    if (input.signal?.aborted) throw new ConflictException('导出预检已中断，原稿仍保留。');
    try {
    const local = input.repo.media(identity.sourceUrl); if (!local || local.size > 12 * 1024 * 1024) throw failure();
    const opened = await openVerifiedLibraryMedia(local, input.signal); let content: Buffer;
    try { const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of opened.handle.createReadStream({ start: 0, end: local.size - 1, autoClose: false, signal: input.signal })) {
        length += chunk.length; if (length > local.size) throw failure(); chunks.push(Buffer.from(chunk));
      }
      content = Buffer.concat(chunks); if (content.length !== local.size || sha(content) !== local.sha256) throw failure();
    } finally { await opened.handle.close(); }
    const metadata = await sharp(content, { limitInputPixels: 36_000_000, animated: true }).metadata().catch(() => { throw failure(); });
    if (metadata.format !== 'png' || !metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000 || (metadata.pages ?? 1) !== 1) throw failure();
    const descriptor = { ...identity, sha256: local.sha256, bytes: local.size, mediaType: 'image/png' as const, width: metadata.width, height: metadata.height };
    media.push({ id: paperExportMediaId({ paperId: identity.paperId, sourceUrl: identity.sourceUrl, sha256: local.sha256 }), ...descriptor });
    const file = 'media/' + local.sha256 + '.png'; paths.set(key, file);
    if (!mediaBytes.has(file)) { pixels += metadata.width * metadata.height; bytes += local.size; mediaBytes.set(file, content); }
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      // Keep an unavailable original URL in the complete input. The real
      // per-book parser refuses the book that uses it; another book is not
      // rejected merely for an unused, unsupported reference image.
      paths.set(key, identity.sourceUrl);
    }
    if (pixels > 120_000_000 || bytes > 80 * 1024 * 1024) throw failure();
  }
  if (input.signal?.aborted) throw new ConflictException('导出预检已中断，原稿仍保留。');
  const document: PaperExportDocument = { protocol: 'paper-export-document-v1', title: input.title, layout: structuredClone(input.layout),
    items: raw.map(item => {
      const rewrite = (html: string) => rewritePaperExportImages(html, url => { const local = paths.get(JSON.stringify([item.source.paperId, url])); if (!local) throw failure(); return local; });
      return { ...item, promptHtml: rewrite(item.promptHtml), optionHtml: item.optionHtml.map(option => ({ ...option, html: rewrite(option.html) })),
        reference: item.reference ? { answerHtml: item.reference.answerHtml === null ? null : rewrite(item.reference.answerHtml), analysisHtml: item.reference.analysisHtml === null ? null : rewrite(item.reference.analysisHtml) } : null };
    }), media: [...mediaBytes.keys()].sort((a, b) => a.localeCompare(b)).map(file => {
      const descriptor = media.find(item => file === 'media/' + item.sha256 + '.png')!; return { path: file, sha256: descriptor.sha256, bytes: descriptor.bytes, width: descriptor.width, height: descriptor.height };
    }) };
  assertPaperExportDocument(document); return { document, media, mediaBytes };
}
