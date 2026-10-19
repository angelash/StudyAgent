import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

describe('persistent mistake organization, frozen original redo and independent new verification', () => {
  let app: any, store: any, auth: any, parent: any, other: any, admin: any, ai: any;
  const credential = 'notebook-fixture-secret', directory = mkdtempSync(join(tmpdir(), 'study-notebook-'));
  const previousRoot = process.env.STUDY_DATA_DIR, previousKey = process.env.OPENAI_API_KEY;
  beforeAll(async () => {
    process.env.STUDY_DATA_DIR = directory; delete process.env.OPENAI_API_KEY;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    const { AiService } = require('../../../dist/apps/api/src/modules/ai/ai.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService); ai = app.get(AiService);
  });
  afterAll(async () => {
    await app?.close();
    if (previousRoot === undefined) delete process.env.STUDY_DATA_DIR; else process.env.STUDY_DATA_DIR = previousRoot;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    store.reset(); ai.client = null;
    parent = await auth.register({ principal: 'notebook-parent@test', credential }, 'notebook-parent');
    other = await auth.register({ principal: 'notebook-other@test', credential }, 'notebook-other');
    admin = await auth.register({ principal: 'notebook-admin@test', credential }, 'notebook-admin');
    store.users.find((row: any) => row.id === admin.user.id).role = 'admin';
    store.students.push({ id: 'child', userId: 'child-user', nickname: '小禾', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } });
    store.bindings.push({ id: 'binding', studentId: 'child', parentUserId: parent.user.id, status: 'active', relation: 'guardian' });
    store.knowledgeAtoms.push({ id: 'merge', name: '两个部分合并', grade: 3, subject: 'math', strand: '数与关系', term: 'both',
      objective: 'FROZEN_OBJECTIVE_识别两个部分并合并为一个整体', successCriterion: '能解释合并两个部分的关系', prerequisiteIds: [], curriculumVersion: 'notebook-qa', status: 'published', version: 1 });
    for (let n = 0; n < 32; n++) {
      const id = `notebook-q${n}`;
      store.questions.push({ id, subject: 'math', type: 'objective', stem: `合并关系的原创QA ${n}：3与2合并有多少？`, answer: 5, analysis: '把两个部分合并为同一个整体。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
      store.questionAnswerSchemas.push({ questionId: id, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
      store.questionSources.push({ questionId: id, sourceType: 'internal_authoring', sourceName: '原创QA题面', sourcePathOrUrl: 'PRIVATE_SOURCE_PATH', licenseClass: 'A_INTERNAL', licenseName: 'test', importJobId: null, reviewStatus: 'approved', notes: 'PRIVATE_SOURCE_NOTES' });
      store.measurementItems.push({ id: `notebook-item${n}`, questionId: id, questionVersion: 1, atomId: 'merge', dimension: n % 2 ? 'transfer' : 'understanding',
        family: `qa-family${n % 8}`, probeRole: n % 2 ? 'transfer' : 'anchor', expectedSeconds: 20, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'merge_mismatch', version: 1 });
    }
    await call('put', '/students/child/learning-scope', { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: 'QA', learnedAtomIds: ['merge'], currentAtomId: 'merge', minutesPerSession: 15 });
  });
  async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = parent, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method](`/api${path}`);
    if (actor?.token) query = query.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object);
    return (await query.expect(expected)).body.data;
  }
  const base = '/learning/students/child/notebook';
  const route = (row: any) => `${base}/${row.kind ?? 'diagnostic'}/${row.responseId}`;
  const command = (expectedVersion = 0, extra = {}) => ({ expectedVersion, requestKey: randomUUID(), reason: '核对原始作答、整理卡点并保留可追溯的后续验证记录。', ...extra });
  async function attempt(ended = true) {
    const session = await call('post', '/diagnostics/sessions', { studentId: 'child', subject: 'math', intent: 'micro', maxItems: 2, includePrerequisites: false });
    const submitted = await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: session.items[0].id, answer: 2, elapsedMs: 1200 });
    if (ended) { for (const item of session.items.slice(1)) await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer: 5, elapsedMs: 1200 }); await call('post', `/diagnostics/sessions/${session.id}/complete`, {}); }
    return { session, responseId: submitted.responseId, kind: 'diagnostic', questionId: session.items[0].questionId };
  }

  it('does not reveal unfinished independent answers through either notebook route and denies a different family', async () => {
    const original = await attempt(false);
    expect((await call('get', base + '?subject=math')).items).toEqual([]);
    expect(await call('get', '/learning/students/child/mistakes?subject=math')).toEqual([]);
    await call('get', route(original), undefined, parent, 409);
    await call('get', base + '?subject=math', undefined, other, 403);
    await call('post', route(original) + '/redo', command(), other, 403);
    await call('post', `/diagnostics/sessions/${original.session.id}/state`, { action: 'abort', expectedRevision: 1, requestKey: randomUUID(), reason: '暂时结束本次QA评测，回看已提交的证据。' });
    const list = await call('get', base + '?subject=math'); expect(list.total).toBe(1);
    const serialized = JSON.stringify(list); expect(serialized).not.toContain('referenceAnswer'); expect(serialized).not.toContain('把两个部分合并为同一个整体');
    const detail = await call('get', route(original)); expect(detail.referenceAnswer).toBe(5); expect(detail.payload.answerSchema.gradingConfig).toEqual({});
    expect(JSON.stringify(detail)).not.toContain('PRIVATE_SOURCE');
  });

  it('organizes tags, favorites and reflection with versioned replay, filters and reversible removal without changing the evidence', async () => {
    const original = await attempt(), detail = await call('get', route(original));
    const evidence = structuredClone(store.diagnosticResponses), metadata = { ...detail.metadata, favorite: true, tags: ['条件对应', '再讲一次'], errorSteps: ['不能解释两个部分的对应关系'], reflection: '先说清部分与整体，再检查是否误用减法。', reviewState: 'reviewed' };
    const cmd = command(0, { metadata }); const edited = await call('post', route(original) + '/organize', cmd);
    expect(edited.version).toBe(1); expect(edited.history).toHaveLength(1);
    expect((await call('post', route(original) + '/organize', cmd)).version).toBe(1);
    await call('post', route(original) + '/organize', { ...cmd, metadata: { ...metadata, favorite: false } }, parent, 409);
    await call('post', route(original) + '/organize', command(0, { metadata }), parent, 409);
    const filtered = await call('get', `${base}?subject=math&favorite=true&atomId=merge&reviewState=reviewed&tag=${encodeURIComponent('条件对应')}&q=${encodeURIComponent('误用减法')}&pageSize=1`);
    expect(filtered.total).toBe(1); expect(filtered.items).toHaveLength(1); expect(filtered.tags).toEqual(['再讲一次', '条件对应']);
    expect(filtered.atoms[0]).toMatchObject({ id: 'merge', count: 1, open: 0, pending: 0, removed: 0 });
    expect((await call('get', base + '?subject=math&page=2&pageSize=1')).items).toEqual([]);
    let row = await call('post', route(original) + '/organize', command(1, { metadata: { ...metadata, removed: true } }));
    expect((await call('get', base + '?subject=math')).total).toBe(0); expect((await call('get', base + '?subject=math&state=removed')).total).toBe(1);
    await call('post', route(original) + '/redo', command(2), parent, 400);
    row = await call('post', route(original) + '/organize', command(2, { metadata })); expect(row.version).toBe(3); expect(row.metadata.removed).toBe(false);
    expect(store.diagnosticResponses).toEqual(evidence); expect(store.practiceSessions).toHaveLength(0);
    expect(JSON.stringify(row.history)).not.toContain('requestKey');
  });

  it('uses the frozen original in the real practice path and never counts repeated correction as independent mastery', async () => {
    const original = await attempt(), before = await call('get', '/diagnostics/students/child/profile?subject=math');
    store.questions.find((q: any) => q.id === original.questionId).answer = 999;
    store.questions.find((q: any) => q.id === original.questionId).stem = 'LIVE_CHANGED_STEM';
    const cmd = command(), redo = await call('post', route(original) + '/redo', cmd);
    expect(redo.origin).toBe('notebook'); expect(redo.planId).toBeNull(); expect(redo.planRevision).toBe(redo.currentPlanRevision);
    expect((await call('post', route(original) + '/redo', cmd)).id).toBe(redo.id);
    const activeCommand = command(1), active = await call('post', route(original) + '/redo', activeCommand);
    expect(active.id).toBe(redo.id); expect(store.practiceSessions).toHaveLength(1);
    const rendered = await call('get', `/learning/practice/${redo.id}/questions/${original.questionId}`);
    expect(JSON.stringify(rendered)).not.toContain('LIVE_CHANGED_STEM'); expect(rendered.payload.answerSchema.gradingConfig).toEqual({});
    await call('patch', `/learning/practice/${redo.id}/questions/${original.questionId}/draft`, { answer: { questionId: original.questionId, mode: 'numeric_blank', response: { value: 5 } } });
    const answered = await call('post', `/learning/practice/${redo.id}/responses`, { questionId: original.questionId, requestKey: randomUUID(), answer: 5, elapsedMs: 1200 });
    expect(answered.attempt.correct).toBe(true); expect(answered.attempt.solutionExposedBefore).toBe(true); expect(answered.notice).not.toContain('已独立完成');
    const completed = await call('post', `/learning/practice/${redo.id}/complete`, {}); expect(completed.summary.independentFirstPass).toBe(0);
    expect((await call('post', route(original) + '/redo', activeCommand)).id).toBe(redo.id);
    expect((await call('get', '/diagnostics/students/child/profile?subject=math')).estimates).toEqual(before.estimates);
    expect((await call('get', base + '?subject=math')).total).toBe(1);
    const detail = await call('get', route(original)); expect(detail.redos).toHaveLength(1); expect(detail.redos[0].status).toBe('completed');
  });

  it('prepares and replays independent new-question verification, keeps different long keys distinct and refuses changed knowledge semantics', async () => {
    const original = await attempt(), long = 'same-prefix-'.repeat(12);
    const cmd = command(0, { requestKey: long + 'a' }), preview = await call('post', route(original) + '/verification', cmd);
    expect((await call('post', route(original) + '/verification', cmd)).id).toBe(preview.id);
    const otherPreview = await call('post', route(original) + '/verification', command(1, { requestKey: long + 'b' }));
    expect(otherPreview.id).not.toBe(preview.id);
    const session = await call('post', `/diagnostics/blueprints/${preview.id}/start`, {});
    expect(session.items.every((item: any) => !original.session.items.some((old: any) => old.questionId === item.questionId))).toBe(true);
    expect(session.exposedQuestionIds ?? []).not.toContain(original.questionId);
    store.knowledgeAtoms[0].objective = '语义变化：比较两个部分之差'; store.knowledgeAtoms[0].version++;
    await call('post', route(original) + '/verification', command(2), parent, 409);
    expect((await call('get', route(original))).verifications).toHaveLength(2);
  });

  it('retains a corrected card and notes after scoring revision, while untouched correct responses cannot enter the notebook', async () => {
    const original = await attempt(), row = await call('get', route(original));
    await call('post', route(original) + '/organize', command(0, { metadata: { ...row.metadata, reflection: '保留当时对条件的说明，等老师核对评分。' } }));
    await call('post', `/admin/diagnostic-responses/${original.responseId}/review`, { expectedVersion: 0, requestKey: randomUUID(), score: 1, reason: '人工核查确认学生的另一种有效表达，此处保留原始评分并修订。' }, admin);
    const edited = await call('get', route(original)); expect(edited.correct).toBe(true); expect(edited.originalScore).toBe(0); expect(edited.metadata.reflection).toContain('保留当时');
    expect((await call('get', base + '?subject=math')).total).toBe(1); expect(store.diagnosticResponses.find((r: any) => r.id === original.responseId).score).toBe(0);
    const correct = store.diagnosticResponses.find((r: any) => r.correct);
    await call('get', `${base}/diagnostic/${correct.id}`, undefined, parent, 400);
  });

  it('isolates the historical redo assistant from a later unrelated plan and freezes its original definition', async () => {
    const original = await attempt(), redo = await call('post', route(original) + '/redo', command());
    store.knowledgeAtoms[0].objective = 'LIVE_OBJECTIVE_MUST_NOT_BE_USED'; store.knowledgeAtoms[0].version++;
    store.diagnosticPlans.push({ id: 'later-plan', studentId: 'child', subject: 'math', createdAt: '2099', status: 'active', baselineSessionId: 'different-baseline', summary: 'UNRELATED_NEW_PLAN', actions: [], evidenceIds: [] });
    let prompt = '';
    ai.client = { chat: { completions: { create: async (input: any) => { prompt = JSON.stringify(input.messages); return { choices: [{ message: { content: JSON.stringify({ reply: '先用自己的话解释题目的两个部分和整体之间的关系。', evidenceIds: [] }) } }] }; } } } };
    const assistant = await call('post', '/ai/assistant/sessions', { userRole: 'student', studentId: 'child', subject: 'math', pageContext: 'mission', contextRefType: 'practice', contextRefId: redo.id, contextItemId: original.questionId });
    await call('post', `/ai/assistant/sessions/${assistant.id}/messages`, { message: '我想重新解释当时的条件。', requestKey: randomUUID() });
    expect(prompt).toContain('FROZEN_OBJECTIVE'); expect(prompt).not.toContain('LIVE_OBJECTIVE_MUST_NOT_BE_USED'); expect(prompt).not.toContain('UNRELATED_NEW_PLAN');
    await call('get', `/learning/practice/${redo.id}`, undefined, other, 403);
  });

  it('allows a controlled student to organize, redo and resume their own notebook without acquiring management access', async () => {
    const original = await attempt();
    await call('post', '/students/child/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '验证孩子可独立回看思路，同时保持家长管理边界。' });
    const code = await call('post', '/students/child/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() });
    const learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    const detail = await call('get', route(original), undefined, learner);
    await call('post', route(original) + '/organize', command(0, { metadata: { ...detail.metadata, favorite: true } }), learner);
    const redo = await call('post', route(original) + '/redo', command(1), learner); expect(redo.origin).toBe('notebook');
    await call('get', `${base.replace('child', 'foreign-child')}?subject=math`, undefined, learner, 403);
    await call('get', '/admin/curriculum/overview', undefined, learner, 403);
    await call('post', route(original) + '/verification', command(2), learner);
  });

  for (const mode of ['image_upload', 'audio_record'] as const) it(`keeps ${mode} redo uploads, pending scores and manual rubric revisions in the original learning path`, async () => {
    for (const schema of store.questionAnswerSchemas) { schema.mode = mode; schema.responseShape = { mediaPolicy: 'student-media-v1' }; schema.gradingConfig = { rubric: [{ criterion: '解释清楚两个部分与整体关系', weight: 1 }] }; }
    for (const question of store.questions) { question.type = 'subjective'; question.answer = '按关系解释逐项复核'; }
    let bytes: Buffer;
    if (mode === 'image_upload') bytes = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#456747' } }).png().toBuffer();
    else { const samples = 6400; bytes = Buffer.alloc(44 + samples * 2); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40); for (let n = 0; n < samples; n++) bytes.writeInt16LE(Math.round(2000 * Math.sin(n * Math.PI / 40)), 44 + n * 2); }
    async function uploadMedia(target: object) {
      const upload = await call('post', '/learning/media', { ...target, name: mode === 'image_upload' ? '订正.png' : '解释.wav', mediaType: mode === 'image_upload' ? 'image/png' : 'audio/wav', size: bytes.length, requestKey: randomUUID() });
      await request(app.getHttpServer()).put(`/api/learning/media/${upload.id}/chunks/0`).set('Authorization', `Bearer ${parent.token}`).set('Content-Type', 'application/octet-stream').send(bytes).expect(200);
      await call('post', `/learning/media/${upload.id}/complete`, {}); return upload;
    }
    const assessment = await call('post', '/diagnostics/sessions', { studentId: 'child', subject: 'math', intent: 'micro', maxItems: 2, includePrerequisites: false });
    const questionId = assessment.items[0].questionId, firstUpload = await uploadMedia({ kind: 'diagnostic', sessionId: assessment.id, itemId: assessment.items[0].id });
    const submitted = await call('post', `/diagnostics/sessions/${assessment.id}/responses`, { itemId: assessment.items[0].id, answer: { questionId, mode, response: { mediaIds: [firstUpload.id], description: '我用自己的话解释两个部分。' } }, elapsedMs: 1200 });
    await call('post', `/diagnostics/sessions/${assessment.id}/state`, { action: 'abort', expectedRevision: 1, requestKey: randomUUID(), reason: '保存原始主观表达，之后回看并重新解释。' });
    const original = { responseId: submitted.responseId }, redo = await call('post', route(original) + '/redo', command());
    const upload = await uploadMedia({ kind: 'practice', sessionId: redo.id, itemId: questionId });
    const envelope = { questionId, mode, response: { mediaIds: [upload.id], description: '说明两个部分为什么属于同一个整体。' } };
    await call('patch', `/learning/practice/${redo.id}/questions/${questionId}/draft`, { answer: envelope });
    const response = await call('post', `/learning/practice/${redo.id}/responses`, { questionId, requestKey: randomUUID(), answer: envelope, elapsedMs: 1200 });
    expect(response.attempt.status).toBe('pending_review'); expect(response.attempt.solutionExposedBefore).toBe(true);
    await call('post', `/learning/practice/${redo.id}/complete`, {});
    await call('post', `/admin/reviews/practice/${response.attempt.id}`, { expectedVersion: 0, requestKey: randomUUID(), reason: '根据本次原题订正中的图片或录音核对关系解释。', ratings: [{ criterionIndex: 0, score: 1, observation: '解释准确对应了两个部分和整体。' }] }, admin);
    const completed = await call('get', `/learning/practice/${redo.id}`); expect(completed.summary.pendingReview).toBe(0); expect(completed.summary.independentFirstPass).toBe(0);
    await call('get', `/learning/media/${upload.id}/content`, undefined, other, 403);
    expect((await call('get', route(original))).redos[0].summary.answered).toBe(1);
  });
});
