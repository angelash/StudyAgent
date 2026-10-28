import { z } from 'zod';
import type { UserRole } from './index';
import { assistantArtifactSelectionSchema, type AssistantArtifactOrigin } from './assistant-artifact';
import { topicWhiteboardContentSchema } from './topic-whiteboard';

export const assistantWhiteboardPreflightSchema = z.object({
  selection: assistantArtifactSelectionSchema,
  objective: z.string().trim().min(3).max(500),
  modelId: z.string().trim().min(1).max(160).optional(),
  acknowledgeHistoricalSource: z.boolean().default(false),
}).strict();
export type AssistantWhiteboardPreflightInput = z.infer<typeof assistantWhiteboardPreflightSchema>;
export type AssistantWhiteboardAudience = {
  kind: 'assistant'; actorRole: UserRole; studentId: string | null; subject: string | null;
  sourceKind: 'independent' | 'classroom_lecture' | 'primary_unit' | 'material_lesson';
  courseGrade: number | null; profileGrade: number | null;
};
export type AssistantWhiteboardPreflight = {
  protocol: 'assistant-topic-whiteboard-v1'; origin: AssistantArtifactOrigin; audience: AssistantWhiteboardAudience;
  objective: string; modelId: string; modelName: string; available: boolean;
  sourceFingerprint: string; fingerprint: string; contextCharacters: number; maxContextCharacters: 18000;
  fits: boolean; historical: boolean; canGenerate: boolean;
  blocked?: { code: 'source_budget_exceeded' | 'historical_source_confirmation_required' | 'model_unavailable'; message: string };
};

export const assistantWhiteboardSourceMapSchema = z.object({
  messageIds: z.array(z.string().min(1).max(180)).max(20)
    .refine(values => new Set(values).size === values.length, '原消息不能重复'),
  referenceKeys: z.array(z.string().min(1).max(180)).max(40)
    .refine(values => new Set(values).size === values.length, '原引用不能重复'),
  status: z.enum(['sourced', 'supplementary']), explanation: z.string().trim().min(3).max(600),
}).strict().superRefine((value, context) => {
  if (value.status === 'sourced' && !value.messageIds.length)
    context.addIssue({ code: 'custom', path: ['messageIds'], message: '原文支持需要对应原消息' });
  if (value.status === 'supplementary' && value.referenceKeys.length)
    context.addIssue({ code: 'custom', path: ['referenceKeys'], message: '新增解释不能冒充原文引用' });
});
// The ordinary v1 schema remains strict and cannot accept private source fields.
export const assistantWhiteboardContentSchema = topicWhiteboardContentSchema.safeExtend({
  scenes: z.array(topicWhiteboardContentSchema.shape.scenes.element.extend({ sourceMap: assistantWhiteboardSourceMapSchema })).min(3).max(8),
});
export type AssistantWhiteboardSourceMap = z.infer<typeof assistantWhiteboardSourceMapSchema>;
export type AssistantWhiteboardContent = z.infer<typeof assistantWhiteboardContentSchema>;
