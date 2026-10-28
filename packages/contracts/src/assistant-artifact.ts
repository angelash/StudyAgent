import { z } from 'zod';
import type { AssistantCourseSummary, AssistantLectureSummary, AssistantLocation, AssistantReplySource, AssistantSourceReference, AssistantTeachingCoverage, AssistantTeachingSelection } from './assistant-turn';

const messageId = z.string().min(1).max(180);
export const assistantArtifactSelectionSchema = z.object({
  messageIds: z.array(messageId).min(1).max(20).refine(ids => new Set(ids).size === ids.length, '请移除重复的原消息'),
  includeLinkedQuestions: z.boolean().default(false),
}).strict();

// Additional artifact kinds have their own generation/adoption gates and are not yet accepted here.
export const assistantArtifactPreflightSchema = z.object({
  kind: z.literal('verbatim_note'),
  selection: assistantArtifactSelectionSchema,
  objective: z.string().trim().min(1).max(500),
}).strict();
export type AssistantArtifactPreflightInput = z.infer<typeof assistantArtifactPreflightSchema>;
export type AssistantArtifactSourceMessage = {
  id: string; sender: 'user' | 'assistant'; content: string; createdAt: string; sequence: number; contentSha256: string;
  inReplyTo: string | null; source: AssistantReplySource | null; modelId: string | null; modelName: string | null;
  sourceReferences: AssistantSourceReference[];
};
export type AssistantArtifactTeachingScope = {
  grade: number | null; term: 'upper' | 'lower' | null; scopeVersion: number | null; textbookVersion: string | null;
  courseVersion: string; teachingFingerprint: string; selection: AssistantTeachingSelection; coverage: AssistantTeachingCoverage;
};
export type AssistantArtifactOrigin = {
  protocol: 'assistant-artifact-origin-v1'; sessionId: string; studentId: string | null; subject: string | null;
  location: AssistantLocation; course?: AssistantCourseSummary; lecture?: AssistantLectureSummary; teachingScope?: AssistantArtifactTeachingScope;
  selection: { requestedMessageIds: string[]; includeLinkedQuestions: boolean; messageIds: string[]; linkedQuestionIds: string[] };
  messages: AssistantArtifactSourceMessage[];
};
export type AssistantArtifactPreflight = {
  kind: 'verbatim_note'; objective: string; origin: AssistantArtifactOrigin;
  fingerprint: string; contextCharacters: number; maxContextCharacters: 18000; fits: boolean;
  blocked?: { code: 'source_budget_exceeded'; message: string };
};
