import type { LearningMemory } from './learning';
import type { Subject } from './index';

export type LearningHomeAction = {
  id: string;
  kind: 'resume_assessment' | 'due_review' | 'plan_review' | 'resume_practice' | 'practice' | 'report' | 'course' | 'scope' | 'assessment';
  title: string; reason: string; href: string; label: string;
  estimatedMinutes: number | null;
  saved: string;
};

/** A read-only projection. Visiting the home never starts or confirms learning. */
export type LearningHome = {
  generatedAt: string; day: string; subject: Subject;
  actor: { id: string; role: string; canManage: boolean; canUseAdultCourses: boolean };
  children: Array<{ id: string; nickname: string; grade: number }>;
  selected: { id: string; nickname: string; grade: number } | null;
  scope: { confirmed: boolean; summary: string; minutesPerSession: number | null; learnedPoints: number };
  primary: LearningHomeAction | null;
  secondary: LearningHomeAction[];
  memory: LearningMemory | null;
  counts: { dueReviews: number; unfinishedAssessments: number; pendingActivities: number; unknownPoints: number; insufficientPoints: number };
  notice: string;
};
