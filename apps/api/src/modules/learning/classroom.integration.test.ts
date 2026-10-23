import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classroomCourse, classroomLesson } from './classroom-curriculum';
import { classroomSentences } from '@study-agent/contracts';
import { conceptNotes } from './classroom-board-notes';

describe('classroom teaching sessions and persistent isolation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-classroom-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION',
    'OPENAI_API_KEY', 'MINIMAX_API_KEY', 'XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any, parent: any, other: any;
  async function boot() {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
  }
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
      STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    delete process.env.OPENAI_API_KEY; delete process.env.MINIMAX_API_KEY;
    await boot();
    parent = (await request(app.getHttpServer()).post('/api/auth/register').send({ principal: 'classroom@test', credential: 'classroom-test-only' }).expect(201)).body.data;
    other = (await request(app.getHttpServer()).post('/api/auth/register').send({ principal: 'classroom-other@test', credential: 'classroom-test-only' }).expect(201)).body.data;
  });
  afterAll(async () => {
    await app?.close();
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(directory, { recursive: true, force: true });
  });
  async function call(method: 'get' | 'post' | 'patch', path: string, body?: unknown, actor = parent,
    status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path).set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    return (await query.expect(status)).body.data;
  }
  const base = '/learning/classroom';

  it('provides 60 unique micro-lessons and five unit checks with complete private answer keys', async () => {
    const catalog = await call('get', base + '/catalog');
    expect(catalog.course.units).toHaveLength(5);
    const ids = catalog.course.units.flatMap((unit: any) => unit.lectures.flatMap((lecture: any) => lecture.lessons.map((lesson: any) => lesson.id)));
    expect(new Set(ids).size).toBe(60);
    for (const id of ids) {
      const lesson = classroomLesson(id)!;
      expect(lesson.steps.length).toBeGreaterThanOrEqual(6);
      expect(new Set(lesson.steps.map(step => step.id)).size).toBe(lesson.steps.length);
      expect(lesson.questions[0].options).toHaveLength(4);
      expect(conceptNotes[lesson.title]?.length).toBeGreaterThanOrEqual(2);
      for (const step of lesson.steps) {
        expect(step.blocks.some(block => block.kind === 'text' && block.text === step.narration)).toBe(false);
        expect(classroomSentences(step.narration).join('').replace(/\s/g, '')).toBe(step.narration.replace(/\s/g, ''));
      }
    }
    for (const [index, unit] of classroomCourse().units.entries()) expect(classroomLesson('unit-exam:' + unit.id)?.questions).toHaveLength(index === 0 ? 16 : 12);
    expect(classroomLesson('soc-1-1-1')?.questions).toHaveLength(5);
    const session = await call('post', base + '/sessions', { lessonId: 'soc-1-1-1' });
    const replay = await call('post', base + '/sessions', { lessonId: 'soc-1-1-1' });
    expect(replay.id).toBe(session.id);
    expect(session).not.toHaveProperty('answerKeys'); expect(session).not.toHaveProperty('requests');
    expect(session.lesson.questions[0]).not.toHaveProperty('answer');
    await call('get', base + '/sessions/' + session.id, undefined, other, 403);
    await call('patch', base + '/sessions/' + session.id, { expectedRevision: 0, cursor: 1, revealed: 2 }, other, 403);
    await call('post', base + '/sessions/' + session.id + '/narration/' + encodeURIComponent(session.lesson.steps[0].id), {}, other, 403);
  });

  it('keeps first answers, hint flags and skip receipts immutable without creating mastery evidence', async () => {
    const session = await call('post', base + '/sessions', { lessonId: 'soc-1-1-2' });
    const questionId = session.lesson.questions[0].id, requestKey = randomUUID();
    const command = { questionId, selectedIndex: 0, hintUsed: true, requestKey };
    const first = await call('post', base + '/sessions/' + session.id + '/answers', command);
    expect(first.answers).toHaveLength(1); expect(first.answers[0].hintUsed).toBe(true);
    const replay = await call('post', base + '/sessions/' + session.id + '/answers', command);
    expect(replay.answers).toEqual(first.answers);
    await call('post', base + '/sessions/' + session.id + '/answers', { ...command, selectedIndex: 1 }, parent, 409);
    const altered = await call('post', base + '/sessions/' + session.id + '/answers', { questionId, selectedIndex: 1, requestKey: randomUUID() });
    expect(altered.answers).toEqual(first.answers);
    await call('post', base + '/sessions/' + session.id + '/messages', { message: '请提示如何比较两个解释', modelId: 'auto', requestKey: randomUUID() }, parent, 503);
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const store = app.get(InMemoryStoreService);
    await store.requestContext(() => { expect(store.inspect('diagnosticResponses')).toHaveLength(0); expect(store.inspect('diagnosticPlans')).toHaveLength(0); });
  });

  it('synthesizes one exact subtitle unit, rejects invalid indices and restores the sentence cursor', async () => {
    const session = await call('post', base + '/sessions', { lessonId: 'soc-4-1-1' });
    const step = session.lesson.steps[0], sentences = classroomSentences(step.narration);
    const { SpeechService } = require('../../../dist/apps/api/src/modules/ai/speech.service.js');
    const synthesize = vi.spyOn(app.get(SpeechService), 'synthesize').mockResolvedValue({ content: Buffer.alloc(44), contentType: 'audio/wav', provider: 'minimax' });
    try {
      await request(app.getHttpServer()).post('/api' + base + '/sessions/' + session.id + '/narration/' + step.id)
        .set('Authorization', 'Bearer ' + parent.token).send({ sentenceIndex: 1 }).expect(201);
      expect(synthesize).toHaveBeenCalledWith(sentences[1], undefined);
      await call('post', base + '/sessions/' + session.id + '/narration/' + step.id, { sentenceIndex: sentences.length }, parent, 400);
      expect(synthesize).toHaveBeenCalledTimes(1);
      await call('patch', base + '/sessions/' + session.id, { expectedRevision: 0, cursor: 0, revealed: 1, sentenceCursor: sentences.length }, parent, 400);
      await call('patch', base + '/sessions/' + session.id, { expectedRevision: 0, cursor: 0, revealed: 1, sentenceCursor: 1 });
    } finally { synthesize.mockRestore(); }
    await app.close(); await boot();
    expect((await call('get', base + '/sessions/' + session.id)).sentenceCursor).toBe(1);
  });

  it('persists supplemental board with its original page and keeps it private after restart', async () => {
    const session = await call('post', base + '/sessions', { lessonId: 'soc-3-1-1' });
    await call('patch', base + '/sessions/' + session.id, { expectedRevision: 0, cursor: 3, revealed: 4 });
    const { XiaojiuChatService } = require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js');
    const board = { title: '先观察规则，再核查解释', points: ['记录情境中的规则与反例。'], diagram: null };
    const reply = vi.spyOn(app.get(XiaojiuChatService), 'reply').mockResolvedValue({ reply: '可以比较两个匿名情境中的规则。',
      evidenceIds: [], modelId: 'fixture', modelName: '课堂测试模型', board });
    const command = { message: '如何验证规则的影响？', questionId: session.lesson.questions[0].id, requestKey: randomUUID() };
    try {
      const answered = await call('post', base + '/sessions/' + session.id + '/messages', command);
      expect(answered.messages.at(-1).board).toEqual({ ...board, page: 1 });
      expect(reply).toHaveBeenCalledWith(expect.objectContaining({ classroomBoard: true }));
      expect(JSON.parse((reply.mock.calls[0][0] as { context: string }).context).practiceQuestion.id).toBe(command.questionId);
      const replay = await call('post', base + '/sessions/' + session.id + '/messages', command);
      expect(replay.messages).toEqual(answered.messages); expect(reply).toHaveBeenCalledTimes(1);
      await call('get', base + '/sessions/' + session.id, undefined, other, 403);
      await call('post', base + '/sessions/' + session.id + '/messages', command, other, 403);
    } finally { reply.mockRestore(); }
    await app.close(); await boot();
    const reloaded = await call('get', base + '/sessions/' + session.id);
    expect(reloaded.messages.at(-1).board).toEqual({ ...board, page: 1 });
    const assistedAnswer = await call('post', base + '/sessions/' + session.id + '/answers', { questionId: command.questionId, selectedIndex: 0, requestKey: randomUUID(), hintUsed: false });
    expect(assistedAnswer.answers[0].hintUsed).toBe(true);
  });

  it('rejects invalid or stale progress, then restores frozen content, answers and project text after restart', async () => {
    let session = await call('post', base + '/sessions', { lessonId: 'soc-2-1-1' });
    await call('patch', base + '/sessions/' + session.id, { expectedRevision: 0, cursor: 900, revealed: 901 }, parent, 400);
    await call('patch', base + '/sessions/' + session.id, { expectedRevision: 0, cursor: 0, revealed: 1, completed: true }, parent, 400);
    session = await call('patch', base + '/sessions/' + session.id, { expectedRevision: 0, cursor: 2, revealed: 3, projectDraft: '匿名观察：图书馆的安静规范与提醒方式。' });
    await call('patch', base + '/sessions/' + session.id, { expectedRevision: 0, cursor: 1, revealed: 2 }, parent, 409);
    session = await call('post', base + '/sessions/' + session.id + '/answers', { questionId: session.lesson.questions[0].id, selectedIndex: null, requestKey: randomUUID() });
    const fingerprint = session.contentFingerprint;
    await app.close(); await boot();
    const restored = await call('get', base + '/sessions/' + session.id);
    expect(restored.contentFingerprint).toBe(fingerprint);
    expect(restored).toMatchObject({ cursor: 2, revealed: 3, projectDraft: '匿名观察：图书馆的安静规范与提醒方式。' });
    expect(restored.answers[0].skipped).toBe(true);
    expect(restored.lesson).toEqual(session.lesson);
    const { accountRecords, portableRecords } = require('../../../dist/apps/api/src/modules/privacy/privacy-records.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const store = app.get(InMemoryStoreService);
    await store.requestContext(() => {
      const exported = portableRecords(accountRecords(store, parent.user.id, parent.user.principal), parent.user.id);
      expect(exported.classroomSessions.some((row: any) => row.id === session.id)).toBe(true);
      expect(JSON.stringify(exported.classroomSessions)).not.toContain('answerKeys');
      expect(JSON.stringify(exported.classroomSessions)).not.toContain('requestKey');
    });
  });

  it('restores edited calendar confirmation, time and completion after a SQLite restart', async () => {
    const created = await call('post', '/students', { nickname: '日历持久化', grade: 5, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } });
    const studentId = created.profile.id;
    const event = await call('post', '/learning/studio/calendar/events', { studentId, subject: 'math',
      title: '日历重启验证', description: '核对完成状态', startsAt: '2026-11-02T10:00:00Z', endsAt: '2026-11-02T10:25:00Z', requestKey: randomUUID() });
    const changed = await call('post', '/learning/studio/calendar/events/' + event.id + '/update', { expectedRevision: 0,
      startsAt: '2026-11-03T11:00:00Z', endsAt: '2026-11-03T11:40:00Z', confirmed: false, status: 'completed' });
    await app.close(); await boot();
    const overview = await call('get', '/learning/studio/overview?studentId=' + studentId + '&subject=math');
    expect(overview.integrations.events.find((row: any) => row.id === event.id)).toEqual(changed);
    await call('post', '/learning/studio/calendar/batch-remove', { ids: [event.id] });
    await app.close(); await boot();
    const removed = await call('get', '/learning/studio/overview?studentId=' + studentId + '&subject=math');
    expect(removed.integrations.events).toHaveLength(0);
  });
});
