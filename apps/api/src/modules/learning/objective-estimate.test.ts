import { describe, expect, it } from 'vitest';
import { objectiveEstimate, objectiveEstimateLabels, type ClassroomPracticeSummary } from '@study-agent/contracts';

const summary = (values: Partial<ClassroomPracticeSummary>): ClassroomPracticeSummary => ({ total: 4, answered: 0, remaining: 4, correct: 0, incorrect: 0,
  skipped: 0, dontKnow: 0, assisted: 0, independentCorrect: 0, complete: false, nextQuestionIndex: 0, reviewQuestionIds: [], ...values });

describe('objective estimate tier', () => {
  it('reports not attempted and insufficient evidence instead of a weak result', () => {
    expect(objectiveEstimate('l1', '目标', summary({})).status).toBe('not_attempted');
    expect(objectiveEstimate('l1', '目标', summary({ answered: 2, correct: 0, incorrect: 2 }))).toMatchObject({ status: 'insufficient', ratio: 0 });
  });
  it('counts independent correct answers fully and hinted ones at half, skips and unknowns as zero', () => {
    expect(objectiveEstimate('l1', '目标', summary({ answered: 4, correct: 4, independentCorrect: 3, assisted: 1 }))).toMatchObject({ status: 'likely_met', ratio: 0.88 });
    expect(objectiveEstimate('l1', '目标', summary({ answered: 4, correct: 4, independentCorrect: 0, assisted: 4 }))).toMatchObject({ status: 'needs_practice', ratio: 0.5 });
    expect(objectiveEstimate('l1', '目标', summary({ answered: 4, correct: 2, independentCorrect: 2, skipped: 1, dontKnow: 1 }))).toMatchObject({ status: 'needs_practice', ratio: 0.5 });
  });
  it('is always labelled as an estimate, never as mastery', () => {
    const row = objectiveEstimate('l1', '比较观察与解释', summary({ answered: 3, correct: 3, independentCorrect: 3 }));
    expect(row).toMatchObject({ tier: 'estimate', lessonId: 'l1', objective: '比较观察与解释', status: 'likely_met' });
    expect(row).not.toHaveProperty('mastery');
    for (const label of Object.values(objectiveEstimateLabels).slice(2)) expect(label).toContain('估计');
  });
});
