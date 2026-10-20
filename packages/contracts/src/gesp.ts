import { z } from 'zod';

/** A certification level is never a primary-school grade or Subject. */
export const gespSearchSchema = z.object({
  level: z.coerce.number().int().min(1).max(8).optional(),
  session: z.string().regex(/^(20\d{2}-(03|06|09|12)|sample)$/).optional(),
  kind: z.enum(['choice', 'true-false', 'programming']).optional(),
  sourceKind: z.enum(['exam', 'official_explanation', 'sample', 'mirror_exam']).optional(),
  atomId: z.string().regex(/^gesp-cpp\.l[1-8]\.[a-z-]+$/).max(120).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(40).default(20),
}).strict();

export type GespAtom = {
  id: string; track: 'gesp-cpp'; level: number; name: string; prerequisiteIds: string[];
  mathPrerequisites: string[]; successCriterion: string; commonErrorToInvestigate: string;
  sourceClauseIds: string[]; sourceEvidence: Array<{ pdfUrl: string; pdfSha256: string; pdfPages: number[]; clauseId: string }>;
  reviewStatus: 'draft'; publicationStatus: 'research_only';
};
export type GespTeachingPlan = {
  version: string; reviewStatus: 'instructional_draft'; audience: string; principles: string[]; evidenceCycle: string[];
  units: Array<{ id: string; level: number; title: string; atomIds: string[]; observableGoal: string;
    discussionPrompt: string; mathReadiness: string; independentCheck: string }>;
  advancedReference: string;
};
export type GespQuestion = {
  id: string; certificationLevel: number; session: string; kind: 'choice' | 'true-false' | 'programming';
  sourceKind: 'exam' | 'official_explanation' | 'sample' | 'mirror_exam'; sourceAuthority: 'official' | 'public_mirror_not_official';
  number: number; title: string; pdfUrl: string; pdfSha256: string; pdfPages: number[]; sourcePageUrl: string;
  atomCandidates: Array<{ atomId: string; matchedTerms: string[]; method: string; reviewStatus: 'unreviewed' }>;
  publicationStatus: 'research_only'; requiresVisualReview: true;
};
export type GespQuestionDetail = GespQuestion & {
  archiveStatus: 'available' | 'missing';
  content: { promptMachineText: string; referenceMaterialMachineText: string } | null;
  answer: string | null; answerBasis: string | null; answerReviewStatus: string;
  referenceMaterialPresent: boolean; hiddenTestDataStatus: 'not_collected'; notice: string;
};
export type GespSearchResult = { items: GespQuestion[]; total: number; page: number; pageSize: number };
export type GespOverview = {
  track: 'gesp-cpp'; asOf: string; ready: boolean; notice: string;
  stats: { questions: number; officialPdfs: number; mirrorPdfs: number; kinds: Record<string, number>; bySource: Record<string, number> } | null;
  levels: Array<{ level: number; atoms: number; questions: number }>;
  sessions: string[];
  sourceGaps: Array<{ session: string; level: number; status: string; officialStatus: string }>;
  quarantinedLinks: number; unrecoveredObjectiveAnswers: number; teachingPlan: GespTeachingPlan;
};

export const gespLearningScopeSchema = z.object({
  level: z.number().int().min(1).max(4),
  atomIds: z.array(z.string().regex(/^gesp-cpp\.l[1-4]\.[a-z-]+$/)).min(1).max(49),
  requestKey: z.string().trim().min(8).max(120),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const gespCodeSubmissionSchema = z.object({
  studentId: z.string().regex(/^student_[0-9a-f-]{36}$/), atomId: z.string().regex(/^gesp-cpp\.l[1-4]\.[a-z-]+$/),
  source: z.string().min(1).max(65536), requestKey: z.string().trim().min(8).max(120),
}).strict();

export const gespProbeSubmissionSchema = z.object({
  studentId: z.string().regex(/^student_[0-9a-f-]{36}$/), atomId: z.string().regex(/^gesp-cpp\.l[1-4]\.[a-z-]+$/),
  probeId: z.string().regex(/^gesp-student-[a-z0-9-]{3,80}-(concept|trace)$/),
  answer: z.string().trim().min(1).max(500), requestKey: z.string().trim().min(8).max(120),
}).strict();

export type GespLearningScope = {
  id: string; studentId: string; level: number; atomIds: string[]; status: 'active';
  version: number; confirmedByUserId: string; confirmedAt: string; updatedAt: string; requestKey: string; reason: string;
};

export type GespLearningScopeRevision = GespLearningScope & { scopeId: string };

export type GespStudentTask = {
  id: string; atomId: string; title: string; prompt: string; language: 'cpp'; standard: 'C++17';
  timeLimitSeconds: number; memoryLimitMiB: number; reviewStatus: 'original_authored_pilot';
  probes: Array<{ id: string; dimension: 'understanding' | 'procedure'; prompt: string; options: string[] }>;
};

export type GespProbeSubmissionReceipt = {
  id: string; studentId: string; atomId: string; taskId: string; probeId: string;
  dimension: 'understanding' | 'procedure'; status: 'correct' | 'incorrect'; requestKey: string; answer: string;
  createdAt: string; analysis: string;
};

export type GespCodeSubmissionReceipt = {
  id: string; studentId: string; atomId: string; taskId: string; sourceSha256: string; status: 'passed' | 'failed' | 'error';
  createdAt: string; toolchain: string; compilePassed: boolean; requestKey: string; source: string;
  compileDiagnostics: string[]; runtimeDiagnostics: Array<{ index: number; status: string; stderr: string }>;
  tests: Array<{ index: number; passed: boolean; status: string; exitCode: number | null; durationMs: number }>;
};
