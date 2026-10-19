import { z } from 'zod';

const subject = z.enum(['chinese', 'math', 'english']);
const id = z.string().min(1).max(180);
export const dimensionSchema = z.enum(['understanding', 'procedure', 'transfer', 'retention']);
export type MeasurementDimension = z.infer<typeof dimensionSchema>;

export const knowledgeAtomSchema = z.object({
  id, subject, name: z.string().min(1).max(120), strand: z.string().min(1).max(120),
  grade: z.number().int().min(1).max(6), term: z.enum(['upper', 'lower', 'both']),
  objective: z.string().min(5).max(1000), successCriterion: z.string().min(5).max(1000),
  prerequisiteIds: z.array(id).max(30), curriculumVersion: z.string().min(1).max(120),
  status: z.enum(['draft', 'published', 'retired']), version: z.number().int().positive(),
});
export type KnowledgeAtom = z.infer<typeof knowledgeAtomSchema>;

export const learningScopeInputSchema = z.object({
  subject, grade: z.number().int().min(1).max(6), term: z.enum(['upper', 'lower']),
  textbookVolumeId: id.nullable(), textbookVersion: z.string().min(1).max(150),
  learnedAtomIds: z.array(id).min(1).max(1000), currentAtomId: id.nullable(),
  minutesPerSession: z.number().int().min(5).max(60),
}).strict();
export const learningScopeSchema = learningScopeInputSchema.extend({
  id, studentId: id, version: z.number().int().positive(), confirmedAt: z.string(),
});
export type LearningScope = z.infer<typeof learningScopeSchema>;

export const measurementItemSchema = z.object({
  id, questionId: id, questionVersion: z.number().int().positive(), atomId: id,
  dimension: dimensionSchema, family: z.string().min(1).max(180),
  probeRole: z.enum(['anchor', 'prerequisite', 'contrast', 'transfer', 'retention']),
  expectedSeconds: z.number().int().min(5).max(1200), difficulty: z.number().int().min(1).max(5),
  reviewStatus: z.enum(['draft', 'approved', 'rejected']), mappingWeight: z.number().positive().max(1),
  observationCode: z.string().min(1).max(100), version: z.number().int().positive(),
});
export type MeasurementItem = z.infer<typeof measurementItemSchema>;

export const diagnosticStartSchema = z.object({
  studentId: id, subject, intent: z.enum(['baseline', 'unit', 'verification', 'retest']).default('baseline'),
  targetAtomIds: z.array(id).max(100).optional(), maxItems: z.number().int().min(2).max(30).default(12),
  includePrerequisites: z.boolean().default(false), hypothesisId: id.optional(), reviewTaskId: id.optional(),
}).strict();
export type DiagnosticStart = z.infer<typeof diagnosticStartSchema>;

export type DiagnosticSession = {
  id: string; studentId: string; subject: z.infer<typeof subject>; intent: DiagnosticStart['intent'];
  status: 'in_progress' | 'completed' | 'aborted'; scopeSnapshot: LearningScope;
  itemIds: string[]; itemSnapshots: MeasurementItem[];
  questionSnapshots: Array<{ id: string; stem: string; answer: unknown; analysis: string;
    document: unknown; answerSchema: unknown; renderPayload: unknown; questionType: string }>;
  coverage: Array<{ atomId: string; selected: number; required: number; role: 'target' | 'prerequisite' }>;
  selectionReasons: Record<string, string>; seed: string; algorithmVersion: string;
  startedAt: string; completedAt: string | null; hypothesisId: string | null; reviewTaskId: string | null;
  exposedQuestionIds?: string[];
};

export const diagnosticResponseInputSchema = z.object({
  itemId: id, answer: z.unknown().optional(), elapsedMs: z.number().int().min(0).max(3_600_000),
  disposition: z.enum(['answered', 'skip', 'dont_know']).default('answered'),
  requestKey: z.string().min(1).max(180).optional(),
}).strict();
export type DiagnosticResponseInput = z.infer<typeof diagnosticResponseInputSchema>;
export type DiagnosticResponse = {
  id: string; sessionId: string; studentId: string; itemId: string; questionId: string; atomId: string;
  family: string; dimension: MeasurementDimension; questionVersion: number; mappingVersion: number;
  answer: unknown; score: number | null; correct: boolean | null;
  status: 'scored' | 'pending_review' | 'skipped'; disposition: DiagnosticResponseInput['disposition'];
  elapsedMs: number; hintLevel: number; observationCode: string | null; gradingReason: string;
  retentionDelayDays: number | null;
  submittedAt: string; gradingVersion: string; requestKey: string;
  priorExposure?: boolean;
};

export type ScoringRevision = {
  id: string; responseId: string; score: number; reason: string; reviewerId: string;
  createdAt: string; version: number;
};

export type MasteryEstimate = {
  atomId: string; atomName: string; grade: number; mastery: number | null; lower: number | null; upper: number | null;
  status: 'unknown' | 'insufficient' | 'learning' | 'fragile' | 'secure';
  rawCorrect: number; scoredCount: number; effectiveSamples: number; independentFamilies: number;
  dimensions: Array<{ dimension: MeasurementDimension; mastery: number | null; samples: number }>;
  independentRate: number | null; transferVerified: boolean; retentionVerified: boolean;
  evidenceIds: string[]; lastMeasuredAt: string | null; algorithmVersion: string;
};

export type DiagnosticHypothesis = {
  id: string; studentId: string; subject: z.infer<typeof subject>; atomId: string;
  cause: 'prerequisite_gap' | 'procedure_gap' | 'representation_gap' | 'retention_gap';
  status: 'proposed' | 'testing' | 'supported' | 'contradicted' | 'inconclusive' | 'monitoring' | 'resolved' | 'reopened';
  title: string; observation: string; explanation: string; alternatives: string[];
  supportingEvidenceIds: string[]; counterEvidenceIds: string[]; probeAtomIds: string[];
  nextAction: string; confidence: 'low' | 'medium'; ruleVersion: string; updatedAt: string;
  history: Array<{ at: string; status: string; reason: string }>;
};

export type GuidanceAction = {
  id: string; atomId: string; hypothesisId: string | null; evidenceIds: string[];
  title: string; activity: string; minutes: number; successCriterion: string;
  resourceQuestionIds: string[]; retestAt: string;
};
export type DiagnosticGuidancePlan = {
  id: string; studentId: string; subject: z.infer<typeof subject>; baselineSessionId: string;
  version: number; source: 'rules' | 'ai'; status: 'proposed' | 'active' | 'paused' | 'completed';
  minutesPerDay: number; summary: string; actions: GuidanceAction[]; evidenceIds: string[];
  createdAt: string; aiStatus: 'not_requested' | 'available' | 'unavailable' | 'rejected';
};
export type ReviewTask = {
  id: string; planId: string; studentId: string; subject: z.infer<typeof subject>; atomId: string;
  intervalDays: number; dueAt: string; status: 'pending' | 'in_progress' | 'completed'; sessionId: string | null;
};

export type DiagnosticReport = {
  sessionId: string; studentId: string; subject: z.infer<typeof subject>; status: DiagnosticSession['status'];
  answeredCount: number; totalCount: number; scoredCount: number; pendingReviewCount: number;
  rawScore: number | null; coverage: DiagnosticSession['coverage']; estimates: MasteryEstimate[];
  hypotheses: DiagnosticHypothesis[]; evidence: DiagnosticResponse[]; unmeasuredAtomIds: string[];
  summary: string; modelNotice: string;
};
