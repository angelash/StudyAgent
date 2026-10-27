import { z } from 'zod';
import { topicVisualControlSchema, type TopicVisualView } from './topic-whiteboard-visual';

const id = z.string().min(1).max(180), digest = z.string().regex(/^[a-f0-9]{64}$/), requestKey = z.string().min(8).max(180);
export const questionVisualIdSchema = z.string().regex(/^whiteboard_question_visual_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
export const questionTeachingVersionIdSchema = z.union([z.literal('original'), z.string().uuid()]);
export const questionVisualTargetSchema = z.object({ targetKind: z.literal('whiteboard-question'), boardKind: z.enum(['guidance', 'topic']),
  boardId: id, turnId: id, replyFingerprint: digest, definitionHash: digest }).strict();
const fields = { target: questionVisualTargetSchema, purpose: z.enum(['scene', 'concept', 'comparison']), requirements: z.string().trim().min(3).max(1200) };
const generate = z.object({ ...fields, operation: z.literal('generate') }).strict();
const edit = z.object({ ...fields, operation: z.literal('edit'), parentVisualId: questionVisualIdSchema, changes: z.string().trim().min(3).max(1200) }).strict();
export const questionVisualPreflightSchema = z.discriminatedUnion('operation', [generate, edit]);
export const questionVisualGenerateSchema = generate.extend({ preflightFingerprint: digest, requestKey }).strict();
export const questionVisualEditSchema = edit.extend({ preflightFingerprint: digest, requestKey }).strict();
export const questionVisualControlSchema = topicVisualControlSchema;
export const questionVisualAdoptSchema = z.object({ target: questionVisualTargetSchema, visualId: questionVisualIdSchema,
  expectedTeachingVersionId: questionTeachingVersionIdSchema, expectedVisualRevision: z.number().int().nonnegative(),
  originalSha256: digest, imageSha256: digest, alt: z.string().trim().min(3).max(600), caption: z.string().trim().max(600),
  acknowledgeImageReviewed: z.literal(true), requestKey }).strict();
export type QuestionVisualTarget = z.infer<typeof questionVisualTargetSchema>;
export type QuestionVisualPreflightInput = z.infer<typeof questionVisualPreflightSchema>;
export type QuestionVisualPrepareCommand = z.infer<typeof questionVisualGenerateSchema> | z.infer<typeof questionVisualEditSchema>;
export type QuestionVisualAdoptCommand = z.infer<typeof questionVisualAdoptSchema>;
export type QuestionVisualView = Omit<TopicVisualView, 'draftId' | 'sceneIndex' | 'sceneTeachingFingerprint'> & {
  target: QuestionVisualTarget; teachingFingerprint: string; originalSha256: string | null;
};
export type QuestionTeachingVersionView = { id: string; previousVersionId: string | null; replyFingerprint: string; current: boolean;
  figure: { visualId: string; originalSha256: string; imageSha256: string; alt: string; caption: string } | null; createdAt: string };
