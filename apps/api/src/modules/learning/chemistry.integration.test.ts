import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

describe.sequential('chemistry course → independent checks → guidance → real due-date retests', () => {
  let app: any, store: any, parent: any, outsider: any, studentId: string, chemistry: any;
  const version = 'guangzhou-pep-chemistry-9-upper-v1';
  const source = (file: string) => require(`../../../dist/apps/api/src/${file}.js`);
  beforeAll(async () => {
    app = await NestFactory.create(source('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(source('infrastructure/in-memory-store.service').InMemoryStoreService); store.reset();
    app.get(source('modules/diagnostics/foundation-seed.service').FoundationSeedService).seedAuthoredCurriculum();
    chemistry = app.get(source('modules/learning/chemistry.service').ChemistryService);
    parent = await call('post', '/auth/register', { principal: 'chemistry-parent', credential: 'Chemistry-test-password-2026' }, null);
    outsider = await call('post', '/auth/register', { principal: 'chemistry-outsider', credential: 'Chemistry-test-password-2026' }, null);
    const child = await call('post', '/students', { nickname: '化学验证档案', grade: 9, preferredSessionMinutes: 25,
      defaultVersionMap: { math: '', chinese: '', english: '', chemistry: version } }); studentId = child.profile.id;
  }, 120_000);
  afterAll(async () => { vi.useRealTimers(); await app?.close(); });
  async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor: any = parent, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor?.token) query = query.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object);
    const result = await query; expect(result.status, `${method} ${path}: ${JSON.stringify(result.body.error)}`).toBe(expected); return result.body.data;
  }
  async function start(checkpointId: string, requestKey = `request-${checkpointId}-fixture`, expected = 201) {
    return call('post', '/chemistry/checkpoints/start', { studentId, version, checkpointId, requestKey }, parent, expected);
  }
  async function finish(id: string, wrong = false) {
    // This fixture accelerates a semester into seconds; preserve production limits
    // and clear only this test account's counter between exam sessions.
    await app.get(source('infrastructure/rate-limit.service').RateLimitService).reset('request-user:write:' + parent.user.id);
    const session = await call('get', '/diagnostics/sessions/' + id);
    for (const item of session.items) {
      const q = store.find('questions', { id: item.questionId });
      const schema = store.find('questionAnswerSchemas', { questionId: item.questionId });
      const different = schema.options?.find((option: any) => option.value !== q.answer)?.value ?? Number(q.answer) + 1;
      const body = { itemId: item.id, answer: wrong ? different : q.answer, elapsedMs: 3000 };
      await call('post', `/diagnostics/sessions/${id}/responses`, body);
    }
    await call('post', `/diagnostics/sessions/${id}/complete`);
    return call('get', `/diagnostics/sessions/${id}/report`);
  }
  it('offers a full catalog without exposing scored answers or creating learning evidence', async () => {
    const catalog = await call('get', '/chemistry/catalog');
    expect(catalog).toMatchObject({ pointCount: 28, questionCount: 2016, studentId, courseId: null });
    expect(catalog.units).toHaveLength(7); expect(catalog.checkpoints).toHaveLength(19); expect(catalog.references).toHaveLength(10);
    expect(catalog.course).toMatchObject({ studentId, subject: 'chemistry', grade: 9, status: 'draft' });
    expect(catalog.course.units).toHaveLength(7);
    expect(store.inspect('studioCourses')).toHaveLength(0);
    expect(JSON.stringify(catalog)).not.toContain('foundation_q_');
    expect(store.inspect('diagnosticResponses')).toHaveLength(0);
    await call('get', '/chemistry/catalog?studentId=' + studentId, undefined, outsider, 403);
    const primary = await call('post', '/students', { nickname: '原有小学档案', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } });
    const preserved = await call('get', '/chemistry/catalog?studentId=' + primary.profile.id);
    expect(preserved).toMatchObject({ studentId: primary.profile.id, canEnroll: false, courseId: null });
    expect(preserved.course.studentId).toBe(primary.profile.id);
    await call('post', '/chemistry/enroll', { studentId: primary.profile.id, version, requestKey: 'primary-context-cannot-enroll' }, parent, 400);
    expect(store.inspect('studioCourses')).toHaveLength(0);
  });
  it('creates an idempotent native course and authentic classroom while preserving existing scope', async () => {
    const command = { studentId, version, requestKey: 'enrollment-request-fixture' };
    const first = await call('post', '/chemistry/enroll', command), second = await call('post', '/chemistry/enroll', command);
    expect(first).toMatchObject({ created: true }); expect(second).toMatchObject({ created: false, courseId: first.courseId });
    const courses = store.select('studioCourses', { studentId, subject: 'chemistry' }); expect(courses).toHaveLength(1);
    expect(courses[0].units).toHaveLength(7); expect(courses[0].units.flatMap((unit: any) => unit.lessons)).toHaveLength(70);
    const overview = await call('get', '/learning/studio/overview?' + new URLSearchParams({ studentId, subject: 'chemistry' }));
    expect(overview.courses.map((course: any) => course.id)).toEqual([first.courseId]);
    const checkHref = new URL(courses[0].units[0].lessons.find((lesson: any) => lesson.kind === 'exam').href, 'http://local');
    expect(checkHref.pathname).toBe('/studio'); expect(checkHref.searchParams.get('course')).toBe(first.courseId);
    expect(checkHref.searchParams.get('panel')).toBe('checks');
    const scope = await call('get', `/students/${studentId}/learning-scope?subject=chemistry`);
    expect(scope.learnedAtomIds).toHaveLength(28); expect(store.inspect('diagnosticResponses')).toHaveLength(0);
    await call('post', '/chemistry/enroll', { ...command, requestKey: 'enrollment-old-version', version: 'old' }, parent, 409);
    await call('post', '/chemistry/enroll', command, outsider, 403);
    const lesson = courses[0].units[0].lessons.find((lesson: any) => lesson.kind === 'learn');
    expect(new URL(lesson.href, 'http://local').searchParams.get('studentId')).toBe(studentId);
    const classroom = await call('post', '/learning/classroom/sessions', { studioCourseId: first.courseId, lessonId: lesson.id });
    expect(classroom.studentId).toBe(studentId); expect(classroom.lesson.steps.length).toBeGreaterThan(5);
    expect(store.inspect('diagnosticResponses')).toHaveLength(0);
    const saved = store.find('learningScopes', { id: scope.id }); saved.minutesPerSession = 30;
    await call('post', '/chemistry/enroll', { ...command, requestKey: 'enrollment-second-key' });
    expect(store.find('learningScopes', { id: scope.id }).minutesPerSession).toBe(30);
  });
  it('enforces prerequisites and excludes baseline exposure from independent checks', async () => {
    await start('u1:unit', 'post-before-baseline', 400);
    const first = await start('u1:baseline'), replay = await start('u1:baseline'); expect(replay.sessionId).toBe(first.sessionId);
    await start('u2:baseline', 'request-u1:baseline-fixture', 409);
    const initial = await call('get', `/diagnostics/sessions/${first.sessionId}`); expect(initial.coverage.every((row: any) => row.selected >= row.required)).toBe(true);
    const snapshot = JSON.stringify(store.find('diagnosticSessions', { id: first.sessionId }).questionSnapshots);
    await finish(first.sessionId, true);
    const post = await start('u1:unit'); const independent = await call('get', `/diagnostics/sessions/${post.sessionId}`);
    const previousQuestions = new Set(initial.items.map((item: any) => item.questionId));
    expect(independent.items.every((item: any) => !previousQuestions.has(item.questionId))).toBe(true);
    expect(independent.coverage.every((row: any) => row.selected >= row.required)).toBe(true);
    const report = await finish(post.sessionId); expect(report.rawScore).toBe(100);
    expect(JSON.stringify(store.find('diagnosticSessions', { id: first.sessionId }).questionSnapshots)).toBe(snapshot);
    const catalog = await call('get', '/chemistry/catalog?studentId=' + studentId);
    expect(catalog.checkpoints.find((check: any) => check.id === 'u1:unit')).toMatchObject({ status: 'completed', lastSessionId: post.sessionId });
  });
  it('runs all unit and semester checks with full coverage and builds scheduled 1/3/7/14-day guidance', async () => {
    for (let i = 2; i <= 7; i++) { const baseline = await start(`u${i}:baseline`); await finish(baseline.sessionId); const post = await start(`u${i}:unit`); await finish(post.sessionId); }
    let catalog = await call('get', '/chemistry/catalog?studentId=' + studentId);
    for (const check of catalog.checkpoints.filter((check: any) => ['midterm', 'final'].includes(check.kind))) {
      expect(check.ready).toBe(true); const result = await start(check.id);
      const session = await call('get', '/diagnostics/sessions/' + result.sessionId);
      expect(session.coverage).toHaveLength(check.targetAtomIds.length);
      expect(session.coverage.every((row: any) => row.selected >= row.required)).toBe(true);
      await finish(result.sessionId);
    }
    catalog = await call('get', '/chemistry/catalog?studentId=' + studentId); expect(catalog.checkpoints.every((check: any) => check.status === 'completed')).toBe(true);
    const baselineId = catalog.checkpoints.find((check: any) => check.id === 'u1:baseline').lastSessionId;
    const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baselineId, minutesPerDay: 20, useAi: false, requestKey: 'chemistry-guidance-fixture' });
    const active = await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision,
      requestKey: 'activate-chemistry-plan' });
    expect(active.status).toBe('active');
    const reviews = await call('get', `/diagnostics/plans/${plan.id}/reviews`);
    expect([...new Set(reviews.map((task: any) => task.intervalDays))].sort((a: any, b: any) => a-b)).toEqual([1,3,7,14]);
    const first = reviews.find((task: any) => task.intervalDays === 1);
    await call('post', `/diagnostics/reviews/${first.id}/start`, undefined, parent, 400);
    const action = active.actions[0];
    const practice = await call('post', `/learning/plans/${active.id}/actions/${action.id}/start`);
    const practiceQuestions = new Set(practice.questions.map((question: any) => question.id));
    for (const question of practice.questions) {
      const original = store.find('questions', { id: question.id });
      await call('post', `/learning/practice/${practice.id}/responses`, { questionId: question.id, answer: original.answer,
        requestKey: `practice-${question.id}`, elapsedMs: 3000, disposition: 'answered' });
    }
    await call('post', `/learning/practice/${practice.id}/complete`);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (const task of [...reviews].sort((a: any,b: any) => Date.parse(a.dueAt) - Date.parse(b.dueAt))) {
        vi.setSystemTime(new Date(Date.parse(task.dueAt) + 1000));
        parent = await call('post', '/auth/login', { principal: 'chemistry-parent', credential: 'Chemistry-test-password-2026' }, null);
        const review = await call('post', `/diagnostics/reviews/${task.id}/start`);
        expect(review.scopeSnapshot.subject).toBe('chemistry');
        expect(review.items.every((item: any) => !practiceQuestions.has(item.questionId))).toBe(true);
        await finish(review.id);
      }
    } finally { vi.useRealTimers(); }
    parent = await call('post', '/auth/login', { principal: 'chemistry-parent', credential: 'Chemistry-test-password-2026' }, null);
    const retrospective = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(retrospective).toBeTruthy();
  }, 120_000);
  it('allows a learning-code student to use their own chemistry path but not management or another child', async () => {
    await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0,
      requestKey: 'enable-chemistry-learning', reason: '家长确认孩子使用自己的化学学习档案' });
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: 1, requestKey: 'chemistry-learning-code' });
    const learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    const catalog = await call('get', '/chemistry/catalog?studentId=' + studentId, undefined, learner);
    expect(catalog.studentId).toBe(studentId); expect(catalog.canEnroll).toBe(false);
    await call('post', '/chemistry/enroll', { studentId, version, requestKey: 'student-cannot-enroll' }, learner, 403);
    await call('get', '/chemistry/catalog?studentId=another-child', undefined, learner, 403);
    const next = await call('post', '/chemistry/checkpoints/start', { studentId, version, checkpointId: 'u2:baseline', requestKey: 'own-child-chemistry-check' }, learner);
    expect(next.sessionId).toBeTruthy();
  });
  it('rolls back a new check when current independent coverage is incomplete', async () => {
    const target = 'chemistry:9-upper:lab';
    const mappings = store.select('measurementItems', { atomId: target });
    const before = store.inspect('diagnosticSessions').length;
    for (const item of mappings) item.reviewStatus = 'draft';
    try { await start('u1:unit', 'coverage-gap-chemistry-test', 409); expect(store.inspect('diagnosticSessions')).toHaveLength(before); }
    finally { for (const item of store.select('measurementItems', { atomId: target })) item.reviewStatus = 'approved'; }
  });
});
