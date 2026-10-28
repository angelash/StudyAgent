import { z } from 'zod';
import { assistantArtifactSelectionSchema, type AssistantArtifactOrigin } from './assistant-artifact';

const id = z.string().min(1).max(180);
export const assistantPracticePreflightSchema = z.object({
  selection: assistantArtifactSelectionSchema,
  objective: z.string().trim().min(3).max(500),
  audience: z.discriminatedUnion('kind', [z.object({ kind: z.literal('adult') }).strict(), z.object({
    kind: z.literal('student'), studentId: id, subject: z.enum(['math', 'chinese', 'english', 'chemistry']),
    targetAtomIds: z.array(id).min(1).max(3).refine(values => new Set(values).size === values.length, '知识目标不能重复'),
  }).strict()]),
  acknowledgeHistoricalSource: z.boolean().default(false), acknowledgeAudienceTransfer: z.boolean().default(false),
}).strict();
export type AssistantPracticePreflightInput = z.infer<typeof assistantPracticePreflightSchema>;
export type AssistantPracticeCoverage = {
  atomId: string; name: string; objective: string; definitionFingerprint: string;
  eligibleQuestionCount: number; seenQuestionCount: number; unseenQuestionCount: number; unseenFamilyCount: number;
  ambiguousQuestionCount: number;
};
export type AssistantPracticePreflight = {
  protocol: 'assistant-practice-preflight-v1'; origin: AssistantArtifactOrigin; objective: string;
  sourceFingerprint: string; fingerprint: string; historical: boolean;
  audience: { kind: 'adult' | 'student'; studentId: string | null; subject: string | null;
    sourceGrade: number | null; profileGrade: number | null; scopeGrade: number | null; scopeVersion: number | null;
    scopeFingerprint: string | null; scopeHref: string | null };
  coverage: AssistantPracticeCoverage[]; contextCharacters: number; maxContextCharacters: 18000; fits: boolean;
  canPrepareTeachingPractice: boolean; isTeachingOnly: true; formalEvidenceCreated: false; creationAvailable: false;
  blocked?: { code: 'source_budget_exceeded' | 'historical_source_confirmation_required' | 'audience_transfer_confirmation_required'
    | 'learning_scope_required' | 'source_target_grade_mismatch' | 'source_target_subject_mismatch' | 'practice_coverage_gap'; message: string };
};
