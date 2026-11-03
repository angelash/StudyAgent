import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CurriculumBook } from '@study-agent/contracts';
import { lessonSourceFingerprint, sourceFingerprint } from './textbook-source-candidates';

const key = z.string().min(1).max(180), hash = z.string().regex(/^[a-f0-9]{64}$/), page = z.number().int().min(1).max(10000);
const pageEvidence = z.object({ page, textSha256: hash, imageSha256: hash }).strict();
/** A controlled, independently reviewed whole-book record. A locator, matching
 * first lesson, or matching year is never a conformity record. */
export const textbookEditionConformitySchema = z.object({
  protocol: z.literal('textbook-edition-conformity-v1'), bookId: key, bookVersion: key, registryFingerprint: hash,
  sourceBookId: key, sourceSha256: hash, extractedSha256: hash, sourcePages: page,
  edition: z.object({ publicationYear: z.number().int().min(1900).max(2199).nullable(),
    curriculumStandardYear: z.number().int().min(1900).max(2199).nullable(),
    independentlyRegistered: z.boolean(), statement: z.string().min(20).max(2000), pages: z.array(pageEvidence).min(1).max(20) }).strict(),
  directory: z.object({ complete: z.literal(true), pages: z.array(pageEvidence).min(1).max(40),
    entries: z.array(z.object({ chapterId: key, lessonId: key, lessonFingerprint: hash,
      physicalStartPage: page, physicalEndPage: page }).strict()).min(1).max(2000) }).strict(),
  review: z.object({ method: z.enum(['agent_visual_review', 'human_visual_review']), reviewerRef: key,
    reviewedAt: z.string().datetime(), statement: z.string().min(20).max(2000) }).strict(),
}).strict();
export type TextbookEditionConformity = z.infer<typeof textbookEditionConformitySchema>;
export type EditionSourceIdentity = { id: string; sha256: string; extractedSha256?: string; pages: number; subject: string; grade: number; term: string };
export const registryEditionFingerprint = (book: CurriculumBook) => sourceFingerprint({ id: book.id, version: book.version,
  subject: book.subject, grade: book.grade, term: book.term, title: book.title, edition: book.edition,
  sourceEdition: book.sourceEdition, chapterState: book.chapterState, chapters: book.chapters });

export function readEditionConformities(file: string): TextbookEditionConformity[] {
  if (!existsSync(file)) return [];
  try {
    const document = JSON.parse(readFileSync(file, 'utf8'));
    if (document.format !== 'textbook-edition-conformities-v1' || !Array.isArray(document.rows)) return [];
    // Keep malformed duplicates as invalid records, never let a valid sibling
    // silently win the same exact book/version identity.
    return document.rows;
  } catch { return []; }
}

/** A negative finding grants no permission; it only explains a pinned mismatch. */
export function readEditionDiscrepancies(file: string): unknown[] {
  try {
    const document = JSON.parse(readFileSync(file, 'utf8'));
    return document.format === 'textbook-edition-conformities-v1' && Array.isArray(document.discrepancies) ? document.discrepancies : [];
  } catch { return []; }
}

export function editionDiscrepancy(file: string, book: CurriculumBook, sources: EditionSourceIdentity[], snapshot = readEditionDiscrepancies(file)) {
  try {
    const rows = snapshot.filter((row: any) => row?.bookId === book.id && row?.bookVersion === book.version &&
      row.registryFingerprint === registryEditionFingerprint(book) && typeof row.reason === 'string' && row.reason.length <= 2000 &&
      sources.some(source => source.id === row.sourceBookId && source.sha256 === row.sourceSha256 && source.extractedSha256 === row.extractedSha256));
    const row = rows[0] as { reason: string; sourceBookId: string } | undefined;
    return rows.length === 1 && row ? { reason: row.reason, sourceBookId: row.sourceBookId } : null;
  } catch { return null; }
}

export function editionConformity(book: CurriculumBook, sources: EditionSourceIdentity[], raw: unknown[]) {
  const identity = raw.filter((row: any) => row?.bookId === book.id && row?.bookVersion === book.version);
  const fail = (reason: string) => ({ status: 'edition_unverified' as const, reason, proof: null, fingerprint: null, source: null });
  if (identity.length !== 1) return fail(identity.length ? '整册版本核对记录重复，须人工核对准确教材和原件' : '尚未核对整册目录和版次依据；同名原件仅可作为参考');
  const parsed = textbookEditionConformitySchema.safeParse(identity[0]);
  if (!parsed.success) return fail('整册版本核对记录不完整，不能按准确版本使用原件');
  const proof = parsed.data, matches = sources.filter(source => source.id === proof.sourceBookId && source.sha256 === proof.sourceSha256 &&
    source.extractedSha256 === proof.extractedSha256 && source.pages === proof.sourcePages && source.subject === book.subject && source.grade === book.grade && source.term === book.term);
  if (matches.length !== 1 || proof.registryFingerprint !== registryEditionFingerprint(book) || book.chapterState !== 'available') return fail('当前教材目录或完整原件身份与整册核对记录不同，请重新核对');
  const declared = book.sourceEdition;
  if (!declared || declared.sourceBookId !== proof.sourceBookId || declared.sourceSha256 !== proof.sourceSha256 ||
      declared.publicationYear !== proof.edition.publicationYear || declared.curriculumStandardYear !== proof.edition.curriculumStandardYear ||
      proof.edition.publicationYear === null && (!proof.edition.independentlyRegistered || typeof declared.publicationStatement !== 'string' || !declared.publicationStatement.trim()))
    return fail('版次依据未单独登记；课程标准年份不能代替出版版次，版次不明须登记为独立版本');
  const lessons = book.chapters.flatMap(chapter => chapter.lessons.map(lesson => ({ chapter, lesson }))), ids = new Set(lessons.map(({ lesson }) => lesson.id));
  if (ids.size !== lessons.length || new Set(book.chapters.map(chapter => chapter.id)).size !== book.chapters.length || proof.directory.entries.length !== lessons.length)
    return fail('整册目录存在重复身份或缺项，不能唯一对应每个课时');
  for (let index = 0; index < lessons.length; index++) {
    const { chapter, lesson } = lessons[index], row = proof.directory.entries[index];
    if (row.chapterId !== chapter.id || row.lessonId !== lesson.id || row.lessonFingerprint !== lessonSourceFingerprint(chapter, lesson) ||
        row.physicalEndPage < row.physicalStartPage || row.physicalEndPage > proof.sourcePages ||
        index > 0 && row.physicalStartPage < proof.directory.entries[index - 1].physicalStartPage)
      return fail('原件整册目录的课题、顺序或物理页段与登记目录不符');
  }
  for (const group of [proof.directory.pages, proof.edition.pages]) if (new Set(group.map(row => row.page)).size !== group.length ||
      group.some((row, index) => row.page > proof.sourcePages || index > 0 && row.page <= group[index - 1].page))
    return fail('目录页或版次依据页的完整核对记录无效');
  return { status: 'matched' as const, reason: '整册目录、逐课身份和独立版次依据已绑定当前完整原件；教学内容仍须逐课审核',
    proof, fingerprint: sourceFingerprint(proof), source: matches[0] };
}

export function assertConformityExtraction(proof: TextbookEditionConformity, pages: Array<{ page: number; text: string }>) {
  for (const evidence of [...proof.directory.pages, ...proof.edition.pages]) {
    const current = pages[evidence.page - 1];
    // Text hashes cover full physical pages. Image hashes preserve the separate
    // visual review artifact; an extraction hash alone never claims visual QA.
    if (!current || current.page !== evidence.page || sourceTextHash(current.text) !== evidence.textSha256) throw Error('edition_evidence_page_changed');
  }
}
export const sourceTextHash = (text: string) => createHash('sha256').update(text).digest('hex');
