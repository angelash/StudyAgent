import { z } from 'zod';
import type { StudioSubject, StudioWhiteboardScene } from './studio';

const id = z.string().min(1).max(180), digest = z.string().regex(/^[a-f0-9]{64}$/);
const requestKey = z.string().min(8).max(180);
export const topicWhiteboardAudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('adult') }).strict(),
  z.object({ kind: z.literal('student'), studentId: id, subject: z.enum(['math', 'chinese', 'english']),
    atomIds: z.array(id).min(1).max(6).refine(values => new Set(values).size === values.length, '不能重复选择目标') }).strict(),
]);
export const topicWhiteboardInputSchema = z.object({
  audience: topicWhiteboardAudienceSchema, prompt: z.string().trim().min(3).max(2000),
  objective: z.string().trim().min(3).max(1000), modelId: z.string().trim().min(1).max(160).optional(),
}).strict();
export const topicWhiteboardCreateSchema = topicWhiteboardInputSchema.extend({ preflightFingerprint: digest, requestKey }).strict();
const table = z.object({ kind: z.literal('table'), headers: z.array(z.string().trim().min(1).max(120)).min(2).max(5),
  rows: z.array(z.array(z.string().trim().min(1).max(240)).min(2).max(5)).min(1).max(12) }).strict()
  .refine(value => value.rows.every(row => row.length === value.headers.length), '表格每行需要与表头列数一致');
const formula = z.object({ kind: z.literal('formula'), latex: z.string().trim().min(1).max(600),
  explanation: z.string().trim().min(1).max(1000) }).strict();
export const topicWhiteboardContentSchema = z.object({
  title: z.string().trim().min(1).max(120), description: z.string().trim().min(3).max(600),
  scenes: z.array(z.object({ kind: z.enum(['title', 'concept', 'steps', 'check']), title: z.string().trim().min(1).max(120),
    narration: z.string().trim().min(3).max(1800), body: z.string().trim().max(1000),
    bullets: z.array(z.string().trim().min(1).max(240)).max(6), targetAtomIds: z.array(id).max(6),
    exhibit: z.union([table, formula, z.null()]),
  }).strict()).min(3).max(8),
}).strict().superRefine((value, context) => {
  if (JSON.stringify(value).length > 22000) context.addIssue({ code: 'custom', message: '白板全文超过预算，请减少范围' });
  value.scenes.forEach((scene, index) => {
    if (new Set(scene.targetAtomIds).size !== scene.targetAtomIds.length) context.addIssue({ code: 'custom', path: ['scenes', index, 'targetAtomIds'], message: '目标不能重复' });
    if (scene.bullets.some(bullet => !scene.narration.includes(bullet))) context.addIssue({ code: 'custom', path: ['scenes', index, 'bullets'], message: '完整要点需要对应到这一幕的原讲述' });
  });
});
export const topicWhiteboardControlSchema = z.object({ expectedRevision: z.number().int().nonnegative(), generation: z.number().int().positive(),
  taskVersion: z.number().int().positive(), requestKey }).strict();
export const topicWhiteboardEditSchema = z.object({ expectedRevision: z.number().int().nonnegative(), contentFingerprint: digest,
  content: topicWhiteboardContentSchema, requestKey }).strict();
export const topicWhiteboardConfirmSchema = z.object({ expectedRevision: z.number().int().nonnegative(), contentFingerprint: digest,
  acknowledgeAiGeneratedContent: z.literal(true), acknowledgeUnreviewedChanges: z.boolean(), requestKey }).strict();

export type TopicWhiteboardAudience = z.infer<typeof topicWhiteboardAudienceSchema>;
export type TopicWhiteboardInput = z.infer<typeof topicWhiteboardInputSchema>;
export type TopicWhiteboardContent = z.infer<typeof topicWhiteboardContentSchema>;
export type TopicWhiteboardReview = { decision: 'pass' | 'revised' | 'uncertain'; issues: string[]; modelId: string;
  inputFingerprint: string; outputFingerprint: string; at: string; current: boolean };
export type TopicWhiteboardDraftStatus = 'queued' | 'generating' | 'ready' | 'failed' | 'cancelling' | 'cancelled' | 'confirmed';
export type TopicWhiteboardDraftView = {
  id: string; audience: TopicWhiteboardAudience; studentId: string | null; subject: StudioSubject | null;
  prompt: string; objective: string; modelId: string; modelName: string | null;
  status: TopicWhiteboardDraftStatus; stage: 'writing' | 'reviewing' | 'completed'; revision: number; generation: number;
  task: { id: string; version: number; state: string } | null;
  originalContent: TopicWhiteboardContent | null; content: TopicWhiteboardContent | null;
  contentFingerprint: string | null; review: TopicWhiteboardReview | null; whiteboardId: string | null;
  teacherReviewStatus: 'pending'; formalMeasurementEligible: false; createdAt: string; updatedAt: string;
};
export type StudioTopicWhiteboard = {
  id: string; kind: 'ai-topic-whiteboard'; studentId: string | null; subject: StudioSubject | null;
  title: string; prompt: string; scenes: StudioWhiteboardScene[]; durationMs: number; width: number; height: number;
  fingerprint: string; createdAt: string; updatedAt: string;
  origin: { draftId: string | null; modelId: string; modelName: string; review: TopicWhiteboardReview | null;
    teacherReviewStatus: 'pending'; formalMeasurementEligible: false };
};
