import type { DiagnosticSession, GuidanceAction } from './diagnostics';
export type PracticeAttempt = {
  id: string; sessionId: string; questionId: string; requestKey: string; answer: unknown;
  disposition: 'answered' | 'skip'; score: number | null; correct: boolean | null;
  status: 'scored' | 'pending_review' | 'skipped'; hintLevel: number; attempt: number;
  solutionExposedBefore: boolean; elapsedMs: number; reason: string; submittedAt: string;
};
export type PracticeSession = {
  id: string; studentId: string; subject: 'math' | 'chinese' | 'english'; planId: string; actionId: string;
  atomId: string; day: string; status: 'in_progress' | 'completed'; questionIds: string[];
  snapshots: DiagnosticSession['questionSnapshots']; createdAt: string; completedAt: string | null;
  drafts?: Record<string, { answer: unknown; savedAt: string }>;
  actionSnapshot?: GuidanceAction; planRevision?: number;
  snapshotOrigin?: 'started' | 'legacy_capture';
};
export type PracticeHint = { id: string; sessionId: string; questionId: string; level: number; at: string };
