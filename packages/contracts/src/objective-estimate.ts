import type { ClassroomPracticeSummary } from './classroom';

/**
 * 232 §3.3: the "estimate" evidence tier. One row per course objective (each lesson has one), read from first classroom
 * answers only. It is never an atom mastery value and never merges with formal measurement.
 */
export type ObjectiveEstimateStatus = 'not_attempted' | 'insufficient' | 'needs_practice' | 'likely_met';
export type ObjectiveEstimate = { lessonId: string; objective: string; tier: 'estimate'; status: ObjectiveEstimateStatus;
  answered: number; independentCorrect: number; assisted: number; total: number; ratio: number | null };

export const OBJECTIVE_ESTIMATE_MIN_ANSWERS = 3;
const HINT_CREDIT = 0.5;
const LIKELY_MET = 0.75;

export const objectiveEstimateLabels: Record<ObjectiveEstimateStatus, string> = {
  not_attempted: '未作答', insufficient: '证据不足', needs_practice: '估计需巩固', likely_met: '估计已达成',
};

/** Correct without help counts 1, correct after a hint or answer exposure counts 0.5; skips and "don't know" count 0. */
export function objectiveEstimate(lessonId: string, objective: string, summary: ClassroomPracticeSummary): ObjectiveEstimate {
  const attempted = summary.correct + summary.incorrect + summary.skipped + summary.dontKnow;
  const assistedCorrect = Math.max(0, summary.correct - summary.independentCorrect);
  const ratio = attempted ? (summary.independentCorrect + HINT_CREDIT * assistedCorrect) / attempted : null;
  const status: ObjectiveEstimateStatus = !summary.answered ? 'not_attempted' : attempted < OBJECTIVE_ESTIMATE_MIN_ANSWERS ? 'insufficient'
    : ratio !== null && ratio >= LIKELY_MET ? 'likely_met' : 'needs_practice';
  return { lessonId, objective, tier: 'estimate', status, answered: summary.answered, independentCorrect: summary.independentCorrect,
    assisted: summary.assisted, total: summary.total, ratio: ratio === null ? null : Math.round(ratio * 100) / 100 };
}
