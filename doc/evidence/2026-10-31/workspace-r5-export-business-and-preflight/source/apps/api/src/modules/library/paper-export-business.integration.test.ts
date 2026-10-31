import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import request from 'supertest';
import { DomainDatabase } from '../../infrastructure/domain-database';

const configured = process.env.STUDY_TEST_PAPER_EXPORT_BUSINESS_POSTGRES_URL;
const installation = process.env.STUDY_TEST_PAPER_EXPORT_INSTALLATION;
describe.skipIf(!installation)('actual complete paper export business and memory preflight on ' + (configured ? 'PostgreSQL' : 'SQLite'), () => {
  const repo = resolve(process.cwd(), '../..'), qa = join(repo, 'data/qa'); mkdirSync(qa, { recursive: true });
  const directory = mkdtempSync(join(qa, 'paper-export-business-')), data = join(directory, 'source');
  const assets = require(join(repo, 'scripts/qa/paper-practice-fixture.cjs')).preparePaperPracticeAssets(directory, repo);
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_ASSET_ROOT', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL', 'STUDY_PAPER_EXPORT_INSTALLATION'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const key = () => randomUUID(), sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex'), credential = 'synthetic-export-business-only';
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, administrator: any, runtime: any, index = 0;
  async function api(actor: any, method: 'get' | 'post', path: string, body?: unknown, status = method === 'post' ? 201 : 200) {
    let call = request(app.getHttpServer())[method]('/api' + path); if (actor) call = call.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) call = call.send(body as object); const response = await call;
    expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  const register = () => api(null, 'post', '/auth/register', { principal: 'export-business-' + key(), credential });
  async function boot() { app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService); runtime = app.get(load('modules/library/paper-export-runtime.service').PaperExportRuntimeService); }
  async function publication(paperId: string, status = 'published') { return api(administrator, 'post', '/library/papers/' + paperId + '/publication', { status, licenseEvidence: '仅隔离工程合成的原题与真实媒体', contentReviewed: true, mediaReviewed: true, reason: '实际导出业务当前发布状态验证' }); }
  async function selected(actor: any, scope: any = { kind: 'private_preparation', studentId: null }, variant?: number, two = true) {
    const paperId = 'qa:paper:' + (variant ?? index++) + ':complete'; await publication(paperId);
    const metadata = await api(actor, 'get', '/library/papers/' + paperId + '/metadata');
    const input = { kind: 'create', requestKey: key(), scope, title: '  保留空白的完整题单标题  ', items: two ? metadata.positions : metadata.positions.slice(0, 1) };
    return { input, metadata, saved: await api(actor, 'post', '/library/selection-commands', input) };
  }
  const create = (selection: any, books = ['practice', 'answers'], formats = ['pdf', 'docx']) => ({ kind: 'create', requestKey: key(), listId: selection.saved.listId, listRevision: selection.saved.revision,
    listFingerprint: selection.saved.fingerprint, title: '  完整导出标题  ', layout: { answerLines: 3, breakBetweenQuestions: false }, books, formats });
  const command = (actor: any, input: any, status = 201) => api(actor, 'post', '/library/export-commands', input, status);
  async function learner() {
    const parent = await register(), child = (await api(parent, 'post', '/students', { nickname: '匿名导出工程档案', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'synthetic', chinese: '', english: '' } })).profile;
    await api(parent, 'post', '/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: key(), reason: '仅用于隔离本人导出的当前权限验证。' });
    const code = await api(parent, 'post', '/students/' + child.id + '/learning-access/codes', { expectedVersion: 1, requestKey: key() });
    return { parent, child, actor: await api(null, 'post', '/auth/learning-code', { code: code.code }), scope: { kind: 'student_self', studentId: child.id } };
  }
  async function cold() { const db = new DomainDatabase(configured ?? join(data, 'study-agent.sqlite3')); await db.open(); try { return await db.read(); } finally { await db.close(); } }
  const projection = (state: any) => Object.fromEntries(['paperExports', 'paperExportCommands', 'paperExportFiles', 'paperSourceExposures'].map(name => [name, state[name] ?? []]));
  beforeAll(async () => {
    if (configured) { const url = new URL(configured); if (url.hostname !== '127.0.0.1' || url.port !== '15446' || url.pathname !== '/study_paper_export_business') throw Error('Owned export business PostgreSQL fixture required'); }
    mkdirSync(data, { recursive: true });
    const image = readFileSync(join(assets, 'shijuanbao/media/figure.png')), jpeg = await sharp(image).jpeg().toBuffer(); writeFileSync(join(assets, 'shijuanbao/media/reference.jpg'), jpeg);
    const archive = new DatabaseSync(join(assets, 'shijuanbao/archive.sqlite3')), catalog = new DatabaseSync(join(assets, 'catalog.sqlite3')), manifest = new DatabaseSync(join(assets, 'manifest.sqlite3'));
    try {
      manifest.prepare('INSERT INTO files VALUES(?,?,?,?)').run('shijuanbao/media/reference.jpg', jpeg.length, sha(jpeg), 'verified');
      archive.prepare('INSERT INTO media_jobs VALUES(?,?,?,?)').run('https://synthetic.example/reference.jpg', 'media/reference.jpg', sha(jpeg), 'done');
      for (const row of archive.prepare('SELECT key,detail FROM papers').all() as Array<{ key: string; detail: string }>) {
        const original = JSON.parse(row.detail); if (!original.questions.length) continue;
        original.questions[0].title = '<p>合成原题：<math><mrow><mn>3</mn><mo>+</mo><mn>2</mn><mo>=</mo><mo>?</mo></mrow></math></p>';
        original.questions[1].title = '<p>观察原图，说明你的想法。</p><img src="https://synthetic.example/browser-figure.png" alt="合成原图">';
        if (row.key.includes(':30:')) original.questions[0].answer = '<video>原参考不支持的完整内容</video>';
        if (row.key.includes(':31:')) original.questions[0].answer = '<img src="https://synthetic.example/reference.jpg" alt="当前原生版本不支持的参考图">';
        if (row.key.includes(':32:')) original.questions[0].title = '<script>不可静默删除的原正文</script><p>保留全文</p>';
        const text = JSON.stringify(original); archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(text, row.key); catalog.prepare('UPDATE papers SET detail_sha256=? WHERE id=?').run(sha(text), row.key);
      }
    } finally { archive.close(); catalog.close(); manifest.close(); }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: configured ? 'postgres' : 'sqlite', STUDY_DATA_DIR: data, STUDY_ASSET_ROOT: assets,
      STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false' });
    // This explicit installation is a generated QA tool, never a formal .env.
    process.env.STUDY_PAPER_EXPORT_INSTALLATION = installation!;
    if (configured) process.env.DATABASE_URL = configured; else delete process.env.DATABASE_URL;
    await boot(); administrator = await register(); await store.transaction(() => { store.find('users', { id: administrator.user.id }).role = 'admin'; });
  }, 30000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await app?.close(); for (const name of names) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; });

  it('runs the real two-book parser without changing native data, tasks, source facts or workspace files', async () => {
    const actor = await register(), input = create(await selected(actor)), before = await cold(), entries = readdirSync(data).sort(), summary = await store.tasks.summary();
    const report = await api(actor, 'post', '/library/export-preflight', input);
    expect(report.books.practice).toMatchObject({ available: true, reason: null, items: 2, media: 1 }); expect(report.books.answers.available).toBe(true);
    expect(report.documentSha256).toBe(report.inputSha256); const after = await cold();
    expect(after.revision).toBe(before.revision); expect(projection(after.state)).toEqual(projection(before.state)); expect(await store.tasks.summary()).toEqual(summary); expect(readdirSync(data).sort()).toEqual(entries);
  });
  it('freezes all original inputs and four actual queue slots in one native transaction; directory hides private runtime details', async () => {
    const actor = await register(), selection = await selected(actor), input = create(selection), result = await command(actor, input);
    const saved = (await cold()).state, record = saved.paperExports!.find((row: any) => row.id === result.exportId) as any;
    expect(record.intent.document.items.map((item: any) => item.source.sourceQuestionId)).toEqual(['paper:one', 'paper:two']);
    expect(record.intent.document.title).toBe(input.title); expect(record.intent.document.items[0].reference.answerHtml).toContain('合成原参考');
    expect(record.intent.media).toHaveLength(1); expect(result.slots).toHaveLength(4);
    for (const slot of result.slots) expect(await store.tasks.get(slot.taskId)).toMatchObject({ state: 'queued', generation: 1, ownerUserId: actor.user.id });
    const view = await api(actor, 'get', '/library/exports/' + result.exportId);
    expect(view.slots).toHaveLength(4); expect(JSON.stringify(view)).not.toMatch(/leaseToken|workspace|guardianId|sourceUrl|合成原参考|promptHtml|authorization|python/);
    expect((saved.paperSourceExposures ?? []).filter((row: any) => row.actorId === actor.user.id)).toEqual([]);
  });
  it('keeps original request receipts and old list revision after clear, and refuses changed full input with the same key', async () => {
    const actor = await register(), selection = await selected(actor), input = create(selection, ['practice'], ['pdf']), result = await command(actor, input);
    await api(actor, 'post', '/library/selection-commands', { kind: 'revise', requestKey: key(), listId: selection.saved.listId, expectedRevision: selection.saved.revision, expectedFingerprint: selection.saved.fingerprint, title: '后来明确清空', items: [] });
    expect(await command(actor, input)).toEqual(result); await command(actor, { ...input, title: '另一份完整命令' }, 409);
    const original = await api(actor, 'get', '/library/export-commands/' + input.requestKey); expect(original.input).toEqual(input); expect(original.result).toEqual(result); expect(original.current.listRevision).toBe(1);
    expect((await api(actor, 'get', '/library/selection-lists/' + selection.saved.listId)).revision).toBe(2);
  });
  it('never accepts another author list/export/original result, client-authored body or a stale source fingerprint', async () => {
    const actor = await register(), other = await register(), input = create(await selected(actor)), result = await command(actor, input);
    await command(other, { ...input, requestKey: key() }, 404); await api(other, 'get', '/library/exports/' + result.exportId, undefined, 404);
    expect(await api(other, 'get', '/library/export-commands/' + input.requestKey)).toBeNull();
    await command(actor, { ...input, requestKey: key(), document: { prompt: 'untrusted' } }, 400); await command(actor, { ...input, requestKey: key(), listFingerprint: 'f'.repeat(64) }, 409);
  });
  it.each([30, 31])('checks only the requested book without deleting unsupported original reference markup/media: %s', async variant => {
    const actor = await register(), input = create(await selected(actor, undefined, variant)), before = projection((await cold()).state), report = await api(actor, 'post', '/library/export-preflight', input);
    expect(report.books.practice.available).toBe(true); expect(report.books.answers.available).toBe(false); await command(actor, input, 409);
    expect(projection((await cold()).state)).toEqual(before);
    const result = await command(actor, { ...input, books: ['practice'] }), row = (await cold()).state.paperExports!.find((row: any) => row.id === result.exportId) as any;
    expect(row.intent.document.items[0].reference.answerHtml).toContain(variant === 30 ? '<video>' : 'https://synthetic.example/reference.jpg');
  });
  it('does not silently remove unsupported question markup and still permits an independently valid answer book', async () => {
    const actor = await register(), input = create(await selected(actor, undefined, 32)), report = await api(actor, 'post', '/library/export-preflight', input);
    expect(report.books.practice.available).toBe(false); expect(report.books.answers.available).toBe(true); await command(actor, input, 409);
    const result = await command(actor, { ...input, books: ['answers'] }), row = (await cold()).state.paperExports!.find((row: any) => row.id === result.exportId) as any;
    expect(row.intent.document.items[0].promptHtml).toContain('<script>不可静默删除');
  });
  it('records exact learner export exposure only on create and never treats a parent picker as learner work', async () => {
    const f = await learner(), selection = await selected(f.actor, f.scope), input = create(selection, ['answers'], ['docx']);
    const before = (await cold()).state.paperSourceExposures!.filter((row: any) => row.actorId === f.actor.user.id);
    await api(f.actor, 'post', '/library/export-preflight', input); expect((await cold()).state.paperSourceExposures!.filter((row: any) => row.actorId === f.actor.user.id)).toEqual(before);
    const result = await command(f.actor, input); expect(await command(f.actor, input)).toEqual(result);
    const exposures = (await cold()).state.paperSourceExposures!.filter((row: any) => row.actorId === f.actor.user.id && row.input.kind === 'export') as any[];
    expect(exposures).toHaveLength(1); expect(exposures[0]).toMatchObject({ studentId: f.child.id, input: { answers: true, positions: [{ position: 1, sourceQuestionId: 'paper:one' }, { position: 2, sourceQuestionId: 'paper:two' }] } });
    await command(f.parent, { ...input, requestKey: key() }, 404);
  });
  it('recovers exact originals and permits cancellation during diagnosis while blocking new preflight/create/retry', async () => {
    const f = await learner(), input = create(await selected(f.actor, f.scope), ['practice'], ['pdf']), result = await command(f.actor, input);
    await store.transaction(() => store.append('diagnosticSessions', { id: 'export-diagnostic-' + key(), studentId: f.child.id, status: 'in_progress', startedAt: new Date().toISOString() }));
    expect(await command(f.actor, input)).toEqual(result); await api(f.actor, 'post', '/library/export-preflight', input, 409); await command(f.actor, { ...input, requestKey: key() }, 409);
    const slot = (await api(f.actor, 'get', '/library/exports/' + result.exportId)).slots[0];
    const cancel = { kind: 'cancel', requestKey: key(), exportId: result.exportId, book: slot.book, format: slot.format, expectedTaskVersion: slot.version, expectedGeneration: slot.generation };
    await command(f.actor, cancel); const task = await store.tasks.get(slot.taskId); expect(task.state).toBe('cancelled');
    await command(f.actor, { ...cancel, kind: 'retry', requestKey: key(), expectedTaskVersion: task.version }, 409);
  });
  it('binds real cancel/retry to original slot version/generation and preserves immutable intent and old receipts', async () => {
    const actor = await register(), input = create(await selected(actor), ['practice'], ['pdf']), result = await command(actor, input), slot = (await api(actor, 'get', '/library/exports/' + result.exportId)).slots[0];
    const cancel = { kind: 'cancel', requestKey: key(), exportId: result.exportId, book: slot.book, format: slot.format, expectedTaskVersion: slot.version, expectedGeneration: slot.generation };
    const cancelled = await command(actor, cancel), task = await store.tasks.get(slot.taskId), before = (await cold()).state.paperExports!.find((row: any) => row.id === result.exportId);
    await command(actor, { ...cancel, requestKey: key() }, 409);
    const retry = { ...cancel, kind: 'retry', requestKey: key(), expectedTaskVersion: task.version }, retried = await command(actor, retry);
    expect(retried.generation).toBe(2); expect(await store.tasks.get(slot.taskId)).toMatchObject({ state: 'queued', generation: 2 });
    expect((await cold()).state.paperExports!.find((row: any) => row.id === result.exportId)).toEqual(before);
    expect((await api(actor, 'get', '/library/export-commands/' + cancel.requestKey)).result).toEqual(cancelled); expect(await command(actor, retry)).toEqual(retried);
  });
  it('keeps exactly one real concurrent cancellation and rolls back the losing complete command', async () => {
    const actor = await register(), result = await command(actor, create(await selected(actor), ['practice'], ['pdf'])), slot = (await api(actor, 'get', '/library/exports/' + result.exportId)).slots[0];
    const inputs = [key(), key()].map(requestKey => ({ kind: 'cancel', requestKey, exportId: result.exportId, book: slot.book, format: slot.format, expectedTaskVersion: slot.version, expectedGeneration: slot.generation }));
    const responses = await Promise.all(inputs.map(input => request(app.getHttpServer()).post('/api/library/export-commands').set('Authorization', 'Bearer ' + actor.token).send(input)));
    expect(responses.map(row => row.status).sort()).toEqual([201, 409]); const loser = inputs[responses.findIndex(row => row.status === 409)];
    expect(await api(actor, 'get', '/library/export-commands/' + loser.requestKey)).toBeNull();
  });
  it('rechecks actual publication withdrawal after real Python preflight and never writes the rejected create', async () => {
    const actor = await register(), selection = await selected(actor), input = create(selection), original = runtime.preflight.bind(runtime), before = projection((await cold()).state);
    vi.spyOn(runtime, 'preflight').mockImplementationOnce(async (...args: unknown[]) => { const report = await original(...args); await publication(selection.metadata.paperId, 'withdrawn'); return report; });
    await command(actor, input, 403); expect(projection((await cold()).state)).toEqual(before); expect(await api(actor, 'get', '/library/export-commands/' + input.requestKey)).toBeNull();
  });
  it('rechecks actual guardian access revocation after real preflight without creating export facts', async () => {
    const f = await learner(), input = create(await selected(f.actor, f.scope)), original = runtime.preflight.bind(runtime), before = projection((await cold()).state);
    vi.spyOn(runtime, 'preflight').mockImplementationOnce(async (...args: unknown[]) => { const report = await original(...args);
      await api(f.parent, 'post', '/students/' + f.child.id + '/learning-access', { enabled: false, expectedVersion: 1, requestKey: key(), reason: '实际完整预检后撤回原监护学习权限。' }); return report; });
    await command(f.actor, input, 403); expect(projection((await cold()).state)).toEqual(before);
  });
  it('retains original receipts and actual native queues after a cold application reopen', async () => {
    const actor = await register(), input = create(await selected(actor), ['practice'], ['docx']), result = await command(actor, input), before = projection((await cold()).state);
    await app.close(); await boot(); expect(projection((await cold()).state)).toEqual(before);
    expect((await api(actor, 'get', '/library/export-commands/' + input.requestKey)).result).toEqual(result);
    expect(await store.tasks.get(result.slots[0].taskId)).toMatchObject({ state: 'queued', generation: 1 });
  });
  it('returns a bounded unavailable-tool response without writing a command, source exposure or task', async () => {
    const actor = await register(), input = create(await selected(actor)), before = projection((await cold()).state), summary = await store.tasks.summary();
    const installation = process.env.STUDY_PAPER_EXPORT_INSTALLATION; delete process.env.STUDY_PAPER_EXPORT_INSTALLATION;
    try { await api(actor, 'post', '/library/export-preflight', input, 503); await command(actor, input, 503); }
    finally { process.env.STUDY_PAPER_EXPORT_INSTALLATION = installation; }
    expect(projection((await cold()).state)).toEqual(before); expect(await store.tasks.summary()).toEqual(summary);
    expect(await api(actor, 'get', '/library/export-commands/' + input.requestKey)).toBeNull();
  });
});
