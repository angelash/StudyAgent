import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

describe('guardian-managed finite student learning identity', () => {
  let app: any, store: any, auth: any, parent: any, outsider: any, child: any, sibling: any;
  const scope = { subject: 'math', grade: 1, term: 'upper', textbookVolumeId: null, textbookVersion: '原创测试范围',
    learnedAtomIds: ['one'], currentAtomId: 'one', minutesPerSession: 10 };
  beforeAll(async () => {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  beforeEach(async () => {
    store.reset();
    parent = await auth.register({ principal: 'learning-parent@test', credential: 'learning-secret-123' }, 'learning-parent');
    outsider = await auth.register({ principal: 'learning-outsider@test', credential: 'learning-secret-123' }, 'learning-outsider');
    const create = (nickname: string) => call('post', '/students', { nickname, grade: 1, preferredSessionMinutes: 10,
      defaultVersionMap: { math: 'original', chinese: '', english: '' } });
    child = (await create('小禾')).profile; sibling = (await create('小麦')).profile;
    for (const [id, grade] of [['one', 1], ['future', 6]] as const) {
      store.knowledgeAtoms.push({ id, grade, subject: 'math', name: id, strand: '数与运算', term: 'both', objective: '独立说明两组数量的合并关系',
        successCriterion: '独立完成不同结构任务并解释条件', prerequisiteIds: [], curriculumVersion: 'test', status: 'published', version: 1 });
      for (let i = 0; i < 16; i++) {
        const q = `${id}-q${i}`;
        store.questions.push({ id: q, subject: 'math', type: 'objective', stem: `两组3合并，第${i}个变式。`, answer: '6', analysis: '两组合并。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
        store.questionAnswerSchemas.push({ questionId: q, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
        store.questionSources.push({ questionId: q, sourceType: 'internal_authoring', sourceName: '合成验收', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'test', importJobId: null, reviewStatus: 'approved', notes: null });
        store.measurementItems.push({ id: `${q}-item`, questionId: q, questionVersion: 1, atomId: id, dimension: 'procedure', family: `${id}-f${i % 4}`, probeRole: 'anchor', expectedSeconds: 15, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch', version: 1 });
      }
    }
    await call('put', `/students/${child.id}/learning-scope`, scope);
    await call('put', `/students/${sibling.id}/learning-scope`, scope);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => { await app.close(); });
  async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = parent, expected?: number) {
    let q = request(app.getHttpServer())[method](`/api${path}`);
    if (actor?.token) q = q.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) q = q.send(body as object);
    return (await q.expect(expected ?? (method === 'post' ? 201 : 200))).body.data;
  }
  const identity = (enabled: boolean, expectedVersion: number, requestKey: string) => ({ enabled, expectedVersion, requestKey, reason: '家长先陪孩子熟悉任务，每天共同核对学习记录。' });
  async function enable() { return call('post', `/students/${child.id}/learning-access`, identity(true, 0, 'enable-learning')); }
  const issue = (requestKey: string, expectedVersion = 1) => call('post', `/students/${child.id}/learning-access/codes`, { requestKey, expectedVersion });
  const redeem = (code: string, status = 201) => call('post', '/auth/learning-code', { code }, null, status);
  async function learner() { await enable(); const code = await issue('first-learning-code'); return redeem(code.code); }
  async function assessment(actor = parent, extra = {}) {
    const session = await call('post', '/diagnostics/sessions', { studentId: child.id, subject: 'math', maxItems: 2, ...extra }, actor);
    for (const item of session.items) await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer: 6, elapsedMs: 1500 }, actor);
    return { session, report: await call('post', `/diagnostics/sessions/${session.id}/complete`, {}, actor) };
  }

  it('redeems only once, stores hashes, isolates siblings, and allows real learning and student coaching', async () => {
    await call('post', `/students/${child.id}/learning-access`, identity(true, 0, 'foreign-enable'), outsider, 403);
    await enable(); const code = await issue('one-time-code');
    expect(JSON.stringify(await call('get', `/students/${child.id}/learning-access`))).not.toContain(code.code);
    expect(store.studentLearningCodes[0].tokenHash).not.toBe(code.code);
    const student = await redeem(code.code.toUpperCase().match(/.{1,4}/g).join(' '));
    await redeem(code.code, 401);
    expect(student.user.role).toBe('student'); expect(student.user.studentId).toBe(child.id); expect(student.user.principal).toBe('');
    expect((await call('get', '/auth/me', undefined, student)).studentId).toBe(child.id);
    expect((await call('get', '/learning/students', undefined, student)).map((c: any) => c.id)).toEqual([child.id]);
    await call('get', `/students/${sibling.id}/profile`, undefined, student, 403);
    await call('get', `/learning/students/${sibling.id}/today`, undefined, student, 403);
    await call('post', '/diagnostics/sessions', { studentId: sibling.id, subject: 'math' }, student, 403);
    const { session, report } = await assessment(student);
    expect(report.rawScore).toBe(100); expect(session.scopeSnapshot.version).toBe(1);
    const assistantBody = { userRole: 'student', studentId: child.id, subject: 'math', pageContext: 'student_home' };
    await call('post', '/ai/assistant/sessions', { ...assistantBody, userRole: 'parent' }, student, 403);
    await call('post', '/ai/assistant/sessions', { ...assistantBody, studentId: sibling.id }, student, 403);
    const assistant = await call('post', '/ai/assistant/sessions', assistantBody, student);
    await call('get', `/ai/assistant/sessions/${assistant.id}/messages`, undefined, parent, 404);
    const feedback = await call('post', '/learning/feedback', { kind: 'diagnostic', responseId: report.evidence[0].id,
      category: 'display', message: '这道题的文字我没有看清，想请老师一起核对。', requestKey: 'child-feedback' }, student);
    expect((await call('get', `/learning/feedback?studentId=${child.id}`, undefined, student)).rows[0].id).toBe(feedback.id);
  });

  it('denies every management route even for this child while allowing authorized practice', async () => {
    const student = await learner(), { session } = await assessment();
    const plan = await call('post', `/diagnostics/students/${child.id}/plans`, { baselineSessionId: session.id, minutesPerDay: 10, useAi: false });
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { expectedRevision: plan.revision, status: 'active' }));
    const review = (await call('get', `/diagnostics/plans/${plan.id}/reviews`))[0];
    const blocked: Array<['get' | 'post' | 'put' | 'patch', string]> = [
      ['get', '/admin/accounts'], ['get', '/admin/reviews'], ['get', '/learning/overview'], ['post', '/students'],
      ['get', `/students/${child.id}/learning-access`], ['post', `/students/${child.id}/learning-access`],
      ['post', `/students/${child.id}/learning-access/codes`], ['post', `/students/${child.id}/invitations`],
      ['post', `/students/${child.id}/reviewers`], ['get', `/students/${child.id}/reviewers`], ['put', `/students/${child.id}/learning-scope`],
      ['post', `/diagnostics/students/${child.id}/plans`], ['patch', `/diagnostics/plans/${plan.id}`],
      ['post', `/diagnostics/plans/${plan.id}/adjust`], ['get', `/diagnostics/plans/${plan.id}/history`],
      ['post', `/diagnostics/reviews/${review.id}/reschedule`], ['post', `/diagnostics/plans/${plan.id}/retrospective/acknowledge`],
    ];
    for (const [method, path] of blocked) await call(method, path, method === 'get' ? undefined : {}, student, 403);
    const practice = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {}, student);
    const q = practice.questions[0].id;
    expect((await call('get', `/learning/practice/${practice.id}/questions/${q}`, undefined, student)).payload.answerSchema.gradingConfig).toEqual({});
    await call('patch', `/learning/practice/${practice.id}/questions/${q}/draft`, { answer: 6 }, student);
    expect((await call('post', `/learning/practice/${practice.id}/responses`, { questionId: q, requestKey: 'student-answer', answer: 6, elapsedMs: 1500 }, student)).attempt.correct).toBe(true);
  });

  it('expires and revokes codes and devices without reviving old identities on reenable', async () => {
    await enable(); const first = await issue('code-first'), second = await issue('code-second');
    await redeem(first.code, 401);
    const repeated = await issue('code-second'); expect(repeated.code).toBeNull(); expect(store.studentLearningCodes).toHaveLength(2);
    const student = await redeem(second.code);
    const devices = await call('get', `/students/${child.id}/learning-access`); expect(devices.sessions).toHaveLength(1);
    await call('post', `/students/${child.id}/learning-access/sessions/${devices.sessions[0].id}/revoke`, {});
    await call('get', '/auth/me', undefined, student, 401);
    const disable = identity(false, 1, 'disable-learning');
    expect((await call('post', `/students/${child.id}/learning-access`, disable)).version).toBe(2);
    expect((await call('post', `/students/${child.id}/learning-access`, disable)).version).toBe(2);
    await issue('code-disabled', 2).then(() => { throw new Error('Expected disabled rejection'); }).catch(e => expect(String(e)).toContain('expected 201'));
    await call('post', `/students/${child.id}/learning-access`, identity(true, 1, 'enable-stale'), parent, 409);
    await call('post', `/students/${child.id}/learning-access`, identity(true, 2, 'enable-again'));
    await call('get', '/auth/me', undefined, student, 401);
    const fresh = await issue('code-expiring', 3);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 11 * 60_000);
    await redeem(fresh.code, 401);
    const usable = await issue('code-valid', 3), next = await redeem(usable.code);
    store.bindings.find((b: any) => b.parentUserId === parent.user.id && b.studentId === child.id).status = 'inactive';
    await call('get', '/auth/me', undefined, next, 401);
  });

  it('keeps proposed grade/progress out of assessment until guardian acceptance and preserves old scopes', async () => {
    const student = await learner(), baseline = await assessment(student);
    const proposalBody = { scope: { ...scope, grade: 6, learnedAtomIds: ['future'], currentAtomId: 'future' }, baseScopeVersion: 1, requestKey: 'future-progress' };
    const proposal = await call('post', `/students/${child.id}/progress-proposals`, proposalBody, student);
    expect(proposal.knowledgeSnapshot[0].id).toBe('future');
    expect((await call('post', `/students/${child.id}/progress-proposals`, proposalBody, student)).id).toBe(proposal.id);
    await call('post', '/diagnostics/sessions', { studentId: child.id, subject: 'math', targetAtomIds: ['future'] }, student, 400);
    expect((await call('get', `/students/${child.id}/learning-scope`, undefined, student)).version).toBe(1);
    await call('get', `/students/${child.id}/progress-proposals`, undefined, outsider, 403);
    const decision = { decision: 'accept', expectedVersion: 1, requestKey: 'accept-progress', note: '已核对实际教材与课堂内容，确认这次提出的学习范围。' };
    await call('post', `/students/${child.id}/progress-proposals/${proposal.id}/decision`, decision, student, 403);
    await call('post', `/students/${child.id}/progress-proposals/${proposal.id}/decision`, { ...decision, expectedVersion: 2 }, parent, 409);
    await call('post', `/students/${child.id}/progress-proposals/${proposal.id}/decision`, decision);
    await call('post', `/students/${child.id}/progress-proposals/${proposal.id}/decision`, decision);
    expect((await call('get', `/students/${child.id}/learning-scope`, undefined, student)).version).toBe(2);
    expect((await call('get', `/diagnostics/sessions/${baseline.session.id}`, undefined, student)).scopeSnapshot.grade).toBe(1);
    const next = await call('post', '/diagnostics/sessions', { studentId: child.id, subject: 'math', maxItems: 2 }, student);
    expect(next.scopeSnapshot.grade).toBe(6); expect(next.items.every((i: any) => i.atomId === 'future')).toBe(true);
    await call('post', `/students/${child.id}/progress-proposals`, { ...proposalBody, requestKey: 'stale-progress' }, student, 409);
  });

  it('expires an eight-hour learning session and bounds code guessing', async () => {
    const student = await learner();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 8 * 3600_000 + 1_000);
    await call('get', '/auth/me', undefined, student, 401);
    await call('get', '/auth/me');
    for (let i = 0; i < 30; i++) await expect(auth.redeemLearningCode({ code: '0123456789abcdef0123' }, 'synthetic-guesser')).rejects.toThrow('学习码不可用');
    await expect(auth.redeemLearningCode({ code: '0123456789abcdef0123' }, 'synthetic-guesser')).rejects.toThrow('尝试次数过多');
  });
});
