import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';

const configured = process.env.STUDY_TEST_PAPER_ACCESS_POSTGRES_URL;
describe('actual old paper entry authorization and verified HTTP file handles on ' + (configured ? 'PostgreSQL' : 'SQLite'), () => {
  const repo = resolve(process.cwd(), '../..'), qa = join(repo, 'data/qa'); mkdirSync(qa, { recursive: true });
  const directory = mkdtempSync(join(qa, 'paper-access-')), data = join(directory, 'source');
  const assets = require(join(repo, 'scripts/qa/paper-practice-fixture.cjs')).preparePaperPracticeAssets(directory, repo);
  const imageUrl = 'https://synthetic.example/browser-figure.png', referenceUrl = 'https://synthetic.example/reference-only.png', pdfUrl = 'https://synthetic.example/browser-paper.pdf';
  const imageFile = join(assets, 'shijuanbao/media/figure.png'), referenceFile = join(assets, 'shijuanbao/media/reference.png');
  const originalImage = readFileSync(imageFile), sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex'), key = () => randomUUID();
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_ASSET_ROOT', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]])), credential = 'synthetic-paper-access-only';
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, administrator: any, index = 0;
  async function api(actor: any, method: 'get' | 'post', path: string, body?: unknown, status = method === 'post' ? 201 : 200) {
    let call = request(app.getHttpServer())[method]('/api' + path); if (actor) call = call.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) call = call.send(body as object); const response = await call; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  const register = () => api(null, 'post', '/auth/register', { principal: 'paper-access-' + key(), credential });
  const publication = (paperId: string, status = 'published') => api(administrator, 'post', '/library/papers/' + paperId + '/publication', {
    status, licenseEvidence: '仅工程合成的原始正文与参考媒体验证', contentReviewed: true, mediaReviewed: true, reason: '隔离当前发布读取资格验证',
  });
  async function paper(actor: any, kind: 'complete' | 'pdf' = 'complete') {
    const id = 'qa:paper:' + index++ + ':' + kind; await publication(id); return api(actor, 'get', '/library/papers/' + id + '/metadata');
  }
  const reading = (metadata: any, answers = false, positions = metadata.positions) => ({ kind: 'read', requestKey: key(), paperId: metadata.paperId,
    detailSha256: metadata.detailSha256, publicationVersion: metadata.publicationVersion,
    positions: metadata.document ? 'document' : positions.map(({ position, sourceQuestionId }: any) => ({ position, sourceQuestionId })), answers: metadata.document || answers, origin: null });
  const open = (actor: any, paperId: string, answers = false, status = 200) => api(actor, 'get', '/library/papers/' + paperId + '?answers=' + answers, undefined, status);
  async function media(actor: any, paperId: string, url: string, status = 200, range?: string) {
    let call = request(app.getHttpServer()).get('/api/library/media?' + new URLSearchParams({ paperId, url })).set('Authorization', 'Bearer ' + actor.token);
    if (range) call = call.set('Range', range); const result = await call; expect(result.status, JSON.stringify(result.body?.error)).toBe(status); return result;
  }
  async function learner() {
    const parent = await register(), child = (await api(parent, 'post', '/students', { nickname: '匿名读取工程档案', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'synthetic', chinese: '', english: '' } })).profile;
    await api(parent, 'post', '/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: key(), reason: '隔离工程验证的当前本人读取授权。' });
    const code = await api(parent, 'post', '/students/' + child.id + '/learning-access/codes', { expectedVersion: 1, requestKey: key() });
    return { parent, child, actor: await api(null, 'post', '/auth/learning-code', { code: code.code }) };
  }
  async function diagnostic(childId: string) { await store.transaction(() => store.append('diagnosticSessions', { id: 'synthetic-read-guard-' + key(), studentId: childId, status: 'in_progress', startedAt: new Date().toISOString() })); }
  async function practice(f: Awaited<ReturnType<typeof learner>>, metadata: any) {
    const selection = [{ paperId: metadata.paperId }], preview = await api(f.actor, 'post', '/library/practice/preview', { studentId: f.child.id, selection });
    const input = { studentId: f.child.id, selection, sourceHash: preview.sourceHash, requestKey: key() }, saved = await api(f.actor, 'post', '/library/practice/sessions', input);
    return { input, saved, path: '/library/practice/sessions/' + saved.id };
  }
  beforeAll(async () => {
    // Derive a generated reference-only URL and bind every altered original to
    // its actual full new UTF-8 digest. No real source is modified.
    writeFileSync(referenceFile, originalImage);
    const archive = new DatabaseSync(join(assets, 'shijuanbao/archive.sqlite3')), catalog = new DatabaseSync(join(assets, 'catalog.sqlite3')), manifest = new DatabaseSync(join(assets, 'manifest.sqlite3'));
    try {
      manifest.prepare('INSERT INTO files VALUES(?,?,?,?)').run('shijuanbao/media/reference.png', originalImage.length, sha(originalImage), 'verified');
      archive.prepare('INSERT INTO media_jobs VALUES(?,?,?,?)').run(referenceUrl, 'media/reference.png', sha(originalImage), 'done');
      for (const row of archive.prepare('SELECT key,detail FROM papers').all() as Array<{ key: string; detail: string }>) {
        const detail = JSON.parse(row.detail); if (!detail.questions.length) continue;
        detail.questions[0].answer += '<img src="' + referenceUrl + '" alt="工程合成参考图">'; const text = JSON.stringify(detail);
        archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(text, row.key); catalog.prepare('UPDATE papers SET detail_sha256=? WHERE id=?').run(sha(text), row.key);
      }
    } finally { archive.close(); catalog.close(); manifest.close(); }
    if (configured) { const target = new URL(configured); if (target.hostname !== '127.0.0.1' || target.port !== '15445' || target.pathname !== '/study_paper_access') throw Error('Owned paper access PostgreSQL fixture required'); }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: configured ? 'postgres' : 'sqlite', STUDY_DATA_DIR: data, STUDY_ASSET_ROOT: assets, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false' });
    if (configured) process.env.DATABASE_URL = configured; else delete process.env.DATABASE_URL;
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    administrator = await register(); await store.transaction(() => { store.find('users', { id: administrator.user.id }).role = 'admin'; });
  });
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => { await app?.close(); for (const name of names) { if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; } });

  it('requires complete explicit read coverage for old preview and keeps a single position from opening other source media', async () => {
    const f = await learner(), metadata = await paper(f.actor); await open(f.actor, metadata.paperId, false, 403);
    await api(f.actor, 'post', '/library/source-reads', reading(metadata, false, metadata.positions.slice(0, 1)));
    await open(f.actor, metadata.paperId, false, 403); await media(f.actor, metadata.paperId, imageUrl, 403);
    await api(f.actor, 'post', '/library/source-reads', reading(metadata)); expect((await open(f.actor, metadata.paperId)).questions).toHaveLength(2);
    expect((await media(f.actor, metadata.paperId, imageUrl)).body).toEqual(originalImage);
  });
  it('keeps reference-only media and whole-preview answers behind an explicit answer read', async () => {
    const f = await learner(), metadata = await paper(f.actor); await api(f.actor, 'post', '/library/source-reads', reading(metadata));
    await media(f.actor, metadata.paperId, referenceUrl, 403); await open(f.actor, metadata.paperId, true, 403);
    await api(f.actor, 'post', '/library/source-reads', reading(metadata, true));
    expect((await media(f.actor, metadata.paperId, referenceUrl)).body).toEqual(originalImage);
    expect((await open(f.actor, metadata.paperId, true)).questions[0].answerHtml).toContain('reference-only');
  });
  it('never lends a read grant to a different paper with the same raw image URL', async () => {
    const f = await learner(), first = await paper(f.actor), other = await paper(f.actor); await api(f.actor, 'post', '/library/source-reads', reading(first));
    await media(f.actor, first.paperId, imageUrl); await media(f.actor, other.paperId, imageUrl, 403);
  });
  it('keeps learner-owned old practice prompt/reference semantics without adding synthetic source-read history', async () => {
    const f = await learner(), metadata = await paper(f.actor), p = await practice(f, metadata);
    await media(f.actor, metadata.paperId, imageUrl); await media(f.actor, metadata.paperId, referenceUrl, 403);
    const first = p.saved.items[0], answer = await api(f.actor, 'post', p.path + '/commands', { kind: 'submit', itemId: first.id, expectedVersion: p.saved.version, requestKey: key(), disposition: 'answered', text: '工程合成的本人首答保持' });
    await api(f.actor, 'post', p.path + '/commands', { kind: 'reveal', itemId: first.id, expectedVersion: answer.session.version, requestKey: key() });
    await media(f.actor, metadata.paperId, referenceUrl);
    expect(await store.requestContext(() => store.select('paperSourceExposures', { actorId: f.actor.user.id }))).toEqual([]);
  });
  it('blocks old student preview/media/reference/practice during diagnosis while retaining own first answers and original results', async () => {
    const f = await learner(), metadata = await paper(f.actor), p = await practice(f, metadata), first = p.saved.items[0];
    const submit = { kind: 'submit', itemId: first.id, expectedVersion: p.saved.version, requestKey: key(), disposition: 'answered', text: '诊断前已经保留的本人原首答' };
    const answer = await api(f.actor, 'post', p.path + '/commands', submit);
    await api(f.actor, 'post', p.path + '/commands', { kind: 'reveal', itemId: first.id, expectedVersion: answer.session.version, requestKey: key() });
    await api(f.actor, 'post', '/library/source-reads', reading(metadata, true)); const before = await api(f.actor, 'get', p.path + '/items/' + first.id); expect(before.reference).not.toBeNull();
    await diagnostic(f.child.id);
    await open(f.actor, metadata.paperId, false, 409); await open(f.actor, metadata.paperId, true, 409); await media(f.actor, metadata.paperId, imageUrl, 409); await media(f.actor, metadata.paperId, referenceUrl, 409);
    await api(f.actor, 'post', '/library/practice/preview', { studentId: f.child.id, selection: [{ paperId: metadata.paperId }] }, 409);
    const retained = await api(f.actor, 'get', p.path + '/items/' + first.id); expect(retained.html).toBe(''); expect(retained.options).toEqual([]); expect(retained.reference).toBeNull(); expect(retained.firstAnswer).toEqual(before.firstAnswer); expect(retained.corrections).toEqual(before.corrections);
    expect((await api(f.actor, 'post', p.path + '/commands', submit)).appliedVersion).toBe(answer.appliedVersion);
    expect((await api(f.actor, 'post', '/library/practice/sessions', p.input)).id).toBe(p.saved.id);
    await api(f.actor, 'get', '/library/papers/' + metadata.paperId + '/metadata'); await open(f.parent, metadata.paperId, true);
  });
  it('requires whole-document reading for old PDF URLs and rechecks diagnosis on the actual file request', async () => {
    const f = await learner(), metadata = await paper(f.actor, 'pdf'); await media(f.actor, metadata.paperId, pdfUrl, 403);
    await api(f.actor, 'post', '/library/source-reads', reading(metadata)); expect((await media(f.actor, metadata.paperId, pdfUrl)).headers['content-type']).toContain('application/pdf');
    await diagnostic(f.child.id); await media(f.actor, metadata.paperId, pdfUrl, 409); await open(f.actor, metadata.paperId, false, 409);
  });
  it('rejects the old actor header after a real identity change and creates no read for the new actor', async () => {
    const old = await learner(), current = await learner(), metadata = await paper(current.actor), command = reading(metadata);
    await request(app.getHttpServer()).post('/api/library/source-reads').set('Authorization', 'Bearer ' + current.actor.token).set('X-Study-Actor', old.actor.user.id).send(command).expect(403);
    expect(await store.requestContext(() => store.select('paperSourceExposures', { actorId: current.actor.user.id }))).toEqual([]);
  });
  it('rejects a same-size changed actual media file instead of trusting the manifest digest', async () => {
    const actor = await register(), metadata = await paper(actor); writeFileSync(imageFile, Buffer.alloc(originalImage.length, 88));
    try { await media(actor, metadata.paperId, imageUrl, 409); } finally { writeFileSync(imageFile, originalImage); }
  });
  it('returns a real HTTP range from the original hashed handle after a path swap and closes it', async () => {
    const actor = await register(), metadata = await paper(actor), module = load('modules/library/verified-library-media'), actual = module.openVerifiedLibraryMedia;
    let opened: any, replaced = false; const retained = imageFile + '.retained-' + key();
    vi.spyOn(module, 'openVerifiedLibraryMedia').mockImplementation(async (...args: any[]) => {
      const result = await actual(...args); if (!replaced) { opened = result; replaced = true; renameSync(imageFile, retained); writeFileSync(imageFile, Buffer.alloc(originalImage.length, 88)); } return result;
    });
    try { const response = await media(actor, metadata.paperId, imageUrl, 206, 'bytes=0-7'); expect(response.body).toEqual(originalImage.subarray(0, 8)); expect(opened.handle.fd).toBe(-1); expect(sha(readFileSync(imageFile))).not.toBe(sha(originalImage)); }
    finally { if (replaced) { unlinkSync(imageFile); renameSync(retained, imageFile); } }
  });
  it('rechecks a real account revocation after actual hashing and closes the handle without returning bytes', async () => {
    const actor = await register(), metadata = await paper(actor), module = load('modules/library/verified-library-media'), actual = module.openVerifiedLibraryMedia; let opened: any;
    vi.spyOn(module, 'openVerifiedLibraryMedia').mockImplementation(async (...args: any[]) => {
      opened = await actual(...args); await store.transaction(() => { store.find('users', { id: actor.user.id }).status = 'disabled'; }); return opened;
    });
    await media(actor, metadata.paperId, imageUrl, 403); expect(opened.handle.fd).toBe(-1);
  });
  it('rechecks actual publication withdrawal after hashing and closes the handle', async () => {
    const actor = await register(), metadata = await paper(actor), module = load('modules/library/verified-library-media'), actual = module.openVerifiedLibraryMedia; let opened: any;
    vi.spyOn(module, 'openVerifiedLibraryMedia').mockImplementation(async (...args: any[]) => { opened = await actual(...args); await publication(metadata.paperId, 'withdrawn'); return opened; });
    await media(actor, metadata.paperId, imageUrl, 403); expect(opened.handle.fd).toBe(-1);
  });
  it('rechecks the learner guardian permission revoked after hashing without changing original read facts', async () => {
    const f = await learner(), metadata = await paper(f.actor); await api(f.actor, 'post', '/library/source-reads', reading(metadata));
    const before = await store.requestContext(() => store.select('paperSourceExposures', { actorId: f.actor.user.id }));
    const module = load('modules/library/verified-library-media'), actual = module.openVerifiedLibraryMedia; let opened: any;
    vi.spyOn(module, 'openVerifiedLibraryMedia').mockImplementation(async (...args: any[]) => {
      opened = await actual(...args); await api(f.parent, 'post', '/students/' + f.child.id + '/learning-access', {
        enabled: false, expectedVersion: 1, requestKey: key(), reason: '隔离测试在真实完整字节校验之后撤回原监护学习授权。',
      }); return opened;
    });
    await media(f.actor, metadata.paperId, imageUrl, 403); expect(opened.handle.fd).toBe(-1);
    expect(await store.requestContext(() => store.select('paperSourceExposures', { actorId: f.actor.user.id }))).toEqual(before);
  });
  it('closes the actual verified handle for an unsatisfiable HTTP range', async () => {
    const actor = await register(), metadata = await paper(actor), module = load('modules/library/verified-library-media'), actual = module.openVerifiedLibraryMedia; let opened: any;
    vi.spyOn(module, 'openVerifiedLibraryMedia').mockImplementation(async (...args: any[]) => { opened = await actual(...args); return opened; });
    await media(actor, metadata.paperId, imageUrl, 416, 'bytes=99999999-'); expect(opened.handle.fd).toBe(-1);
  });
  it('closes the real verified handle when the actual HTTP client disconnects before the response', async () => {
    const actor = await register(), metadata = await paper(actor), module = load('modules/library/verified-library-media'), actual = module.openVerifiedLibraryMedia; let opened: any;
    let ready!: () => void, release!: () => void; const observed = new Promise<void>(resolve => { ready = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(module, 'openVerifiedLibraryMedia').mockImplementation(async (...args: any[]) => { opened = await actual(...args); ready(); await gate; return opened; });
    const call = request(app.getHttpServer()).get('/api/library/media?' + new URLSearchParams({ paperId: metadata.paperId, url: imageUrl })).set('Authorization', 'Bearer ' + actor.token);
    const completed = call.then(() => false, () => true);
    try { await observed; call.abort(); } finally { release(); }
    expect(await completed).toBe(true);
    for (let attempt = 0; attempt < 100 && opened.handle.fd !== -1; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    expect(opened.handle.fd).toBe(-1);
  });
});
