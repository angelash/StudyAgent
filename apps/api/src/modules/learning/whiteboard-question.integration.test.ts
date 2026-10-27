import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { whiteboardPresentation } from '@study-agent/contracts';
import { Pool } from 'pg';

const postgres = process.env.STUDY_TEST_WHITEBOARD_QUESTION_POSTGRES_URL;
describe('original whiteboard questions over real HTTP and durable ' + (postgres ? 'PostgreSQL' : 'SQLite') + ' tasks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-whiteboard-question-'));
  const names = ['NODE_ENV','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED','DATABASE_URL'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, worker: any, chat: any, owner: any, other: any, calls: any[] = [], registrations = 0;
  let controlDatabase: Pool | undefined, schema: string | undefined;
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = owner, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (path === '/auth/register') query = query.set('X-Forwarded-For', '198.18.77.' + (++registrations));
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  async function register() {
    const credential = 'Synthetic-question-' + randomUUID();
    return { ...await call('post', '/auth/register', { principal: 'question-' + randomUUID() + '@local.test', credential }, null), credential };
  }
  function teachingReply(reply: string, anchors: string[] = []) {
    return { reply, anchors, board: { title: '补充说明', points: ['保留完整条件'], diagram: null, table: null, formulas: [],
      anchors: { points: [reply.split('。')[0]], tableRows: [], formulas: [] } } };
  }
  function provider() {
    vi.spyOn(chat, 'structured').mockImplementation(async (input: any, _schema: any, check: any) => {
      calls.push(input); const context = JSON.parse(input.context);
      return { ...check(teachingReply('先明确同一个比较单位，再保留条件核对。', [context.anchors[0].id])), modelId: input.modelId, modelName: '受控匿名模型' };
    });
  }
  async function boot() {
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    worker = app.get(load('modules/learning/whiteboard-question-worker.service').WhiteboardQuestionWorkerService);
    chat = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService); provider();
  }
  async function board(kind = 'topic', actor = owner, studentId: string | null = null, id = 'board-' + randomUUID()) {
    const now = new Date().toISOString(), value: any = { id, studentId, subject: studentId ? 'math' : null, title: '合成计数单位', prompt: '解释匿名单位关系',
      scenes: [{ id: 'intro', kind: 'concept', title: '比较单位', narration: '先确认单位相同。再核对整体相同。', body: '保留条件。', bullets: ['先确认单位相同', '再核对整体相同'], targetAtomIds: [], durationMs: 1000 },
        { id: 'future', kind: 'check', title: '尚未讲到的练习', narration: '未展示的验证问题。', body: '不提前放进模型。', bullets: [], targetAtomIds: [], durationMs: 1000 }],
      width: 1280, height: 720, durationMs: 2000, fingerprint: createHash('sha256').update(id).digest('hex'), createdAt: now, updatedAt: now };
    if (kind === 'topic') Object.assign(value, { kind: 'ai-topic-whiteboard', ownerUserId: actor.user.id, sourceDraftId: 'fixture-' + id,
      origin: { draftId: null, modelId: 'deepseek-v4-flash', modelName: '受控匿名模型', review: null, teacherReviewStatus: 'pending', formalMeasurementEligible: false } });
    else value.atomId = 'unit';
    await store.transaction(() => store.append(kind === 'topic' ? 'studioTopicWhiteboards' : 'studioWhiteboards', value));
    return { kind, value, path: '/learning/studio/' + (kind === 'topic' ? 'topic-whiteboards/' : 'whiteboards/') + id + '/questions' };
  }
  async function prepare(original: Awaited<ReturnType<typeof board>>, changes: object = {}, actor = owner) {
    const unit = whiteboardPresentation(original.value).units[0], query = '?fingerprint=' + original.value.fingerprint + '&unitId=' + encodeURIComponent(unit.id);
    const context = await call('get', original.path + '/context' + query, undefined, actor);
    const command = { fingerprint: original.value.fingerprint, unitId: unit.id, contextVersion: context.contextVersion,
      modelId: 'deepseek-v4-flash', intent: 'question', message: '为什么要先统一单位？', requestKey: randomUUID(),
      bookmark: { progress: 0.4, audioTime: 0.7, mode: 'cloud', voice: 'original-voice', speed: 1.25 }, ...changes };
    return { command, context, turn: await call('post', original.path, command, actor) };
  }
  const control = (turn: any) => ({ requestKey: randomUUID(), generation: turn.task.generation, version: turn.task.version });
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: postgres ? 'postgres' : 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    if (postgres) {
      controlDatabase = new Pool({ connectionString: postgres });
      expect((await controlDatabase.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_question_http_' + randomUUID().replace(/-/g, ''); await controlDatabase.query('CREATE SCHEMA "' + schema + '"');
      const scoped = new URL(postgres); scoped.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = scoped.toString();
    } else delete process.env.DATABASE_URL;
    await boot(); owner = await register(); other = await register();
  });
  beforeEach(() => { calls = []; vi.restoreAllMocks(); provider(); });
  afterAll(async () => {
    vi.restoreAllMocks(); await app?.close();
    if (controlDatabase) {
      try { if (schema) { if (!/^study_qa_question_http_[a-f0-9]{32}$/.test(schema)) throw Error('Unknown question QA schema'); await controlDatabase.query('DROP SCHEMA "' + schema + '" CASCADE'); } }
      finally { await controlDatabase.end(); }
    }
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    rmSync(directory, { recursive: true, force: true });
  });
  it.each(['question', 'example', 'simplify', 'prerequisite', 'compare'])('binds %s to the exact shown original and publishes source-owned anchors without changing the manuscript', async intent => {
    const original = await board(), { turn, command } = await prepare(original, { intent });
    expect(await worker.runNext()).toBe(true);
    const result = await call('get', original.path + '/' + turn.id);
    expect(result.status).toBe('completed'); expect(result.position.bookmark).toEqual(command.bookmark);
    expect(result.reply.anchors[0]).toMatchObject({ sceneId: 'intro', unitId: command.unitId }); expect(result.reply.modelId).toBe(command.modelId);
    expect(calls).toHaveLength(1); expect(calls[0].modelId).toBe(command.modelId); expect(calls[0].context).not.toContain('未展示的验证问题');
    expect(calls[0].context).not.toContain(owner.user.id); expect(calls[0].history).toEqual([]);
    expect(await store.requestContext(() => store.find('studioTopicWhiteboards', { id: original.value.id }))).toEqual(original.value);
  });
  it('restores a lost original receipt before re-resolving the model, and conflicts on changed content, model or board', async () => {
    const original = await board(), prepared = await prepare(original);
    const models = app.get(load('modules/ai/xiaojiu-models.service').XiaojiuModelsService), resolver = vi.spyOn(models, 'resolve').mockImplementation(() => { throw Error('Do not replace original model'); });
    expect((await call('post', original.path, prepared.command)).id).toBe(prepared.turn.id); resolver.mockRestore();
    expect((await call('get', original.path + '/requests/' + prepared.command.requestKey)).id).toBe(prepared.turn.id);
    await call('post', original.path, { ...prepared.command, message: '换一个问题' }, owner, 409);
    await call('post', original.path, { ...prepared.command, modelId: 'gpt-6-astra' }, owner, 409);
    await call('post', (await board()).path, prepared.command, owner, 409);
    await call('get', original.path, undefined, other, 404); await call('get', original.path + '/' + prepared.turn.id, undefined, other, 404);
    await call('get', original.path, undefined, null, 401);
    await worker.runNext();
  });
  it('keeps one active turn and supplies bounded completed history on subsequent questions', async () => {
    const original = await board(), first = await prepare(original);
    await call('post', original.path, { ...first.command, requestKey: randomUUID() }, owner, 409);
    await worker.runNext(); const second = await prepare(original); await worker.runNext();
    expect(calls[1].history[0]).toEqual({ role: 'user', content: first.command.message });
    expect(calls[1].history[1].role).toBe('assistant'); expect(calls[1].history[1].content).toContain('先明确同一个比较单位，再保留条件核对。');
    expect(calls[1].history[1].content).toContain('保留完整条件'); expect(calls[1].history[1].content).not.toContain('sourceSha256');
    const page = await call('get', original.path + '?page=1&pageSize=1'); expect(page).toMatchObject({ page: 1, pageSize: 1, hasMore: true, total: 2 });
    expect(page.turns[0].id).toBe(first.turn.id); expect((await call('get', original.path + '?page=2&pageSize=1')).turns[0].id).toBe(second.turn.id);
  });
  it('cancels queued work, replays a control key, and retries the exact original request/model', async () => {
    const original = await board(), { turn } = await prepare(original), command = control(turn);
    const cancelled = await call('post', original.path + '/' + turn.id + '/cancel', command); expect(cancelled.status).toBe('cancelled');
    expect((await call('post', original.path + '/' + turn.id + '/cancel', command)).status).toBe('cancelled'); expect(await worker.runNext()).toBe(false);
    await call('post', original.path + '/' + turn.id + '/retry', command, owner, 409);
    const retry = await call('post', original.path + '/' + turn.id + '/retry', control(cancelled)); expect(retry.task.generation).toBe(2);
    await worker.runNext(); expect((await call('get', original.path + '/' + turn.id)).status).toBe('completed'); expect(calls[0].modelId).toBe('deepseek-v4-flash');
  });
  it.each(['cancel', 'original', 'login'])('does not publish a late response after %s changes', async kind => {
    const actor = kind === 'login' ? await register() : owner, original = await board('topic', actor), { turn } = await prepare(original, {}, actor);
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    vi.restoreAllMocks(); vi.spyOn(chat, 'structured').mockImplementation(async (input: any, _schema: any, check: any) => {
      entered(); await wait; return { ...check(teachingReply('迟到的回答不得发布。')), modelId: input.modelId, modelName: '受控匿名模型' };
    });
    const pending = worker.runNext(); await started;
    if (kind === 'cancel') { const active = await call('get', original.path + '/' + turn.id, undefined, actor); await call('post', original.path + '/' + turn.id + '/cancel', control(active), actor); }
    else if (kind === 'original') await store.transaction(() => { store.find('studioTopicWhiteboards', { id: original.value.id }).scenes[1].body = '未来稿也改变版本校验。'; });
    else await call('post', '/auth/logout', {}, actor);
    release(); await pending;
    const stored = await store.requestContext(() => store.find('whiteboardQuestionTurns', { id: turn.id })); expect(stored.reply).toBeNull();
    expect((await store.tasks.get(stored.taskId)).state).toBe(kind === 'cancel' ? 'cancelled' : 'failed');
  });
  it('rejects unknown model anchors and publishes only after an explicit original retry', async () => {
    const original = await board(), { turn } = await prepare(original);
    vi.restoreAllMocks(); vi.spyOn(chat, 'structured').mockImplementation(async (_input: any, _schema: any, check: any) => check(teachingReply('不能伪造引用。', ['fake-source'])));
    await worker.runNext(); const failed = await call('get', original.path + '/' + turn.id); expect(failed.status).toBe('failed'); expect(failed.reply).toBeNull();
    vi.restoreAllMocks(); provider(); await call('post', original.path + '/' + turn.id + '/retry', control(failed)); await worker.runNext();
    expect((await call('get', original.path + '/' + turn.id)).status).toBe('completed');
  });
  it('reopens the native database queue and restores the original turn, bookmark and receipt', async () => {
    const original = await board(), { turn, command } = await prepare(original); vi.restoreAllMocks(); await app.close(); await boot();
    expect((await call('get', original.path + '/requests/' + command.requestKey)).id).toBe(turn.id); await worker.runNext();
    const restored = await call('get', original.path + '/' + turn.id); expect(restored.status).toBe('completed'); expect(restored.position.bookmark).toEqual(command.bookmark);
  });
  it('does not feed old answers into a changed original or replace the old sentence bookmark', async () => {
    const original = await board(), first = await prepare(original); await worker.runNext();
    await store.transaction(() => { store.find('studioTopicWhiteboards', { id: original.value.id }).scenes[1].body = '新版的完整条件。'; });
    await prepare(original); await worker.runNext();
    expect(calls[1].history).toEqual([]); expect((await call('get', original.path + '/' + first.turn.id)).position).toMatchObject({ sentenceText: '先确认单位相同。' });
  });
  it('uses the child guidance authorization path and fences a revoked guardian while retaining the first answer', async () => {
    const child = await call('post', '/students', { nickname: '匿名原句学习者', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } });
    const studentId = child.profile.id, original = await board('guidance', owner, studentId), { turn } = await prepare(original);
    const initial = { id: 'fixture-answer-' + randomUUID(), studentId, originalAnswer: '合成首次回答不变' };
    await store.transaction(() => store.append('diagnosticResponses', initial));
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    vi.restoreAllMocks(); vi.spyOn(chat, 'structured').mockImplementation(async (input: any, _schema: any, check: any) => {
      calls.push(input); entered(); await wait;
      return { ...check(teachingReply('原授权已撤回。')), modelId: input.modelId, modelName: '受控匿名模型' };
    });
    const pending = worker.runNext(); await started;
    expect(JSON.parse(calls[0].context).audience).toBe('student'); expect(calls[0].context).not.toContain(studentId);
    await store.transaction(() => { store.find('bindings', { id: child.binding.id }).status = 'revoked'; }); release(); await pending;
    const row = await store.requestContext(() => store.find('whiteboardQuestionTurns', { id: turn.id })); expect(row.reply).toBeNull();
    await call('get', original.path, undefined, owner, 404);
    expect(await store.requestContext(() => store.find('diagnosticResponses', { id: initial.id }))).toEqual(initial);
  });
  it('rejects another board-kind route and enforces one active request under concurrent creation', async () => {
    const original = await board(), { command, turn } = await prepare(original);
    await call('post', original.path + '/' + turn.id + '/cancel', control(turn));
    const responses = await Promise.all([randomUUID(), randomUUID()].map(key => request(app.getHttpServer()).post('/api' + original.path)
      .set('Authorization', 'Bearer ' + owner.token).send({ ...command, requestKey: key })));
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    await worker.runNext();
    await call('get', original.path.replace('topic-whiteboards', 'whiteboards') + '/' + turn.id, undefined, owner, 404);
  });
  it('serves a structured supplementary original through a private route without changing the source manuscript', async () => {
    const original = await board(), { turn, command } = await prepare(original, { bookmark: { progress: .4, audioTime: .7, mode: 'cloud', voice: 'original-voice', speed: 1.25,
      camera: { zoom: 1.5, x: 25, y: 60, follow: false } } });
    await call('get', original.path + '/' + turn.id + '/board', undefined, owner, 409); await worker.runNext();
    const teaching = await call('get', original.path + '/' + turn.id + '/board');
    expect(teaching).toMatchObject({ kind: 'question-whiteboard', originalBoardKind: 'topic', originalBoardId: original.value.id,
      turnId: turn.id, structureStatus: 'structured', originalPosition: { bookmark: command.bookmark } });
    expect(teaching.scenes).toHaveLength(1); expect(teaching.scenes[0].bullets).toEqual(['保留完整条件']);
    expect(teaching.scenes[0].reveal.sourceText).toBe('先明确同一个比较单位，再保留条件核对。');
    await call('get', original.path + '/' + turn.id + '/board', undefined, other, 404);
    await call('get', original.path.replace('topic-whiteboards','whiteboards') + '/' + turn.id + '/board', undefined, owner, 404);
    expect(await store.requestContext(() => store.find('studioTopicWhiteboards', { id: original.value.id }))).toEqual(original.value);
  });
  it('narrates only the selected frozen answer sentence and identifies actual WAV bytes, rejecting mismatched identities', async () => {
    const original = await board(), { turn } = await prepare(original); await worker.runNext(); const teaching = await call('get', original.path + '/' + turn.id + '/board');
    const speech = app.get(load('modules/ai/speech.service').SpeechService), captured: string[] = [];
    vi.spyOn(speech, 'synthesize').mockImplementation(async (...args: unknown[]) => { expect(typeof args[0]).toBe('string'); captured.push(args[0] as string); const content = Buffer.alloc(44 + 16000);
      content.write('RIFF',0); content.writeUInt32LE(content.length-8,4); content.write('WAVEfmt ',8); content.writeUInt32LE(16,16); content.writeUInt16LE(1,20); content.writeUInt16LE(1,22);
      content.writeUInt32LE(8000,24); content.writeUInt32LE(16000,28); content.writeUInt16LE(2,32); content.writeUInt16LE(16,34); content.write('data',36); content.writeUInt32LE(16000,40);
      return { content, contentType: 'audio/wav' };
    });
    const unit = whiteboardPresentation(teaching).units[0], path = original.path + '/' + turn.id + '/board/narration/' + unit.sceneId,
      command = { voice: 'fixture-a', presentationVersion: 'whiteboard-speech-v1', fingerprint: teaching.fingerprint, replyFingerprint: teaching.replyFingerprint, unitId: unit.id };
    const response = await request(app.getHttpServer()).post('/api' + path).set('Authorization','Bearer ' + owner.token).send(command).buffer(true)
      .parse((res, done) => { const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks))); });
    expect(response.status).toBe(201); expect(response.body.subarray(0,4).toString()).toBe('RIFF'); expect(response.body.subarray(8,12).toString()).toBe('WAVE');
    expect(response.headers['x-whiteboard-fingerprint']).toBe(teaching.fingerprint); expect(response.headers['x-whiteboard-unit']).toBe(unit.id); expect(captured).toEqual([unit.text]);
    await call('post', path, { ...command, replyFingerprint: 'b'.repeat(64) }, owner, 409);
    await call('post', path, { ...command, unitId: 'foreign-unit' }, owner, 409); expect(captured).toHaveLength(1);
  });
  it('does not release late answer audio after the original login is revoked', async () => {
    const actor = await register(), original = await board('topic',actor), { turn } = await prepare(original, {}, actor); await worker.runNext();
    const teaching = await call('get', original.path + '/' + turn.id + '/board', undefined, actor), unit = whiteboardPresentation(teaching).units[0], speech = app.get(load('modules/ai/speech.service').SpeechService);
    let release!: () => void, enter!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { enter = resolve; });
    vi.spyOn(speech,'synthesize').mockImplementation(async () => { enter(); await waiting; return { content: Buffer.from('LATE-AUDIO-MUST-NOT-BE-RELEASED'), contentType: 'audio/wav' }; });
    const pending = request(app.getHttpServer()).post('/api' + original.path + '/' + turn.id + '/board/narration/' + unit.sceneId).set('Authorization','Bearer ' + actor.token)
      .send({ voice:'fixture-a',presentationVersion:'whiteboard-speech-v1',fingerprint:teaching.fingerprint,replyFingerprint:teaching.replyFingerprint,unitId:unit.id }).then(response => response);
    await started; await call('post','/auth/logout',{},actor); release(); const response = await pending;
    expect(response.status).toBe(401); expect(JSON.stringify(response.body)).not.toContain('LATE-AUDIO');
    const stored = await store.requestContext(() => store.find('whiteboardQuestionTurns',{id:turn.id})); expect(stored.status).toBe('completed');
  });
  it('exports every saved question beyond the current history page and exposes a fresh identity for the final download check', async () => {
    const original = await board();
    for (let index=0;index<12;index++) { await prepare(original, { message:'完整笔记问题 ' + index }); await worker.runNext(); }
    const page = await call('get',original.path + '?page=1&pageSize=10'); expect(page.turns).toHaveLength(10); expect(page.hasMore).toBe(true);
    const notes = await call('get',original.path + '/notes'); expect(notes.turns).toHaveLength(12); expect(notes.original).toEqual((({ownerUserId:_owner,sourceDraftId:_draft,...rest})=>rest)(original.value));
    expect(notes.turns[11].message).toBe('完整笔记问题 11'); expect(notes.turns.every((row:any)=>row.originalStatus==='current'&&row.status==='completed')).toBe(true);
    const identity = await call('get',original.path + '/notes/identity'); expect(identity).toMatchObject({ ownerId:owner.user.id,definitionHash:notes.definitionHash });
    await store.transaction(()=>{store.find('studioTopicWhiteboards',{id:original.value.id}).scenes[1].body='完整新版本条件。';});
    expect((await call('get',original.path + '/notes/identity')).definitionHash).not.toBe(notes.definitionHash);
    expect((await call('get',original.path + '/notes')).turns.every((row:any)=>row.originalStatus==='archived')).toBe(true);
    await call('get',original.path + '/notes',undefined,other,404);
  });
  it('exports the actual conversation without private authorization/prompt internals, and deletes pending work with its owner', async () => {
    const actor = await register(), original = await board('topic', actor), { turn } = await prepare(original, {}, actor);
    const exported = await call('post', '/privacy/account/export', { credential: actor.credential, requestKey: randomUUID() }, actor);
    const rows = exported.accountRecords.whiteboardQuestionTurns; expect(rows).toHaveLength(1); expect(rows[0].id).toBe(turn.id);
    for (const name of ['authorization', 'prepared', 'history', 'inputHash', 'definitionHash', 'taskId', 'commands']) expect(rows[0]).not.toHaveProperty(name);
    const preview = await call('get', '/privacy/account/deletion-preview', undefined, actor);
    await call('post', '/privacy/account/delete', { credential: actor.credential, requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint }, actor);
    expect(await store.requestContext(() => store.find('whiteboardQuestionTurns', { id: turn.id }))).toBeUndefined();
    expect(await worker.runNext()).toBe(false);
  });
});
