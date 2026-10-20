import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { authoredAverageRelationRelease as release, authoredRelationReleases, reviewedAuthoredRelationMappings } from './authored-relation-release';
import { atomDefinitionFingerprint } from './measurement-definition';
import { blueprintContentHash } from './assessment-blueprint';

describe('atomic average diagnosis through real services and HTTP', () => {
  let app: any, store: any, seed: any, curriculum: any, owner: any, learner: any, admin: any, studentId: string;
  const parentId = release.after.id, childId = 'atomic:math:averagecount';
  beforeAll(async () => {
    const from = (file: string) => require(`../../../dist/apps/api/src/${file}.js`);
    app = await NestFactory.create(from('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);
    seed = app.get(from('modules/diagnostics/foundation-seed.service').FoundationSeedService);
    curriculum = app.get(from('modules/diagnostics/curriculum.service').CurriculumService);
  });
  beforeEach(async () => {
    store.reset(); seed.seedAuthoredCurriculum();
    owner = await call('post', '/auth/register', { principal: 'average-owner', credential: 'Average-owner-testing-password' }, undefined);
    admin = await call('post', '/auth/register', { principal: 'average-admin', credential: 'Average-admin-testing-password' }, undefined);
    store.find('users', { id: admin.user.id }).role = 'admin';
    studentId = (await call('post', '/students', { nickname: '平均对象核查孩子', grade: 4, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'original', chinese: '', english: '' } }, owner)).profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'average-access', reason: '独立核查平均对象与零记录' }, owner);
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: 'average-code' }, owner);
    learner = await call('post', '/auth/learning-code', { code: code.code }, undefined);
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null,
      textbookVersion: '原创能力路径', learnedAtomIds: [parentId], currentAtomId: parentId, minutesPerSession: 15 }, owner);
  });
  afterAll(async () => { await app?.close(); });
  async function call(method: 'get' | 'post' | 'put' | 'patch', route: string, body?: unknown, actor = learner, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + route); if (actor?.token) query = query.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object); const result = await query;
    expect(result.status, `${method} ${route}: ${result.body.error?.message ?? ''}`).toBe(expected); return result.body.data;
  }
  const raw = (id: string) => store.find('diagnosticSessions', { id });
  const start = () => call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [parentId], includePrerequisites: false, maxItems: 12 });
  const wrong = (expected: any, schema: any) => schema.mode === 'boolean' ? !expected : schema.mode === 'single_choice' ? schema.options.find((option: any) => option.value !== expected).value :
    Array.isArray(expected) ? expected.map(entry => ({ ...entry, value: Number.isFinite(Number(entry.value)) ? String(Number(entry.value) + 1) : 'QA未达标' })) : Number(expected) + 1;
  const complete = async (session: any, transform = (_item: any, expected: any, _schema: any, _mapping: any) => expected) => {
    for (const item of session.items) {
      const packet = raw(session.id).questionSnapshots.find((row: any) => row.id === item.questionId), mapping = raw(session.id).itemSnapshots.find((row: any) => row.id === item.id);
      await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer: transform(item, structuredClone(packet.answer), packet.answerSchema, mapping), elapsedMs: 1000 });
    }
    return call('post', `/diagnostics/sessions/${session.id}/complete`, {});
  };
  const legacy = (target: (typeof authoredRelationReleases)[number] = release) => {
    Object.assign(store.find('knowledgeAtoms', { id: target.before.id }), structuredClone(target.before));
    store.remove('curriculumRevisions', { entityId: target.before.id });
    for (const item of store.select('measurementItems', { atomId: target.before.id })) {
      item.atomDefinitionFingerprint = atomDefinitionFingerprint(target.before);
      if (target.questions.some(row => row.questionId === item.questionId)) {
        item.version = 1; delete item.contentFingerprint; delete item.componentBindings; store.remove('curriculumRevisions', { entityId: item.id });
      }
    }
  };

  it('keeps the child unknown after a wrong composite count, then measures independent structures and binds guidance to their evidence', async () => {
    const baseline = await start(); expect(raw(baseline.id).componentAtomSnapshots.map((atom: any) => atom.id)).toEqual([childId]);
    const report = await complete(baseline, (_item, expected, schema, mapping) => mapping.componentBindings?.length
      ? expected.map((entry: any) => entry.key === 'count' ? { ...entry, value: String(Number(entry.value) + 1) } : entry) : wrong(expected, schema));
    expect(report.componentObservations).toHaveLength(1); expect(report.componentObservations[0]).toMatchObject({ atomId: childId, state: 'below_standard', independentEstimateContribution: 0 });
    const profile = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`); expect(profile.estimates.find((row: any) => row.atomId === childId).scoredCount).toBe(0);
    await call('post', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', targetAtomIds: [childId], includePrerequisites: false, requestKey: 'outside-confirmed-scope' }, learner, 400);
    const preview = await call('post', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', targetAtomIds: [childId], includePrerequisites: true, maxItems: 12, requestKey: 'average-independent-child' });
    expect(preview.blueprint.prerequisiteAtomIds).toContain('core:math:count');
    const independent = await call('post', `/diagnostics/blueprints/${preview.id}/start`, {});
    const result = await complete(independent, (item, expected, schema) => item.atomId === childId ? wrong(expected, schema) : expected);
    const estimate = result.estimates.find((row: any) => row.atomId === childId); expect(estimate.scoredCount).toBe(4); expect(estimate.independentFamilies).toBe(4); expect(estimate.status).not.toBe('secure');
    const root = result.hypotheses.find((row: any) => row.atomId === parentId && row.cause === 'prerequisite_gap'); expect(root.status).toBe('supported'); expect(root.probeAtomIds).toEqual([childId]);
    const cause = await call('post', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', hypothesisId: root.id, includePrerequisites: true, maxItems: 12, requestKey: 'average-all-prerequisites' });
    expect(cause.blueprint.verification.groups.map((group: any) => group.atomId)).toEqual(expect.arrayContaining([parentId, childId, 'foundation:math:divisiondigits']));
    const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: independent.id, minutesPerDay: 5, useAi: true }, owner);
    expect(plan.source).toBe('rules'); expect(plan.actions.map((action: any) => action.atomId)).toEqual([childId]);
    expect(plan.actions[0].evidenceIds).toEqual(estimate.evidenceIds); expect(plan.actions[0].teachingSnapshot.teaching.explanation).toContain('未记录当0');
    const scope = await call('get', `/students/${studentId}/learning-scope?subject=math`, undefined, owner); expect(scope.learnedAtomIds).toEqual([parentId]);
  }, 30_000);

  it('upgrades all three explicit releases atomically and rolls earlier releases back when the average mapping fails', async () => {
    for (const target of authoredRelationReleases) legacy(target);
    const snapshot = () => blueprintContentHash({ atoms: store.inspect('knowledgeAtoms'), mappings: store.inspect('measurementItems'), revisions: store.inspect('curriculumRevisions'), events: store.inspect('events') });
    const before = snapshot(), save = curriculum.upsertMapping.bind(curriculum), fault = vi.spyOn(curriculum, 'upsertMapping').mockImplementation((actor: any, item: any) => {
      if (actor.id === `system:${release.releaseId}`) throw new Error('average mapping interruption'); return save(actor, item);
    });
    try { await expect(store.transaction(() => seed.seedAuthoredCurriculum())).rejects.toThrow('average mapping interruption'); } finally { fault.mockRestore(); }
    expect(snapshot()).toBe(before); await store.transaction(() => seed.seedAuthoredCurriculum());
    for (const target of authoredRelationReleases) expect(store.find('knowledgeAtoms', { id: target.after.id })).toEqual(target.after);
    expect(reviewedAuthoredRelationMappings(store, release)).toHaveLength(0); const after = snapshot();
    await store.transaction(() => seed.seedAuthoredCurriculum()); expect(snapshot()).toBe(after);
  }, 30_000);

  it('protects changed content, draft mapping, pending candidate and edited target rather than broadening the frozen review', async () => {
    legacy(); const ids = release.questions.slice(0, 3).map(row => row.questionId);
    store.find('questions', { id: ids[0] }).analysis += ' 教师编辑';
    store.find('measurementItems', { questionId: ids[1] }).reviewStatus = 'draft';
    store.append('measurementCandidates', { id: 'average-candidate', questionId: ids[2] });
    expect(reviewedAuthoredRelationMappings(store, release)).toHaveLength(0);
    await store.transaction(() => seed.seedAuthoredCurriculum());
    expect(store.find('knowledgeAtoms', { id: parentId })).toEqual(release.after);
    for (const id of ids) expect(store.find('measurementItems', { questionId: id }).atomDefinitionFingerprint).toBe(atomDefinitionFingerprint(release.before));
    expect(store.select('measurementItems', { atomId: parentId }).filter((row: any) => row.atomDefinitionFingerprint === atomDefinitionFingerprint(release.after))).toHaveLength(69);
    legacy(); const target = store.find('knowledgeAtoms', { id: childId }); target.objective = '教研独立修改后的对象选择目标'; const saved = structuredClone(target);
    await store.transaction(() => seed.seedAuthoredCurriculum()); expect(store.find('knowledgeAtoms', { id: parentId })).toEqual(release.before); expect(target).toEqual(saved);
  }, 30_000);

  it('preserves an old report and started definitions while invalidating an unused old preview after the release', async () => {
    legacy(); const baseline = await start(); await complete(baseline, (_item, expected, schema) => wrong(expected, schema));
    const oldReport = await call('get', `/diagnostics/sessions/${baseline.id}/report`);
    const preview = await call('post', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [parentId], includePrerequisites: false, maxItems: 12, requestKey: 'legacy-average-unused' });
    const begun = await start(), frozen = blueprintContentHash(raw(begun.id)); await store.transaction(() => seed.seedAuthoredCurriculum());
    expect(await call('get', `/diagnostics/sessions/${baseline.id}/report`)).toEqual(oldReport);
    await call('post', `/diagnostics/blueprints/${preview.id}/start`, {}, learner, 409);
    expect(blueprintContentHash(raw(begun.id))).toBe(frozen); const result = await complete(begun);
    expect(raw(begun.id).atomSnapshots.find((atom: any) => atom.id === parentId)).toEqual(release.before);
    expect(result.definitionContext.origin).toBe('started');
    expect(result.definitionContext.atoms.find((row: any) => row.id === parentId)).toEqual({ id: parentId, name: release.before.name,
      version: release.before.version, objective: release.before.objective, successCriterion: release.before.successCriterion,
      fingerprint: atomDefinitionFingerprint(release.before) });
    const current = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`); expect(current.estimates.find((row: any) => row.atomId === parentId).scoredCount).toBe(0);
  }, 30_000);
});
