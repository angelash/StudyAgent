import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, rmSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { Pool } from 'pg';
import { whiteboardPresentation } from '@study-agent/contracts';

const postgres = process.env.STUDY_TEST_QUESTION_VISUAL_POSTGRES_URL;
describe('actual original-answer image HTTP tasks, byte identity and adoption versions on ' + (postgres ? 'PostgreSQL' : 'SQLite'), () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-question-figure-http-')), root = resolve(__dirname, '../../../../..');
  const sample = join(root, 'resources/teaching-visuals/topic-whiteboard/sociology-intersection-no-heading-3f4d62a9.png');
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  const envNames = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL', 'XIAOJIU_CHAT_ENABLED', 'MINIMAX_API_KEY', 'OPENAI_API_KEY'] as const;
  const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]])), base = '/learning/studio/whiteboard-question-visuals';
  let app: any, store: any, questions: any, figures: any, chat: any, images: any, owner: any, other: any, registrations = 0;
  let calls: Array<{ operation: string; prompt: string; source?: string }> = [];
  let admin: Pool | undefined, sourceLocation: string | undefined; const databases: string[] = [];
  async function database() {
    if (!admin || !postgres) return undefined;
    const name = 'study_qa_question_images_' + randomUUID().replace(/-/g, ''); await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
    const target = new URL(postgres); target.pathname = '/' + name; return target.toString();
  }
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = owner, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (path === '/auth/register') query = query.set('X-Forwarded-For', '198.18.88.' + (++registrations));
    if (body !== undefined) query = query.send(body as object); const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
  }
  async function register() { const credential = 'Synthetic-image-' + randomUUID(), principal = 'question-image-' + randomUUID() + '@local.test'; return { ...await call('post', '/auth/register', { principal, credential }, null), principal, credential }; }
  async function login(actor: any) { return { ...await call('post', '/auth/login', { principal: actor.principal, credential: actor.credential }, null), principal: actor.principal, credential: actor.credential }; }
  function providers() {
    vi.spyOn(chat, 'structured').mockImplementation(async (...args: any[]) => {
      const input = args[0], context = JSON.parse(input.context), reply = '先确认相同计量单位。再用完整条件比较。';
      return { ...args[2]({ reply, anchors: [context.anchors[0].id], board: { title: '单位与条件', points: ['先统一单位'], diagram: null, table: null, formulas: [],
        anchors: { points: ['先确认相同计量单位'], tableRows: [], formulas: [] } } }), modelId: input.modelId, modelName: '合成图像HTTP教学模型' };
    });
    vi.spyOn(images, 'figureCapabilities').mockResolvedValue({ available: true, editAvailable: true, modelId: 'gpt-image-2', reason: 'ready', message: 'Isolated PNG fixture' });
    vi.spyOn(images, 'generate').mockImplementation(async (...args: unknown[]) => { const [prompt, stage] = args as [string, string]; calls.push({ operation: 'generate', prompt });
      const output = join(stage, 'image.png'); copyFileSync(sample, output); return { output }; });
    vi.spyOn(images, 'edit').mockImplementation(async (...args: unknown[]) => { const [prompt, stage, source] = args as [string, string, string]; calls.push({ operation: 'edit', prompt, source });
      expect(readFileSync(source).subarray(0, 8)).toEqual(readFileSync(sample).subarray(0, 8)); const output = join(stage, 'image.png'); copyFileSync(sample, output); return { output }; });
  }
  async function boot() {
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService); questions = app.get(load('modules/learning/whiteboard-question-worker.service').WhiteboardQuestionWorkerService);
    figures = app.get(load('modules/learning/whiteboard-question-visual-worker.service').WhiteboardQuestionVisualWorkerService);
    chat = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService); images = app.get(load('modules/ai/classroom-image.service').ClassroomImageService); providers();
  }
  async function original(actor = owner, kind: 'topic' | 'guidance' = 'topic') {
    let studentId = null;
    if (kind === 'guidance') studentId = (await call('post', '/students', { nickname: '匿名图片验证', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } }, actor)).profile.id;
    const id = 'figure-original-' + randomUUID(), at = new Date().toISOString(), value: any = { id, studentId, subject: studentId ? 'math' : null, title: '匿名单位比较', prompt: '比较单位',
      scenes: [{ id: 'intro', kind: 'concept', title: '单位', narration: '先确认相同计量单位。再核对完整条件。', body: '完整条件。', bullets: ['相同计量单位'], durationMs: 1000 }],
      fingerprint: createHash('sha256').update(id).digest('hex'), width: 1280, height: 720, durationMs: 1000, createdAt: at, updatedAt: at };
    if (kind === 'topic') Object.assign(value, { kind: 'ai-topic-whiteboard', ownerUserId: actor.user.id, sourceDraftId: 'fixture-' + id,
      origin: { draftId: null, modelId: 'deepseek-v4-flash', modelName: '合成来源', review: null, teacherReviewStatus: 'pending', formalMeasurementEligible: false } });
    else value.atomId = 'unit';
    await store.transaction(() => store.append(kind === 'topic' ? 'studioTopicWhiteboards' : 'studioWhiteboards', value));
    const path = '/learning/studio/' + (kind === 'topic' ? 'topic-whiteboards/' : 'whiteboards/') + id + '/questions', unit = whiteboardPresentation(value).units[0];
    const context = await call('get', path + '/context?fingerprint=' + value.fingerprint + '&unitId=' + encodeURIComponent(unit.id), undefined, actor);
    const turn = await call('post', path, { fingerprint: value.fingerprint, unitId: unit.id, contextVersion: context.contextVersion, message: '请比较单位和条件。', intent: 'compare',
      modelId: 'deepseek-v4-flash', requestKey: randomUUID() }, actor); await questions.runNext();
    const source = await call('get', base + '/source?' + new URLSearchParams({ boardKind: kind, boardId: id, turnId: turn.id }), undefined, actor);
    return { value, path, source, actor, turn };
  }
  async function prepare(f: Awaited<ReturnType<typeof original>>, changes: object = {}) {
    const selection = { target: f.source.target, purpose: 'comparison', requirements: '用两段匿名长度说明单位。', operation: 'generate', ...changes };
    const preflight = await call('post', base + '/preflight', selection, f.actor), command = { ...selection, preflightFingerprint: preflight.fingerprint, requestKey: randomUUID() };
    return { command, view: await call('post', base + (selection.operation === 'edit' ? '/' + (selection as any).parentVisualId + '/edit' : ''), command, f.actor) };
  }
  async function ready(f: Awaited<ReturnType<typeof original>>) { const created = await prepare(f); await figures.runNext(); return { ...created, view: await call('get', base + '/' + created.view.id, undefined, f.actor) }; }
  function adoption(f: Awaited<ReturnType<typeof original>>, view: any, version = 'original') { return { target: f.source.target, visualId: view.id, expectedTeachingVersionId: version,
    expectedVisualRevision: view.revision, originalSha256: view.originalSha256, imageSha256: view.sha256, alt: '匿名长度比较图', caption: '先统一单位', acknowledgeImageReviewed: true, requestKey: randomUUID() }; }
  async function file(path: string, actor = owner, expected = 200) {
    const response = await request(app.getHttpServer()).get('/api' + path).set('Authorization', 'Bearer ' + actor.token).buffer(true)
      .parse((res, done) => { const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks))); });
    expect(response.status).toBe(expected); return response;
  }
  beforeAll(async () => {
    if (postgres) {
      if (!process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw Error('Native question-image QA admin and binary settings required');
      const target = new URL(postgres), controller = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL);
      if (target.pathname !== '/study_agent_qa' || !['127.0.0.1', 'localhost'].includes(target.hostname) || target.hostname !== controller.hostname || target.port !== controller.port) throw Error('Expected owned loopback question-image QA cluster');
      admin = new Pool({ connectionString: controller.toString() }); expect((await admin.query('SELECT current_user AS name')).rows[0].name).toBe('study_qa_admin'); sourceLocation = await database();
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: postgres ? 'postgres' : 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false', MINIMAX_API_KEY: '', OPENAI_API_KEY: '' });
    if (sourceLocation) process.env.DATABASE_URL = sourceLocation; else delete process.env.DATABASE_URL;
    await boot(); owner = await register(); other = await register();
  });
  beforeEach(() => { calls = []; vi.restoreAllMocks(); providers(); });
  afterAll(async () => {
    vi.restoreAllMocks(); await app?.close();
    if (admin) { try { for (const name of databases) { if (!/^study_qa_question_images_[a-f0-9]{32}$/.test(name)) throw Error('Unknown question-image QA database'); await admin.query('DROP DATABASE "' + name + '"'); } } finally { await admin.end(); } }
    for (const name of envNames) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } rmSync(directory, { recursive: true, force: true });
  });

  it.each(['topic', 'guidance'] as const)('generates an actual PNG for the exact %s answer, keeps original bytes and recovers the one original request', async kind => {
    const f = await original(owner, kind), before = structuredClone(f.value), created = await prepare(f);
    expect(created.view.receipt).toMatchObject({ key: created.command.requestKey, kind: 'prepare' });
    expect((await call('post', base, created.command)).id).toBe(created.view.id); await figures.runNext();
    const view = await call('get', base + '/requests/' + created.command.requestKey); expect(view.status).toBe('ready'); expect(calls).toHaveLength(1);
    const rendered = await file(view.imageUrl), originalPng = await file(base + '/' + view.id + '/original');
    expect(rendered.headers['cache-control']).toBe('private, no-store'); expect(rendered.headers['x-image-sha256']).toBe(view.sha256);
    expect((await sharp(rendered.body).metadata()).width).toBe(1536); expect((await sharp(rendered.body).metadata()).height).toBe(1024);
    expect(createHash('sha256').update(originalPng.body).digest('hex')).toBe(view.originalSha256);
    expect(originalPng.body).toEqual(readFileSync(sample)); expect(calls[0].prompt).not.toContain(owner.user.id); expect(calls[0].prompt).not.toContain('sessionTokenHash');
    await call('get', base + '/' + view.id, undefined, other, 404); await file(view.imageUrl, other, 404);
    expect(await store.requestContext(() => store.find(kind === 'topic' ? 'studioTopicWhiteboards' : 'studioWhiteboards', { id: f.value.id }))).toEqual(before);
  });
  it('adopts an exact reviewed candidate once, retains both versions through a native restart and exports only public metadata', async () => {
    const f = await original(), first = await ready(f), command = adoption(f, first.view), before = (await call('get', f.path + '/' + f.turn.id)).reply;
    const adopted = await call('post', base + '/adopt', command); expect(adopted.board.scenes[0].figure.sha256).toBe(first.view.sha256);
    expect((await call('post', base + '/adopt', command)).versionId).toBe(adopted.versionId);
    const second = await call('post', base + '/adopt', { ...command, expectedTeachingVersionId: adopted.versionId, caption: '第二个图片版本', requestKey: randomUUID() });
    await call('post', base + '/adopt', { ...command, requestKey: randomUUID() }, owner, 409);
    vi.restoreAllMocks(); await app.close(); await boot();
    const old = await call('get', f.path + '/'+f.turn.id+'/board?teachingVersionId='+adopted.versionId), current = await call('get', f.path + '/'+f.turn.id+'/board');
    expect(old).toEqual(adopted.board); expect(current.teachingVersionId).toBe(second.versionId); expect((await file(old.scenes[0].figure.imageUrl)).headers['x-image-sha256']).toBe(first.view.sha256);
    expect((await call('get', f.path + '/' + f.turn.id)).reply).toEqual(before);
    const notes = await call('get', f.path + '/notes'); expect(notes.turns[0].teachingVersions).toHaveLength(3);
    const exported = await call('post', '/privacy/account/export', { credential: owner.credential, requestKey: randomUUID() });
    const rows = exported.accountRecords.whiteboardQuestionTurns, row = rows.find((row: any) => row.id === f.turn.id); expect(row.teachingVersions).toHaveLength(2);
    for (const field of ['authorization', 'prepared', 'figureAdoptionCommands']) expect(row).not.toHaveProperty(field);
    expect(JSON.stringify(row)).not.toContain(first.view.sha256 + '.png');
  });
  it('edits the actual authorized parent original and refuses a parent or target from another answer', async () => {
    const f = await original(), parent = await ready(f), edited = await prepare(f, { operation: 'edit', parentVisualId: parent.view.id, changes: '只修改匿名标签，保留其他关系。' });
    await figures.runNext(); expect((await call('get', base + '/' + edited.view.id)).status).toBe('ready'); expect(calls.map(row => row.operation)).toEqual(['generate', 'edit']);
    expect(createHash('sha256').update(readFileSync(calls[1].source!)).digest('hex')).toBe(parent.view.originalSha256);
    const foreign = await original(); await call('post', base + '/preflight', { ...edited.command, target: foreign.source.target, preflightFingerprint: undefined, requestKey: undefined }, owner, 409);
  });
  it('keeps failed generation and exact cancellation/retry receipts without silently creating another candidate', async () => {
    const f = await original(), created = await prepare(f); vi.spyOn(images, 'generate').mockRejectedValueOnce(Error('image_provider_failed')); await figures.runNext();
    const failed = await call('get', base + '/' + created.view.id); expect(failed.status).toBe('failed');
    const retry = { expectedRevision: failed.revision, generation: failed.task.generation, taskVersion: failed.task.version, requestKey: randomUUID() };
    const queued = await call('post', base + '/' + failed.id + '/retry', retry); expect(queued.receipt.key).toBe(retry.requestKey);
    expect((await call('get', base + '/' + failed.id + '/requests/' + retry.requestKey)).receipt.kind).toBe('retry');
    const cancel = { expectedRevision: queued.revision, generation: queued.task.generation, taskVersion: queued.task.version, requestKey: randomUUID() };
    await call('post', base + '/' + queued.id + '/cancel', cancel); expect((await call('get', base + '/' + queued.id + '/requests/' + cancel.requestKey)).receipt.kind).toBe('cancel');
    expect((await call('get', base + '/' + queued.id)).status).toBe('cancelled'); expect(await figures.runNext()).toBe(false);
  });
  it('refuses changed image bytes and keeps the original failed adoption uncommitted', async () => {
    const f = await original(), candidate = await ready(f), row = await store.requestContext(() => store.find('whiteboardQuestionVisuals', { id: candidate.view.id }));
    const imagePath = join(directory, 'whiteboard-question-visuals', row.id, row.files.image.name), bytes = readFileSync(imagePath); writeFileSync(imagePath, Buffer.from('changed bytes'));
    try { await call('post', base + '/adopt', adoption(f, candidate.view), owner, 409); expect((await call('get', f.path + '/' + f.turn.id)).teachingVersions).toBeUndefined(); }
    finally { writeFileSync(imagePath, bytes); }
  });
  it.each(['cancel', 'logout', 'original'] as const)('does not publish a late supplier PNG after %s', async change => {
    const actor = await register(), f = await original(actor), created = await prepare(f);
    let release!: () => void, enter!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { enter = resolve; });
    vi.spyOn(images, 'generate').mockImplementationOnce(async (...args: unknown[]) => { const stage = args[1] as string; enter(); await waiting; const output = join(stage, 'image.png'); copyFileSync(sample, output); return { output }; });
    const pending = figures.runNext(); await started;
    try {
      if (change === 'cancel') { const view = await call('get', base + '/' + created.view.id, undefined, actor); await call('post', base + '/' + view.id + '/cancel',
        { expectedRevision: view.revision, generation: view.task.generation, taskVersion: view.task.version, requestKey: randomUUID() }, actor); }
      else if (change === 'logout') await call('post', '/auth/logout', {}, actor);
      else await store.transaction(() => { store.find('studioTopicWhiteboards', { id: f.value.id }).scenes[0].body = '原稿条件已经变化。'; });
    } finally { release(); }
    await pending; const row = await store.requestContext(() => store.find('whiteboardQuestionVisuals', { id: created.view.id }));
    expect(row.files).toBeNull(); expect(row.status).toBe(change === 'cancel' ? 'cancelled' : 'failed');
    expect((await store.tasks.get(row.taskId)).state).toBe(change === 'cancel' ? 'cancelled' : 'failed');
    expect(await store.requestContext(() => store.find('whiteboardQuestionTurns', { id: f.turn.id }).teachingVersions)).toBeUndefined();
    expect(existsSync(join(directory, 'whiteboard-question-visuals', row.id))).toBe(false);
  });
  it.each(['logout', 'original'] as const)('rechecks %s after an asynchronous capability probe before returning private preflight content', async change => {
    const actor = await register(), f = await original(actor); let release!: () => void, enter!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { enter = resolve; });
    vi.spyOn(images, 'figureCapabilities').mockImplementationOnce(async () => { enter(); await waiting; return { available: true, editAvailable: true, modelId: 'gpt-image-2', reason: 'ready', message: 'Delayed isolated probe' }; });
    const pending = request(app.getHttpServer()).post('/api' + base + '/preflight').set('Authorization', 'Bearer ' + actor.token)
      .send({ target: f.source.target, purpose: 'concept', requirements: '匿名单位图。', operation: 'generate' }).then(response => response);
    await started;
    try {
      if (change === 'logout') await call('post', '/auth/logout', {}, actor);
      else await store.transaction(() => { store.find('studioTopicWhiteboards', { id: f.value.id }).scenes[0].body = '预检期间原稿变化。'; });
    } finally { release(); }
    const response = await pending; expect(response.status).toBe(change === 'logout' ? 401 : 409); expect(response.body.data).toBeNull();
  });
  it('cold restores actual version PNGs, then applies a newer deletion ledger without resurrecting private images or erasing another owner', async () => {
    let actor = await register(); const f = await original(actor), candidate = await ready(f), adopted = await call('post', base + '/adopt', adoption(f, candidate.view), actor);
    const survivor = await original(other), survivingImage = await ready(survivor), work = mkdtempSync(join(tmpdir(), 'study-question-figure-restore-'));
    const backup = require(join(root, 'scripts/operations/backup.cjs')), native = require(join(root, 'scripts/operations/postgres-backup.cjs')), ledger = require(join(root, 'scripts/operations/privacy-ledger.cjs'));
    const bundle = join(work, 'bundle'), first = join(work, 'first'), clean = join(work, 'clean'), ledgerPath = join(work, 'newer-ledger.json');
    try {
      vi.restoreAllMocks(); await app.close(); app = undefined;
      if (sourceLocation) await native.createPostgresBundle({ connectionString: sourceLocation, dataDir: directory, destination: bundle, pgBin: process.env.STUDY_TEST_PG_BIN });
      else await backup.createBundle({ dataDir: directory, destination: bundle });
      const verified = sourceLocation ? await native.verifyPostgresBundle({ bundle, pgBin: process.env.STUDY_TEST_PG_BIN }) : await backup.verifyBundle({ bundle });
      expect(verified.manifest.database.schemaVersions.at(-1)).toBe(24);
      expect(verified.manifest.files.some((file: any) => file.path.startsWith('data/whiteboard-question-visuals/' + candidate.view.id + '/'))).toBe(true);
      const firstLocation = await database();
      if (firstLocation) { await native.restorePostgresBundle({ bundle, connectionString: firstLocation, destination: first, pgBin: process.env.STUDY_TEST_PG_BIN }); process.env.DATABASE_URL = firstLocation; }
      else await backup.restoreBundle({ bundle, destination: first }); process.env.STUDY_DATA_DIR = first; await boot();
      await call('get', '/auth/me', undefined, actor, 401); actor = await login(actor);
      const restored = await call('get', f.path + '/' + f.turn.id + '/board?teachingVersionId=' + adopted.versionId, undefined, actor);
      expect(restored).toEqual(adopted.board); expect((await file(restored.scenes[0].figure.imageUrl, actor)).headers['x-image-sha256']).toBe(candidate.view.sha256);
      const preview = await call('get', '/privacy/account/deletion-preview', undefined, actor);
      await call('post', '/privacy/account/delete', { credential: actor.credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() }, actor);
      await figures.runNext(); await ledger.exportLedger({ dataDir: first, connectionString: firstLocation, destination: ledgerPath }); vi.restoreAllMocks(); await app.close(); app = undefined;
      const cleanLocation = await database();
      if (cleanLocation) { await native.restorePostgresBundle({ bundle, connectionString: cleanLocation, destination: clean, deletionLedger: ledgerPath, pgBin: process.env.STUDY_TEST_PG_BIN }); process.env.DATABASE_URL = cleanLocation; }
      else await backup.restoreBundle({ bundle, destination: clean, deletionLedger: ledgerPath }); process.env.STUDY_DATA_DIR = clean; await boot();
      expect(await store.requestContext(() => store.find('whiteboardQuestionTurns', { id: f.turn.id }))).toBeUndefined();
      expect(await store.requestContext(() => store.find('whiteboardQuestionVisuals', { id: candidate.view.id }))).toBeUndefined();
      expect(existsSync(join(clean, 'whiteboard-question-visuals', candidate.view.id))).toBe(false);
      const restoredOther = await login(other); expect((await file(survivingImage.view.imageUrl, restoredOther)).headers['x-image-sha256']).toBe(survivingImage.view.sha256);
    } finally {
      vi.restoreAllMocks(); await app?.close(); app = undefined; process.env.STUDY_DATA_DIR = directory;
      if (sourceLocation) process.env.DATABASE_URL = sourceLocation; else delete process.env.DATABASE_URL;
      await boot(); rmSync(work, { recursive: true, force: true });
    }
  });
  it('cancels deleted-account work and collects private PNG/prompt bytes without removing an unknown file', async () => {
    const actor = await register(), f = await original(actor), candidate = await ready(f); await call('post', base + '/adopt', adoption(f, candidate.view), actor);
    const folder = join(directory, 'whiteboard-question-visuals', candidate.view.id), unknown = join(folder, 'keep-unknown.bin'); writeFileSync(unknown, 'unknown file remains');
    const preview = await call('get', '/privacy/account/deletion-preview', undefined, actor);
    await call('post', '/privacy/account/delete', { credential: actor.credential, requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint }, actor);
    await figures.runNext(); expect(existsSync(unknown)).toBe(true);
    expect(await store.requestContext(() => store.find('whiteboardQuestionVisuals', { id: candidate.view.id }))).toBeUndefined();
    expect((await import('node:fs')).readdirSync(folder)).toEqual(['keep-unknown.bin']);
  });
});
