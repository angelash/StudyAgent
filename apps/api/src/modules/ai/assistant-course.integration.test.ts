import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { AtomTeaching, AssistantCourseDescriptor, StudioCourse } from '@study-agent/contracts';
import type { SourceCourseRecord } from '../learning/source-course-content';
import type { XiaojiuChatService } from './xiaojiu-chat.service';

const teaching = (): AtomTeaching => ({ reviewStatus: 'approved', explanation: '比较两个量时，先检查它们是否来自同一个整体，再核对单位。',
  example: { prompt: '比较同一条纸带中两部分的长度。', steps: ['确认同一个整体', '将每份的大小统一'], conclusion: '相同单位下才能直接比较数量。' },
  commonErrors: [{ code: 'unit', observation: '只看数字大小，没有先检查单位。', alternativeExplanations: ['可能没有辨清同一整体。'], verification: '换一条新的纸带，再请学习者解释比较条件。' }],
  verification: { understanding: '请说明为什么比较前要检查整体和单位。', procedure: '请解释一次统一单位的完整步骤。',
    transfer: '换一个生活情境说明同一关系。', retention: '间隔一段时间，再用独立新题核对。' } });

describe('course assistant authority, frozen scopes and durable replies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-course-assistant-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(names.map(n => [n, process.env[n]]));
  let app: any, store: any, worker: any, parent: any, other: any, admin: any, pg: Pool | undefined, schema: string | undefined;
  let chat: XiaojiuChatService;
  const base = (id: string) => '/ai/assistant/sessions/' + id;
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = parent, status = method === 'post' ? 201 : 200, target = app) {
    let q = request(target.getHttpServer())[method]('/api' + path); if (actor) q = q.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) q = q.send(body as object); return (await q.expect(status)).body.data;
  }
  async function boot() {
    app = await NestFactory.create(require('../../../dist/apps/api/src/app.module.js').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);
    worker = app.get(require('../../../dist/apps/api/src/modules/ai/assistant-turn-worker.service.js').AssistantTurnWorkerService);
    chat = app.get(require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js').XiaojiuChatService);
  }
  beforeAll(async () => {
    let driver = 'sqlite'; const url = process.env.STUDY_TEST_COURSE_ASSISTANT_POSTGRES_URL;
    if (url) {
      pg = new Pool({ connectionString: url }); expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_course_assistant_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"');
      const scoped = new URL(url); scoped.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = scoped.toString(); driver = 'postgres';
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: driver, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true' });
    await boot();
    const register = (principal: string) => call('post', '/auth/register', { principal, credential: 'Course-QA-only-20261028' }, null);
    parent = await register('course-parent@local.test'); other = await register('course-other@local.test'); admin = await register('course-admin@local.test');
    // Isolated persisted admin fixture; provisioning and role-change flows have their own suites.
    await store.transaction(() => { store.find('users', { id: admin.user.id }).role = 'admin'; });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    if (pg) { if (!/^study_qa_course_assistant_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Unsafe course QA schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [n, v] of Object.entries(prior)) { if (v === undefined) delete process.env[n]; else process.env[n] = v; }
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('study-course-assistant-')) throw Error('Unsafe course QA directory');
    rmSync(directory, { recursive: true, force: true });
  });
  const child = async () => (await call('post', '/students', { nickname: '匿名课程学习者', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
  async function primary(long = false) {
    const student = await child(), id = long ? 'c'.repeat(180) : 'primary-' + randomUUID();
    const row: StudioCourse = { id, studentId: student.id, subject: 'math', grade: 3, term: 'upper', title: '比较数量', description: '匿名课程',
      objective: '理解单位一致性', status: 'active', source: 'studyagent_curriculum', scopeVersion: 1, textbookVersion: 'synthetic-book-v1', focusAtomIds: ['unit'],
      units: [{ id: 'unit-1', title: '同一整体', objective: '比较前核对整体与单位', lessons: [{ id: 'learn:unit', atomId: 'unit', title: '统一单位', objective: '解释比较条件',
        kind: 'learn', state: 'not_started', href: '/PRIVATE_PRACTICE_ROUTE', teaching: { atomVersion: 1, teaching: teaching() } }] }],
      materials: [], fingerprint: 'UNRELATED_DRAFT_HASH', createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z' };
    await store.transaction(() => store.append('studioCourses', row)); return { student, row, kind: 'primary_unit' as const, itemId: 'unit-1' };
  }
  async function material(studentId: string | null = null, published = true) {
    const id = 'material-' + randomUUID(), quote = '比较数量之前，先检查它们是否来自同一个整体。';
    const row: SourceCourseRecord = { id, ownerUserId: parent.user.id, studentId, subject: studentId ? 'math' : null, audience: studentId ? 'student' : 'adult',
      targetGoals: [], input: { title: 'PRIVATE_INPUT', goal: 'PRIVATE_INPUT', language: 'zh-CN', minutesPerSession: 15, modelId: 'fixture', targetAtomIds: [] },
      sources: [{ key: 'page-one', materialId: 'PRIVATE_UPLOAD', page: 3, title: '公开资料', kind: 'text', text: quote + 'PRIVATE_FULL_TEXT', blocks: [],
        sha256: 'a'.repeat(64), version: 'source-v1', fingerprint: 'PRIVATE_SOURCE_HASH', structureReviewRequired: false }],
      revision: 1, status: published ? 'active' : 'ready', taskId: null, result: { title: '数量的比较', overview: '公开概览', lessons: [{ title: '统一单位', objective: '说明比较条件',
        introduction: '先核对所比较的量来自哪个整体。', concept: quote, notes: ['同一整体', '相同单位'], example: { scenario: '比较同一条纸带的两个部分。',
          steps: ['确认整体不变', '再统一每份的大小'], board: ['核对整体', '统一单位'], conclusion: '单位相同后再比较数量。' },
        misconception: { claim: '只要数字更大，数量就更多。', correction: '应先检查单位是否一致。', board: ['不能只看数字', '解释比较条件'] },
        transfer: '换一条新的纸带，解释比较条件。', summary: '比较数量前先核对整体与单位。', takeaways: ['同一整体', '相同单位'], citations: [{ sourceKey: 'page-one', quote }],
        questions: [0, 1].map(answer => ({ prompt: 'PRIVATE_QUESTION', options: ['A', 'B', 'C', 'D'], answer, explanation: 'PRIVATE_SCORING', hints: ['PRIVATE_HINT', 'PRIVATE_HINT'] })) }] },
      originalResult: null, edits: [], fingerprint: 'PRIVATE_GENERATION_HASH', modelName: 'Synthetic', confirmedAt: published ? '2026-10-28T00:00:00.000Z' : null,
      createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z', requests: [],
      versioning: { familyId: id, parentCourseId: null, number: 1, state: published ? 'published' : 'draft', events: [] } };
    await store.transaction(() => store.append('sourceCourses', row)); return { row, kind: 'material_lesson' as const, itemId: `source:${id}:1` };
  }
  type Fixture = Awaited<ReturnType<typeof primary>> | Awaited<ReturnType<typeof material>>;
  const descriptorPath = (f: Fixture, extra: Record<string, string> = {}) => '/ai/assistant/course-context?' + new URLSearchParams({ kind: f.kind, courseId: f.row.id, itemId: f.itemId, ...extra });
  const descriptor = (f: Fixture, actor = parent, extra: Record<string, string> = {}) => call('get', descriptorPath(f, extra), undefined, actor) as Promise<AssistantCourseDescriptor>;
  const command = (d: AssistantCourseDescriptor, role: 'parent' | 'student' = 'parent') => ({ userRole: role, studentId: d.studentId, subject: d.subject,
    pageContext: 'course', contextRefType: d.kind, contextRefId: d.referenceId, contextItemId: d.itemId, contextSelection: d.selection });
  const open = async (f: Fixture, actor = parent, role: 'parent' | 'student' = 'parent') => { const d = await descriptor(f, actor); return { d, session: await call('post', '/ai/assistant/sessions', command(d, role), actor) }; };
  const input = async (sessionId: string, actor = parent) => ({ requestKey: randomUUID(), message: '请解释本课的概念，再给一个不同的匿名情境。', modelId: 'deepseek-v4-flash',
    contextVersion: (await call('get', base(sessionId) + '/context', undefined, actor)).contextVersion });
  const model = () => vi.spyOn(chat, 'reply').mockResolvedValue({ reply: '比较数量之前先核对整体与单位，再用一个新情境说明比较条件。', evidenceIds: [], modelId: 'deepseek-v4-flash', modelName: 'Synthetic course model' });
  async function learner(studentId: string) {
    const access = await call('post', '/students/' + studentId + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '匿名课程助教验证' });
    const code = await call('post', '/students/' + studentId + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    return { actor: await call('post', '/auth/learning-code', { code: code.code }, null), access };
  }

  it('derives actual primary scope, returns no body/private fields and isolates other families', async () => {
    const f = await primary(), { d, session } = await open(f);
    expect(d).toMatchObject({ kind: 'primary_unit', studentId: f.student.id, subject: 'math', accessMode: 'published', current: true, selectionFits: true, canSend: true });
    expect(d.targets).toHaveLength(1); expect(d.parts).toHaveLength(7); expect(JSON.stringify(d)).not.toMatch(/PRIVATE_|blocks|explanation|courseSnapshot/);
    expect(JSON.stringify(session)).not.toMatch(/courseSnapshot|ownerUserId|scopeKey/);
    const context = await call('get', base(session.id) + '/context'); expect(context.course.referenceId).toBe(d.referenceId); expect(context.location.href).toContain('/studio?');
    await call('get', descriptorPath(f), undefined, other, 403); await call('get', base(session.id) + '/messages/page', undefined, other, 404);
    expect((await open(f)).session.id).toBe(session.id);
    await call('post', '/ai/assistant/sessions', { ...command(d), studentId: null }, parent, 400);
    await call('post', '/ai/assistant/sessions', { ...command(d), subject: 'english' }, parent, 400);
  });
  it('permits a persisted admin fixture to read a valid primary course without granting a foreign private material', async () => {
    const f = await primary(); expect((await descriptor(f, admin)).studentId).toBe(f.student.id);
    const privateMaterial = await material(); await call('get', descriptorPath(privateMaterial), undefined, admin, 403);
  });
  it('keeps long course references intact while retaining the original limit for legacy contexts', async () => {
    const { d, session } = await open(await primary(true)); expect(d.referenceId.length).toBe(245); expect(session.contextRefId).toBe(d.referenceId);
    await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: d.studentId, subject: 'math', pageContext: 'review', contextRefType: 'plan', contextRefId: 'x'.repeat(181) }, parent, 400);
    await call('post', '/ai/assistant/sessions', { ...command(d), courseSnapshot: { text: 'FORGED' } }, parent, 400);
  });
  it('reuses one scope and command across two actual API instances and isolates another authorized guardian', async () => {
    const f = await primary(), d = await descriptor(f);
    const second = await NestFactory.create(require('../../../dist/apps/api/src/app.module.js').AppModule, { logger: false });
    second.setGlobalPrefix('api'); await second.init();
    try {
      const [one, two] = await Promise.all([call('post', '/ai/assistant/sessions', command(d)), call('post', '/ai/assistant/sessions', command(d), parent, 201, second)]);
      expect(one.id).toBe(two.id); const c = await input(one.id), reply = model();
      const turns = await Promise.all([call('post', base(one.id) + '/turns', c), call('post', base(one.id) + '/turns', c, parent, 201, second)]);
      expect(turns[0].id).toBe(turns[1].id); await worker.runNext(); expect(reply).toHaveBeenCalledOnce();
      expect((await call('get', base(one.id) + '/messages/page')).messages).toHaveLength(2);
      await store.transaction(() => store.append('bindings', { id: store.nextId('binding'), studentId: f.student.id, parentUserId: other.user.id, status: 'active', relation: 'guardian' }));
      const shared = await open(f, other); expect(shared.d.referenceId).toBe(d.referenceId); expect(shared.session.id).not.toBe(one.id);
      await call('get', base(one.id) + '/messages/page', undefined, other, 404);
    } finally { await second.close(); }
  });
  it('passes the complete selected teaching to a durable model reply without learning/progress writes', async () => {
    const f = await primary(), { d, session } = await open(f), reply = model();
    const before = await store.requestContext(() => JSON.stringify([store.masteryEstimates, store.diagnosticPlans, store.practiceAttempts, store.studioCourses]));
    const c = await input(session.id), turn = await call('post', base(session.id) + '/turns', c); expect(reply).not.toHaveBeenCalled();
    expect((await call('post', base(session.id) + '/turns', c)).id).toBe(turn.id); await worker.runNext();
    expect(await call('get', base(session.id) + '/turns/' + turn.id)).toMatchObject({ status: 'completed', modelId: 'deepseek-v4-flash' });
    const sent = reply.mock.calls[0][0], context = JSON.parse(sent.context);
    expect(context.course.teaching.parts[0].blocks[0].text).toBe(teaching().explanation); expect(context.evidenceIds).toEqual([]);
    expect(sent.context.length).toBe(d.selectedCharacters); expect(sent.system).toContain('小学数学课程学习助教');
    expect(sent.context).not.toMatch(/studentId|ownerUserId|PRIVATE_|questions|scoring|mastery/);
    expect(await store.requestContext(() => JSON.stringify([store.masteryEstimates, store.diagnosticPlans, store.practiceAttempts, store.studioCourses]))).toBe(before);
    expect((await call('get', base(session.id) + '/messages/page')).messages).toHaveLength(2); expect(reply).toHaveBeenCalledOnce();
  });
  it('uses only public material teaching and source excerpts in an adult context', async () => {
    const f = await material(), { session } = await open(f), reply = model();
    const turn = await call('post', base(session.id) + '/turns', await input(session.id)); await worker.runNext();
    expect((await call('get', base(session.id) + '/turns/' + turn.id)).status).toBe('completed');
    const sent = reply.mock.calls[0][0]; expect(sent.system).toContain('资料课程学习助教'); expect(sent.system).not.toContain('小学');
    expect(sent.context).toContain('公开资料'); expect(sent.context).not.toMatch(/PRIVATE_|studentId|ownerUserId|questions|originalResult/);
    expect((await call('get', base(session.id) + '/context')).course.href).toContain('/studio/source-courses?');
  });
  it('distinguishes an owner ready draft and makes its old scope read-only after publication', async () => {
    const f = await material(null, false), { d, session } = await open(f); expect(d.accessMode).toBe('authoring');
    await call('get', descriptorPath(f), undefined, other, 403);
    await store.transaction(() => { const row = store.find('sourceCourses', { id: f.row.id }); row.status = 'active'; row.confirmedAt = new Date().toISOString(); row.versioning.state = 'published'; });
    expect((await call('get', base(session.id) + '/context')).course).toMatchObject({ current: false, canSend: false, accessMode: 'authoring' });
    await call('post', base(session.id) + '/turns', await input(session.id), parent, 409);
    const next = await open(f); expect(next.d.accessMode).toBe('published'); expect(next.session.id).not.toBe(session.id);
  });
  it('uses actual learner identity and rejects unpublished material and unrelated child scopes', async () => {
    const f = await primary(), { actor } = await learner(f.student.id), { session } = await open(f, actor, 'student'), reply = model();
    const turn = await call('post', base(session.id) + '/turns', await input(session.id, actor), actor); await worker.runNext();
    expect((await call('get', base(session.id) + '/turns/' + turn.id, undefined, actor)).status).toBe('completed'); expect(reply).toHaveBeenCalledOnce();
    const draft = await material(f.student.id, false); await call('get', descriptorPath(draft), undefined, actor, 403);
    const another = await primary(); await call('get', descriptorPath(another), undefined, actor, 403);
    await call('post', '/ai/assistant/sessions', command(await descriptor(f), 'parent'), actor, 403);
    await call('get', '/ai/assistant/lecture-context?courseId=sociology-foundations&lectureId=soc-u1-l1', undefined, actor, 403);
    await call('get', '/ai/assistant/course-context/private', undefined, actor, 404);
  });
  it('blocks a new course entry during formal assessment while retaining historical reads', async () => {
    const f = await primary(), { actor } = await learner(f.student.id), { d, session } = await open(f, actor, 'student');
    const assessmentId = 'assessment-' + randomUUID(); await store.transaction(() => store.append('diagnosticSessions', { id: assessmentId, studentId: f.student.id, subject: 'math', status: 'in_progress' }));
    const response = await request(app.getHttpServer()).get('/api' + descriptorPath(f)).set('Authorization', 'Bearer ' + actor.token).expect(409);
    expect(JSON.stringify(response.body)).toContain('assessment_in_progress'); expect(JSON.stringify(response.body)).toContain(assessmentId);
    expect((await call('get', base(session.id) + '/context', undefined, actor)).course).toMatchObject({ current: true, canSend: false, blocked: { code: 'assessment_in_progress' } });
    expect((await descriptor(f, actor, { fingerprint: d.fingerprint })).canSend).toBe(false);
    await call('post', base(session.id) + '/turns', await input(session.id, actor), actor, 409);
  });
  it('fences a queued model before execution if a formal assessment starts later', async () => {
    const f = await primary(), { actor } = await learner(f.student.id), { session } = await open(f, actor, 'student'), reply = model();
    const turn = await call('post', base(session.id) + '/turns', await input(session.id, actor), actor);
    await store.transaction(() => store.append('diagnosticSessions', { id: 'paused-' + randomUUID(), studentId: f.student.id, subject: 'math', status: 'paused' }));
    await worker.runNext(); expect(reply).not.toHaveBeenCalled();
    expect(await call('get', base(session.id) + '/turns/' + turn.id, undefined, actor)).toMatchObject({ status: 'failed', task: { errorCode: 'assistant_context_changed' } });
    expect((await call('get', base(session.id) + '/messages/page', undefined, actor)).messages).toEqual([]);
  });
  it('retains the original learner grant after revocation and requires a new authorized command', async () => {
    const f = await primary(), { actor, access } = await learner(f.student.id), { session } = await open(f, actor, 'student'), reply = model();
    const turn = await call('post', base(session.id) + '/turns', await input(session.id, actor), actor);
    const disabled = await call('post', '/students/' + f.student.id + '/learning-access', { enabled: false, expectedVersion: access.version, requestKey: randomUUID(), reason: '撤回匿名课程授权' });
    const enabled = await call('post', '/students/' + f.student.id + '/learning-access', { enabled: true, expectedVersion: disabled.version, requestKey: randomUUID(), reason: '启用新的匿名课程授权' });
    const code = await call('post', '/students/' + f.student.id + '/learning-access/codes', { expectedVersion: enabled.version, requestKey: randomUUID() });
    const current = await call('post', '/auth/learning-code', { code: code.code }, null);
    await worker.runNext(); expect(reply).not.toHaveBeenCalled();
    const failed = await call('get', base(session.id) + '/turns/' + turn.id, undefined, current); expect(failed.status).toBe('failed');
    await call('post', base(session.id) + '/turns/' + turn.id + '/retry', { version: failed.task.version, generation: failed.task.generation }, current, 403);
    await call('get', base(session.id) + '/context', undefined, actor, 401);
    const next = await call('post', base(session.id) + '/turns', await input(session.id, current), current); await worker.runNext();
    expect((await call('get', base(session.id) + '/turns/' + next.id, undefined, current)).status).toBe('completed'); expect(reply).toHaveBeenCalledOnce();
  });
  it('does not publish or expose a parent answer after its original child binding is revoked', async () => {
    const f = await primary(), { session } = await open(f);
    const reply = vi.spyOn(chat, 'reply').mockImplementation(async () => {
      await store.transaction(() => { store.find('bindings', { studentId: f.student.id, parentUserId: parent.user.id, status: 'active' }).status = 'inactive'; });
      return { reply: '这条原监护权限下的迟到回答不应发布。', evidenceIds: [], modelId: 'deepseek-v4-flash', modelName: 'Synthetic' };
    });
    const turn = await call('post', base(session.id) + '/turns', await input(session.id)); await worker.runNext(); expect(reply).toHaveBeenCalledOnce();
    const record = await store.requestContext(() => store.find('assistantTurns', { id: turn.id }));
    expect(await store.tasks.get(record.taskId)).toMatchObject({ state: 'failed', errorCode: 'assistant_context_changed' });
    expect(await store.requestContext(() => store.select('assistantMessages', { sessionId: session.id }).length)).toBe(0);
    await call('get', base(session.id) + '/context', undefined, parent, 403);
  });
  it('retains a failed original after a narration edit and rejects its retry against changed teaching', async () => {
    const f = await primary(), { session } = await open(f), reply = model(), turn = await call('post', base(session.id) + '/turns', await input(session.id));
    await store.transaction(() => { store.find('studioCourses', { id: f.row.id }).units[0].lessons[0].teaching.teaching.explanation += ' 新的条件。'; });
    expect((await call('get', base(session.id) + '/context')).course.current).toBe(false); await worker.runNext(); expect(reply).not.toHaveBeenCalled();
    const failed = await call('get', base(session.id) + '/turns/' + turn.id); expect(failed.task.errorCode).toBe('assistant_context_changed');
    await call('post', base(session.id) + '/turns/' + turn.id + '/retry', { version: failed.task.version, generation: failed.task.generation }, parent, 409);
    expect((await open(f)).session.id).not.toBe(session.id);
  });
  it('fences publication when teaching is changed while the provider is running', async () => {
    const f = await material(), { session } = await open(f);
    const reply = vi.spyOn(chat, 'reply').mockImplementation(async () => { await store.transaction(() => { store.find('sourceCourses', { id: f.row.id }).result.lessons[0].concept += ' 新的说明。'; });
      return { reply: '这条迟到的回答不可发布。', evidenceIds: [], modelId: 'deepseek-v4-flash', modelName: 'Synthetic' }; });
    const turn = await call('post', base(session.id) + '/turns', await input(session.id)); await worker.runNext(); expect(reply).toHaveBeenCalledOnce();
    expect((await call('get', base(session.id) + '/turns/' + turn.id)).status).toBe('failed'); expect((await call('get', base(session.id) + '/messages/page')).messages).toEqual([]);
  });
  it('marks archived material read-only without modifying its original snapshot or history', async () => {
    const f = await material(), { d, session } = await open(f), before = await store.requestContext(() => JSON.stringify(store.find('assistantSessions', { id: session.id }).courseSnapshot));
    await store.transaction(() => { const row = store.find('sourceCourses', { id: f.row.id }); row.status = 'archived'; row.versioning.state = 'withdrawn'; });
    expect((await call('get', base(session.id) + '/context')).course.current).toBe(false);
    expect((await descriptor(f, parent, { fingerprint: d.fingerprint })).sessionId).toBe(session.id); await call('get', descriptorPath(f), undefined, parent, 409);
    expect(await store.requestContext(() => JSON.stringify(store.find('assistantSessions', { id: session.id }).courseSnapshot))).toBe(before);
  });
  it('preserves complete selected parts and rejects unknown or oversized scopes without falling back', async () => {
    const f = await primary(); await store.transaction(() => { const row = store.find('studioCourses', { id: f.row.id }); const seed = row.units[0].lessons[0];
      row.units[0].lessons = Array.from({ length: 12 }, (_, i) => ({ ...structuredClone(seed), id: 'learn:' + i, atomId: 'atom:' + i })); });
    const full = await descriptor(f); expect(full.completeFits).toBe(false); expect(full.selectionFits).toBe(false); expect(full.canSend).toBe(false); expect(full.parts).toHaveLength(84);
    await call('post', '/ai/assistant/sessions', command(full), parent, 409);
    const selection = { mode: 'detail', partKeys: [full.parts[0].key] }, chosen = await descriptor(f, parent, { selection: JSON.stringify(selection) });
    expect(chosen.selectionFits).toBe(true); const session = await call('post', '/ai/assistant/sessions', command(chosen));
    const stored = await store.requestContext(() => store.find('assistantSessions', { id: session.id }).courseSnapshot);
    expect(stored.teaching.targets).toHaveLength(1); expect(stored.teaching.parts[0].blocks[0].text).toBe(teaching().explanation);
    await call('get', descriptorPath(f, { selection: JSON.stringify({ mode: 'detail', partKeys: ['unknown'] }) }), undefined, parent, 400);
    await call('get', descriptorPath(f, { selection: '{broken' }), undefined, parent, 400);
  });
  it('recovers the same original session and completed request after a real API restart', async () => {
    const f = await material(), { session } = await open(f), reply = model(), c = await input(session.id), turn = await call('post', base(session.id) + '/turns', c);
    await worker.runNext(); const done = await call('get', base(session.id) + '/turns/' + turn.id); expect(done.status).toBe('completed'); expect(reply).toHaveBeenCalledOnce();
    await app.close(); vi.restoreAllMocks(); await boot(); const reopened = await open(f); expect(reopened.session.id).toBe(session.id);
    expect((await call('post', base(session.id) + '/turns', c)).assistantMessageId).toBe(done.assistantMessageId);
    expect((await call('get', base(session.id) + '/messages/page')).messages).toHaveLength(2);
  });
  it('refuses current reconstruction of a corrupt stored snapshot while preserving own messages', async () => {
    const f = await primary(), { session } = await open(f), reply = model(), turn = await call('post', base(session.id) + '/turns', await input(session.id)); await worker.runNext(); expect(reply).toHaveBeenCalledOnce();
    await store.transaction(() => { store.find('assistantSessions', { id: session.id }).courseSnapshot.teaching.parts[0].blocks[0].text = 'CORRUPT'; });
    await call('get', base(session.id) + '/context', undefined, parent, 409); expect((await call('get', base(session.id) + '/messages/page')).messages).toHaveLength(2);
    expect((await call('get', base(session.id) + '/turns/' + turn.id)).status).toBe('completed');
  });
});
