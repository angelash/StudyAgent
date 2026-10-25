import { z } from 'zod';

export const ANSWER_DRAFT_PROTOCOL = 'answer-draft-v2' as const;
export const answerDraftFenceSchema = z.object({
  actorId: z.string().min(1).max(180), revision: z.number().int().min(0), baseHash: z.string().regex(/^[a-f0-9]{64}$/), attempt: z.number().int().min(0).max(5),
}).strict();
export const answerDraftSaveSchema = z.union([
  z.object({ answer: z.unknown(), protocol: z.literal(ANSWER_DRAFT_PROTOCOL),
    actorId: z.string().min(1).max(180),
    expectedRevision: z.number().int().min(0), baseHash: z.string().regex(/^[a-f0-9]{64}$/),
    attempt: z.number().int().min(0).max(5), requestKey: z.string().min(8).max(180) }).strict(),
  z.object({ answer: z.unknown() }).strict(),
]);
export type AnswerDraftSave = z.infer<typeof answerDraftSaveSchema>;
export type AnswerDraftFence = z.infer<typeof answerDraftFenceSchema>;
/** Storage metadata is never returned as the legacy draft or exported command history. */
export type AnswerDraftMetadata = {
  revision?: number; protocol?: typeof ANSWER_DRAFT_PROTOCOL; draftAttempt?: number;
  draftCommands?: Array<{ actorId: string; key: string; requestHash: string; revision: number; savedAt: string }>;
};
export type AnswerDraftState = AnswerDraftFence & {
  protocol: typeof ANSWER_DRAFT_PROTOCOL; savedAt: string | null; editable: boolean; hasSubmission: boolean;
};
export type AnswerDraftReceipt = {
  saved: true; updatedAt: string; savedAt: string; acknowledgedRevision: number; currentRevision: number;
  draftState: AnswerDraftState;
};
