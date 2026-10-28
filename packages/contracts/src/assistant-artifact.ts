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

const noteTitle = z.string().trim().min(1).max(160);
const noteKey = z.string().min(8).max(180);
const noteHash = z.string().regex(/^[a-f0-9]{64}$/);
export const assistantNoteCreateSchema = assistantArtifactPreflightSchema.extend({
  title: noteTitle, preflightFingerprint: noteHash, requestKey: noteKey,
}).strict();
export const assistantNoteEditSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), title: noteTitle,
  // A note is a verbatim document: leading/trailing whitespace is meaningful.
  markdown: z.string().min(1).max(30000), requestKey: noteKey,
}).strict();
export const assistantNoteConfirmSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), contentFingerprint: noteHash,
  acknowledgeReview: z.literal(true), requestKey: noteKey,
}).strict();
export const assistantNoteListSchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(1000).optional(),
}).strict();
export type AssistantNoteReceipt = {
  noteId: string; kind: 'create' | 'edit' | 'confirm'; revision: number;
  status: 'ready' | 'confirmed'; contentFingerprint: string; at: string;
};
export type AssistantNoteSummary = {
  id: string; kind: 'verbatim_note'; title: string; status: 'ready' | 'confirmed'; revision: number;
  contentFingerprint: string; createdAt: string; updatedAt: string; confirmedAt: string | null;
};
export type AssistantNote = AssistantNoteSummary & {
  protocol: 'assistant-verbatim-note-v1'; objective: string; markdown: string;
  sourceFingerprint: string; origin: AssistantArtifactOrigin;
};
export type AssistantNotePage = { items: AssistantNoteSummary[]; nextCursor: string | null };
export type AssistantNoteExport = { filename: string; mime: string; content: string };
