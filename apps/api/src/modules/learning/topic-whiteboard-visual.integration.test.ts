import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, rmSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import type { ClassroomImageService } from '../ai/classroom-image.service';
import type { TopicVisualCapabilities } from '@study-agent/contracts';

describe('topic whiteboard image candidates through actual HTTP and durable tasks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-topic-visual-http-'));
  const names = ['NODE_ENV', 'DATABASE_URL', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION',
    'XIAOJIU_CHAT_ENABLED', 'OPENAI_API_KEY', 'MINIMAX_API_KEY'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  const root = resolve(__dirname, '../../../../..'), sample = join(root, 'resources/teaching-visuals/topic-whiteboard/sociology-intersection-no-heading-3f4d62a9.png');
  const base = '/learning/studio/topic-whiteboard-visuals', boards = '/learning/studio/topic-whiteboards', modelId = 'deepseek-v4-flash';
  let app: any, store: any, chat: any, textWorker: any, worker: any, owner: any, other: any, ip = 0;
  let images: ClassroomImageService;
  let calls: any[] = [], pg: Pool | undefined, schema: string | undefined;
  async function call(method: 'get' | 'post' | 'patch' | 'put', path: string, body?: unknown, actor = owner, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (path === '/auth/register') query = query.set('X-Forwarded-For', '198.18.77.' + (++ip));
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  async function register() {
    const credential = 'Synthetic-topic-image-' + randomUUID();
    return { ...await call('post', '/auth/register', { principal: 'figure-' + randomUUID() + '@local.test', credential }, null), credential };
  }
  const capability = (): TopicVisualCapabilities => ({ available: true, editAvailable: true, modelId: 'gpt-image-2', reason: 'ready', message: 'Controlled fixture, no live provider call' });
  async function output(prompt: string, stage: string, source: string | null, signal: AbortSignal) {
    calls.push({ prompt, stage, source, signal, original: source ? readFileSync(source) : null });
    const file = join(stage, 'controlled-landscape.png'); copyFileSync(sample, file); return { output: file, promptPath: join(stage, 'not-a-provider-prompt.txt') };
  }
  function provider() {
    vi.spyOn(chat, 'enabled', 'get').mockReturnValue(true);
    vi.spyOn(chat, 'structured').mockImplementation(async (input: any, _schema: any, check: any) => {
      const context = JSON.parse(input.context), stage = JSON.parse(input.message).stage;
      const content = { title: '保留条件再比较', description: '匿名合成资料，不作为教学质量证明。', scenes: ['先观察', '比较条件', '留下检验'].map((title, index) => ({
        kind: index === 0 ? 'title' : index === 2 ? 'check' : 'concept', title, narration: title + '，完整说明条件和关系。', body: '保留待核对的解释。',
        bullets: [title], targetAtomIds: context.targets.map((item: any) => item.id), exhibit: index === 1 ? { kind: 'table', headers: ['观察', '条件'], rows: [['人群', '时间']] } : null })) };
      return { ...check(stage === 'reviewing' ? { decision: 'pass', issues: [], revisedContent: null } : content), modelId: input.modelId, modelName: 'Controlled synthetic text' };
    });
    vi.spyOn(images, 'figureCapabilities').mockResolvedValue(capability());
    vi.spyOn(images, 'generate').mockImplementation((prompt: string, stage: string, signal: AbortSignal, options?: { size: '1024x1024' | '1536x1024' }) => {
      expect(options).toEqual({ size: '1536x1024' }); return output(prompt, stage, null, signal);
    });
    vi.spyOn(images, 'edit').mockImplementation((prompt: string, stage: string, source: string, signal: AbortSignal, options?: { size: '1024x1024' | '1536x1024' }) => {
      expect(options).toEqual({ size: '1536x1024' }); return output(prompt, stage, source, signal);
    });
  }
  async function boot() {
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    chat = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService); images = app.get(load('modules/ai/classroom-image.service').ClassroomImageService);
    textWorker = app.get(load('modules/learning/topic-whiteboard-worker.service').TopicWhiteboardWorkerService);
    worker = app.get(load('modules/learning/topic-whiteboard-visual-worker.service').TopicWhiteboardVisualWorkerService); provider();
  }
  async function draft(actor = owner, audience: any = { kind: 'adult' }) {
    const input = { audience, prompt: '匿名社会观察与条件', objective: '比较观察和推断的关系', modelId };
    const preflight = await call('post', boards + '/preflight', input, actor);
    const queued = await call('post', boards + '/drafts', { ...input, preflightFingerprint: preflight.fingerprint, requestKey: randomUUID() }, actor);
    await textWorker.runNext(); return call('get', boards + '/drafts/' + queued.id, undefined, actor);
  }
  const inputFor = (draft: any, extra: any = {}) => ({ operation: 'generate', draftId: draft.id, sceneIndex: 0, expectedRevision: draft.revision,
    contentFingerprint: draft.contentFingerprint, purpose: 'concept', requirements: '用两个圆说明观察与条件的关系，标签完整可读。', ...extra });
  async function prepare(draftValue?: any, extra: any = {}, actor = owner) {
    const value = draftValue ?? await draft(actor), input = inputFor(value, extra), preflight = await call('post', base + '/preflight', input, actor);
    const command = { ...input, preflightFingerprint: preflight.fingerprint, requestKey: randomUUID() };
    const path = input.operation === 'edit' ? base + '/' + input.parentVisualId + '/edits' : base;
    return { view: await call('post', path, command, actor), command, draft: value, preflight, path };
  }
  async function ready(draftValue?: any, actor = owner) {
    const result = await prepare(draftValue, {}, actor); await worker.runNext(); return { ...result, view: await call('get', base + '/' + result.view.id, undefined, actor) };
  }
  const control = (view: any) => ({ expectedRevision: view.revision, taskVersion: view.task.version, generation: view.task.generation, requestKey: randomUUID() });
  async function change(draftValue: any, mutate: (content: any) => void, actor = owner) {
    const content = structuredClone(draftValue.content); mutate(content);
    return call('patch', boards + '/drafts/' + draftValue.id + '/content', { content, expectedRevision: draftValue.revision,
      contentFingerprint: draftValue.contentFingerprint, requestKey: randomUUID() }, actor);
  }
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false',
      STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' }); delete process.env.DATABASE_URL;
    if (process.env.STUDY_TEST_TOPIC_VISUAL_API_POSTGRES_URL) {
      pg = new Pool({ connectionString: process.env.STUDY_TEST_TOPIC_VISUAL_API_POSTGRES_URL });
      expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_topic_visual_http_' + randomUUID().replace(/-/g, ''); await pg.query(`CREATE SCHEMA "${schema}"`);
      const url = new URL(process.env.STUDY_TEST_TOPIC_VISUAL_API_POSTGRES_URL); url.searchParams.set('options', '-c search_path=' + schema);
      process.env.STUDY_STORAGE = 'postgres'; process.env.DATABASE_URL = url.toString();
    }
    await boot(); owner = await register(); other = await register();
  });
  beforeEach(() => { calls = []; vi.restoreAllMocks(); provider(); });
  afterAll(async () => {
    vi.restoreAllMocks(); await app?.close();
    if (pg && schema) { if (!/^study_qa_topic_visual_http_[a-f0-9]{32}$/.test(schema)) throw Error('Unknown owned QA schema'); await pg.query(`DROP SCHEMA "${schema}" CASCADE`); await pg.end(); }
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    rmSync(directory, { recursive: true, force: true });
  });
  it('preflights the complete scene without tasks, restores the original before provider probing and keeps candidate receipts private', async () => {
    const value = await draft(), input = inputFor(value);
    const before = await store.requestContext(() => store.inspect('studioTopicWhiteboardVisuals').length);
    const preflight = await call('post', base + '/preflight', input);
    expect(preflight.context.scene.title).toBe(value.content.scenes[0].title); expect(preflight.prompt).toContain('untrusted');
    expect(JSON.stringify(preflight)).not.toContain('sessionTokenHash'); expect(calls).toHaveLength(0);
    expect(await store.requestContext(() => store.inspect('studioTopicWhiteboardVisuals').length)).toBe(before);
    await call('post', base + '/preflight', { ...input, source: 'file:///arbitrary' }, owner, 400);
    await call('post', base + '/preflight', input, other, 404);
    const result = await prepare(value);
    vi.mocked(images.figureCapabilities).mockRejectedValue(Error('PRIVATE PROVIDER IS DOWN'));
    const replay = await call('post', base, result.command); expect(replay.id).toBe(result.view.id); expect(replay.receipt).toEqual(result.view.receipt);
    expect((await call('get', base + '/requests/' + result.command.requestKey)).id).toBe(result.view.id);
    expect((await call('get', base + '/' + result.view.id + '/requests/' + result.command.requestKey)).receipt.kind).toBe('prepare');
    await call('post', base, { ...result.command, requirements: '改过的需求不得借用原键' }, owner, 409);
    await call('get', base + '/' + result.view.id, undefined, other, 404);
    await call('get', base + '/requests/' + result.command.requestKey, undefined, other, 404);
    await call('post', base + '/' + result.view.id + '/cancel', control(result.view));
  });
  it('publishes verifiable landscape bytes once and supports a real original PNG edit without overwriting the parent', async () => {
    const first = await ready(); expect(first.view).toMatchObject({ status: 'ready', currentTeaching: true, width: 1536, height: 1024, contentReview: 'pending' });
    expect(calls).toHaveLength(1); expect(calls[0].source).toBeNull();
    const response = await request(app.getHttpServer()).get('/api' + base + '/' + first.view.id + '/original').set('Authorization', 'Bearer ' + owner.token).expect(200);
    expect(response.body.equals(readFileSync(sample))).toBe(true); expect(response.headers['cache-control']).toContain('private');
    expect(JSON.stringify(first.view)).not.toContain('sessionTokenHash'); expect(JSON.stringify(first.view)).not.toContain('promptVersion');
    await call('get', base + '/' + first.view.id + '/image', undefined, other, 404);
    const edit = await prepare(first.draft, { operation: 'edit', parentVisualId: first.view.id, changes: '只去掉顶端标题，保留其他标签和关系。' });
    await call('post', base + '/' + edit.view.id + '/edits', edit.command, owner, 409);
    await worker.runNext(); const edited = await call('get', base + '/' + edit.view.id);
    expect(edited).toMatchObject({ status: 'ready', parentVisualId: first.view.id, operation: 'edit' });
    expect(calls).toHaveLength(2); expect(calls[1].original.equals(readFileSync(sample))).toBe(true); expect(calls[1].source).not.toContain(edit.view.id);
    expect((await call('get', base + '/' + first.view.id)).sha256).toBe(first.view.sha256);
    const list = await call('get', base + '?draftId=' + first.draft.id + '&sceneIndex=0&limit=1'); expect(list.total).toBe(2); expect(list.items).toHaveLength(1);
    expect((await call('get', base + '?draftId=' + first.draft.id + '&sceneIndex=0&page=2&limit=1')).items[0].id).not.toBe(list.items[0].id);
    await call('get', base + '?draftId=' + first.draft.id + '&sceneIndex=0', undefined, other, 404);
    await call('post', base + '/' + first.view.id + '/cancel', control(first.view), owner, 409);
  });
  it('compares the exact preflight revision and refuses new work while capabilities are unavailable', async () => {
    const value = await draft(), input = inputFor(value), preflight = await call('post', base + '/preflight', input);
    const command = { ...input, preflightFingerprint: preflight.fingerprint, requestKey: randomUUID() };
    vi.mocked(images.figureCapabilities).mockResolvedValue({ ...capability(), available: false, editAvailable: false, reason: 'environment_unavailable' });
    await call('post', base, command, owner, 503); expect(calls).toHaveLength(0);
    vi.mocked(images.figureCapabilities).mockResolvedValue(capability()); await change(value, content => { content.description += '补充说明。'; });
    await call('post', base, command, owner, 409);
  });
  it('cancels queued work without invoking a provider, retries explicitly and returns the immutable old-generation receipt', async () => {
    const result = await prepare(), command = control(result.view), cancelled = await call('post', base + '/' + result.view.id + '/cancel', command);
    expect(cancelled.status).toBe('cancelled'); expect(await worker.runNext()).toBe(false); expect(calls).toHaveLength(0);
    const retry = await call('post', base + '/' + result.view.id + '/retry', control(cancelled)); expect(retry.task.generation).toBe(2);
    const replay = await call('post', base + '/' + result.view.id + '/cancel', command); expect(replay.receipt).toEqual(cancelled.receipt); expect(replay.task.generation).toBe(2);
    await call('post', base + '/' + result.view.id + '/cancel', { ...command, requestKey: randomUUID() }, owner, 409);
    await call('get', base + '/requests/' + command.requestKey, undefined, owner, 404);
    expect((await call('get', base + '/' + result.view.id + '/requests/' + command.requestKey)).receipt.kind).toBe('cancel');
    await worker.runNext(); expect((await call('get', base + '/' + result.view.id)).status).toBe('ready'); expect(calls).toHaveLength(1);
  });
  it('rejects a late PNG after running cancellation even if the controlled provider ignores the abort signal', async () => {
    let entered!: () => void, release!: () => void, heldSignal!: AbortSignal;
    const waiting = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(images.generate).mockImplementation(async (prompt: string, stage: string, signal: AbortSignal) => { heldSignal = signal; entered(); await held; return output(prompt, stage, null, signal); });
    const result = await prepare(), pending = worker.runNext(); await waiting;
    const cancelled = await call('post', base + '/' + result.view.id + '/cancel', control(result.view)); expect(cancelled.status).toBe('cancelling');
    await vi.waitFor(() => expect(heldSignal.aborted).toBe(true), { timeout: 6000 }); release(); await pending;
    const view = await call('get', base + '/' + result.view.id); expect(view.status).toBe('cancelled'); expect(view.imageUrl).toBeNull();
    expect(existsSync(join(directory, 'topic-whiteboard-visuals', result.view.id))).toBe(false);
    await call('get', base + '/' + result.view.id + '/original', undefined, owner, 409);
  });
  it('allows an unrelated manuscript description revision while refusing a changed teaching scene before late publication', async () => {
    let entered!: () => void, release!: () => void;
    async function hold() {
      const waiting = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
      vi.mocked(images.generate).mockImplementation(async (prompt: string, stage: string, signal: AbortSignal) => { entered(); await held; return output(prompt, stage, null, signal); });
      return waiting;
    }
    let waiting = hold(); const first = await prepare(), firstPending = worker.runNext(); await waiting;
    await change(first.draft, content => { content.description += '另加整稿说明。'; }); release(); await firstPending;
    expect((await call('get', base + '/' + first.view.id)).status).toBe('ready');
    waiting = hold(); const second = await prepare(), secondPending = worker.runNext(); await waiting;
    await change(second.draft, content => { content.scenes[0].body += '本幕教学条件变化。'; }); release(); await secondPending;
    const failed = await call('get', base + '/' + second.view.id); expect(failed).toMatchObject({ status: 'failed', currentTeaching: false, imageUrl: null });
    await call('post', base + '/' + second.view.id + '/retry', control(failed), owner, 409);
  });
  it('keeps historical images readable after scene changes but checks exact file SHA and rejects foreign, stale and cross-scene edit sources', async () => {
    const first = await ready();
    await call('post', base + '/preflight', inputFor(first.draft, { operation: 'edit', sceneIndex: 1, parentVisualId: first.view.id, changes: '去掉标题，保留内容。' }), owner, 409);
    const value = await change(first.draft, content => { content.scenes[0].body += '补充原幕条件。'; });
    expect((await call('get', base + '/' + first.view.id)).currentTeaching).toBe(false);
    await request(app.getHttpServer()).get('/api' + base + '/' + first.view.id + '/image').set('Authorization', 'Bearer ' + owner.token).expect(200);
    await call('post', base + '/preflight', inputFor(value, { operation: 'edit', parentVisualId: first.view.id, changes: '去掉标题，保留内容。' }), owner, 409);
    const foreignDraft = await draft(other); await call('post', base + '/preflight', inputFor(foreignDraft, { operation: 'edit', parentVisualId: first.view.id, changes: '去掉标题，保留内容。' }), other, 409);
    const row = await store.requestContext(() => structuredClone(store.find('studioTopicWhiteboardVisuals', { id: first.view.id })));
    const original = load('modules/learning/topic-whiteboard-visual-storage').topicVisualFile(row);
    writeFileSync(original.path, Buffer.alloc(original.size)); await call('get', base + '/' + first.view.id + '/image', undefined, owner, 409);
  });
  it('does not publish under a replacement login after the original author logs out during image generation', async () => {
    const actor = await register(); let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(images.generate).mockImplementation(async (prompt: string, stage: string, signal: AbortSignal) => { entered(); await held; return output(prompt, stage, null, signal); });
    const result = await prepare(undefined, {}, actor), pending = worker.runNext(); await waiting;
    await call('post', '/auth/logout', {}, actor); release(); await pending;
    const renewed = await call('post', '/auth/login', { principal: actor.user.principal, credential: actor.credential }, null);
    const failed = await call('get', base + '/' + result.view.id, undefined, renewed); expect(failed.status).toBe('failed'); expect(failed.imageUrl).toBeNull();
    vi.mocked(images.generate).mockImplementation((prompt: string, stage: string, signal: AbortSignal) => output(prompt, stage, null, signal));
    await call('post', base + '/' + result.view.id + '/retry', control(failed), renewed); await worker.runNext();
    expect((await call('get', base + '/' + result.view.id, undefined, renewed)).status).toBe('ready');
  });
  it('retains a failed original request across a native store reopen and requires explicit retry before a second provider invocation', async () => {
    vi.mocked(images.generate).mockRejectedValue(Error('PRIVATE provider detail with token')); const result = await prepare(); await worker.runNext();
    const failed = await call('get', base + '/' + result.view.id); expect(failed.status).toBe('failed'); expect(JSON.stringify(failed)).not.toContain('token');
    vi.restoreAllMocks(); await app.close(); await boot(); expect(await worker.runNext()).toBe(false);
    const reopened = await call('get', base + '/requests/' + result.command.requestKey); expect(reopened.receipt.commandFingerprint).toBe(result.view.receipt.commandFingerprint);
    await call('post', base + '/' + result.view.id + '/retry', control(reopened)); await worker.runNext();
    const completed = await call('get', base + '/' + result.view.id); expect(completed.status).toBe('ready');
    const row = await store.requestContext(() => structuredClone(store.find('studioTopicWhiteboardVisuals', { id: completed.id })));
    expect(createHash('sha256').update(readFileSync(sample)).digest('hex')).toBe(row.files.original.sha256);
    expect(row.input).toEqual(result.command); expect(row.modelId).toBe('gpt-image-2');
  });
  it('keeps a single original candidate under two actual application instances and replays the winning prepare', async () => {
    const value = await draft(), input = inputFor(value), preflight = await call('post', base + '/preflight', input);
    const command = { ...input, preflightFingerprint: preflight.fingerprint, requestKey: randomUUID() };
    const second = await NestFactory.create(load('app.module').AppModule, { logger: false }); second.setGlobalPrefix('api'); await second.init();
    const secondImages = second.get(load('modules/ai/classroom-image.service').ClassroomImageService);
    const probe = vi.spyOn(secondImages, 'figureCapabilities').mockResolvedValue(capability());
    try {
      const results = await Promise.all([app, second].map(instance => request(instance.getHttpServer()).post('/api' + base).set('Authorization', 'Bearer ' + owner.token).send(command)));
      expect(results.some(result => result.status === 201)).toBe(true); expect(results.every(result => [201, 409].includes(result.status))).toBe(true);
      const replay = await call('post', base, command), rows = await store.requestContext(() => store.select('studioTopicWhiteboardVisuals', { ownerUserId: owner.user.id, requestKey: command.requestKey }));
      expect(rows).toHaveLength(1); expect(replay.id).toBe(rows[0].id); await call('post', base + '/' + replay.id + '/cancel', control(replay));
    } finally { probe.mockRestore(); await second.close(); }
  });
  it('refuses a late edit when its actual source PNG bytes change after the provider has read them', async () => {
    const first = await ready(); let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(images.edit).mockImplementation(async (prompt: string, stage: string, source: string, signal: AbortSignal) => {
      const result = await output(prompt, stage, source, signal); entered(); await held; return result;
    });
    const edit = await prepare(first.draft, { operation: 'edit', parentVisualId: first.view.id, changes: '去掉标题，保留其他关系和文字。' });
    const pending = worker.runNext(); await waiting;
    const row = await store.requestContext(() => structuredClone(store.find('studioTopicWhiteboardVisuals', { id: first.view.id })));
    const original = load('modules/learning/topic-whiteboard-visual-storage').topicVisualFile(row, 'original'); writeFileSync(original.path, Buffer.alloc(original.size));
    release(); await pending; const failed = await call('get', base + '/' + edit.view.id);
    expect(failed.status).toBe('failed'); expect(failed.imageUrl).toBeNull(); expect(calls).toHaveLength(2);
  });
});
