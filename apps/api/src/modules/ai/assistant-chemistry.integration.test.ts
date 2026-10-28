import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('actual chemistry course teaching assistant across a younger profile', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-chemistry-assistant-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'];
  const prior = Object.fromEntries(names.map(n => [n, process.env[n]]));
  const source = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, parent: any, outsider: any, student: any, course: any, worker: any, chat: any, pg: Pool | undefined, schema: string | undefined;
  async function call(method: 'get' | 'post' | 'put', route: string, body?: unknown, actor = parent, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + route); if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, route + ': ' + JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
  }
  beforeAll(async () => {
    let driver = 'sqlite'; const url = process.env.STUDY_TEST_COURSE_ASSISTANT_POSTGRES_URL;
    if (url) {
      pg = new Pool({ connectionString: url }); expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_chemistry_assistant_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"');
      const scoped = new URL(url); scoped.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = scoped.toString(); driver = 'postgres';
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: driver, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true' });
    app = await NestFactory.create(source('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(source('infrastructure/in-memory-store.service').InMemoryStoreService);
    worker = app.get(source('modules/ai/assistant-turn-worker.service').AssistantTurnWorkerService);
    chat = app.get(source('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
    const register = () => call('post', '/auth/register', { principal: 'chemistry-assistant-' + randomUUID() + '@local.test', credential: 'Synthetic-Chemistry-' + randomUUID() }, null);
    parent = await register(); outsider = await register();
    student = (await call('post', '/students', { nickname: '匿名跨年级课程', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    const definitions = source('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum();
    course = source('modules/learning/chemistry-course').buildChemistryCourse(student.id, definitions.map((d: any) => d.atom));
    await store.transaction(() => {
      for (const d of definitions) store.append('knowledgeAtoms', d.atom);
      store.append('studioCourses', course);
    });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    if (pg) { if (!/^study_qa_chemistry_assistant_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Unsafe chemistry QA schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [n, value] of Object.entries(prior)) { if (value === undefined) delete process.env[n]; else process.env[n] = value; }
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.split(/[\\/]/).at(-1)!.startsWith('study-chemistry-assistant-')) throw Error('Unsafe chemistry fixture root');
    rmSync(directory, { recursive: true, force: true });
  });
  const path = (unit = course.units[0]) => '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'primary_unit', courseId: course.id, itemId: unit.id });
  const command = (d: any, userRole = 'parent') => ({ userRole, studentId: d.studentId, subject: d.subject, pageContext: 'course', contextRefType: d.kind, contextRefId: d.referenceId, contextItemId: d.itemId, contextSelection: d.selection });

  it('projects every real chemistry unit without questions or math fallback and retains both grade identities', async () => {
    expect(course.grade).toBe(9); expect(course.units).toHaveLength(7);
    const projection = source('modules/ai/assistant-teaching-content').primaryUnitTeachingCatalog;
    for (const unit of course.units) {
      const d = await call('get', path(unit)), catalog = projection(course, unit.id);
      expect(d).toMatchObject({ subject: 'chemistry', studentId: student.id, current: true, accessMode: 'published' });
      expect(d.targets).toHaveLength(unit.lessons.filter((l: any) => l.kind === 'learn').length);
      expect(catalog.parts[0].blocks[0].text).toBe(unit.lessons.find((l: any) => l.kind === 'learn').teaching.teaching.explanation);
      expect(JSON.stringify(catalog)).not.toMatch(/foundation:math:|异分母|通分|"questions"|"answerSchema"|"correctAnswer"|"ownerUserId"/);
    }
    expect(await store.requestContext(() => store.find('students', { id: student.id }).grade)).toBe(4);
  });

  it('resolves a legacy math overview link by actual chemistry course while rejecting a forged assistant subject', async () => {
    const overview = await call('get', '/learning/studio/overview?' + new URLSearchParams({ studentId: student.id, subject: 'math', courseId: course.id }));
    expect(overview.selected).toMatchObject({ id: student.id, grade: 4, subject: 'chemistry' });
    expect(overview.courses.find((c: any) => c.id === course.id)).toMatchObject({ subject: 'chemistry', grade: 9 });
    const d = await call('get', path()); await call('post', '/ai/assistant/sessions', { ...command(d), subject: 'math' }, parent, 400);
    await call('get', path(), undefined, outsider, 403);
  });

  it('uses chemical teaching and its original citations in a durable reply without modifying formal records', async () => {
    const d = await call('get', path()), session = await call('post', '/ai/assistant/sessions', command(d)), base = '/ai/assistant/sessions/' + session.id;
    const names = ['students', 'studioCourses', 'diagnosticResponses', 'practiceAttempts', 'masteryEstimates', 'diagnosticPlans'];
    const fingerprint = () => store.requestContext(() => createHash('sha256').update(JSON.stringify(names.map(n => store.select(n, {})))).digest('hex'));
    const before = await fingerprint();
    const reply = vi.spyOn(chat, 'reply').mockResolvedValue({ reply: '判断变化时，先比较变化前后的物质，再用实际证据核对是否有新物质生成。', evidenceIds: [], sourceKeys: ['atom-1'], modelId: 'deepseek-v4-flash', modelName: 'Synthetic chemistry reply' });
    const c = { requestKey: randomUUID(), message: '请解释本课第一个概念及其判断证据。', modelId: 'deepseek-v4-flash', contextVersion: (await call('get', base + '/context')).contextVersion };
    const turn = await call('post', base + '/turns', c); await worker.runNext();
    expect((await call('get', base + '/turns/' + turn.id)).status).toBe('completed');
    const sent = reply.mock.calls[0][0] as any; expect(sent.system).toContain('学生化学课程学习助教'); expect(sent.system).not.toMatch(/小学化学|小学全科/);
    expect(JSON.parse(sent.context).course.teaching.parts[0].blocks[0].text).toBe(course.units[0].lessons.find((l: any) => l.kind === 'learn').teaching.teaching.explanation);
    expect(sent.context.length).toBe(d.selectedCharacters); expect(sent.context).not.toMatch(/"questions"|"correctAnswer"|"answerSchema"|"studentId"/);
    const page = await call('get', base + '/messages/page'), answer = page.messages.find((m: any) => m.sender === 'assistant'), ref = answer.sourceReferences[0];
    expect(ref).toMatchObject({ courseId: course.id, itemId: course.units[0].id, contextFingerprint: d.fingerprint });
    expect((await call('get', base + '/sources/' + ref.key)).reference).toEqual(ref);
    expect((await call('post', base + '/turns', c)).assistantMessageId).toBe(turn.assistantMessageId ?? answer.id); expect(reply).toHaveBeenCalledOnce();
    expect(await fingerprint()).toBe(before);
  });

  it('keeps the student in the actual chemistry course and fences a pending assessment before creating a new command', async () => {
    const access = await call('post', '/students/' + student.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '匿名化学教学验证' });
    const code = await call('post', '/students/' + student.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    const actor = await call('post', '/auth/learning-code', { code: code.code }, null), d = await call('get', path(), undefined, actor);
    const session = await call('post', '/ai/assistant/sessions', command(d, 'student'), actor), base = '/ai/assistant/sessions/' + session.id;
    const assessmentId = 'synthetic-paused-chemistry-' + randomUUID();
    await store.transaction(() => store.append('diagnosticSessions', { id: assessmentId, studentId: student.id, subject: 'chemistry', status: 'paused' }));
    try {
      const context = await call('get', base + '/context', undefined, actor);
      expect(context.course).toMatchObject({ subject: 'chemistry', canSend: false, blocked: { code: 'assessment_in_progress' } });
      expect(context.course.blocked.href).toContain(assessmentId);
      await call('post', base + '/turns', { requestKey: randomUUID(), message: '这条问题需要在评测结束后继续。', modelId: 'deepseek-v4-flash', contextVersion: context.contextVersion }, actor, 409);
      expect((await call('get', base + '/messages/page', undefined, actor)).messages).toEqual([]);
    } finally { await store.transaction(() => { store.find('diagnosticSessions', { id: assessmentId }).status = 'aborted'; }); }
    expect((await call('get', base + '/context', undefined, actor)).course.canSend).toBe(true);
  });
});
