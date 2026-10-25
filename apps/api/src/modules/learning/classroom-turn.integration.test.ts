import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('durable classroom turns, original position and explicit teaching modes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-turns-'));
  const names = ['NODE_ENV','STUDY_STORAGE','DATABASE_URL','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any, store: any, worker: any, chat: any, parent: any, other: any, seed: any, pg: Pool | undefined, schema: string | undefined;
  const base = (id: string) => '/learning/classroom/sessions/' + id;
  async function call(method: 'get'|'post'|'patch', path: string, body?: unknown, actor = parent, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    return (await query.expect(status)).body.data;
  }
  async function boot() {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { ClassroomTurnWorkerService } = require('../../../dist/apps/api/src/modules/learning/classroom-turn-worker.service.js');
    const { XiaojiuChatService } = require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); worker = app.get(ClassroomTurnWorkerService); chat = app.get(XiaojiuChatService);
  }
  beforeAll(async () => {
    let backend = 'sqlite'; const url = process.env.STUDY_TEST_CLASSROOM_TURN_POSTGRES_URL;
    if (url) {
      pg = new Pool({ connectionString: url }); expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_turns_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"');
      const scoped = new URL(url); scoped.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = scoped.toString(); backend = 'postgres';
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: backend, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    await boot();
    parent = await call('post', '/auth/register', { principal: 'turns-parent@local.test', credential: 'Turns-QA-only-20261025' }, null);
    other = await call('post', '/auth/register', { principal: 'turns-other@local.test', credential: 'Turns-QA-only-20261025' }, null);
    const opened = await call('post', '/learning/classroom/sessions', { lessonId: 'soc-5-1-1', useCurrentVersion: true });
    await store.requestContext(() => { seed = structuredClone(store.find('classroomSessions', { id: opened.id })); });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close(); if (pg) { if (!/^study_qa_turns_[a-f0-9]{32}$/.test(schema ?? '')) throw new Error('Invalid owned QA schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(directory, { recursive: true, force: true });
  });
  async function fixture() {
    const row = structuredClone(seed); row.id = 'classroom_' + randomUUID(); row.revealed = 1; row.cursor = 0; row.sentenceCursor = 0;
    await store.transaction(() => store.append('classroomSessions', row)); return call('get', base(row.id));
  }
  const command = (row: any, extra: object = {}) => ({ requestKey: randomUUID(), message: '请用新例子解释这个条件。', modelId: 'deepseek-v4-flash', intent: 'example',
    contentFingerprint: row.contentFingerprint, stepId: row.lesson.steps[row.cursor].id, sentenceCursor: row.sentenceCursor ?? 0,
    presentationVersion: row.presentation.version, unitId: row.presentation.tracks[row.lesson.steps[row.cursor].id].units[row.sentenceCursor ?? 0].id, ...extra });
  const reply = () => vi.spyOn(chat, 'reply').mockResolvedValue({ reply: '先比较相同条件。再换一个观察。', evidenceIds: [], modelId: 'deepseek-v4-flash', modelName: 'Synthetic classroom model', board: { title: '比较条件', points: ['固定相同条件', '比较新的观察'], diagram: null } });
  const create = (row: any, input = command(row), actor = parent) => call('post', base(row.id) + '/turns', input, actor);
  const read = (row: any, turn: any, actor = parent) => call('get', base(row.id) + '/turns/' + turn.id, undefined, actor);
  const control = (row: any, turn: any, action: string) => call('post', base(row.id) + '/turns/' + turn.id + '/' + action, { generation: turn.task.generation, version: turn.task.version });

  it('commits one independent task and replays lost acknowledgments without repeated messages or board notes', async () => {
    const row = await fixture(), input = command(row), mock = reply(), turn = await create(row, input);
    expect(turn.status).toBe('queued'); expect(turn).not.toHaveProperty('authorization'); expect(turn).not.toHaveProperty('context');
    expect((await create(row, input)).id).toBe(turn.id); expect(mock).not.toHaveBeenCalled();
    await worker.runNext(); const done = await read(row, turn), saved = await call('get', base(row.id));
    expect(done.status).toBe('completed'); expect(done.position.sentenceText).toBe(row.presentation.tracks[input.stepId].units[0].text);
    expect(saved.messages).toHaveLength(2); expect(saved.messages[1].speech.version).toBe('speech-v2'); expect(saved.messages[1].board.page).toBe(0);
    expect((await create(row, input)).assistantMessageId).toBe(done.assistantMessageId); expect(await worker.runNext()).toBe(false); expect(mock).toHaveBeenCalledTimes(1);
    await call('post', base(row.id) + '/turns', { ...input, message: 'changed' }, parent, 409);
    await call('get', base(row.id) + '/turns', undefined, other, 403);
  });
  it('keeps the last successful receipt readable at the message limit and fixes legacy replay order', async () => {
    const row = await fixture(), input = command(row), mock = reply();
    await store.transaction(() => { const saved = store.find('classroomSessions', { id: row.id }); saved.messages = Array.from({ length: 98 }, (_, i) => ({ id: 'old-' + i, role: i % 2 ? 'assistant' : 'user', content: '保留的历史', at: row.createdAt })); });
    const turn = await create(row, input); await worker.runNext(); expect((await read(row, turn)).status).toBe('completed');
    expect((await create(row, input)).status).toBe('completed'); await call('post', base(row.id) + '/turns', command(row), parent, 400);
    const legacy = randomUUID(); await store.transaction(() => store.find('classroomSessions', { id: row.id }).requests.push({ key: legacy, hash: require('node:crypto').createHash('sha256').update(JSON.stringify(['旧回执', 'auto', null])).digest('hex'), kind: 'chat' }));
    expect((await call('post', base(row.id) + '/messages', { message: '旧回执', requestKey: legacy })).messages).toHaveLength(100); expect(mock).toHaveBeenCalledTimes(1);
  });
  it('rejects future/stale positions, same keys with changed mode/model and overlapping turns', async () => {
    const row = await fixture(); await call('post', base(row.id) + '/turns', command(row, { stepId: row.lesson.steps[1].id }), parent, 409);
    await call('post', base(row.id) + '/turns', command(row, { unitId: 'future-line' }), parent, 409);
    const input = command(row), turn = await create(row, input);
    await call('post', base(row.id) + '/turns', { ...input, intent: 'simplify' }, parent, 409);
    await call('post', base(row.id) + '/turns', { ...input, modelId: 'gpt-6-astra' }, parent, 409);
    await call('post', base(row.id) + '/turns', command(row), parent, 409);
    await call('post', base(row.id) + '/messages', { message: '旧入口', requestKey: randomUUID() }, parent, 409);
    expect((await control(row, turn, 'cancel')).status).toBe('cancelled');
  });
  it('saves practice help before generation and preserves it after cancellation without sending hints or future narration', async () => {
    const row = await fixture(), questionId = row.lesson.questions[0].id;
    await store.transaction(() => { store.find('classroomSessions', { id: row.id }).hintKeys[questionId] = ['PRIVATE_HINT_NEVER_SENT']; });
    const turn = await create(row, command(row, { questionId }));
    let saved = await call('get', base(row.id)); expect(saved.hintedQuestionIds).toContain(questionId);
    await store.requestContext(() => { const raw = store.find('classroomTurns', { id: turn.id }), context = JSON.parse(raw.context); expect(raw.context).not.toContain('PRIVATE_HINT_NEVER_SENT'); expect(context.practiceQuestion).not.toHaveProperty('hint'); expect(context.teaching).toHaveLength(1); expect(context.teaching[0].narration).toBe(turn.position.sentenceText); });
    await control(row, turn, 'cancel'); saved = await call('post', base(row.id) + '/answers', { questionId, selectedIndex: 0, requestKey: randomUUID() });
    expect(saved.answers[0].hintUsed).toBe(true); expect(saved.messages).toHaveLength(0);
  });
  it('cancels an in-flight response before publication and explicitly retries one new task generation', async () => {
    const row = await fixture(), input = command(row), turn = await create(row, input); let resolve!: (value: unknown) => void, arrived!: () => void;
    const arrival = new Promise<void>(done => { arrived = done; });
    vi.spyOn(chat, 'reply').mockImplementation(() => { arrived(); return new Promise(done => { resolve = done; }); });
    const running = worker.runNext(); await arrival; const latest = await read(row, turn); expect(latest.status).toBe('running');
    await control(row, latest, 'cancel'); resolve({ reply: '不应发布', modelName: 'Synthetic', modelId: input.modelId, evidenceIds: [] }); await running;
    const cancelled = await read(row, turn); expect(cancelled.status).toBe('cancelled'); expect((await call('get', base(row.id))).messages).toHaveLength(0);
    vi.restoreAllMocks(); const mock = reply(), retried = await control(row, cancelled, 'retry'); expect(retried.task.generation).toBe(2);
    await call('post', base(row.id) + '/turns/' + turn.id + '/cancel', { generation: 1, version: latest.task.version }, parent, 409);
    await worker.runNext(); expect((await read(row, turn)).status).toBe('completed'); expect(mock).toHaveBeenCalledTimes(1);
  });
  it('retains frozen teaching context while unrelated preferences and reading position change', async () => {
    const row = await fixture(), turn = await create(row), mock = reply();
    await store.transaction(() => { const saved = store.find('classroomSessions', { id: row.id }); saved.cursor = 1; saved.revealed = 2; saved.sentenceCursor = 0; saved.projectDraft = '新的无关草稿'; saved.revision++; });
    await worker.runNext(); expect((await read(row, turn)).position.cursor).toBe(0); const saved = await call('get', base(row.id));
    expect(saved.cursor).toBe(1); expect(saved.projectDraft).toBe('新的无关草稿'); expect(saved.messages[1].board.page).toBe(0); expect(mock).toHaveBeenCalledTimes(1);
  });
  it('does not publish when the frozen lesson or original guardian grant changes in flight', async () => {
    for (const change of ['lesson', 'grant']) {
      const row = await fixture();
      if (change === 'grant') { const student = await call('post', '/students', { nickname: '插问授权验证', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } }); await store.transaction(() => { store.find('classroomSessions', { id: row.id }).studentId = student.profile.id; }); }
      const turn = await create(row); let resolve!: (value: unknown) => void, arrived!: () => void; const arrival = new Promise<void>(done => { arrived = done; });
      vi.spyOn(chat, 'reply').mockImplementation(() => { arrived(); return new Promise(done => { resolve = done; }); });
      const running = worker.runNext(); await arrival;
      await store.transaction(() => { const saved = store.find('classroomSessions', { id: row.id }); if (change === 'lesson') saved.lesson.objective += ' changed'; else store.find('bindings', { studentId: saved.studentId, parentUserId: parent.user.id }).status = 'revoked'; });
      resolve({ reply: '不能发布的旧回答', modelName: 'Synthetic', modelId: turn.modelId, evidenceIds: [] }); await running;
      await store.requestContext(() => { expect(store.find('classroomSessions', { id: row.id }).messages).toHaveLength(0); });
      vi.restoreAllMocks();
    }
  });
  it('supports all five intents and keeps actual model identity fixed in the queued command', async () => {
    for (const intent of ['question', 'example', 'simplify', 'prerequisite', 'compare']) {
      const row = await fixture(), mock = reply(), turn = await create(row, command(row, { intent, modelId: 'auto' }));
      expect(turn.modelId).not.toBe('auto'); await worker.runNext(); expect((await read(row, turn)).status).toBe('completed'); expect((mock.mock.calls[0][0] as any).modelId).toBe(turn.modelId);
      if (intent === 'prerequisite') expect((mock.mock.calls[0][0] as any).system).toContain('讲解建议'); vi.restoreAllMocks();
    }
  });
  it('recovers a queued turn after database reopen and exports no internal prompt or authorization', async () => {
    const row = await fixture(), turn = await create(row); await app.close(); await boot(); const mock = reply();
    expect((await read(row, turn)).status).toBe('queued'); await worker.runNext(); expect((await read(row, turn)).status).toBe('completed'); expect(mock).toHaveBeenCalledTimes(1);
    await store.requestContext(() => { const { portableRecords, accountRecords } = require('../../../dist/apps/api/src/modules/privacy/privacy-records.js');
      const portable = portableRecords(accountRecords(store, parent.user.id, parent.user.principal), parent.user.id).classroomTurns.find((value: any) => value.id === turn.id);
      expect(portable).toBeDefined(); for (const field of ['authorization','context','history','inputHash','lessonHash','taskId']) expect(portable).not.toHaveProperty(field);
    });
  });
  it('does not publish or invoke a model when privacy deletion removed the queued business record', async () => {
    const row = await fixture(), turn = await create(row), mock = reply();
    await store.transaction(() => { const { accountRecords } = require('../../../dist/apps/api/src/modules/privacy/privacy-records.js'); expect(accountRecords(store, parent.user.id, parent.user.principal).classroomTurns.some((value: any) => value.id === turn.id)).toBe(true); store.remove('classroomTurns', { id: turn.id }); });
    await worker.runNext(); expect(mock).not.toHaveBeenCalled(); expect((await call('get', base(row.id))).messages).toHaveLength(0);
  });
  it('serializes simultaneous same-key submissions and replays the winner', async () => {
    const row = await fixture(), input = command(row), mock = reply();
    const results = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post('/api' + base(row.id) + '/turns').set('Authorization', 'Bearer ' + parent.token).send(input)));
    expect(results.every(result => [201, 409].includes(result.status))).toBe(true); expect(results.some(result => result.status === 201)).toBe(true);
    const turn = await create(row, input); expect(await call('get', base(row.id) + '/turns')).toHaveLength(1);
    await worker.runNext(); expect((await read(row, turn)).status).toBe('completed'); expect(mock).toHaveBeenCalledTimes(1);
  });
  it('uses the actual learner allowlist and rejects results after its original access version changes', async () => {
    const row = await fixture(), studentId = (await call('post', '/students', { nickname: '学生插问验证', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '验证持久课堂插问' });
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() });
    const learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    await store.transaction(() => { const saved = store.find('classroomSessions', { id: row.id }); saved.studentId = studentId; saved.ownerUserId = learner.user.id; });
    const turn = await create(row, command(row), learner); expect((await read(row, turn, learner)).status).toBe('queued');
    await call('get', base(row.id) + '/turns', undefined, parent, 403);
    await store.transaction(() => { store.find('studentLearningAccess', { studentId }).version++; }); const mock = reply();
    await worker.runNext(); expect(mock).not.toHaveBeenCalled();
    await store.requestContext(async () => { expect(store.find('classroomSessions', { id: row.id }).messages).toHaveLength(0); expect((await store.tasks.get(store.find('classroomTurns', { id: turn.id }).taskId)).state).toBe('failed'); });
  });
  it('retains provider failure until an explicit retry and never silently changes model', async () => {
    const row = await fixture(), turn = await create(row), mock = vi.spyOn(chat, 'reply').mockRejectedValue(new Error('Synthetic provider unavailable'));
    await worker.runNext(); const failed = await read(row, turn); expect(failed.status).toBe('failed'); expect(await worker.runNext()).toBe(false);
    mock.mockResolvedValue({ reply: '服务恢复后的说明。', modelName: 'Synthetic', modelId: turn.modelId, evidenceIds: [] });
    await control(row, failed, 'retry'); await worker.runNext(); expect((await read(row, turn)).status).toBe('completed'); expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls.every(([input]: any) => input.modelId === turn.modelId)).toBe(true);
  });
  it('removes turns through actual child privacy deletion and prevents queued model calls', async () => {
    const row = await fixture(), studentId = (await call('post', '/students', { nickname: '隐私删除插问验证', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    await store.transaction(() => { store.find('classroomSessions', { id: row.id }).studentId = studentId; });
    const turn = await create(row), mock = reply(), preview = await call('get', `/privacy/students/${studentId}/deletion-preview`);
    await call('post', `/privacy/students/${studentId}/delete`, { credential: 'Turns-QA-only-20261025', confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() });
    await worker.runNext(); expect(mock).not.toHaveBeenCalled(); await store.requestContext(() => { expect(store.find('classroomTurns', { id: turn.id })).toBeUndefined(); });
  });
  it('recovers an expired worker lease after restart and fences the previous worker output', async () => {
    const row = await fixture(), turn = await create(row), old = await store.tasks.claim(['classroom.turn.reply'], 1);
    expect(old).not.toBeNull(); await app.close(); await boot(); const mock = reply(); await worker.runNext();
    expect((await read(row, turn)).status).toBe('completed'); expect(mock).toHaveBeenCalledTimes(1);
    await expect(store.transaction(() => { store.find('classroomSessions', { id: row.id }).projectDraft = 'STALE_WORKER_OUTPUT'; }, { id: old.id, token: old.leaseToken })).rejects.toThrow();
    expect((await call('get', base(row.id))).projectDraft).not.toBe('STALE_WORKER_OUTPUT');
  });
  it.skipIf(Boolean(process.env.STUDY_TEST_CLASSROOM_TURN_POSTGRES_URL))('retains turn context through a real SQLite backup and cold restore with invalid old leases', async () => {
    const row = await fixture(), turn = await create(row), old = await store.tasks.claim(['classroom.turn.reply'], 1);
    const recovery = mkdtempSync(join(tmpdir(), 'study-turn-backup-'));
    try {
      const backup = require('../../../../../scripts/operations/backup.cjs');
      await backup.createBundle({ dataDir: directory, destination: join(recovery, 'bundle') });
      expect((await backup.verifyBundle({ bundle: join(recovery, 'bundle') })).verifiedFiles).toBe(1);
      await app.close(); await backup.restoreBundle({ bundle: join(recovery, 'bundle'), destination: join(recovery, 'restored') });
      process.env.STUDY_DATA_DIR = join(recovery, 'restored'); await boot();
      const logged = await call('post', '/auth/login', { principal: parent.user.principal, credential: 'Turns-QA-only-20261025' }, null);
      const previousParent = parent; parent = logged; const mock = reply();
      try {
        const restored = await read(row, turn); expect(restored.task.generation).toBeGreaterThan(1);
        await worker.runNext(); expect((await read(row, turn)).status).toBe('completed'); expect(mock).toHaveBeenCalledTimes(1);
        await expect(store.transaction(() => {}, { id: old.id, token: old.leaseToken })).rejects.toThrow();
      } finally { parent = previousParent; }
      await app.close(); process.env.STUDY_DATA_DIR = directory; await boot();
      // Finish the original source copy independently; restored output cannot update it.
      const sourceMock = reply(); await worker.runNext(); expect((await read(row, turn)).status).toBe('completed'); expect(sourceMock).toHaveBeenCalled();
    } finally { rmSync(recovery, { recursive: true, force: true }); }
  });
});
