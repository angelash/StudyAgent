import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CurriculumBook } from '@study-agent/contracts';
import { boundTextbookSourceCandidate, lessonSourceFingerprint, loadTextbookSourceCandidates } from './textbook-source-candidates';

describe('exact textbook lesson source bindings', () => {
  const book: CurriculumBook = { id: 'original-qa', subject: 'chinese', grade: 3, term: 'upper', edition: 'QA', title: 'QA', version: 'v1', source: 'public_catalog', sourceRef: 'QA', sourceSha256: 'a'.repeat(64), chapterState: 'available', chapters: [{ id: 'unit', name: '单元', lessons: [{ id: 'combined', name: '组合课', parts: [{ name: '第一部分', printedPage: 2 }, { name: '第二部分', printedPage: 4 }] }] }] };
  const chapter = book.chapters[0], lesson = chapter.lessons[0], source = { id: 'original-source', sha256: 'b'.repeat(64), extractedSha256: 'c'.repeat(64), pages: 5 };
  const valid = { bookId: book.id, bookVersion: book.version, lessonId: lesson.id, sourceBookId: source.id, sourceSha256: source.sha256, extractedSha256: source.extractedSha256, lessonFingerprint: lessonSourceFingerprint(chapter, lesson), pdfStartPage: 2, pdfEndPage: 4, titleMatched: true, candidateAtomIds: ['candidate'], rationale: 'Review only', evidence: [], reviewStatus: 'candidate', approvedAtomIds: [] };
  function load(rows: unknown[], extra: Record<string, unknown> = {}) {
    const qa = resolve(process.cwd(), '../../data/qa'); mkdirSync(qa, { recursive: true }); const root = mkdtempSync(join(qa, 'source-candidates-')), file = join(root, 'candidates.json');
    writeFileSync(file, JSON.stringify({ format: 'textbook-mapping-candidates-v1', sourceIdentityVersion: 'textbook-source-candidate-v1', rows, ...extra })); return loadTextbookSourceCandidates(file);
  }
  const bound = (rows: ReturnType<typeof load>) => boundTextbookSourceCandidate(rows, book, chapter, lesson, source);
  it('uses a current exact binding while preserving candidate-only status', () => { expect(bound(load([valid]))).toEqual(valid); });
  it.each(['bookVersion', 'sourceBookId', 'sourceSha256', 'extractedSha256', 'lessonFingerprint'])('rejects a changed %s', field => {
    const replacement = field.endsWith('Sha256') || field === 'lessonFingerprint' ? 'd'.repeat(64) : 'another-version'; expect(bound(load([{ ...valid, [field]: replacement }]))).toBeNull();
  });
  it('rejects changed combined-part definitions even if a caller reuses the book version', () => {
    const changed = structuredClone(lesson); changed.parts![1].printedPage = 5;
    expect(boundTextbookSourceCandidate(load([valid]), book, chapter, changed, source)).toBeNull();
  });
  it('never accepts an unbound legacy candidate or a forged automatic approval', () => {
    expect(bound(load([valid], { sourceIdentityVersion: undefined }))).toBeNull(); expect(bound(load([{ ...valid, approvedAtomIds: ['candidate'] }]))).toBeNull();
  });
  it('invalidates every duplicate identity, including a malformed duplicate', () => {
    expect(bound(load([valid, { bookId: valid.bookId, lessonId: valid.lessonId }]))).toBeNull(); expect(bound(load([valid, valid, valid]))).toBeNull();
  });
  it.each([[4, 2], [1, 6], [0, 2]])('rejects an invalid physical range %s to %s', (start, end) => { expect(bound(load([{ ...valid, pdfStartPage: start, pdfEndPage: end }]))).toBeNull(); });
});
