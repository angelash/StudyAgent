export type PaperPracticeDisposition = 'answered' | 'dont_know' | 'skip';
export type PaperPracticeSelfReview = 'matches_reference' | 'needs_correction' | 'unsure';
export type PaperPracticeSelection = { paperId: string; positions?: number[] };
export type PaperPracticeAvailability = { available: boolean; reason: string };
export type PaperPracticeItemSummary = {
  id: string; paperId: string; paperTitle: string; position: number; kind: 'question' | 'document' | 'missing';
  availability: PaperPracticeAvailability; disposition: PaperPracticeDisposition | null; revealed: boolean;
  selfReview: PaperPracticeSelfReview | null; correctionCount: number;
};
export type PaperPracticeItemView = PaperPracticeItemSummary & {
  html: string; options: string[]; pdfUrl: string | null; draft: string;
  firstAnswer: { disposition: PaperPracticeDisposition; text: string; submittedAt: string } | null;
  reference: { answerHtml: string; analysisHtml: string; hasAnswer: boolean; missingMedia: number } | null;
  corrections: Array<{ id: string; text: string; at: string }>;
};
export type PaperPracticeSessionView = {
  id: string; ownerUserId: string; studentId: string | null; status: 'in_progress' | 'paused' | 'completed';
  version: number; currentItemId: string; createdAt: string; updatedAt: string; completedAt: string | null;
  permissions: { edit: boolean }; independentMeasurement: false;
  items: PaperPracticeItemSummary[];
  counts: { total: number; submitted: number; unanswered: number; missing: number; unavailable: number; dontKnow: number; skipped: number; needsCorrection: number };
};
export type PaperPracticePreview = {
  sourceHash: string; studentId: string | null; paperCount: number; total: number; answerable: number; missing: number;
  documents: number; unavailable: number; withoutReference: number;
  papers: Array<{ id: string; title: string; state: string; publicationStatus: string; selected: number }>;
};
export type PaperPracticeCommandResult = { requestKey: string; inputHash: string; appliedVersion: number; session: PaperPracticeSessionView };
export type PaperPracticeCreationResult = { requestKey: string; inputHash: string; session: PaperPracticeSessionView };
import { z } from 'zod';

const paperPracticeId = z.string().trim().min(1).max(180), paperPracticeKey = z.string().trim().min(8).max(180);
export const paperPracticeSelectionSchema = z.object({ studentId: paperPracticeId.nullable().optional().default(null), selection: z.array(z.object({ paperId: paperPracticeId,
  positions: z.array(z.number().int().positive()).min(1).max(500).optional() }).strict()).min(1).max(16) }).strict();
export const paperPracticeCreationSchema = paperPracticeSelectionSchema.extend({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/), requestKey: paperPracticeKey }).strict();
const paperPracticeCommandBase = { expectedVersion: z.number().int().positive(), requestKey: paperPracticeKey };
export const paperPracticeCommandSchema = z.discriminatedUnion('kind', [
  z.object({ ...paperPracticeCommandBase, kind: z.literal('draft'), itemId: paperPracticeId, text: z.string().max(24000) }).strict(),
  z.object({ ...paperPracticeCommandBase, kind: z.literal('submit'), itemId: paperPracticeId, disposition: z.enum(['answered', 'dont_know', 'skip']), text: z.string().max(24000) }).strict(),
  z.object({ ...paperPracticeCommandBase, kind: z.literal('reveal'), itemId: paperPracticeId }).strict(),
  z.object({ ...paperPracticeCommandBase, kind: z.literal('self_review'), itemId: paperPracticeId, value: z.enum(['matches_reference', 'needs_correction', 'unsure']) }).strict(),
  z.object({ ...paperPracticeCommandBase, kind: z.literal('correct'), itemId: paperPracticeId, text: z.string().trim().min(1).max(24000) }).strict(),
  z.object({ ...paperPracticeCommandBase, kind: z.literal('navigate'), itemId: paperPracticeId }).strict(),
  z.object({ ...paperPracticeCommandBase, kind: z.enum(['pause', 'resume', 'complete']), acknowledgeUnanswered: z.boolean().optional() }).strict(),
]);
