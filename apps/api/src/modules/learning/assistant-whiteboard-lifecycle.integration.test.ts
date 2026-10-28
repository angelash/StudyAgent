import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Pool } from 'pg';
import { whiteboardPresentation, WHITEBOARD_SPEECH_VERSION } from '@study-agent/contracts';
import type { ClassroomImageService } from '../ai/classroom-image.service';

describe('private source whiteboard authority, persisted tasks and adopted teaching', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-private-source-board-'));
  const keys = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'XIAOJIU_CHAT_ENABLED'];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  const base = '/learning/studio/topic-whiteboards', sourceRoot = (id: string) => '/ai/assistant/sessions/' + id + '/artifacts/whiteboards';
  let app: any, store: any, chat: any, worker: any, boards: any, sources: any, pg: Pool | undefined, schema = '', ip = 0, calls: any[] = [];
  async function call(actor: any, method: 'get' | 'post' | 'patch', path: string, body?: unknown, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (path === '/auth/register') query = query.set('X-Forwarded-For', '198.18.79.' + (++ip));
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  async function register() { const credential = 'Owned-source-board-' + randomUUID(); return { ...await call(null, 'post', '/auth/register', { principal: randomUUID() + '@local.test', credential }), credential }; }
  function model(input: any, check: any) {
    calls.push(input); const context = JSON.parse(input.context), stage = JSON.parse(input.message).stage;
    const content = { title: '比较完整条件', description: '把原解释整理为可复核的私人教学。', scenes: ['原问题', '比较条件', '独立检查'].map((title, index) => ({
      kind: index === 0 ? 'title' : index === 2 ? 'check' : 'concept', title, narration: title + '，先说清整体和单位，再判断条件。',
      body: '先说清整体和单位，再判断条件。', bullets: [title], targetAtomIds: [],
      exhibit: index === 1 ? { kind: 'table', headers: ['条件', '作用'], rows: [['整体', '保持比较依据'], ['单位', '说明数量意义']] } : null,
      sourceMap: { messageIds: [context.origin.messages[0].id], referenceKeys: [], status: 'sourced', explanation: '整理所选原问题中的条件，不代表能力评测。' },
    })) };
    return { ...check(stage === 'reviewing' ? { decision: 'pass', issues: [], revisedContent: null } : content), modelId: input.modelId, modelName: '受控来源模型' };
  }
  function provider() {
    vi.spyOn(chat, 'enabled', 'get').mockReturnValue(true);
    vi.spyOn(chat, 'structured').mockImplementation(async (input: any, _schema: any, check: any) => model(input, check));
  }
  async function boot() {
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    chat = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
    worker = app.get(load('modules/learning/topic-whiteboard-worker.service').TopicWhiteboardWorkerService);
    boards = app.get(load('modules/learning/topic-whiteboard.service').TopicWhiteboardService);
    sources = app.get(load('modules/learning/assistant-whiteboard.service').AssistantWhiteboardService); provider();
  }
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
      STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' }); delete process.env.DATABASE_URL;
    const connection = process.env.STUDY_TEST_ASSISTANT_WHITEBOARD_LIFECYCLE_POSTGRES_URL;
    if (connection) {
      pg = new Pool({ connectionString: connection }); expect((await pg.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_source_lifecycle_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"');
      const url = new URL(connection); url.searchParams.set('options', '-c search_path=' + schema); process.env.STUDY_STORAGE = 'postgres'; process.env.DATABASE_URL = url.toString();
    }
    await boot();
  });
  beforeEach(() => { vi.restoreAllMocks(); calls = []; provider(); });
  afterAll(async () => {
    await app?.close(); vi.restoreAllMocks();
    if (pg) { if (!/^study_qa_source_lifecycle_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe lifecycle schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    if (resolve(directory).slice(0, resolve(tmpdir()).length + 1) !== resolve(tmpdir()) + sep) throw Error('Unsafe lifecycle test directory'); rmSync(directory, { recursive: true, force: true });
  });
  async function fixture(child = false, learner = false) {
    const parent = await register(); let actor = parent, studentId: string | null = null;
    if (child) {
      studentId = (await call(parent, 'post', '/students', { nickname: '匿名来源白板学习者', grade: 4, preferredSessionMinutes: 15,
        defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
      if (learner) {
        const access = await call(parent, 'post', '/students/' + studentId + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '验证本人原对话白板权限。' });
        const code = await call(parent, 'post', '/students/' + studentId + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
        actor = await call(null, 'post', '/auth/learning-code', { code: code.code });
      }
    }
    let session;
    if (child) {
      const definitions = load('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum();
      const course = load('modules/learning/chemistry-course').buildChemistryCourse(studentId, definitions.map((item: any) => item.atom));
      await store.transaction(() => { for (const item of definitions) if (!store.find('knowledgeAtoms', { id: item.atom.id })) store.append('knowledgeAtoms', item.atom); store.append('studioCourses', course); });
      const descriptor = await call(actor, 'get', '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'primary_unit', courseId: course.id, itemId: course.units[0].id }));
      session = await call(actor, 'post', '/ai/assistant/sessions', { userRole: learner ? 'student' : 'parent', studentId: descriptor.studentId,
        subject: descriptor.subject, pageContext: 'course', contextRefType: descriptor.kind, contextRefId: descriptor.referenceId,
        contextItemId: descriptor.itemId, contextSelection: descriptor.selection });
    } else session = await call(actor, 'post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' });
    const marker = 'ONLY_THIS_PRIVATE_ORIGIN_' + randomUUID(), messageId = 'owned-source-message-' + randomUUID();
    await store.transaction(() => store.append('assistantMessages', { id: messageId, sessionId: session.id, sender: 'user', content: marker + '\n请比较整体、单位与条件。', createdAt: new Date().toISOString() }));
    const input = { selection: { messageIds: [messageId], includeLinkedQuestions: false }, objective: '先比较完整条件，再保留独立核查', modelId: 'deepseek-v4-flash', acknowledgeHistoricalSource: false };
    const preview = await call(actor, 'post', sourceRoot(session.id) + '/preflight', input, 200);
    return { actor, parent, studentId, session, marker, messageId, input, command: { ...input, preflightFingerprint: preview.fingerprint, requestKey: randomUUID() } };
  }
  async function identity(actor: any, action: (user: any, session: any) => any) {
    return store.requestContext(() => {
      const login = store.find('sessions', { tokenHash: load('modules/auth/auth.service').hashToken(actor.token) });
      return action(store.find('users', { id: login.userId }), login);
    });
  }
  async function prepare(f: any, command = f.command) { return call(f.actor, 'post', sourceRoot(f.session.id), command); }
  const read = (f: any, id: string) => call(f.actor, 'get', base + '/drafts/' + id);
  async function ready(f: any) { const row = await prepare(f); expect(await worker.runNext()).toBe(true); return read(f, row.id); }
  async function adopt(f: any, row: any) {
    return call(f.actor, 'post', base + '/drafts/' + row.id + '/confirm', { expectedRevision: row.revision, contentFingerprint: row.contentFingerprint,
      acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: false, requestKey: randomUUID() });
  }
  async function formal() { return store.requestContext(() => createHash('sha256').update(JSON.stringify(
    ['diagnosticResponses','diagnosticPlans','diagnosticReports','diagnosticSessions','studioScheduleEvents'].map(key => { expect(Array.isArray(store[key])).toBe(true); return store[key]; }))).digest('hex')); }

  it('atomically persists one original source/task, replays its key, cold resumes generation and privately adopts exact mapped content', async () => {
    const f = await fixture(), before = await formal(), first = await prepare(f), replay = await prepare(f);
    expect(replay.id).toBe(first.id); expect(replay.task.id).toBe(first.task.id); expect(calls).toHaveLength(0);
    const receipt = await call(f.actor, 'get', sourceRoot(f.session.id) + '/requests/' + f.command.requestKey); expect(receipt.id).toBe(first.id); expect(receipt.receipt.effectiveRevision).toBe(0);
    const sourceBefore = await store.requestContext(() => structuredClone(store.find('studioTopicWhiteboardDrafts', { id: first.id }).prepared.source));
    await app.close(); vi.restoreAllMocks(); await boot(); expect(await worker.runNext()).toBe(true);
    const row = await read(f, first.id); expect(row.status).toBe('ready'); expect(calls).toHaveLength(2); expect(calls.every(item => item.modelId === f.input.modelId)).toBe(true);
    expect(row.content.scenes[0].sourceMap.messageIds).toEqual([f.messageId]);
    const sourceView = await call(f.actor, 'get', base + '/drafts/' + row.id + '/source'); expect(sourceView.origin.messages[0].content).toContain(f.marker);
    expect(sourceView.mappings.current[0].messageIds).toEqual([f.messageId]); expect(sourceView).not.toHaveProperty('authorization'); expect(sourceView).not.toHaveProperty('context');
    const confirmed = await adopt(f, row), published = await call(f.actor, 'get', base + '/' + confirmed.whiteboardId);
    expect(JSON.stringify(published)).not.toContain(f.messageId); expect(JSON.stringify(published)).not.toContain(f.marker);
    expect(published).not.toHaveProperty('privateToCreator'); expect(published).not.toHaveProperty('sourceProtocol');
    const saved = await store.requestContext(() => store.find('studioTopicWhiteboardDrafts', { id: row.id }).prepared.source); expect(saved).toEqual(sourceBefore);
    expect(await formal()).toBe(before);
  });
  it('keeps a child-associated source board private from another currently authorized guardian and separates portable/deletion records', async () => {
    const f = await fixture(true), other = await register(); await store.transaction(() => store.append('bindings', { id: 'owned-binding-' + randomUUID(), parentUserId: other.user.id, studentId: f.studentId, status: 'active' }));
    await call(other, 'get', '/students/' + f.studentId + '/profile');
    const row = await ready(f), confirmed = await adopt(f, row);
    expect(row.audience).toMatchObject({ kind: 'assistant', courseGrade: 9, profileGrade: 4 });
    await call(other, 'get', base + '/drafts/' + row.id, undefined, 404); await call(other, 'get', base + '/' + confirmed.whiteboardId, undefined, 404);
    await store.requestContext(() => {
      const privacy = load('modules/privacy/privacy-records'), selected = privacy.studentRecords(store, f.studentId);
      expect(JSON.stringify(privacy.portableRecords(selected, other.user.id))).not.toContain(f.marker);
      expect(privacy.portableRecords(selected, other.user.id).studioTopicWhiteboards).toEqual([]);
      expect(JSON.stringify(privacy.portableRecords(selected, f.actor.user.id))).toContain(f.marker);
      expect(privacy.accountRecords(store, f.actor.user.id, '').studioTopicWhiteboards.map((item: any) => item.id)).toContain(confirmed.whiteboardId);
    });
  });
  it('fails closed without the source adapter and rejects a changed protocol instead of treating it as a free student board', async () => {
    const f = await fixture(); await identity(f.actor, (user, login) => {
      const prepared = sources.prepare(user, f.session.id, f.input), access = load('modules/learning/topic-whiteboard-access');
      expect(() => access.captureTopicWhiteboardAuthorization(store, app.get(load('modules/students/students.service').StudentsService), user, prepared.input.audience, login, prepared)).toThrow('完整来源授权');
      expect(() => access.assertTopicWhiteboardInputCurrent(store, app.get(load('modules/students/students.service').StudentsService), user, prepared)).toThrow('完整来源授权');
      expect(() => access.captureTopicWhiteboardAuthorization(store, app.get(load('modules/students/students.service').StudentsService), user, prepared.input.audience,
        login, { ...prepared, version: 'topic-whiteboard-v1' }, sources)).toThrow('完整来源授权');
    });
  });
  it('allows the frozen historical draft to be read after source text changes but blocks new edits and adoption without changing formal records', async () => {
    const f = await fixture(), row = await ready(f), before = await formal();
    await store.transaction(() => { store.find('assistantMessages', { id: f.messageId }).content += '\n后续已修改的原问题。'; });
    expect((await read(f, row.id)).content).toEqual(row.content);
    await call(f.actor, 'patch', base + '/drafts/' + row.id + '/content', { expectedRevision: row.revision, contentFingerprint: row.contentFingerprint, content: row.content, requestKey: randomUUID() }, 409);
    await call(f.actor, 'post', base + '/drafts/' + row.id + '/confirm', { expectedRevision: row.revision, contentFingerprint: row.contentFingerprint,
      acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: true, requestKey: randomUUID() }, 409);
    expect(await formal()).toBe(before);
  });
  it('retains a completed writing checkpoint and the fixed original model when review fails and an explicit retry resumes', async () => {
    const f = await fixture(); let failReview = true;
    vi.mocked(chat.structured).mockImplementation(async (input: any, _schema: any, check: any) => {
      if (JSON.parse(input.message).stage === 'reviewing' && failReview) { calls.push(input); failReview = false; throw Error('Owned review interruption'); }
      return model(input, check);
    });
    const first = await prepare(f); await worker.runNext(); const failed = await read(f, first.id); expect(failed.status).toBe('failed'); expect(failed.originalContent).toBeTruthy();
    await call(f.actor, 'post', base + '/drafts/' + first.id + '/retry', { expectedRevision: failed.revision, generation: failed.generation, taskVersion: failed.task.version, requestKey: randomUUID() });
    await worker.runNext(); const resumed = await read(f, first.id); expect(resumed.status).toBe('ready');
    expect(calls.filter(item => JSON.parse(item.message).stage === 'writing')).toHaveLength(1); expect(calls.filter(item => JSON.parse(item.message).stage === 'reviewing')).toHaveLength(2);
    expect(resumed.originalContent).toEqual(failed.originalContent); await adopt(f, resumed);
  });
  it('can cancel a queued source task and resumes only after an explicit original-model retry', async () => {
    const f = await fixture(), first = await prepare(f);
    const cancelled = await call(f.actor, 'post', base + '/drafts/' + first.id + '/cancel', { expectedRevision: first.revision, generation: first.generation, taskVersion: first.task.version, requestKey: randomUUID() });
    expect(cancelled.status).toBe('cancelled'); expect(calls).toHaveLength(0);
    await call(f.actor, 'post', base + '/drafts/' + first.id + '/retry', { expectedRevision: cancelled.revision, generation: cancelled.generation, taskVersion: cancelled.task.version, requestKey: randomUUID() });
    await worker.runNext(); expect((await read(f, first.id)).status).toBe('ready'); expect(calls.every(item => item.modelId === f.input.modelId)).toBe(true);
  });
  it.each(['logout', 'source-change', 'binding', 'assessment'])('does not persist a late model response after %s invalidates original authority', async reason => {
    const f = await fixture(reason === 'binding' || reason === 'assessment', reason === 'assessment'), first = await prepare(f); let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), began = new Promise<void>(resolve => { entered = resolve; });
    vi.mocked(chat.structured).mockImplementation(async (input: any, _schema: any, check: any) => { entered(); await held; return model(input, check); });
    const running = worker.runNext(); try {
      await began;
      if (reason === 'logout') await call(f.actor, 'post', '/auth/logout', {});
      else await store.transaction(() => {
        if (reason === 'source-change') store.find('assistantMessages', { id: f.messageId }).content += '原消息已改变。';
        if (reason === 'binding') store.find('bindings', { parentUserId: f.parent.user.id, studentId: f.studentId, status: 'active' }).status = 'revoked';
        if (reason === 'assessment') store.append('diagnosticSessions', { id: 'owned-running-assessment-' + randomUUID(), studentId: f.studentId, subject: 'chemistry', status: 'in_progress' });
      });
    } finally { release(); }
    await running; await store.requestContext(() => { const row = store.find('studioTopicWhiteboardDrafts', { id: first.id }); expect(row.originalContent).toBeNull(); expect(row.content).toBeNull(); });
  });
  it('keeps student reads available during a persisted paused assessment while fencing edits and fresh narration, then permits explicit writes again', async () => {
    const f = await fixture(true, true), row = await ready(f), confirmed = await adopt(f, row);
    const second = await prepare(f, { ...f.command, requestKey: randomUUID() }); await worker.runNext(); const editable = await read(f, second.id);
    const assessmentId = 'owned-source-assessment-' + randomUUID(); await store.transaction(() => store.append('diagnosticSessions', { id: assessmentId, studentId: f.studentId, subject: 'math', status: 'paused' }));
    try {
      expect((await read(f, editable.id)).status).toBe('ready');
      await call(f.actor, 'patch', base + '/drafts/' + editable.id + '/content', { expectedRevision: editable.revision, contentFingerprint: editable.contentFingerprint, content: editable.content, requestKey: randomUUID() }, 409);
      const images = app.get(load('modules/ai/classroom-image.service').ClassroomImageService), capabilities = vi.spyOn(images, 'figureCapabilities').mockResolvedValue({ available: true,
        editAvailable: true, modelId: 'gpt-image-2', reason: 'ready', message: '仅验证原对话图片权限' });
      const imageCommand = { draftId: editable.id, sceneIndex: 1, expectedRevision: editable.revision, contentFingerprint: editable.contentFingerprint,
        purpose: 'comparison', requirements: '仅画本幕两个条件。', operation: 'generate' };
      await call(f.actor, 'post', '/learning/studio/topic-whiteboard-visuals/preflight', imageCommand, 409); expect(capabilities).not.toHaveBeenCalled();
      const board = await call(f.actor, 'get', base + '/' + confirmed.whiteboardId), unit = whiteboardPresentation(board).units[0];
      const speech = app.get(load('modules/ai/speech.service').SpeechService), synthesize = vi.spyOn(speech, 'synthesize').mockResolvedValue({ content: readFileSync(resolve(process.cwd(), '../web/public/classroom-voice-samples/bright-v1.mp3')), contentType: 'audio/mpeg' });
      await call(f.actor, 'post', base + '/' + board.id + '/narration/' + unit.sceneId, { presentationVersion: WHITEBOARD_SPEECH_VERSION, fingerprint: board.fingerprint, unitId: unit.id }, 409); expect(synthesize).not.toHaveBeenCalled();
      await store.transaction(() => { store.find('diagnosticSessions', { id: assessmentId }).status = 'aborted'; });
      await call(f.actor, 'patch', base + '/drafts/' + editable.id + '/content', { expectedRevision: editable.revision, contentFingerprint: editable.contentFingerprint, content: editable.content, requestKey: randomUUID() });
      vi.spyOn(chat, 'enabled', 'get').mockReturnValue(false);
      await call(f.actor, 'post', base + '/' + board.id + '/narration/' + unit.sceneId, { presentationVersion: WHITEBOARD_SPEECH_VERSION, fingerprint: board.fingerprint, unitId: unit.id }, 201); expect(synthesize).toHaveBeenCalledTimes(1);
      const current = await read(f, editable.id), image = await call(f.actor, 'post', '/learning/studio/topic-whiteboard-visuals/preflight', { ...imageCommand, expectedRevision: current.revision });
      expect(image.context.audience).toBe('assistant'); expect(image.context.targets).toEqual([]); expect(JSON.stringify(image.context)).not.toContain(f.messageId); expect(JSON.stringify(image.context)).not.toContain(f.marker);
    } finally { await store.transaction(() => { store.find('diagnosticSessions', { id: assessmentId }).status = 'aborted'; }); }
  });
  it('rechecks source authorization after a held picture capability probe and never returns its late private context', async () => {
    const f = await fixture(), row = await ready(f); let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), began = new Promise<void>(resolve => { entered = resolve; });
    const images = app.get(load('modules/ai/classroom-image.service').ClassroomImageService);
    vi.spyOn(images, 'figureCapabilities').mockImplementation(async () => { entered(); await held; return { available: true, editAvailable: true, modelId: 'gpt-image-2', reason: 'ready', message: '受控图片权限探针' }; });
    const pending = call(f.actor, 'post', '/learning/studio/topic-whiteboard-visuals/preflight', { draftId: row.id, sceneIndex: 1, expectedRevision: row.revision,
      contentFingerprint: row.contentFingerprint, purpose: 'comparison', requirements: '只说明本幕两个条件。', operation: 'generate' }, 401);
    try { await began; await call(f.actor, 'post', '/auth/logout', {}); } finally { release(); }
    await pending;
  });
  it('returns bounded private source summaries, scopes cursors and creation receipts to the original session, and rejects reused keys with different input', async () => {
    const f = await fixture(), ids: string[] = [];
    for (let index = 0; index < 3; index++) ids.push((await prepare(f, { ...f.command, requestKey: randomUUID() })).id);
    const first = await call(f.actor, 'get', sourceRoot(f.session.id) + '?pageSize=2'); expect(first.items).toHaveLength(2); expect(first.nextCursor).toBeTruthy();
    const second = await call(f.actor, 'get', sourceRoot(f.session.id) + '?' + new URLSearchParams({ pageSize: '2', cursor: first.nextCursor }));
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull(); expect(new Set([...first.items, ...second.items].map((row: any) => row.id))).toEqual(new Set(ids));
    expect(JSON.stringify(first)).not.toContain(f.marker); expect(first.items[0]).not.toHaveProperty('content'); expect(first.items[0]).not.toHaveProperty('origin');
    const lectureCourse = load('modules/learning/classroom-curriculum').classroomCourse(), lecture = lectureCourse.units[0].lectures[0];
    const descriptor = await call(f.actor, 'get', '/ai/assistant/lecture-context?' + new URLSearchParams({ courseId: lectureCourse.id, lectureId: lecture.id }));
    const otherSession = await call(f.actor, 'post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom',
      contextRefType: 'classroom_lecture', contextRefId: descriptor.referenceId, contextItemId: descriptor.lectureId });
    expect(otherSession.id).not.toBe(f.session.id);
    await call(f.actor, 'get', sourceRoot(otherSession.id) + '?' + new URLSearchParams({ cursor: first.nextCursor }), undefined, 400);
    const original = await prepare(f);
    await call(f.actor, 'post', sourceRoot(f.session.id), { ...f.command, objective: '同键不能偷偷改变生成目标。' }, 409);
    await call(f.actor, 'post', sourceRoot(otherSession.id), f.command, 409);
    await call(f.actor, 'get', sourceRoot(otherSession.id) + '/requests/' + f.command.requestKey, undefined, 404);
    const another = await register(); await call(another, 'get', sourceRoot(f.session.id), undefined, 404);
    expect((await call(f.actor, 'get', sourceRoot(f.session.id) + '/requests/' + f.command.requestKey)).id).toBe(original.id);
    for (const id of [...ids, original.id]) { const row = await read(f, id); await call(f.actor, 'post', base + '/drafts/' + id + '/cancel', { expectedRevision: row.revision, generation: row.generation, taskVersion: row.task.version, requestKey: randomUUID() }); }
  });
  const visualBase = '/learning/studio/topic-whiteboard-visuals';
  function imageProvider() {
    const images: ClassroomImageService = app.get(load('modules/ai/classroom-image.service').ClassroomImageService);
    const sample = resolve(__dirname, '../../../../../resources/teaching-visuals/topic-whiteboard/sociology-intersection-no-heading-3f4d62a9.png');
    vi.spyOn(images, 'figureCapabilities').mockResolvedValue({ available: true, editAvailable: true, modelId: 'gpt-image-2', reason: 'ready', message: 'Owned source image fixture' });
    const output = async (prompt: string, stage: string) => {
      const file = join(stage, 'owned-source-landscape.png'); copyFileSync(sample, file); return { output: file, promptPath: join(stage, 'unused.txt') };
    };
    vi.spyOn(images, 'generate').mockImplementation(output); vi.spyOn(images, 'edit').mockImplementation(output);
    return { images, output, worker: app.get(load('modules/learning/topic-whiteboard-visual-worker.service').TopicWhiteboardVisualWorkerService) };
  }
  async function prepareImage(f: any, row: any, extra: any = {}) {
    const input = { draftId: row.id, sceneIndex: 1, expectedRevision: row.revision, contentFingerprint: row.contentFingerprint,
      purpose: 'comparison', requirements: '用清楚标签说明本幕整体与单位。', operation: 'generate', ...extra };
    const preview = await call(f.actor, 'post', visualBase + '/preflight', input);
    return call(f.actor, 'post', input.operation === 'edit' ? visualBase + '/' + input.parentVisualId + '/edits' : visualBase,
      { ...input, preflightFingerprint: preview.fingerprint, requestKey: randomUUID() });
  }
  it('lets the actual student generate and edit scene images, privately adopts the exact PNG and never gives the image model raw source mappings', async () => {
    const f = await fixture(true, true), row = await ready(f), before = await formal(), image = imageProvider();
    const first = await prepareImage(f, row); expect(await image.worker.runNext()).toBe(true);
    const original = await call(f.actor, 'get', visualBase + '/' + first.id); expect(original.status).toBe('ready');
    const second = await prepareImage(f, row, { operation: 'edit', parentVisualId: original.id, changes: '保留两个条件，增加清楚的对照箭头。' });
    expect(await image.worker.runNext()).toBe(true); const edited = await call(f.actor, 'get', visualBase + '/' + second.id); expect(edited.status).toBe('ready');
    for (const mocked of [image.images.generate, image.images.edit]) for (const args of vi.mocked(mocked).mock.calls) {
      expect(args[0]).not.toContain(f.marker); expect(args[0]).not.toContain(f.messageId); expect(args[0]).not.toContain('sourceMap'); expect(args[0]).not.toContain('"origin":');
    }
    const content = structuredClone(row.content); content.scenes[1].figure = { visualId: edited.id, alt: '整体和单位的对照图，标签保留完整。', caption: '匿名参考图，需核对标签。' };
    const changed = await call(f.actor, 'patch', base + '/drafts/' + row.id + '/content', { expectedRevision: row.revision, contentFingerprint: row.contentFingerprint, content, requestKey: randomUUID() });
    expect(changed.content.scenes[1].sourceMap).toEqual(row.content.scenes[1].sourceMap);
    const confirmed = await call(f.actor, 'post', base + '/drafts/' + row.id + '/confirm', { expectedRevision: changed.revision, contentFingerprint: changed.contentFingerprint,
      acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: true, requestKey: randomUUID() });
    const published = await call(f.actor, 'get', base + '/' + confirmed.whiteboardId), url = published.scenes[1].figure.imageUrl;
    const response = await request(app.getHttpServer()).get('/api' + url).set('Authorization', 'Bearer ' + f.actor.token); expect(response.status).toBe(200); expect(response.headers['content-type']).toContain('image/png');
    const other = await register(); await store.transaction(() => store.append('bindings', { id: randomUUID(), studentId: f.studentId, parentUserId: other.user.id, status: 'active', createdAt: new Date().toISOString() }));
    await call(other, 'get', visualBase + '/' + edited.id, undefined, 404); await call(other, 'get', url, undefined, 404);
    expect(await formal()).toBe(before);
    await app.close(); vi.restoreAllMocks(); await boot(); // Startup revalidates saved figures against exact mapped content.
    expect((await call(f.actor, 'get', base + '/' + confirmed.whiteboardId)).fingerprint).toBe(published.fingerprint);
  });
  it.each(['logout', 'source-change', 'binding', 'assessment'])('never publishes a held source image after %s invalidates write authority', async reason => {
    const f = await fixture(true, reason === 'assessment'), row = await ready(f), image = imageProvider(), visual = await prepareImage(f, row);
    let release!: () => void, entered!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), began = new Promise<void>(resolve => { entered = resolve; });
    vi.mocked(image.images.generate).mockImplementation(async (prompt: string, stage: string) => { entered(); await held; return image.output(prompt, stage); });
    const running = image.worker.runNext(); try {
      await began;
      if (reason === 'logout') await call(f.actor, 'post', '/auth/logout', {});
      else await store.transaction(() => {
        if (reason === 'source-change') store.find('assistantMessages', { id: f.messageId }).content += '原条件已改变。';
        if (reason === 'binding') store.find('bindings', { parentUserId: f.parent.user.id, studentId: f.studentId, status: 'active' }).status = 'revoked';
        if (reason === 'assessment') store.append('diagnosticSessions', { id: randomUUID(), studentId: f.studentId, subject: 'math', status: 'paused' });
      });
    } finally { release(); }
    await running; await store.requestContext(() => { const result = store.find('studioTopicWhiteboardVisuals', { id: visual.id }); expect(result.status).toBe('failed'); expect(result.files).toBeFalsy(); });
  });
  it.each(['logout', 'source-change', 'binding', 'assessment'])('does not return held source narration bytes after %s changes', async reason => {
    const f = await fixture(true, reason === 'assessment'), row = await ready(f), adopted = await adopt(f, row), board = await call(f.actor, 'get', base + '/' + adopted.whiteboardId);
    const unit = whiteboardPresentation(board).units[0], speech = app.get(load('modules/ai/speech.service').SpeechService);
    let release!: () => void, entered!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), began = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(speech, 'synthesize').mockImplementation(async () => { entered(); await held; return { content: readFileSync(resolve(process.cwd(), '../web/public/classroom-voice-samples/bright-v1.mp3')), contentType: 'audio/mpeg' }; });
    const running = request(app.getHttpServer()).post('/api' + base + '/' + board.id + '/narration/' + unit.sceneId).set('Authorization', 'Bearer ' + f.actor.token)
      .send({ presentationVersion: WHITEBOARD_SPEECH_VERSION, fingerprint: board.fingerprint, unitId: unit.id }).then(response => response);
    try {
      await began;
      if (reason === 'logout') await call(f.actor, 'post', '/auth/logout', {});
      else await store.transaction(() => {
        if (reason === 'source-change') store.find('assistantMessages', { id: f.messageId }).content += '原条件已改变。';
        if (reason === 'binding') store.find('bindings', { parentUserId: f.parent.user.id, studentId: f.studentId, status: 'active' }).status = 'revoked';
        if (reason === 'assessment') store.append('diagnosticSessions', { id: randomUUID(), studentId: f.studentId, subject: 'math', status: 'paused' });
      });
    } finally { release(); }
    const response = await running; expect(response.status).toBe(({ logout: 401, 'source-change': 409, binding: 403, assessment: 409 } as const)[reason]);
    expect(response.headers['content-type']).toContain('application/json'); expect(response.body).not.toHaveProperty('content');
  });
  it('retains one source draft, task and adopted board across two actual application instances racing the same commands', async () => {
    const f = await fixture(), second = await NestFactory.create(load('app.module').AppModule, { logger: false }); second.setGlobalPrefix('api'); await second.init();
    const secondModel = second.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService), enabled = vi.spyOn(secondModel, 'enabled', 'get').mockReturnValue(true);
    try {
      const responses = await Promise.all([app, second].map(instance => request(instance.getHttpServer()).post('/api' + sourceRoot(f.session.id)).set('Authorization', 'Bearer ' + f.actor.token).send(f.command)));
      expect(responses.some(r => r.status === 201)).toBe(true); expect(responses.every(r => [201, 409].includes(r.status))).toBe(true);
      const first = await prepare(f); await worker.runNext(); const row = await read(f, first.id), command = { expectedRevision: row.revision, contentFingerprint: row.contentFingerprint,
        acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: false, requestKey: randomUUID() };
      const adopted = await Promise.all([app, second].map(instance => request(instance.getHttpServer()).post('/api' + base + '/drafts/' + row.id + '/confirm').set('Authorization', 'Bearer ' + f.actor.token).send(command)));
      expect(adopted.some(r => r.status === 201)).toBe(true); expect(adopted.every(r => [201, 409].includes(r.status))).toBe(true);
      await store.requestContext(() => { expect(store.select('studioTopicWhiteboardDrafts', { ownerUserId: f.actor.user.id, requestKey: f.command.requestKey })).toHaveLength(1);
        expect(store.select('studioTopicWhiteboards', { sourceDraftId: row.id })).toHaveLength(1); });
      const receipt = await call(f.actor, 'get', base + '/drafts/' + row.id + '/requests/' + command.requestKey); expect(receipt.status).toBe('confirmed');
      expect((await prepare(f)).task.id).toBe(first.task.id);
    } finally { enabled.mockRestore(); await second.close(); }
  });
});
