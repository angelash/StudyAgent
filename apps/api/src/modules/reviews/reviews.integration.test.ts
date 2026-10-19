import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

describe('guardian-scoped rubric review and evidence feedback', () => {
  let app: any, store: any, auth: any, parent: any, teacher: any, outsider: any, admin: any;
  const studentId = 'review-child';
  beforeAll(async () => {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  beforeEach(async () => {
    store.reset();
    parent = await auth.register({ principal: 'review-parent@test', credential: 'review-secret-123' }, 'review-parent');
    teacher = await auth.register({ principal: 'review-teacher@test', credential: 'review-secret-123' }, 'review-teacher');
    outsider = await auth.register({ principal: 'review-outsider@test', credential: 'review-secret-123' }, 'review-outsider');
    admin = await auth.register({ principal: 'review-admin@test', credential: 'review-secret-123' }, 'review-admin');
    store.users.find((u: any) => u.id === teacher.user.id).role = 'teacher';
    store.users.find((u: any) => u.id === admin.user.id).role = 'admin';
    store.students.push({ id: studentId, userId: 'learner', nickname: '小麦', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { chinese: '原创', math: '', english: '' } });
    store.bindings.push({ id: 'guardian', studentId, parentUserId: parent.user.id, relation: 'guardian', status: 'active' });
    store.knowledgeAtoms.push({ id: 'explain', subject: 'chinese', name: '用文本证据说明', strand: '阅读', grade: 3, term: 'both',
      objective: '根据给定文本选择证据并说明联系', successCriterion: '证据与结论匹配且解释清楚', prerequisiteIds: [], curriculumVersion: 'v1', status: 'published', version: 1 });
    for (let i = 0; i < 12; i++) {
      const id = `open-${i}`;
      store.questions.push({ id, subject: 'chinese', type: 'subjective', stem: `阅读短文${i}，用原文线索说明你的判断。`, answer: '参考表达不能逐字判分', analysis: '核对证据和解释联系。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
      store.questionAnswerSchemas.push({ questionId: id, mode: 'short_answer', responseShape: { text: 'string' }, validationRules: {},
        gradingConfig: { rubric: [{ criterion: '引用文本证据', weight: 0.4 }, { criterion: '解释证据与判断的联系', weight: 0.6 }] } });
      store.questionSources.push({ questionId: id, sourceType: 'internal_authoring', sourceName: '测试原创', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'test', importJobId: null, reviewStatus: 'approved', notes: null });
      store.measurementItems.push({ id: `mapping-${i}`, questionId: id, questionVersion: 1, atomId: 'explain', dimension: 'understanding', family: `family-${i % 4}`,
        probeRole: 'anchor', expectedSeconds: 30, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'explanation_gap', version: 1 });
    }
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'chinese', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '原创范围', learnedAtomIds: ['explain'], currentAtomId: 'explain', minutesPerSession: 15 });
  });
  afterAll(async () => { await app.close(); });
  afterEach(() => { vi.useRealTimers(); });
  async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = parent, status?: number) {
    let query = request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object);
    const res = await query.expect(status ?? (method === 'post' ? 201 : 200));
    return res.body.data;
  }
  async function baseline() {
    const session = await call('post', '/diagnostics/sessions', { studentId, subject: 'chinese', maxItems: 2 });
    for (const item of session.items) await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer: '雨伞湿了说明外面在下雨，这是我的解释', elapsedMs: 9000 });
    return { session, report: await call('post', `/diagnostics/sessions/${session.id}/complete`, {}) };
  }
  const reviewPath = (kind: string, id: string) => `/admin/reviews/${kind}/${encodeURIComponent(id)}`;
  const review = (key: string, expectedVersion = 0) => ({ requestKey: key, expectedVersion, reason: '证据引用完整，联系解释只完成一部分，需要补充。',
    ratings: [{ criterionIndex: 0, score: 1, observation: '明确引用了文本中的线索' }, { criterionIndex: 1, score: 0.5, observation: '给出了结论，但联系尚不完整' }] });

  it('requires rechecking revised baseline evidence while preserving existing practice and its original plan snapshot', async () => {
    const { session, report } = await baseline();
    const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 10, useAi: false });
    expect(plan.impact.pendingReviewCount).toBe(2); expect(plan.baselineReportVersion).toBe(1);
    await call('post', reviewPath('diagnostic', report.evidence[0].id), review('plan-basis-first'), admin);
    const changed = await call('get', `/diagnostics/plans/${plan.id}`);
    expect(changed.impact.needsReview).toBe(true); expect(changed.impact.currentReportVersion).toBe(2);
    expect(changed.impact.affectedActionIds).toEqual(plan.actions.map((a: any) => a.id));
    await call('patch', `/diagnostics/plans/${plan.id}`, { expectedRevision: plan.revision, status: 'active' }, parent, 409);
    const adjustment = { expectedRevision: plan.revision, requestKey: 'confirm-new-basis', reason: '已查看量规评分修订，保留知识目标并按新依据继续观察。', acknowledgeReportVersion: 1,
      minutesPerDay: 10, actions: plan.actions.map((a: any) => ({ actionId: a.id, minutes: a.minutes, activity: a.activity })) };
    await call('post', `/diagnostics/plans/${plan.id}/adjust`, adjustment, parent, 409);
    Object.assign(plan, await call('post', `/diagnostics/plans/${plan.id}/adjust`, { ...adjustment, acknowledgeReportVersion: 2 }));
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { expectedRevision: plan.revision, status: 'active' }));
    const practice = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {});
    await call('post', reviewPath('diagnostic', report.evidence[1].id), review('plan-basis-second'), admin);
    expect((await call('get', `/learning/students/${studentId}/today?subject=chinese`)).plan.impact.needsReview).toBe(true);
    expect((await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {})).id).toBe(practice.id);
    await call('post', '/diagnostics/sessions', { studentId, subject: 'chinese', intent: 'verification', planId: plan.id, maxItems: 2 }, parent, 409);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 86_400_000);
    parent = await auth.login({ principal: 'review-parent@test', credential: 'review-secret-123' }, 'plan-basis-renew');
    await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {}, parent, 409);
    const due = (await call('get', `/diagnostics/plans/${plan.id}/reviews`))[0];
    await call('post', `/diagnostics/reviews/${due.id}/start`, {}, parent, 409);
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { expectedRevision: plan.revision, status: 'paused' }));
    Object.assign(plan, await call('post', `/diagnostics/plans/${plan.id}/adjust`, { ...adjustment, expectedRevision: plan.revision, requestKey: 'confirm-basis-again', acknowledgeReportVersion: 3 }));
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { expectedRevision: plan.revision, status: 'active' }));
    expect(plan.impact.needsReview).toBe(false); expect(plan.baselineReportVersion).toBe(3);
    const original = await call('get', `/learning/practice/${practice.id}`);
    expect(original.action).toEqual(practice.action); expect(original.planRevision).toBe(practice.planRevision);
    const next = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {});
    expect(next.planRevision).toBe(plan.revision); expect(next.id).not.toBe(practice.id);
    expect((await call('get', `/diagnostics/plans/${plan.id}/history`)).some((h: any) => h.snapshot.baselineReportVersion === 1)).toBe(true);
  });

  it('requires guardian assignment, prevents broader teacher access and revokes access immediately', async () => {
    const { report, session } = await baseline(), path = reviewPath('diagnostic', report.evidence[0].id);
    expect((await call('get', '/admin/reviews', undefined, teacher)).total).toBe(0);
    await call('get', path, undefined, teacher, 403);
    await call('post', `/students/${studentId}/reviewers`, { principal: 'review-teacher@test' }, outsider, 403);
    const assignment = await call('post', `/students/${studentId}/reviewers`, { principal: 'review-teacher@test' });
    expect((await call('get', '/admin/reviews', undefined, teacher)).total).toBe(2);
    expect((await call('get', path, undefined, teacher)).student.nickname).toBe('小麦');
    await call('get', `/diagnostics/sessions/${session.id}`, undefined, teacher, 403);
    await call('get', `/students/${studentId}/profile`, undefined, teacher, 403);
    await call('post', `${path}`, review('teacher-review'), teacher);
    await call('post', `/students/${studentId}/reviewers/${assignment.id}/revoke`, {});
    await call('get', path, undefined, teacher, 403);
    await call('post', path, review('after-revoke', 1), teacher, 403);
  });

  it('uses frozen weights, validates every criterion and rejects score bypass, stale versions and key reuse', async () => {
    const { report } = await baseline(), id = report.evidence[0].id, path = reviewPath('diagnostic', id);
    const frozenId = report.evidence[0].questionId;
    store.questionAnswerSchemas.find((q: any) => q.questionId === frozenId).gradingConfig.rubric = [{ criterion: '已改写的量规', weight: 1 }];
    await call('post', path, { ...review('bad'), score: 1 }, admin, 400);
    await call('post', path, { ...review('bad'), ratings: [review('bad').ratings[0]] }, admin, 400);
    await call('post', path, { ...review('bad'), ratings: [review('bad').ratings[0], review('bad').ratings[0]] }, admin, 400);
    const first = await call('post', path, review('weighted'), admin);
    expect(first.score).toBe(0.7); expect(first.rubricSnapshot.map((r: any) => r.weight)).toEqual([0.4, 0.6]);
    expect((await call('post', path, review('weighted'), admin)).id).toBe(first.id);
    await call('post', path, { ...review('weighted'), reason: '已经改变的评分依据不能复用请求标识' }, admin, 409);
    await call('post', path, review('stale'), admin, 409);
    expect(store.diagnosticResponses.find((r: any) => r.id === id).score).toBeNull();
    expect(store.scoringRevisions).toHaveLength(1);
  });

  it('recalculates later dependent reports, retains every original report and avoids future evidence in historical reports', async () => {
    const first = await baseline();
    const second = await baseline();
    const id = first.report.evidence[0].id;
    await call('post', reviewPath('diagnostic', id), review('recalculate'), admin);
    const histories = await call('get', `/diagnostics/sessions/${first.session.id}/report-history`);
    const later = await call('get', `/diagnostics/sessions/${second.session.id}/report-history`);
    expect(histories).toHaveLength(2); expect(later).toHaveLength(2);
    expect(histories[0].scoredCount).toBe(1); expect(histories[1].scoredCount).toBe(0);
    expect(histories[0].scoringRevisionIds).toHaveLength(1);
    expect(later[0].estimates[0].scoredCount).toBe(1);
    expect(histories[0].hypotheses.flatMap((h: any) => [...h.supportingEvidenceIds, ...h.counterEvidenceIds]).every((eid: string) => first.report.evidence.some((e: any) => e.id === eid))).toBe(true);
    await call('get', `/diagnostics/sessions/${first.session.id}/report-history`, undefined, outsider, 403);
  });

  it('preserves a verified resolution in the later report while keeping future success out of the earlier report', async () => {
    const first = await baseline();
    for (const response of first.report.evidence) await call('post', reviewPath('diagnostic', response.id), review(`first-${response.id}`.slice(0, 180)), admin);
    const second = await baseline();
    for (const response of second.report.evidence) {
      const command = review(`next-${response.id}`.slice(0, 180));
      command.ratings = command.ratings.map((r) => ({ ...r, score: 1 }));
      await call('post', reviewPath('diagnostic', response.id), command, admin);
    }
    const later = await call('get', `/diagnostics/sessions/${second.session.id}/report`);
    const earlier = await call('get', `/diagnostics/sessions/${first.session.id}/report`);
    expect(later.hypotheses.find((h: any) => h.cause === 'procedure_gap').status).toBe('resolved');
    expect(earlier.hypotheses.find((h: any) => h.cause === 'procedure_gap').status).toBe('supported');
    expect(earlier.hypotheses.flatMap((h: any) => h.counterEvidenceIds)).not.toContain(second.report.evidence[0].id);
  });

  it('reviews practice without changing mastery or erasing hint and original attempt evidence', async () => {
    const { session } = await baseline();
    store.diagnosticPlans.push({ id: 'plan', studentId, subject: 'chinese', baselineSessionId: session.id, version: 1, source: 'rules', status: 'active', minutesPerDay: 10,
      summary: '测试训练', actions: [{ id: 'action', atomId: 'explain', hypothesisId: null, evidenceIds: [], title: '解释', activity: '逐步解释', minutes: 10,
        successCriterion: '解释证据联系', resourceQuestionIds: [], retestAt: new Date().toISOString() }], evidenceIds: [], createdAt: new Date().toISOString(), aiStatus: 'not_requested' });
    const practice = await call('post', '/learning/plans/plan/actions/action/start', {}), q = practice.questions[0].id;
    await call('post', `/learning/practice/${practice.id}/questions/${encodeURIComponent(q)}/hint`, {});
    const feedback = await call('post', `/learning/practice/${practice.id}/responses`, { questionId: q, requestKey: 'practice-answer', answer: '自己的解释', elapsedMs: 2000 });
    const before = await call('get', `/diagnostics/students/${studentId}/profile?subject=chinese`);
    const revision = await call('post', reviewPath('practice', feedback.attempt.id), review('practice-review'), admin);
    expect(revision.score).toBe(0.7);
    const after = await call('get', `/diagnostics/students/${studentId}/profile?subject=chinese`);
    expect(after.estimates).toEqual(before.estimates);
    const rendered = await call('get', `/learning/practice/${practice.id}/questions/${encodeURIComponent(q)}`);
    expect(rendered.feedback.attempt.status).toBe('scored'); expect(rendered.feedback.attempt.hintLevel).toBe(1);
    expect(rendered.feedback.reviewHistory).toHaveLength(1);
    expect(store.practiceAttempts[0].status).toBe('pending_review');
  });

  it('isolates feedback, derives ownership from the response and preserves resolution history without auto-regrading', async () => {
    const { report } = await baseline(), id = report.evidence[0].id;
    const command = { kind: 'diagnostic', responseId: id, category: 'grading', message: '孩子刚才受到了打断，希望核查本题的作答环境。', requestKey: 'appeal-one' };
    await call('post', '/learning/feedback', command, outsider, 403);
    const feedback = await call('post', '/learning/feedback', command);
    expect((await call('post', '/learning/feedback', command)).id).toBe(feedback.id);
    await call('post', '/learning/feedback', { ...command, message: '不能用同一请求标识改成另一份内容。' }, parent, 409);
    expect((await call('get', '/learning/feedback', undefined, outsider)).total).toBe(0);
    await call('patch', `/admin/evidence-feedback/${feedback.id}`, { expectedVersion: 1, status: 'resolved', note: '未获得监护人授权的教师不能处理此反馈' }, teacher, 403);
    await call('patch', `/admin/evidence-feedback/${feedback.id}`, { expectedVersion: 1, status: 'investigating', note: '已核对文本和环境说明，准备安排不受打断的新题验证。' }, admin);
    await call('patch', `/admin/evidence-feedback/${feedback.id}`, { expectedVersion: 1, status: 'resolved', note: '旧版本不能覆盖新进度，需要重新核对。' }, admin, 409);
    const resolved = await call('patch', `/admin/evidence-feedback/${feedback.id}`, { expectedVersion: 2, status: 'resolved', note: '原始回答继续保留，此次将安排独立新题，不修改原始评分。' }, admin);
    expect(resolved.history).toHaveLength(3); expect(store.scoringRevisions).toHaveLength(0);
    const family = await call('get', `/learning/feedback?responseId=${encodeURIComponent(id)}`);
    expect(family.rows[0].history[2].note).toContain('独立新题');
  });

  it('withdraws a diagnostic hypothesis when corrected scores remove its supporting failures', async () => {
    const { report } = await baseline(), id = report.evidence[0].id;
    await call('post', reviewPath('diagnostic', id), review('partial-review'), admin);
    expect(store.diagnosticHypotheses.some((h: any) => h.status === 'proposed')).toBe(true);
    const corrected = { ...review('corrected-review', 1), reason: '重新核对发现表达已包含全部联系，撤回此前的部分达标评价。',
      ratings: review('corrected-review').ratings.map((r) => ({ ...r, score: 1 })) };
    await call('post', reviewPath('diagnostic', id), corrected, admin);
    expect(store.diagnosticHypotheses.every((h: any) => h.status === 'withdrawn')).toBe(true);
    expect(store.diagnosticHypotheses[0].history.at(-1).reason).toContain('不作为已验证改善');
  });

  it('keeps malformed rubric evidence inspectable for feedback without allowing a total-score bypass', async () => {
    const { report, session } = await baseline(), response = report.evidence[0];
    store.diagnosticSessions.find((s: any) => s.id === session.id).questionSnapshots.find((q: any) => q.id === response.questionId).answerSchema.gradingConfig.rubric[0].weight = 0.8;
    const detail = await call('get', reviewPath('diagnostic', response.id), undefined, admin);
    expect(detail.canScore).toBe(false); expect(detail.rubricIssue).toContain('量规无效');
    await call('post', reviewPath('diagnostic', response.id), { requestKey: 'bypass-invalid', expectedVersion: 0, score: 1, reason: '不能绕过有问题的量规改成总分判定' }, admin, 400);
    expect(store.scoringRevisions).toHaveLength(0);
  });

  it('lets only a reauthenticated admin grant teacher identity and revokes existing sessions on role changes', async () => {
    await call('get', '/admin/accounts', undefined, parent, 403);
    const command = { role: 'teacher', status: 'active', expectedVersion: 1, reason: '教研人员已核实，开通教师内容和复核身份。', adminCredential: 'review-secret-123' };
    await call('patch', `/admin/accounts/${outsider.user.id}`, command, parent, 403);
    await call('patch', `/admin/accounts/${outsider.user.id}`, { ...command, adminCredential: 'incorrect-secret-123' }, admin, 401);
    const account = await call('patch', `/admin/accounts/${outsider.user.id}`, command, admin);
    expect(account.role).toBe('teacher'); expect(account.version).toBe(2);
    expect(account.passwordHash).toBeUndefined();
    await call('get', '/auth/me', undefined, outsider, 401);
    const newSession = await auth.login({ principal: 'review-outsider@test', credential: 'review-secret-123' }, 'new-teacher');
    expect(newSession.user.role).toBe('teacher');
    await call('patch', `/admin/accounts/${outsider.user.id}`, command, admin, 409);
    await call('patch', `/admin/accounts/${admin.user.id}`, { ...command, role: 'parent' }, admin, 400);
    const list = await call('get', '/admin/accounts?search=review-outsider', undefined, admin);
    expect(list.rows[0].role).toBe('teacher'); expect(JSON.stringify(list)).not.toContain('passwordHash');
    expect(JSON.stringify(store.events.filter((e: any) => e.eventName === 'auth.account_updated'))).not.toContain('review-secret-123');
  });
});
