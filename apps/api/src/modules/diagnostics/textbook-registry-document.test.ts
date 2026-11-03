import { installSyntheticEditionConformities } from './textbook-edition-conformity.fixture';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CurriculumBook } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { TextbookRegistryService } from './textbook-registry.service';
import { registryEditionFingerprint } from './textbook-edition-conformity';

describe('verified textbook source documents', () => {
  let root = '', assets = '', registryPath = '', manifestPath = '', sourcePath = '', service: TextbookRegistryService;
  let handles: FileHandle[] = [];
  async function open() { const document = await service.document(book.id); handles.push(document.handle); return document; }
  let previous = { registry: process.env.STUDY_TEXTBOOK_REGISTRY, manifest: process.env.STUDY_TEXTBOOK_SOURCE_MANIFEST, assets: process.env.STUDY_ASSET_ROOT, textbooks: process.env.TEXTBOOK_BASE_PATH, conformity: process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES };
  const bytes = Buffer.from('%PDF-1.4\nsynthetic textbook source\n%%EOF');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const book: CurriculumBook = {
    id: 'public-book:test-chinese', subject: 'chinese', grade: 3, term: 'upper', edition: 'test',
    title: '测试语文教材', version: 'v1', source: 'public_catalog', sourceRef: 'fixture', sourceSha256: 'fixture',
    chapterState: 'available', chapters: [{ id: 'c1', name: '第一单元', lessons: [{ id: 'l1', name: '第一课', printedPage: 2 }] }]
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'study-textbook-document-')); assets = join(root, 'assets');
    sourcePath = join(assets, 'textbook-sources/test/books/book.pdf'); mkdirSync(join(sourcePath, '..'), { recursive: true }); writeFileSync(sourcePath, bytes);
    registryPath = join(root, 'registry.json'); manifestPath = join(root, 'manifest.json');
    writeFileSync(registryPath, JSON.stringify({ books: [book] }));
    writeFileSync(manifestPath, JSON.stringify({ books: [{ id: 'source:test', grade: 3, term: 'upper', edition: 'test',
      assetPath: 'data/assets/textbook-sources/test/books/book.pdf', sha256, pages: 12 }] }));
    process.env.STUDY_TEXTBOOK_REGISTRY = registryPath; process.env.STUDY_TEXTBOOK_SOURCE_MANIFEST = manifestPath; process.env.STUDY_ASSET_ROOT = assets;
    installSyntheticEditionConformities(root);
    service = new TextbookRegistryService(new InMemoryStoreService());
  });
  afterEach(async () => {
    for (const handle of handles) await handle.close(); handles = [];
    if (previous.conformity === undefined) delete process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES; else process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES = previous.conformity;
    if (previous.registry === undefined) delete process.env.STUDY_TEXTBOOK_REGISTRY; else process.env.STUDY_TEXTBOOK_REGISTRY = previous.registry;
    if (previous.manifest === undefined) delete process.env.STUDY_TEXTBOOK_SOURCE_MANIFEST; else process.env.STUDY_TEXTBOOK_SOURCE_MANIFEST = previous.manifest;
    if (previous.assets === undefined) delete process.env.STUDY_ASSET_ROOT; else process.env.STUDY_ASSET_ROOT = previous.assets;
    if (previous.textbooks === undefined) delete process.env.TEXTBOOK_BASE_PATH; else process.env.TEXTBOOK_BASE_PATH = previous.textbooks;
    rmSync(root, { recursive: true, force: true });
  });
  it('publishes metadata without a local path and streams only a byte-verified source', async () => {
    const detail = service.detail(book.id, true);
    expect(detail.sourceDocument).toEqual({ available: true, pages: 12, sha256 });
    expect((detail as any).sourceAvailability).toMatchObject({ status: 'matched' });
    expect(JSON.stringify(detail.sourceDocument)).not.toContain(root);
    expect(await open()).toMatchObject({ path: sourcePath, size: bytes.length, sha256, pages: 12 });
  });
  it('rejects a changed source instead of serving bytes that no longer match the manifest', async () => {
    await open();
    writeFileSync(sourcePath, Buffer.from('%PDF-1.4\ntampered textbook source\n%%EOF'));
    const future = new Date(Date.now() + 2_000); utimesSync(sourcePath, future, future);
    await expect(service.document(book.id)).rejects.toThrow('字节校验失败');
  });
  function external(path = '小学/语文/book.pdf') {
    process.env.TEXTBOOK_BASE_PATH = join(root, 'repository');
    const target = join(process.env.TEXTBOOK_BASE_PATH, '小学/语文/book.pdf');
    mkdirSync(join(target, '..'), { recursive: true }); writeFileSync(target, bytes);
    writeFileSync(manifestPath, JSON.stringify({ books: [{ id: 'source:test', grade: 3, term: 'upper', edition: 'test', repositoryPath: path, sha256, pages: 12 }] }));
    installSyntheticEditionConformities(root);
    service = new TextbookRegistryService(new InMemoryStoreService());
    return target;
  }
  it('reads hash-pinned repository originals after the application PDF copy is removed', async () => {
    const target = external(); rmSync(sourcePath);
    expect(await open()).toMatchObject({ path: target, sha256, size: bytes.length });
    writeFileSync(target, 'changed external PDF');
    await expect(service.document(book.id)).rejects.toThrow('字节校验失败');
  });
  it('reports an unavailable repository without falling back to a different local PDF', async () => {
    external(); delete process.env.TEXTBOOK_BASE_PATH;
    expect(service.documentMetadata(service.require(book.id))).toMatchObject({ available: false });
    await expect(service.document(book.id)).rejects.toThrow('原卷未安装');
  });
  it('rehashes equal-length originals even when the original modification time is restored', async () => {
    const when = new Date('2026-01-01T00:00:00Z'); utimesSync(sourcePath, when, when);
    const before = statSync(sourcePath); await open();
    const changed = Buffer.from(bytes); changed[12] ^= 1; writeFileSync(sourcePath, changed); utimesSync(sourcePath, when, when);
    expect(statSync(sourcePath).size).toBe(before.size); expect(statSync(sourcePath).mtimeMs).toBe(before.mtimeMs);
    await expect(service.document(book.id)).rejects.toThrow('字节校验失败');
  });
  it('does not mask an in-root link by resolving it before descriptor verification', async () => {
    const real = join(assets, 'real'); mkdirSync(real); writeFileSync(join(real, 'book.pdf'), bytes);
    symlinkSync(real, join(assets, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(manifestPath, JSON.stringify({ books: [{ id: 'source:test', grade: 3, term: 'upper', edition: 'test', assetPath: 'data/assets/linked/book.pdf', sha256, pages: 12 }] }));
    installSyntheticEditionConformities(root);
    service = new TextbookRegistryService(new InMemoryStoreService());
    await expect(service.document(book.id)).rejects.toThrow('字节校验失败');
  });
  it('rejects a request already cancelled before reading the original', async () => {
    const cancellation = new AbortController(); cancellation.abort();
    await expect(service.document(book.id, cancellation.signal)).rejects.toThrow('字节校验失败');
  });
  it.each(['../outside.pdf', '/outside.pdf', 'C:\\outside.pdf', '小学/../outside.pdf'])('rejects unsafe repository path %s', async path => {
    external(path);
    await expect(service.document(book.id)).rejects.toThrow('相对路径无效');
  });
  it('rejects repository links that escape the configured root', async () => {
    external('linked/book.pdf');
    const outside = join(root, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'book.pdf'), bytes);
    symlinkSync(outside, join(process.env.TEXTBOOK_BASE_PATH!, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(service.document(book.id)).rejects.toThrow('链接越界');
  });
  it('never binds a year-labelled catalog edition to an undated or different-year source', () => {
    writeFileSync(registryPath, JSON.stringify({ books: [
      { ...book, id: 'dated-book', edition: '测试版(2024)' },
      { ...book, id: 'undated-book', edition: '测试版' },
    ] }));
    writeFileSync(manifestPath, JSON.stringify({ books: [
      { id: 'source-undated', grade: 3, term: 'upper', edition: '测试版',
        assetPath: 'data/assets/textbook-sources/test/books/book.pdf', sha256, pages: 12 },
    ] }));
    service = new TextbookRegistryService(new InMemoryStoreService());
    expect(service.detail('dated-book').sourceDocument).toBeNull();
    expect((service.detail('dated-book') as any).sourceAvailability).toMatchObject({ status: 'edition_unverified' });
    expect(service.detail('undated-book').sourceDocument).toBeNull();
  });
  it.each([undefined, '教材2024年版'])('does not let the exact edition label bypass an explicit catalog-title year with source title %s', title => {
    writeFileSync(registryPath, JSON.stringify({ books: [{ ...book, id: 'title-year-book', edition: '测试版', title: '教材2022年版' }] }));
    writeFileSync(manifestPath, JSON.stringify({ books: [{ id: 'same-label-unverified-source', grade: 3, term: 'upper', edition: '测试版', title,
      assetPath: 'data/assets/textbook-sources/test/books/book.pdf', sha256, pages: 12 }] }));
    service = new TextbookRegistryService(new InMemoryStoreService());
    expect(service.documentMetadata(service.require('title-year-book'))).toBeNull();
    expect(service.availability(service.require('title-year-book')).status).toBe('edition_unverified');
  });
  it('does not grant whole-book conformity from a same-year source among same-name originals', () => {
    writeFileSync(registryPath, JSON.stringify({ books: [{ ...book, id: 'title-year-book', edition: '测试版', title: '教材2022年版' }] }));
    writeFileSync(manifestPath, JSON.stringify({ books: [{ id: 'source-undated-label', grade: 3, term: 'upper', edition: '测试版',
      assetPath: 'data/assets/textbook-sources/test/books/book.pdf', sha256: 'f'.repeat(64), pages: 9 },
    { id: 'source-dated-label', grade: 3, term: 'upper', edition: '测试版', title: '教材2022年版',
      assetPath: 'data/assets/textbook-sources/test/books/book.pdf', sha256, pages: 12 }] }));
    service = new TextbookRegistryService(new InMemoryStoreService());
    expect(service.documentMetadata(service.require('title-year-book'))).toBeNull();
  });
  it('releases a shared discrepancy snapshot before the next catalog read', () => {
    const file = process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES!;
    const document = { format: 'textbook-edition-conformities-v1', rows: [], discrepancies: [{
      bookId: book.id, bookVersion: book.version, registryFingerprint: registryEditionFingerprint(book),
      sourceBookId: 'source:test', sourceSha256: sha256, extractedSha256: 'c'.repeat(64),
      reason: 'Synthetic exact edition mismatch retained for one catalog read.' }] };
    writeFileSync(file, JSON.stringify(document));
    service.readSourcesTogether(() => {
      expect(service.availability(book).status).toBe('version_conflict');
      writeFileSync(file, JSON.stringify({ ...document, discrepancies: [] }));
      expect(service.availability(book).status).toBe('version_conflict');
    });
    expect(service.readSourcesTogether(() => service.availability(book).status)).toBe('edition_unverified');
    writeFileSync(file, JSON.stringify(document));
    expect(service.availability(book).status).toBe('version_conflict');
  });
  it('never grants exact conformity from either same or conflicting year labels alone', () => {
    writeFileSync(registryPath, JSON.stringify({ books: [{ ...book, id: 'dated-book', edition: '测试版(2022)' }] }));
    writeFileSync(manifestPath, JSON.stringify({ books: [
      { id: 'source-different-year', grade: 3, term: 'upper', edition: '测试版(2024)',
        assetPath: 'data/assets/textbook-sources/test/books/book.pdf', sha256, pages: 12 },
    ] }));
    service = new TextbookRegistryService(new InMemoryStoreService());
    expect(service.detail('dated-book').sourceDocument).toBeNull();
    expect((service.detail('dated-book') as any).sourceAvailability).toMatchObject({ status: 'edition_unverified' });

    writeFileSync(manifestPath, JSON.stringify({ books: [
      { id: 'source-same-year', grade: 3, term: 'upper', edition: '测试版(2022)',
        assetPath: 'data/assets/textbook-sources/test/books/book.pdf', sha256, pages: 12 },
    ] }));
    service = new TextbookRegistryService(new InMemoryStoreService());
    expect(service.detail('dated-book').sourceDocument).toBeNull();
  });
});
