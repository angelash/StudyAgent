import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { whiteboardPresentation } from '@study-agent/contracts';

describe('AI topic whiteboards through real HTTP and checkpointed tasks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-topic-http-'));
  const names = ['NODE_ENV', 'DATABASE_URL', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED', 'OPENAI_API_KEY', 'MINIMAX_API_KEY'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, chat: any, worker: any, speech: any, owner: any, other: any, pg: Pool | undefined, schema: string | undefined;
  let ip = 0, calls: any[] = [];
  const base = '/learning/studio/topic-whiteboards', modelId = 'deepseek-v4-flash';
  const adult = () => ({ audience: { kind: 'adult' }, prompt: '比较匿名公共空间的观察', objective: '分清观察、条件和推断', modelId });
  async function call(method: 'get' | 'post' | 'patch' | 'put', path: string, body?: unknown, actor = owner, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (path === '/auth/register') query = query.set('X-Forwarded-For', '198.18.75.' + (++ip));
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  async function register() {
    const credential = 'Synthetic-topic-' + randomUUID();
    return { ...await call('post', '/auth/register', { principal: 'topic-' + randomUUID() + '@local.test', credential }, null), credential };
  }
  function fake(input: any, check: (value: unknown) => any) {
    calls.push(input); const context = JSON.parse(input.context), stage = JSON.parse(input.message).stage;
    const content = { title: '比较条件再判断', description: '保留完整观察和不确定性。', scenes: ['先观察', '再比较', '留反例'].map((title, index) => ({
      kind: index === 0 ? 'title' : index === 2 ? 'check' : 'concept', title, narration: title + '，保留完整条件再作判断。',
      body: '不把一次观察当成能力证明。', bullets: [title], targetAtomIds: context.targets.map((target: any) => target.id),
      exhibit: index === 1 ? { kind: 'table', headers: ['观察', '条件'], rows: [['排队', '周末'], ['空位', '工作日']] } :
        index === 2 ? { kind: 'formula', latex: '1+1=2', explanation: '同一计数单位下合并数量。' } : null,
    })) };
    return { ...check(stage === 'reviewing' ? { decision: 'pass', issues: [], revisedContent: null } : content), modelId: input.modelId, modelName: '受控匿名模型' };
  }
  function provider() {
    vi.spyOn(chat, 'enabled', 'get').mockReturnValue(true);
    vi.spyOn(chat, 'structured').mockImplementation(async (input: any, _schema: any, check: any) => fake(input, check));
  }
  async function boot() {
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    chat = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
    worker = app.get(load('modules/learning/topic-whiteboard-worker.service').TopicWhiteboardWorkerService);
    speech = app.get(load('modules/ai/speech.service').SpeechService); provider();
  }
  async function prepare(input = adult(), actor = owner) {
    const preview = await call('post', base + '/preflight', input, actor);
    const command = { ...input, preflightFingerprint: preview.fingerprint, requestKey: randomUUID() };
    return { view: await call('post', base + '/drafts', command, actor), command };
  }
  async function ready(input = adult(), actor = owner) {
    const { view } = await prepare(input, actor); expect(await worker.runNext()).toBe(true);
    return call('get', base + '/drafts/' + view.id, undefined, actor);
  }
  const control = (view: any) => ({ expectedRevision: view.revision, generation: view.generation, taskVersion: view.task.version, requestKey: randomUUID() });
  const confirm = (view: any) => ({ expectedRevision: view.revision, contentFingerprint: view.contentFingerprint,
    acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: false, requestKey: randomUUID() });
  async function child() {
    const created = await call('post', '/students', { nickname: '匿名白板学习者', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } });
    const studentId = created.profile.id, atomId = 'topic-atom-' + randomUUID();
    await store.transaction(() => {
      store.append('knowledgeAtoms', { id: atomId, name: '比较计数单位', objective: '比较之前先确认计数单位相同', successCriterion: '在新情境中说明计数单位',
        grade: 3, term: 'both', subject: 'math', strand: '数与运算', version: 1, curriculumVersion: 'topic-synthetic', status: 'published', prerequisiteIds: [] });
      store.append('learningScopes', { id: 'scope-' + randomUUID(), studentId, subject: 'math', grade: 3, term: 'upper', version: 1,
        learnedAtomIds: [atomId], confirmedAt: new Date().toISOString(), minutesPerSession: 15 });
    });
    await call('post', '/students/' + studentId + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '匿名AI白板学习路径测试' });
    const code = await call('post', '/students/' + studentId + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() });
    const learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    return { studentId, atomId, bindingId: created.binding.id, learner, input: { ...adult(), audience: { kind: 'student', studentId, subject: 'math', atomIds: [atomId] } } as any };
  }
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false',
      STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' }); delete process.env.DATABASE_URL;
    if (process.env.STUDY_TEST_TOPIC_WHITEBOARD_API_POSTGRES_URL) {
      pg = new Pool({ connectionString: process.env.STUDY_TEST_TOPIC_WHITEBOARD_API_POSTGRES_URL });
      expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_topic_http_' + randomUUID().replace(/-/g, ''); await pg.query(`CREATE SCHEMA "${schema}"`);
      const url = new URL(process.env.STUDY_TEST_TOPIC_WHITEBOARD_API_POSTGRES_URL); url.searchParams.set('options', '-c search_path=' + schema);
      process.env.STUDY_STORAGE = 'postgres'; process.env.DATABASE_URL = url.toString();
    }
    await boot(); owner = await register(); other = await register();
  });
  beforeEach(() => { calls = []; vi.restoreAllMocks(); provider(); });
  afterAll(async () => {
    vi.restoreAllMocks(); await app?.close();
    if (pg && schema) { if (!/^study_qa_topic_http_[a-f0-9]{32}$/.test(schema)) throw Error('Unknown isolated QA schema'); await pg.query(`DROP SCHEMA "${schema}" CASCADE`); await pg.end(); }
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    rmSync(directory, { recursive: true, force: true });
  });
  it('preflights without writes and restores an original prepare before model resolution while rejecting changed keys and other owners', async () => {
    const before = await store.requestContext(() => store.inspect('studioTopicWhiteboardDrafts').length);
    await call('post', base + '/preflight', adult());
    expect(await store.requestContext(() => store.inspect('studioTopicWhiteboardDrafts').length)).toBe(before); expect(calls).toEqual([]);
    const { view, command } = await prepare();
    const models = app.get(load('modules/ai/xiaojiu-models.service').XiaojiuModelsService);
    const resolver = vi.spyOn(models, 'resolve').mockImplementation(() => { throw Error('Should not resolve a replacement model'); });
    expect((await call('post', base + '/drafts', command)).id).toBe(view.id); resolver.mockRestore();
    await call('post', base + '/drafts', { ...command, prompt: '不同主题不能借用旧键' }, owner, 409);
    await call('get', base + '/drafts/' + view.id, undefined, other, 404);
    expect((await call('get', base + '/drafts/' + view.id + '/requests/' + command.requestKey)).receipt.kind).toBe('prepare');
    const cancelled = await call('post', base + '/drafts/' + view.id + '/cancel', control(view)); expect(cancelled.status).toBe('cancelled');
  });
  it('writes and reviews once, keeps complete tables/formulas and publishes only after explicit confirmation without learning facts', async () => {
    const view = await ready(); expect(view).toMatchObject({ status: 'ready', stage: 'completed', modelId, review: { decision: 'pass', current: true } });
    expect(calls).toHaveLength(2); expect((await call('get', base)).total).toBe(0);
    const command = confirm(view), first = await call('post', base + '/drafts/' + view.id + '/confirm', command);
    const replay = await call('post', base + '/drafts/' + view.id + '/confirm', command); expect(replay.whiteboardId).toBe(first.whiteboardId);
    const board = await call('get', base + '/' + first.whiteboardId);
    expect(board).toMatchObject({ kind: 'ai-topic-whiteboard', studentId: null, subject: null, origin: { draftId: view.id, formalMeasurementEligible: false, teacherReviewStatus: 'pending' } });
    expect(board.scenes[1].exhibit.rows).toEqual([['排队', '周末'], ['空位', '工作日']]); expect(board.scenes[2].exhibit.latex).toBe('1+1=2');
    expect(whiteboardPresentation(board).units.map(unit => unit.text).join('')).toContain('留反例');
    await call('get', base + '/' + first.whiteboardId, undefined, other, 404);
    expect(await store.requestContext(() => store.inspect('diagnosticResponses').length + store.inspect('studioActivities').length)).toBe(0);
    expect(JSON.stringify(view)).not.toContain('sessionTokenHash'); expect(JSON.stringify(view)).not.toContain('context');
  });
  it('reopens a failed review and retries the original model without repeating the completed writing checkpoint', async () => {
    vi.mocked(chat.structured).mockImplementation(async (input: any, _schema: any, check: any) => {
      if (JSON.parse(input.message).stage === 'reviewing') { calls.push(input); throw Error('PRIVATE PROVIDER FAILURE'); } return fake(input, check);
    });
    const { view } = await prepare(); await worker.runNext(); const failed = await call('get', base + '/drafts/' + view.id);
    expect(failed).toMatchObject({ status: 'failed', stage: 'reviewing', originalContent: { title: '比较条件再判断' } });
    expect(JSON.stringify(failed)).not.toContain('PRIVATE PROVIDER FAILURE');
    vi.restoreAllMocks(); await app.close(); await boot();
    const reopened = await call('get', base + '/drafts/' + view.id); expect(reopened.originalContent).toEqual(failed.originalContent);
    const retry = await call('post', base + '/drafts/' + view.id + '/retry', control(reopened)); expect(retry.generation).toBe(2);
    await worker.runNext(); const completed = await call('get', base + '/drafts/' + view.id); expect(completed.status).toBe('ready');
    expect(calls.map(input => JSON.parse(input.message).stage)).toEqual(['writing', 'reviewing', 'reviewing']); expect(calls.every(input => input.modelId === modelId)).toBe(true);
  });
  it('preserves full edit history, exact edit receipts and the original review while requiring explicit acknowledgement of changed content', async () => {
    const view = await ready(), content = structuredClone(view.content); content.description = '补充完整条件，保留尚未核对的问题。';
    const command = { expectedRevision: view.revision, contentFingerprint: view.contentFingerprint, content, requestKey: randomUUID() };
    const changed = await call('patch', base + '/drafts/' + view.id + '/content', command); expect(changed.review.current).toBe(false);
    expect(changed.originalContent).toEqual(view.originalContent); expect((await call('patch', base + '/drafts/' + view.id + '/content', command)).receipt).toEqual(changed.receipt);
    await call('patch', base + '/drafts/' + view.id + '/content', { ...command, content: view.content }, owner, 409);
    const history = await call('get', base + '/drafts/' + view.id + '/history?limit=1'); expect(history.total).toBe(1); expect(history.items[0].content).toEqual(view.content);
    await call('post', base + '/drafts/' + view.id + '/confirm', confirm(changed), owner, 400);
    const saved = await call('post', base + '/drafts/' + view.id + '/confirm', { ...confirm(changed), acknowledgeUnreviewedChanges: true });
    expect((await call('get', base + '/' + saved.whiteboardId)).origin.review.current).toBe(false);
    expect((await call('get', base + '/drafts?search=' + encodeURIComponent('匿名公共空间') + '&limit=2')).items.length).toBe(2);
  });
  it('supports real learning-code generation while keeping other authors drafts private and sharing only confirmed child boards', async () => {
    const childScope = await child(); await call('post', base + '/preflight', adult(), childScope.learner, 403);
    const view = await ready(childScope.input, childScope.learner); await call('get', base + '/drafts/' + view.id, undefined, owner, 404);
    const saved = await call('post', base + '/drafts/' + view.id + '/confirm', confirm(view), childScope.learner);
    expect((await call('get', base + '/' + saved.whiteboardId, undefined, owner)).origin.draftId).toBeNull();
    expect((await call('get', base + '/' + saved.whiteboardId, undefined, childScope.learner)).origin.draftId).toBe(view.id);
    expect(calls.every(input => !input.context.includes(childScope.studentId))).toBe(true);
    await call('post', base + '/preflight', { ...childScope.input, audience: { ...childScope.input.audience, atomIds: ['not-selected'] } }, owner, 400);
    await store.transaction(() => { store.find('bindings', { id: childScope.bindingId }).status = 'revoked'; });
    await call('get', base + '/' + saved.whiteboardId, undefined, owner, 403);
    await call('get', base + '/' + saved.whiteboardId, undefined, childScope.learner, 401);
  });
  it('cancels a generation after it is claimed, aborts its actual provider signal and fences old controls after an explicit retry', async () => {
    let entered!: () => void; const waiting = new Promise<void>(resolve => { entered = resolve; }); let heldSignal: AbortSignal | undefined;
    vi.mocked(chat.structured).mockImplementation(async (input: any) => {
      heldSignal = input.signal; entered(); await new Promise((_resolve, reject) => input.signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }));
      throw Error('unreachable');
    });
    const { view } = await prepare(), pending = worker.runNext(); await waiting;
    const command = control(view); const cancelling = await call('post', base + '/drafts/' + view.id + '/cancel', command); expect(cancelling.status).toBe('cancelling');
    await vi.waitFor(() => expect(heldSignal?.aborted).toBe(true), { timeout: 5000 }); await pending;
    const cancelled = await call('get', base + '/drafts/' + view.id); expect(cancelled.status).toBe('cancelled'); expect(cancelled.content).toBeNull();
    vi.restoreAllMocks(); provider(); const retry = await call('post', base + '/drafts/' + view.id + '/retry', control(cancelled)); expect(retry.generation).toBe(2);
    expect((await call('post', base + '/drafts/' + view.id + '/cancel', command)).receipt.generation).toBe(1);
    await call('post', base + '/drafts/' + view.id + '/cancel', { ...command, requestKey: randomUUID() }, owner, 409);
    await worker.runNext(); expect((await call('get', base + '/drafts/' + view.id)).status).toBe('ready');
  });
  it('rejects a late model result after a separately committed logout rather than restoring it under a new login', async () => {
    const actor = await register(); let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(chat.structured).mockImplementation(async (input: any, _schema: any, check: any) => { entered(); await held; return fake(input, check); });
    const { view } = await prepare(adult(), actor), pending = worker.runNext(); await waiting;
    await call('post', '/auth/logout', {}, actor); release(); await pending;
    const renewed = await call('post', '/auth/login', { principal: actor.user.principal, credential: actor.credential }, null);
    const result = await call('get', base + '/drafts/' + view.id, undefined, renewed); expect(result.status).toBe('failed'); expect(result.originalContent).toBeNull();
  });
  it('checks the original session again after actual async narration and preserves private no-store presentation identity', async () => {
    const actor = await register(), view = await ready(adult(), actor), saved = await call('post', base + '/drafts/' + view.id + '/confirm', confirm(view), actor);
    const board = await call('get', base + '/' + saved.whiteboardId, undefined, actor), unit = whiteboardPresentation(board).units[0];
    const input = { presentationVersion: 'whiteboard-speech-v1', fingerprint: board.fingerprint, unitId: unit.id };
    const path = '/api' + base + '/' + board.id + '/narration/' + unit.sceneId;
    vi.spyOn(speech, 'synthesize').mockResolvedValue({ content: Buffer.from('controlled-audio'), contentType: 'audio/wav' });
    const response = await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + actor.token).send(input).expect(201);
    expect(response.headers['cache-control']).toContain('no-store'); expect(response.headers['x-whiteboard-unit']).toBe(unit.id);
    let entered!: () => void, release!: () => void; const waiting = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(speech.synthesize).mockImplementation(async () => { entered(); await held; return { content: Buffer.from('late-private-audio'), contentType: 'audio/wav' }; });
    const pending = request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + actor.token).send(input).then((value: any) => value);
    await waiting; await call('post', '/auth/logout', {}, actor); release(); expect((await pending).status).toBe(401);
  });
  it('refuses a late child model result after another transaction changes its confirmed progress', async () => {
    const scope = await child(); let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(chat.structured).mockImplementation(async (input: any, _schema: any, check: any) => { entered(); await held; return fake(input, check); });
    const { view } = await prepare(scope.input), pending = worker.runNext(); await waiting;
    await store.transaction(() => { store.find('learningScopes', { studentId: scope.studentId }).version++; });
    release(); await pending;
    const failed = await call('get', base + '/drafts/' + view.id); expect(failed.status).toBe('failed'); expect(failed.originalContent).toBeNull();
    await call('post', base + '/drafts/' + view.id + '/retry', control(failed), owner, 409);
  });
  it('keeps one original candidate across two real application instances and replays the winning command', async () => {
    const input = adult(), preview = await call('post', base + '/preflight', input), command = { ...input, preflightFingerprint: preview.fingerprint, requestKey: randomUUID() };
    const second = await NestFactory.create(load('app.module').AppModule, { logger: false }); second.setGlobalPrefix('api'); await second.init();
    const secondProvider = vi.spyOn(second.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService), 'enabled', 'get').mockReturnValue(true);
    const failures: unknown[] = [];
    const observers = [app, second].map(instance => {
      const service = instance.get(load('modules/learning/topic-whiteboard.service').TopicWhiteboardService), original = service.prepare.bind(service);
      return vi.spyOn(service, 'prepare').mockImplementation(async (...args: any[]) => {
        try { return await original(...args); } catch (error: any) {
          failures.push({ code: error.code, name: error.name, message: error.message, constraint: error.constraint }); throw error;
        }
      });
    });
    try {
      const responses = await Promise.all([app, second].map(instance => request(instance.getHttpServer()).post('/api' + base + '/drafts').set('Authorization', 'Bearer ' + owner.token).send(command)));
      expect(responses.some(response => response.status === 201)).toBe(true);
      expect(responses.every(response => [201, 409].includes(response.status)), JSON.stringify({ responses: responses.map(response => ({ status: response.status, error: response.body.error })), failures })).toBe(true);
      const row = await call('post', base + '/drafts', command);
      expect(await store.requestContext(() => store.select('studioTopicWhiteboardDrafts', { ownerUserId: owner.user.id, requestKey: command.requestKey }).length)).toBe(1);
      await call('post', base + '/drafts/' + row.id + '/cancel', control(row));
    } finally { for (const observer of observers) observer.mockRestore(); secondProvider.mockRestore(); await second.close(); }
  });
  it.skipIf(Boolean(process.env.STUDY_TEST_TOPIC_WHITEBOARD_API_POSTGRES_URL))('deletes child drafts and boards, cancels queued generation and applies the newer ledger to an actual cold backup', async () => {
    const scope = await child(), view = await ready(scope.input), saved = await call('post', base + '/drafts/' + view.id + '/confirm', confirm(view));
    const queued = await prepare(scope.input), repo = resolve(__dirname, '../../../../..');
    const backup = require(join(repo, 'scripts/operations/backup.cjs')), ledger = require(join(repo, 'scripts/operations/privacy-ledger.cjs'));
    const caseDirectory = mkdtempSync(join(tmpdir(), 'study-topic-ledger-'));
    const bundle = join(caseDirectory, 'topic-child-bundle'), restored = join(caseDirectory, 'topic-child-restored'), ledgerPath = join(caseDirectory, 'topic-deletions.json');
    try {
    await backup.createBundle({ dataDir: directory, destination: bundle });
    const preview = await call('get', '/privacy/students/' + scope.studentId + '/deletion-preview');
    await call('post', '/privacy/students/' + scope.studentId + '/delete', { credential: owner.credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() });
    await call('get', base + '/' + saved.whiteboardId, undefined, owner, 404);
    expect((await store.tasks.get(queued.view.task.id)).state).toBe('cancelled');
    await ledger.exportLedger({ dataDir: directory, destination: ledgerPath });
    await backup.restoreBundle({ bundle, destination: restored, deletionLedger: ledgerPath });
    const recovered = new (load('infrastructure/domain-database').DomainDatabase)(join(restored, 'study-agent.sqlite3')); await recovered.open();
    try {
      const state = (await recovered.read()).state;
      expect((state.studioTopicWhiteboardDrafts ?? []).some((row: any) => row.studentId === scope.studentId)).toBe(false);
      expect((state.studioTopicWhiteboards ?? []).some((row: any) => row.studentId === scope.studentId)).toBe(false);
      expect(state.events.some((row: any) => row.eventName === 'privacy.restore_deletions_applied')).toBe(true);
    } finally { await recovered.close(); }
    } finally { rmSync(caseDirectory, { recursive: true, force: true }); }
  });
  it.skipIf(Boolean(process.env.STUDY_TEST_TOPIC_WHITEBOARD_API_POSTGRES_URL))('restores an interrupted native task and permits an explicit retry under the new login and current recovered generation', async () => {
    const actor = await register(), { view } = await prepare(adult(), actor);
    const task = await store.tasks.claim(['studio.topic-whiteboard.generate']); expect(task.id).toBe(view.task.id);
    const repo = resolve(__dirname, '../../../../..'), backup = require(join(repo, 'scripts/operations/backup.cjs'));
    const caseDirectory = mkdtempSync(join(tmpdir(), 'study-topic-interrupted-'));
    const bundle = join(caseDirectory, 'bundle'), restored = join(caseDirectory, 'restored');
    try {
      await backup.createBundle({ dataDir: directory, destination: bundle }); await app.close(); app = null;
      await backup.restoreBundle({ bundle, destination: restored }); process.env.STUDY_DATA_DIR = restored; await boot();
      const renewed = await call('post', '/auth/login', { principal: actor.user.principal, credential: actor.credential }, null);
      await worker.runNext(); const failed = await call('get', base + '/drafts/' + view.id, undefined, renewed);
      const recoveredTask = await store.tasks.get(view.task.id); expect(failed.status).toBe('failed'); expect(failed.generation).toBe(recoveredTask.generation);
      const retried = await call('post', base + '/drafts/' + view.id + '/retry', control(failed), renewed);
      expect(retried.generation).toBe(recoveredTask.generation + 1); await worker.runNext();
      expect((await call('get', base + '/drafts/' + view.id, undefined, renewed)).status).toBe('ready');
    } finally { await app?.close(); app = null; process.env.STUDY_DATA_DIR = directory; rmSync(caseDirectory, { recursive: true, force: true }); }
  });
});
