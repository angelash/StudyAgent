import type { ComponentObservation, GuidancePlanView, DiagnosticHypothesis, GuidanceAction, LearningMemory, LearningScope, MasteryEstimate, PracticeAttempt, Subject } from '@study-agent/contracts';
export const subjectNames: Record<Subject, string> = { math: '数学', chinese: '语文', english: '英语' };
export const masteryNames: Record<MasteryEstimate['status'], string> = { unknown: '尚未测量', insufficient: '证据待补充', learning: '继续巩固', fragile: '还需验证', secure: '稳定掌握' };
export type Child = { id: string; nickname: string; grade: number };
export type DailyLearning = {
  studentId: string; subject: Subject; day: string; plan: GuidancePlanView | null; awaitingConfirmation: GuidancePlanView | null;
  activities: Array<GuidanceAction & { atomName: string; status: string; sessionId: string | null }>;
  reviews: Array<{ id: string; atomName: string; intervalDays: number; dueAt: string; due: boolean; status: string; sessionId: string | null }>;
  incompleteAssessments: Array<{ id: string; status: 'in_progress' | 'paused'; answeredCount: number; totalCount: number }>; notice: string;
};
export type Practice = { id: string; planId: string | null; studentId: string; subject: Subject; status: string; action: GuidanceAction; planRevision: number; currentPlanRevision: number;
  origin: 'guidance' | 'notebook'; notebookEntryId: string | null;
  snapshotOrigin: 'started' | 'legacy_capture';
  questions: Array<{ id: string; attempted: boolean; latest: PracticeAttempt | null; attempts: number }>;
  summary: { attempted: number; total: number; answered: number; skipped: number; independentFirstPass: number; pendingReview: number } };
export type PracticeFeedback = { attempt: PracticeAttempt; analysis: string; referenceAnswer: unknown; notice: string };
export type Mistake = { id: string; kind: string; questionId: string; atomId: string; atomName: string; stem: string;
  reason: string; status: string; answer: unknown; at: string; analysis: string; referenceAnswer: unknown; hypothesis: DiagnosticHypothesis | null };
export type FamilySubject = { subject: Subject; scope: LearningScope | null; estimates: MasteryEstimate[]; hypotheses: DiagnosticHypothesis[];
  componentObservations?: ComponentObservation[]; subpointEstimates?: Array<MasteryEstimate & { parentAtomId: string; parentAtomName: string }>;
  today: DailyLearning; latestSessionId: string | null; latestAt: string | null; counts: { selected: number; secure: number; unknown: number; needsEvidence: number };
  week: { completedAssessments: number; completedActivities: number; observations: number };
  trend: Array<{ at: string; sessionId: string; measuredPoints: number; sufficientPoints: number }> };
export type FamilyOverview = { generatedAt: string; day: string; children: Array<Child & { subjects: FamilySubject[] }> };
export type { LearningMemory } from '@study-agent/contracts';
export function readableAnswer(value: unknown): string {
  if (value === null || value === undefined) return '未作答';
  if (typeof value !== 'object') return String(value);
  const obj = value as Record<string, unknown>;
  if ('response' in obj) return readableAnswer(obj.response);
  if (Array.isArray(value)) return value.map(readableAnswer).join('、');
  return Object.values(obj).map(readableAnswer).join(' · ');
}
