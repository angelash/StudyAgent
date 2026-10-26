import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';

function actualPdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = 'BT /F1 12 Tf 20 150 Td (Original synthetic paper) Tj ET'; objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
  let result = '%PDF-1.4\n'; const offsets = [0]; for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(result)); result += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(result); result += `xref\n0 ${offsets.length}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(result + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

describe('original paper practice, immutable first answers and explicit reference review', () => {
  const root = mkdtempSync(join(tmpdir(), 'study-paper-practice-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_ASSET_ROOT', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  const pdfUrl = 'https://synthetic.example/paper.pdf', imageUrl = 'https://synthetic.example/figure.png';
  let app: any, store: any, owner: any, other: any, admin: any, learner: any, child: string, grantVersion: number;
  let pg: Pool | undefined, schema: string | undefined;
  async function boot() { app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService); }
  async function call(method: 'get' | 'post', path: string, input?: unknown, actor = owner, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor) query = query.set('Authorization', 'Bearer ' + actor.token); if (input !== undefined) query = query.send(input as object);
    const response = await query; expect(response.status, JSON.stringify(response.body)).toBe(status); return response.body.data;
  }
  const publish = (paperId: string, status = 'published') => call('post', '/library/papers/' + paperId + '/publication', { status, reason: '合成原创试卷用于独立流程核对', licenseEvidence: '全部题干与媒体为本测试原创构造', contentReviewed: true, mediaReviewed: true }, admin);
  async function begin(papers = [{ paperId: 'p:complete' }], studentId: string | null = null, actor = owner) {
    const command = { studentId, selection: papers }, preview = await call('post', '/library/practice/preview', command, actor);
    return call('post', '/library/practice/sessions', { ...command, sourceHash: preview.sourceHash, requestKey: randomUUID() }, actor);
  }
  const get = (id: string, actor = owner) => call('get', '/library/practice/sessions/' + id, undefined, actor);
  const item = (row: any, index = 0, actor = owner) => call('get', '/library/practice/sessions/' + row.id + '/items/' + row.items[index].id, undefined, actor);
  async function command(row: any, body: any, actor = owner, status = 201) { return call('post', '/library/practice/sessions/' + row.id + '/commands', { expectedVersion: row.version, requestKey: randomUUID(), ...body }, actor, status); }
  beforeAll(async () => {
    const assets = join(root, 'assets'); mkdirSync(join(assets, 'shijuanbao/media'), { recursive: true });
    const manifest = new DatabaseSync(join(assets, 'manifest.sqlite3')), archive = new DatabaseSync(join(assets, 'shijuanbao/archive.sqlite3')), catalog = new DatabaseSync(join(assets, 'catalog.sqlite3'));
    manifest.exec('CREATE TABLE files(path TEXT PRIMARY KEY,bytes INTEGER,sha256 TEXT,state TEXT)');
    archive.exec('CREATE TABLE papers(key TEXT PRIMARY KEY,detail TEXT); CREATE TABLE questions(key TEXT PRIMARY KEY,body BLOB); CREATE TABLE media_jobs(url TEXT,path TEXT,sha256 TEXT,state TEXT)');
    for (const [url, name, bytes] of [[pdfUrl, 'paper.pdf', actualPdf()], [imageUrl, 'figure.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWTkAAAAASUVORK5CYII=', 'base64')]] as const) {
      writeFileSync(join(assets, 'shijuanbao/media', name), bytes); const digest = createHash('sha256').update(bytes).digest('hex');
      manifest.prepare('INSERT INTO files VALUES(?,?,?,?)').run('shijuanbao/media/' + name, bytes.length, digest, 'verified');
      archive.prepare('INSERT INTO media_jobs VALUES(?,?,?,?)').run(url, 'media/' + name, digest, 'done');
    }
    catalog.exec(`CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT,grade TEXT,subject TEXT,province TEXT,paper_type TEXT,year INTEGER,content_state TEXT,expected INTEGER,available INTEGER,missing INTEGER,pdf_url TEXT,detail_sha256 TEXT,metadata_flags TEXT);
      CREATE TABLE paper_items(paper_id TEXT,position INTEGER,question_key TEXT,available INTEGER); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
      CREATE VIRTUAL TABLE paper_search USING fts5(title,content='papers',content_rowid='rowid',tokenize='trigram');`);
    const originals = [{ uuid: 'q1', title: '<p>3+2=?</p><script>untrusted()</script>', options: ['<p>4</p>', '<p>5</p>'], answer: '<p>SYNTHETIC_REFERENCE_ONLY_5</p>', details: '<p>三个与两个合起来。</p>' },
      { uuid: 'q2', title: '<p>观察这张图并说明。</p><img src="' + imageUrl + '" onerror="untrusted()">', options: [], answer: '', details: '' }];
    for (const [id, state] of [['p:complete', 'complete'], ['p:partial', 'partial'], ['p:pdf', 'pdf'], ['p:research', 'complete']]) {
      const detail = JSON.stringify({ questions: id === 'p:pdf' ? [] : originals }); archive.prepare('INSERT INTO papers VALUES(?,?)').run(id, detail);
      catalog.prepare('INSERT INTO papers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, '合成原卷 ' + id, '三年级', '数学', '合成地区', '原创练习', 2026, state,
        id === 'p:pdf' ? null : state === 'partial' ? 3 : 2, id === 'p:pdf' ? 0 : 2, state === 'partial' ? 1 : 0, id === 'p:pdf' ? pdfUrl : null, createHash('sha256').update(detail).digest('hex'), '[]');
      if (id !== 'p:pdf') { for (const [index, q] of originals.entries()) catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run(id, index + 1, 'paper:' + q.uuid, 1); if (state === 'partial') catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run(id, 3, 'paper:missing', 0); }
    }
    catalog.prepare('INSERT INTO metadata VALUES(?,?)').run('summary', '{"papers":4,"questions":6}'); catalog.exec("INSERT INTO paper_search(paper_search) VALUES('rebuild')"); manifest.close(); archive.close(); catalog.close();
    const location = process.env.STUDY_TEST_PAPER_PRACTICE_POSTGRES_URL;
    if (location) { pg = new Pool({ connectionString: location }); expect((await pg.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa'); schema = 'study_qa_paper_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"'); const url = new URL(location); url.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = url.toString(); }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: location ? 'postgres' : 'sqlite', STUDY_DATA_DIR: join(root, 'domain'), STUDY_ASSET_ROOT: assets,
      STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    await boot();
    const register = (name: string) => call('post', '/auth/register', { principal: 'paper-' + name + '-' + randomUUID(), credential: 'Synthetic-paper-only-20261026' }, null);
    owner = await register('owner'); other = await register('other'); admin = await register('admin');
    await store.transaction(() => { store.find('users', { id: admin.user.id }).role = 'admin'; });
    for (const id of ['p:complete', 'p:partial', 'p:pdf']) await publish(id);
    child = (await call('post', '/students', { nickname: '匿名题卷验证', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    const grant = await call('post', '/students/' + child + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '独立题卷流程验证' }); grantVersion = grant.version;
    const code = await call('post', '/students/' + child + '/learning-access/codes', { expectedVersion: grant.version, requestKey: randomUUID() }); learner = await call('post', '/auth/learning-code', { code: code.code }, null);
  });
  afterAll(async () => {
    await app?.close(); if (pg) { if (!/^study_qa_paper_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Unknown isolated paper schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe synthetic fixture directory'); rmSync(root, { recursive: true, force: true });
  });

  it('previews real indexed selections without creating activity, preserves missing positions and refuses unreviewed family sources', async () => {
    const before = store.paperPracticeSessions.length;
    const preview = await call('post', '/library/practice/preview', { selection: [{ paperId: 'p:partial' }] });
    expect(preview).toMatchObject({ total: 3, answerable: 2, missing: 1, withoutReference: 1 }); expect(store.paperPracticeSessions.length).toBe(before);
    await call('post', '/library/practice/preview', { selection: [{ paperId: 'p:research' }] }, owner, 403);
    await call('post', '/library/practice/preview', { selection: [{ paperId: 'p:complete', positions: [1, 1] }] }, owner, 400);
    await call('post', '/library/practice/preview', { selection: [{ paperId: 'p:complete', positions: [99] }] }, owner, 400);
  });
  it('replays the exact confirmed creation and rejects stale-source or same-key changed selection without leaking answer fields', async () => {
    const selection = [{ paperId: 'p:partial', positions: [2, 1] }, { paperId: 'p:complete', positions: [1] }], preview = await call('post', '/library/practice/preview', { selection });
    const body = { selection, sourceHash: preview.sourceHash, requestKey: randomUUID() }, row = await call('post', '/library/practice/sessions', body);
    expect(row.items.map((item: any) => [item.paperId, item.position])).toEqual([['p:partial', 1], ['p:partial', 2], ['p:complete', 1]]);
    expect(JSON.stringify(row)).not.toContain('SYNTHETIC_REFERENCE_ONLY'); expect((await item(row)).reference).toBeNull(); expect(JSON.stringify(await item(row))).not.toMatch(/<script|onerror/);
    expect((await call('post', '/library/practice/sessions', body)).id).toBe(row.id);
    expect((await call('get', '/library/practice/requests/' + body.requestKey)).session.id).toBe(row.id);
    await call('post', '/library/practice/sessions', { ...body, selection: [{ paperId: 'p:complete' }] }, owner, 409);
    await call('post', '/library/practice/sessions', { ...body, sourceHash: '0'.repeat(64), requestKey: randomUUID() }, owner, 409);
  });
  it('keeps the immutable first answer, explicit reveal, self-review and appended correction separate under retries and old-page conflicts', async () => {
    let row = await begin(); const itemId = row.items[0].id;
    await command(row, { kind: 'reveal', itemId }, owner, 409);
    row = (await command(row, { kind: 'draft', itemId, text: '原草稿' })).session;
    await command({ ...row, version: 1 }, { kind: 'draft', itemId, text: '旧页不能覆盖' }, owner, 409);
    const submit = { kind: 'submit', itemId, disposition: 'answered', text: '我的首次答案是4', requestKey: randomUUID(), expectedVersion: row.version };
    const saved = await command(row, submit); row = saved.session;
    await command(row, { kind: 'submit', itemId, disposition: 'answered', text: '覆盖首答' }, owner, 409);
    expect((await item(row)).reference).toBeNull(); row = (await command(row, { kind: 'reveal', itemId })).session;
    expect((await item(row)).reference.answerHtml).toContain('SYNTHETIC_REFERENCE_ONLY_5'); expect((await item(row, 1)).reference).toBeNull();
    row = (await command(row, { kind: 'self_review', itemId, value: 'needs_correction' })).session;
    const correction = { kind: 'correct', itemId, text: '订正：3与2合起来是5。', requestKey: randomUUID(), expectedVersion: row.version }; row = (await command(row, correction)).session;
    expect((await command(row, correction)).session.version).toBe(row.version);
    const replay = await command(row, submit); expect(replay.appliedVersion).toBe(saved.appliedVersion); expect(replay.session.version).toBe(row.version);
    const corrected = await item(row); expect(corrected.firstAnswer.text).toBe('我的首次答案是4'); expect(corrected.corrections).toHaveLength(1); expect(row.independentMeasurement).toBe(false);
    await command(row, { ...submit, text: '同键换内容' }, owner, 409);
  });
  it('preserves dont-know, skip, missing and absent-reference semantics without manufacturing a score', async () => {
    let row = await begin([{ paperId: 'p:partial' }]); row = (await command(row, { kind: 'submit', itemId: row.items[0].id, disposition: 'dont_know', text: '' })).session;
    row = (await command(row, { kind: 'submit', itemId: row.items[1].id, disposition: 'skip', text: '' })).session;
    row = (await command(row, { kind: 'reveal', itemId: row.items[1].id })).session;
    await command(row, { kind: 'self_review', itemId: row.items[1].id, value: 'matches_reference' }, owner, 400);
    await command(row, { kind: 'submit', itemId: row.items[2].id, disposition: 'skip', text: '' }, owner, 409);
    expect(row.counts).toMatchObject({ total: 3, submitted: 2, unanswered: 0, missing: 1, dontKnow: 1, skipped: 1 }); expect(row).not.toHaveProperty('score');
  });
  it('pauses, resumes, explicitly acknowledges holes and keeps a completed record readable without reopening writes', async () => {
    let row = await begin(); row = (await command(row, { kind: 'pause' })).session;
    await command(row, { kind: 'draft', itemId: row.items[0].id, text: '暂停时不能写' }, owner, 409);
    row = (await command(row, { kind: 'resume' })).session;
    await command(row, { kind: 'complete' }, owner, 409); row = (await command(row, { kind: 'complete', acknowledgeUnanswered: true })).session;
    expect(row.status).toBe('completed'); expect(row.counts.unanswered).toBe(2); expect((await get(row.id)).permissions.edit).toBe(false);
    await command(row, { kind: 'resume' }, owner, 409);
  });
  it('permits explicit reference reading after completion without reopening or overwriting the original answer', async () => {
    let row = await begin(); const itemId = row.items[0].id;
    row = (await command(row, { kind: 'submit', itemId, disposition: 'answered', text: '结束前保留的原答' })).session;
    row = (await command(row, { kind: 'complete', acknowledgeUnanswered: true })).session;
    expect((await item(row)).reference).toBeNull(); row = (await command(row, { kind: 'reveal', itemId })).session;
    expect(row.status).toBe('completed'); expect((await item(row)).reference.answerHtml).toContain('SYNTHETIC_REFERENCE_ONLY_5');
    expect((await item(row)).firstAnswer.text).toBe('结束前保留的原答');
    await command(row, { kind: 'correct', itemId, text: '完成后不能追改作答' }, owner, 409);
    await command(row, { kind: 'self_review', itemId, value: 'matches_reference' }, owner, 409);
  });
  it('uses an actual original PDF as an unsplit document record with no fabricated questions or reference grade', async () => {
    let row = await begin([{ paperId: 'p:pdf' }]); expect(row.items).toHaveLength(1); expect(row.items[0]).toMatchObject({ kind: 'document', position: 0 });
    const document = await item(row); expect(document.pdfUrl).toContain('/api/library/media?');
    const response = await request(app.getHttpServer()).get(document.pdfUrl).set('Authorization', 'Bearer ' + owner.token).expect(200);
    expect(response.headers['content-type']).toContain('application/pdf'); expect(Buffer.from(response.body).equals(actualPdf())).toBe(true);
    const parsed = spawnSync('python', ['-X', 'utf8', '-c', 'import fitz,sys; d=fitz.open(sys.argv[1]); print(d.page_count, d[0].get_text().strip())', join(root, 'assets/shijuanbao/media/paper.pdf')], { encoding: 'utf8', windowsHide: true });
    expect(parsed.status, parsed.stderr).toBe(0); expect(parsed.stdout.trim()).toBe('1 Original synthetic paper');
    row = (await command(row, { kind: 'submit', itemId: row.items[0].id, disposition: 'answered', text: '原卷整体作答笔记，尚未逐题结构化。' })).session;
    expect(row.counts.submitted).toBe(1); expect(row.independentMeasurement).toBe(false);
  });
  it('blocks only withdrawn or changed sources while preserving personal answers and other selected papers', async () => {
    let row = await begin([{ paperId: 'p:complete' }, { paperId: 'p:partial' }]); row = (await command(row, { kind: 'submit', itemId: row.items[0].id, disposition: 'answered', text: '保留自己的原答' })).session;
    await publish('p:complete', 'withdrawn'); const blocked = await item(row);
    expect(blocked.availability.available).toBe(false); expect(blocked.html).toBe(''); expect(blocked.firstAnswer.text).toBe('保留自己的原答'); expect(blocked.reference).toBeNull();
    await command(row, { kind: 'reveal', itemId: row.items[0].id }, owner, 409);
    expect((await item(row, 2)).availability.available).toBe(true);
    await publish('p:complete'); expect((await item(row)).availability.available).toBe(false); expect((await begin()).items[0].availability.available).toBe(true);
  });
  it('isolates families and guardian-owned drafts, lets a current guardian read a learner record, and enforces actual learning-grant revocation', async () => {
    const own = await begin([{ paperId: 'p:partial' }], child);
    await call('get', '/library/practice/sessions/' + own.id, undefined, other, 403);
    await call('post', '/library/practice/preview', { selection: [{ paperId: 'p:partial' }] }, learner, 403);
    const student = await begin([{ paperId: 'p:partial' }], child, learner);
    expect((await get(student.id)).permissions.edit).toBe(false);
    await command(student, { kind: 'pause' }, owner, 403);
    await call('get', '/library/practice/sessions/' + own.id, undefined, learner, 403);
    await call('post', '/students/' + child + '/learning-access', { enabled: false, expectedVersion: grantVersion, requestKey: randomUUID(), reason: '验证练习实时撤权' });
    await call('get', '/library/practice/sessions/' + student.id, undefined, learner, 401);
  });
  it('persists original commands through storage restart and enforces database uniqueness without silently losing another session', async () => {
    let row = await begin([{ paperId: 'p:partial' }]); const body = { kind: 'submit', itemId: row.items[0].id, disposition: 'answered', text: '持久化的原答', requestKey: randomUUID() };
    const result = await command(row, body); row = result.session;
    const snapshot = structuredClone(store.find('paperPracticeSessions', { id: row.id }));
    await expect(store.transaction(() => { store.append('paperPracticeSessions', { ...snapshot, id: snapshot.id + '-duplicate' }); })).rejects.toThrow();
    await app.close(); await boot(); expect((await item(row)).firstAnswer.text).toBe('持久化的原答');
    const receipt = await call('get', '/library/practice/sessions/' + row.id + '/commands/' + body.requestKey); expect(receipt.appliedVersion).toBe(result.appliedVersion);
    const privacy = load('modules/privacy/privacy-records');
    expect(privacy.accountRecords(store, owner.user.id, owner.user.principal).paperPracticeSessions.some((value: any) => value.id === row.id)).toBe(true);
    expect(privacy.studentRecords(store, child).paperPracticeCommands).toBeDefined();
  });
  it('serializes identical creation and submit commands across two actual app instances and refuses a competing stale answer', async () => {
    const second = await NestFactory.create(load('app.module').AppModule, { logger: false }); second.setGlobalPrefix('api'); await second.init();
    const post = (path: string, body: unknown) => request(second.getHttpServer()).post('/api' + path).set('Authorization', 'Bearer ' + owner.token).send(body as object);
    try {
      const selection = [{ paperId: 'p:partial' }], preview = await call('post', '/library/practice/preview', { selection });
      const start = { selection, sourceHash: preview.sourceHash, requestKey: randomUUID() };
      const attempts = await Promise.all([request(app.getHttpServer()).post('/api/library/practice/sessions').set('Authorization', 'Bearer ' + owner.token).send(start), post('/library/practice/sessions', start)]);
      expect(attempts.every(reply => [201, 409].includes(reply.status))).toBe(true); expect(attempts.some(reply => reply.status === 201)).toBe(true);
      const one = await call('post', '/library/practice/sessions', start), two = await post('/library/practice/sessions', start);
      expect(two.status, JSON.stringify(two.body)).toBe(201); expect(two.body.data.id).toBe(one.id);
      const body = { expectedVersion: one.version, requestKey: randomUUID(), kind: 'submit', itemId: one.items[0].id, disposition: 'answered', text: '同一原命令仅一次' };
      const path = '/library/practice/sessions/' + one.id + '/commands';
      const commands = await Promise.all([request(app.getHttpServer()).post('/api' + path).set('Authorization', 'Bearer ' + owner.token).send(body), post(path, body)]);
      expect(commands.every(reply => [201, 409].includes(reply.status))).toBe(true); expect(commands.some(reply => reply.status === 201)).toBe(true);
      const first = await call('post', path, body), again = await post(path, body);
      expect(again.status, JSON.stringify(again.body)).toBe(201); expect(again.body.data.appliedVersion).toBe(first.appliedVersion);
      expect(first.appliedVersion).toBe(2); expect((await get(one.id)).version).toBe(2);
      expect((await item(one)).firstAnswer.text).toBe('同一原命令仅一次');
      await call('post', path, { ...body, requestKey: randomUUID(), text: '另一页面的旧版本' }, owner, 409);
    } finally { await second.close(); }
  });
  it('requires formal teacher assignment for learner records and removes access immediately after actual assignment revocation', async () => {
    const teacher = await call('post', '/auth/register', { principal: 'paper-teacher-' + randomUUID(), credential: 'Synthetic-paper-only-20261026' }, null);
    await store.transaction(() => { store.find('users', { id: teacher.user.id }).role = 'teacher'; });
    const row = store.paperPracticeSessions.find((value: any) => value.ownerUserId === learner.user.id);
    await call('get', '/library/practice/sessions/' + row.id, undefined, teacher, 403);
    const assignment = await call('post', '/students/' + child + '/reviewers', { principal: teacher.user.principal });
    expect((await get(row.id, teacher)).permissions.edit).toBe(false);
    await command(row, { kind: 'pause' }, teacher, 403);
    await call('post', '/students/' + child + '/reviewers/' + assignment.id + '/revoke', {});
    await call('get', '/library/practice/sessions/' + row.id, undefined, teacher, 403);
  });
  it('blocks a missing original figure without hiding another valid question and restores it only after the actual file returns', async () => {
    const row = await begin(), source = join(root, 'assets/shijuanbao/media/figure.png'), held = source + '.held';
    let createdWithGap: any;
    renameSync(source, held);
    try {
      expect((await item(row, 1)).availability.available).toBe(false); expect((await item(row, 1)).html).toBe('');
      expect((await item(row, 0)).availability.available).toBe(true);
      await command(row, { kind: 'submit', itemId: row.items[1].id, disposition: 'answered', text: '缺图不能继续' }, owner, 409);
      createdWithGap = await begin(); expect((await item(createdWithGap, 1)).availability.available).toBe(false);
    } finally { renameSync(held, source); }
    expect((await item(row, 1)).availability.available).toBe(true);
    expect((await item(createdWithGap, 1)).html).toContain('/api/library/media?');
  });
  it('rejects a changed original fingerprint after preview and makes old content unavailable while preserving submitted text', async () => {
    let row = await begin([{ paperId: 'p:partial' }]); row = (await command(row, { kind: 'submit', itemId: row.items[0].id, disposition: 'answered', text: '原件变化前的个人作答' })).session;
    const selection = [{ paperId: 'p:partial' }], preview = await call('post', '/library/practice/preview', { selection });
    const db = new DatabaseSync(join(root, 'assets/catalog.sqlite3')), original = (db.prepare('SELECT detail_sha256 FROM papers WHERE id=?').get('p:partial') as any).detail_sha256;
    db.prepare('UPDATE papers SET detail_sha256=? WHERE id=?').run('f'.repeat(64), 'p:partial');
    try {
      await call('post', '/library/practice/sessions', { selection, sourceHash: preview.sourceHash, requestKey: randomUUID() }, owner, 409);
      const changed = await item(row); expect(changed.availability.available).toBe(false); expect(changed.html).toBe(''); expect(changed.firstAnswer.text).toBe('原件变化前的个人作答');
    } finally { db.prepare('UPDATE papers SET detail_sha256=? WHERE id=?').run(original, 'p:partial'); db.close(); }
  });
  it('exports a shared child learner record and only the requesting guardian private practice, including the matching command facts', async () => {
    await store.transaction(() => { store.append('bindings', { id: 'paper-shared-binding-' + randomUUID(), parentUserId: other.user.id, studentId: child, relation: 'guardian', status: 'active' }); });
    const accessVersion = await store.requestContext(() => store.find('studentLearningAccess', { studentId: child }).version);
    const grant = await call('post', '/students/' + child + '/learning-access', { enabled: true, expectedVersion: accessVersion, requestKey: randomUUID(), reason: '核对共同监护人导出隔离' });
    const issued = await call('post', '/students/' + child + '/learning-access/codes', { expectedVersion: grant.version, requestKey: randomUUID() });
    const currentLearner = await call('post', '/auth/learning-code', { code: issued.code }, null);
    const mine = await begin([{ paperId: 'p:partial' }], child), theirs = await begin([{ paperId: 'p:partial' }], child, other), shared = await begin([{ paperId: 'p:partial' }], child, currentLearner);
    await command(mine, { kind: 'draft', itemId: mine.items[0].id, text: '第一监护人的私人陪练文字' });
    await command(theirs, { kind: 'draft', itemId: theirs.items[0].id, text: '第二监护人的私人陪练文字' }, other);
    await command(shared, { kind: 'submit', itemId: shared.items[0].id, disposition: 'answered', text: '孩子共享的真实首答' }, currentLearner);
    await call('get', '/library/practice/sessions/' + theirs.id, undefined, owner, 403);
    for (const [actor, own, hidden, hiddenText] of [[owner, mine, theirs, '第二监护人的私人陪练文字'], [other, theirs, mine, '第一监护人的私人陪练文字']]) {
      const exported = await call('post', '/privacy/students/' + child + '/export', { credential: 'Synthetic-paper-only-20261026', requestKey: randomUUID() }, actor);
      const records = exported.students[0].records, sessions = records.paperPracticeSessions.map((record: any) => record.id);
      expect(sessions).toContain(own.id); expect(sessions).toContain(shared.id); expect(sessions).not.toContain(hidden.id);
      const commandSessions = records.paperPracticeCommands.map((record: any) => record.sessionId);
      expect(commandSessions).toContain(own.id); expect(commandSessions).toContain(shared.id); expect(commandSessions).not.toContain(hidden.id);
      expect(JSON.stringify(exported)).not.toContain(hiddenText); expect(JSON.stringify(exported)).toContain('孩子共享的真实首答');
    }
  });
});
