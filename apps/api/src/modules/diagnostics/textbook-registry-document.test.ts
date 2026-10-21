import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CurriculumBook } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { TextbookRegistryService } from './textbook-registry.service';

describe('verified textbook source documents', () => {
  let root = '', assets = '', registryPath = '', manifestPath = '', sourcePath = '', service: TextbookRegistryService;
  let previous = { registry: process.env.STUDY_TEXTBOOK_REGISTRY, manifest: process.env.STUDY_TEXTBOOK_SOURCE_MANIFEST, assets: process.env.STUDY_ASSET_ROOT };
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
    service = new TextbookRegistryService(new InMemoryStoreService());
  });
  afterEach(() => {
    if (previous.registry === undefined) delete process.env.STUDY_TEXTBOOK_REGISTRY; else process.env.STUDY_TEXTBOOK_REGISTRY = previous.registry;
    if (previous.manifest === undefined) delete process.env.STUDY_TEXTBOOK_SOURCE_MANIFEST; else process.env.STUDY_TEXTBOOK_SOURCE_MANIFEST = previous.manifest;
    if (previous.assets === undefined) delete process.env.STUDY_ASSET_ROOT; else process.env.STUDY_ASSET_ROOT = previous.assets;
    rmSync(root, { recursive: true, force: true });
  });
  it('publishes metadata without a local path and streams only a byte-verified source', async () => {
    const detail = service.detail(book.id, true);
    expect(detail.sourceDocument).toEqual({ available: true, pages: 12, sha256 });
    expect((detail as any).sourceAvailability).toMatchObject({ status: 'matched' });
    expect(JSON.stringify(detail.sourceDocument)).not.toContain(root);
    expect(await service.document(book.id)).toMatchObject({ path: sourcePath, size: bytes.length, sha256, pages: 12 });
  });
  it('rejects a changed source instead of serving bytes that no longer match the manifest', async () => {
    await service.document(book.id);
    writeFileSync(sourcePath, Buffer.from('%PDF-1.4\ntampered textbook source\n%%EOF'));
    const future = new Date(Date.now() + 2_000); utimesSync(sourcePath, future, future);
    await expect(service.document(book.id)).rejects.toThrow('字节校验失败');
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
    expect((service.detail('dated-book') as any).sourceAvailability).toMatchObject({ status: 'version_conflict' });
    expect(service.detail('undated-book').sourceDocument).toMatchObject({ pages: 12, sha256 });
  });
  it('binds year-labelled editions only when the source carries the same explicit year', () => {
    writeFileSync(registryPath, JSON.stringify({ books: [{ ...book, id: 'dated-book', edition: '测试版(2022)' }] }));
    writeFileSync(manifestPath, JSON.stringify({ books: [
      { id: 'source-different-year', grade: 3, term: 'upper', edition: '测试版(2024)',
        assetPath: 'data/assets/textbook-sources/test/books/book.pdf', sha256, pages: 12 },
    ] }));
    service = new TextbookRegistryService(new InMemoryStoreService());
    expect(service.detail('dated-book').sourceDocument).toBeNull();
    expect((service.detail('dated-book') as any).sourceAvailability).toMatchObject({ status: 'version_conflict' });

    writeFileSync(manifestPath, JSON.stringify({ books: [
      { id: 'source-same-year', grade: 3, term: 'upper', edition: '测试版(2022)',
        assetPath: 'data/assets/textbook-sources/test/books/book.pdf', sha256, pages: 12 },
    ] }));
    service = new TextbookRegistryService(new InMemoryStoreService());
    expect(service.detail('dated-book').sourceDocument).toMatchObject({ pages: 12, sha256 });
  });
});
