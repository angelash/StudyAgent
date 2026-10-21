import { describe, expect, it } from 'vitest';
import type { CurriculumBook, LearningScope } from '@study-agent/contracts';
import { textbookSourceCitations } from './learning-source-citation';

const book: CurriculumBook = {
  id: 'book-1', subject: 'math', grade: 5, term: 'lower', edition: '教研版 2026', title: '五年级数学',
  version: 'book-v7', source: 'archive', sourceRef: 'curriculum/book-1', sourceSha256: 'a'.repeat(64),
  chapterState: 'available', chapters: [{ id: 'chapter-1', name: '分数的加减法', lessons: [{ id: 'lesson-1', name: '异分母分数加法' }] }],
};

const scope = (bookId = book.id): LearningScope => ({
  id: 'scope-1', studentId: 'student-1', subject: 'math', grade: 5, term: 'lower',
  textbookVolumeId: bookId, textbookVersion: 'book-v7', learnedAtomIds: ['core:math:fractionadd'],
  currentAtomId: 'core:math:fractionadd', minutesPerSession: 15, progressMode: 'knowledge', selectedLessonIds: [],
  version: 1, confirmedAt: '2026-10-21T08:00:00.000Z',
  mappingSnapshots: [{ id: 'mapping-1', version: 3, lessonId: 'lesson-1', atomIds: ['core:math:fractionadd'] }],
});

describe('textbook source citations', () => {
  it('freezes a lesson mapping and labels a page locator as an unreviewed candidate', () => {
    const [citation] = textbookSourceCitations(scope(), 'core:math:fractionadd', book, {
      sourceAvailability: { status: 'matched' },
      chapters: [{ name: '分数的加减法', lessons: [{ id: 'lesson-1', name: '异分母分数加法', sourcePageRange: { start: 18, end: 21 } }] }],
    });
    expect(citation).toMatchObject({ chapterName: '分数的加减法', lessonName: '异分母分数加法',
      mappingVersion: 3, pageStart: 18, pageEnd: 21, locatorStatus: 'candidate_needs_review', sourceAvailability: 'matched' });
    expect(citation.note).toContain('尚未完成逐页人工确认');
  });

  it('keeps an approved lesson visible when the page locator is missing', () => {
    const [citation] = textbookSourceCitations(scope(), 'core:math:fractionadd', book, {
      sourceAvailability: { status: 'matched' },
      chapters: [{ name: '分数的加减法', lessons: [{ id: 'lesson-1', name: '异分母分数加法' }] }],
    });
    expect(citation).toMatchObject({ pageStart: null, pageEnd: null, locatorStatus: 'not_located' });
  });

  it('does not attach pages when the book or mapping is outside the frozen scope', () => {
    const detail = { sourceAvailability: { status: 'no_candidate' as const },
      chapters: [{ name: '分数的加减法', lessons: [{ id: 'lesson-1', name: '异分母分数加法' }] }] };
    expect(textbookSourceCitations(scope('other-book'), 'core:math:fractionadd', book, detail)).toEqual([]);
    expect(textbookSourceCitations(scope(), 'core:math:fractionequivalence', book, detail)).toEqual([]);
  });
});
