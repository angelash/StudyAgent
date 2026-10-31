import { describe, expect, it } from 'vitest';
import type { CurriculumBook } from '@study-agent/contracts';
import { hasTextbookProgressLessons, textbookScopeInventory } from './textbook-scope-inventory';

const book = (id: string, chapters: CurriculumBook['chapters'], extra: Partial<CurriculumBook> = {}): CurriculumBook => ({ id, subject: 'math', grade: 3, term: 'upper', edition: 'QA edition', title: id, version: 'v1', source: 'public_catalog', sourceRef: 'original synthetic fixture', sourceSha256: 'a'.repeat(64), chapterState: 'available', chapters, ...extra });
const chapter = (lessons: CurriculumBook['chapters'][number]['lessons']) => [{ id: 'unit', name: 'Original unit', lessons }];
const availability = () => ({ status: 'matched', reason: 'Edition metadata matches; no local-file or body-review assertion' });
describe('complete textbook scope without invented progress entries', () => {
  it('retains empty, unconfirmed and appendix-only books beside actual lessons and activities', () => {
    const values = [book('empty', []), book('unconfirmed', chapter([{ id: 'maybe', name: 'Unconfirmed' }]), { chapterState: 'missing' }), book('appendix', chapter([{ id: 'reference', name: 'Appendix', kind: 'reference' }])), book('usable', chapter([{ id: 'lesson', name: 'Combined lesson', parts: [{ name: 'Part one', printedPage: 1 }, { name: 'Part two', printedPage: 2 }] }, { id: 'activity', name: 'Activity', kind: 'activity' }, { id: 'ref', name: 'Reference', kind: 'reference' }])), book('original', chapter([{ id: 'atom', name: 'Original atom' }]), { source: 'original' })];
    const before = structuredClone(values), result = textbookScopeInventory(values, availability);
    expect(result.inventory).toEqual({ registeredBooks: 4, booksWithProgressLessons: 1, booksWithoutProgressLessons: 3, progressLessons: 2 });
    expect(result.gaps.map(row => [row.bookId, row.reason])).toEqual([['empty', 'missing_chapters'], ['unconfirmed', 'unconfirmed_chapters'], ['appendix', 'no_progress_lessons']]);
    expect(result.gaps.every(row => row.sourceStatus === 'matched')).toBe(true);
    expect(result.gaps.every(row => !('bodyReviewed' in row) && !('documentAvailable' in row))).toBe(true);
    expect(values).toEqual(before); expect(hasTextbookProgressLessons(values[3])).toBe(true);
  });
  it('keeps a wholly missing or empty scope explicit without creating a fake lesson', () => {
    expect(textbookScopeInventory([], availability)).toEqual({ inventory: { registeredBooks: 0, booksWithProgressLessons: 0, booksWithoutProgressLessons: 0, progressLessons: 0 }, gaps: [] });
    const result = textbookScopeInventory([book('one', []), book('two', [])], availability);
    expect(result.inventory).toEqual({ registeredBooks: 2, booksWithProgressLessons: 0, booksWithoutProgressLessons: 2, progressLessons: 0 }); expect(result.gaps).toHaveLength(2);
  });
});
