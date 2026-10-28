import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('complete original conversation whiteboard source preflight over actual HTTP', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-conversation-whiteboard-'));
  const envKeys = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'XIAOJIU_CHAT_ENABLED'];
  const prior = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const src = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, owner: any, other: any, independent: any, student: any, course: any, pg: Pool | undefined, schema = '';
  const providers: any[] = [], digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const collections = ['students', 'learningScopes', 'studioCourses', 'assistantSessions', 'assistantMessages', 'assistantArtifactDrafts', 'studioTopicWhiteboardDrafts', 'studioTopicWhiteboards', 'diagnosticSessions', 'diagnosticResponses', 'masteryEstimates', 'diagnosticPlans'];
  const fingerprint = () => store.requestContext(() => digest(collections.map(name => store.inspect(name))));
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = owner, status = method === 'post' ? 201 : 200) {
    let q = request(app.getHttpServer())[method]('/api' + path); if (actor) q = q.set('Authorization', 'Bearer ' + actor.token); if (body) q = q.send(body as object);
    const response = await q; expect(response.status, path + ':' + JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  const root = (session: any) => '/ai/assistant/sessions/' + session.id + '/artifacts/whiteboards';
  const preflight = (session: any, ids: string[], extra = {}, actor = owner, status = 200) => call('post', root(session) + '/preflight', { selection: { messageIds: ids, includeLinkedQuestions: false }, objective: '完整保留原解释，整理为概念白板', ...extra }, actor, status);
  async function save(session: any, values: any[]) {
    const rows = values.map(value => ({ id: randomUUID(), sessionId: session.id, sender: 'user', content: '匿名原问题', createdAt: '2026-10-28T00:00:00.000Z', ...value }));
    await store.transaction(() => rows.forEach(row => store.append('assistantMessages', row))); return rows;
  }
  const courseDescriptor = (actor = owner) => call('get', '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'primary_unit', courseId: course.id, itemId: course.units[0].id }), undefined, actor);
  const openCourse = (descriptor: any, actor = owner, userRole = 'parent') => call('post', '/ai/assistant/sessions', { userRole, studentId: descriptor.studentId, subject: descriptor.subject, pageContext: 'course', contextRefType: descriptor.kind, contextRefId: descriptor.referenceId, contextItemId: descriptor.itemId, contextSelection: descriptor.selection }, actor);
  beforeAll(async () => {
    let driver = 'sqlite'; const url = process.env.STUDY_TEST_ASSISTANT_WHITEBOARD_POSTGRES_URL;
    if (url) {
      const target = new URL(url); expect(target.hostname).toBe('127.0.0.1'); expect(target.port).toBe(process.env.CI === 'true' ? '5432' : '15439');
      pg = new Pool({ connectionString: url }); expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_conversation_board_' + randomUUID().replaceAll('-', ''); await pg.query('CREATE SCHEMA "' + schema + '"'); target.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = target.toString(); driver = 'postgres';
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: driver, STUDY_DATA_DIR: directory, STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    app = await NestFactory.create(src('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(src('infrastructure/in-memory-store.service').InMemoryStoreService);
    const chat = app.get(src('modules/ai/xiaojiu-chat.service').XiaojiuChatService); for (const method of ['reply', 'structured']) providers.push(vi.spyOn(chat, method).mockRejectedValue(Error('Preflight must not call a model')));
    const register = () => call('post', '/auth/register', { principal: 'source-board-' + randomUUID() + '@local.test', credential: 'Synthetic-source-board-' + randomUUID() }, null);
    owner = await register(); other = await register(); independent = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' });
    student = (await call('post', '/students', { nickname: '匿名来源学习者', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    const definitions = src('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum(); course = src('modules/learning/chemistry-course').buildChemistryCourse(student.id, definitions.map((d: any) => d.atom));
    await store.transaction(() => { definitions.forEach((d: any) => store.append('knowledgeAtoms', d.atom)); store.append('studioCourses', course); });
  });
  afterAll(async () => {
    providers.forEach(provider => expect(provider).not.toHaveBeenCalled()); vi.restoreAllMocks(); await app?.close();
    if (pg) { if (!/^study_qa_conversation_board_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe fixture path'); rmSync(directory, { recursive: true, force: true });
  });

  it('preserves ordered full original questions, linked replies and model with stable repeatable fingerprints and no writes', async () => {
    const [question] = await save(independent, [{ content: '比较两个数之前，先说明整体和单位。' }]);
    const [answer] = await save(independent, [{ sender: 'assistant', content: '完整说明\n|条件|意义|\n|---|---|\n|同一整体|可比较|\n$a+b$\n```js\n1+1\n```', inReplyTo: question.id, modelId: 'deepseek-v4-flash', modelName: 'DeepSeek V4.1 Flash', sourceReferences: [] }]);
    const before = await fingerprint(), input = { selection: { messageIds: [answer.id], includeLinkedQuestions: true }, modelId: 'deepseek-v4-flash' }, result = await preflight(independent, [answer.id], input);
    expect(result.origin.messages.map((m: any) => m.id)).toEqual([question.id, answer.id]); expect(result.origin.messages[1].content).toBe(answer.content);
    expect(result).toMatchObject({ modelId: 'deepseek-v4-flash', audience: { kind: 'assistant', studentId: null, profileGrade: null, courseGrade: null }, fits: true, available: false, canGenerate: false, blocked: { code: 'model_unavailable' } });
    expect((await preflight(independent, [answer.id], input)).fingerprint).toBe(result.fingerprint); expect(await fingerprint()).toBe(before);
    await call('post', root(independent), { ...input, requestKey: randomUUID() }, owner, 400);
    expect((await call('get', root(independent), undefined, owner)).items).toEqual([]);
  });
  it('retains over-budget original text and reports the complete JSON size instead of truncating into a short prompt', async () => {
    const [message] = await save(independent, [{ content: '保留所有行\n'.repeat(3200) + '完整末尾' }]), before = await fingerprint(), result = await preflight(independent, [message.id]);
    expect(result.origin.messages[0].content).toBe(message.content); expect(result.contextCharacters).toBeGreaterThan(18000); expect(result).toMatchObject({ fits: false, canGenerate: false, blocked: { code: 'source_budget_exceeded' } }); expect(await fingerprint()).toBe(before);
  });
  it('keeps an actual adult lecture source and trusted reference independent from the existing learner', async () => {
    const course = src('modules/learning/classroom-curriculum').classroomCourse(), lecture = course.units[0].lectures[0];
    const descriptor = await call('get', '/ai/assistant/lecture-context?' + new URLSearchParams({ courseId: course.id, lectureId: lecture.id }));
    const session = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom', contextRefType: 'classroom_lecture', contextRefId: descriptor.referenceId, contextItemId: descriptor.lectureId });
    const frozen = src('modules/ai/assistant-lecture-context').freezeAssistantLecture(course.id, lecture.id);
    const reference = (await call('get', '/ai/assistant/sessions/' + session.id + '/sources/' + frozen.teaching.sources[0].key)).reference;
    const [message] = await save(session, [{ sender: 'assistant', content: '原讲座的概念关系。', sourceReferences: [reference] }]), before = await fingerprint(), result = await preflight(session, [message.id]);
    expect(result.audience).toMatchObject({ sourceKind: 'classroom_lecture', studentId: null, courseGrade: null, profileGrade: null }); expect(result.origin.lecture.fingerprint).toBe(descriptor.fingerprint); expect(result.origin.messages[0].sourceReferences).toEqual([reference]); expect(await fingerprint()).toBe(before);
  });
  it('binds selected catalog models without changing source identity or invoking a provider', async () => {
    const [message] = await save(independent, [{}]), catalog = app.get(src('modules/ai/xiaojiu-models.service').XiaojiuModelsService).catalog();
    const a = await preflight(independent, [message.id], { modelId: catalog.models[0].id }), b = await preflight(independent, [message.id], { modelId: catalog.models[1].id });
    expect(a.sourceFingerprint).toBe(b.sourceFingerprint); expect(a.fingerprint).not.toBe(b.fingerprint); await preflight(independent, [message.id], { modelId: 'not-a-real-catalog-model' }, owner, 400);
  });
  it('rejects forged bodies, duplicate IDs, other conversation messages and another owner without changing original records', async () => {
    const [message] = await save(independent, [{}]), foreign = await openCourse(await courseDescriptor());
    const before = await fingerprint(); await preflight(independent, [message.id], { studentId: student.id }, owner, 400); await preflight(independent, [message.id, message.id], {}, owner, 400); await preflight(foreign, [message.id], {}, owner, 404); await preflight(independent, [message.id], {}, other, 404); expect(await fingerprint()).toBe(before);
  });
  it('keeps original grade9 chemistry separate from the unchanged grade4 learner and explicitly handles old teaching', async () => {
    const descriptor = await courseDescriptor(), session = await openCourse(descriptor), [message] = await save(session, [{ content: '原化学解释保留原版本，不能改成数学教学。' }]);
    const before = await fingerprint(), result = await preflight(session, [message.id]); expect(result.audience).toMatchObject({ kind: 'assistant', studentId: student.id, subject: 'chemistry', courseGrade: 9, profileGrade: 4 }); expect(await fingerprint()).toBe(before);
    const lesson = course.units[0].lessons.find((l: any) => l.kind === 'learn'), original = lesson.teaching.teaching.explanation;
    await store.transaction(() => { store.find('studioCourses', { id: course.id }).units[0].lessons.find((l: any) => l.kind === 'learn').teaching.teaching.explanation += '\n新的教学版本。'; });
    try {
      const old = await preflight(session, [message.id]); expect(old).toMatchObject({ historical: true, canGenerate: false, blocked: { code: 'historical_source_confirmation_required' } }); expect(old.sourceFingerprint).toBe(result.sourceFingerprint);
      const acknowledged = await preflight(session, [message.id], { acknowledgeHistoricalSource: true }); expect(acknowledged.blocked.code).toBe('model_unavailable'); expect(acknowledged.origin.messages[0].content).toBe(message.content); expect(acknowledged.audience.profileGrade).toBe(4);
    } finally { await store.transaction(() => { store.find('studioCourses', { id: course.id }).units[0].lessons.find((l: any) => l.kind === 'learn').teaching.teaching.explanation = original; }); }
  });
  it('does not expose a private course explanation to another guardian who can actually access the same learner', async () => {
    const descriptor = await courseDescriptor(), session = await openCourse(descriptor), [message] = await save(session, [{}]);
    await store.transaction(() => { const binding = store.select('bindings', { studentId: student.id, parentUserId: owner.user.id })[0]; store.append('bindings', { ...structuredClone(binding), id: randomUUID(), parentUserId: other.user.id }); });
    expect((await courseDescriptor(other)).studentId).toBe(student.id); const before = await fingerprint(); await preflight(session, [message.id], {}, other, 404); expect(await fingerprint()).toBe(before);
  });
  it('uses actual learning-code identity and fences paused and active assessments, then permits read-only checking after the assessment ends', async () => {
    const access = await call('post', '/students/' + student.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '匿名白板来源验证' }), code = await call('post', '/students/' + student.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    const actor = await call('post', '/auth/learning-code', { code: code.code }, null), session = await openCourse(await courseDescriptor(actor), actor, 'student'), [message] = await save(session, [{}]);
    expect((await preflight(session, [message.id], {}, actor)).audience.actorRole).toBe('student');
    const id = 'synthetic-source-board-assessment-' + randomUUID(); await store.transaction(() => store.append('diagnosticSessions', { id, studentId: student.id, subject: 'chemistry', status: 'paused' }));
    try { for (const status of ['paused', 'in_progress']) { await store.transaction(() => { store.find('diagnosticSessions', { id }).status = status; }); const before = await fingerprint(); await preflight(session, [message.id], {}, actor, 409); expect(await fingerprint()).toBe(before); } }
    finally { await store.transaction(() => { store.find('diagnosticSessions', { id }).status = 'aborted'; }); }
    expect((await preflight(session, [message.id], {}, actor)).origin.studentId).toBe(student.id);
  });
});
