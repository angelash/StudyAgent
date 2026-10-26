import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, rmSync, copyFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';

const location = process.env.STUDY_TEST_TOPIC_VISUAL_RECOVERY_POSTGRES_URL;
const names = ['NODE_ENV', 'DATABASE_URL', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED',
  'XIAOJIU_CHAT_ENABLED', 'OPENAI_API_KEY', 'MINIMAX_API_KEY'] as const;
const boards = '/learning/studio/topic-whiteboards', visuals = '/learning/studio/topic-whiteboard-visuals';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('frozen topic images and real account/child deletion cold recovery', () => {
  it('retains only shared PNGs through the current account ledger and prevents old and post-account bundles from resurrecting deleted child images', async () => {
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    const directory = mkdtempSync(join(tmpdir(), 'study-topic-visual-recovery-')), root = resolve(__dirname, '../../../..');
    const backup = require(join(root, 'scripts/operations/backup.cjs')), native = require(join(root, 'scripts/operations/postgres-backup.cjs'));
    const ledger = require(join(root, 'scripts/operations/privacy-ledger.cjs'));
    const sample = join(root, 'resources/teaching-visuals/topic-whiteboard/sociology-intersection-no-heading-3f4d62a9.png');
    const load = (name: string) => require('../../dist/apps/api/src/' + name + '.js');
    let app: any, store: any, worker: any, admin: Pool | undefined; const databases: string[] = []; let ip = 0;
    if (location) {
      if (!process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw Error('Dedicated native image recovery settings required');
      const source = new URL(location), adminLocation = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL);
      if (source.pathname !== '/study_agent_qa' || !['127.0.0.1', 'localhost'].includes(source.hostname) || source.hostname !== adminLocation.hostname || source.port !== adminLocation.port)
        throw Error('Expected dedicated native image recovery cluster');
      admin = new Pool({ connectionString: adminLocation.toString() }); expect((await admin.query('SELECT current_user AS name')).rows[0].name).toBe('study_qa_admin');
    }
    async function database() {
      if (!admin) return undefined;
      const name = 'study_qa_figure_recovery_' + randomUUID().replace(/-/g, '');
      await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
      const url = new URL(location!); url.pathname = '/' + name; return url.toString();
    }
    async function close() { await app?.close(); app = undefined; }
    async function boot(url: string | undefined, data: string) {
      Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: url ? 'postgres' : 'sqlite', STUDY_DATA_DIR: data,
        STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' });
      if (url) process.env.DATABASE_URL = url; else delete process.env.DATABASE_URL;
      app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
      store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
      const chat = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService), images = app.get(load('modules/ai/classroom-image.service').ClassroomImageService);
      worker = app.get(load('modules/learning/topic-whiteboard-visual-worker.service').TopicWhiteboardVisualWorkerService);
      vi.spyOn(chat, 'enabled', 'get').mockReturnValue(true);
      vi.spyOn(chat, 'structured').mockImplementation(async (input: any, _schema: any, check: any) => {
        const context = JSON.parse(input.context), content = { title: '匿名条件与观察', description: '保留完整合成原稿和待核对图示。',
          scenes: ['先观察', '比较条件', '保留反例'].map((title, index) => ({ kind: index === 0 ? 'title' : index === 2 ? 'check' : 'concept', title,
            narration: title + '，完整保留单位与条件。', body: '不从讲解推断掌握。', bullets: [title], targetAtomIds: context.targets.map((item: any) => item.id), exhibit: null })) };
        return { ...check(JSON.parse(input.message).stage === 'writing' ? content : { decision: 'pass', issues: [], revisedContent: null }), modelId: input.modelId, modelName: 'Controlled recovery text' };
      });
      vi.spyOn(images, 'figureCapabilities').mockResolvedValue({ available: true, editAvailable: true, modelId: 'gpt-image-2', reason: 'ready', message: 'Controlled image fixture' });
      vi.spyOn(images, 'generate').mockImplementation(async (_prompt: any, stage: any) => { const output = join(stage, 'controlled.png'); copyFileSync(sample, output); return { output }; });
    }
    async function call(method: 'get' | 'post' | 'patch', path: string, body?: unknown, actor?: any, status = method === 'post' ? 201 : 200) {
      const query = request(app.getHttpServer())[method]('/api' + path); if (actor) query.set('Authorization', 'Bearer ' + actor.token);
      if (path === '/auth/register') query.set('X-Forwarded-For', '198.18.79.' + (++ip)); if (body !== undefined) query.send(body as object);
      const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
    }
    async function register() {
      const principal = 'image-native-' + randomUUID() + '@local.test', credential = 'Synthetic-native-image-' + randomUUID();
      return { ...await call('post', '/auth/register', { principal, credential }), principal, credential };
    }
    async function login(actor: any) { return { ...await call('post', '/auth/login', { principal: actor.principal, credential: actor.credential }), principal: actor.principal, credential: actor.credential }; }
    async function lesson(actor: any, audience: any) {
      const input = { audience, prompt: '匿名公共观察与条件', objective: '比较条件并保留反例', modelId: 'deepseek-v4-flash' };
      const preflight = await call('post', boards + '/preflight', input, actor), queued = await call('post', boards + '/drafts', { ...input, preflightFingerprint: preflight.fingerprint, requestKey: randomUUID() }, actor);
      await app.get(load('modules/learning/topic-whiteboard-worker.service').TopicWhiteboardWorkerService).runNext();
      const draft = await call('get', boards + '/drafts/' + queued.id, undefined, actor);
      const selection = { operation: 'generate', draftId: draft.id, sceneIndex: 0, expectedRevision: draft.revision, contentFingerprint: draft.contentFingerprint,
        purpose: 'concept', requirements: '两个圆和交集，保留完整简短标签。' };
      const imagePreflight = await call('post', visuals + '/preflight', selection, actor), image = await call('post', visuals, { ...selection, preflightFingerprint: imagePreflight.fingerprint, requestKey: randomUUID() }, actor);
      await worker.runNext();
      const privateImage = await store.requestContext(() => structuredClone(store.find('studioTopicWhiteboardVisuals', { id: image.id })));
      const content = structuredClone(draft.content); content.scenes[0].figure = { visualId: image.id, alt: '两个圆的交集，说明观察与条件的关系。', caption: 'AI参考图，待核对。' };
      const edited = await call('patch', boards + '/drafts/' + draft.id + '/content', { content, expectedRevision: draft.revision, contentFingerprint: draft.contentFingerprint, requestKey: randomUUID() }, actor);
      const saved = await call('post', boards + '/drafts/' + draft.id + '/confirm', { expectedRevision: edited.revision, contentFingerprint: edited.contentFingerprint,
        acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: true, requestKey: randomUUID() }, actor);
      return { image: privateImage, board: await call('get', boards + '/' + saved.whiteboardId, undefined, actor) };
    }
    const snapshot = (url: string | undefined, data: string, destination: string) => url ? native.createPostgresBundle({ connectionString: url, dataDir: data, destination, pgBin: process.env.STUDY_TEST_PG_BIN }) : backup.createBundle({ dataDir: data, destination });
    const restore = (bundle: string, url: string | undefined, destination: string, deletionLedger: string, resume = false) => url ?
      native.restorePostgresBundle({ bundle, connectionString: url, destination, deletionLedger, resume, pgBin: process.env.STUDY_TEST_PG_BIN }) : backup.restoreBundle({ bundle, destination, deletionLedger, resume });
    function checkShared(data: string, selected: any) {
      const folder = join(data, 'topic-whiteboard-visuals', selected.image.id);
      expect(hash(readFileSync(join(folder, selected.image.files.original.name)))).toBe(selected.image.files.original.sha256);
      expect(hash(readFileSync(join(folder, selected.image.files.image.name)))).toBe(selected.image.files.image.sha256);
      expect(existsSync(join(folder, selected.image.files.prompt.name))).toBe(false);
      expect(readdirSync(folder).sort()).toEqual([...new Set([selected.image.files.original.name, selected.image.files.image.name])].sort());
    }
    async function erase(actor: any, studentId?: string) {
      const path = '/privacy/' + (studentId ? 'students/' + studentId : 'account'), preview = await call('get', path + '/deletion-preview', undefined, actor);
      await call('post', path + '/delete', { credential: actor.credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() }, actor);
      for (let index = 0; index < 10 && await worker.runNext(); index++) {}
    }
    try {
      const source = await database(), sourceRoot = join(directory, 'source'); await boot(source, sourceRoot);
      const owner = await register(); let other = await register();
      const created = await call('post', '/students', { nickname: '匿名冷恢复配图', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } }, owner);
      const studentId = created.profile.id, atomId = 'visual-recovery-atom-' + randomUUID();
      const invite = await call('post', '/students/' + studentId + '/invitations', { recipientPrincipal: other.principal }, owner);
      await call('post', '/parents/' + other.user.id + '/bindings', { studentId, inviteToken: invite.token }, other);
      await store.transaction(() => {
        store.append('knowledgeAtoms', { id: atomId, name: '比较条件', subject: 'math', grade: 3, term: 'both', objective: '比较完整条件', successCriterion: '在新情境中说明条件',
          prerequisiteIds: [], status: 'published', version: 1, curriculumVersion: 'visual-recovery', strand: '匿名合成' });
        store.append('learningScopes', { id: 'visual-recovery-scope-' + randomUUID(), studentId, subject: 'math', grade: 3, term: 'upper', version: 1,
          confirmedAt: new Date().toISOString(), learnedAtomIds: [atomId], minutesPerSession: 15 });
      });
      const selected = await lesson(owner, { kind: 'student', studentId, subject: 'math', atomIds: [atomId] }), adult = await lesson(owner, { kind: 'adult' });
      const bundle = join(directory, 'before-account'); await snapshot(source, sourceRoot, bundle);
      await erase(owner); checkShared(sourceRoot, selected); expect(existsSync(join(sourceRoot, 'topic-whiteboard-visuals', adult.image.id))).toBe(false);
      const accountLedger = join(directory, 'account-ledger.json'); await ledger.exportLedger({ dataDir: sourceRoot, connectionString: source, destination: accountLedger });
      const postAccountBundle = join(directory, 'after-account'); await snapshot(source, sourceRoot, postAccountBundle); await close();
      const target = await database(), targetRoot = join(directory, 'account-restored'); await restore(bundle, target, targetRoot, accountLedger); checkShared(targetRoot, selected);
      expect(existsSync(join(targetRoot, 'topic-whiteboard-visuals', adult.image.id))).toBe(false);
      await boot(target, targetRoot); await call('get', '/auth/me', undefined, other, 401); other = await login(other);
      const shared = await call('get', boards + '/' + selected.board.id, undefined, other); expect(shared.fingerprint).toBe(selected.board.fingerprint);
      const downloaded = await request(app.getHttpServer()).get('/api' + shared.scenes[0].figure.originalUrl).set('Authorization', 'Bearer ' + other.token).expect(200);
      expect(hash(downloaded.body)).toBe(selected.image.files.original.sha256);
      await call('get', visuals + '/' + selected.image.id, undefined, other, 404);
      expect(await store.requestContext(() => store.inspect('studioTopicWhiteboardVisuals').length)).toBe(0);
      await erase(other, studentId); expect(existsSync(join(targetRoot, 'topic-whiteboard-visuals', selected.image.id))).toBe(false);
      const combined = join(directory, 'combined-ledger.json'); await ledger.exportLedger({ dataDir: targetRoot, connectionString: target, destination: combined }); await close();
      for (const [index, original] of [bundle, postAccountBundle].entries()) {
        const next = await database(), nextRoot = join(directory, 'child-restored-' + index);
        if (index === 0) {
          const fs = require('node:fs'), unlink = fs.unlinkSync; let deletes = 0;
          const interrupted = vi.spyOn(fs, 'unlinkSync').mockImplementation((file: any) => {
            if (String(file).startsWith(nextRoot) && String(file).includes('topic-whiteboard-visuals') && ++deletes === 2) throw Error('controlled_topic_cleanup_interruption');
            return unlink(file);
          });
          try { await expect(restore(original, next, nextRoot, combined)).rejects.toThrow('controlled_topic_cleanup_interruption'); }
          finally { interrupted.mockRestore(); }
          await restore(original, next, nextRoot, combined, true);
        } else await restore(original, next, nextRoot, combined);
        expect(existsSync(join(nextRoot, 'topic-whiteboard-visuals', selected.image.id))).toBe(false);
        expect(existsSync(join(nextRoot, 'topic-whiteboard-visuals', adult.image.id))).toBe(false);
        await boot(next, nextRoot); other = await login(other); await call('get', boards + '/' + selected.board.id, undefined, other, 404);
        expect(await store.requestContext(() => store.inspect('studioTopicWhiteboards').length + store.inspect('studioTopicWhiteboardVisuals').length)).toBe(0); await close();
      }
      if (source) await native.verifyPostgresBundle({ bundle, pgBin: process.env.STUDY_TEST_PG_BIN }); else await backup.verifyBundle({ bundle });
    } finally {
      await close(); vi.restoreAllMocks();
      if (admin) {
        for (const name of databases) { if (!/^study_qa_figure_recovery_[a-f0-9]{32}$/.test(name)) throw Error('Unexpected owned figure QA database');
          await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [name]); await admin.query('DROP DATABASE "' + name + '"'); }
        await admin.end();
      }
      for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
      if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !basename(directory).startsWith('study-topic-visual-recovery-')) throw Error('Unexpected figure cleanup target');
      rmSync(directory, { recursive: true, force: true });
    }
  }, 180000);
});
