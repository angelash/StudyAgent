import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const assistantPracticeAssignSchema = z.object({
  studentId: z.string().min(1).max(180), expectedRevision: z.number().int().nonnegative(), contentFingerprint: hash,
  acknowledgePreview: z.literal(true), requestKey: z.string().min(8).max(180),
}).strict();
export type AssistantPracticeAssignInput = z.infer<typeof assistantPracticeAssignSchema>;
export const assistantPracticeAssignmentsQuerySchema = z.object({
  studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english', 'chemistry']),
  pageSize: z.coerce.number().int().min(1).max(30).default(10), cursor: z.string().min(1).max(2000).optional(),
}).strict();
export type AssistantPracticeAssignmentReceipt = {
  assignmentId: string; payloadFingerprint: string; at: string;
};
