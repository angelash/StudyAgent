import type { CurriculumBook } from '@study-agent/contracts';
import { registryEditionFingerprint, sourceTextHash, type EditionSourceIdentity, type TextbookEditionConformity } from './textbook-edition-conformity';
import { lessonSourceFingerprint } from './textbook-source-candidates';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceFingerprint } from './textbook-source-candidates';

/** Generated engineering records only. Never use this to approve a real book. */
export function syntheticEditionConformity(book: CurriculumBook, source: EditionSourceIdentity, pages: Array<{ page: number; text: string }>): TextbookEditionConformity {
  book.sourceEdition = { sourceBookId: source.id, sourceSha256: source.sha256, publicationYear: null, curriculumStandardYear: null,
    publicationStatement: 'Generated undated engineering source only; no real bibliography or visual review is asserted.' };
  const evidence = { page: pages[0].page, textSha256: sourceTextHash(pages[0].text), imageSha256: 'e'.repeat(64) };
  return { protocol: 'textbook-edition-conformity-v1', bookId: book.id, bookVersion: book.version, registryFingerprint: registryEditionFingerprint(book),
    sourceBookId: source.id, sourceSha256: source.sha256, extractedSha256: source.extractedSha256!, sourcePages: source.pages,
    edition: { publicationYear: null, curriculumStandardYear: null, independentlyRegistered: true,
      statement: book.sourceEdition.publicationStatement, pages: [evidence] },
    directory: { complete: true, pages: [evidence], entries: book.chapters.flatMap(chapter => chapter.lessons.map(lesson => ({
      chapterId: chapter.id, lessonId: lesson.id, lessonFingerprint: lessonSourceFingerprint(chapter, lesson),
      physicalStartPage: 1, physicalEndPage: source.pages }))) },
    review: { method: 'agent_visual_review', reviewerRef: 'generated-engineering-fixture', reviewedAt: '2026-11-01T00:00:00.000Z',
      statement: 'Synthetic protocol fixture only. No real textbook, teacher, or visual review is asserted.' } };
}

/** Retrofits generated HTTP fixtures, preserving all source corruption probes.
 * This helper is only imported by tests, never by a product module. */
export function installSyntheticEditionConformities(directory: string) {
  const registryFile = join(directory, 'registry.json'), manifestFile = join(directory, 'manifest.json'),
    registry = JSON.parse(readFileSync(registryFile, 'utf8')), manifest = JSON.parse(readFileSync(manifestFile, 'utf8')), proofs: TextbookEditionConformity[] = [];
  for (const book of registry.books as CurriculumBook[]) {
    const source = manifest.books.find((source: any) => source.edition === book.edition && source.grade === book.grade && source.term === book.term);
    if (!source) continue;
    source.subject ??= book.subject; source.extractedSha256 ??= 'c'.repeat(64);
    let pages = [{ page: 1, text: '' }];
    if (source.extractedPath) pages = JSON.parse(readFileSync(join(directory, 'assets', source.extractedPath.replace('data/assets/', '')), 'utf8')).pages;
    const proof = syntheticEditionConformity(book, source, pages); proofs.push(proof);
  }
  writeFileSync(registryFile, JSON.stringify(registry)); writeFileSync(manifestFile, JSON.stringify(manifest));
  const file = join(directory, 'conformities.json'); writeFileSync(file, JSON.stringify({ format: 'textbook-edition-conformities-v1', rows: proofs }));
  process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES = file;
  return new Map(proofs.map(proof => [proof.bookId, sourceFingerprint(proof)]));
}
