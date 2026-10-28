import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import request from 'supertest';
import type { AtomTeaching, StudioCourse } from '@study-agent/contracts';
import type { SourceCourseRecord } from '../learning/source-course-content';

const pgLocation = process.env.STUDY_TEST_COURSE_RECOVERY_POSTGRES_URL;
for (const driver of ['sqlite', 'postgres'] as const) {
  (driver === 'sqlite' || pgLocation ? describe : describe.skip)(driver + ' course teaching sources native recovery', () => {
    it('retains other guardian published teaching while latest author and child deletion ledgers erase private snapshots and references', async () => {
      const directory = mkdtempSync(join(tmpdir(), 'study-course-recovery-'));
      const names = ['NODE_ENV', 'DATABASE_URL', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'] as const;
      const prior = Object.fromEntries(names.map(n => [n, process.env[n]])), databases: string[] = [];
      const root = resolve(__dirname, '../../../../..'), bundle = join(directory, 'bundle');
      const backup = require(join(root, 'scripts/operations/' + (driver === 'sqlite' ? 'backup.cjs' : 'postgres-backup.cjs')));
      const ledger = require(join(root, 'scripts/operations/privacy-ledger.cjs'));
      let app: any, store: any, worker: any, provider: any, admin: Pool | undefined, author: any, guardian: any;
      const credential = 'Course-Recovery-QA-20261028', prefix = (id: string) => '/ai/assistant/sessions/' + id;
      async function database(path: string) {
        if (driver === 'sqlite') return join(path, 'study-agent.sqlite3');
        const name = 'study_qa_course_recovery_' + randomUUID().replace(/-/g, '');
        await admin!.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
        const url = new URL(pgLocation!); url.pathname = '/' + name; return url.toString();
      }
      async function boot(location: string, path: string) {
        Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: location, STUDY_STORAGE: driver, STUDY_DATA_DIR: path,
          STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true' });
        const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
        app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
        store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
        worker = app.get(load('modules/ai/assistant-turn-worker.service').AssistantTurnWorkerService);
        provider = vi.spyOn(app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService), 'reply').mockImplementation(async (...args: any[]) => ({
          reply: '依据所选教学先核对整体与单位，再用一个新情境说明比较条件。', evidenceIds: [],
          sourceKeys: [JSON.parse(args[0].context).course.teaching.sources[0].key], modelId: 'deepseek-v4-flash', modelName: 'Synthetic recovery' }));
      }
      async function call(method: 'get' | 'post', path: string, body?: unknown, actor = author, expected = method === 'post' ? 201 : 200) {
        let q = request(app.getHttpServer())[method]('/api' + path);
        if (actor?.token) q = q.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined) q = q.send(body as object);
        const response = await q; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
      }
      const login = (principal: string) => call('post', '/auth/login', { principal, credential }, null);
      async function restore(path: string, deletionLedger?: string) {
        const location = await database(path), options = { bundle, destination: path, connectionString: location, deletionLedger, pgBin: process.env.STUDY_TEST_PG_BIN };
        const receipt = driver === 'sqlite' ? await backup.restoreBundle(options) : await backup.restorePostgresBundle(options);
        await boot(location, path); return { location, receipt };
      }
      async function open(kind: string, courseId: string, itemId: string, actor = author) {
        const d = await call('get', '/ai/assistant/course-context?' + new URLSearchParams({ kind, courseId, itemId }), undefined, actor);
        const session = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: d.studentId, subject: d.subject, pageContext: 'course',
          contextRefType: kind, contextRefId: d.referenceId, contextItemId: itemId, contextSelection: d.selection }, actor);
        return { session, key: kind === 'primary_unit' ? 'atom-1' : 'material-1', actor };
      }
      async function ask(entry: Awaited<ReturnType<typeof open>>, run = true) {
        const c = { requestKey: randomUUID(), message: '请说明比较数量的条件。', modelId: 'deepseek-v4-flash',
          contextVersion: (await call('get', prefix(entry.session.id) + '/context', undefined, entry.actor)).contextVersion };
        const turn = await call('post', prefix(entry.session.id) + '/turns', c, entry.actor);
        if (run) { await worker.runNext(); expect((await call('get', prefix(entry.session.id) + '/turns/' + turn.id, undefined, entry.actor)).status).toBe('completed'); }
        return { c, turn };
      }
      async function exportLedger(path: string, location: string, name: string, count: number) {
        const destination = join(directory, name);
        expect((await ledger.exportLedger({ ...(driver === 'sqlite' ? { dataDir: path } : { connectionString: location }), destination })).deletions).toBe(count);
        return destination;
      }
      const teaching: AtomTeaching = { reviewStatus: 'approved', explanation: '比较数量前先核对同一整体和相同单位。',
        example: { prompt: '比较同一纸带的两部分。', steps: ['核对整体', '统一单位'], conclusion: '单位相同才可比较。' }, commonErrors: [],
        verification: { understanding: '说明整体为何不变。', procedure: '解释统一单位的步骤。', transfer: '换个情境比较。', retention: '间隔后再核对。' } };
      function primary(studentId: string): StudioCourse {
        return { id: 'primary-recovery', studentId, subject: 'math', grade: 3, term: 'upper', title: '比较数量', description: '匿名课程', objective: '核对比较条件',
          status: 'active', source: 'studyagent_curriculum', scopeVersion: 1, textbookVersion: 'fixture', focusAtomIds: ['unit'],
          units: [{ id: 'unit-1', title: '比较条件', objective: '核对整体与单位', lessons: [{ id: 'learn:unit', atomId: 'unit', title: '同一整体', objective: '解释比较条件',
            kind: 'learn', state: 'not_started', href: '/PRIVATE_ROUTE', teaching: { atomVersion: 1, teaching } }] }], materials: [], fingerprint: 'fixture',
          createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z' };
      }
      function material(id: string, studentId: string | null, published: boolean): SourceCourseRecord {
        const quote = '比较数量前先核对整体与单位。';
        return { id, ownerUserId: author.user.id, studentId, subject: studentId ? 'math' : null, audience: studentId ? 'student' : 'adult', targetGoals: [],
          input: { title: 'PRIVATE_PROMPT_' + id, goal: 'PRIVATE_PROMPT', language: 'zh-CN', minutesPerSession: 15, modelId: 'fixture', targetAtomIds: [] },
          sources: [{ key: 'page-one', materialId: 'PRIVATE_UPLOAD', page: 2, title: '公开资料', kind: 'text', text: 'PRIVATE_FULL_TEXT', blocks: [],
            sha256: 'a'.repeat(64), version: 'source-v1', fingerprint: 'fixture', structureReviewRequired: false }],
          revision: 1, status: published ? 'active' : 'ready', taskId: null, result: { title: '比较数量', overview: quote, lessons: [{ title: '比较条件', objective: '说明依据',
            introduction: '先检查整体。', concept: quote, notes: ['整体', '单位'], example: { scenario: '同一条纸带。', steps: ['统一单位'], board: ['核对条件'], conclusion: quote },
            misconception: { claim: '只比较数字。', correction: '应检查单位。', board: ['检查单位'] }, transfer: '换一个新情境。', summary: quote, takeaways: ['检查单位'],
            citations: [{ sourceKey: 'page-one', quote }], questions: [{ prompt: 'PRIVATE_QUESTION', options: ['A', 'B', 'C', 'D'], answer: 0, explanation: 'PRIVATE_ANSWER', hints: ['PRIVATE_HINT', 'PRIVATE_HINT'] }] }] },
          originalResult: null, edits: [], fingerprint: 'fixture', modelName: 'Synthetic', confirmedAt: published ? '2026-10-28T00:00:00.000Z' : null,
          createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z', requests: [],
          versioning: { familyId: id, parentCourseId: null, number: 1, state: published ? 'published' : 'draft', events: [] } };
      }
      try {
        if (driver === 'postgres') {
          const probe = new Pool({ connectionString: pgLocation });
          try { expect((await probe.query('SELECT current_database() name,current_user owner')).rows[0]).toEqual({ name: 'study_agent_qa', owner: 'study_agent_app' }); } finally { await probe.end(); }
          if (!process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw Error('Dedicated course QA native tools required');
          admin = new Pool({ connectionString: process.env.STUDY_TEST_POSTGRES_ADMIN_URL });
          expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
        }
        const source = join(directory, 'source'), sourceLocation = await database(source); await boot(sourceLocation, source);
        author = await call('post', '/auth/register', { principal: 'course-author@local.test', credential }, null);
        guardian = await call('post', '/auth/register', { principal: 'course-guardian@local.test', credential }, null);
        const studentId = (await call('post', '/students', { nickname: '匿名恢复学习者', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
        await store.transaction(() => {
          store.append('bindings', { id: store.nextId('binding'), studentId, parentUserId: guardian.user.id, status: 'active', relation: 'guardian' });
          store.append('studioCourses', primary(studentId));
          store.append('sourceCourses', material('shared-material', studentId, true), material('private-draft', studentId, false), material('private-adult', null, true));
        });
        const entries = [await open('primary_unit', 'primary-recovery', 'unit-1'), await open('material_lesson', 'shared-material', 'source:shared-material:1'),
          await open('material_lesson', 'private-draft', 'source:private-draft:1'), await open('material_lesson', 'private-adult', 'source:private-adult:1'),
          await open('primary_unit', 'primary-recovery', 'unit-1', guardian), await open('material_lesson', 'shared-material', 'source:shared-material:1', guardian)];
        const completed = []; for (const entry of entries) completed.push(await ask(entry));
        const previews = []; for (const entry of entries) previews.push(await call('get', prefix(entry.session.id) + '/sources/' + entry.key, undefined, entry.actor));
        const originalSnapshots = await store.requestContext(() => entries.map(e => structuredClone(store.find('assistantSessions', { id: e.session.id }).courseSnapshot)));
        const portable = await call('post', '/privacy/students/' + studentId + '/export', { credential, requestKey: randomUUID() });
        expect(JSON.stringify(portable)).not.toContain(entries[4].session.id);
        const records = portable.students[0].records;
        expect(JSON.stringify([records.assistantSessions, records.assistantMessages, records.aiInsights])).not.toMatch(/PRIVATE_|prepared|authorization|scopeKey/);
        const late = await ask(entries[3], false);
        const createOptions = { dataDir: source, destination: bundle, connectionString: sourceLocation, pgBin: process.env.STUDY_TEST_PG_BIN };
        if (driver === 'sqlite') await backup.createBundle(createOptions); else await backup.createPostgresBundle(createOptions);
        await app.close(); app = null; vi.restoreAllMocks();
        const target = join(directory, 'target'), restored = await restore(target);
        await call('get', '/auth/me', undefined, author, 401); author = await login('course-author@local.test'); guardian = await login('course-guardian@local.test');
        for (const [index, entry] of entries.entries()) {
          entry.actor = index < 4 ? author : guardian;
          expect(await call('get', prefix(entry.session.id) + '/sources/' + entry.key, undefined, entry.actor)).toEqual(previews[index]);
          expect((await call('post', prefix(entry.session.id) + '/messages', { requestKey: completed[index].c.requestKey, message: completed[index].c.message, modelId: completed[index].c.modelId }, entry.actor)).sourceReferences).toEqual([previews[index].reference]);
        }
        expect(await store.requestContext(() => entries.map(e => structuredClone(store.find('assistantSessions', { id: e.session.id }).courseSnapshot)))).toEqual(originalSnapshots);
        expect(provider).not.toHaveBeenCalled();
        const preview = await call('get', '/privacy/account/deletion-preview'); expect(preview.retainedChildren.map((s: any) => s.id)).toContain(studentId);
        await call('post', '/privacy/account/delete', { credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() });
        const authorLedger = await exportLedger(target, restored.location, 'author-ledger.json', 1);
        await store.requestContext(() => {
          expect(store.find('sourceCourses', { id: 'private-draft' })).toBeUndefined(); expect(store.find('sourceCourses', { id: 'private-adult' })).toBeUndefined();
          expect(store.find('assistantTurns', { id: late.turn.id })).toBeUndefined();
        });
        await app.close(); app = null; vi.restoreAllMocks();
        const afterAuthor = join(directory, 'after-author'), authorRestore = await restore(afterAuthor, authorLedger); expect(authorRestore.receipt.appliedDeletionReceipts).toBe(1);
        await call('post', '/auth/login', { principal: 'course-author@local.test', credential }, null, 401);
        guardian = await login('course-guardian@local.test');
        for (const [index, entry] of entries.entries()) {
          if (index < 4) await call('get', prefix(entry.session.id) + '/sources/' + entry.key, undefined, guardian, 404);
          else expect(await call('get', prefix(entry.session.id) + '/sources/' + entry.key, undefined, guardian)).toEqual(previews[index]);
        }
        await store.requestContext(() => {
          expect(store.sourceCourses.map((r: any) => r.id)).toEqual(['shared-material']);
          expect(store.find('sourceCourses', { id: 'shared-material' }).ownerUserId).toBe('deleted-account');
          expect(store.assistantSessions).toHaveLength(2); expect(store.assistantMessages).toHaveLength(4); expect(store.assistantTurns).toHaveLength(2);
        });
        await worker.runNext(); expect(provider).not.toHaveBeenCalled();
        const childPreview = await call('get', '/privacy/students/' + studentId + '/deletion-preview', undefined, guardian); expect(childPreview.canDelete).toBe(true);
        await call('post', '/privacy/students/' + studentId + '/delete', { credential, confirmation: childPreview.confirmation, fingerprint: childPreview.fingerprint, requestKey: randomUUID() }, guardian);
        const latest = await exportLedger(afterAuthor, authorRestore.location, 'latest-ledger.json', 2);
        await app.close(); app = null; vi.restoreAllMocks();
        const erased = await restore(join(directory, 'erased'), latest); expect(erased.receipt.appliedDeletionReceipts).toBe(2); guardian = await login('course-guardian@local.test');
        await store.requestContext(() => {
          for (const name of ['students', 'sourceCourses', 'studioCourses', 'assistantSessions', 'assistantTurns', 'assistantMessages', 'aiInsights']) expect(store[name]).toHaveLength(0);
        });
        await call('get', prefix(entries[5].session.id) + '/sources/material-1', undefined, guardian, 404);
        await worker.runNext(); expect(provider).not.toHaveBeenCalled();
      } finally {
        await app?.close(); vi.restoreAllMocks();
        if (admin) {
          try { for (const name of databases) { if (!/^study_qa_course_recovery_[a-f0-9]{32}$/.test(name)) throw Error('Unsafe course QA database'); await admin.query('DROP DATABASE "' + name + '"'); } }
          finally { await admin.end(); }
        }
        for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
        if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('study-course-recovery-')) throw Error('Unsafe course QA directory');
        rmSync(directory, { recursive: true, force: true });
      }
    }, 120000);
  });
}
