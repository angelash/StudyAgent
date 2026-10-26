import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import request from 'supertest';

const location = process.env.STUDY_TEST_TOPIC_WHITEBOARD_RECOVERY_POSTGRES_URL;
const names = ['NODE_ENV', 'DATABASE_URL', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'XIAOJIU_CHAT_ENABLED'] as const;
const base = '/learning/studio/topic-whiteboards';
const input = { audience: { kind: 'adult' }, prompt: '比较匿名观察和适用条件', objective: '保留条件和反例再判断', modelId: 'deepseek-v4-flash' };

async function fixture() {
  if (!location || !process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw Error('Dedicated topic recovery QA settings required');
  const source = new URL(location), adminLocation = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL);
  if (source.pathname !== '/study_agent_qa' || !['127.0.0.1', 'localhost'].includes(source.hostname) || source.hostname !== adminLocation.hostname || source.port !== adminLocation.port)
    throw Error('Expected isolated topic QA database');
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]])), directory = mkdtempSync(join(tmpdir(), 'study-topic-pg-recovery-'));
  const root = resolve(__dirname, '../../../..'), backup = require(join(root, 'scripts/operations/postgres-backup.cjs'));
  const ledger = require(join(root, 'scripts/operations/privacy-ledger.cjs')), admin = new Pool({ connectionString: adminLocation.toString() });
  expect((await admin.query('SELECT current_user AS name')).rows[0].name).toBe('study_qa_admin');
  const databases: string[] = [], load = (name: string) => require('../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, worker: any, chat: any; const calls: string[] = [];
  async function database() {
    const name = 'study_qa_topic_recovery_' + randomUUID().replace(/-/g, '');
    await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
    const url = new URL(location!); url.pathname = '/' + name; return url.toString();
  }
  function output(context: any) {
    return { title: '完整匿名教学稿', description: '比较条件，保留观察范围。', scenes: ['先观察', '再比较', '留反例'].map((title, index) => ({
      kind: index === 0 ? 'title' : index === 2 ? 'check' : 'concept', title, narration: title + '，先核对完整条件。', body: '原稿内容保持完整。',
      bullets: [title], targetAtomIds: context.targets.map((target: any) => target.id), exhibit: null,
    })) };
  }
  async function boot(url: string, data: string) {
    Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: url, STUDY_STORAGE: 'postgres', STUDY_DATA_DIR: data,
      STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    worker = app.get(load('modules/learning/topic-whiteboard-worker.service').TopicWhiteboardWorkerService);
    chat = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
    vi.spyOn(chat, 'enabled', 'get').mockReturnValue(true);
    vi.spyOn(chat, 'structured').mockImplementation(async (request: any, _schema: any, check: any) => {
      const stage = JSON.parse(request.message).stage; calls.push(stage);
      return { ...check(stage === 'writing' ? output(JSON.parse(request.context)) : { decision: 'pass', issues: [], revisedContent: null }),
        modelId: request.modelId, modelName: 'Controlled native recovery model' };
    });
  }
  async function close() { if (worker) await worker.onModuleDestroy(); await app?.close(); app = undefined; worker = undefined; }
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor?: any, status = method === 'post' ? 201 : 200) {
    const q = request(app.getHttpServer())[method]('/api' + path); if (actor) q.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined) q.send(body as object);
    const response = await q; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  async function register() {
    const principal = 'topic-native-' + randomUUID() + '@local.test', credential = 'Native-topic-' + randomUUID();
    return { ...await call('post', '/auth/register', { principal, credential }), credential, principal };
  }
  async function login(actor: any) { return { ...await call('post', '/auth/login', { principal: actor.principal, credential: actor.credential }), credential: actor.credential, principal: actor.principal }; }
  async function prepare(actor: any, selection: any = input) {
    const preview = await call('post', base + '/preflight', selection, actor), command = { ...selection, preflightFingerprint: preview.fingerprint, requestKey: randomUUID() };
    return { command, view: await call('post', base + '/drafts', command, actor) };
  }
  async function publish(actor: any, selection: any = input) {
    const queued = await prepare(actor, selection); await worker.runNext(); const row = await call('get', base + '/drafts/' + queued.view.id, undefined, actor);
    const saved = await call('post', base + '/drafts/' + row.id + '/confirm', { expectedRevision: row.revision, contentFingerprint: row.contentFingerprint,
      acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: false, requestKey: randomUUID() }, actor);
    return { row, board: await call('get', base + '/' + saved.whiteboardId, undefined, actor) };
  }
  const snapshot = (url: string, data: string, destination: string) => backup.createPostgresBundle({ connectionString: url, dataDir: data, destination, pgBin: process.env.STUDY_TEST_PG_BIN });
  const restore = (bundle: string, url: string, destination: string, deletionLedger?: string) => backup.restorePostgresBundle({ bundle, connectionString: url, destination, deletionLedger, pgBin: process.env.STUDY_TEST_PG_BIN });
  async function cleanup() {
    try { await close(); } finally {
      vi.restoreAllMocks();
      for (const name of databases) { if (!/^study_qa_topic_recovery_[a-f0-9]{32}$/.test(name)) throw Error('Unknown topic QA database');
        await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [name]);
        await admin.query('DROP DATABASE "' + name + '"'); }
      await admin.end(); for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
      if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !basename(directory).startsWith('study-topic-pg-recovery-')) throw Error('Unexpected native QA cleanup target');
      rmSync(directory, { recursive: true, force: true });
    }
  }
  return { directory, database, boot, close, call, register, login, prepare, publish, snapshot, restore, cleanup, ledger, calls,
    get store() { return store; }, get worker() { return worker; }, get chat() { return chat; } };
}

describe.skipIf(!location)('topic whiteboard PostgreSQL native cold recovery', () => {
  it('retains shared frozen teaching after account deletion and applies newer account/child ledgers to actual old dumps', async () => {
    const f = await fixture();
    try {
      const sourceRoot = join(f.directory, 'source'), source = await f.database(); await f.boot(source, sourceRoot);
      let owner = await f.register(), other = await f.register();
      const created = await f.call('post', '/students', { nickname: '匿名原生恢复', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } }, owner);
      const studentId = created.profile.id, atomId = 'topic-native-atom-' + randomUUID();
      await f.store.transaction(() => {
        f.store.append('bindings', { id: 'topic-native-binding-' + randomUUID(), studentId, parentUserId: other.user.id, relation: 'guardian', status: 'active' });
        f.store.append('knowledgeAtoms', { id: atomId, name: '比较条件', subject: 'math', grade: 3, term: 'both', objective: '比较之前先核对完整条件',
          successCriterion: '在新情境中独立说明条件', prerequisiteIds: [], status: 'published', version: 1, curriculumVersion: 'native-topic', strand: '合成范围' });
        f.store.append('learningScopes', { id: 'topic-native-scope-' + randomUUID(), studentId, subject: 'math', grade: 3, term: 'upper', version: 1,
          confirmedAt: new Date().toISOString(), learnedAtomIds: [atomId], minutesPerSession: 15 });
      });
      const child = await f.publish(owner, { ...input, audience: { kind: 'student', studentId, subject: 'math', atomIds: [atomId] } });
      const adult = await f.publish(owner); const privateQueued = await f.prepare(owner);
      const bundle = join(f.directory, 'bundle'); await f.snapshot(source, sourceRoot, bundle); await f.close();
      const first = await f.database(), firstRoot = join(f.directory, 'first'); await f.restore(bundle, first, firstRoot); await f.boot(first, firstRoot);
      await f.call('get', '/auth/me', undefined, owner, 401); owner = await f.login(owner); other = await f.login(other);
      expect((await f.call('get', base + '/' + child.board.id, undefined, other)).origin.draftId).toBeNull();
      const preview = await f.call('get', '/privacy/account/deletion-preview', undefined, owner);
      expect(preview.retainedChildren.map((value: any) => value.id)).toContain(studentId);
      await f.call('post', '/privacy/account/delete', { credential: owner.credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() }, owner);
      expect((await f.store.tasks.get(privateQueued.view.task.id)).state).toBe('cancelled');
      await f.call('get', base + '/' + adult.board.id, undefined, other, 404);
      const shared = await f.call('get', base + '/' + child.board.id, undefined, other); expect(shared.fingerprint).toBe(child.board.fingerprint); expect(shared.origin.draftId).toBeNull();
      const accountLedger = join(f.directory, 'account-ledger.json'); await f.ledger.exportLedger({ connectionString: first, destination: accountLedger }); await f.close();
      const second = await f.database(), secondRoot = join(f.directory, 'second'); await f.restore(bundle, second, secondRoot, accountLedger); await f.boot(second, secondRoot); other = await f.login(other);
      expect(await f.store.requestContext(() => f.store.inspect('studioTopicWhiteboardDrafts').filter((value: any) => value.ownerUserId === owner.user.id).length)).toBe(0);
      expect((await f.call('get', base + '/' + child.board.id, undefined, other)).fingerprint).toBe(child.board.fingerprint);
      await f.call('get', base + '/' + adult.board.id, undefined, other, 404);
      const childPreview = await f.call('get', '/privacy/students/' + studentId + '/deletion-preview', undefined, other);
      await f.call('post', '/privacy/students/' + studentId + '/delete', { credential: other.credential, confirmation: childPreview.confirmation, fingerprint: childPreview.fingerprint, requestKey: randomUUID() }, other);
      const combined = join(f.directory, 'combined-ledger.json'); await f.ledger.exportLedger({ connectionString: second, destination: combined }); await f.close();
      const third = await f.database(), thirdRoot = join(f.directory, 'third'); await f.restore(bundle, third, thirdRoot, combined); await f.boot(third, thirdRoot); other = await f.login(other);
      await f.call('get', base + '/' + child.board.id, undefined, other, 404);
      expect(await f.store.requestContext(() => f.store.inspect('studioTopicWhiteboards').length + f.store.inspect('studioTopicWhiteboardDrafts').length)).toBe(0);
      expect(await f.store.requestContext(() => f.store.inspect('events').some((value: any) => value.eventName === 'privacy.restore_deletions_applied'))).toBe(true);
    } finally { await f.cleanup(); }
  }, 120000);
  it('restores an interrupted review, rejects its old login and resumes only the missing review after explicit new-login retry', async () => {
    const f = await fixture();
    try {
      const source = await f.database(), sourceRoot = join(f.directory, 'source'); await f.boot(source, sourceRoot); let owner = await f.register();
      let entered!: () => void; const waiting = new Promise<void>(resolve => { entered = resolve; }), original = vi.mocked(f.chat.structured).getMockImplementation()!;
      vi.mocked(f.chat.structured).mockImplementation(async (input: any, schema: any, check: any) => {
        if (JSON.parse(input.message).stage === 'reviewing') { entered(); await new Promise((_resolve, reject) => input.signal.addEventListener('abort', () => reject(Error('Controlled stopped review')), { once: true })); }
        return original(input, schema, check);
      });
      const queued = await f.prepare(owner), running = f.worker.runNext(); await waiting;
      const checkpoint = await f.call('get', base + '/drafts/' + queued.view.id, undefined, owner); expect(checkpoint.stage).toBe('reviewing'); expect(checkpoint.originalContent).not.toBeNull();
      const bundle = join(f.directory, 'bundle'); await f.snapshot(source, sourceRoot, bundle); await f.close(); await running;
      const target = await f.database(), targetRoot = join(f.directory, 'target'); await f.restore(bundle, target, targetRoot); await f.boot(target, targetRoot);
      await f.call('get', '/auth/me', undefined, owner, 401); await f.worker.runNext(); owner = await f.login(owner);
      const failed = await f.call('get', base + '/drafts/' + queued.view.id, undefined, owner); expect(failed.status).toBe('failed'); expect(failed.generation).toBe(2);
      f.calls.length = 0;
      await f.call('post', base + '/drafts/' + failed.id + '/retry', { expectedRevision: failed.revision, generation: failed.generation, taskVersion: failed.task.version, requestKey: randomUUID() }, owner);
      await f.worker.runNext(); const ready = await f.call('get', base + '/drafts/' + failed.id, undefined, owner);
      expect(ready.status).toBe('ready'); expect(ready.generation).toBe(3); expect(ready.originalContent).toEqual(checkpoint.originalContent);
      expect(f.calls).toEqual(['reviewing']); expect(ready.modelId).toBe('deepseek-v4-flash');
    } finally { await f.cleanup(); }
  }, 120000);
});
