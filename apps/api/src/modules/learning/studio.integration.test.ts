import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('whiteboard video and LMS calendar integrations', () => {
  let app: any, store: any, auth: any, parent: any, other: any, learner: any;
  const credential = 'studio-integration-secret', directory = mkdtempSync(join(tmpdir(), 'study-studio-'));
  const previousRoot = process.env.STUDY_DATA_DIR, previousKey = process.env.OPENAI_API_KEY;
  beforeAll(async () => {
    process.env.STUDY_DATA_DIR = directory; delete process.env.OPENAI_API_KEY;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
  });
  afterAll(async () => {
    await app?.close();
    if (previousRoot === undefined) delete process.env.STUDY_DATA_DIR; else process.env.STUDY_DATA_DIR = previousRoot;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    store.reset();
    parent = await auth.register({ principal: 'studio-parent@test', credential }, 'studio-parent');
    other = await auth.register({ principal: 'studio-other@test', credential }, 'studio-other');
    store.students.push({ id: 'child', userId: 'child-user', nickname: '小禾', grade: 5, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } });
    store.bindings.push({ id: 'binding', studentId: 'child', parentUserId: parent.user.id, status: 'active', relation: 'guardian' });
    store.knowledgeAtoms.push({ id: 'fraction-add', name: '异分母分数加法', grade: 5, subject: 'math', strand: '分数',
      term: 'upper', objective: '先统一分数单位，再合并份数', successCriterion: '在新题中独立完成', prerequisiteIds: [],
      curriculumVersion: 'studio-qa', status: 'published', version: 1, teaching: { reviewStatus: 'approved',
        explanation: '不同分母表示单位不同，先通分再合并。',
        example: { prompt: '计算 2/3 + 1/4', steps: ['把两项通分为十二分之一', '合并 8 份和 3 份'], conclusion: '结果是 11/12' },
        commonErrors: [{ code: 'denominator-add', observation: '直接相加分母', alternativeExplanations: ['没有统一单位'],
          verification: '用等长纸条核对' }],
        verification: { understanding: '说出共同单位', procedure: '独立通分', transfer: '换情境完成', retention: '延迟复测' },
        visual: { kind: 'fraction_bars', title: '先统一分数单位', note: '同一整体切成相同份数后再合并。', operator: '+',
          commonDenominator: 12, terms: [{ numerator: 2, denominator: 3, label: '第一项' },
            { numerator: 1, denominator: 4, label: '第二项' }], result: { numerator: 11, denominator: 12 } } } });
    await call('put', '/students/child/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
      textbookVersion: 'Studio QA', learnedAtomIds: ['fraction-add'], currentAtomId: 'fraction-add', minutesPerSession: 15 });
    const access = await call('post', '/students/child/learning-access', { enabled: true, expectedVersion: 0,
      requestKey: randomUUID(), reason: '验证学生可播放白板与查看日历，但不能管理同步连接。' });
    const code = await call('post', '/students/child/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    learner = await call('post', '/auth/learning-code', { code: code.code }, null);
  });

  async function call(method: 'get' | 'post' | 'put', path: string, body?: unknown, actor = parent,
    expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor?.token) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    return (await query.expect(expected)).body.data;
  }

  function calendar(uid = 'school-lesson', summary = 'Unit review') {
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:' + uid, 'DTSTART:20261101T080000+0800',
      'DTEND:20261101T084500+0800', 'SUMMARY:' + summary, 'DESCRIPTION:Independent practice and review',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }

  it('previews, saves and reads a uniquely grounded whiteboard with student access', async () => {
    const preview = await call('post', '/learning/studio/whiteboards/preview',
      { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add' });
    expect(preview.scenes.map((scene: any) => scene.kind)).toEqual(['title', 'concept', 'steps', 'fraction_bars', 'check']);
    expect(preview.scenes.every((scene: any) => scene.narration.length > 8)).toBe(true);
    const freePreview = await call('post', '/learning/studio/whiteboards/preview',
      { studentId: 'child', subject: 'math', prompt: '整理今天的观察记录' });
    expect(freePreview.atomId).toBeNull();
    const command = { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add',
      fingerprint: preview.fingerprint, requestKey: randomUUID() };
    const saved = await call('post', '/learning/studio/whiteboards', command, learner);
    const replay = await call('post', '/learning/studio/whiteboards', command, learner);
    expect(replay.id).toBe(saved.id);
    expect(store.studioWhiteboards).toHaveLength(1);
    const overview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(overview.whiteboards[0]).toMatchObject({ id: saved.id, width: 1280, height: 720 });
    expect(overview.narrationAvailable).toBe(false);
    await request(app.getHttpServer()).post('/api/learning/studio/whiteboards/' + saved.id + '/narration/scene:1')
      .set('Authorization', 'Bearer ' + other.token).expect(403);
    await request(app.getHttpServer()).post('/api/learning/studio/whiteboards/' + saved.id + '/narration/scene:1')
      .set('Authorization', 'Bearer ' + learner.token).expect(503);
    await call('post', '/learning/studio/whiteboards/preview',
      { studentId: 'child', subject: 'math', prompt: '越权白板', atomId: 'fraction-add' }, other, 403);
  });

  it('keeps connector creation idempotent, isolated, revocable and student read-only', async () => {
    const command = { studentId: 'child', subject: 'math', kind: 'lms_ics', label: '学校课程',
      icsText: calendar(), requestKey: randomUUID() };
    const connected = await call('post', '/learning/studio/integrations', command);
    const replay = await call('post', '/learning/studio/integrations', command);
    expect(replay.connector.id).toBe(connected.connector.id);
    expect(store.studioConnectors).toHaveLength(1);
    expect(connected.events[0]).toMatchObject({ source: 'lms', startsAt: '2026-11-01T00:00:00.000Z', title: 'Unit review' });
    await call('post', '/learning/studio/integrations', { ...command, label: 'changed' }, parent, 409);
    await call('post', '/learning/studio/integrations', { ...command, requestKey: randomUUID() }, other, 403);
    await call('post', '/learning/studio/integrations', { ...command, requestKey: randomUUID(), icsText: undefined,
      feedUrl: 'https://127.0.0.1/calendar.ics' }, parent, 400);
    await call('post', '/learning/studio/integrations', { ...command, requestKey: randomUUID(), icsText: undefined,
      feedUrl: 'http://example.com/calendar.ics' }, parent, 400);
    await call('post', '/learning/studio/integrations', { ...command, requestKey: randomUUID() }, learner, 403);
    const learnerOverview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(learnerOverview.integrations.connectors).toHaveLength(1);
    expect(learnerOverview.integrations.events).toHaveLength(1);
    const revoked = await call('post', '/learning/studio/integrations/' + connected.connector.id + '/disconnect', {});
    expect(revoked.status).toBe('revoked');
    const empty = await call('get', '/learning/studio/overview?studentId=child&subject=math');
    expect(empty.integrations.events).toEqual([]);
  });

  it('creates, replays, removes and exports a StudyAgent calendar task', async () => {
    const command = { studentId: 'child', subject: 'math', title: '分数复习', description: '独立完成 5 道新题',
      startsAt: '2026-11-02T10:00:00.000Z', endsAt: '2026-11-02T10:25:00.000Z', requestKey: randomUUID() };
    const event = await call('post', '/learning/studio/calendar/events', command);
    const replay = await call('post', '/learning/studio/calendar/events', command);
    expect(replay.id).toBe(event.id);
    expect(store.studioScheduleEvents).toHaveLength(1);
    await call('post', '/learning/studio/calendar/events', { ...command, title: '不同任务' }, parent, 409);
    await call('post', '/learning/studio/calendar/events', { ...command, requestKey: randomUUID() }, learner, 403);
    const exported = await call('get', '/learning/studio/calendar/export?studentId=child&subject=math');
    expect(exported.content).toContain('SUMMARY:分数复习');
    expect(exported.content).toContain('DTSTART:20261102T100000Z');
    await call('post', '/learning/studio/calendar/events/' + event.id + '/remove', {});
    expect((await call('get', '/learning/studio/overview?studentId=child&subject=math')).integrations.events).toEqual([]);
  });
});
