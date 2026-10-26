import { z } from 'zod';

const id = z.string().min(1).max(180), digest = z.string().regex(/^[a-f0-9]{64}$/);
const requestKey = z.string().min(8).max(180);
export const topicVisualIdSchema = z.string().regex(/^topic_whiteboard_visual_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
export const topicWhiteboardFigureSchema = z.object({ visualId: topicVisualIdSchema,
  alt: z.string().trim().min(3).max(600), caption: z.string().trim().max(600) }).strict();
const context = { draftId: id, sceneIndex: z.number().int().min(0).max(7), expectedRevision: z.number().int().nonnegative(),
  contentFingerprint: digest, purpose: z.enum(['scene', 'concept', 'comparison']), requirements: z.string().trim().min(3).max(1200) };
const generate = z.object({ ...context, operation: z.literal('generate') }).strict();
const edit = z.object({ ...context, operation: z.literal('edit'), parentVisualId: topicVisualIdSchema,
  changes: z.string().trim().min(3).max(1200) }).strict();
export const topicVisualPreflightSchema = z.discriminatedUnion('operation', [generate, edit]);
export const topicVisualGenerateSchema = generate.extend({ preflightFingerprint: digest, requestKey }).strict();
export const topicVisualEditSchema = edit.extend({ preflightFingerprint: digest, requestKey }).strict();
export const topicVisualControlSchema = z.object({ expectedRevision: z.number().int().nonnegative(), generation: z.number().int().positive(),
  taskVersion: z.number().int().positive(), requestKey }).strict();
export const topicVisualListSchema = z.object({ draftId: id, sceneIndex: z.coerce.number().int().min(0).max(7),
  page: z.coerce.number().int().min(1).max(1000000).default(1), limit: z.coerce.number().int().min(1).max(24).default(12),
  search: z.string().trim().max(120).default('') }).strict();
export type TopicWhiteboardFigure = z.infer<typeof topicWhiteboardFigureSchema>;
export type TopicVisualPreflightInput = z.infer<typeof topicVisualPreflightSchema>;
export type TopicVisualPrepareCommand = z.infer<typeof topicVisualGenerateSchema> | z.infer<typeof topicVisualEditSchema>;
export type TopicVisualCapabilities = { available: boolean; editAvailable: boolean; modelId: 'gpt-image-2';
  reason: 'ready' | 'skill_missing' | 'python_unavailable' | 'environment_unavailable'; message: string };
export type TopicVisualView = {
  id: string; draftId: string; sceneIndex: number; sceneTeachingFingerprint: string;
  purpose: TopicVisualPreflightInput['purpose']; requirements: string; operation: 'generate' | 'edit';
  parentVisualId: string | null; changes: string | null; modelId: 'gpt-image-2'; revision: number;
  status: 'queued' | 'generating' | 'ready' | 'failed' | 'cancelling' | 'cancelled' | 'deleted';
  selected: boolean; currentTeaching: boolean; contentReview: 'pending';
  imageUrl: string | null; sha256: string | null; width: number | null; height: number | null;
  createdAt: string; updatedAt: string;
  task: { state: string; version: number; generation: number; errorCode: string | null } | null;
  receipt?: { key: string; kind: 'prepare' | 'cancel' | 'retry'; commandFingerprint: string;
    effectiveRevision: number; generation: number; at: string };
};
