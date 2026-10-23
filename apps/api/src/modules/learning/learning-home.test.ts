import { describe, expect, it } from 'vitest';
import { learningHomeActions } from './learning-home.service';

type Input = Parameters<typeof learningHomeActions>[0];
function input(overrides: Partial<Input> = {}): Input {
  return { studentId: 'child-one', subject: 'math', canManage: true, confirmed: true, hasEvidenceGap: true,
    latestReportId: null, hasOpenHypotheses: false, course: null,
    today: { plan: null, awaitingConfirmation: null, activities: [], reviews: [], incompleteAssessments: [] } as unknown as Input['today'], ...overrides };
}
const active = { id: 'plan-one', status: 'active', impact: { needsReview: false } };

describe('learning home action eligibility and destination', () => {
  it('resumes a frozen assessment before reviews and does not start anything', () => {
    const data = input(); Object.assign(data.today, { plan: active,
      incompleteAssessments: [{ id: 'assessment-one', answeredCount: 1, totalCount: 4 }],
      reviews: [{ id: 'review-one', atomName: '分数单位', due: true, status: 'pending', intervalDays: 3 }] });
    const before = JSON.stringify(data), actions = learningHomeActions(data);
    expect(actions[0].href).toBe('/student/assessment?studentId=child-one&subject=math&session=assessment-one');
    expect(actions[1].href).toContain('#review-review-one');
    expect(JSON.stringify(data)).toBe(before);
  });
  it('does not offer future, completed or paused-plan reviews', () => {
    const data = input(); Object.assign(data.today, { reviews: [{ id: 'future', due: false, status: 'pending' }, { id: 'done', due: true, status: 'completed' }] });
    expect(learningHomeActions(data).some(action => action.kind === 'due_review')).toBe(false);
    Object.assign(data.today, { reviews: [{ id: 'paused', due: true, status: 'pending' }] });
    expect(learningHomeActions(data).some(action => action.kind === 'due_review')).toBe(false);
  });
  it('routes an already started due review to its exact assessment', () => {
    const data = input(); Object.assign(data.today, { plan: active, reviews: [{ id: 'review-one', sessionId: 'saved-review', due: true, status: 'in_progress', intervalDays: 7, atomName: '迁移' }] });
    expect(learningHomeActions(data)[0].href).toContain('session=saved-review');
  });
  it('revised plan evidence blocks training and asks for a guardian decision', () => {
    const data = input(); Object.assign(data.today, { plan: { ...active, impact: { needsReview: true } },
      activities: [{ id: 'action-one', status: 'in_progress', sessionId: 'practice-one', atomName: '分数', minutes: 8 }] });
    const actions = learningHomeActions(data);
    expect(actions[0].kind).toBe('plan_review');
    expect(actions[0].href).toContain('planId=plan-one');
    expect(actions.some(action => ['resume_practice', 'practice'].includes(action.kind))).toBe(false);
    data.canManage = false;
    expect(learningHomeActions(data)[0].title).toContain('请家长');
  });
  it('resumes practice before a not-yet-started action and preserves the selected subject', () => {
    const data = input({ subject: 'english' }); Object.assign(data.today, { plan: active,
      activities: [{ id: 'new', status: 'pending', sessionId: null, atomName: '词义', minutes: 5, activity: '对照语境' },
        { id: 'saved', status: 'in_progress', sessionId: 'practice-one', atomName: '字母', minutes: 6, activity: '继续已保存题目' }] });
    const actions = learningHomeActions(data);
    expect(actions[0].kind).toBe('resume_practice');
    expect(actions[0].href).toBe('/student/today?studentId=child-one&subject=english&practice=practice-one');
    expect(actions[1].href).toContain('#activity-new');
  });
  it('keeps unknown evidence separate from a low ability claim and reports before new assessment', () => {
    const data = input({ hasOpenHypotheses: true, latestReportId: 'report-session' });
    const actions = learningHomeActions(data);
    expect(actions[0].kind).toBe('report');
    expect(actions.at(-1)?.reason).toContain('缺少独立证据');
  });
  it('offers scope confirmation instead of an assessment without a confirmed scope', () => {
    const data = input({ confirmed: false });
    expect(learningHomeActions(data).map(action => action.kind)).toEqual(['scope']);
    data.canManage = false;
    expect(learningHomeActions(data)[0].reason).toContain('请家长核对');
  });
});
