import type { CurriculumBook, TextbookScopeBookGap, TextbookScopeInventory } from '@study-agent/contracts';

export const hasTextbookProgressLessons = (book: CurriculumBook) => book.chapterState === 'available' &&
  book.chapters.some(chapter => chapter.lessons.some(lesson => lesson.kind !== 'reference'));

/** Preserve missing whole books alongside the existing lesson worklist.
 * A combined lesson is one entry; its parts and appendices add no progress. */
export function textbookScopeInventory(books: readonly CurriculumBook[], availability: (book: CurriculumBook) => { status: string; reason: string }) {
  const imported = books.filter(book => book.source !== 'original'), gaps: TextbookScopeBookGap[] = [];
  let progressBooks = 0, progressLessons = 0;
  for (const book of imported) {
    if (hasTextbookProgressLessons(book)) {
      progressBooks++; progressLessons += book.chapters.reduce((sum, chapter) => sum + chapter.lessons.filter(lesson => lesson.kind !== 'reference').length, 0);
    } else {
      const source = availability(book);
      gaps.push({ bookId: book.id, bookTitle: book.title, bookVersion: book.version, edition: book.edition, chapterState: book.chapterState,
        reason: !book.chapters.length ? 'missing_chapters' : book.chapterState !== 'available' ? 'unconfirmed_chapters' : 'no_progress_lessons',
        sourceStatus: source.status, sourceReason: source.reason });
    }
  }
  const inventory: TextbookScopeInventory = { registeredBooks: imported.length, booksWithProgressLessons: progressBooks, booksWithoutProgressLessons: gaps.length, progressLessons };
  return { inventory, gaps };
}
