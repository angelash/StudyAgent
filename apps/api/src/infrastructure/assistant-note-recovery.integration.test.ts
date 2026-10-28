import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import request from 'supertest';

const connection = process.env.STUDY_TEST_ASSISTANT_NOTE_RECOVERY_POSTGRES_URL;
const envNames = ['NODE_ENV', 'DATABASE_URL', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'XIAOJIU_CHAT_ENABLED'];
for (const engine of ['sqlite', 'postgres'] as const) describe.skipIf(engine === 'postgres' && !connection)(engine + ' native private-note recovery and latest deletion ledger', () => {
  it('retains complete confirmed sources and original receipts, then removes private author and child notes from an older backup', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-note-native-')), previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
    const root = resolve(__dirname, '../../../..'), sqlite = require(join(root, 'scripts/operations/backup.cjs'));
    const postgres = require(join(root, 'scripts/operations/postgres-backup.cjs')), ledger = require(join(root, 'scripts/operations/privacy-ledger.cjs'));
    const load = (name: string) => require('../../dist/apps/api/src/' + name + '.js'), databases: string[] = [], providers: any[] = [];
    let app: any, store: any, admin: Pool | undefined;
    async function database() {
      if (engine === 'sqlite') return '';
      if (!connection || !process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw Error('Owned native note PostgreSQL settings required');
      const source = new URL(connection), control = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL);
      expect(source.hostname).toBe('127.0.0.1'); expect(source.pathname).toBe('/study_agent_qa'); expect(control.hostname).toBe(source.hostname); expect(control.port).toBe(source.port);
      if (!admin) { admin = new Pool({ connectionString: control.toString() }); expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin'); }
      const name = 'study_qa_note_native_' + randomUUID().replace(/-/g, ''); await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
      source.pathname = '/' + name; return source.toString();
    }
    async function boot(url: string, data: string) {
      Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: url, STUDY_STORAGE: engine, STUDY_DATA_DIR: data, STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
      app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
      const model = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
      for (const method of ['reply', 'structured']) providers.push(vi.spyOn(model, method).mockRejectedValue(Error('Native notes must not call a model')));
    }
    async function close() { await app?.close(); app = undefined; }
    async function call(method: 'get' | 'post', path: string, body?: unknown, actor?: any, expected = method === 'post' ? 201 : 200) {
      let q = request(app.getHttpServer())[method]('/api' + path); if (actor) q = q.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined) q = q.send(body as object);
      const response = await q; expect(response.status, path + ': ' + JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
    }
    async function register() { const principal = 'note-native-' + randomUUID() + '@local.test', credential = 'Synthetic-note-' + randomUUID(); return { ...await call('post', '/auth/register', { principal, credential }), principal, credential }; }
    const login = async (actor: any) => ({ ...actor, ...await call('post', '/auth/login', { principal: actor.principal, credential: actor.credential }) });
    async function note(actor: any, session: any) {
      const message = { id: randomUUID(), sessionId: session.id, sender: 'assistant', content: '|范围|条件|\n|---|---|\n|完整原文|匿名观察|\n$a+b$\n```js\nconsole.log("不执行");\n```', modelId: 'saved-original-model', createdAt: new Date().toISOString() };
      await store.transaction(() => store.append('assistantMessages', message));
      const input = { kind: 'verbatim_note', objective: '原文、来源与编辑稿分别保留', selection: { messageIds: [message.id], includeLinkedQuestions: false } };
      const preview = await call('post', '/ai/assistant/sessions/' + session.id + '/artifacts/preflight', input, actor, 200), base = '/ai/assistant/sessions/' + session.id + '/artifacts/notes';
      const create = { ...input, title: '匿名完整私人笔记', preflightFingerprint: preview.fingerprint, requestKey: randomUUID() }, receipt = await call('post', base, create, actor);
      const current = await call('get', base + '/' + receipt.noteId, undefined, actor), confirm = { expectedRevision: current.revision, contentFingerprint: current.contentFingerprint, acknowledgeReview: true, requestKey: randomUUID() };
      const adopted = await call('post', base + '/' + current.id + '/confirm', confirm, actor);
      return { base, create, confirm, created: receipt, adopted, view: await call('get', base + '/' + current.id, undefined, actor) };
    }
    const snapshot = async (url: string, data: string, destination: string) => engine === 'sqlite' ? sqlite.createBundle({ dataDir: data, destination })
      : postgres.createPostgresBundle({ connectionString: url, pgBin: process.env.STUDY_TEST_PG_BIN, dataDir: data, destination });
    const restore = async (bundle: string, url: string, destination: string, deletionLedger?: string) => engine === 'sqlite' ? sqlite.restoreBundle({ bundle, destination, deletionLedger })
      : postgres.restorePostgresBundle({ bundle, connectionString: url, pgBin: process.env.STUDY_TEST_PG_BIN, destination, deletionLedger });
    const exportLedger = (url: string, dataDir: string, destination: string) => ledger.exportLedger({ ...(engine === 'postgres' ? { connectionString: url } : { dataDir }), destination });
    try {
      const source = await database(), sourceRoot = join(directory, 'source'); await boot(source, sourceRoot); let owner = await register(), other = await register();
      const child = (await call('post', '/students', { nickname: '匿名保留档案', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } }, owner)).profile;
      const definitions = load('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum(), course = load('modules/learning/chemistry-course').buildChemistryCourse(child.id, definitions.map((d: any) => d.atom));
      await store.transaction(() => { definitions.forEach((d: any) => store.append('knowledgeAtoms', d.atom)); store.append('studioCourses', course); store.append('bindings', { id: randomUUID(), parentUserId: other.user.id, studentId: child.id, status: 'active', createdAt: new Date().toISOString() }); });
      const descriptor = await call('get', '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'primary_unit', courseId: course.id, itemId: course.units[0].id }), undefined, owner);
      const childSession = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: child.id, subject: 'chemistry', pageContext: 'course', contextRefType: descriptor.kind, contextRefId: descriptor.referenceId, contextItemId: descriptor.itemId, contextSelection: descriptor.selection }, owner);
      const childNote = await note(owner, childSession), ownSession = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' }, owner), adultNote = await note(owner, ownSession);
      const otherSession = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' }, other), retained = await note(other, otherSession);
      const portable = load('modules/privacy/privacy-records');
      const exported = await store.requestContext(() => portable.portableRecords(portable.studentRecords(store, child.id), other.user.id));
      expect(exported.assistantArtifactDrafts).toEqual([]); // The other guardian can manage the child, not read the author's private notes.
      const bundle = join(directory, 'original-bundle'); await close(); await snapshot(source, sourceRoot, bundle);
      const first = await database(), firstRoot = join(directory, 'first'); await restore(bundle, first, firstRoot); await boot(first, firstRoot);
      await call('get', '/auth/me', undefined, owner, 401); owner = await login(owner); other = await login(other);
      for (const original of [childNote, adultNote]) {
        expect(await call('get', original.base + '/' + original.view.id, undefined, owner)).toEqual(original.view);
        expect(await call('get', original.base + '/requests/' + original.create.requestKey, undefined, owner)).toEqual(original.created);
        expect(await call('post', original.base + '/' + original.view.id + '/confirm', original.confirm, owner)).toEqual(original.adopted);
      }
      const preview = await call('get', '/privacy/account/deletion-preview', undefined, owner); expect(preview.retainedChildren.map((c: any) => c.id)).toContain(child.id);
      await call('post', '/privacy/account/delete', { credential: owner.credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() }, owner);
      expect(await store.requestContext(() => store.select('assistantArtifactDrafts', { ownerUserId: owner.user.id }).length)).toBe(0);
      expect(await call('get', retained.base + '/' + retained.view.id, undefined, other)).toEqual(retained.view);
      const accountLedger = join(directory, 'account-ledger.json'); await exportLedger(first, firstRoot, accountLedger); await close();
      const second = await database(), secondRoot = join(directory, 'second'); await restore(bundle, second, secondRoot, accountLedger); await boot(second, secondRoot); other = await login(other);
      expect(await store.requestContext(() => store.select('assistantArtifactDrafts', { ownerUserId: owner.user.id }).length)).toBe(0);
      expect(await store.requestContext(() => store.find('students', { id: child.id }).grade)).toBe(4);
      expect(await call('get', retained.base + '/' + retained.view.id, undefined, other)).toEqual(retained.view);
      await call('get', childNote.base + '/' + childNote.view.id, undefined, other, 404);
      const childPreview = await call('get', '/privacy/students/' + child.id + '/deletion-preview', undefined, other);
      await call('post', '/privacy/students/' + child.id + '/delete', { credential: other.credential, confirmation: childPreview.confirmation, fingerprint: childPreview.fingerprint, requestKey: randomUUID() }, other);
      const combined = join(directory, 'combined-ledger.json'); await exportLedger(second, secondRoot, combined); await close();
      const third = await database(), thirdRoot = join(directory, 'third'); await restore(bundle, third, thirdRoot, combined); await boot(third, thirdRoot); other = await login(other);
      expect(await store.requestContext(() => store.select('assistantArtifactDrafts', { studentId: child.id }).length)).toBe(0);
      expect(await store.requestContext(() => store.select('assistantArtifactDrafts', { ownerUserId: owner.user.id }).length)).toBe(0);
      expect(await call('get', retained.base + '/' + retained.view.id, undefined, other)).toEqual(retained.view);
      for (const provider of providers) expect(provider).not.toHaveBeenCalled();
    } finally {
      await close(); vi.restoreAllMocks();
      if (admin) { for (const name of databases) { if (!/^study_qa_note_native_[a-f0-9]{32}$/.test(name)) throw Error('Unsafe owned note database'); await admin.query('DROP DATABASE "' + name + '"'); } await admin.end(); }
      for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
      if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.split(/[\\/]/).at(-1)!.startsWith('study-note-native-')) throw Error('Unsafe note native path'); rmSync(directory, { recursive: true, force: true });
    }
  }, 120000);
});
