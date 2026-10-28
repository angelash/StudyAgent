import type { DiagnosticSession, GuidanceAction } from './diagnostics';
import type { KnowledgeAtom } from './diagnostics';
import type { AnswerDraftMetadata } from './answer-draft';
export type PracticeAttempt = {
  id: string; sessionId: string; questionId: string; requestKey: string; answer: unknown;
  disposition: 'answered' | 'skip'; score: number | null; correct: boolean | null;
  status: 'scored' | 'pending_review' | 'skipped'; hintLevel: number; attempt: number;
  solutionExposedBefore: boolean; elapsedMs: number; reason: string; submittedAt: string;
  requestHash?: string;
};
export type PracticeSession = {
  id: string; studentId: string; subject: 'math' | 'chinese' | 'english' | 'chemistry'; planId: string | null; actionId: string;
  atomId: string; day: string; status: 'in_progress' | 'completed'; questionIds: string[];
  snapshots: DiagnosticSession['questionSnapshots']; createdAt: string; completedAt: string | null;
  drafts?: Record<string, { answer: unknown; savedAt: string } & AnswerDraftMetadata>;
  actionSnapshot?: GuidanceAction; planRevision?: number;
  snapshotOrigin?: 'started' | 'legacy_capture';
  origin?: 'guidance' | 'notebook'; notebookEntryId?: string; atomSnapshot?: KnowledgeAtom;
  sourceAssessmentId?: string;
};
export type PracticeHint = { id: string; sessionId: string; questionId: string; level: number; at: string };

export type LearningMemory = {
  generatedAt: string; revision: string; student: { id: string; nickname: string; grade: number; preferredSessionMinutes: number };
  subject: 'math' | 'chinese' | 'english' | 'chemistry'; consent: 'derived_evidence_only'; summary: string;
  facts: Array<{ id: string; kind: string; text: string; provenance: string }>;
  unknowns: Array<{ atomId: string; atomName: string; status: string; reason: string }>;
  openHypotheses: Array<{ id: string; title: string; status: string; observation: string; explanation: string; nextAction: string }>;
  feed: Array<{ id: string; kind: string; priority: number; title: string; reason: string;
    target: 'today' | 'assessment' | 'plan' | 'scope'; sessionId?: string; planId?: string }>;
};

export type NotebookMetadata = { tags: string[]; favorite: boolean; removed: boolean; errorSteps: string[]; reflection: string; reviewState: 'open' | 'reviewed' };
export type MistakeNotebookEntry = {
  id: string; studentId: string; subject: 'math' | 'chinese' | 'english' | 'chemistry'; kind: 'diagnostic' | 'practice'; responseId: string;
  questionId: string; atomId: string; version: number; metadata: NotebookMetadata; createdAt: string; updatedAt: string;
  redoSessionIds: string[]; verificationBlueprintIds: string[];
  history: Array<{ version: number; actorId: string; at: string; action: 'organized' | 'redo_started' | 'verification_previewed';
    reason: string; requestKey: string; inputHash: string; metadata?: NotebookMetadata; referenceId?: string }>;
};
