import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { get as httpGet } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { DomainDatabase } from '../../infrastructure/domain-database';

const configured = process.env.STUDY_TEST_PAPER_EXPORT_RENDER_POSTGRES_URL, installation = process.env.STUDY_TEST_PAPER_EXPORT_INSTALLATION, workspace = process.env.STUDY_TEST_PAPER_EXPORT_WORKSPACE;
describe.skipIf(!installation || !workspace)('actual export render supervisor, native publication and artifact HTTP on ' + (configured ? 'PostgreSQL' : 'SQLite'), () => {
  if (!installation || !workspace) { it.skip('requires explicit actual tools and a new short generated workspace', () => {}); return; }
  const candidate = resolve(process.cwd(), '../..'), root = resolve(process.env.STUDY_TEST_PAPER_EXPORT_PROJECT_ROOT ?? candidate), directory = resolve(workspace);
  if (!directory.startsWith(resolve(root, 'data/qa') + sep) || existsSync(directory)) throw Error('New generated short QA render workspace required');
  mkdirSync(directory); const data = directory;
  const assets = require(join(candidate, 'scripts/qa/paper-practice-fixture.cjs')).preparePaperPracticeAssets(directory, root);
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_ASSET_ROOT', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL', 'STUDY_PAPER_EXPORT_INSTALLATION'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]])), sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex'), key = () => randomUUID();
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, worker: any, runtime: any, administrator: any, index = 0;
  const records: Array<{ scenario: string; files: unknown[] }> = [];
  async function api(actor: any, method: 'get' | 'post', path: string, input?: unknown, expected = method === 'post' ? 201 : 200) {
    let call = request(app.getHttpServer())[method]('/api' + path); if (actor) call = call.set('Authorization', 'Bearer ' + actor.token); if (input !== undefined) call = call.send(input as object);
    const response = await call; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
  }
  const register = () => api(null, 'post', '/auth/register', { principal: 'render-source-' + key(), credential: 'synthetic-render-account-only' });
  const publication = (paperId: string, status = 'published') => api(administrator, 'post', '/library/papers/' + paperId + '/publication', { status,
    licenseEvidence: '仅工程合成的实际渲染原题和媒体', contentReviewed: true, mediaReviewed: true, reason: '实际任务生成与下载授权测试' });
  async function prepare(actor: any, scope: any = { kind: 'private_preparation', studentId: null }, books = ['practice', 'answers'], formats = ['pdf', 'docx']) {
    const paperId = 'qa:paper:' + index++ + ':complete'; await publication(paperId); const metadata = await api(actor, 'get', '/library/papers/' + paperId + '/metadata');
    const list = await api(actor, 'post', '/library/selection-commands', { kind: 'create', requestKey: key(), scope, title: '实际任务与原题', items: metadata.positions });
    const input = { kind: 'create', requestKey: key(), listId: list.listId, listRevision: list.revision, listFingerprint: list.fingerprint, title: '真实渲染与准确来源', layout: { answerLines: 2, breakBetweenQuestions: false }, books, formats };
    return { paperId, input, result: await api(actor, 'post', '/library/export-commands', input) };
  }
  const view = (actor: any, f: any) => api(actor, 'get', '/library/exports/' + f.result.exportId);
  const download = async (actor: any, path: string, expected = 200, range?: string) => {
    let call = request(app.getHttpServer()).get(path).set('Authorization', 'Bearer ' + actor.token); if (range) call = call.set('Range', range);
    call = call.buffer(true).parse((response: any, done: any) => { const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.on('end', () => done(null, Buffer.concat(chunks))); });
    const response = await call; expect(response.status).toBe(expected); return response;
  };
  async function cold() { const db = new DomainDatabase(configured ?? join(data, 'study-agent.sqlite3')); await db.open(); try { return await db.read(); } finally { await db.close(); } }
  async function until(fn: () => boolean | Promise<boolean>, timeout = 25000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw Error('Actual render checkpoint not observed'); }
  beforeAll(async () => {
    if (configured) { const url = new URL(configured); if (url.hostname !== '127.0.0.1' || url.port !== '15447' || url.pathname !== '/study_paper_export_render') throw Error('Owned generated render PostgreSQL scope required'); }
    const archive = new DatabaseSync(join(assets, 'shijuanbao/archive.sqlite3')), catalog = new DatabaseSync(join(assets, 'catalog.sqlite3'));
    try { for (const row of archive.prepare('SELECT key,detail FROM papers').all() as Array<{ key: string; detail: string }>) {
      const original = JSON.parse(row.detail); if (!original.questions.length) continue;
      original.questions[0].title = '<p>ORIGINALONE：计算<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>与<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>的和，并说明理由。</p>';
      original.questions[0].answer = '<p>REFERENCEONE：和是1。</p>'; original.questions[0].details = '<p>两个二分之一组成一个整体。</p>';
      original.questions[1].title = '<p>ORIGINALTWO：观察分组并说明你的想法。</p><img src="https://synthetic.example/browser-figure.png" alt="合成分组图">';
      original.questions[1].answer = '<p>REFERENCETWO：图中共有五个圆。</p>'; original.questions[1].details = '<p>左边三个与右边两个合在一起。</p>';
      const text = JSON.stringify(original); archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(text, row.key); catalog.prepare('UPDATE papers SET detail_sha256=? WHERE id=?').run(sha(text), row.key);
    } } finally { archive.close(); catalog.close(); }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: configured ? 'postgres' : 'sqlite', STUDY_DATA_DIR: data, STUDY_ASSET_ROOT: assets,
      STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_PAPER_EXPORT_INSTALLATION: installation! });
    if (configured) process.env.DATABASE_URL = configured; else delete process.env.DATABASE_URL;
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    worker = app.get(load('modules/library/paper-export-render-worker.service').PaperExportRenderWorkerService); runtime = app.get(load('modules/library/paper-export-runtime.service').PaperExportRuntimeService);
    administrator = await register(); await store.transaction(() => { store.find('users', { id: administrator.user.id }).role = 'admin'; });
  }, 30000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    writeFileSync(join(directory, 'actual-render-files.json'), JSON.stringify({ records, generatedOnly: true, physicalPrinterOrTeacherEvidence: false }, null, 2));
    await app?.close(); for (const name of names) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name];
  });
  it('executes all four real book/format slots through the actual supervisor, publishes native files and downloads their exact bytes', async () => {
    const actor = await register(), f = await prepare(actor);
    const early = (await view(actor, f)).slots[0]; await download(actor, '/api/library/exports/' + f.result.exportId + '/files/' + early.book + '/' + early.format, 409);
    for (let index = 0; index < 4; index++) expect(await worker.runNext()).toBe(true);
    const current = await view(actor, f), saved = (await cold()).state; expect(current.slots.map((slot: any) => slot.state)).toEqual(['succeeded', 'succeeded', 'succeeded', 'succeeded']);
    const files = [];
    for (const slot of current.slots) {
      const response = await download(actor, slot.downloadUrl); expect(response.body).toBeInstanceOf(Buffer); expect(sha(response.body)).toBe(slot.publication.sha256); expect(response.body.length).toBe(slot.publication.bytes);
      expect(response.headers['cache-control']).toContain('no-store'); expect(response.body.subarray(0, 2).toString()).toBe(slot.format === 'pdf' ? '%P' : 'PK');
      const partial = await download(actor, slot.downloadUrl, 206, 'bytes=0-7'); expect(partial.body).toEqual(response.body.subarray(0, 8));
      await download(actor, slot.downloadUrl, 416, 'bytes=999999999-');
      const file = saved.paperExportFiles!.find((row: any) => row.id === (saved.paperExports!.find((row: any) => row.id === f.result.exportId) as any).slots.find((item: any) => item.taskId === slot.taskId).published.fileId) as any;
      const supervisor = JSON.parse(readFileSync(join(data, file.workspace, 'supervisor-' + slot.book + '-process.json'), 'utf8')); expect(supervisor.tree.after.activeProcesses).toBe(0); expect(supervisor.tree.assignedBeforeResume).toBe(true);
      await until(async () => (await load('infrastructure/studio-file-coordination').inspectStudioFileLeases(data, 'paper-export', file.workspace.split('/')[1])).length === 0);
      files.push({ book: slot.book, format: slot.format, path: join(file.workspace, 'artifacts-' + slot.book, slot.book + '.' + slot.format), publication: slot.publication, sourceMap: (saved.paperExports!.find((row: any) => row.id === f.result.exportId) as any).slots.find((item: any) => item.taskId === slot.taskId).published.sourceMap });
    }
    records.push({ scenario: 'actual-four-slots', files });
  }, 240000);
  it('keeps other accounts out and rechecks publication withdrawal after hashing the actual artifact, closing its handle', async () => {
    const actor = await register(), other = await register(), f = await prepare(actor, undefined, ['practice'], ['pdf']); expect(await worker.runNext()).toBe(true);
    const url = (await view(actor, f)).slots[0].downloadUrl; await download(other, url, 404);
    const media = load('modules/library/verified-library-media'), original = media.openVerifiedLibraryMedia; let handle: any;
    vi.spyOn(media, 'openVerifiedLibraryMedia').mockImplementation(async (...args: any[]) => {
      const file = await original(...args); if (args[0].path.includes('paper-exports')) { handle = file.handle; await publication(f.paperId, 'withdrawn'); } return file;
    });
    await download(actor, url, 403); expect(handle).toBeTruthy(); await expect(handle.stat()).rejects.toThrow();
  }, 60000);
  it('cancels an actually running Office job and never publishes the late file', async () => {
    const actor = await register(), f = await prepare(actor, undefined, ['practice'], ['pdf']), running = worker.runNext();
    let file: any, started: any, pythonPid: number | undefined;
    await until(async () => { file = await store.requestContext(() => store.select('paperExportFiles', { exportId: f.result.exportId })[0]); if (!file) return false;
      const name = join(data, file.workspace, 'artifacts-practice/o-started.json'); if (!existsSync(name)) return false; started = JSON.parse(readFileSync(name, 'utf8'));
      const leases = await load('infrastructure/studio-file-coordination').inspectStudioFileLeases(data, 'paper-export', file.workspace.split('/')[1]);
      pythonPid = leases.find((lease: any) => lease.status === 'active' && lease.pid !== process.pid)?.pid;
      try { process.kill(started.rootPid, 0); return pythonPid !== undefined; } catch { return false; }
    });
    const task = await store.tasks.get(f.result.slots[0].taskId); await api(actor, 'post', '/library/export-commands', { kind: 'cancel', requestKey: key(), exportId: f.result.exportId,
      book: 'practice', format: 'pdf', expectedTaskVersion: task.version, expectedGeneration: task.generation });
    expect(await running).toBe(true); expect((await view(actor, f)).slots[0].state).toBe('cancelled'); expect((await view(actor, f)).slots[0].publication).toBeNull();
    expect(() => process.kill(started.rootPid, 0)).toThrow();
    const supervisor = JSON.parse(readFileSync(join(data, file.workspace, 'supervisor-practice-process.json'), 'utf8')); expect(supervisor.tree.after.activeProcesses).toBe(0); expect(supervisor.pid).toBe(pythonPid);
    await until(async () => (await load('infrastructure/studio-file-coordination').inspectStudioFileLeases(data, 'paper-export', file.workspace.split('/')[1])).length === 0);
    records.push({ scenario: 'cancelled-python-owner', files: [{ supervisorPid: pythonPid, tree: supervisor.tree, leasesReleased: true }] });
    const saved = (await cold()).state.paperExportFiles!.find((row: any) => row.id === file.id) as any; expect(saved.state).toBe('collecting'); expect(saved.cleanupTaskId).toBeTruthy();
  }, 60000);
  it('refuses a real same-size source image corruption after queueing and retains a native cleanup task for the reserved workspace', async () => {
    const actor = await register(), f = await prepare(actor, undefined, ['practice'], ['pdf']), name = join(assets, 'shijuanbao/media/figure.png'), bytes = readFileSync(name), broken = Buffer.from(bytes); broken[broken.length - 1] ^= 1;
    try { writeFileSync(name, broken); expect(await worker.runNext()).toBe(true); } finally { writeFileSync(name, bytes); }
    const current = await view(actor, f); expect(current.slots[0].state).toBe('failed'); expect(current.slots[0].publication).toBeNull();
    const file = (await cold()).state.paperExportFiles!.find((row: any) => row.exportId === f.result.exportId) as any; expect(file.state).toBe('collecting'); expect((await store.tasks.get(file.cleanupTaskId)).state).toBe('queued');
  });
  it('renders an actual learner answer book and rejects guardian revocation after the download hash without changing original exposure', async () => {
    const parent = await register(), child = (await api(parent, 'post', '/students', { nickname: '匿名生成工程档案', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'synthetic', chinese: '', english: '' } })).profile;
    await api(parent, 'post', '/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: key(), reason: '实际本人导出文件的隔离工程验证。' });
    const code = await api(parent, 'post', '/students/' + child.id + '/learning-access/codes', { expectedVersion: 1, requestKey: key() }), actor = await api(null, 'post', '/auth/learning-code', { code: code.code });
    const f = await prepare(actor, { kind: 'student_self', studentId: child.id }, ['answers'], ['pdf']); expect(await worker.runNext()).toBe(true);
    const slot = (await view(actor, f)).slots[0]; const response = await download(actor, slot.downloadUrl); expect(sha(response.body)).toBe(slot.publication.sha256);
    const exposures = (await cold()).state.paperSourceExposures!.filter((row: any) => row.actorId === actor.user.id);
    expect(exposures.filter((row: any) => row.input.kind === 'export')).toHaveLength(1);
    const media = load('modules/library/verified-library-media'), original = media.openVerifiedLibraryMedia; let handle: any;
    vi.spyOn(media, 'openVerifiedLibraryMedia').mockImplementation(async (...args: any[]) => {
      const file = await original(...args); if (args[0].path.includes('paper-exports')) { handle = file.handle;
        await api(parent, 'post', '/students/' + child.id + '/learning-access', { enabled: false, expectedVersion: 1, requestKey: key(), reason: '实际产物完整校验后撤回原监护学习资格。' }); }
      return file;
    });
    await download(actor, slot.downloadUrl, 403); await expect(handle.stat()).rejects.toThrow();
    expect((await cold()).state.paperSourceExposures!.filter((row: any) => row.actorId === actor.user.id)).toEqual(exposures);
  }, 60000);
  it('holds a real paused HTTP download lease across author deletion, then collects the exact workspace after the full bytes finish', async () => {
    const actor = await register(), f = await prepare(actor, undefined, ['practice'], ['docx']); expect(await worker.runNext()).toBe(true);
    const slot = (await view(actor, f)).slots[0], file = await store.requestContext(() => {
      const record = store.find('paperExports', { id: f.result.exportId }); return structuredClone(store.find('paperExportFiles', { id: record.slots[0].published.fileId }));
    });
    const root = join(data, file.workspace), artifact = join(root, 'artifacts-practice/practice.docx'), before = sha(readFileSync(artifact));
    expect(slot.publication.bytes).toBeGreaterThan(8 * 1024 * 1024);
    await app.listen(0, '127.0.0.1'); const port = app.getHttpServer().address().port;
    const response = await new Promise<import('node:http').IncomingMessage>((yes, no) => {
      const call = httpGet({ hostname: '127.0.0.1', port, path: slot.downloadUrl, headers: { Authorization: 'Bearer ' + actor.token } }, res => { res.pause(); yes(res); }); call.once('error', no);
    });
    const gc = app.get(load('modules/library/paper-export-cleanup-worker.service').PaperExportCleanupWorkerService); gc.collectionDelayMs = 1;
    const coordination = load('infrastructure/studio-file-coordination'), key = file.workspace.split('/')[1];
    try {
      expect(response.statusCode).toBe(200);
      await until(async () => (await coordination.inspectStudioFileLeases(data, 'paper-export', key)).some((lease: any) => lease.status === 'active'));
      const preview = await api(actor, 'get', '/privacy/account/deletion-preview');
      const receipt = await api(actor, 'post', '/privacy/account/delete', { credential: 'synthetic-render-account-only', requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint });
      let waiting: any;
      await until(async () => { await gc.runNext(false); const current = await store.requestContext(() => structuredClone(store.find('paperExportFiles', { id: file.id }))); waiting = await store.tasks.get(current.cleanupTaskId); return waiting?.state === 'retry_wait'; });
      expect(waiting).toMatchObject({ attempts: 0, errorCode: 'paper_export_collection_writer_or_reader_active' }); expect(sha(readFileSync(artifact))).toBe(before);
      const bytes = await new Promise<Buffer>((yes, no) => { const chunks: Buffer[] = []; response.on('data', chunk => chunks.push(Buffer.from(chunk))); response.once('error', no); response.once('end', () => yes(Buffer.concat(chunks))); response.resume(); });
      expect(bytes.length).toBe(slot.publication.bytes); expect(sha(bytes)).toBe(before);
      await until(async () => (await coordination.inspectStudioFileLeases(data, 'paper-export', key)).length === 0);
      await until(async () => { await gc.runNext(false); return await store.requestContext(() => store.find('paperExportFiles', { id: file.id }).state === 'deleted'); });
      expect(existsSync(root)).toBe(false); const state = (await cold()).state; expect(state.paperExportFiles!.find((row: any) => row.id === file.id)).toMatchObject({ state: 'deleted', deletionReceiptId: receipt.id });
      records.push({ scenario: 'paused-http-download-and-actual-collection', files: [{ fileId: file.id, bytes: bytes.length, sha256: before, waitingReason: waiting.errorCode, nativeState: 'deleted' }] });
    } finally { response.destroy(); }
  }, 90000);
});
