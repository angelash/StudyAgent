import { describe, expect, it } from 'vitest';
import type { CurriculumBook } from '@study-agent/contracts';
import { assertConformityExtraction, editionConformity, registryEditionFingerprint } from './textbook-edition-conformity';
import { syntheticEditionConformity } from './textbook-edition-conformity.fixture';

function fixture() {
  const book: CurriculumBook = { id: 'qa-edition', version: 'v1', subject: 'chinese', grade: 3, term: 'upper',
    edition: '独立原件，版次年份未知', title: '工程整册版本样本', source: 'archive', sourceRef: 'Generated only', sourceSha256: 'a'.repeat(64), chapterState: 'available',
    chapters: [{ id: 'unit1', name: '第一单元', lessons: [{ id: 'first', name: '相同首课', printedPage: 2 }, { id: 'second', name: '原第二课', printedPage: 3 }] }] };
  const source = { id: 'qa-source', sha256: 'b'.repeat(64), extractedSha256: 'c'.repeat(64), pages: 5, subject: 'chinese', grade: 3, term: 'upper' },
    pages = [{ page: 1, text: '完整目录与版次依据（合成）' }], proof = syntheticEditionConformity(book, source, pages);
  return { book, source, pages, proof, check: () => editionConformity(book, [source], [proof]) };
}
describe('independent whole-book edition conformity', () => {
  it('binds a complete independently registered undated original without inventing a publication year', () => {
    const f = fixture(); expect(f.check()).toMatchObject({ status: 'matched', proof: { edition: { publicationYear: null } } });
    expect(() => assertConformityExtraction(f.proof, f.pages)).not.toThrow();
  });
  it('rejects matching title, first lesson and bytes when a later directory entry changes', () => {
    const f = fixture(); f.book.chapters[0].lessons[1].name = '另一版本第二课';
    expect(f.check()).toMatchObject({ status: 'edition_unverified', proof: null });
    f.proof.registryFingerprint = registryEditionFingerprint(f.book); expect(f.check().reason).toContain('课题、顺序');
  });
  it.each(['sha256', 'extractedSha256', 'id', 'pages'])('invalidates an independently changed source %s', field => {
    const f = fixture(); (f.source as any)[field] = field === 'pages' ? 6 : 'd'.repeat(64); expect(f.check().proof).toBeNull();
  });
  it('refuses missing, legacy and malformed duplicate proofs instead of choosing an apparently valid record', () => {
    const f = fixture(); expect(editionConformity(f.book, [f.source], []).proof).toBeNull();
    expect(editionConformity(f.book, [f.source], [{ bookId: f.book.id, bookVersion: f.book.version }]).proof).toBeNull();
    expect(editionConformity(f.book, [f.source], [f.proof, { bookId: f.book.id, bookVersion: f.book.version }]).reason).toContain('重复');
    expect(editionConformity(f.book, [f.source, f.source], [f.proof]).proof).toBeNull();
  });
  it('distinguishes a course standard year from an unknown publication edition', () => {
    const f = fixture(); f.proof.edition.curriculumStandardYear = 2022; expect(f.check().proof).toBeNull();
    f.book.sourceEdition!.curriculumStandardYear = 2022; f.proof.registryFingerprint = registryEditionFingerprint(f.book);
    expect(f.check().proof?.edition).toMatchObject({ publicationYear: null, curriculumStandardYear: 2022 });
    f.proof.edition.independentlyRegistered = false; expect(f.check().proof).toBeNull();
  });
  it('requires every lesson including references exactly once and in order, using identity for same-name lessons', () => {
    const f = fixture(); f.proof.directory.entries.reverse(); expect(f.check().proof).toBeNull();
    f.proof.directory.entries.reverse(); f.proof.directory.entries.pop(); expect(f.check().proof).toBeNull();
    const duplicate = fixture(); duplicate.book.chapters[0].lessons[1].id = 'first'; duplicate.proof.registryFingerprint = registryEditionFingerprint(duplicate.book);
    expect(duplicate.check().proof).toBeNull();
  });
  it('declines malformed unknown-edition bibliography without a runtime type error', () => {
    const f = fixture(); (f.book.sourceEdition as any).publicationStatement = null; f.proof.registryFingerprint = registryEditionFingerprint(f.book);
    expect(() => f.check()).not.toThrow(); expect(f.check().proof).toBeNull();
  });
  it('invalidates a changed directory page even when its extracted file is otherwise parseable', () => {
    const f = fixture(); expect(() => assertConformityExtraction(f.proof, [{ page: 1, text: f.pages[0].text + 'another edition' }])).toThrow('edition_evidence_page_changed');
  });
  it('rejects backwards, duplicate or out-of-book physical directory and edition evidence', () => {
    const f = fixture(); f.proof.directory.entries[0].physicalStartPage = 2; f.proof.directory.entries[1].physicalStartPage = 1; expect(f.check().proof).toBeNull();
    const duplicate = fixture(); duplicate.proof.directory.pages.push(duplicate.proof.directory.pages[0]); expect(duplicate.check().proof).toBeNull();
    const outside = fixture(); outside.proof.edition.pages[0].page = 6; expect(outside.check().proof).toBeNull();
  });
});
