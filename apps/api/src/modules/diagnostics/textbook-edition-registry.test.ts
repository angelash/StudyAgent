import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CurriculumBook } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { TextbookRegistryService } from './textbook-registry.service';
import { installSyntheticEditionConformities } from './textbook-edition-conformity.fixture';
import { lessonSourceFingerprint, sourceFingerprint } from './textbook-source-candidates';

const keys = ['STUDY_TEXTBOOK_REGISTRY', 'STUDY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_TEXTBOOK_EDITION_CONFORMITIES', 'STUDY_TEXTBOOK_MAPPING_CANDIDATES', 'STUDY_ASSET_ROOT'] as const;
describe('actual exact-edition source I/O and legacy qualification boundaries', () => {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let directory: string, proofFile: string, candidateFile: string, service: TextbookRegistryService, book: CurriculumBook, row: any, proofId: string;
  const bytes = Buffer.from('%PDF-1.4\nGenerated edition I/O original only\n%%EOF'), sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  beforeEach(() => {
    const qa = resolve(process.cwd(), '../../data/qa'); mkdirSync(qa, { recursive: true }); directory = mkdtempSync(join(qa, 'edition-source-')); mkdirSync(join(directory, 'assets'));
    const pages = [1, 2, 3].map(page => ({ page, text: page === 1 ? '完整合成目录及独立版次依据' : '完整原课时来源' })),
      extracted = Buffer.from(JSON.stringify({ format: 'chinatextbook-extraction-v1', id: 'source:qa-edition', sourceSha256: sha(bytes), pages }));
    writeFileSync(join(directory, 'assets/book.pdf'), bytes); writeFileSync(join(directory, 'assets/book.json'), extracted);
    book = { id: 'qa:edition', version: 'v1', title: '工程独立版本', edition: '版次未知的独立原件', subject: 'chinese', grade: 3, term: 'upper', source: 'archive', sourceRef: 'Generated only', sourceSha256: sha(bytes), chapterState: 'available', chapters: [{ id: 'unit', name: '合成单元', lessons: [{ id: 'lesson', name: '相同首课', printedPage: 1 }, { id: 'later', name: '不同版本的后续课', printedPage: 2 }] }] };
    writeFileSync(join(directory, 'registry.json'), JSON.stringify({ books: [book] })); writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ books: [{ id: 'source:qa-edition', subject: 'chinese', grade: 3, term: 'upper', edition: book.edition, title: book.title,
      assetPath: 'data/assets/book.pdf', bytes: bytes.length, pages: 3, sha256: sha(bytes), extractedPath: 'data/assets/book.json', extractedSha256: sha(extracted) }] }));
    proofId = installSyntheticEditionConformities(directory).get(book.id)!; proofFile = join(directory, 'conformities.json'); candidateFile = join(directory, 'candidates.json');
    row = { bookId: book.id, bookVersion: book.version, lessonId: 'lesson', sourceBookId: 'source:qa-edition', sourceSha256: sha(bytes), extractedSha256: sha(extracted), lessonFingerprint: lessonSourceFingerprint(book.chapters[0], book.chapters[0].lessons[0]), pdfStartPage: 2, pdfEndPage: 3, titleMatched: true, candidateAtomIds: [], rationale: 'Generated candidate only', evidence: [], reviewStatus: 'candidate', approvedAtomIds: [] };
    writeCandidates(row);
    Object.assign(process.env, { STUDY_TEXTBOOK_REGISTRY: join(directory, 'registry.json'), STUDY_TEXTBOOK_SOURCE_MANIFEST: join(directory, 'manifest.json'), STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST: join(directory, 'none.json'), STUDY_TEXTBOOK_MAPPING_CANDIDATES: candidateFile, STUDY_ASSET_ROOT: join(directory, 'assets') });
    service = new TextbookRegistryService(new InMemoryStoreService());
  });
  afterEach(() => { vi.restoreAllMocks(); for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; });
  function writeCandidates(candidate: any) { writeFileSync(candidateFile, JSON.stringify({ format: 'textbook-mapping-candidates-v1', sourceIdentityVersion: 'textbook-source-candidate-v1', rows: [candidate] })); }
  function changeProof() { const document = JSON.parse(readFileSync(proofFile, 'utf8')); document.rows[0].review.statement += ' Changed after original read.'; writeFileSync(proofFile, JSON.stringify(document)); }
  const read = () => service.teachingSource('qa:edition', 'v1', 'lesson', 2, 3);
  it('separates an explicit read-only reference from an unavailable accurate edition', async () => {
    writeFileSync(proofFile, JSON.stringify({ format: 'textbook-edition-conformities-v1', rows: [] }));
    expect(service.detail(book.id, true)).toMatchObject({ sourceDocument: null, sourceAvailability: { status: 'edition_unverified' }, referenceSources: [{ id: 'source:qa-edition' }] });
    const original = await service.referenceDocument(book.id, 'source:qa-edition'); try { expect(original.sha256).toBe(sha(bytes)); } finally { await original.handle.close(); }
    await expect(service.document(book.id)).rejects.toThrow('准确版本'); await expect(read()).rejects.toThrow('准确同版');
  });
  it('does not promote a legacy locator when a whole-book proof becomes available', async () => {
    expect(service.sourceCandidate(service.require(book.id), 'lesson')).toBeNull(); await expect(service.lessonSource(book.id, 'lesson')).rejects.toThrow('定位候选');
    writeCandidates({ ...row, editionProofFingerprint: proofId }); expect((await service.lessonSource(book.id, 'lesson')).pageRange).toEqual({ start: 2, end: 3 });
  });
  it('binds new full sources to the independently reviewed whole-book proof and rejects old or forged qualifications', async () => {
    const source = await read(); expect(source.editionProofFingerprint).toBe(proofId); expect(() => service.assertCurrentEdition(source)).not.toThrow();
    expect(() => service.assertCurrentEdition({ ...source, editionProofFingerprint: undefined })).toThrow('旧稿');
    expect(() => service.assertCurrentEdition({ ...source, sourceSha256: 'f'.repeat(64) })).toThrow('旧稿');
    changeProof(); expect(() => service.assertCurrentEdition(source)).toThrow('旧稿');
  });
  it('rechecks the independent proof after actual asynchronous original/extraction I/O', async () => {
    const original = service.document.bind(service); vi.spyOn(service, 'document').mockImplementation(async (...args) => { const opened = await original(...args); changeProof(); return opened; });
    await expect(read()).rejects.toThrow('读取期间整册版本');
  });
  it('rejects a late locator response after the registry changes elsewhere in the same book', async () => {
    writeCandidates({ ...row, editionProofFingerprint: proofId }); const original = service.document.bind(service);
    vi.spyOn(service, 'document').mockImplementation(async (...args) => { const opened = await original(...args), file = join(directory, 'registry.json'), document = JSON.parse(readFileSync(file, 'utf8')); document.books[0].chapters[0].lessons[1].name += '新版'; writeFileSync(file, JSON.stringify(document)); return opened; });
    await expect(service.lessonSource(book.id, 'lesson')).rejects.toThrow('读取期间原课时');
  });
  it('checks the entire directory evidence page rather than accepting its claimed hash', async () => {
    const document = JSON.parse(readFileSync(proofFile, 'utf8')); document.rows[0].directory.pages[0].textSha256 = 'f'.repeat(64); writeFileSync(proofFile, JSON.stringify(document));
    await expect(read()).rejects.toThrow('完整目录页');
  });
  it('keeps current exact identities fresh across requests instead of reusing a cached match', async () => {
    const source = await read(), before = sourceFingerprint(service.detail(book.id)); changeProof(); const changed = await read();
    expect(changed.editionProofFingerprint).not.toBe(source.editionProofFingerprint); expect(changed.fingerprint).not.toBe(source.fingerprint);
    expect(sourceFingerprint(service.detail(book.id))).toBe(before);
  });
});
