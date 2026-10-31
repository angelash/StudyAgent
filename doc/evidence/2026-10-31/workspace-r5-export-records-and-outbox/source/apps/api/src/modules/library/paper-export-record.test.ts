import { describe, expect, it } from 'vitest';
import { paperExportCommandSchema, paperExportDocumentSchema, type PaperExportCommand } from '@study-agent/contracts';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { at, fixture, sourceMap } from './paper-export-fixture.spec';
import { assertPaperExportCommand, assertPaperExportRecord, assertPaperExportSourceMap, paperExportDocumentBytes, paperExportDocumentSha256,
  paperExportSource, preparePaperExport, paperExportMediaId } from './paper-export-record';
import { preparePaperSelectionChange } from './paper-selection-record';

describe('immutable paper export input, original commands and renderer adapter', () => {
  it('freezes the exact original strings/order and one durable intent per book/format', () => {
    const value = fixture(), before = structuredClone(value);
    expect(value.command.input).toEqual(value.input); expect(value.command.result.at).toBe(at);
    expect(value.tasks.map(task => task.payload)).toEqual(value.record.slots.map(slot => ({ exportId: value.record.id, intentFingerprint: value.record.intent.fingerprint, book: slot.book, format: slot.format })));
    expect(value.tasks.every(task => task.maxAttempts === 3)).toBe(true);
    expect(value.record.intent.document.items.map(item => item.source.position)).toEqual([7, 3]);
    value.document.items[0].promptHtml = '后来编辑'; value.input.title = '另一版';
    expect(value.record).toEqual(before.record); expect(value.command).toEqual(before.command);
  });
  it('freezes a precise old revision after the current list has been reordered and cleared', () => {
    const first = fixture(), next = preparePaperSelectionChange({ actorId: first.actorId, authorization: first.auth,
      input: { kind: 'revise', requestKey: 'clear-next', listId: first.selection.list.id, expectedRevision: 1, expectedFingerprint: first.selection.command.result.fingerprint, title: '清空后', items: [] },
      previous: first.selection.list, resolved: [], at });
    expect(preparePaperExport({ actorId: first.actorId, authorization: first.auth, input: first.input, list: next.list, document: first.document, media: [], at })).toEqual({ record: first.record, command: first.command, tasks: first.tasks });
  });
  it('encodes published/research versions and unknown page numbers without guessing', () => {
    const value = fixture(), source = value.items[0].source;
    expect(paperExportSource(source)).toMatchObject({ publicationVersion: 'published-v2', paperTitle: '原卷0', pageNumber: null, sourceQuestionId: 'paper:original-7' });
    expect(paperExportSource({ ...source, publicationVersion: null }).publicationVersion).toBe('research-v1');
  });
  it('serializes the exact renderer bytes independently of object key insertion order', () => {
    const value = fixture(), reversed = Object.fromEntries(Object.entries(value.document).reverse()) as any;
    expect(paperExportDocumentBytes(reversed)).toEqual(paperExportDocumentBytes(value.document));
    expect(paperExportDocumentBytes(value.document).at(-1)).toBe('}'.charCodeAt(0));
    expect(paperExportDocumentSha256(value.document)).toBe(value.record.intent.documentSha256);
    expect(paperExportDocumentSha256({ ...value.document, title: value.document.title.trim() })).not.toBe(value.record.intent.documentSha256);
  });
  it.each(['firstAnswer', 'score', 'mediaPath', 'authorization', 'studentId'])('rejects client %s and unknown source fields', field => {
    expect(paperExportCommandSchema.safeParse({ ...fixture().input, [field]: 'private' }).success).toBe(false);
    const document = structuredClone(fixture().document) as any; document.items[0].source[field] = 'private';
    expect(paperExportDocumentSchema.safeParse(document).success).toBe(false);
  });
  it.each(['fingerprint', 'version', 'id', 'order', 'page', 'title', 'actor', 'list', 'empty'] as const)('rejects changed frozen %s before producing an intent', field => {
    const value = fixture();
    if (field === 'fingerprint') value.input.listFingerprint = digest('foreign');
    if (field === 'version') value.document.items[0].source.publicationVersion = 'published-v3';
    if (field === 'id') value.document.items[0].source.sourceQuestionId = 'paper:foreign';
    if (field === 'order') value.document.items.reverse();
    if (field === 'page') value.document.items[0].source.pageNumber = 9;
    if (field === 'title') value.document.items[0].source.paperTitle = '另一本';
    if (field === 'actor') value.actorId = 'other';
    if (field === 'list') value.input.listId = 'other';
    if (field === 'empty') value.document.items = [];
    expect(() => preparePaperExport({ actorId: value.actorId, authorization: value.auth, input: value.input, list: value.selection.list, document: value.document, media: [], at })).toThrow();
  });
  it('retains the entire original command/result and rejects a changed result even after hashing it again', () => {
    const value = fixture(); value.command.result = { kind: 'cancel', exportId: value.record.id, book: 'practice', format: 'pdf', taskId: value.tasks[0].id, previousVersion: 1, generation: 1, at };
    value.command.resultHash = digest(value.command.result); expect(() => assertPaperExportCommand(value.command)).toThrow();
  });
  it('rejects duplicate books/formats and noncanonical source publication encodings', () => {
    const value = fixture();
    expect(paperExportCommandSchema.safeParse({ ...value.input, books: ['practice', 'practice'] }).success).toBe(false);
    expect(paperExportCommandSchema.safeParse({ ...value.input, formats: ['pdf', 'pdf'] }).success).toBe(false);
    for (const publicationVersion of ['2', 'v2', 'published-v02', 'published-v0', 'null']) {
      const document = structuredClone(value.document); document.items[0].source.publicationVersion = publicationVersion;
      expect(paperExportDocumentSchema.safeParse(document).success).toBe(false);
    }
  });
  it('keeps media source identities while deduplicating the same verified PNG in renderer input', () => {
    const value = fixture(), sha256 = digest('png'), descriptor = { path: `media/${sha256}.png`, sha256, bytes: 19, width: 2, height: 3 };
    value.document.media = [descriptor]; const media = value.items.map(item => { const source = { paperId: item.source.paperId, sourceUrl: 'https://archive.invalid/image.png', sha256 };
      return { id: paperExportMediaId(source), ...source, bytes: 19, width: 2, height: 3, mediaType: 'image/png' as const }; });
    const result = preparePaperExport({ actorId: value.actorId, authorization: value.auth, input: value.input, list: value.selection.list, document: value.document, media, at });
    expect(result.record.intent.media).toHaveLength(2); expect(result.record.intent.document.media).toHaveLength(1);
    result.record.intent.media[1].bytes++;
    const { fingerprint: _fingerprint, ...body } = result.record.intent; result.record.intent.fingerprint = digest(body);
    expect(() => assertPaperExportRecord(result.record)).toThrow();
  });
  it.each(['number', 'source', 'end', 'start', 'bookmark', 'missing'] as const)('rejects a render source map with changed %s', field => {
    const document = fixture().document, map = sourceMap(document);
    if (field === 'number') map[0].number = 2;
    if (field === 'source') map[0].source.sourceQuestionId = 'paper:foreign';
    if (field === 'end') map[1].endPage = 3;
    if (field === 'start') map[0].startPage = 2;
    if (field === 'bookmark') map[0].bookmark = 'PaperItem0002';
    if (field === 'missing') map.pop();
    expect(() => assertPaperExportSourceMap(document, map, 2)).toThrow();
  });
  it('does not treat unsupported HTML as accepted renderer capability', () => {
    const value = fixture(); value.document.items[0].promptHtml = '<unsupported>保留，等待逐册预检拒绝</unsupported>';
    const result = preparePaperExport({ actorId: value.actorId, authorization: value.auth, input: value.input, list: value.selection.list, document: value.document, media: [], at });
    expect(result.record.intent.document.items[0].promptHtml).toContain('<unsupported>');
  });
});
