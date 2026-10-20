import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { FAMILY_IDENTITY_VERSION } from './family-identity';

// Historical rows below are explicit controlled fixtures, not claimed recovered student records.
describe('family identity upgrades through authenticated HTTP and immutable reports', () => {
  let app: any, store: any, seed: any, diagnostics: any, workspace: any;
  let owner: any, learner: any, outsider: any, admin: any, studentId: string;
  const atomId = 'core:math:brackets';
  const route = (id: string) => `/diagnostics/sessions/${encodeURIComponent(id)}`;
  async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = owner, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor?.token) query = query.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object);
    const result = await query;
    expect(result.status, `${method} ${path}: ${result.body.error?.message ?? ''}`).toBe(expected);
    return result.body.data;
  }
  beforeAll(async () => {
    const from = (file: string) => require(`../../../dist/apps/api/src/${file}.js`);
    app = await NestFactory.create(from('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);
    seed = app.get(from('modules/diagnostics/foundation-seed.service').FoundationSeedService);
    diagnostics = app.get(from('modules/diagnostics/diagnostics.service').DiagnosticsService);
    workspace = app.get(from('modules/question-workspace/question-workspace.service').QuestionWorkspaceService);
  });
  beforeEach(async () => {
    store.reset(); seed.seedAuthoredCurriculum();
    owner = await call('post', '/auth/register', { principal: 'family-owner', credential: 'Family-identity-testing-password' }, undefined);
    outsider = await call('post', '/auth/register', { principal: 'family-outsider', credential: 'Family-identity-testing-password' }, undefined);
    admin = await call('post', '/auth/register', { principal: 'family-admin', credential: 'Family-identity-testing-password' }, undefined);
    store.find('users', { id: admin.user.id }).role = 'admin';
    studentId = (await call('post', '/students', { nickname: '结构核查孩子', grade: 4, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '核对题族升级后的学生报告与家长权限' });
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: crypto.randomUUID() });
    learner = await call('post', '/auth/learning-code', { code: code.code }, undefined);
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null,
      textbookVersion: '原创能力路径', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
  });
  afterAll(async () => { await app?.close(); });
  const command = () => ({ studentId, subject: 'math', intent: 'baseline', targetAtomIds: [atomId], includePrerequisites: false, maxItems: 8 });
  function onlyAliases() {
    for (const mapping of store.measurementItems.filter((row: any) => row.atomId === atomId)) {
      const schema = store.find('questionAnswerSchemas', { questionId: mapping.questionId });
      if (![`${atomId}:bracket-left`, `${atomId}:bracket-right`].includes(mapping.family) || schema?.mode !== 'numeric_blank') mapping.reviewStatus = 'draft';
    }
  }
  async function complete(session: any, correct = false) {
    const raw = store.find('diagnosticSessions', { id: session.id });
    for (const mapping of raw.itemSnapshots) {
      const expected = raw.questionSnapshots.find((row: any) => row.id === mapping.questionId).answer;
      await call('post', route(session.id) + '/responses', { itemId: mapping.id, answer: correct ? expected : Number(expected) + 1, elapsedMs: 1000 }, learner);
    }
    return call('post', route(session.id) + '/complete', {}, learner);
  }
  async function legacySession() {
    onlyAliases();
    const started = await call('post', '/diagnostics/sessions', command(), learner), raw = store.find('diagnosticSessions', { id: started.id });
    const other = store.measurementItems.find((row: any) => row.atomId === atomId && row.reviewStatus === 'approved' && row.family !== raw.itemSnapshots[0].family);
    const question = store.find('questions', { id: other.questionId }), payload = workspace.buildRenderPayload(question.id);
    raw.itemSnapshots.push(structuredClone(other)); raw.itemIds.push(other.id);
    raw.questionSnapshots.push(structuredClone({ id: question.id, stem: question.stem, answer: question.answer, analysis: question.analysis,
      document: payload.document, answerSchema: payload.answerSchema, renderPayload: payload, questionType: question.type }));
    delete raw.blueprint.familyIdentityVersion; raw.blueprint.version = 'verification-blueprint-v1'; raw.algorithmVersion = raw.blueprint.version;
    raw.coverage[0].selected = 2; delete raw.coverage[0].missingReason;
    raw.blueprint.verification = { hypothesisId: 'controlled-legacy-fixture', title: '旧标签对照', cause: 'procedure_gap', ruleVersion: 'diagnosis-rules-v4',
      sourceRuleVersion: 'diagnosis-rules-v4', basisFingerprint: 'controlled-legacy-basis', supportCondition: '旧规则的两个标签', counterCondition: '旧规则的两个标签',
      undecidedCondition: '保留未知', fullyCovered: true, groups: [{ id: 'legacy-basic', atomId, dimensions: ['understanding', 'procedure'],
        purpose: '受控历史蓝图', minIndependentFamilies: 2, availableFamilies: 2, selectedFamilies: raw.itemSnapshots.map((row: any) => row.family), itemIds: [...raw.itemIds] }] };
    return started;
  }
  function markLegacyReport(id: string) {
    const saved = store.diagnosticReports.find((row: any) => row.sessionId === id);
    delete saved.report.familyIdentityVersion; delete saved.report.verification.familyIdentityVersion; delete saved.report.verification.distinctFamilyRequirementsMet;
    saved.report.verification.independentObservationsComplete = true;
    saved.report.verification.groups[0].independentFamilies = 2; saved.report.verification.groups[0].belowStandardFamilies = 2;
    for (const estimate of saved.report.estimates.filter((row: any) => row.atomId === atomId)) {
      delete estimate.familyIdentityVersion; estimate.algorithmVersion = 'rule-estimate-v1'; estimate.independentFamilies = 2;
      estimate.effectiveSamples = 2; estimate.mastery = 25;
      estimate.lower = Number(((1 - Math.pow(0.975, 1 / 3)) * 100).toFixed(1));
      estimate.upper = Number(((1 - Math.pow(0.025, 1 / 3)) * 100).toFixed(1));
      estimate.dimensions.find((row: any) => row.dimension === 'procedure').samples = 2;
    }
    for (const hypothesis of [...saved.report.hypotheses, ...store.diagnosticHypotheses.filter((row: any) => row.atomId === atomId)]) {
      delete hypothesis.familyIdentityVersion; hypothesis.ruleVersion = 'diagnosis-rules-v4'; hypothesis.status = 'supported';
      hypothesis.history.forEach((entry: any) => { entry.ruleVersion = 'diagnosis-rules-v4'; entry.status = 'supported'; });
    }
    return saved;
  }

  it('normalizes real seeded mappings, keeps raw responses and exact-question exposure, and reports the gap', async () => {
    onlyAliases();
    for (let pass = 0; pass < 2; pass++) {
      const session = await call('post', '/diagnostics/sessions', command(), learner);
      expect(session.items).toHaveLength(1); expect(session.coverage[0].missingReason).toContain('不同题族不足');
      const report = await complete(session);
      expect(report.estimates.find((row: any) => row.atomId === atomId).independentFamilies).toBe(1);
      expect(report.hypotheses.find((row: any) => row.cause === 'procedure_gap').status).toBe('proposed');
      expect(report.evidence[0].priorExposure).toBe(false);
      expect(report.evidence[0].family).toMatch(/:bracket-(left|right)$/);
    }
    const profile = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`, undefined, learner);
    expect(profile.estimates.find((row: any) => row.atomId === atomId)).toMatchObject({ independentFamilies: 1, effectiveSamples: 1.5, familyIdentityVersion: FAMILY_IDENTITY_VERSION });
    const overview = await call('get', '/admin/curriculum/overview?subject=math&grade=4', undefined, admin);
    expect(overview.atoms.find((row: any) => row.id === atomId).families).toBe(1);
  });
  it('finishes an already-started legacy group, retaining its blueprint while counting one actual structure', async () => {
    const session = await legacySession(), frozen = structuredClone(store.find('diagnosticSessions', { id: session.id }).blueprint);
    const result = await complete(session);
    expect(result.verification.blueprint).toEqual(frozen.verification);
    expect(result.verification.groups[0].independentFamilies).toBe(1); expect(result.verification.independentObservationsComplete).toBe(false);
    expect((await call('get', route(session.id), undefined, learner)).blueprint).toEqual(frozen);
    expect(result.familyIdentityVersion).toBe(FAMILY_IDENTITY_VERSION);
  });
  it('appends a versioned rule reanalysis, preserves all earlier records, and enforces request and actor boundaries', async () => {
    const session = await legacySession(); await complete(session); const legacy = markLegacyReport(session.id);
    const frozen = structuredClone(legacy), blueprint = structuredClone(store.find('diagnosticSessions', { id: session.id }).blueprint);
    const responses = structuredClone(store.diagnosticResponses), oldView = await call('get', route(session.id) + '/report');
    expect((await call('get', route(session.id) + '/analysis-status', undefined, learner)).requiresReanalysis).toBe(true);
    await call('get', route(session.id) + '/analysis-status', undefined, outsider, 403);
    const input = { requestKey: 'reanalyze-immutable-fixture', expectedReportVersion: 1, reason: '核对旧标签对应的实际任务结构' };
    await call('post', route(session.id) + '/reanalyze', input, learner, 403);
    await call('post', route(session.id) + '/reanalyze', input, outsider, 403);
    const fresh = await call('post', route(session.id) + '/reanalyze', input);
    expect(fresh.version).toBe(2); expect(fresh.familyIdentityVersion).toBe(FAMILY_IDENTITY_VERSION);
    expect(fresh.estimates.find((row: any) => row.atomId === atomId).independentFamilies).toBe(1);
    expect(fresh.hypotheses.find((row: any) => row.cause === 'procedure_gap').status).toBe('proposed');
    expect(fresh.revisionReason).toContain('不等同于学习改善');
    expect(await call('post', route(session.id) + '/reanalyze', input)).toEqual(fresh);
    await call('post', route(session.id) + '/reanalyze', { ...input, reason: '请求键不能绑定不同的核对原因' }, owner, 409);
    await call('post', route(session.id) + '/reanalyze', { ...input, requestKey: 'stale-reanalysis-command' }, owner, 409);
    expect(store.diagnosticReports.filter((row: any) => row.sessionId === session.id)).toHaveLength(2);
    expect(store.diagnosticReports.find((row: any) => row.id === legacy.id)).toEqual(frozen);
    expect((await call('get', route(session.id) + '/report-history')).at(-1)).toEqual(oldView);
    expect(store.find('diagnosticSessions', { id: session.id }).blueprint).toEqual(blueprint); expect(store.diagnosticResponses).toEqual(responses);
    expect((await call('get', route(session.id) + '/analysis-status')).requiresReanalysis).toBe(false);
    expect(store.diagnosticHypotheses.find((row: any) => row.atomId === atomId).history.at(-1).reason).toContain('规则变化不表示学习改善');
  });
  it('invalidates an unstarted legacy preview but replays an already-started legacy reservation', async () => {
    const preview = await call('post', '/diagnostics/blueprints', { ...command(), requestKey: 'legacy-preview-unstarted' });
    const reservation = store.find('diagnosticBlueprints', { id: preview.id });
    const draft = diagnostics.prepareSession(store.find('users', { id: owner.user.id }), reservation.command, undefined, reservation.seed, true);
    delete draft.blueprint.familyIdentityVersion; draft.blueprint.version = 'scope-blueprint-v2';
    reservation.blueprint = structuredClone(draft.blueprint);
    reservation.fingerprint = diagnostics.blueprintFingerprint(draft);
    await call('post', `/diagnostics/blueprints/${encodeURIComponent(preview.id)}/start`, {}, owner, 409);
    const next = await call('post', '/diagnostics/blueprints', { ...command(), requestKey: 'legacy-preview-started' });
    const started = await call('post', `/diagnostics/blueprints/${encodeURIComponent(next.id)}/start`, {});
    const raw = store.find('diagnosticSessions', { id: started.id });
    delete raw.blueprint.familyIdentityVersion; raw.blueprint.version = 'scope-blueprint-v2';
    const frozen = structuredClone(raw.blueprint), replay = await call('post', `/diagnostics/blueprints/${encodeURIComponent(next.id)}/start`, {});
    expect(replay.id).toBe(started.id); expect(replay.blueprint).toEqual(frozen);
  });
  it('holds legacy guidance for reanalysis, then lets a guardian acknowledge the new evidence version', async () => {
    const session = await legacySession(); await complete(session);
    let plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 5, useAi: false });
    markLegacyReport(session.id);
    plan = await call('get', `/diagnostics/plans/${plan.id}`);
    expect(plan.impact).toMatchObject({ needsReview: true, measurementRulesChanged: true });
    await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision, requestKey: 'legacy-plan-activate' }, owner, 409);
    await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 5, useAi: false }, owner, 409);
    const adjustment = { expectedRevision: plan.revision, requestKey: 'acknowledge-updated-family-plan', acknowledgeReportVersion: 2,
      reason: '按合并计量后的证据重新确认指导活动', minutesPerDay: 5,
      actions: plan.actions.map((row: any) => ({ actionId: row.id, minutes: row.minutes, activity: row.activity })) };
    await call('post', `/diagnostics/plans/${plan.id}/adjust`, adjustment, owner, 409);
    await call('post', route(session.id) + '/reanalyze', { requestKey: 'legacy-plan-reanalysis', expectedReportVersion: 1, reason: '先重新核对评测依据，再确认计划' });
    plan = await call('get', `/diagnostics/plans/${plan.id}`);
    expect(plan.impact).toMatchObject({ needsReview: true, measurementRulesChanged: false, currentReportVersion: 2 });
    plan = await call('post', `/diagnostics/plans/${plan.id}/adjust`, adjustment);
    expect(plan.impact.needsReview).toBe(false);
    const retrospective = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(retrospective.measurementContext.familyIdentityVersion).toBe(FAMILY_IDENTITY_VERSION);
    expect(retrospective.measurementContext.notice).toContain('同一套');
    expect(retrospective.comparisons[0].outcome).toBe('awaiting_retest');
    await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision, requestKey: 'updated-plan-activate' });
  });
  it('appends current-rule results on score revision while retaining the legacy report and original answers', async () => {
    const session = await legacySession(); await complete(session); const legacy = structuredClone(markLegacyReport(session.id));
    const response = store.diagnosticResponses.find((row: any) => row.sessionId === session.id), original = structuredClone(response);
    await call('post', `/admin/diagnostic-responses/${encodeURIComponent(response.id)}/review`, { score: 1,
      reason: '受控评分修订核对当前题族规则与冻结响应', expectedVersion: 0, requestKey: 'family-identity-score-revision' }, admin);
    const latest = await call('get', route(session.id) + '/report');
    expect(latest.version).toBe(2); expect(latest.familyIdentityVersion).toBe(FAMILY_IDENTITY_VERSION);
    expect(latest.estimates.find((row: any) => row.atomId === atomId).independentFamilies).toBe(1);
    expect(store.diagnosticReports.find((row: any) => row.id === legacy.id)).toEqual(legacy);
    expect(store.diagnosticResponses.find((row: any) => row.id === response.id)).toEqual(original);
  });
  it('cannot reanalyse an unfinished session or reconstruct missing historical definitions from current content', async () => {
    const session = await legacySession(), input = { requestKey: 'missing-definitions-reanalysis', expectedReportVersion: 1, reason: '核对缺少冻结知识定义时的历史边界' };
    await call('post', route(session.id) + '/reanalyze', input, owner, 409);
    await complete(session); const legacy = markLegacyReport(session.id);
    delete store.find('diagnosticSessions', { id: session.id }).atomSnapshots;
    expect((await call('get', route(session.id) + '/analysis-status')).canReanalyze).toBe(false);
    await call('post', route(session.id) + '/reanalyze', input, owner, 409);
    expect(store.diagnosticReports.filter((row: any) => row.sessionId === session.id)).toHaveLength(1);
    expect(legacy.report.familyIdentityVersion).toBeUndefined();
  });
  it('does not treat self-reported difficulty as an independent follow-up that can authorize a retrospective', async () => {
    const baseline = await legacySession(); await complete(baseline);
    let plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 5, useAi: false });
    plan = await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision, requestKey: 'self-reported-followup-plan' });
    const followup = await call('post', '/diagnostics/sessions', { ...command(), intent: 'verification', planId: plan.id }, learner);
    for (const item of followup.items) await call('post', route(followup.id) + '/responses', { itemId: item.id, disposition: 'dont_know', elapsedMs: 1000 }, learner);
    await call('post', route(followup.id) + '/complete', {}, learner);
    const retrospective = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(retrospective.independentFollowupCount).toBe(0); expect(retrospective.followupSessionIds).toEqual([]);
    await call('post', `/diagnostics/plans/${plan.id}/retrospective/acknowledge`, { expectedRevision: plan.revision, requestKey: 'reject-self-reported-retrospective',
      fingerprint: retrospective.fingerprint, reason: '不能把只有自我报告的后测当成独立验证' }, owner, 400);
  });
});
