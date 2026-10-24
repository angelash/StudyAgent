import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as files, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, unlinkSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { Pool } from 'pg';

describe('legacy material file integrity, source versions and actual recovery', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-material-integrity-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'STUDY_PDF_STRUCTURE_MODEL', 'XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]])), credential = 'Integrity-fixture-only-20261024', ids: string[] = [], databases: string[] = [];
  let app: any, store: any, worker: any, parent: any, other: any, pdf: Buffer, png: Buffer, pg: Pool | undefined, sourceUrl: string | undefined, restoredUrl: string | undefined;
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'), base = '/learning/source-courses/materials/';
  const data = () => process.env.STUDY_DATA_DIR!;
  async function boot() { const { AppModule } = require('../../../dist/apps/api/src/app.module.js'); app = await NestFactory.create(AppModule, { logger: false }); require('../../../dist/apps/api/src/common/http-body.js').configureJsonBody(app); app.setGlobalPrefix('api'); await app.init(); store = app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService); worker = app.get(require('../../../dist/apps/api/src/modules/processing/processing-worker.service.js').ProcessingWorkerService); }
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = parent, status = method === 'post' ? 201 : 200) { let query = request(app.getHttpServer())[method]('/api' + path); if (actor) query = query.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined) query = query.send(body as object); return (await query.expect(status)).body.data; }
  async function seed(extra: Record<string, unknown> = {}) {
    const bytes = Buffer.concat([pdf, Buffer.from('\n% isolated case ' + randomUUID())]), sha = digest(bytes), id = 'studio_material_' + randomUUID(), now = new Date().toISOString();
    const row = { id, ownerUserId: parent.user.id, studentId: null, subject: null, kind: 'pdf', filename: 'anonymous.pdf', title: 'Anonymous legacy pages', sha256: sha, byteSize: bytes.length, pageCount: 3, pages: [1, 2, 3].map(page => ({ page, text: 'Preserve the original condition and counterexample. Page ' + page })), hasPageImages: true, status: 'ready', createdAt: now, updatedAt: now, ...extra };
    await store.transaction(async () => { await require('../../../dist/apps/api/src/modules/learning/studio-material-storage.js').persistStudioMaterial(store, sha, bytes); store.append('studioSourceMaterials', row); }); ids.push(id);
    const cache = join(data(), 'studio-materials', 'processed', sha); mkdirSync(cache, { recursive: true }); for (let page = 1; page <= 3; page++) writeFileSync(join(cache, `page-${page}.png`), png);
    return { row, bytes, cache, original: join(data(), 'studio-materials', sha + '.pdf') };
  }
  async function check(id: string, actor = parent, command?: Record<string, unknown>, status = 201) { const input = command ?? { version: (await call('get', base + id, undefined, actor)).version, requestKey: randomUUID() }; return call('post', base + id + '/files/check', input, actor, status); }
  beforeAll(async () => {
    const location = process.env.STUDY_TEST_MATERIAL_INTEGRITY_POSTGRES_URL;
    if (location) {
      const probe = new Pool({ connectionString: location }); try { expect((await probe.query('SELECT current_database() AS name,current_user AS owner')).rows[0]).toEqual({ name: 'study_agent_qa', owner: 'study_agent_app' }); } finally { await probe.end(); }
      if (!process.env.STUDY_TEST_POSTGRES_ADMIN_URL) throw new Error('Isolated QA database administration required');
      pg = new Pool({ connectionString: process.env.STUDY_TEST_POSTGRES_ADMIN_URL }); expect((await pg.query('SELECT current_user AS name')).rows[0].name).toBe('study_qa_admin');
      for (let index = 0; index < 2; index++) { const name = 'study_qa_integrity_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name); }
      const first = new URL(location), second = new URL(location); first.pathname = '/' + databases[0]; second.pathname = '/' + databases[1]; sourceUrl = first.toString(); restoredUrl = second.toString(); process.env.DATABASE_URL = sourceUrl;
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: location ? 'postgres' : 'sqlite', STUDY_DATA_DIR: join(directory, 'source'), STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_PDF_STRUCTURE_MODEL: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    await boot(); parent = await call('post', '/auth/register', { principal: 'integrity-parent@test', credential }, null); other = await call('post', '/auth/register', { principal: 'integrity-other@test', credential }, null);
    const filename = join(directory, 'anonymous.pdf'); execFileSync(process.env.STUDY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), ['-X', 'utf8', '-c', 'import fitz,sys;d=fitz.open();\nfor i in range(3):\n p=d.new_page();p.insert_text((40,80),"Original conditions and counterexamples. Page "+str(i+1))\nd.save(sys.argv[1]);d.close()', filename], { windowsHide: true, timeout: 30000 }); pdf = readFileSync(filename);
    png = await sharp({ create: { width: 24, height: 32, channels: 3, background: '#dbe8f5' } }).png().toBuffer();
  });
  afterEach(async () => { vi.restoreAllMocks(); if (store) await store.transaction(() => { for (const id of ids.splice(0)) store.remove('studioSourceMaterials', { id }); }); });
  afterAll(async () => { await app?.close(); if (pg) { try { for (const name of databases) { if (!/^study_qa_integrity_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe integrity QA database'); await pg.query('DROP DATABASE "' + name + '" WITH (FORCE)'); } } finally { await pg.end(); } } for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } rmSync(directory, { recursive: true, force: true }); });

  it('backfills only actual readable legacy bytes, preserves source versions and returns the same acknowledgment after a lost response', async () => {
    const f = await seed(), before = await call('get', base + f.row.id), command = { version: before.version, requestKey: randomUUID() };
    expect(await call('get', base + f.row.id + '/files')).toBeNull(); const result = await check(f.row.id, parent, command);
    expect(result.original).toBe('verified'); expect(result.pages.map((page: any) => page.state)).toEqual(['baseline_recorded', 'baseline_recorded', 'baseline_recorded']); expect(result).not.toHaveProperty('requestKey');
    expect(await check(f.row.id, parent, command)).toEqual(result); const after = await call('get', base + f.row.id); expect(after.version).toBe(before.version); expect(after.material.updatedAt).toBe(before.material.updatedAt); expect(after.material.pages).toEqual(before.material.pages); expect(after.material).not.toHaveProperty('fileCheck');
    await store.requestContext(() => { const row = store.find('studioSourceMaterials', { id: f.row.id }); expect(row.pageFiles).toHaveLength(3); expect(row.pageFiles[0]).toMatchObject({ sha256: digest(png), size: png.length, origin: 'legacy_observed' }); expect(row.commands.filter((command: any) => command.kind === 'file_check')).toHaveLength(1); });
    await call('get', base + f.row.id + '/files', undefined, other, 403); await check(f.row.id, other, command, 403); await check(f.row.id, parent, { ...command, version: '0'.repeat(64) }, 409);
    await check(f.row.id); await check(f.row.id, parent, command, 409);
  });
  it('reports existing mismatches without rebasing them and repairs real missing/corrupt pages through the persistent processor', async () => {
    const f = await seed(); await store.transaction(() => { const row = store.find('studioSourceMaterials', { id: f.row.id }); row.pageFiles = [{ page: 1, sha256: digest(png), size: png.length }]; });
    const corrupt = Buffer.from('corrupted page bytes'); writeFileSync(join(f.cache, 'page-1.png'), corrupt); unlinkSync(join(f.cache, 'page-2.png')); writeFileSync(join(f.cache, 'page-3.png'), png.subarray(0, 20));
    const result = await check(f.row.id); expect(result.pages.map((page: any) => page.state)).toEqual(['mismatch', 'missing', 'unknown']); expect(result.canRegenerate).toBe(true); expect(readFileSync(join(f.cache, 'page-1.png'))).toEqual(corrupt);
    await store.requestContext(() => expect(store.find('studioSourceMaterials', { id: f.row.id }).pageFiles[0].sha256).toBe(digest(png)));
    await request(app.getHttpServer()).get('/api/learning/studio/materials/' + f.row.id + '/pages/1').set('Authorization', 'Bearer ' + parent.token).expect(404);
    const current = await call('get', base + f.row.id), input = { expectedUpdatedAt: current.material.updatedAt, requestKey: randomUUID() }; await call('post', '/learning/studio/materials/' + f.row.id + '/process/retry', input); await check(f.row.id, parent, undefined, 409); await worker.runNext();
    expect((await call('get', base + f.row.id + '/progress')).status).toBe('ready'); const recovered = await check(f.row.id); expect(recovered.pages.every((page: any) => page.state === 'verified')).toBe(true); expect(recovered.canRegenerate).toBe(false);
    await request(app.getHttpServer()).get('/api/learning/studio/materials/' + f.row.id + '/pages/3').set('Authorization', 'Bearer ' + parent.token).expect(200);
  });
  it('preserves embedded legacy pages, records a separate digest and rejects later changed embedded bytes', async () => {
    const f = await seed({ pageImages: { '1': 'data:image/png;base64,' + png.toString('base64') } }); unlinkSync(join(f.cache, 'page-1.png'));
    const result = await check(f.row.id); expect(result.pages[0]).toMatchObject({ storage: 'embedded', state: 'baseline_recorded' });
    await store.requestContext(() => { const row = store.find('studioSourceMaterials', { id: f.row.id }); expect(row.embeddedPageFiles[0].sha256).toBe(digest(png)); expect(row.pageFiles.some((file: any) => file.page === 1)).toBe(false); });
    const replacement = await sharp({ create: { width: 24, height: 32, channels: 3, background: '#ffffff' } }).png().toBuffer(); await store.transaction(() => { store.find('studioSourceMaterials', { id: f.row.id }).pageImages['1'] = 'data:image/png;base64,' + replacement.toString('base64'); }); expect((await check(f.row.id)).pages[0].state).toBe('mismatch');
    await request(app.getHttpServer()).get('/api/learning/studio/materials/' + f.row.id + '/pages/1').set('Authorization', 'Bearer ' + parent.token).expect(404);
  });
  it('rechecks the original before running a repair even when it changed after a successful file check', async () => {
    const f = await seed(); unlinkSync(join(f.cache, 'page-2.png')); expect((await check(f.row.id)).canRegenerate).toBe(true);
    writeFileSync(f.original, 'changed after the file check'); const current = await call('get', base + f.row.id);
    await call('post', '/learning/studio/materials/' + f.row.id + '/process/retry', { expectedUpdatedAt: current.material.updatedAt, requestKey: randomUUID() }); await worker.runNext();
    expect((await call('get', base + f.row.id + '/progress')).task.errorCode).toBe('material_original_integrity'); expect(readFileSync(f.original, 'utf8')).toBe('changed after the file check');
  });
  it('does not traverse junctions, invent missing originals or change corrupt original bytes', async () => {
    const missing = await seed(); unlinkSync(missing.original); expect((await check(missing.row.id)).original).toBe('missing');
    const corrupt = await seed(); writeFileSync(corrupt.original, 'corrupt original'); const corruptReport = await check(corrupt.row.id); expect(corruptReport.original).toBe('mismatch'); expect(corruptReport.canRegenerate).toBe(false); expect(readFileSync(corrupt.original, 'utf8')).toBe('corrupt original');
    const linked = await seed(), outside = join(directory, 'outside-' + randomUUID()); mkdirSync(outside); writeFileSync(join(outside, 'page-1.png'), png); rmSync(linked.cache, { recursive: true }); symlinkSync(outside, linked.cache, process.platform === 'win32' ? 'junction' : 'dir');
    expect((await check(linked.row.id)).pages.every((page: any) => page.state === 'unknown')).toBe(true); expect(readFileSync(join(outside, 'page-1.png'))).toEqual(png);
    await request(app.getHttpServer()).get('/api/learning/studio/materials/' + linked.row.id + '/pages/1').set('Authorization', 'Bearer ' + parent.token).expect(404);
  });
  it('rejects stale source versions and invalid legacy paths without silently rewriting content', async () => {
    const f = await seed(), old = await call('get', base + f.row.id); await store.transaction(() => { const row = store.find('studioSourceMaterials', { id: f.row.id }); row.pages[0].text += ' Revised source condition.'; });
    await check(f.row.id, parent, { version: old.version, requestKey: randomUUID() }, 409); await store.requestContext(() => expect(store.find('studioSourceMaterials', { id: f.row.id }).pageFiles).toBeUndefined());
    await store.transaction(() => { store.find('studioSourceMaterials', { id: f.row.id }).pageFiles = [{ page: 1, name: '../outside.png', sha256: digest(png), size: png.length }]; });
    expect((await check(f.row.id)).pages[0].state).toBe('unknown');
  });
  it('fences a real guardian revocation that commits while file verification is reading', async () => {
    const studentId = (await call('post', '/students', { nickname: '原页核对', grade: 3, preferredSessionMinutes: 10, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    const f = await seed({ studentId, subject: 'math' }), { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js'), independent = new InMemoryStoreService(); await independent.onModuleInit(); await independent.onApplicationBootstrap();
    const original = files.open.bind(files); let revoked = false;
    vi.spyOn(files, 'open').mockImplementation(async (...args: Parameters<typeof files.open>) => { const handle = await original(...args); if (String(args[0]) === f.original && !revoked) { revoked = true; await independent.transaction(() => { independent.find('bindings', { studentId, parentUserId: parent.user.id }).status = 'revoked'; }); } return handle; });
    try { const current = await call('get', base + f.row.id); const response = await request(app.getHttpServer()).post('/api' + base + f.row.id + '/files/check').set('Authorization', 'Bearer ' + parent.token).send({ version: current.version, requestKey: randomUUID() }); expect(response.status).toBeGreaterThanOrEqual(400); expect(revoked).toBe(true); await store.requestContext(() => expect(store.find('studioSourceMaterials', { id: f.row.id }).fileCheck).toBeUndefined()); await call('get', base + f.row.id + '/files', undefined, parent, 403); }
    finally { vi.restoreAllMocks(); await independent.onModuleDestroy(); }
  });
  it('persists newly recorded disk and embedded bytes through native backup to an empty root and application restart', async () => {
    const f = await seed({ pageImages: { '1': 'data:image/png;base64,' + png.toString('base64') } }); unlinkSync(join(f.cache, 'page-1.png')); const checked = await check(f.row.id), bundle = join(directory, 'bundle'), recovered = join(directory, 'recovered');
    if (sourceUrl) { const { createPostgresBundle, restorePostgresBundle } = require(resolve(__dirname, '../../../../../scripts/operations/postgres-backup.cjs')); await createPostgresBundle({ connectionString: sourceUrl, pgBin: process.env.STUDY_TEST_PG_BIN, dataDir: data(), destination: bundle }); await app.close(); await restorePostgresBundle({ connectionString: restoredUrl, pgBin: process.env.STUDY_TEST_PG_BIN, bundle, destination: recovered }); process.env.DATABASE_URL = restoredUrl; }
    else { const { createBundle, restoreBundle } = require(resolve(__dirname, '../../../../../scripts/operations/backup.cjs')); await createBundle({ dataDir: data(), destination: bundle }); await app.close(); await restoreBundle({ bundle, destination: recovered }); }
    process.env.STUDY_DATA_DIR = recovered; await boot(); parent = await call('post', '/auth/login', { principal: 'integrity-parent@test', credential }, null); expect(await call('get', base + f.row.id + '/files')).toEqual(checked);
    const cache = join(recovered, 'studio-materials', 'processed', f.row.sha256); expect(readFileSync(join(cache, 'page-2.png'))).toEqual(png); expect(existsSync(join(cache, 'page-1.png'))).toBe(false); expect((await check(f.row.id)).pages.every((page: any) => page.state === 'baseline_recorded')).toBe(true);
  }, 120000);
});
