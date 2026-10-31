import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type { CurriculumBook, CurriculumChapter, CurriculumLesson } from '@study-agent/contracts';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/), key = z.string().min(1).max(180);
const candidateSchema = z.object({
  bookId: key, bookVersion: key, sourceBookId: key, sourceSha256: sha256, extractedSha256: sha256, lessonId: key, lessonFingerprint: sha256,
  pdfStartPage: z.number().int().min(1), pdfEndPage: z.number().int().min(1), titleMatched: z.boolean(),
  candidateAtomIds: z.array(key).max(30), rationale: z.string().max(2000), evidence: z.array(z.unknown()).max(30),
  reviewStatus: z.enum(['candidate', 'unreviewed']), approvedAtomIds: z.array(z.never()).length(0),
}).passthrough();
export type TextbookSourceCandidate = z.infer<typeof candidateSchema>;
export const canonicalSource = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalSource).join(',') + ']';
  return '{' + Object.entries(value).filter(([, value]) => value !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => JSON.stringify(key) + ':' + canonicalSource(value)).join(',') + '}';
};
export const sourceFingerprint = (value: unknown) => createHash('sha256').update(canonicalSource(value)).digest('hex');
export const lessonSourceFingerprint = (chapter: CurriculumChapter, lesson: CurriculumLesson) => sourceFingerprint({ chapterId: chapter.id, chapterName: chapter.name, lesson });

export function loadTextbookSourceCandidates(file: string) {
  const rows = new Map<string, TextbookSourceCandidate>(), seen = new Set<string>();
  if (!existsSync(file)) return rows;
  const document = JSON.parse(readFileSync(file, 'utf8'));
  if (document.format !== 'textbook-mapping-candidates-v1' || document.sourceIdentityVersion !== 'textbook-source-candidate-v1' || !Array.isArray(document.rows)) return rows;
  for (const raw of document.rows) {
    const parsed = candidateSchema.safeParse(raw), identity = raw && typeof raw.bookId === 'string' && typeof raw.lessonId === 'string' ? `${raw.bookId}:${raw.lessonId}` : null;
    if (!identity) continue;
    if (seen.has(identity)) { rows.delete(identity); continue; }
    seen.add(identity);
    if (parsed.success) rows.set(identity, parsed.data);
  }
  return rows;
}

export function boundTextbookSourceCandidate(rows: Map<string, TextbookSourceCandidate>, book: CurriculumBook,
  chapter: CurriculumChapter, lesson: CurriculumLesson, source: { id: string; sha256: string; extractedSha256?: string; pages: number } | null) {
  const row = rows.get(`${book.id}:${lesson.id}`);
  if (!row || !source || lesson.kind === 'reference' || book.chapterState !== 'available' || row.bookVersion !== book.version ||
    row.sourceBookId !== source.id || row.sourceSha256 !== source.sha256 || row.extractedSha256 !== source.extractedSha256 ||
    row.lessonFingerprint !== lessonSourceFingerprint(chapter, lesson) || row.pdfStartPage > row.pdfEndPage || row.pdfEndPage > source.pages) return null;
  return row;
}
