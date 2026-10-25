import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('authorized frozen classroom code drafts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-code-drafts-'));
  const names = ['NODE_ENV','STUDY_STORAGE','DATABASE_URL','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any, store: any, parent: any, other: any, seed: any, pg: Pool | undefined, schema: string | undefined;
  async function boot() {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js'), { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(InMemoryStoreService);
  }
  async function call(method: 'get'|'post'|'patch', path: string, body?: unknown, actor = parent, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object); return (await query.expect(status)).body.data;
  }
  beforeAll(async () => {
    let backend = 'sqlite'; const url = process.env.STUDY_TEST_CLASSROOM_CODE_POSTGRES_URL;
    if (url) { pg = new Pool({ connectionString: url }); expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa'); schema = 'study_qa_code_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"'); const scoped = new URL(url); scoped.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = scoped.toString(); backend = 'postgres'; }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: backend, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false' }); await boot();
    parent = await call('post', '/auth/register', { principal: 'code-parent@local.test', credential: 'Code-QA-only-20261025' }, null);
    other = await call('post', '/auth/register', { principal: 'code-other@local.test', credential: 'Code-QA-only-20261025' }, null);
    const opened = await call('post', '/learning/classroom/sessions', { lessonId: 'soc-1-1-1', useCurrentVersion: true });
    await store.requestContext(() => { seed = structuredClone(store.find('classroomSessions', { id: opened.id })); });
  });
  afterAll(async () => { await app?.close(); if (pg) { if (!/^study_qa_code_[a-f0-9]{32}$/.test(schema ?? '')) throw new Error('Invalid owned code QA schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); } for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } rmSync(directory, { recursive: true, force: true }); });
  async function fixture() {
    const row = structuredClone(seed); row.id = 'classroom_' + randomUUID(); row.cursor = 2; row.revealed = 3; row.sentenceCursor = 0;
    await store.transaction(() => store.append('classroomSessions', row));
    const step = row.lesson.steps[2], block = step.blocks.find((item: any) => item.kind === 'code'); expect(block).toBeDefined();
    return { row, step, block, path: '/learning/classroom/sessions/' + row.id + '/code-drafts/' + step.id + '/' + block.id };
  }
  const command = (view: any, code = 'console.log(readLine());', input = 'first\nsecond\n') => ({ code, input, baseHash: view.baseHash, expectedRevision: view.revision, requestKey: randomUUID() });

  it('projects unchanged legacy examples, saves both fields and replays lost acknowledgments', async () => {
    const f = await fixture(), initial = await call('get', f.path); expect(initial.code).toBe(f.block.code); expect(initial.revision).toBe(0);
    await store.requestContext(() => expect(store.select('classroomCodeDrafts', { sessionId: f.row.id })).toHaveLength(0));
    const input = command(initial), saved = await call('patch', f.path, input); expect(saved.revision).toBe(1); expect(saved.code).toBe(input.code); expect(saved.input).toBe(input.input);
    expect(saved).not.toHaveProperty('requests'); expect((await call('patch', f.path, input)).revision).toBe(1);
    await call('patch', f.path, { ...input, code: 'changed' }, parent, 409); await call('get', f.path, undefined, other, 403);
    await store.requestContext(() => { expect(store.find('classroomSessions', { id: f.row.id }).lesson).toEqual(f.row.lesson); expect(store.inspect('diagnosticResponses')).toHaveLength(0); });
  });
  it('rejects future blocks, missing blocks and code that has not yet been revealed', async () => {
    const f = await fixture(); await store.transaction(() => { const row = store.find('classroomSessions', { id: f.row.id }); row.cursor = 0; row.revealed = 1; });
    await call('get', f.path, undefined, parent, 409); await call('patch', f.path, { baseHash: 'a'.repeat(64), expectedRevision: 0, requestKey: randomUUID(), code: '', input: '' }, parent, 409);
    await call('get', f.path + '-missing', undefined, parent, 404);
    await store.transaction(() => { const row = store.find('classroomSessions', { id: f.row.id }); row.cursor = 2; row.revealed = 3; row.lesson.steps[2].blocks.find((item: any) => item.id === f.block.id).atSentence = 99; });
    await call('get', f.path, undefined, parent, 409);
  });
  it('keeps current versions under stale and simultaneous writes without silent replacement', async () => {
    const f = await fixture(), initial = await call('get', f.path), a = command(initial, 'console.log("A");'), b = command(initial, 'console.log("B");');
    const responses = await Promise.all([a,b].map(body => request(app.getHttpServer()).patch('/api' + f.path).set('Authorization', 'Bearer ' + parent.token).send(body)));
    expect(responses.map(response => response.status).sort()).toEqual([200,409]); const saved = await call('get', f.path); expect(saved.revision).toBe(1);
    await call('patch', f.path, command(initial, 'console.log("stale");'), parent, 409); expect((await call('get', f.path)).code).toBe(saved.code);
  });
  it('returns current content after replay of an older committed command without replacing a newer edit', async () => {
    const f = await fixture(), initial = await call('get', f.path), first = command(initial, 'console.log("first");');
    const saved = await call('patch', f.path, first), latest = await call('patch', f.path, command(saved, 'console.log("newer");'));
    expect(await call('patch', f.path, first)).toEqual(latest); expect(latest.revision).toBe(2);
  });
  it('rejects oversize and mismatched source content without truncating the saved program', async () => {
    const f = await fixture(), initial = await call('get', f.path);
    await call('patch', f.path, command(initial, 'x'.repeat(16001)), parent, 400); await call('patch', f.path, command(initial, '', 'x'.repeat(8001)), parent, 400);
    await call('patch', f.path, { ...command(initial), baseHash: 'b'.repeat(64) }, parent, 409);
    const saved = await call('patch', f.path, command(initial)); await store.transaction(() => { store.find('classroomSessions', { id: f.row.id }).lesson.steps[2].blocks.find((item: any) => item.id === f.block.id).code += '\n// Changed source'; });
    await call('get', f.path, undefined, parent, 409); await call('patch', f.path, command(saved), parent, 409);
  });
  it('retains exact code, input, source binding and requests through a database reopen', async () => {
    const f = await fixture(), initial = await call('get', f.path), input = command(initial, 'const a=readLine();\nconsole.log(a);', '一行\n\n最后一行\n');
    const saved = await call('patch', f.path, input); await app.close(); await boot(); expect(await call('get', f.path)).toEqual(saved); expect(await call('patch', f.path, input)).toEqual(saved);
    await store.requestContext(() => { const { accountRecords, portableRecords } = require('../../../dist/apps/api/src/modules/privacy/privacy-records.js'), exported = portableRecords(accountRecords(store, parent.user.id, parent.user.principal), parent.user.id).classroomCodeDrafts.find((item: any) => item.sessionId === f.row.id); expect(exported.code).toBe(input.code); expect(exported).not.toHaveProperty('requests'); expect(exported).not.toHaveProperty('baseHash'); });
  });
  it('allows an actual learner to save only their own draft, then deletes it through real child privacy deletion', async () => {
    const f = await fixture(), studentId = (await call('post', '/students', { nickname: '代码草稿验收', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '测试课堂代码草稿授权' }), code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() }), learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    await store.transaction(() => { const row = store.find('classroomSessions', { id: f.row.id }); row.ownerUserId = learner.user.id; row.studentId = studentId; });
    const initial = await call('get', f.path, undefined, learner), saved = await call('patch', f.path, command(initial), learner); expect(saved.revision).toBe(1); await call('get', f.path, undefined, parent, 403);
    const preview = await call('get', `/privacy/students/${studentId}/deletion-preview`); await call('post', `/privacy/students/${studentId}/delete`, { credential: 'Code-QA-only-20261025', confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() });
    await store.requestContext(() => expect(store.select('classroomCodeDrafts', { sessionId: f.row.id })).toHaveLength(0));
  });
  it.skipIf(Boolean(process.env.STUDY_TEST_CLASSROOM_CODE_POSTGRES_URL))('restores personal code and input from a real verified SQLite bundle without changing the lesson', async () => {
    const f = await fixture(), initial = await call('get', f.path), input = command(initial, 'console.log(readLine());', '独立备份输入\n');
    const saved = await call('patch', f.path, input), recovery = mkdtempSync(join(tmpdir(), 'study-code-backup-'));
    try {
      const backup = require('../../../../../scripts/operations/backup.cjs'); await backup.createBundle({ dataDir: directory, destination: join(recovery, 'bundle') });
      expect((await backup.verifyBundle({ bundle: join(recovery, 'bundle') })).verifiedFiles).toBe(1); await app.close();
      await backup.restoreBundle({ bundle: join(recovery, 'bundle'), destination: join(recovery, 'restored') }); process.env.STUDY_DATA_DIR = join(recovery, 'restored'); await boot();
      const logged = await call('post', '/auth/login', { principal: parent.user.principal, credential: 'Code-QA-only-20261025' }, null);
      expect(await call('get', f.path, undefined, logged)).toEqual(saved); expect(await call('patch', f.path, input, logged)).toEqual(saved);
      await store.requestContext(() => expect(store.find('classroomSessions', { id: f.row.id }).lesson).toEqual(f.row.lesson));
      await app.close(); process.env.STUDY_DATA_DIR = directory; await boot();
    } finally { rmSync(recovery, { recursive: true, force: true }); }
  });
});
