import { z } from 'zod';
import { assistantPracticePreflightSchema } from './assistant-practice';
import { assistantNoteListSchema, type AssistantArtifactOrigin } from './assistant-artifact';

const hash = z.string().regex(/^[a-f0-9]{64}$/), key = z.string().min(8).max(180);
export const assistantReviewedPracticeCreateSchema = assistantPracticePreflightSchema.extend({
  contentMode: z.literal('reviewed_bank'), preflightFingerprint: hash, requestKey: key,
}).strict().superRefine((value, context) => {
  if (value.audience.kind !== 'student') context.addIssue({ code: 'custom', path: ['audience'], message: '审核题训练需要明确孩子、学科和原子点；成人请使用本人教学练习' });
});
export type AssistantReviewedPracticeCreateInput = z.infer<typeof assistantReviewedPracticeCreateSchema>;
export const assistantReviewedPracticeEditSchema = z.object({ expectedRevision: z.number().int().nonnegative(),
  contentFingerprint: hash, title: z.string().trim().min(1).max(160), instructions: z.string().trim().min(3).max(3000), requestKey: key,
}).strict();
export type AssistantReviewedPracticeEditInput = z.infer<typeof assistantReviewedPracticeEditSchema>;
export const assistantReviewedPracticeListSchema = assistantNoteListSchema;
export type AssistantReviewedPracticeReceipt = { artifactId: string; kind: 'create' | 'edit'; revision: number;
  contentFingerprint: string; at: string };
export type AssistantReviewedPracticeSummary = { id: string; protocol: 'assistant-practice-artifact-v1'; contentMode: 'reviewed_bank';
  title: string; objective: string; studentId: string; subject: 'math' | 'chinese' | 'english' | 'chemistry'; revision: number;
  contentFingerprint: string; groupCount: number; questionCount: number; createdAt: string; updatedAt: string };
export type AssistantReviewedPracticePage = { items: AssistantReviewedPracticeSummary[]; nextCursor: string | null };
export type AssistantReviewedPracticeSource = { origin: AssistantArtifactOrigin; sourceFingerprint: string };
