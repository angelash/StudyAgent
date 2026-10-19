import type { DiagnosticSession, GuidanceAction } from './diagnostics';
import type { KnowledgeAtom } from './diagnostics';
export type PracticeAttempt = {
  id: string; sessionId: string; questionId: string; requestKey: string; answer: unknown;
  disposition: 'answered' | 'skip'; score: number | null; correct: boolean | null;
  status: 'scored' | 'pending_review' | 'skipped'; hintLevel: number; attempt: number;
  solutionExposedBefore: boolean; elapsedMs: number; reason: string; submittedAt: string;
};
export type PracticeSession = {
  id: string; studentId: string; subject: 'math' | 'chinese' | 'english'; planId: string | null; actionId: string;
  atomId: string; day: string; status: 'in_progress' | 'completed'; questionIds: string[];
  snapshots: DiagnosticSession['questionSnapshots']; createdAt: string; completedAt: string | null;
  drafts?: Record<string, { answer: unknown; savedAt: string }>;
  actionSnapshot?: GuidanceAction; planRevision?: number;
  snapshotOrigin?: 'started' | 'legacy_capture';
  origin?: 'guidance' | 'notebook'; notebookEntryId?: string; atomSnapshot?: KnowledgeAtom;
  sourceAssessmentId?: string;
};
export type PracticeHint = { id: string; sessionId: string; questionId: string; level: number; at: string };

export type NotebookMetadata = { tags: string[]; favorite: boolean; removed: boolean; errorSteps: string[]; reflection: string; reviewState: 'open' | 'reviewed' };
export type MistakeNotebookEntry = {
  id: string; studentId: string; subject: 'math' | 'chinese' | 'english'; kind: 'diagnostic' | 'practice'; responseId: string;
  questionId: string; atomId: string; version: number; metadata: NotebookMetadata; createdAt: string; updatedAt: string;
  redoSessionIds: string[]; verificationBlueprintIds: string[];
  history: Array<{ version: number; actorId: string; at: string; action: 'organized' | 'redo_started' | 'verification_previewed';
    reason: string; requestKey: string; inputHash: string; metadata?: NotebookMetadata; referenceId?: string }>;
};
