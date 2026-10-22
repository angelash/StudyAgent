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
  const previousMiniMaxKey = process.env.MINIMAX_API_KEY;
  beforeAll(async () => {
    process.env.STUDY_DATA_DIR = directory; delete process.env.OPENAI_API_KEY; delete process.env.MINIMAX_API_KEY;
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
    if (previousMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY; else process.env.MINIMAX_API_KEY = previousMiniMaxKey;
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

  function textPdf() {
    const stream = 'BT /F1 18 Tf 72 700 Td (Fraction addition review sheet) Tj 0 -28 Td ' +
      '(First unify the unit. Then combine equal parts and check the result.) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
    ];
    let body = '%PDF-1.4\n', offsets: number[] = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
    const xref = Buffer.byteLength(body); body += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.slice(1).forEach(offset => { body += String(offset).padStart(10, '0') + ' 00000 n \n'; });
    body += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return Buffer.from(body, 'ascii');
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
    expect(overview.speech).toMatchObject({ available: false, provider: null, voices: [] });
    await request(app.getHttpServer()).post('/api/learning/studio/whiteboards/' + saved.id + '/narration/scene:1')
      .set('Authorization', 'Bearer ' + other.token).expect(403);
    await request(app.getHttpServer()).post('/api/learning/studio/whiteboards/' + saved.id + '/narration/scene:1')
      .set('Authorization', 'Bearer ' + learner.token).expect(503);
    await call('post', '/learning/studio/whiteboards/preview',
      { studentId: 'child', subject: 'math', prompt: '越权白板', atomId: 'fraction-add' }, other, 403);
  });

  it('previews, persists and executes an evidence-driven plan with delayed reviews', async () => {
    const command = { studentId: 'child', subject: 'math', goal: '先用新题核对分数单位，再完成迁移与延迟检查',
      targetDate: '2099-01-08', firstSessionAt: '2099-01-05T10:00:00.000Z', minutesPerDay: 20 };
    const preview = await call('post', '/learning/studio/study-plans/preview', command);
    expect(preview.sessions.length).toBeGreaterThanOrEqual(3);
    expect(preview.evidence[0]).toMatchObject({ atomId: 'fraction-add' });
    expect(preview.warnings.join(' ')).toContain('计划完成只表示');
    const create = { ...command, fingerprint: preview.fingerprint, requestKey: randomUUID() };
    const plan = await call('post', '/learning/studio/study-plans', create);
    const replay = await call('post', '/learning/studio/study-plans', create);
    expect(replay.id).toBe(plan.id);
    expect(store.studioStudyPlans).toHaveLength(1);
    expect(store.studioScheduleEvents).toHaveLength(plan.sessions.length);
    await call('post', '/learning/studio/study-plans', { ...create, requestKey: randomUUID() }, learner, 403);
    const overview = await call('get', '/learning/studio/overview?studentId=child&subject=math');
    expect(overview.plans[0].id).toBe(plan.id);
    await call('post', '/learning/studio/calendar/events/' + plan.sessions[0].calendarEventId + '/remove', {}, parent, 409);
    const completed = await call('post', '/learning/studio/study-plans/' + plan.id + '/sessions/' + plan.sessions[0].id,
      { action: 'complete', expectedRevision: plan.revision, requestKey: randomUUID() });
    expect(completed.revision).toBe(2);
    expect(completed.sessions.filter((row: any) => row.reviewForSessionId === plan.sessions[0].id)
      .map((row: any) => row.reviewOffsetDays)).toEqual([1, 3, 7, 14]);
    await call('post', '/learning/studio/study-plans/' + plan.id + '/sessions/' + plan.sessions[1].id,
      { action: 'skip', expectedRevision: 1, requestKey: randomUUID() }, parent, 409);
    const learnerUpdated = await call('post', '/learning/studio/study-plans/' + plan.id + '/sessions/' + plan.sessions[1].id,
      { action: 'complete', expectedRevision: 2, requestKey: randomUUID() }, learner);
    expect(learnerUpdated.sessions[1].status).toBe('completed');
  });

  it('renders, saves and grounds page-level whiteboards from an uploaded PDF', async () => {
    const pdf = textPdf();
    const response = await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf')
      .set('Authorization', 'Bearer ' + parent.token).field('studentId', 'child').field('subject', 'math')
      .field('requestKey', randomUUID()).attach('file', pdf, { filename: '分数讲义.pdf', contentType: 'application/pdf' }).expect(201);
    const material = response.body.data;
    expect(material).toMatchObject({ pageCount: 1, hasPageImages: true, filename: '分数讲义.pdf', title: '分数讲义' });
    expect(material.pages[0].text).toContain('Fraction addition review');
    expect(material).not.toHaveProperty('pageImages');
    const duplicate = await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf')
      .set('Authorization', 'Bearer ' + parent.token).field('studentId', 'child').field('subject', 'math')
      .field('requestKey', randomUUID()).attach('file', pdf, { filename: '重复讲义.pdf', contentType: 'application/pdf' }).expect(201);
    expect(duplicate.body.data.id).toBe(material.id);
    expect(duplicate.body.data).not.toHaveProperty('pageImages');
    expect(duplicate.body.data).not.toHaveProperty('requestKey');
    expect(store.studioSourceMaterials).toHaveLength(1);
    await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf')
      .set('Authorization', 'Bearer ' + other.token).field('studentId', 'child').field('subject', 'math')
      .field('requestKey', randomUUID()).attach('file', Buffer.from('%PDF-1.4\ninvalid'), 'bad.pdf').expect(403);
    const image = await request(app.getHttpServer()).get('/api/learning/studio/materials/' + material.id + '/pages/1')
      .set('Authorization', 'Bearer ' + learner.token).expect(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(Number(image.headers['content-length'])).toBeGreaterThan(1000);
    const original = await request(app.getHttpServer()).get('/api/learning/studio/materials/' + material.id + '/original')
      .set('Authorization', 'Bearer ' + learner.token).expect(200);
    expect(original.headers['content-type']).toContain('application/pdf');
    expect(original.headers['content-disposition']).toContain('attachment');
    expect(Buffer.from(original.body).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const preview = await call('post', '/learning/studio/materials/' + material.id + '/whiteboard/preview',
      { atomId: 'fraction-add' }, learner);
    expect(preview.scenes.filter((scene: any) => scene.kind === 'pdf_page')).toEqual([
      expect.objectContaining({ title: '第 1 页', source: expect.objectContaining({ page: 1, materialId: material.id }) }),
    ]);
    const board = await call('post', '/learning/studio/materials/' + material.id + '/whiteboard',
      { atomId: 'fraction-add', fingerprint: preview.fingerprint, requestKey: randomUUID() }, learner);
    expect(board.sourceMaterialId).toBe(material.id);
    const overview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(overview.materials[0]).toMatchObject({ id: material.id, hasPageImages: true });
    expect(overview.materials[0]).not.toHaveProperty('pageImages');
    await call('post', '/learning/studio/materials/' + material.id + '/whiteboard/preview', { atomId: 'fraction-add' }, other, 403);
    const packPreview = await call('post', '/learning/studio/study-packs/preview',
      { studentId: 'child', subject: 'math', focusAtomIds: ['fraction-add'], sourceMaterialId: material.id }, learner);
    expect(packPreview).toMatchObject({ atomIds: ['fraction-add'], sourceMaterialId: material.id });
    expect(packPreview.sections).toHaveLength(4);
    expect(packPreview.flashcards).toHaveLength(3);
    expect(packPreview.sections[0].citations[0]).toMatchObject({ atomId: 'fraction-add', page: 1 });
    const packCommand = { studentId: 'child', subject: 'math', focusAtomIds: ['fraction-add'], sourceMaterialId: material.id,
      fingerprint: packPreview.fingerprint, requestKey: randomUUID() };
    const pack = await call('post', '/learning/studio/study-packs', packCommand, learner);
    const packReplay = await call('post', '/learning/studio/study-packs', packCommand, learner);
    expect(packReplay.id).toBe(pack.id);
    const packOverview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(packOverview.studyPacks[0]).toMatchObject({ id: pack.id, reviewDays: [1, 3, 7, 14] });
    await call('post', '/learning/studio/study-packs/preview',
      { studentId: 'child', subject: 'math', focusAtomIds: ['fraction-add'] }, other, 403);
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
