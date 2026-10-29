import { z } from 'zod';
import { answerDraftFenceSchema } from './answer-draft';

export const ASSISTANT_PRACTICE_ANSWER_PROTOCOL = 'assistant-practice-answer-v1' as const;
const key = z.string().min(8).max(180), hash = z.string().regex(/^[a-f0-9]{64}$/);
export const assistantPracticeGroupStartSchema = z.object({ assignmentFingerprint: hash, requestKey: key }).strict();
export const assistantPracticeLearnerDraftSchema = z.object({
  protocol: z.literal(ASSISTANT_PRACTICE_ANSWER_PROTOCOL), actorId: z.string().min(1).max(180),
  expectedRevision: z.number().int().nonnegative(), baseHash: hash, attempt: z.number().int().min(0).max(5),
  answer: z.unknown(), learnerExplanation: z.string().max(3000), requestKey: key,
}).strict();
export const assistantPracticeLearnerResponseSchema = z.object({
  protocol: z.literal(ASSISTANT_PRACTICE_ANSWER_PROTOCOL), questionId: z.string().min(1).max(180), requestKey: key,
  answer: z.unknown().optional(), learnerExplanation: z.string().trim().max(3000),
  disposition: z.enum(['answered', 'skip']), elapsedMs: z.number().int().min(0).max(3600000), draftFence: answerDraftFenceSchema,
}).strict().superRefine((value, context) => {
  if (value.disposition === 'answered' && !value.learnerExplanation)
    context.addIssue({ code: 'custom', path: ['learnerExplanation'], message: '请说明判断理由，或明确写暂不清楚；原答案仍可保留' });
});
export const assistantPracticeHelpSchema = z.object({ protocol: z.literal(ASSISTANT_PRACTICE_ANSWER_PROTOCOL),
  kind: z.enum(['hint', 'solution', 'guardian_demonstration']), expectedAttempt: z.number().int().min(0).max(5), baseHash: hash, requestKey: key,
}).strict();
export const assistantPracticeCompleteSchema = z.object({ protocol: z.literal(ASSISTANT_PRACTICE_ANSWER_PROTOCOL),
  completionFingerprint: hash, requestKey: key,
}).strict();
export type AssistantPracticeHelpInput = z.infer<typeof assistantPracticeHelpSchema>;
export type AssistantPracticeCompleteInput = z.infer<typeof assistantPracticeCompleteSchema>;
export type AssistantPracticeGroupStartInput = z.infer<typeof assistantPracticeGroupStartSchema>;
