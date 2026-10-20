import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { authoredAtomicRelationRelease as atomicRelease, authoredRelationRelease as mixedRelease, reviewedAuthoredRelationMappings } from './authored-relation-release';
import { atomDefinitionFingerprint } from './measurement-definition';
import { blueprintContentHash } from './assessment-blueprint';

describe('atomic component observations through the real services and HTTP', () => {
  let app: any, store: any, seed: any, curriculum: any, owner: any, learner: any, admin: any, studentId: string;
  const parentId = atomicRelease.after.id, childId = 'atomic:math:divisionregroup';
  beforeAll(async () => {
    const from = (file: string) => require(`../../../dist/apps/api/src/${file}.js`);
    const { AppModule } = from('app.module');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);
    seed = app.get(from('modules/diagnostics/foundation-seed.service').FoundationSeedService);
    curriculum = app.get(from('modules/diagnostics/curriculum.service').CurriculumService);
  });
  beforeEach(async () => {
    store.reset(); seed.seedAuthoredCurriculum();
    owner = await call('post', '/auth/register', { principal: 'atomic-owner', credential: 'Atomic-owner-testing-password' }, undefined, 201);
    admin = await call('post', '/auth/register', { principal: 'atomic-admin', credential: 'Atomic-admin-testing-password' }, undefined, 201);
    store.find('users', { id: admin.user.id }).role = 'admin';
    studentId = (await call('post', '/students', { nickname: '步骤核查孩子', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'original', chinese: '', english: '' } }, owner)).profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'atomic-access-request', reason: '验证具体步骤的独立测量闭环' }, owner);
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: 'atomic-learning-code' }, owner);
    learner = await call('post', '/auth/learning-code', { code: code.code }, undefined);
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '原创能力路径', learnedAtomIds: [parentId], currentAtomId: parentId, minutesPerSession: 15 }, owner);
  });
  afterAll(async () => { await app?.close(); });
  async function call(method: 'get' | 'post' | 'put' | 'patch', route: string, body?: unknown, actor = learner, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + route);
    if (actor?.token) query = query.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object);
    const result = await query;
    expect(result.status, `${method} ${route}: ${result.body.error?.message ?? ''}`).toBe(expected); return result.body.data;
  }
  const rawSession = (id: string) => store.find('diagnosticSessions', { id });
  const primary = () => call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline',
    targetAtomIds: [parentId], includePrerequisites: false, maxItems: 12 });
  const complete = async (session: any, change: (item: any, expected: any) => unknown = (_item, expected) => expected) => {
    for (const item of session.items) {
      const expected = structuredClone(rawSession(session.id).questionSnapshots.find((row: any) => row.id === item.questionId).answer);
      await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer: change(item, expected), elapsedMs: 1000 });
    }
    return call('post', `/diagnostics/sessions/${session.id}/complete`, {});
  };
  const bad = (expected: any, schema?: any) => schema?.mode === 'single_choice' ? schema.options.find((option: any) => option.value !== expected).value :
    typeof expected === 'boolean' ? !expected : Array.isArray(expected)
      ? expected.map(entry => ({ ...entry, value: String(Number(entry.value) + 1) })) : typeof expected === 'number' ? expected + 1 : '需要核查';

  it('keeps the child unknown after composite answers, then measures it independently and makes an evidence-bound plan', async () => {
    const baseline = await primary(), original = rawSession(baseline.id);
    expect(original.itemSnapshots.some((item: any) => item.componentBindings?.length)).toBe(true);
    expect(original.atomSnapshots.some((atom: any) => atom.id === childId)).toBe(false);
    expect(original.componentAtomSnapshots.map((atom: any) => atom.id)).toEqual([childId]);
    const report = await complete(baseline, (item, expected) => bad(expected, rawSession(baseline.id).questionSnapshots.find((row: any) => row.id === item.questionId).answerSchema));
    expect(report.componentObservations).toHaveLength(1); expect(report.componentObservations[0].state).toBe('upstream_unverified');
    const profile = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`);
    expect(profile.estimates.find((row: any) => row.atomId === childId).scoredCount).toBe(0);
    await call('post', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', targetAtomIds: [childId], includePrerequisites: false, requestKey: 'not-authorized-scope' }, learner, 400);
    const preview = await call('post', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', targetAtomIds: [childId],
      includePrerequisites: true, maxItems: 12, requestKey: 'independent-child-preview' });
    expect(preview.blueprint.targetAtomIds).toEqual([childId]);
    expect(preview.blueprint.prerequisiteAtomIds).toContain('foundation:math:placevalue');
    const independent = await call('post', `/diagnostics/blueprints/${preview.id}/start`, {});
    expect(independent.items.filter((item: any) => item.atomId === childId)).toHaveLength(4);
    const result = await complete(independent, (item, expected) => item.atomId === childId ? bad(expected) : expected);
    const estimate = result.estimates.find((row: any) => row.atomId === childId);
    expect(estimate.scoredCount).toBe(4); expect(estimate.independentFamilies).toBe(4); expect(estimate.retentionVerified).toBe(false);
    const root = result.hypotheses.find((row: any) => row.atomId === parentId && row.cause === 'prerequisite_gap');
    expect(root.status).toBe('supported'); expect(root.probeAtomIds).toEqual([childId]);
    const check = await call('post', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', hypothesisId: root.id,
      includePrerequisites: true, maxItems: 12, requestKey: 'all-direct-prerequisites' });
    expect(check.blueprint.verification.groups.map((group: any) => group.atomId)).toEqual(expect.arrayContaining([parentId, childId, 'foundation:math:divisiontable', 'foundation:math:placevalue']));
    const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: independent.id, minutesPerDay: 5, useAi: false }, owner);
    expect(plan.actions.map((action: any) => action.atomId)).toEqual([childId]); expect(plan.actions[0].teachingSnapshot.teaching.explanation).toContain('本点给定余十');
    expect(plan.actions[0].evidenceIds).toEqual(estimate.evidenceIds);
    await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision, requestKey: 'activate-atomic-plan' }, owner);
    const reviews = await call('get', `/diagnostics/plans/${plan.id}/reviews`, undefined, owner);
    expect(reviews.map((review: any) => review.intervalDays)).toEqual([1, 3, 7, 14]);
    const family = await call('get', '/learning/overview', undefined, owner);
    const math = family.children[0].subjects.find((row: any) => row.subject === 'math');
    expect(math.subpointEstimates[0].scoredCount).toBe(4); expect(math.componentObservations[0].independentEstimateContribution).toBe(0);
    expect((await call('get', `/students/${studentId}/learning-scope?subject=math`)).learnedAtomIds).toEqual([parentId]);
  }, 30_000);

  it('keeps historical scores frozen, revises observations after review and invalidates previews when the child goal changes', async () => {
    const baseline = await primary();
    const report = await complete(baseline, (item, expected) => rawSession(baseline.id).itemSnapshots.find((row: any) => row.id === item.id).componentBindings?.length
      ? expected.map((entry: any) => entry.key === 'combinedOnes' ? { ...entry, value: String(Number(entry.value) + 1) } : entry) : expected);
    const clue = report.componentObservations[0]; expect(clue.state).toBe('below_standard');
    const evidence = await call('get', `/diagnostics/students/${studentId}/evidence/${encodeURIComponent(clue.responseId)}`);
    expect(evidence.componentObservations[0]).toEqual(clue);
    await call('post', `/admin/diagnostic-responses/${encodeURIComponent(clue.responseId)}/review`, { score: 1, expectedVersion: 0,
      requestKey: 'atomic-score-review', reason: '人工复核总体评分，未给客观空位评分，不能沿用旧分项' }, admin);
    const revised = await call('get', `/diagnostics/sessions/${baseline.id}/report`);
    expect(revised.version).toBe(2); expect(revised.componentObservations[0].state).toBe('not_observed');
    const history = await call('get', `/diagnostics/sessions/${baseline.id}/report-history`);
    expect(history.find((row: any) => row.version === 1).componentObservations[0]).toEqual(clue);
    const preview = await call('post', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [parentId], includePrerequisites: false, requestKey: 'freeze-child-observation' });
    const child = structuredClone(store.find('knowledgeAtoms', { id: childId }));
    await call('post', '/admin/knowledge-atoms', { ...child, objective: '教师重新界定后的原子知识行为与成功目标' }, admin);
    await call('post', `/diagnostics/blueprints/${preview.id}/start`, {}, learner, 409);
    expect((await call('get', `/diagnostics/students/${studentId}/profile?subject=math`)).componentObservations[0].state).toBe('definition_unverified');
    expect(await call('get', `/diagnostics/sessions/${baseline.id}/report`)).toEqual(revised);
  }, 30_000);

  it('reviews only actual fields, stamps the target fingerprint and protects mapping ownership and versions', async () => {
    const item = structuredClone(store.select('measurementItems', { atomId: parentId }).find((row: any) => row.componentBindings?.length));
    for (const patch of [{ scoreKeys: ['unknown'] }, { requiresKeys: ['combinedOnes'] }, { atomId: 'foundation:math:placevalue' }]) {
      await call('post', '/admin/measurement-items', { ...item, componentBindings: [{ ...item.componentBindings[0], ...patch }] }, admin, 400);
    }
    await call('post', '/admin/measurement-items', item, owner, 403);
    const saved = await call('post', '/admin/measurement-items', { ...item, componentBindings: [{ ...item.componentBindings[0], atomDefinitionFingerprint: 'f'.repeat(64) }] }, admin);
    expect(saved.version).toBe(item.version + 1); expect(saved.componentBindings[0].atomDefinitionFingerprint).toBe(atomDefinitionFingerprint(store.find('knowledgeAtoms', { id: childId })));
    await call('post', '/admin/measurement-items', item, admin, 409);
    const cleared = await call('post', '/admin/measurement-items', { ...saved, componentBindings: [] }, admin);
    expect(cleared.componentBindings).toEqual([]);
  }, 30_000);

  it('upgrades two explicit releases in one transaction and rolls both back together on an atomic mapping failure', async () => {
    const releases = [mixedRelease, atomicRelease];
    for (const release of releases) {
      Object.assign(store.find('knowledgeAtoms', { id: release.before.id }), structuredClone(release.before));
      store.remove('curriculumRevisions', { entityId: release.before.id });
      for (const item of store.select('measurementItems', { atomId: release.before.id })) {
        item.atomDefinitionFingerprint = atomDefinitionFingerprint(release.before);
        if (release.questions.some(row => row.questionId === item.questionId)) {
          item.version = 1; delete item.contentFingerprint; delete item.componentBindings; store.remove('curriculumRevisions', { entityId: item.id });
        }
      }
    }
    const checkpoint = () => blueprintContentHash({ atoms: store.inspect('knowledgeAtoms'), mappings: store.inspect('measurementItems'), revisions: store.inspect('curriculumRevisions'), events: store.inspect('events') });
    const before = checkpoint(), save = curriculum.upsertMapping.bind(curriculum);
    const fault = vi.spyOn(curriculum, 'upsertMapping').mockImplementation((actor: any, item: any) => {
      if (actor.id === `system:${atomicRelease.releaseId}`) throw new Error('atomic mapping interruption'); return save(actor, item);
    });
    try { await expect(store.transaction(() => seed.seedAuthoredCurriculum())).rejects.toThrow('atomic mapping interruption'); } finally { fault.mockRestore(); }
    expect(checkpoint()).toBe(before);
    await store.transaction(() => seed.seedAuthoredCurriculum());
    for (const release of releases) expect(store.find('knowledgeAtoms', { id: release.after.id })).toEqual(release.after);
    expect(reviewedAuthoredRelationMappings(store, atomicRelease)).toHaveLength(0);
    const after = checkpoint(); await store.transaction(() => seed.seedAuthoredCurriculum()); expect(checkpoint()).toBe(after);
  }, 30_000);

  it('preserves an edited atomic target and leaves its parent relationship for review', async () => {
    Object.assign(store.find('knowledgeAtoms', { id: parentId }), structuredClone(atomicRelease.before));
    const child = store.find('knowledgeAtoms', { id: childId }); child.objective = '已有教研修改后的不同子点目标';
    const before = structuredClone(child); await store.transaction(() => seed.seedAuthoredCurriculum());
    expect(store.find('knowledgeAtoms', { id: parentId })).toEqual(atomicRelease.before); expect(store.find('knowledgeAtoms', { id: childId })).toEqual(before);
  }, 30_000);
});
