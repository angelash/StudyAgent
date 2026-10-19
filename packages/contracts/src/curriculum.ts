import { z } from 'zod';

const key = z.string().min(1).max(180);
export type CurriculumBook = {
  id: string; subject: 'math' | 'chinese' | 'english'; grade: number; term: 'upper' | 'lower';
  edition: string; title: string; version: string; source: 'archive' | 'public_catalog' | 'original';
  sourceRef: string; sourceSha256: string; chapterState: 'available' | 'missing';
  chapters: Array<{ id: string; name: string; lessons: Array<{ id: string; name: string }> }>;
};

export const textbookMappingInputSchema = z.object({
  bookId: key, lessonId: key, atomIds: z.array(key).min(1).max(30),
  status: z.enum(['candidate', 'approved', 'rejected']),
  rationale: z.string().trim().min(8).max(2000),
}).strict();
export type TextbookAtomMapping = z.infer<typeof textbookMappingInputSchema> & {
  id: string; bookVersion: string; version: number; reviewerId: string; reviewedAt: string;
};

export type CurriculumRevision = {
  id: string; entityId: string; kind: 'atom' | 'measurement' | 'textbook'; version: number;
  actorId: string; at: string; snapshot: unknown;
};
