import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const pgLocation = process.env.STUDY_TEST_TEACHING_TOOL_API_POSTGRES_URL;
describe('durable internal teaching HTTP/' + (pgLocation ? 'PostgreSQL' : 'SQLite') + '; no supplier or child data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-teaching-tools-'));
  const envNames = ['NODE_ENV', 'STUDY_DATA_DIR', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, worker: any, provider: any, models: any, admin: any, other: any, parent: any;
  let pg: Pool | undefined, sourceLocation: string | undefined; const databases: string[] = [];
  let mode: 'valid' | 'invalid' | 'fake_quote' | 'hold' = 'valid', release: (() => void) | null = null;
  const endpoint = '/ai/teaching-tools';
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = admin, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  async function boot() {
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    worker = app.get(load('modules/ai/teaching-tool-worker.service').TeachingToolWorkerService);
    models = app.get(load('modules/ai/xiaojiu-models.service').XiaojiuModelsService);
    provider = vi.spyOn(app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService), 'structured').mockImplementation(async (input: any, _schema: any, check: any) => {
      const snapshot = JSON.parse(input.context);
      const value: any = snapshot.purpose === 'assessment_analysis' ? {
        summary: '作答以组数作为分母，需要进一步核对平均对象。', judgement: snapshot.question.mediaNotice ? 'uncertain' : 'incorrect',
        observations: [{ source: 'submitted_answer', quote: mode === 'fake_quote' ? '从未提供的学生自述' : '32/2=16', observation: '本步使用了两组作为分母。' }],
        uncertainties: ['一次作答尚不能确定稳定原因。'], verificationSteps: ['换用人数不同的新情境核对分母代表什么。'],
        confidenceLevel: 'low', advisoryOnly: true, reviewRequired: true,
      } : { hint: '请先用记号表示全部人数，再说明要平均的对象。', focus: '平均对象与分母。', suggestedLevel: snapshot.hintLevel,
        reviewAdvice: '人工核对层级与答案泄露后再用于教学。', advisoryOnly: true, reviewRequired: true };
      if (mode === 'invalid') value.score = 0;
      if (mode === 'hold') await new Promise<void>(accept => { release = () => { release = null; accept(); }; });
      return { ...check(value), modelId: input.modelId, modelName: 'Synthetic teaching provider; zero real calls' };
    });
  }
  const draft = (purpose = 'assessment_analysis', modelId = 'auto'): any => ({ purpose, modelId,
    source: { kind: 'temporary', title: '匿名平均对象教研', question: { subject: '数学', stem: '两组分别三人与两人，总分18与14，求五人平均分。', referenceAnswer: '6.4', referenceAnalysis: '总分32除以总人数5。' } },
    ...(purpose === 'assessment_analysis' ? { answer: { steps: ['18+14=32', '32/2=16'], result: 16 } } : { hintLevel: 1 }) });
  async function command(input = draft()) { const preview = await call('post', endpoint + '/preflight', input); return { requestKey: randomUUID(), fingerprint: preview.fingerprint, draft: input }; }
  const create = async (input = draft()) => call('post', endpoint + '/runs', await command(input));
  const read = (run: any, actor = admin) => call('get', endpoint + '/runs/' + run.id, undefined, actor);
  const control = (run: any, action: 'retry' | 'cancel', key = randomUUID(), status = 201) => call('post', endpoint + '/runs/' + run.id + '/' + action,
    { requestKey: key, generation: run.task.generation, version: run.task.version }, admin, status);
  async function newDatabase() {
    if (!pg || !pgLocation) return undefined;
    const name = 'study_qa_teaching_api_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
    const url = new URL(pgLocation); url.pathname = '/' + name; return url.toString();
  }
  beforeAll(async () => {
    if (pgLocation) {
      if (!process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw Error('Dedicated PostgreSQL teaching recovery settings required');
      const source = new URL(pgLocation), control = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL);
      if (source.pathname !== '/study_agent_qa' || !['localhost', '127.0.0.1'].includes(source.hostname) || source.hostname !== control.hostname || source.port !== control.port) throw Error('Expected dedicated loopback QA cluster');
      pg = new Pool({ connectionString: control.toString() }); expect((await pg.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin'); sourceLocation = await newDatabase();
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_DATA_DIR: directory, STUDY_STORAGE: pgLocation ? 'postgres' : 'sqlite', STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true' });
    if (sourceLocation) process.env.DATABASE_URL = sourceLocation; else delete process.env.DATABASE_URL;
    await boot();
    const register = async (name: string) => { const principal = name + '-' + randomUUID() + '@local.test', credential = 'Teaching-QA-only-20261027';
      return { ...await call('post', '/auth/register', { principal, credential }, null), principal, credential }; };
    admin = await register('teaching-admin'); other = await register('teaching-other'); parent = await register('teaching-parent');
    await store.transaction(() => { store.find('users', { id: admin.user.id }).role = 'admin'; store.find('users', { id: other.user.id }).role = 'admin'; });
  });
  let caseIndex = 0;
  beforeEach(async () => {
    if (caseIndex++ === 0) return;
    // Distinct synthetic people exercise the real per-person AI quota. Keep production limits intact.
    const principal = 'teaching-case-' + randomUUID() + '@local.test', credential = 'Teaching-QA-only-20261027';
    admin = { ...await call('post', '/auth/register', { principal, credential }, null), principal, credential };
    await store.transaction(() => { store.find('users', { id: admin.user.id }).role = 'admin'; });
  });
  afterAll(async () => { release?.(); await app?.close(); vi.restoreAllMocks();
    try { for (const database of databases) { if (!/^study_qa_teaching_api_[a-f0-9]{32}$/.test(database)) throw Error('Unsafe synthetic teaching database'); await pg!.query('DROP DATABASE "' + database + '"'); } } finally { await pg?.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe synthetic teaching directory'); rmSync(directory, { recursive: true, force: true }); });

  it('preflights complete input without creating a task, defaulting to the declared DS model', async () => {
    const before = await store.requestContext(() => store.select('teachingToolRuns', {}).length), count = provider.mock.calls.length;
    const original = draft(), preview = await call('post', endpoint + '/preflight', original);
    expect(preview).toMatchObject({ modelId: 'deepseek-v4-flash', modelName: 'DeepSeek V4.1 Flash', advisoryOnly: true, reviewRequired: true });
    expect(preview.snapshot.question).toEqual(original.source.question); expect(preview.snapshot.answer).toEqual(original.answer);
    expect(await store.requestContext(() => store.select('teachingToolRuns', {}).length)).toBe(before); expect(provider).toHaveBeenCalledTimes(count);
    await call('post', endpoint + '/preflight', { ...original, modelId: 'unavailable-teaching-model' }, admin, 400);
    await call('post', endpoint + '/preflight', { ...original, answer: 'x'.repeat(8001) }, admin, 400);
  });
  it('date precision: includes a millisecond record when the requested lower bound has whole seconds', async () => {
    const row = await create(); await store.transaction(() => { store.find('teachingToolRuns', { id: row.id }).createdAt = '2026-01-01T10:00:00.123Z'; });
    const query = new URLSearchParams({ from: '2026-01-01T10:00:00Z', to: '2026-01-01T10:00:01Z' });
    const result = await call('get', endpoint + '/runs?' + query); expect(result.runs.map((run: any) => run.id)).toEqual([row.id]); await control(row, 'cancel');
  });
  it('date precision: treats two equivalent ISO bounds as the same instant, and rejects only a genuinely reversed range', async () => {
    const query = new URLSearchParams({ from: '2026-01-01T10:00:00Z', to: '2026-01-01T10:00:00.000Z' });
    expect((await call('get', endpoint + '/runs?' + query)).runs).toEqual([]);
    const reversed = new URLSearchParams({ from: '2026-01-01T10:00:01Z', to: '2026-01-01T10:00:00.999Z' });
    await call('get', endpoint + '/runs?' + reversed, undefined, admin, 400);
  });
  it('pages and purpose-filters only the owner original history without issuing a provider request', async () => {
    const first = await create(), hint = await create(draft('hint_draft')), last = await create(), count = provider.mock.calls.length;
    await store.transaction(() => { store.find('teachingToolRuns', { id: first.id }).createdAt = '2026-01-01T10:00:00.000Z'; store.find('teachingToolRuns', { id: last.id }).createdAt = '2026-01-01T10:00:01.000Z'; });
    const page1 = await call('get', endpoint + '/runs?purpose=assessment_analysis&pageSize=1'), page2 = await call('get', endpoint + '/runs?purpose=assessment_analysis&pageSize=1&page=2');
    expect(page1.runs.map((row: any) => row.id)).toEqual([last.id]); expect(page1.hasMore).toBe(true);
    expect(page2.runs.map((row: any) => row.id)).toEqual([first.id]); expect(page2.hasMore).toBe(false);
    expect((await call('get', endpoint + '/runs', undefined, other)).runs).toEqual([]); expect(provider).toHaveBeenCalledTimes(count);
    for (const row of [first, hint, last]) await control(row, 'cancel');
  });
  const legacyQuestion = () => ({ id: 'legacy-temporary-' + randomUUID(), subject: 'math', type: 'fill', stem: draft().source.question.stem,
    answer: '6.4', analysis: '总分除以人数。' });
  it('adapts the old analysis HTTP into one frozen DS task, restores it without catalog lookup and never invokes the old SDK method', async () => {
    const ai = app.get(load('modules/ai/ai.service').AiService), old = vi.spyOn(ai, 'analyzeAssessment').mockImplementation(() => { throw Error('Retired SDK path must stay unused'); });
    const c = { question: legacyQuestion(), answer: draft().answer, requestKey: randomUUID() }, count = provider.mock.calls.length;
    try {
      const queued = await call('post', '/ai/assessment/analyze', c, admin, 202); expect(queued).toMatchObject({ status: 'queued', summary: null, structuredResult: null, confidenceLevel: null,
        modelId: 'deepseek-v4-flash', source: 'xiaojiu', reviewRequired: true, advisoryOnly: true }); expect(provider).toHaveBeenCalledTimes(count);
      const resolveModel = vi.spyOn(models, 'resolve').mockImplementation(() => { throw Error('Do not resolve an original legacy replay'); });
      try { expect((await call('post', '/ai/assessment/analyze', c, admin, 202)).runId).toBe(queued.runId); } finally { resolveModel.mockRestore(); }
      await call('post', '/ai/assessment/analyze', { ...c, modelId: 'claude-sonnet-5' }, admin, 409);
      await worker.runNext(); const done = await call('post', '/ai/assessment/analyze', c);
      expect(done).toMatchObject({ runId: queued.runId, status: 'completed', structuredResult: { correct: false, judgement: 'incorrect' }, modelId: 'deepseek-v4-flash', source: 'xiaojiu', reviewRequired: true, advisoryOnly: true });
      expect(done.summary).toBeTruthy(); expect((await call('get', done.runPath.slice(4))).snapshot.answer).toEqual(c.answer);
      expect(provider).toHaveBeenCalledTimes(count + 1); expect(old).not.toHaveBeenCalled();
    } finally { old.mockRestore(); }
  });
  it('adapts old hints to an explicit model/help level and preserves failed drafts without a rules fallback or automatic regeneration', async () => {
    const ai = app.get(load('modules/ai/ai.service').AiService), old = vi.spyOn(ai, 'generateHint').mockImplementation(() => { throw Error('Retired hint SDK must stay unused'); });
    try {
      const c = { question: legacyQuestion(), answerHistoryCount: 3, modelId: 'claude-sonnet-5', requestKey: randomUUID() };
      const queued = await call('post', '/ai/hints/generate', c, admin, 202); expect(queued.hint).toBeNull(); await worker.runNext();
      const done = await call('post', '/ai/hints/generate', c); expect(done).toMatchObject({ runId: queued.runId, status: 'completed', source: 'xiaojiu', modelId: 'claude-sonnet-5', suggestedLevel: 2, reviewRequired: true, advisoryOnly: true }); expect(done.hint).toBeTruthy();
      const failedInput = { ...c, requestKey: randomUUID(), hintLevel: 1 }; await call('post', '/ai/hints/generate', failedInput, admin, 202);
      mode = 'invalid'; await worker.runNext(); mode = 'valid'; const count = provider.mock.calls.length;
      const failed = await call('post', '/ai/hints/generate', failedInput, admin, 200); expect(failed).toMatchObject({ status: 'failed', hint: null, source: 'xiaojiu', errorCode: 'teaching_generation_failed' });
      expect((await call('post', '/ai/hints/generate', failedInput, admin, 200)).runId).toBe(failed.runId); expect(provider).toHaveBeenCalledTimes(count); expect(old).not.toHaveBeenCalled();
    } finally { old.mockRestore(); }
  });
  it('uses complete server originals for an old bank ID and replays its frozen record after withdrawal without disguising a new request as temporary', async () => {
    const id = 'legacy-bank-' + randomUUID(), q = legacyQuestion();
    await store.transaction(() => { store.append('questions', { ...q, id, status: 'published', stem: '服务端完整原题：' + q.stem });
      store.append('questionDocuments', { questionId: id, version: 7, blocks: [{ id: 'original-formula', type: 'formula', text: '\\frac{32}{5}' }], attachments: [] }); });
    const c = { question: { ...q, id, stem: '客户端伪造题干', answer: '客户端伪造答案' }, answer: draft().answer, requestKey: randomUUID() };
    const queued = await call('post', '/ai/assessment/analyze', c, admin, 202), run = await call('get', queued.runPath.slice(4));
    expect(run.snapshot).toMatchObject({ source: { kind: 'question_bank', questionId: id }, question: { stem: '服务端完整原题：' + q.stem, referenceAnswer: '6.4', originalDocument: { version: 7 } } });
    await worker.runNext(); await store.transaction(() => { store.find('questions', { id }).status = 'withdrawn'; });
    expect((await call('post', '/ai/assessment/analyze', c)).runId).toBe(queued.runId);
    await call('post', '/ai/assessment/analyze', { ...c, requestKey: randomUUID() }, admin, 404);
  });
  it('keeps old teaching HTTP admin-only and rejects missing/non-finite answers and purpose/model collisions before any extra task', async () => {
    const c = { question: legacyQuestion(), answer: null, requestKey: randomUUID() };
    await call('post', '/ai/assessment/analyze', c, null, 401); await call('post', '/ai/assessment/analyze', c, parent, 403);
    const queued = await call('post', '/ai/assessment/analyze', c, admin, 202);
    await call('post', '/ai/hints/generate', { question: c.question, requestKey: c.requestKey, answerHistoryCount: 0 }, admin, 409);
    await call('post', '/ai/assessment/analyze', { ...c, answer: undefined }, admin, 400);
    const raw = JSON.stringify(c).replace('"answer":null', '"answer":1e999');
    expect((await request(app.getHttpServer()).post('/api/ai/assessment/analyze').set('Authorization', 'Bearer ' + admin.token).type('json').send(raw)).status).toBe(400);
    const run = await call('get', queued.runPath.slice(4)); expect(run.snapshot.answer).toBeNull(); await control(run, 'cancel');
  });
  it('denies anonymous, non-admin and another admin access to an owner record', async () => {
    await call('post', endpoint + '/preflight', draft(), null, 401); await call('post', endpoint + '/preflight', draft(), parent, 403);
    const row = await create();
    await call('get', endpoint + '/runs/' + row.id, undefined, other, 404); await control(row, 'cancel');
  });
  it('replays original create before resolving a changed catalog and rejects input/model key conflicts', async () => {
    const c = await command(), row = await call('post', endpoint + '/runs', c);
    const resolveModel = vi.spyOn(models, 'resolve').mockImplementation(() => { throw Error('Catalog changed after original command'); });
    expect((await call('post', endpoint + '/runs', c)).id).toBe(row.id); resolveModel.mockRestore();
    await call('post', endpoint + '/runs', { ...c, draft: { ...c.draft, answer: null } }, admin, 409);
    await call('post', endpoint + '/runs', { ...c, draft: { ...c.draft, modelId: 'claude-sonnet-5' } }, admin, 409);
    await worker.runNext(); const done = await read(row); expect(done.status).toBe('completed'); expect(done.result.analysis.judgement).toBe('incorrect');
    expect((await call('get', endpoint + '/requests/' + c.requestKey)).id).toBe(row.id);
    await control(done, 'retry', randomUUID(), 409);
  });
  it('rejects non-finite wire JSON before a replay can alias an explicitly unknown null answer', async () => {
    const c = await command({ ...draft(), answer: null }), row = await call('post', endpoint + '/runs', c);
    const raw = JSON.stringify(c).replace('"answer":null', '"answer":1e999'); expect(raw).toContain('"answer":1e999');
    const response = await request(app.getHttpServer()).post('/api' + endpoint + '/runs').set('Authorization', 'Bearer ' + admin.token).type('json').send(raw);
    expect(response.status, JSON.stringify(response.body.error)).toBe(400);
    expect((await read(row)).snapshot.answer).toBeNull(); await control(row, 'cancel');
  });
  it('completes a hint at the selected level with the explicit original model and no formal record changes', async () => {
    const collections = ['diagnosticResponses', 'practiceAttempts', 'diagnosticPlans', 'diagnosticHypotheses', 'scoringRevisions'];
    await store.transaction(() => { for (const name of collections) store.append(name, { id: 'synthetic-formal-sentinel-' + name, marker: 'Original first answer/score/plan stays unchanged', score: null, pendingReview: true }); });
    const before = await store.requestContext(() => collections.map(name => structuredClone(store.select(name, {}))));
    const row = await create(draft('hint_draft', 'claude-sonnet-5')); await worker.runNext();
    const done = await read(row); expect(done).toMatchObject({ status: 'completed', modelId: 'claude-sonnet-5', result: { purpose: 'hint_draft', hint: { suggestedLevel: 1, reviewRequired: true, advisoryOnly: true } } });
    expect(await store.requestContext(() => collections.map(name => structuredClone(store.select(name, {}))))).toEqual(before);
  });
  it('rejects extra output and fake quotes, and retries the frozen original model without a catalog lookup', async () => {
    for (const bad of ['invalid', 'fake_quote'] as const) { const row = await create(); mode = bad; await worker.runNext(); mode = 'valid';
      const failed = await read(row); expect(failed).toMatchObject({ status: 'failed', result: null, task: { errorCode: 'teaching_generation_failed' } });
      const resolveModel = vi.spyOn(models, 'resolve').mockImplementation(() => { throw Error('Do not re-resolve frozen original model'); });
      await control(failed, 'retry'); await worker.runNext(); resolveModel.mockRestore(); expect((await read(row)).status).toBe('completed'); }
  });
  it('makes queued cancellation idempotent, fences stale control and retries only its terminal generation', async () => {
    const row = await create(), key = randomUUID(), cancelled = await control(row, 'cancel', key); expect(cancelled.status).toBe('cancelled');
    expect((await control(row, 'cancel', key)).status).toBe('cancelled'); await control(row, 'retry', randomUUID(), 409);
    const retried = await control(cancelled, 'retry'); expect(retried.task.generation).toBe(cancelled.task.generation + 1); await worker.runNext(); expect((await read(row)).status).toBe('completed');
  });
  it('keeps a terminal no-op cancellation key bound to cancel, refusing reuse as a retry command', async () => {
    const row = await create(); mode = 'invalid'; await worker.runNext(); mode = 'valid';
    const failed = await read(row), key = randomUUID(), noOp = await control(failed, 'cancel', key); expect(noOp.status).toBe('failed');
    expect((await control(failed, 'cancel', key)).revision).toBe(noOp.revision);
    await control(noOp, 'retry', key, 409); await control(noOp, 'retry'); await worker.runNext(); expect((await read(row)).status).toBe('completed');
  });
  it('prevents a late provider result after explicit in-flight cancellation', async () => {
    const row = await create(); mode = 'hold'; const work = worker.runNext(); await expect.poll(() => !!release).toBe(true);
    const running = await read(row); expect(running.status).toBe('running'); expect((await control(running, 'cancel')).status).toBe('cancelling');
    release!(); await work; mode = 'valid'; const stopped = await read(row); expect(stopped.result).toBeNull(); expect(stopped.status).toBe('cancelled');
  });
  it('fences role revocation before a late result can publish', async () => {
    const row = await create(); mode = 'hold'; const work = worker.runNext(); await expect.poll(() => !!release).toBe(true);
    await store.transaction(() => { store.find('users', { id: admin.user.id }).role = 'parent'; }); release!(); await work; mode = 'valid';
    await call('get', endpoint + '/runs/' + row.id, undefined, admin, 403);
    await store.transaction(() => { store.find('users', { id: admin.user.id }).role = 'admin'; });
    expect(await read(row)).toMatchObject({ status: 'failed', result: null, task: { errorCode: 'teaching_context_changed' } });
  });
  it('freezes complete server-side table/formula originals, rejects a changed preflight and keeps unresolved media unknown', async () => {
    const id = 'synthetic-bank-' + randomUUID(), document = { questionId: id, version: 3, locale: 'zh-CN', layoutMode: 'default', accessibilityConfig: {},
      blocks: [{ id: 'table', type: 'table', rows: [['人数', '总分'], ['3', '18'], ['2', '14']] }, { id: 'formula', type: 'formula', text: '\\frac{32}{5}=6.4' }],
      attachments: [{ id: 'image', kind: 'image', url: '/anonymous-question.png', mimeType: 'image/png', alt: '待人工核对的原图' }] };
    await store.transaction(() => { store.append('questions', { id, subject: 'math', type: 'choice', status: 'published', stem: draft().source.question.stem,
      answer: '6.4', analysis: '总分除以人数。' }); store.append('questionDocuments', document); store.append('questionAnswerSchemas', { questionId: id, mode: 'numeric_blank', gradingConfig: { tolerance: 0 } }); });
    const input = { purpose: 'assessment_analysis', answer: draft().answer, source: { kind: 'question_bank', questionId: id }, modelId: 'auto' }, c = await command(input);
    await store.transaction(() => { store.find('questionDocuments', { questionId: id }).version = 4; });
    await call('post', endpoint + '/runs', c, admin, 409);
    const row = await create(input); expect(row.snapshot.question.originalDocument).toEqual({ ...document, version: 4 });
    expect(row.snapshot.question.originalAnswerSchema.gradingConfig.tolerance).toBe(0); expect(row.snapshot.question.mediaNotice).toContain('不读取');
    await worker.runNext(); const done = await read(row); expect(done.result.analysis.judgement).toBe('uncertain');
    await store.transaction(() => { store.find('questionDocuments', { questionId: id }).blocks[1].text = 'new original version'; });
    expect((await read(row)).snapshot.question.originalDocument.blocks[1].text).toBe('\\frac{32}{5}=6.4');
    const pending = await create(input); await store.transaction(() => { store.find('questions', { id }).status = 'withdrawn'; });
    await worker.runNext(); expect(await read(pending)).toMatchObject({ status: 'failed', result: null, task: { errorCode: 'teaching_context_changed' } });
  });
  it('serializes identical owner keys across two live app instances without a second task or suggestion', async () => {
    const second = await NestFactory.create(load('app.module').AppModule, { logger: false }); second.setGlobalPrefix('api'); await second.init();
    try { const c = await command(), [first, again] = await Promise.all([call('post', endpoint + '/runs', c),
      request(second.getHttpServer()).post('/api' + endpoint + '/runs').set('Authorization', 'Bearer ' + admin.token).send(c)]);
      expect(again.status, JSON.stringify(again.body.error)).toBe(201); expect(again.body.data.id).toBe(first.id);
      expect(await store.requestContext(() => store.select('teachingToolRuns', { ownerUserId: admin.user.id, requestKey: c.requestKey }).length)).toBe(1);
      await worker.runNext(); expect((await read(first)).status).toBe('completed');
    } finally { await second.close(); }
  });
  it('keeps logout and session expiry as execution fences while a new valid session can read and explicitly retry', async () => {
    const login = async () => { const { principal, credential } = admin; admin = { ...await call('post', '/auth/login', { principal, credential }, null), principal, credential }; };
    for (const reason of ['logout', 'expiry']) {
      const row = await create(); mode = 'hold'; const work = worker.runNext(); await expect.poll(() => !!release).toBe(true);
      if (reason === 'logout') await call('post', '/auth/logout', {});
      else await store.transaction(() => { const original = store.find('teachingToolRuns', { id: row.id }); store.find('sessions', { id: original.authorizationSessionId }).expiresAt = new Date(Date.now() - 1000).toISOString(); });
      await login(); release!(); await work; mode = 'valid'; const failed = await read(row);
      expect(failed).toMatchObject({ status: 'failed', result: null, task: { errorCode: 'teaching_context_changed' } });
      await control(failed, 'retry'); await worker.runNext(); expect((await read(row)).status).toBe('completed');
    }
  });
  it('recovers completed and queued original records across a real app restart', async () => {
    const completed = await create(); await worker.runNext(); const done = await read(completed), queued = await create(draft('hint_draft'));
    await app.close(); vi.restoreAllMocks(); await boot(); expect(await read(completed)).toEqual(done); expect((await read(queued)).status).toBe('queued');
    await worker.runNext(); expect((await read(queued)).status).toBe('completed');
  });
  it('exports only owner drafts and complete/not_completed meanings without session/hash/task internals', async () => {
    const queued = await create(), rows = await store.requestContext(() => structuredClone(store.select('teachingToolRuns', { ownerUserId: admin.user.id })));
    const portable = load('modules/privacy/privacy-records').portableRecords({ teachingToolRuns: [...rows, { ...rows[0], id: 'foreign', ownerUserId: other.user.id }] }, admin.user.id);
    expect(portable.teachingToolRuns).toHaveLength(rows.length); expect(JSON.stringify(portable)).not.toMatch(/authorizationSessionId|commandHash|inputHash|taskId|commands/);
    expect(portable.teachingToolRuns.find((row: any) => row.id === queued.id).status).toBe('not_completed'); await control(queued, 'cancel');
  });
  it('exports and deletes only the admin own account, cancels original work and applies the new ledger to an old native backup', async () => {
    const backup = require(resolve(__dirname, '../../../../../scripts/operations/backup.cjs'));
    const postgresBackup = require(resolve(__dirname, '../../../../../scripts/operations/postgres-backup.cjs'));
    const ledger = require(resolve(__dirname, '../../../../../scripts/operations/privacy-ledger.cjs'));
    const { DomainDatabase } = load('infrastructure/domain-database');
    const recovery = mkdtempSync(join(tmpdir(), 'study-teaching-private-recovery-'));
    try {
      await store.transaction(() => { store.append('bindings', { id: 'synthetic-admin-binding', parentUserId: admin.user.id, studentId: 'synthetic-child', status: 'active' }); });
      const blocked = await call('get', '/privacy/account/deletion-preview'); expect(blocked.canDelete).toBe(false); expect(blocked.blockers.join()).toContain('家长身份');
      await call('post', '/privacy/students/synthetic-child/export', { credential: admin.credential, requestKey: randomUUID() }, admin, 403);
      await store.transaction(() => { store.bindings = store.bindings.filter((row: any) => row.id !== 'synthetic-admin-binding'); });
      await create(); await worker.runNext();
      const exported = await call('post', '/privacy/account/export', { credential: admin.credential, requestKey: randomUUID() });
      expect(exported.students).toEqual([]); expect(exported.account.id).toBe(admin.user.id);
      expect(exported.accountRecords.teachingToolRuns.length).toBeGreaterThan(0); expect(JSON.stringify(exported.accountRecords.teachingToolRuns)).not.toMatch(/authorizationSessionId|commandHash|inputHash|taskId|commands/);
      const row = await create(), queued = await create(draft('hint_draft')); mode = 'hold'; const work = worker.runNext(); await expect.poll(() => !!release).toBe(true);
      const originalTasks = await store.requestContext(() => [row, queued].map(run => structuredClone(store.find('teachingToolRuns', { id: run.id }))));
      const before = await store.requestContext(() => ['diagnosticResponses', 'diagnosticPlans', 'scoringRevisions'].map(name => structuredClone(store.select(name, {}))));
      const bundle = join(recovery, 'old-bundle');
      if (sourceLocation) await postgresBackup.createPostgresBundle({ connectionString: sourceLocation, dataDir: directory, destination: bundle, pgBin: process.env.STUDY_TEST_PG_BIN });
      else await backup.createBundle({ dataDir: directory, destination: bundle });
      const preview = await call('get', '/privacy/account/deletion-preview'); expect(preview).toMatchObject({ canDelete: true, deletedChildren: [], retainedChildren: [] });
      await call('post', '/privacy/account/delete', { credential: admin.credential, requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint });
      release!(); await work; mode = 'valid';
      for (const original of originalTasks) expect((await store.tasks.get(original.taskId)).state).toBe('cancelled');
      expect(await store.requestContext(() => store.select('teachingToolRuns', { ownerUserId: admin.user.id }))).toEqual([]);
      expect(await store.requestContext(() => store.find('users', { id: other.user.id }))).toBeTruthy();
      expect(await store.requestContext(() => ['diagnosticResponses', 'diagnosticPlans', 'scoringRevisions'].map(name => structuredClone(store.select(name, {}))))).toEqual(before);
      await call('get', '/auth/me', undefined, admin, 401);
      const ledgerFile = join(recovery, 'current-deletion-ledger.json'); await ledger.exportLedger({ dataDir: directory, connectionString: sourceLocation, destination: ledgerFile });
      const restoredLocation = await newDatabase();
      if (restoredLocation) await postgresBackup.restorePostgresBundle({ connectionString: restoredLocation, bundle, destination: join(recovery, 'restored'), deletionLedger: ledgerFile, pgBin: process.env.STUDY_TEST_PG_BIN });
      else await backup.restoreBundle({ bundle, destination: join(recovery, 'restored'), deletionLedger: ledgerFile });
      const restored = new DomainDatabase(restoredLocation ?? join(recovery, 'restored/study-agent.sqlite3')); await restored.open();
      try { const state = (await restored.read()).state; expect(state.users.some((actor: any) => actor.id === admin.user.id)).toBe(false);
        expect(state.users.some((actor: any) => actor.id === other.user.id)).toBe(true); expect((state.teachingToolRuns ?? []).filter((row: any) => row.ownerUserId === admin.user.id)).toEqual([]);
        expect(['diagnosticResponses', 'diagnosticPlans', 'scoringRevisions'].map(name => state[name])).toEqual(before);
      } finally { await restored.close(); }
    } finally { if (!resolve(recovery).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe synthetic recovery directory'); rmSync(recovery, { recursive: true, force: true }); }
  });
});
