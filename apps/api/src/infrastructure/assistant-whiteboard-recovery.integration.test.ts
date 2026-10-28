import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import request from 'supertest';

const connection = process.env.STUDY_TEST_ASSISTANT_WHITEBOARD_RECOVERY_POSTGRES_URL;
const envNames = ['NODE_ENV', 'DATABASE_URL', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'XIAOJIU_CHAT_ENABLED'];
for (const engine of ['sqlite', 'postgres'] as const) describe.skipIf(engine === 'postgres' && !connection)(engine + ' native private source-whiteboard integrity and deletion recovery', () => {
  it('rejects damaged native sources, restores frozen receipts and teaching, then applies current author/child deletion ledgers to the original backup', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-source-board-native-')), previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
    const root = resolve(__dirname, '../../../..'), sqlite = require(join(root, 'scripts/operations/backup.cjs'));
    const postgres = require(join(root, 'scripts/operations/postgres-backup.cjs')), ledger = require(join(root, 'scripts/operations/privacy-ledger.cjs'));
    const load = (name: string) => require('../../dist/apps/api/src/' + name + '.js'), databases: string[] = [];
    const base = '/learning/studio/topic-whiteboards', sourceBase = (id: string) => '/ai/assistant/sessions/' + id + '/artifacts/whiteboards';
    let app: any, store: any, worker: any, admin: Pool | undefined, ip = 0, providerCalls = 0;
    async function database() {
      if (engine === 'sqlite') return '';
      if (!connection || !process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw Error('Owned native source PostgreSQL settings required');
      const source = new URL(connection), control = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL);
      expect(source.hostname).toBe('127.0.0.1'); expect(source.pathname).toBe('/study_agent_qa'); expect(control.hostname).toBe(source.hostname); expect(control.port).toBe(source.port);
      if (!admin) { admin = new Pool({ connectionString: control.toString() }); expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin'); }
      const name = 'study_qa_source_native_' + randomUUID().replace(/-/g, ''); await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
      source.pathname = '/' + name; return source.toString();
    }
    async function boot(url: string, data: string) {
      Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: url, STUDY_STORAGE: engine, STUDY_DATA_DIR: data, STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
      app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
      worker = app.get(load('modules/learning/topic-whiteboard-worker.service').TopicWhiteboardWorkerService);
      const model = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
      vi.spyOn(model, 'enabled', 'get').mockReturnValue(true);
      vi.spyOn(model, 'reply').mockRejectedValue(Error('No live model in native recovery'));
      vi.spyOn(model, 'structured').mockImplementation(async (input: any, _schema: any, check: any) => {
        providerCalls++; const context = JSON.parse(input.context), reviewing = JSON.parse(input.message).stage === 'reviewing';
        const content = { title: '核查完整条件', description: '保留匿名来源和检查依据。', scenes: ['比较整体', '解释单位', '独立检查'].map((title, index) => ({
          kind: index === 0 ? 'title' : index === 2 ? 'check' : 'concept', title, narration: title + '，先说明条件，再比较依据。', body: '先说明条件，再比较依据。', bullets: [title], targetAtomIds: [], exhibit: null,
          sourceMap: { messageIds: [context.origin.messages[0].id], referenceKeys: [], status: 'sourced', explanation: '由所选原问题整理，尚不代表知识掌握。' },
        })) };
        return { ...check(reviewing ? { decision: 'pass', issues: [], revisedContent: null } : content), modelId: input.modelId, modelName: '受控恢复模型' };
      });
    }
    async function close() { await app?.close(); app = undefined; vi.restoreAllMocks(); }
    async function call(method: 'get' | 'post', path: string, body?: unknown, actor?: any, expected = method === 'post' ? 201 : 200) {
      let q = request(app.getHttpServer())[method]('/api' + path); if (actor) q = q.set('Authorization', 'Bearer ' + actor.token);
      if (path === '/auth/register') q = q.set('X-Forwarded-For', '198.18.80.' + (++ip)); if (body !== undefined) q = q.send(body as object);
      const response = await q; expect(response.status, path + ': ' + JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
    }
    async function register() { const principal = 'source-native-' + randomUUID() + '@local.test', credential = 'Synthetic-source-' + randomUUID(); return { ...await call('post', '/auth/register', { principal, credential }), principal, credential }; }
    const login = async (actor: any) => ({ ...actor, ...await call('post', '/auth/login', { principal: actor.principal, credential: actor.credential }) });
    async function whiteboard(actor: any, session: any) {
      const message = { id: randomUUID(), sessionId: session.id, sender: 'assistant', content: '|范围|条件|\n|---|---|\n|完整原文|匿名观察|\n$a+b$\n```js\nconsole.log("只作原文，不执行");\n```', modelId: 'saved-original-model', createdAt: new Date().toISOString() };
      await store.transaction(() => store.append('assistantMessages', message));
      const input = { objective: '从完整原文提炼条件并保留检查依据', selection: { messageIds: [message.id], includeLinkedQuestions: false }, modelId: 'deepseek-v4-flash', acknowledgeHistoricalSource: false };
      const path = sourceBase(session.id), preview = await call('post', path + '/preflight', input, actor, 200);
      const create = { ...input, preflightFingerprint: preview.fingerprint, requestKey: randomUUID() }, receipt = await call('post', path, create, actor);
      expect(await worker.runNext()).toBe(true); const current = await call('get', base + '/drafts/' + receipt.id, undefined, actor);
      expect(current.status).toBe('ready'); const confirm = { expectedRevision: current.revision, contentFingerprint: current.contentFingerprint, acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: false, requestKey: randomUUID() };
      const adopted = await call('post', base + '/drafts/' + current.id + '/confirm', confirm, actor);
      return { path, create, confirm, receipt, adopted, view: await call('get', base + '/drafts/' + current.id, undefined, actor),
        source: await call('get', base + '/drafts/' + current.id + '/source', undefined, actor), published: await call('get', base + '/' + adopted.whiteboardId, undefined, actor) };
    }
    const snapshot = async (url: string, data: string, destination: string) => engine === 'sqlite' ? sqlite.createBundle({ dataDir: data, destination })
      : postgres.createPostgresBundle({ connectionString: url, pgBin: process.env.STUDY_TEST_PG_BIN, dataDir: data, destination });
    const restore = async (bundle: string, url: string, destination: string, deletionLedger?: string) => engine === 'sqlite' ? sqlite.restoreBundle({ bundle, destination, deletionLedger })
      : postgres.restorePostgresBundle({ bundle, connectionString: url, pgBin: process.env.STUDY_TEST_PG_BIN, destination, deletionLedger });
    const exportLedger = (url: string, dataDir: string, destination: string) => ledger.exportLedger({ ...(engine === 'postgres' ? { connectionString: url } : { dataDir }), destination });
    async function rawUpdate(url: string, data: string, collection: string, id: string, value: any) {
      if (engine === 'sqlite') { const db = new DatabaseSync(join(data, 'study-agent.sqlite3')); try { db.prepare('UPDATE domain_records SET body=? WHERE collection=? AND record_id=?').run(JSON.stringify(value), collection, id); } finally { db.close(); } }
      else { const db = new Pool({ connectionString: url }); try { await db.query('UPDATE domain_records SET body=$1::jsonb WHERE collection=$2 AND record_id=$3', [JSON.stringify(value), collection, id]); } finally { await db.end(); } }
    }
    async function dump(url: string, file: string) {
      const { connectionEnvironment } = require(join(root, 'scripts/operations/postgres-restore-import.cjs'));
      await new Promise<void>((yes, no) => {
        const child = spawn(join(process.env.STUDY_TEST_PG_BIN!, 'pg_dump' + (process.platform === 'win32' ? '.exe' : '')), ['--format=custom', '--no-owner', '--no-acl', '--exclude-table=*.study_restore_guard', '--exclude-schema=study_restore_runtime', '--file=' + file],
          { windowsHide: true, stdio: 'ignore', env: { ...process.env, ...connectionEnvironment(url) } });
        child.once('error', no); child.once('exit', code => code === 0 ? yes() : no(Error('Owned malformed dump failed')));
      });
    }
    try {
      const source = await database(), sourceRoot = join(directory, 'source'); await boot(source, sourceRoot); let owner = await register(), other = await register();
      const child = (await call('post', '/students', { nickname: '匿名保留档案', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } }, owner)).profile;
      const definitions = load('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum(), course = load('modules/learning/chemistry-course').buildChemistryCourse(child.id, definitions.map((d: any) => d.atom));
      await store.transaction(() => { definitions.forEach((d: any) => store.append('knowledgeAtoms', d.atom)); store.append('studioCourses', course); store.append('bindings', { id: randomUUID(), parentUserId: other.user.id, studentId: child.id, status: 'active', createdAt: new Date().toISOString() }); });
      const descriptor = await call('get', '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'primary_unit', courseId: course.id, itemId: course.units[0].id }), undefined, owner);
      const session = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: child.id, subject: 'chemistry', pageContext: 'course', contextRefType: descriptor.kind, contextRefId: descriptor.referenceId, contextItemId: descriptor.itemId, contextSelection: descriptor.selection }, owner);
      const childBoard = await whiteboard(owner, session), ownSession = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' }, owner), adultBoard = await whiteboard(owner, ownSession);
      const otherSession = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' }, other), retained = await whiteboard(other, otherSession);
      const original = await store.requestContext(() => ({ draft: structuredClone(store.find('studioTopicWhiteboardDrafts', { id: childBoard.view.id })), board: structuredClone(store.find('studioTopicWhiteboards', { id: childBoard.adopted.whiteboardId })) }));
      expect(providerCalls).toBe(6); const bundle = join(directory, 'original-bundle'); await close(); await snapshot(source, sourceRoot, bundle);
      // Recomputed manifests prove byte integrity, not valid source ownership/protocol.
      for (const variant of ['unknown-protocol', 'cross-owner', 'missing-private', 'changed-content']) {
        const collection = variant === 'unknown-protocol' || variant === 'changed-content' ? 'studioTopicWhiteboardDrafts' : 'studioTopicWhiteboards';
        const before = collection === 'studioTopicWhiteboardDrafts' ? original.draft : original.board, changed = structuredClone(before);
        if (variant === 'unknown-protocol') changed.prepared.version = 'assistant-topic-whiteboard-v999';
        if (variant === 'cross-owner') changed.ownerUserId = other.user.id;
        if (variant === 'missing-private') delete changed.privateToCreator;
        if (variant === 'changed-content') changed.content.scenes[0].narration += '损坏来源。';
        await rawUpdate(source, sourceRoot, collection, before.id, changed);
        try {
          const Reader = load('infrastructure/domain-database').DomainDatabase, reader = new Reader(engine === 'sqlite' ? join(sourceRoot, 'study-agent.sqlite3') : source);
          await expect(reader.open()).rejects.toThrow('assistant_whiteboard_saved_integrity_failed'); await reader.close();
          await expect(snapshot(source, sourceRoot, join(directory, 'rejected-backup-' + variant))).rejects.toThrow('assistant_whiteboard_saved_integrity_failed');
          const damaged = join(directory, 'damaged-' + variant); cpSync(bundle, damaged, { recursive: true, errorOnExist: true, force: false });
          const manifestPath = join(damaged, 'manifest.json'), manifest = JSON.parse(readFileSync(manifestPath, 'utf8')), entry = manifest.files.find((f: any) => f.path.startsWith('database/'));
          const archive = join(damaged, entry.path);
          if (engine === 'sqlite') { const db = new DatabaseSync(archive); try { db.prepare('UPDATE domain_records SET body=? WHERE collection=? AND record_id=?').run(JSON.stringify(changed), collection, before.id); } finally { db.close(); } }
          else await dump(source, archive);
          const bytes = readFileSync(archive); entry.size = bytes.length; entry.sha256 = createHash('sha256').update(bytes).digest('hex'); writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
          if (engine === 'postgres') expect((await postgres.verifyPostgresBundle({ bundle: damaged, pgBin: process.env.STUDY_TEST_PG_BIN })).verifiedFiles).toBeGreaterThan(0);
          const target = await database(), targetRoot = join(directory, 'rejected-restore-' + variant);
          await expect(restore(damaged, target, targetRoot)).rejects.toThrow('assistant_whiteboard_saved_integrity_failed');
          const blocked = new Reader(engine === 'sqlite' ? join(targetRoot, 'study-agent.sqlite3') : target);
          if (existsSync(targetRoot)) { await expect(blocked.open()).rejects.toThrow('Database restoration is incomplete'); await blocked.close(); }
        } finally { await rawUpdate(source, sourceRoot, collection, before.id, before); }
      }
      const first = await database(), firstRoot = join(directory, 'first'); await restore(bundle, first, firstRoot); await boot(first, firstRoot);
      await call('get', '/auth/me', undefined, owner, 401); owner = await login(owner); other = await login(other);
      for (const original of [childBoard, adultBoard]) {
        expect(await call('get', base + '/drafts/' + original.view.id, undefined, owner)).toEqual(original.view);
        expect(await call('get', base + '/drafts/' + original.view.id + '/source', undefined, owner)).toEqual(original.source);
        expect(await call('get', base + '/' + original.adopted.whiteboardId, undefined, owner)).toEqual(original.published);
        const receipt = await call('get', original.path + '/requests/' + original.create.requestKey, undefined, owner); expect(receipt.id).toBe(original.view.id); expect(receipt.receipt).toEqual(original.receipt.receipt);
        expect(await call('post', base + '/drafts/' + original.view.id + '/confirm', original.confirm, owner)).toEqual(original.adopted);
      }
      await call('get', base + '/' + childBoard.adopted.whiteboardId, undefined, other, 404);
      const preview = await call('get', '/privacy/account/deletion-preview', undefined, owner); expect(preview.retainedChildren.map((c: any) => c.id)).toContain(child.id);
      await call('post', '/privacy/account/delete', { credential: owner.credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() }, owner);
      expect(await store.requestContext(() => store.select('studioTopicWhiteboards', { ownerUserId: owner.user.id }).length)).toBe(0);
      const accountLedger = join(directory, 'account-ledger.json'); await exportLedger(first, firstRoot, accountLedger); await close();
      const second = await database(), secondRoot = join(directory, 'second'); await restore(bundle, second, secondRoot, accountLedger); await boot(second, secondRoot); other = await login(other);
      expect(await store.requestContext(() => store.select('studioTopicWhiteboardDrafts', { ownerUserId: owner.user.id }).length)).toBe(0);
      expect(await store.requestContext(() => store.select('studioTopicWhiteboards', { ownerUserId: owner.user.id }).length)).toBe(0);
      expect(await store.requestContext(() => store.find('students', { id: child.id }).grade)).toBe(4);
      expect(await call('get', base + '/' + retained.adopted.whiteboardId, undefined, other)).toEqual(retained.published);
      const childPreview = await call('get', '/privacy/students/' + child.id + '/deletion-preview', undefined, other);
      await call('post', '/privacy/students/' + child.id + '/delete', { credential: other.credential, confirmation: childPreview.confirmation, fingerprint: childPreview.fingerprint, requestKey: randomUUID() }, other);
      const combined = join(directory, 'combined-ledger.json'); await exportLedger(second, secondRoot, combined); await close();
      const third = await database(), thirdRoot = join(directory, 'third'); await restore(bundle, third, thirdRoot, combined); await boot(third, thirdRoot); other = await login(other);
      for (const collection of ['studioTopicWhiteboardDrafts', 'studioTopicWhiteboards']) {
        expect(await store.requestContext(() => store.select(collection, { studentId: child.id }).length)).toBe(0);
        expect(await store.requestContext(() => store.select(collection, { ownerUserId: owner.user.id }).length)).toBe(0);
      }
      expect(await call('get', base + '/' + retained.adopted.whiteboardId, undefined, other)).toEqual(retained.published); expect(providerCalls).toBe(6);
    } finally {
      await close();
      if (admin) { for (const name of databases) { if (!/^study_qa_source_native_[a-f0-9]{32}$/.test(name)) throw Error('Unsafe owned source database'); await admin.query('DROP DATABASE "' + name + '"'); } await admin.end(); }
      for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
      if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.split(/[\\/]/).at(-1)!.startsWith('study-source-board-native-')) throw Error('Unsafe source native path'); rmSync(directory, { recursive: true, force: true });
    }
  }, 120000);
});
