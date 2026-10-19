import 'reflect-metadata';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

const require = createRequire(__filename);
describe('scope → atomic assessment → diagnosis → guidance → verification', () => {
  let app: INestApplication, store: any, auth: any, owner: any, admin: any, studentId: string;
  const originalKey = process.env.OPENAI_API_KEY;
  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  beforeEach(async () => {
    store.reset();
    owner = await auth.register({ principal: 'diagnostic-parent@test', credential: 'diagnostic-secret-123' }, 'fixture-parent');
    admin = await auth.register({ principal: 'diagnostic-reviewer@test', credential: 'diagnostic-secret-123' }, 'fixture-reviewer');
    store.users.find((user: any) => user.id === admin.user.id).role = 'admin';
    studentId = 'student';
    store.students.push({ id: studentId, userId: 'child-user', nickname: '小禾', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'common', chinese: '', english: '' } });
    store.bindings.push({ id: 'binding', studentId, parentUserId: owner.user.id, relation: 'guardian', status: 'active' });
    for (const [id, grade, prerequisiteIds] of [['base', 1, []], ['target', 3, ['base']], ['unmapped', 3, []], ['future', 6, []]] as const) {
      store.knowledgeAtoms.push({ id, grade, prerequisiteIds, subject: 'math', name: id, strand: '数与运算', term: 'both',
        objective: `独立完成${id}知识点的指定操作`, successCriterion: '在不同题族的新题中独立完成操作', curriculumVersion: 'test-v1', status: 'published', version: 1 });
      if (id === 'unmapped') continue;
      for (let index = 0; index < 32; index++) {
        const qid = `${id}-q${index}`, mid = `${id}-item${index}`;
        store.questions.push({ id: qid, subject: 'math', type: 'objective', stem: `第${index + 1}个变式：3+3=?`, answer: '6',
          analysis: '两组3合并。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
        store.questionAnswerSchemas.push({ questionId: qid, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
        store.questionSources.push({ questionId: qid, sourceType: 'internal_authoring', sourceName: '测试量化题', sourcePathOrUrl: '',
          licenseClass: 'A_INTERNAL', licenseName: 'test', importJobId: null, reviewStatus: 'approved', notes: null });
        store.measurementItems.push({ id: mid, questionId: qid, questionVersion: 1, atomId: id, dimension: 'procedure', family: `${id}-family${index % 4}`,
          probeRole: 'anchor', expectedSeconds: 15, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch', version: 1 });
      }
    }
    await call('put', `/students/${studentId}/learning-scope`, {
      subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '通用基础',
      learnedAtomIds: ['target', 'unmapped'], currentAtomId: 'target', minutesPerSession: 15,
    });
  });
  afterAll(async () => { await app.close(); if (originalKey) process.env.OPENAI_API_KEY = originalKey; });
  afterEach(() => { vi.useRealTimers(); });
  async function call(method: 'post' | 'get' | 'put' | 'patch', path: string, body?: unknown, status?: number, actor?: any) {
    let query = request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${(actor ?? owner).token}`);
    if (body !== undefined) query = query.send(body as object);
    const response = await query.expect(status ?? (method === 'post' ? 201 : 200));
    return response.body.data;
  }
  const start = (extra = {}) => call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', maxItems: 8,
    includePrerequisites: true, ...extra });
  const submit = (session: any, item: any, answer: unknown) => call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer, elapsedMs: 1234 });

  it('isolates textbook terms and reviewed lesson maps, snapshots versions and keeps coverage gaps', async () => {
    const books = await call('get', '/diagnostics/textbooks?subject=math&grade=3&term=upper');
    const book = books.find((b: any) => b.source === 'original');
    const details = await call('get', `/diagnostics/textbooks/${encodeURIComponent(book.id)}`);
    const lessons = details.chapters.flatMap((c: any) => c.lessons);
    const command = { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: book.id, textbookVersion: '用户填写的显示名',
      progressMode: 'textbook', selectedLessonIds: lessons.map((l: any) => l.id), learnedAtomIds: ['target', 'unmapped'], currentAtomId: 'target', minutesPerSession: 15 };
    await call('put', `/students/${studentId}/learning-scope`, { ...command, term: 'lower' }, 400);
    await call('put', `/students/${studentId}/learning-scope`, { ...command, selectedLessonIds: ['foreign-lesson'] }, 400);
    await call('post', '/admin/curriculum/textbook-mappings', { bookId: book.id, lessonId: 'target', atomIds: ['target'], status: 'candidate', rationale: '还需要对照课时中实际行为再审核' }, 403);
    await call('post', '/admin/curriculum/textbook-mappings', { bookId: book.id, lessonId: 'target', atomIds: ['target'], status: 'candidate', rationale: '还需要对照课时中实际行为再审核' }, 201, admin);
    await call('put', `/students/${studentId}/learning-scope`, command, 400);
    await call('post', '/admin/curriculum/textbook-mappings', { bookId: book.id, lessonId: 'target', atomIds: ['target'], status: 'approved', rationale: '课时与原子点行为直接一致，原有未测点仍单独保留' }, 201, admin);
    const scope = await call('put', `/students/${studentId}/learning-scope`, command);
    expect(scope.textbookVersion).toBe(book.title); expect(scope.textbookRevision).toBe(book.version);
    expect(scope.mappingSnapshots.find((m: any) => m.lessonId === 'target').version).toBe(2);
    const session = await start({ includePrerequisites: false });
    await call('post', '/admin/curriculum/textbook-mappings', { bookId: book.id, lessonId: 'target', atomIds: ['target'], status: 'rejected', rationale: '后续复核发现需要更细分的课时对照' }, 201, admin);
    expect((await call('get', `/diagnostics/sessions/${session.id}`)).scopeSnapshot.mappingSnapshots).toEqual(scope.mappingSnapshots);
    expect(session.coverage.find((c: any) => c.atomId === 'unmapped').selected).toBe(0);
    const coverage = await call('get', '/admin/curriculum/overview?subject=math&grade=3', undefined, 200, admin);
    expect(coverage.atoms.find((a: any) => a.id === 'unmapped').approvedQuestions).toBe(0);
    expect(coverage.cells[0].withQuestions).toBe(1);
    await call('get', '/admin/curriculum/overview', undefined, 403);
  });

  it('keeps atom and measurement revisions and rejects cyclic or unpublishable dependencies', async () => {
    const target = store.knowledgeAtoms.find((a: any) => a.id === 'target');
    const changed = await call('post', '/admin/knowledge-atoms', { ...target, objective: '对照量规逐步完成此项操作并解释关系' }, 201, admin);
    expect(changed.version).toBe(2);
    expect((await call('get', '/admin/curriculum/revisions/target', undefined, 200, admin))[0].snapshot.objective).toContain('对照量规');
    const base = store.knowledgeAtoms.find((a: any) => a.id === 'base');
    await call('post', '/admin/knowledge-atoms', { ...base, prerequisiteIds: ['target'] }, 400, admin);
    await call('post', '/admin/knowledge-atoms', { ...base, status: 'retired' }, 400, admin);
    const mapping = store.measurementItems.find((m: any) => m.atomId === 'target');
    await call('post', '/admin/measurement-items', { ...mapping, questionVersion: 999 }, 400, admin);
    await call('post', '/admin/measurement-items', { ...mapping, reviewStatus: 'draft' }, 201, admin);
    expect((await call('get', `/admin/curriculum/revisions/${encodeURIComponent(mapping.id)}`, undefined, 200, admin))[0].version).toBe(2);
  });

  it('enforces progress, records coverage gaps and preserves question/scope snapshots and first submissions', async () => {
    await start({ targetAtomIds: ['future'] }).then(() => { throw new Error('Expected progress rejection'); }).catch((error) => expect(String(error)).toContain('expected 201'));
    const session = await start();
    expect(session.items.every((item: any) => ['target', 'base'].includes(item.atomId))).toBe(true);
    expect(session.coverage.find((item: any) => item.atomId === 'unmapped').selected).toBe(0);
    expect(session.coverage.find((item: any) => item.atomId === 'base').role).toBe('prerequisite');
    const first = session.items[0];
    store.questions.find((item: any) => item.id === first.questionId).answer = '999';
    store.questions.find((item: any) => item.id === first.questionId).stem = '修改后的题干';
    const rendered = await call('get', `/diagnostics/sessions/${session.id}/items/${first.id}`);
    expect(JSON.stringify(rendered.payload)).not.toContain('999');
    expect(rendered.payload.document.blocks[0].text).not.toContain('修改后的题干');
    const saved = await submit(session, first, 6);
    expect((await submit(session, first, 6)).responseId).toBe(saved.responseId);
    await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: first.id, answer: 7, elapsedMs: 1500 }, 409);
    expect(store.diagnosticResponses.filter((item: any) => item.itemId === first.id)).toHaveLength(1);
    for (const item of session.items.slice(1)) await submit(session, item, 6);
    const report = await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    expect(report.rawScore).toBe(100);
    expect(report.estimates.find((item: any) => item.atomId === 'unmapped').status).toBe('unknown');
    expect(report.estimates.every((item: any) => item.status !== 'secure')).toBe(true);
    const oldScopeId = session.scopeSnapshot.id;
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '通用基础', learnedAtomIds: ['target'], currentAtomId: 'target', minutesPerSession: 10 });
    expect((await call('get', `/diagnostics/sessions/${session.id}`)).scopeSnapshot.id).toBe(oldScopeId);
  });

  it('verifies prerequisite hypotheses, produces budgeted plans without AI and schedules real delayed reviews', async () => {
    const session = await start();
    for (const item of session.items) await submit(session, item, 0);
    const report = await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    const root = report.hypotheses.find((item: any) => item.atomId === 'target' && item.cause === 'prerequisite_gap');
    expect(root.status).toBe('supported');
    expect(root.supportingEvidenceIds.length).toBeGreaterThanOrEqual(2);
    const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 15, useAi: true });
    expect(plan.source).toBe('rules'); expect(plan.aiStatus).toBe('unavailable');
    expect(plan.actions.reduce((sum: number, item: any) => sum + item.minutes, 0)).toBe(15);
    expect(plan.actions[0].atomId).toBe('base');
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision }));
    const reviews = await call('get', `/diagnostics/students/${studentId}/reviews?subject=math`);
    expect(new Set(reviews.map((item: any) => item.intervalDays))).toEqual(new Set([1, 3, 7, 14]));
    await call('post', `/diagnostics/reviews/${reviews[0].id}/start`, {}, 400);
    const probe = await start({ intent: 'verification', hypothesisId: root.id, targetAtomIds: ['base'], maxItems: 4 });
    expect(probe.items.every((item: any) => !session.items.some((old: any) => old.questionId === item.questionId))).toBe(true);
    for (const item of probe.items) await submit(probe, item, 6);
    await call('post', `/diagnostics/sessions/${probe.id}/complete`, {});
    const profile = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`);
    const updated = profile.hypotheses.find((item: any) => item.id === root.id);
    expect(updated.counterEvidenceIds.length).toBeGreaterThanOrEqual(2);
    expect(updated.status).toBe('inconclusive');
    const retrospective = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(retrospective.comparisons.every((item: any) => item.outcome !== 'improved')).toBe(true);
  });

  it('keeps subjective scoring pending and preserves review versions rather than overwriting evidence', async () => {
    const session = await start({ targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    const rawSession = store.diagnosticSessions.find((item: any) => item.id === session.id);
    for (const snapshot of rawSession.questionSnapshots) snapshot.answerSchema.mode = 'short_answer';
    for (const item of session.items) await submit(session, item, '我先按位分析，再检查结果');
    const firstReport = await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    expect(firstReport.pendingReviewCount).toBe(2); expect(firstReport.rawScore).toBeNull();
    const responseId = firstReport.evidence[0].id;
    await call('post', `/admin/diagnostic-responses/${encodeURIComponent(responseId)}/review`, { score: 1, reason: '按该题量规逐步核对，关键步骤正确', requestKey: 'legacy-review', expectedVersion: 0 }, 201, admin);
    const report = await call('get', `/diagnostics/sessions/${session.id}/report`);
    expect(report.pendingReviewCount).toBe(1); expect(report.scoredCount).toBe(1);
    expect(store.diagnosticResponses.find((item: any) => item.id === responseId).score).toBeNull();
    expect(store.diagnosticReports.filter((item: any) => item.sessionId === session.id)).toHaveLength(2);
  });

  async function activatePractice() {
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '通用基础', learnedAtomIds: ['target'], currentAtomId: 'target', minutesPerSession: 10 });
    const baseline = await start({ targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    for (const item of baseline.items) await submit(baseline, item, 0);
    await call('post', `/diagnostics/sessions/${baseline.id}/complete`, {});
    const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 10, useAi: false });
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision }));
    const activity = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {});
    return { baseline, plan, activity };
  }

  it('freezes knowledge definitions through completion and score revision, and separates evidence after semantic changes', async () => {
    const original = structuredClone(store.knowledgeAtoms.find((atom: any) => atom.id === 'target'));
    const session = await start({ targetAtomIds: ['target'], includePrerequisites: false, maxItems: 4 });
    const updated = await call('post', '/admin/knowledge-atoms', { ...original, name: '新的测量目标',
      objective: '对照新条件完成不同的可观察操作并说明依据' }, 201, admin);
    expect((await call('get', `/diagnostics/sessions/${session.id}`)).items.every((item: any) => item.atomName === original.name)).toBe(true);
    await call('post', `/diagnostics/sessions/${session.id}/items/${session.items[0].id}/hint`, {});
    const hint = await call('post', `/diagnostics/sessions/${session.id}/items/${session.items[0].id}/hint`, {});
    expect(hint.hint).toContain(original.objective); expect(hint.hint).not.toContain(updated.objective);
    for (const item of session.items) await submit(session, item, 6);
    const first = await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    expect(first.estimates.find((estimate: any) => estimate.atomId === 'target').atomName).toBe(original.name);
    expect(first.definitionContext.atoms.find((atom: any) => atom.id === 'target').objective).toBe(original.objective);
    expect(first.evidence.every((response: any) => response.atomVersion === 1)).toBe(true);
    await call('post', `/admin/diagnostic-responses/${encodeURIComponent(first.evidence[1].id)}/review`,
      { score: 0, reason: '合成评分修订，用于核查旧知识定义不被当前定义替换', requestKey: 'definition-review', expectedVersion: 0 }, 201, admin);
    const revised = await call('get', `/diagnostics/sessions/${session.id}/report`);
    expect(revised.definitionContext.atoms).toEqual(first.definitionContext.atoms);
    expect(revised.estimates.find((estimate: any) => estimate.atomId === 'target').atomName).toBe(original.name);
    const profile = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`);
    expect(profile.estimates.find((estimate: any) => estimate.atomId === 'target').scoredCount).toBe(0);
    expect(profile.definitionCompatibility.incompatibleEvidenceIds).toHaveLength(4);
    await call('post', '/diagnostics/sessions', { studentId, subject: 'math', targetAtomIds: ['target'], maxItems: 2 }, 400);
    const coverage = await call('get', '/admin/curriculum/overview?subject=math', undefined, 200, admin);
    expect(coverage.atoms.find((atom: any) => atom.id === 'target').approvedQuestions).toBe(0);
    expect(coverage.atoms.find((atom: any) => atom.id === 'target').definitionGaps).toBe(32);
    const staleMappings = await call('get', '/admin/curriculum/atoms/target/items', undefined, 200, admin);
    expect(staleMappings.every((item: any) => !item.eligible && item.definitionIssue.includes('知识定义'))).toBe(true);
    for (const mapping of store.measurementItems.filter((mapping: any) => mapping.atomId === 'target').slice(0, 8))
      await call('post', '/admin/measurement-items', structuredClone(mapping), 201, admin);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(Date.now() + 2 * 86_400_000));
    owner = await auth.login({ principal: 'diagnostic-parent@test', credential: 'diagnostic-secret-123' }, 'definition-renew');
    const next = await start({ intent: 'retest', targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    for (const item of next.items) await submit(next, item, 6);
    const nextReport = await call('post', `/diagnostics/sessions/${next.id}/complete`, {});
    expect(nextReport.evidence.every((response: any) => response.retentionDelayDays === null && response.dimension === 'procedure')).toBe(true);
    expect(nextReport.definitionContext.incompatibleEvidenceIds).toHaveLength(4);
    expect(nextReport.estimates.find((estimate: any) => estimate.atomId === 'target').scoredCount).toBe(2);
    admin = await auth.login({ principal: 'diagnostic-reviewer@test', credential: 'diagnostic-secret-123' }, 'definition-admin-renew');
    await call('post', `/admin/diagnostic-responses/${encodeURIComponent(first.evidence[2].id)}/review`,
      { score: 0, reason: '修订另一旧定义作答，不应使当前不同定义报告失效', requestKey: 'old-definition-review', expectedVersion: 0 }, 201, admin);
    expect((await call('get', `/diagnostics/sessions/${next.id}/report`)).version).toBe(1);
  });

  it('keeps labels and teaching revisions comparable while preserving historical names', async () => {
    const { baseline, plan } = await activatePractice();
    const original = store.knowledgeAtoms.find((atom: any) => atom.id === 'target');
    await call('post', '/admin/knowledge-atoms', { ...original, name: '更清楚的展示名称', strand: '更新展示领域', curriculumVersion: 'metadata-v2' }, 201, admin);
    const profile = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`);
    expect(profile.estimates.find((estimate: any) => estimate.atomId === 'target').scoredCount).toBe(2);
    expect(profile.definitionCompatibility.incompatibleEvidenceIds).toHaveLength(0);
    expect((await call('get', `/diagnostics/sessions/${baseline.id}/report`)).estimates[0].atomName).toBe('target');
    expect((await call('get', `/diagnostics/plans/${plan.id}`)).impact.needsReview).toBe(false);
    expect((await start({ targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 })).items.length).toBe(2);
  });

  it('blocks new guidance and verification after changed definitions while retaining started practice', async () => {
    const { baseline, plan, activity } = await activatePractice();
    const original = structuredClone(store.knowledgeAtoms.find((atom: any) => atom.id === 'target'));
    await call('post', '/admin/knowledge-atoms', { ...original, name: '调整后的新知识目标', objective: '改成另一个可观察行为，不能用于旧练习提示',
      successCriterion: '新条件下完成不同的步骤并给出新的核对依据' }, 201, admin);
    const current = await call('get', `/diagnostics/plans/${plan.id}`);
    expect(current.impact.definitionChangedActionIds).toEqual([plan.actions[0].id]); expect(current.impact.needsReview).toBe(true);
    await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 10, useAi: false }, 409);
    await call('post', '/diagnostics/sessions', { studentId, subject: 'math', planId: plan.id, intent: 'verification', maxItems: 2 }, 409);
    const hypothesis = store.diagnosticHypotheses.find((item: any) => item.atomId === 'target');
    await call('post', '/diagnostics/sessions', { studentId, subject: 'math', hypothesisId: hypothesis.id, intent: 'verification', maxItems: 2 }, 409);
    await call('post', `/diagnostics/plans/${plan.id}/adjust`, { expectedRevision: plan.revision, requestKey: 'definition-adjust', reason: '修改活动不能绕过知识定义核对',
      acknowledgeReportVersion: 1, minutesPerDay: 10, actions: plan.actions.map((action: any) => ({ actionId: action.id, minutes: 10, activity: '重新说明步骤并进行独立核查。' })) }, 409);
    expect((await call('get', `/learning/practice/${activity.id}`)).action).toEqual(activity.action);
    expect((await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {})).id).toBe(activity.id);
    await call('post', `/learning/practice/${activity.id}/questions/${activity.questions[0].id}/hint`, {});
    const hint = await call('post', `/learning/practice/${activity.id}/questions/${activity.questions[0].id}/hint`, {});
    expect(hint.hint).toContain(original.objective);
    expect((await call('get', `/learning/students/${studentId}/mistakes?subject=math`)).every((row: any) => row.atomName === original.name)).toBe(true);
  });

  it('preserves legacy reports without fabricating definition provenance or reusing unverifiable evidence', async () => {
    const { baseline, plan, activity } = await activatePractice();
    delete store.diagnosticSessions.find((session: any) => session.id === baseline.id).atomSnapshots;
    for (const response of store.diagnosticResponses) { delete response.atomDefinitionFingerprint; delete response.atomVersion; }
    delete store.diagnosticReports.find((report: any) => report.sessionId === baseline.id).report.definitionContext;
    const report = await call('get', `/diagnostics/sessions/${baseline.id}/report`);
    expect(report.definitionContext.origin).toBe('unavailable'); expect(report.evidence).toHaveLength(2);
    const profile = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`);
    expect(profile.estimates.find((estimate: any) => estimate.atomId === 'target').status).toBe('unknown');
    expect(profile.definitionCompatibility.unverifiedEvidenceIds).toHaveLength(2);
    expect((await call('get', `/diagnostics/plans/${plan.id}`)).impact.definitionUnverifiedActionIds).toEqual([plan.actions[0].id]);
    await call('post', '/diagnostics/sessions', { studentId, subject: 'math', planId: plan.id, intent: 'verification', maxItems: 2 }, 409);
    expect((await call('get', `/learning/practice/${activity.id}`)).action).toEqual(activity.action);
    await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 10, useAi: false }, 400);
    expect(store.diagnosticReports.find((report: any) => report.sessionId === baseline.id).report.definitionContext).toBeUndefined();
  });

  it('excludes different-definition linked followups and keeps unrelated assessments out of the review fingerprint', async () => {
    const { plan } = await activatePractice();
    const followup = await start({ planId: plan.id, intent: 'verification', targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    for (const item of followup.items) await submit(followup, item, 6);
    await call('post', `/diagnostics/sessions/${followup.id}/complete`, {});
    expect((await call('get', `/diagnostics/plans/${plan.id}/retrospective`)).independentFollowupCount).toBe(2);
    // Simulate a pre-upgrade linked historical observation with a different definition.
    const raw = store.diagnosticSessions.find((session: any) => session.id === followup.id);
    raw.atomSnapshots.find((atom: any) => atom.id === 'target').objective = '采用另一组条件完成不同的可观察行为';
    const { atomDefinitionFingerprint } = require('../../../dist/apps/api/src/modules/diagnostics/measurement-definition.js');
    const fingerprint = atomDefinitionFingerprint(raw.atomSnapshots.find((atom: any) => atom.id === 'target'));
    for (const response of store.diagnosticResponses.filter((response: any) => response.sessionId === raw.id)) response.atomDefinitionFingerprint = fingerprint;
    const review = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(review.followupSessionIds).toHaveLength(0); expect(review.definitionCompatibility.incompatibleEvidenceIds).toHaveLength(2);
    expect(review.comparisons[0].outcome).toBe('different_definitions');
    const unrelated = await start({ targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    for (const item of unrelated.items) await submit(unrelated, item, 6);
    await call('post', `/diagnostics/sessions/${unrelated.id}/complete`, {});
    expect((await call('get', `/diagnostics/plans/${plan.id}/retrospective`)).fingerprint).toBe(review.fingerprint);
    await call('post', `/diagnostics/plans/${plan.id}/retrospective/acknowledge`, { expectedRevision: plan.revision,
      requestKey: 'incompatible-followup', fingerprint: review.fingerprint, reason: '不同定义的后测不能作为本计划已验证的依据' }, 400);
  });

  it('versions parent adjustments, enforces budgets and idempotency, and freezes started activities', async () => {
    const { plan, activity } = await activatePractice();
    const schedule = await call('get', `/diagnostics/plans/${plan.id}/reviews`);
    const originalActivity = structuredClone(activity.action);
    const adjustment = { expectedRevision: plan.revision, requestKey: 'adjustment-one', reason: '先让孩子口述思路，再缩短连续练习时间。',
      acknowledgeReportVersion: 1, minutesPerDay: 12,
      actions: plan.actions.map((a: any) => ({ actionId: a.id, minutes: 12, activity: '先口述已知条件和计算步骤，再分两次独立完成新题。' })) };
    await call('post', `/diagnostics/plans/${plan.id}/adjust`, { ...adjustment, minutesPerDay: 11 }, 400);
    const outsider = await auth.register({ principal: 'plan-outsider@test', credential: 'outsider-secret-123' }, 'plan-outsider');
    await call('post', `/diagnostics/plans/${plan.id}/adjust`, adjustment, 403, outsider);
    const updated = await call('post', `/diagnostics/plans/${plan.id}/adjust`, adjustment);
    expect(updated.revision).toBe(3); expect(updated.source).toBe('human'); expect(updated.actions[0].minutes).toBe(12);
    expect((await call('post', `/diagnostics/plans/${plan.id}/adjust`, adjustment)).revision).toBe(3);
    await call('post', `/diagnostics/plans/${plan.id}/adjust`, { ...adjustment, reason: '同一请求键不可以覆盖先前的活动内容。' }, 409);
    await call('post', `/diagnostics/plans/${plan.id}/adjust`, { ...adjustment, requestKey: 'stale-adjustment' }, 409);
    const history = await call('get', `/diagnostics/plans/${plan.id}/history`);
    expect(history.map((h: any) => h.revision)).toEqual([3, 2, 1]);
    expect(history[2].snapshot.actions[0].activity).toBe(originalActivity.activity);
    expect((await call('get', `/diagnostics/plans/${plan.id}/reviews`)).map((r: any) => r.dueAt)).toEqual(schedule.map((r: any) => r.dueAt));
    const resumed = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {});
    expect(resumed.action).toEqual(originalActivity); expect(resumed.planRevision).toBe(2); expect(resumed.currentPlanRevision).toBe(3);
    await call('get', `/diagnostics/plans/${plan.id}/history`, undefined, 403, outsider);
  });

  it('excludes incomplete interaction configuration and never scores a frozen unusable item as a student failure', async () => {
    const session = await start({ targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    for (const schema of store.questionAnswerSchemas.filter((s: any) => s.questionId.startsWith('target-'))) schema.mode = 'sorting';
    const overview = await call('get', '/admin/curriculum/overview?subject=math&grade=3', undefined, 200, admin);
    expect(overview.atoms.find((atom: any) => atom.id === 'target')).toMatchObject({ approvedQuestions: 0, interactionGaps: 32 });
    const mappings = await call('get', '/admin/curriculum/atoms/target/items', undefined, 200, admin);
    expect(mappings.every((item: any) => !item.eligible && item.inputIssue.includes('排序'))).toBe(true);
    await call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', maxItems: 2, targetAtomIds: ['target'], includePrerequisites: false }, 400);
    const raw = store.diagnosticSessions.find((s: any) => s.id === session.id);
    for (const snapshot of raw.questionSnapshots) snapshot.answerSchema.mode = 'sorting';
    for (const item of session.items) {
      await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, disposition: 'dont_know', elapsedMs: 100 }, 400);
      await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, disposition: 'skip', elapsedMs: 100 });
    }
    const report = await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    expect(report.scoredCount).toBe(0); expect(report.rawScore).toBeNull();
    expect(report.evidence.every((item: any) => item.status === 'skipped' && item.score === null)).toBe(true);
  });

  it('retains reschedule history and original intervals, blocks bypasses, and does not reset dates on resume', async () => {
    const { plan } = await activatePractice();
    const reviews = await call('get', `/diagnostics/plans/${plan.id}/reviews`), review = reviews[0];
    const command = { expectedPlanRevision: plan.revision, expectedScheduleRevision: 1, requestKey: 'schedule-one',
      dueAt: new Date(Date.parse(review.dueAt) + 86_400_000).toISOString(), reason: '明天外出，向后调整一天并保留延迟测量间隔。' };
    await call('post', `/diagnostics/reviews/${review.id}/reschedule`, { ...command, dueAt: new Date(Date.parse(review.dueAt) - 60_000).toISOString() }, 400);
    await call('post', `/diagnostics/reviews/${review.id}/reschedule`, { ...command, dueAt: new Date(Date.now() + 91 * 86_400_000).toISOString() }, 400);
    const changed = await call('post', `/diagnostics/reviews/${review.id}/reschedule`, command);
    expect(changed.scheduleRevision).toBe(2); expect(changed.earliestDueAt).toBe(review.dueAt);
    expect(changed.scheduleHistory[0].previousDueAt).toBe(review.dueAt);
    expect((await call('post', `/diagnostics/reviews/${review.id}/reschedule`, command)).scheduleHistory).toHaveLength(1);
    await call('post', `/diagnostics/reviews/${review.id}/reschedule`, { ...command, reason: '同一请求键不能代表另一种安排。' }, 409);
    await call('post', `/diagnostics/reviews/${review.id}/reschedule`, { ...command, requestKey: 'schedule-stale' }, 409);
    await start({ intent: 'retest', reviewTaskId: review.id, targetAtomIds: [review.atomId] }).then(() => { throw new Error('Expected due-time rejection'); }).catch(e => expect(String(e)).toContain('expected 201'));
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'paused', expectedRevision: plan.revision }));
    expect((await call('get', `/diagnostics/plans/${plan.id}/reviews`))).toHaveLength(4);
    expect((await call('get', `/diagnostics/students/${studentId}/reviews?subject=math`))).toHaveLength(0);
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision }));
    expect((await call('get', `/diagnostics/plans/${plan.id}/reviews`))[0].dueAt).toBe(changed.dueAt);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.parse(changed.dueAt) + 1_000);
    owner = await auth.login({ principal: 'diagnostic-parent@test', credential: 'diagnostic-secret-123' }, 'schedule-renew');
    const session = await call('post', `/diagnostics/reviews/${review.id}/start`, {});
    expect(session.planId).toBe(plan.id); expect(session.planRevision).toBe(plan.revision);
    await call('post', `/diagnostics/reviews/${review.id}/reschedule`, { ...command, requestKey: 'schedule-started', expectedPlanRevision: plan.revision, expectedScheduleRevision: 2,
      dueAt: new Date(Date.now() + 86_400_000).toISOString() }, 400);
    expect((await call('post', `/diagnostics/reviews/${review.id}/start`, {})).id).toBe(session.id);
  });

  it('requires linked independent followups and current evidence acknowledgement before closing a real review cycle', async () => {
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '通用基础', learnedAtomIds: ['target'], currentAtomId: 'target', minutesPerSession: 15 });
    const baseline = await start({ targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    for (const item of baseline.items) await submit(baseline, item, 6);
    await call('post', `/diagnostics/sessions/${baseline.id}/complete`, {});
    const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 10, useAi: false });
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision }));
    const unrelated = await start({ intent: 'verification', targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    for (const item of unrelated.items) await submit(unrelated, item, 6);
    await call('post', `/diagnostics/sessions/${unrelated.id}/complete`, {});
    let retrospective = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(retrospective.followupSessionIds).toEqual([]);
    const ack = (fingerprint: string, requestKey: string) => ({ expectedRevision: plan.revision, requestKey, fingerprint, reason: '已核对前后证据；迁移和保持样本仍需继续补充，不能宣称完全掌握。' });
    await call('post', `/diagnostics/plans/${plan.id}/retrospective/acknowledge`, ack(retrospective.fingerprint, 'ack-empty'), 400);
    const linked = await start({ intent: 'verification', planId: plan.id, targetAtomIds: ['target'], includePrerequisites: false, maxItems: 2 });
    for (const item of linked.items) await submit(linked, item, 6);
    await call('post', `/diagnostics/sessions/${linked.id}/complete`, {});
    retrospective = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(retrospective.followupSessionIds).toEqual([linked.id]); expect(retrospective.comparisons[0].outcome).toBe('insufficient');
    const firstAcknowledgement = ack(retrospective.fingerprint, 'ack-initial');
    Object.assign(plan, await call('post', `/diagnostics/plans/${plan.id}/retrospective/acknowledge`, firstAcknowledgement));
    expect((await call('post', `/diagnostics/plans/${plan.id}/retrospective/acknowledge`, firstAcknowledgement)).revision).toBe(plan.revision);
    await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'completed', expectedRevision: plan.revision }, 400);
    const reviews = await call('get', `/diagnostics/plans/${plan.id}/reviews`);
    vi.useFakeTimers({ toFake: ['Date'] });
    for (const review of reviews) {
      vi.setSystemTime(Date.parse(review.dueAt) + 60_000);
      owner = await auth.login({ principal: 'diagnostic-parent@test', credential: 'diagnostic-secret-123' }, `cycle-renew-${review.intervalDays}`);
      const next = await call('post', `/diagnostics/reviews/${review.id}/start`, {});
      for (const item of next.items) await submit(next, item, 6);
      await call('post', `/diagnostics/sessions/${next.id}/complete`, {});
    }
    await call('post', `/diagnostics/plans/${plan.id}/retrospective/acknowledge`, ack(retrospective.fingerprint, 'ack-stale-evidence'), 409);
    await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'completed', expectedRevision: plan.revision }, 400);
    retrospective = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(retrospective.reviewed).toBe(false); expect(retrospective.comparisons[0].retentionSamples).toBeGreaterThan(0);
    expect(retrospective.comparisons[0].outcome).not.toBe('different_dimensions');
    Object.assign(plan, await call('post', `/diagnostics/plans/${plan.id}/retrospective/acknowledge`, ack(retrospective.fingerprint, 'ack-current')));
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'completed', expectedRevision: plan.revision, requestKey: 'finish-cycle' }));
    expect(plan.status).toBe('completed');
    expect((await call('get', `/diagnostics/plans/${plan.id}/reviews`)).every((r: any) => r.status === 'completed')).toBe(true);
    await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision }, 400);
    expect((await call('get', `/diagnostics/students/${studentId}/profile?subject=math`)).estimates.find((e: any) => e.atomId === 'target').status).not.toBe('secure');
  });

  it('persists practice drafts, counts unique questions and keeps hinted/retried training out of ability evidence', async () => {
    const { baseline, plan, activity } = await activatePractice();
    expect((await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {})).id).toBe(activity.id);
    const qid = activity.questions[0].id;
    const path = `/learning/practice/${activity.id}`;
    const rendered = await call('get', `${path}/questions/${qid}`);
    expect(rendered.feedback).toBeNull(); expect(rendered.payload.answerSchema.gradingConfig).toEqual({});
    await call('patch', `${path}/questions/${qid}/draft`, { answer: { value: '6' } });
    expect((await call('get', `${path}/questions/${qid}`)).draft.answer).toEqual({ value: '6' });
    await call('post', `${path}/questions/${qid}/hint`, {});
    const command = { questionId: qid, requestKey: 'first', answer: 0, elapsedMs: 3000 };
    const first = await call('post', `${path}/responses`, command);
    expect(first.attempt.hintLevel).toBe(1); expect(first.attempt.solutionExposedBefore).toBe(false);
    expect((await call('post', `${path}/responses`, command)).attempt.id).toBe(first.attempt.id);
    await call('post', `${path}/responses`, { ...command, answer: 6 }, 409);
    const retry = await call('post', `${path}/responses`, { ...command, requestKey: 'retry', answer: 6 });
    expect(retry.attempt.correct).toBe(true); expect(retry.attempt.solutionExposedBefore).toBe(true);
    expect((await call('get', path)).summary.attempted).toBe(1);
    await call('post', `${path}/complete`, {}, 400);
    for (const item of activity.questions.slice(1)) await call('post', `${path}/responses`, { questionId: item.id, requestKey: item.id, disposition: 'skip', elapsedMs: 0 });
    const completed = await call('post', `${path}/complete`, {});
    expect(completed.summary.independentFirstPass).toBe(0);
    expect(completed.summary.answered).toBe(1);
    expect(completed.summary.skipped).toBe(activity.questions.length - 1);
    expect((await call('post', `${path}/complete`, {})).status).toBe('completed');
    expect(store.diagnosticResponses).toHaveLength(baseline.items.length);
    const probe = await start({ intent: 'verification', targetAtomIds: ['target'], includePrerequisites: false, maxItems: 4 });
    expect(probe.items.every((item: any) => !activity.questions.some((old: any) => old.id === item.questionId))).toBe(true);
    const today = await call('get', `/learning/students/${studentId}/today?subject=math`);
    expect(today.activities[0].status).toBe('completed');
    const mistakes = await call('get', `/learning/students/${studentId}/mistakes?subject=math`);
    expect(mistakes.some((item: any) => item.kind === 'practice' && item.questionId === qid)).toBe(true);
  });

  it('enforces practice ownership and pause, and leaves subjective practice pending for review', async () => {
    const { plan, activity } = await activatePractice();
    const path = `/learning/practice/${activity.id}`, qid = activity.questions[0].id;
    const outsider = await auth.register({ principal: 'practice-outsider@test', credential: 'outsider-secret-123' }, 'fixture-outsider');
    await call('get', path, undefined, 403, outsider);
    await call('post', `${path}/responses`, { questionId: qid, requestKey: 'x', answer: 6, elapsedMs: 0 }, 403, outsider);
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'paused', expectedRevision: plan.revision }));
    await call('post', `${path}/responses`, { questionId: qid, requestKey: 'x', answer: 6, elapsedMs: 0 }, 400);
    await call('patch', `${path}/questions/${qid}/draft`, { answer: 'x' }, 400);
    await call('post', `${path}/questions/${qid}/hint`, {}, 400);
    Object.assign(plan, await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision }));
    store.practiceSessions.find((item: any) => item.id === activity.id).snapshots[0].answerSchema.mode = 'short_answer';
    const feedback = await call('post', `${path}/responses`, { questionId: qid, requestKey: 'essay', answer: '我把两组数量合在一起', elapsedMs: 2000 });
    expect(feedback.attempt.status).toBe('pending_review'); expect(feedback.attempt.score).toBeNull();
    const overview = await call('get', '/learning/overview');
    expect(overview.children).toHaveLength(1); expect(overview.children[0].subjects[0].week.completedActivities).toBe(0);
    expect((await call('get', '/learning/overview', undefined, 200, outsider)).children).toHaveLength(0);
    expect((await call('get', '/learning/students', undefined, 200, outsider))).toHaveLength(0);
    expect((await call('get', '/learning/students', undefined, 200, admin))[0].id).toBe(studentId);
  });
  it('retires the prototype mutation and correctness-report APIs with an explicit upgrade response', async () => {
    for (const path of ['/assessments/start', '/assessments/old/answers', '/missions/old/answers', '/plans/weekly/generate']) {
      const response = await request(app.getHttpServer()).post(`/api${path}`).set('Authorization', `Bearer ${owner.token}`).send({ studentId }).expect(410);
      expect(response.body.error.message).toContain('学习流程已升级');
    }
    await call('get', `/reports/weekly?studentId=${studentId}`, undefined, 410);
    await call('get', `/progress/mastery-heatmap?studentId=${studentId}`, undefined, 410);
    expect(store.assessments).toHaveLength(0); expect(store.practiceAttempts).toHaveLength(0);
  });
});
