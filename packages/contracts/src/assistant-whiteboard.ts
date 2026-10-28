import { z } from 'zod';
import type { UserRole } from './index';
import { assistantArtifactSelectionSchema, type AssistantArtifactOrigin } from './assistant-artifact';

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
