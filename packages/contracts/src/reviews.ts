import { z } from 'zod';

export const evidenceKindSchema = z.enum(['diagnostic', 'practice']);
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export const rubricRatingSchema = z.object({
  criterionIndex: z.number().int().min(0).max(99),
  score: z.number().min(0).max(1),
  observation: z.string().trim().min(1).max(1000),
}).strict();
export type RubricRating = z.infer<typeof rubricRatingSchema>;
export const scoringReviewInputSchema = z.object({
  expectedVersion: z.number().int().min(0), requestKey: z.string().min(1).max(180),
  reason: z.string().trim().min(5).max(2000),
  ratings: z.array(rubricRatingSchema).min(1).max(100).optional(),
  score: z.number().min(0).max(1).optional(),
}).strict();
export type ScoringReviewInput = z.infer<typeof scoringReviewInputSchema>;
export type TeacherStudentAssignment = {
  id: string; studentId: string; teacherUserId: string; grantedBy: string;
  permission: 'scoring_review'; status: 'active' | 'revoked';
  createdAt: string; revokedAt: string | null; revokedBy: string | null;
};
export const evidenceFeedbackInputSchema = z.object({
  kind: evidenceKindSchema, responseId: z.string().min(1).max(500),
  category: z.enum(['grading', 'ambiguous_question', 'display', 'learning_context', 'other']),
  message: z.string().trim().min(5).max(3000), requestKey: z.string().min(1).max(180),
}).strict();
export type EvidenceFeedback = {
  id: string; kind: EvidenceKind; responseId: string; studentId: string;
  subject: 'math' | 'chinese' | 'english'; createdBy: string;
  category: z.infer<typeof evidenceFeedbackInputSchema>['category']; message: string;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  version: number; requestKey: string; createdAt: string; updatedAt: string;
  history: Array<{ status: EvidenceFeedback['status']; note: string; actorId: string; at: string; version: number }>;
};
