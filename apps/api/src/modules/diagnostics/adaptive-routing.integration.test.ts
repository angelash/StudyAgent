import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

describe('online routing through authenticated assessment, coaching and media APIs', () => {
  let app: any, store: any, auth: any, owner: any, admin: any, outsider: any;
  const originalKey = process.env.OPENAI_API_KEY;
  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  afterAll(async () => { await app?.close(); if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey; });
  const query = (method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = owner) => {
    const q = request(app.getHttpServer())[method]('/api' + path).set('Authorization', `Bearer ${actor.token}`);
    return body === undefined ? q : q.send(body as object);
  };
  async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, expected = method === 'post' ? 201 : 200, actor = owner) {
    return (await query(method, path, body, actor).expect(expected)).body.data;
  }
  beforeEach(async () => {
    store.reset();
    owner = await auth.register({ principal: 'routing-parent@test', credential: 'routing-fixture-secret' }, 'routing-parent');
    admin = await auth.register({ principal: 'routing-admin@test', credential: 'routing-fixture-secret' }, 'routing-admin');
    outsider = await auth.register({ principal: 'routing-outsider@test', credential: 'routing-fixture-secret' }, 'routing-outsider');
    store.users.find((row: any) => row.id === admin.user.id).role = 'admin';
    store.students.push({ id: 'child', userId: 'child-user', nickname: '合成评测', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } });
    store.bindings.push({ id: 'binding', studentId: 'child', parentUserId: owner.user.id, relation: 'guardian', status: 'active' });
    for (const [id, grade, prerequisiteIds] of [['far', 1, []], ['base', 2, ['far']], ['target', 3, ['base']], ['future', 6, []]] as const) {
      store.knowledgeAtoms.push({ id, grade, prerequisiteIds, subject: 'math', name: id, strand: '测试数量关系', term: 'both',
        objective: '独立完成当前操作并核对关系', successCriterion: '用不同题族独立说明当前关系', curriculumVersion: 'routing-fixture', status: 'published', version: 1 });
      for (const [n, dimension] of ['understanding', 'procedure', 'transfer', 'procedure'].entries()) {
        const qid = `${id}-q${n}`;
        store.questions.push({ id: qid, subject: 'math', type: 'objective', stem: `合成路径核查${qid}: 3+3=?`, answer: '6',
          analysis: '两组3合并为6。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
        store.questionAnswerSchemas.push({ questionId: qid, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
        store.questionSources.push({ questionId: qid, sourceType: 'internal_authoring', sourceName: '合成路径QA', sourcePathOrUrl: '',
          licenseClass: 'A_INTERNAL', licenseName: 'QA only', importJobId: null, reviewStatus: 'approved', notes: null });
        store.measurementItems.push({ id: `${id}-i${n}`, questionId: qid, questionVersion: 1, atomId: id, dimension, family: `${id}-f${n}`,
          probeRole: dimension === 'transfer' ? 'transfer' : 'anchor', expectedSeconds: 15, difficulty: n === 3 ? 2 : 1,
          reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch', version: 1 });
      }
    }
    await call('put', '/students/child/learning-scope', { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '合成路径',
      learnedAtomIds: ['target', 'base'], currentAtomId: 'target', minutesPerSession: 15 });
  });
  const command = { studentId: 'child', subject: 'math', intent: 'baseline', targetAtomIds: ['target'], includePrerequisites: true, maxItems: 12, adaptive: true };
  const start = (extra = {}) => call('post', '/diagnostics/sessions', { ...command, ...extra });
  const view = (id: string) => call('get', `/diagnostics/sessions/${id}`);
  const current = (s: any) => s.items.find((row: any) => row.id === s.routing.currentItemId);
  const submit = (s: any, answer = 6, extra = {}) => call('post', `/diagnostics/sessions/${s.id}/responses`, { itemId: current(s).id, answer, elapsedMs: 1000, ...extra });
  const rawSession = (id: string) => store.diagnosticSessions.find((row: any) => row.id === id);

  it('freezes preview scope and blocks future render, draft, hint, answer, coaching and media paths', async () => {
    const preview = await call('post', '/diagnostics/blueprints', { ...command, requestKey: 'routing-preview-key' });
    expect(preview.blueprint.targetAtomIds).toEqual(['target']);
    expect(new Set(preview.blueprint.prerequisiteAtomIds)).toEqual(new Set(['base', 'far']));
    expect(preview.blueprint.routing.mode).toBe('adaptive');
    expect(JSON.stringify(preview)).not.toMatch(/gradingConfig|questionSnapshots|decisions/);
    const session = await call('post', `/diagnostics/blueprints/${preview.id}/start`, {});
    expect(new Set(session.items.map((row: any) => row.id))).toEqual(new Set(preview.blueprint.groups.flatMap((row: any) => row.itemIds)));
    expect(current(session).atomId).toBe('target'); expect(session.routing).not.toHaveProperty('decisions');
    expect(session.totalCount).toBe(12); expect(session.items.some((row: any) => row.atomId === 'future')).toBe(false);
    const future = session.items.find((row: any) => row.id !== session.routing.currentItemId), root = `/diagnostics/sessions/${session.id}`;
    await call('get', `${root}/items/${future.id}`, undefined, 409);
    await call('patch', `${root}/items/${future.id}/draft`, { answer: 6 }, 400);
    await call('post', `${root}/items/${future.id}/hint`, {}, 400);
    await call('post', `${root}/responses`, { itemId: future.id, answer: 6, elapsedMs: 1000 }, 409);
    await call('post', '/ai/assistant/sessions', { userRole: 'student', studentId: 'child', subject: 'math', pageContext: 'assessment',
      contextRefType: 'diagnostic', contextRefId: session.id, contextItemId: future.id }, 400);
    await call('post', '/learning/media', { kind: 'diagnostic', sessionId: session.id, itemId: future.id, name: '作答.png', mediaType: 'image/png', size: 100, requestKey: 'future-media-blocked' }, 409);
    await call('get', `${root}/items/${session.routing.currentItemId}`, undefined, 403, outsider);
    expect(store.diagnosticResponses).toHaveLength(0); expect(store.studentMedia).toHaveLength(0);
    expect(rawSession(session.id).routing.decisions).toHaveLength(1);
  });

  it('follows basis → nearest prerequisite → original target → transfer → same-point contrast', async () => {
    let session = await start(); await submit(session, 0); session = await view(session.id);
    expect(current(session).atomId).toBe('base');
    expect(rawSession(session.id).routing.decisions.at(-1).rule).toBe('prerequisite_probe');
    await submit(session); session = await view(session.id);
    expect(current(session).atomId).toBe('target');
    expect(rawSession(session.id).routing.decisions.at(-1).rule).toBe('return_to_target');
    await submit(session); session = await view(session.id);
    expect(current(session).dimension).toBe('transfer');
    await submit(session, 0); session = await view(session.id);
    expect(current(session).atomId).toBe('target'); expect(current(session).dimension).toBe('procedure');
    expect(rawSession(session.id).routing.decisions.at(-1).rule).toBe('representation_contrast');
    const frozen = structuredClone(rawSession(session.id).blueprint);
    store.measurementItems.find((row: any) => row.id === current(session).id).reviewStatus = 'rejected';
    while (session.routing.currentItemId) { await submit(session); session = await view(session.id); }
    expect(session.answeredCount).toBe(session.totalCount); expect(session.blueprint).toEqual(frozen);
    expect(session.routing).not.toHaveProperty('decisions');
    await call('post', `/diagnostics/sessions/${session.id}/complete`, {});
    session = await view(session.id); expect(session.routing.decisions).toHaveLength(12);
    expect(new Set(session.routing.decisions.map((row: any) => row.itemId)).size).toBe(12);
    expect(session.routing.decisions[1].basis[0]).toMatchObject({ correct: false, score: 0, hintLevel: 0 });
    const report = await call('get', `/diagnostics/sessions/${session.id}/report`);
    expect(report.estimates.every((row: any) => row.status !== 'secure')).toBe(true);
  });

  it('records assisted and pending expressions as uncertain followups', async () => {
    let session = await start();
    await call('post', `/diagnostics/sessions/${session.id}/items/${current(session).id}/hint`, {});
    await submit(session, 0); session = await view(session.id);
    expect(current(session).atomId).toBe('target');
    expect(rawSession(session.id).routing.decisions.at(-1)).toMatchObject({ rule: 'uncertain_followup', basis: [{ hintLevel: 1 }] });
    rawSession(session.id).questionSnapshots.find((row: any) => row.id === current(session).questionId).answerSchema.mode = 'short_answer';
    await submit(session, '我先观察数量关系' as any); session = await view(session.id);
    expect(current(session).atomId).toBe('target');
    expect(rawSession(session.id).routing.decisions.at(-1)).toMatchObject({ rule: 'uncertain_followup', basis: [{ status: 'pending_review', correct: null }] });
  });

  it('replays first submissions once and preserves routing through pause, abort and scoring revisions', async () => {
    let session = await start(), first = current(session);
    const body = { itemId: first.id, answer: 0, elapsedMs: 1000, requestKey: 'routing-submit-once' };
    const results = await Promise.all([query('post', `/diagnostics/sessions/${session.id}/responses`, body), query('post', `/diagnostics/sessions/${session.id}/responses`, body)]);
    expect(results.every(row => row.status === 201)).toBe(true);
    expect(new Set(results.map(row => row.body.data.responseId)).size).toBe(1);
    expect(rawSession(session.id).routing.decisions).toHaveLength(2);
    session = await view(session.id); const selected = current(session).id;
    await call('patch', `/diagnostics/sessions/${session.id}/items/${selected}/draft`, { answer: 6 });
    const state = (action: string, expectedRevision: number) => call('post', `/diagnostics/sessions/${session.id}/state`, {
      action, expectedRevision, requestKey: `routing-state-${action}`, reason: '保留冻结核查顺序与首次作答后再继续处理。' });
    const history = structuredClone(rawSession(session.id).routing);
    expect((await state('pause', 1)).routing).not.toHaveProperty('decisions');
    await submit(session, 6).then(() => { throw new Error('Expected paused rejection'); }, error => expect(String(error)).toContain('400'));
    session = await state('resume', 2); expect(current(session).id).toBe(selected);
    expect((await call('get', `/diagnostics/sessions/${session.id}/items/${selected}`)).draft).toBe(6);
    const ended = await state('abort', 3); expect(ended.routing.decisions).toEqual(history.decisions);
    const report = await call('get', `/diagnostics/sessions/${session.id}/report`); expect(report.scoredCount).toBe(1);
    await call('post', `/admin/diagnostic-responses/${encodeURIComponent(report.evidence[0].id)}/review`, {
      score: 1, reason: '合成评分复核用于验证历史核查决定不会被倒改', requestKey: 'routing-review-history', expectedVersion: 0,
    }, 201, admin);
    expect((await call('get', `/diagnostics/sessions/${session.id}/report`)).rawScore).toBe(100);
    expect(rawSession(session.id).routing).toEqual(history);
    expect((await call('get', `/diagnostics/sessions/${session.id}`)).routing.decisions[1].basis[0].correct).toBe(false);
  });

  it('keeps old fixed APIs compatible, rejects adaptive retests and never adds unconfirmed prerequisites', async () => {
    await start({ intent: 'retest' }).then(() => { throw new Error('Expected retest rejection'); }, error => expect(String(error)).toContain('400'));
    const narrow = await start({ includePrerequisites: false });
    expect(narrow.items.every((row: any) => row.atomId === 'target')).toBe(true);
    await submit(narrow, 0);
    expect(rawSession(narrow.id).routing.decisions.at(-1).rule).toBe('same_point_contrast');
    expect(rawSession(narrow.id).routing.decisions.at(-1).itemId.startsWith('target')).toBe(true);
    const fixed = await start({ adaptive: undefined }); expect(fixed.routing).toBeNull();
    await call('get', `/diagnostics/sessions/${fixed.id}/items/${fixed.items.at(-1).id}`);
    const exposed = await start({ includePrerequisites: false }); await submit(exposed, 0);
    expect(rawSession(exposed.id).routing.decisions.at(-1)).toMatchObject({ rule: 'uncertain_followup', basis: [{ priorExposure: true }] });
    await start({ targetAtomIds: ['future'] }).then(() => { throw new Error('Expected progress rejection'); }, error => expect(String(error)).toContain('400'));
  });
});
