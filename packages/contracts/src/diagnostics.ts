import { z } from 'zod';

const subject = z.enum(['chinese', 'math', 'english']);
const id = z.string().min(1).max(180);
export const dimensionSchema = z.enum(['understanding', 'procedure', 'transfer', 'retention']);
export type MeasurementDimension = z.infer<typeof dimensionSchema>;

export const atomTeachingSchema = z.object({
  reviewStatus: z.enum(['draft', 'approved']),
  explanation: z.string().trim().min(10).max(3000),
  example: z.object({ prompt: z.string().trim().min(5).max(1500),
    steps: z.array(z.string().trim().min(3).max(800)).min(1).max(12),
    conclusion: z.string().trim().min(1).max(800) }).strict(),
  commonErrors: z.array(z.object({ code: z.string().trim().min(1).max(100),
    observation: z.string().trim().min(5).max(600),
    alternativeExplanations: z.array(z.string().trim().min(5).max(400)).min(1).max(5),
    verification: z.string().trim().min(10).max(1000) }).strict()).min(1).max(12),
  verification: z.object({ understanding: z.string().trim().min(10).max(1000), procedure: z.string().trim().min(10).max(1000),
    transfer: z.string().trim().min(10).max(1000), retention: z.string().trim().min(10).max(1000) }).strict(),
}).strict();
export type AtomTeaching = z.infer<typeof atomTeachingSchema>;

export const knowledgeAtomSchema = z.object({
  id, subject, name: z.string().min(1).max(120), strand: z.string().min(1).max(120),
  grade: z.number().int().min(1).max(6), term: z.enum(['upper', 'lower', 'both']),
  objective: z.string().min(5).max(1000), successCriterion: z.string().min(5).max(1000),
  prerequisiteIds: z.array(id).max(30), curriculumVersion: z.string().min(1).max(120),
  status: z.enum(['draft', 'published', 'retired']), version: z.number().int().positive(),
  parentId: id.nullable().optional(), confusableAtomIds: z.array(id).max(30).optional(),
  transferAtomIds: z.array(id).max(30).optional(), teaching: atomTeachingSchema.optional(),
});
export type KnowledgeAtom = z.infer<typeof knowledgeAtomSchema>;

export const learningScopeInputSchema = z.object({
  subject, grade: z.number().int().min(1).max(6), term: z.enum(['upper', 'lower']),
  textbookVolumeId: id.nullable(), textbookVersion: z.string().min(1).max(150),
  learnedAtomIds: z.array(id).min(1).max(1000), currentAtomId: id.nullable(),
  minutesPerSession: z.number().int().min(5).max(60),
  progressMode: z.enum(['knowledge', 'textbook']).default('knowledge'),
  selectedLessonIds: z.array(id).max(1000).default([]),
}).strict();
export const learningScopeSchema = learningScopeInputSchema.extend({
  id, studentId: id, version: z.number().int().positive(), confirmedAt: z.string(),
  textbookRevision: z.string().optional(),
  mappingSnapshots: z.array(z.object({ id, version: z.number().int().positive(), lessonId: id, atomIds: z.array(id) })).optional(),
  uncoveredLessonIds: z.array(id).optional(),
  selectedLessonSnapshots: z.array(z.object({ id, name: z.string(), chapterName: z.string() })).optional(),
});
export type LearningScope = z.infer<typeof learningScopeSchema>;

export const measurementItemSchema = z.object({
  id, questionId: id, questionVersion: z.number().int().positive(), atomId: id,
  dimension: dimensionSchema, family: z.string().min(1).max(180),
  probeRole: z.enum(['anchor', 'prerequisite', 'contrast', 'transfer', 'retention']),
  expectedSeconds: z.number().int().min(5).max(1200), difficulty: z.number().int().min(1).max(5),
  reviewStatus: z.enum(['draft', 'approved', 'rejected']), mappingWeight: z.number().positive().max(1),
  observationCode: z.string().min(1).max(100), version: z.number().int().positive(),
  atomDefinitionFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type MeasurementItem = z.infer<typeof measurementItemSchema>;

export const diagnosticStartSchema = z.object({
  studentId: id, subject, intent: z.enum(['baseline', 'unit', 'phase', 'micro', 'verification', 'retest']).default('baseline'),
  targetAtomIds: z.array(id).max(100).optional(), maxItems: z.number().int().min(2).max(30).optional(),
  includePrerequisites: z.boolean().default(false), hypothesisId: id.optional(), reviewTaskId: id.optional(), planId: id.optional(),
  adaptive: z.boolean().optional(),
}).strict();
export type DiagnosticStart = z.infer<typeof diagnosticStartSchema>;

export type AssessmentBlueprint = {
  version: string; title: string; intent: DiagnosticStart['intent']; focus: string;
  itemLimit: number; minutesLimit: number; expectedSeconds: number; groupSize: number;
  stopReason: 'item_budget' | 'time_budget' | 'available_families'; stopRule: string;
  targetAtomIds: string[]; prerequisiteAtomIds: string[];
  groups: Array<{ id: string; title: string; itemIds: string[] }>;
  dimensions: Array<{ dimension: MeasurementDimension; selected: number; available: number }>;
  warnings: string[];
  routing?: { mode: 'adaptive'; version: string; description: string };
};
export type DiagnosticBlueprintReservation = {
  id: string; studentId: string; actorId: string; command: DiagnosticStart; seed: string; fingerprint: string;
  createdAt: string; expiresAt: string; sessionId: string | null; requestHash: string;
  blueprint: AssessmentBlueprint; scopeSnapshot: LearningScope; coverage: DiagnosticSession['coverage'];
  atomNames: Array<{ id: string; name: string }>; itemCount: number;
};
export type DiagnosticBlueprintView = Omit<DiagnosticBlueprintReservation, 'actorId' | 'command' | 'seed' | 'fingerprint' | 'requestHash'> & {
  canStart: boolean; expired: boolean;
};

export type DiagnosticSession = {
  id: string; studentId: string; subject: z.infer<typeof subject>; intent: DiagnosticStart['intent'];
  status: 'in_progress' | 'paused' | 'completed' | 'aborted'; scopeSnapshot: LearningScope;
  blueprint?: AssessmentBlueprint; revision?: number; endedAt?: string;
  stateHistory?: Array<{ action: 'pause' | 'resume' | 'abort'; at: string; actorId: string; reason: string;
    requestKey: string; requestHash: string; revision: number }>;
  atomSnapshots?: KnowledgeAtom[];
  itemIds: string[]; itemSnapshots: MeasurementItem[];
  questionSnapshots: Array<{ id: string; stem: string; answer: unknown; analysis: string;
    document: unknown; answerSchema: unknown; renderPayload: unknown; questionType: string }>;
  coverage: Array<{ atomId: string; selected: number; required: number; role: 'target' | 'prerequisite'; available?: number; missingReason?: string }>;
  selectionReasons: Record<string, string>; seed: string; algorithmVersion: string;
  startedAt: string; completedAt: string | null; hypothesisId: string | null; reviewTaskId: string | null;
  exposedQuestionIds?: string[];
  planId?: string; planRevision?: number;
  routing?: DiagnosticRouting;
};

export type DiagnosticRoutingDecision = {
  sequence: number; itemId: string; focusAtomId: string; rule: 'initial_anchor' | 'prerequisite_probe' | 'representation_contrast' |
    'same_point_contrast' | 'return_to_target' | 'transfer_probe' | 'uncertain_followup' | 'coverage';
  reason: string; at: string; basis: Array<{ responseId: string; itemId: string; status: string; score: number | null;
    correct: boolean | null; disposition: string; hintLevel: number; priorExposure: boolean }>;
};
export type DiagnosticRouting = {
  version: string; initialItemIds: string[]; currentItemId: string | null; decisions: DiagnosticRoutingDecision[];
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
  atomVersion?: number; atomDefinitionFingerprint?: string;
  scoreDetails?: ResponseScoreDetail[];
};

export type ResponseScoreDetail = { key: string; label: string; score: number; origin: 'protocol' | 'review'; observation?: string };
export type DiagnosticObservation = { responseId: string; atomId: string; kind: 'meets_standard' | 'below_standard' | 'self_reported' | 'skipped' | 'awaiting_review';
  description: string; details: ResponseScoreDetail[] };

export type ScoringRevision = {
  id: string; responseId: string; score: number; reason: string; reviewerId: string;
  createdAt: string; version: number;
  requestKey?: string; requestHash?: string;
  ratings?: Array<{ criterionIndex: number; score: number; observation: string }>;
  rubricSnapshot?: Array<{ criterion: string; weight: number }>;
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
  status: 'proposed' | 'testing' | 'supported' | 'contradicted' | 'inconclusive' | 'monitoring' | 'resolved' | 'reopened' | 'withdrawn';
  title: string; observation: string; explanation: string; alternatives: string[];
  supportingEvidenceIds: string[]; counterEvidenceIds: string[]; probeAtomIds: string[];
  reportedEvidenceIds?: string[];
  verification?: { supportCondition: string; counterCondition: string; undecidedCondition: string;
    groups: Array<{ atomIds: string[]; dimensions: MeasurementDimension[]; minIndependentFamilies: number; purpose: string }> };
  nextAction: string; confidence: 'low' | 'medium'; ruleVersion: string; updatedAt: string;
  history: Array<{ at: string; status: string; reason: string }>;
  atomDefinitionFingerprint?: string;
};

export type GuidanceAction = {
  id: string; atomId: string; hypothesisId: string | null; evidenceIds: string[];
  title: string; activity: string; minutes: number; successCriterion: string;
  resourceQuestionIds: string[]; retestAt: string;
  teachingSnapshot?: { atomVersion: number; teaching: AtomTeaching };
};
export type DiagnosticGuidancePlan = {
  id: string; studentId: string; subject: z.infer<typeof subject>; baselineSessionId: string;
  version: number; source: 'rules' | 'ai' | 'human'; status: 'proposed' | 'active' | 'paused' | 'completed';
  minutesPerDay: number; summary: string; actions: GuidanceAction[]; evidenceIds: string[];
  createdAt: string; aiStatus: 'not_requested' | 'available' | 'unavailable' | 'rejected';
  revision?: number; baselineReportVersion?: number; activatedAt?: string;
  retrospectiveReview?: { fingerprint: string; reviewedAt: string; actorId: string; note: string };
};
export type GuidancePlanView = DiagnosticGuidancePlan & {
  impact: { needsReview: boolean; baselineReportVersion: number; currentReportVersion: number;
    pendingReviewCount: number; affectedActionIds: string[]; message: string; definitionChangedActionIds?: string[];
    definitionUnverifiedActionIds?: string[] };
};
export type GuidancePlanRevision = {
  id: string; planId: string; revision: number; kind: 'created' | 'legacy' | 'adjusted' | 'status' | 'retrospective';
  at: string; actorId: string; reason: string; snapshot: DiagnosticGuidancePlan;
  requestKey?: string; inputHash?: string;
};
export type ReviewTask = {
  id: string; planId: string; studentId: string; subject: z.infer<typeof subject>; atomId: string;
  intervalDays: number; dueAt: string; status: 'pending' | 'in_progress' | 'completed'; sessionId: string | null;
  planRevision?: number; baselineReportVersion?: number; earliestDueAt?: string; scheduleRevision?: number;
  scheduleHistory?: Array<{ revision: number; previousDueAt: string; dueAt: string; reason: string;
    at: string; actorId: string; requestKey: string; inputHash: string }>;
};

export type DiagnosticReport = {
  sessionId: string; studentId: string; subject: z.infer<typeof subject>; status: DiagnosticSession['status'];
  answeredCount: number; totalCount: number; scoredCount: number; pendingReviewCount: number;
  rawScore: number | null; coverage: DiagnosticSession['coverage']; estimates: MasteryEstimate[];
  hypotheses: DiagnosticHypothesis[]; evidence: DiagnosticResponse[]; unmeasuredAtomIds: string[];
  observations?: DiagnosticObservation[];
  summary: string; modelNotice: string;
  scopeSnapshot?: LearningScope; version?: number; generatedAt?: string; revisionReason?: string;
  scoringRevisionIds?: string[];
  definitionContext?: { origin: 'started' | 'unavailable';
    atoms: Array<{ id: string; name: string; version: number; objective: string; successCriterion: string; fingerprint: string | null }>;
    incompatibleEvidenceIds: string[]; unverifiedEvidenceIds: string[] };
};
