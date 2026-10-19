import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

describe('hypothesis-bound contrast groups through authenticated APIs', () => {
  let app: any, store: any, auth: any, owner: any, admin: any, outsider: any;
  beforeAll(async () => {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  afterAll(async () => { await app?.close(); });
  async function call(method: 'get' | 'post' | 'put', path: string, body?: unknown, expected = method === 'post' ? 201 : 200, actor = owner) {
    const query = request(app.getHttpServer())[method]('/api' + path).set('Authorization', `Bearer ${actor.token}`);
    return (await (body === undefined ? query : query.send(body as object)).expect(expected)).body.data;
  }
  const begin = (extra = {}) => call('post', '/diagnostics/sessions', { studentId: 'child', subject: 'math', intent: 'baseline',
    targetAtomIds: ['target'], includePrerequisites: false, maxItems: 8, ...extra });
  const submit = (session: any, item: any, extra = {}) => call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer: 6, elapsedMs: 1000, ...extra });
  const complete = (session: any) => call('post', `/diagnostics/sessions/${session.id}/complete`, {});
  const report = (session: any) => call('get', `/diagnostics/sessions/${session.id}/report`);
  const preview = (id: string, extra = {}, actor = owner) => call('post', '/diagnostics/blueprints', { studentId: 'child', subject: 'math',
    intent: 'verification', hypothesisId: id, maxItems: 12, includePrerequisites: true, requestKey: `preview-${crypto.randomUUID()}`, ...extra }, 201, actor);
  beforeEach(async () => {
    store.reset();
    owner = await auth.register({ principal: 'contrast-parent@test', credential: 'contrast-fixture-secret' }, 'contrast-parent');
    admin = await auth.register({ principal: 'contrast-admin@test', credential: 'contrast-fixture-secret' }, 'contrast-admin');
    outsider = await auth.register({ principal: 'contrast-outsider@test', credential: 'contrast-fixture-secret' }, 'contrast-outsider');
    store.users.find((row: any) => row.id === admin.user.id).role = 'admin';
    store.students.push({ id: 'child', userId: 'child-user', nickname: '合成对照QA', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } });
    store.bindings.push({ id: 'binding', studentId: 'child', parentUserId: owner.user.id, relation: 'guardian', status: 'active' });
    for (const [id, grade, prerequisiteIds] of [['far', 1, []], ['base-a', 2, ['far']], ['base-b', 2, []], ['target', 3, ['base-a', 'base-b']], ['future', 6, []]] as const) {
      store.knowledgeAtoms.push({ id, grade, prerequisiteIds, subject: 'math', name: `合成${id}`, strand: 'QA', term: 'both',
        objective: '观察合成独立行为', successCriterion: '核对合成评分标准', curriculumVersion: 'contrast-fixture', status: 'published', version: 1 });
      // Family labels are synthetic allocation fixtures and never added to published teaching assets.
      for (let index = 0; index < 32; index++) {
        const qid = `${id}-q${index}`, dimension = index % 4 < 2 ? 'procedure' : 'transfer';
        store.questions.push({ id: qid, subject: 'math', type: 'objective', stem: `合成对照${qid}：3+3=?`, answer: '6',
          analysis: '合成预期为6', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
        store.questionAnswerSchemas.push({ questionId: qid, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
        store.questionSources.push({ questionId: qid, sourceType: 'internal_authoring', sourceName: '合成对照QA', sourcePathOrUrl: '',
          licenseClass: 'A_INTERNAL', licenseName: 'QA only', importJobId: null, reviewStatus: 'approved', notes: null });
        store.measurementItems.push({ id: `${id}-i${index}`, questionId: qid, questionVersion: 1, atomId: id, dimension, family: `${id}-f${index % 8}`,
          probeRole: dimension === 'transfer' ? 'transfer' : 'anchor', expectedSeconds: 15, difficulty: 1,
          reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch', version: 1 });
      }
    }
    await call('put', '/students/child/learning-scope', { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '合成对照路径', learnedAtomIds: ['target'], currentAtomId: 'target', minutesPerSession: 15 });
  });
  async function baseline(cause: 'representation_gap' | 'prerequisite_gap' = 'representation_gap') {
    const session = await begin(cause === 'prerequisite_gap' ? { includePrerequisites: true, maxItems: 12 } : {});
    for (const item of session.items) await submit(session, item, { answer: cause === 'prerequisite_gap' || item.dimension === 'transfer' ? 0 : 6 });
    const result = await complete(session), hypothesis = result.hypotheses.find((row: any) => row.atomId === 'target' && row.cause === cause);
    expect(hypothesis.status).toBe('supported'); return { session, hypothesis };
  }

  it('freezes both base and transfer groups, collects independent contrasts and preserves the initial specification', async () => {
    const { hypothesis } = await baseline(), plan = await preview(hypothesis.id);
    expect(plan.itemCount).toBe(4); expect(plan.blueprint.verification.fullyCovered).toBe(true);
    expect(plan.coverage[0]).toMatchObject({ atomId: 'target', selected: 4, required: 4 });
    const session = await call('post', `/diagnostics/blueprints/${plan.id}/start`, {});
    expect(session.blueprint).toEqual(plan.blueprint);
    for (const item of session.items) await submit(session, item, { answer: item.dimension === 'transfer' ? 0 : 6 });
    const result = await complete(session);
    expect(result.verification.independentObservationsComplete).toBe(true);
    expect(result.verification.groups.map((row: any) => [row.independentFamilies, row.passedFamilies, row.belowStandardFamilies])).toEqual([[2, 2, 0], [2, 0, 2]]);
    expect(result.verification.blueprint).toEqual(plan.blueprint.verification);
    expect((await call('post', `/diagnostics/blueprints/${plan.id}/start`, {})).id).toBe(session.id);
  });

  it('defaults to the target and every direct prerequisite, excluding more distant ancestors', async () => {
    const { hypothesis } = await baseline('prerequisite_gap'), plan = await preview(hypothesis.id);
    expect(new Set(plan.blueprint.verification.groups.map((row: any) => row.atomId))).toEqual(new Set(['target', 'base-a', 'base-b']));
    expect(new Set(plan.coverage.map((row: any) => row.atomId))).toEqual(new Set(['target', 'base-a', 'base-b']));
    expect(plan.blueprint.targetAtomIds).toEqual(['target']); expect(plan.blueprint.prerequisiteAtomIds).toEqual(['base-a', 'base-b']);
    expect(plan.blueprint.verification.fullyCovered).toBe(true); expect(plan.itemCount).toBe(6);
    const partial = await preview(hypothesis.id, { targetAtomIds: ['base-a'] });
    expect(partial.itemCount).toBe(2); expect(partial.blueprint.verification.fullyCovered).toBe(false);
    expect(partial.blueprint.verification.groups.filter((row: any) => row.atomId !== 'base-a').every((row: any) => row.gap.includes('未安排'))).toBe(true);
    expect(partial.blueprint.verification.groups.every((row: any) => row.atomName === `合成${row.atomId}`)).toBe(true);
    const scoped = await preview(hypothesis.id, { includePrerequisites: false });
    expect(scoped.coverage.map((row: any) => row.atomId)).toEqual(['target']); expect(scoped.blueprint.verification.fullyCovered).toBe(false);
    await call('post', '/diagnostics/blueprints', { studentId: 'child', subject: 'math', intent: 'verification', hypothesisId: hypothesis.id,
      includePrerequisites: false, targetAtomIds: ['base-a'], requestKey: crypto.randomUUID() }, 400);
  });

  it('retains real missing dimensions and budget gaps without substituting other questions', async () => {
    const { hypothesis } = await baseline();
    for (const row of store.measurementItems.filter((row: any) => row.atomId === 'target' && row.dimension === 'transfer')) row.reviewStatus = 'draft';
    const plan = await preview(hypothesis.id);
    expect(plan.itemCount).toBe(2); expect(plan.canStart).toBe(true); expect(plan.blueprint.verification.fullyCovered).toBe(false);
    expect(plan.blueprint.verification.groups[1]).toMatchObject({ availableFamilies: 0, selectedFamilies: [] });
    expect(plan.blueprint.verification.groups[1].gap).toContain('缺少该维度');
    const session = await call('post', `/diagnostics/blueprints/${plan.id}/start`, {});
    for (const item of session.items) await submit(session, item);
    expect((await complete(session)).verification.independentObservationsComplete).toBe(false);
  });

  it('keeps prompted, self-reported, skipped and pending work out of independent counts', async () => {
    const { hypothesis } = await baseline(), plan = await preview(hypothesis.id);
    const session = await call('post', `/diagnostics/blueprints/${plan.id}/start`, {});
    const [hinted, reported, skipped, pending] = session.items;
    await call('post', `/diagnostics/sessions/${session.id}/items/${hinted.id}/hint`, {});
    await submit(session, hinted); await submit(session, reported, { answer: undefined, disposition: 'dont_know' });
    await submit(session, skipped, { answer: undefined, disposition: 'skip' });
    const raw = store.diagnosticSessions.find((row: any) => row.id === session.id);
    raw.questionSnapshots.find((row: any) => row.id === pending.questionId).answerSchema.mode = 'short_answer';
    await submit(session, pending, { answer: '需要量规复核的独立表达' });
    const result = await complete(session);
    expect(result.verification.independentObservationsComplete).toBe(false);
    const groups = result.verification.groups;
    expect(groups.every((row: any) => row.independentFamilies === 0)).toBe(true);
    expect(groups.reduce((n: number, row: any) => n + row.assistedOrExposed, 0)).toBe(1);
    expect(groups.reduce((n: number, row: any) => n + row.selfReportedOrSkipped, 0)).toBe(2);
    expect(groups.reduce((n: number, row: any) => n + row.awaitingReview, 0)).toBe(1);
  });

  it('updates actual observations after rubric reviews while freezing every earlier report and original response', async () => {
    const { hypothesis } = await baseline(), plan = await preview(hypothesis.id);
    const session = await call('post', `/diagnostics/blueprints/${plan.id}/start`, {});
    const raw = store.diagnosticSessions.find((row: any) => row.id === session.id);
    for (const snapshot of raw.questionSnapshots) {
      snapshot.answerSchema.mode = 'short_answer'; snapshot.answerSchema.gradingConfig = { rubric: [{ criterion: '合成解释满足条件', weight: 1 }] };
    }
    for (const item of session.items) await submit(session, item, { answer: '我的独立解释过程' });
    await complete(session); const initial = await report(session);
    expect(initial.verification.groups.reduce((n: number, row: any) => n + row.awaitingReview, 0)).toBe(4);
    for (const evidence of initial.evidence) await call('post', `/admin/diagnostic-responses/${encodeURIComponent(evidence.id)}/review`, {
      ratings: [{ criterionIndex: 0, score: 1, observation: '逐条核对独立解释符合所设合成条件' }], reason: '按冻结量规复核，保留首次原始作答',
      requestKey: crypto.randomUUID(), expectedVersion: 0 }, 201, admin);
    const latest = await report(session), history = await call('get', `/diagnostics/sessions/${session.id}/report-history`);
    expect(latest.verification.independentObservationsComplete).toBe(true); expect(latest.version).toBe(5);
    expect(latest.verification.groups.every((row: any) => row.passedFamilies === 2 && row.awaitingReview === 0)).toBe(true);
    expect(history.at(-1)).toEqual(initial);
    expect(store.diagnosticResponses.filter((row: any) => row.sessionId === session.id).every((row: any) => row.status === 'pending_review' && row.score === null)).toBe(true);
  });

  it('invalidates a preview when its evidence basis changes and enforces intent, retention, scope and ownership', async () => {
    const { session, hypothesis } = await baseline(), plan = await preview(hypothesis.id);
    const evidence = (await report(session)).evidence[0];
    await call('post', `/admin/diagnostic-responses/${encodeURIComponent(evidence.id)}/review`, { score: 0.5, reason: '合成复核改变既有证据的判断依据',
      requestKey: crypto.randomUUID(), expectedVersion: 0 }, 201, admin);
    await call('post', `/diagnostics/blueprints/${plan.id}/start`, {}, 409);
    for (const intent of ['baseline', 'micro', 'retest']) await begin({ hypothesisId: hypothesis.id, intent }).then(() => { throw new Error('Expected intent rejection'); })
      .catch(error => expect(String(error)).toContain('expected 201'));
    await call('post', '/diagnostics/blueprints', { studentId: 'child', subject: 'math', hypothesisId: hypothesis.id, intent: 'verification',
      targetAtomIds: ['future'], requestKey: crypto.randomUUID() }, 400);
    await call('post', '/diagnostics/blueprints', { studentId: 'child', subject: 'math', hypothesisId: hypothesis.id, intent: 'verification',
      requestKey: crypto.randomUUID() }, 403, outsider);
    const stored = store.diagnosticHypotheses.find((row: any) => row.id === hypothesis.id); stored.cause = 'retention_gap';
    await call('post', '/diagnostics/blueprints', { studentId: 'child', subject: 'math', hypothesisId: hypothesis.id, intent: 'verification',
      requestKey: crypto.randomUUID() }, 400);
    stored.cause = 'representation_gap'; stored.status = 'withdrawn';
    await call('post', '/diagnostics/blueprints', { studentId: 'child', subject: 'math', hypothesisId: hypothesis.id, intent: 'verification',
      requestKey: crypto.randomUUID() }, 409);
  });
});
