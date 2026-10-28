import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('private saved assistant messages to complete read-only artifact sources', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-assistant-artifact-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'];
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const src = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let app: any, store: any, owner: any, other: any, student: any, course: any, independent: any, pg: Pool | undefined, schema: string | undefined;
  let reply: any;
  const formal = ['students', 'learningScopes', 'knowledgeAtoms', 'studioCourses', 'sourceCourses', 'assistantSessions', 'assistantMessages',
    'assistantTurns', 'diagnosticSessions', 'diagnosticResponses', 'practiceAttempts', 'masteryEstimates', 'diagnosticReports', 'diagnosticPlans',
    'studioTopicWhiteboardDrafts', 'studioTopicWhiteboards'];
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const fingerprint = () => store.requestContext(() => hash(JSON.stringify(formal.map(name => store.inspect(name)))));
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = owner, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, path + ': ' + JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
  }
  const preflight = (session: any, ids: string[], extra: object = {}, actor = owner, expected = 200) =>
    call('post', '/ai/assistant/sessions/' + session.id + '/artifacts/preflight', {
      kind: 'verbatim_note', selection: { messageIds: ids, includeLinkedQuestions: false }, objective: '完整保留所选解释和原出处', ...extra,
    }, actor, expected);
  const save = async (session: any, values: any[]) => {
    const rows = values.map(value => ({ id: randomUUID(), sessionId: session.id, sender: 'user', content: '匿名完整原文', createdAt: '2026-10-28T00:00:00.000Z', ...value }));
    await store.transaction(() => { for (const row of rows) store.append('assistantMessages', row); }); return rows;
  };
  const coursePath = () => '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'primary_unit', courseId: course.id, itemId: course.units[0].id });
  const openCourse = (descriptor: any, actor = owner, userRole = 'parent') => call('post', '/ai/assistant/sessions', {
    userRole, studentId: descriptor.studentId, subject: descriptor.subject, pageContext: 'course', contextRefType: descriptor.kind,
    contextRefId: descriptor.referenceId, contextItemId: descriptor.itemId, contextSelection: descriptor.selection,
  }, actor);
  beforeAll(async () => {
    let driver = 'sqlite'; const url = process.env.STUDY_TEST_ASSISTANT_ARTIFACT_POSTGRES_URL ?? process.env.STUDY_TEST_COURSE_ASSISTANT_POSTGRES_URL;
    if (url) {
      const target = new URL(url); expect(target.hostname).toBe('127.0.0.1'); expect(target.port).toBe(process.env.CI === 'true' ? '5432' : '15439');
      pg = new Pool({ connectionString: url }); expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_assistant_artifact_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"');
      target.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = target.toString(); driver = 'postgres';
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: driver, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    app = await NestFactory.create(src('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(src('infrastructure/in-memory-store.service').InMemoryStoreService);
    reply = vi.spyOn(app.get(src('modules/ai/xiaojiu-chat.service').XiaojiuChatService), 'reply').mockRejectedValue(new Error('A source preflight must never call a model'));
    const register = () => call('post', '/auth/register', { principal: 'artifact-' + randomUUID() + '@local.test', credential: 'Synthetic-Artifact-' + randomUUID() }, null);
    owner = await register(); other = await register();
    student = (await call('post', '/students', { nickname: '匿名来源档案', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    const definitions = src('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum();
    course = src('modules/learning/chemistry-course').buildChemistryCourse(student.id, definitions.map((definition: any) => definition.atom));
    await store.transaction(() => { for (const definition of definitions) store.append('knowledgeAtoms', definition.atom); store.append('studioCourses', course); });
    independent = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' });
  });
  afterAll(async () => {
    expect(reply).not.toHaveBeenCalled(); vi.restoreAllMocks(); await app?.close();
    if (pg) { if (!/^study_qa_assistant_artifact_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Unsafe artifact QA schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.split(/[\\/]/).at(-1)!.startsWith('study-assistant-artifact-')) throw Error('Unsafe artifact fixture root');
    rmSync(directory, { recursive: true, force: true });
  });

  it('recovers a source outside70 messages in its original same-millisecond order, with deterministic complete provenance', async () => {
    const rows = await save(independent, Array.from({ length: 75 }, (_, index) => ({ content: '完整历史消息' + index })));
    const question = rows[0], text = '|单位|数量|\n|---|---|\n|米|3|\n公式：$a+b$\n```js\nconsole.log("原文");\n```\n😀';
    const [answer] = await save(independent, [{ sender: 'assistant', content: text, inReplyTo: question.id, source: 'xiaojiu',
      modelId: 'saved-original-model', modelName: '原保存模型', evidenceIds: ['private-evidence-not-for-artifact'], requestKey: 'internal-' + randomUUID(), internalPrepared: 'PRIVATE-PREPARED' }]);
    const before = await fingerprint();
    const result = await preflight(independent, [answer.id], { selection: { messageIds: [answer.id], includeLinkedQuestions: true } });
    expect(result.origin).toMatchObject({ studentId: null, subject: null, selection: { messageIds: [question.id, answer.id], linkedQuestionIds: [question.id] } });
    expect(result.origin.messages.map((message: any) => message.content)).toEqual([question.content, text]);
    expect(result.origin.messages[1]).toMatchObject({ modelId: 'saved-original-model', modelName: '原保存模型', contentSha256: hash(text), sourceReferences: [] });
    expect(result.origin.messages.map((message: any) => message.sequence)).toEqual([0, 75]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE-PREPARED|private-evidence-not-for-artifact|internal-/);
    expect((await preflight(independent, [answer.id], { selection: { messageIds: [answer.id], includeLinkedQuestions: true } })).fingerprint).toBe(result.fingerprint);
    const forward = await preflight(independent, [question.id, answer.id]), backward = await preflight(independent, [answer.id, question.id]);
    expect(backward.fingerprint).toBe(forward.fingerprint); expect(await fingerprint()).toBe(before);
  });

  it('rejects duplicate IDs, forged bodies/scopes, unsupported kinds, missing and cross-session sources without writes', async () => {
    const [message] = await save(independent, [{}]), descriptor = await call('get', coursePath()), another = await openCourse(descriptor);
    const [foreign] = await save(another, [{}]), before = await fingerprint();
    await preflight(independent, [message.id, message.id], {}, owner, 400);
    await preflight(independent, [message.id], { content: '客户端伪造正文' }, owner, 400);
    await preflight(independent, [message.id], { studentId: student.id }, owner, 400);
    await preflight(independent, [message.id], { kind: 'topic_whiteboard' }, owner, 400);
    await preflight(independent, [randomUUID()], {}, owner, 404);
    await preflight(independent, [foreign.id], {}, owner, 404);
    await preflight(independent, [message.id], {}, other, 404);
    await preflight(independent, [message.id], {}, null, 401);
    expect(await fingerprint()).toBe(before);
  });

  it('counts linked questions in the20 limit and explicitly rejects a deleted link', async () => {
    const questions = await save(independent, Array.from({ length: 20 }, () => ({})));
    const answers = await save(independent, questions.map(question => ({ sender: 'assistant', inReplyTo: question.id })));
    const [orphan] = await save(independent, [{ sender: 'assistant', inReplyTo: randomUUID() }]);
    const before = await fingerprint();
    await preflight(independent, answers.map(answer => answer.id), { selection: { messageIds: answers.map(answer => answer.id), includeLinkedQuestions: true } }, owner, 400);
    await preflight(independent, [orphan.id], { selection: { messageIds: [orphan.id], includeLinkedQuestions: true } }, owner, 404);
    expect((await preflight(independent, answers.map(answer => answer.id))).origin.messages).toHaveLength(20);
    expect(await fingerprint()).toBe(before);
  });

  it('reports the complete serialized budget without truncating, changing the objective or creating an artifact', async () => {
    const rows = await save(independent, Array.from({ length: 8 }, (_, index) => ({ sender: 'assistant', content: String(index) + '原始讲解'.repeat(700) })));
    const before = await fingerprint(), result = await preflight(independent, rows.map(row => row.id));
    expect(result).toMatchObject({ fits: false, maxContextCharacters: 18000, blocked: { code: 'source_budget_exceeded' } });
    expect(result.contextCharacters).toBeGreaterThan(18000);
    expect(result.origin.messages.map((message: any) => message.content)).toEqual(rows.map(row => row.content));
    expect(result.contextCharacters).toBe(JSON.stringify({ kind: result.kind, objective: result.objective, origin: result.origin }).length);
    expect(await fingerprint()).toBe(before);
  });

  it('keeps an actual adult lecture and its frozen source independent of the current child', async () => {
    const actual = src('modules/learning/classroom-curriculum').classroomCourse(), lecture = actual.units[0].lectures[0];
    const descriptor = await call('get', '/ai/assistant/lecture-context?' + new URLSearchParams({ courseId: actual.id, lectureId: lecture.id }));
    const session = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom',
      contextRefType: 'classroom_lecture', contextRefId: descriptor.referenceId, contextItemId: descriptor.lectureId });
    const frozen = src('modules/ai/assistant-lecture-context').freezeAssistantLecture(actual.id, lecture.id);
    const reference = (await call('get', '/ai/assistant/sessions/' + session.id + '/sources/' + frozen.teaching.sources[0].key)).reference;
    const [message] = await save(session, [{ sender: 'assistant', content: '匿名讲座原解释，保留原来的概念关系。', sourceReferences: [reference] }]);
    const before = await fingerprint(), result = await preflight(session, [message.id]);
    expect(result.origin).toMatchObject({ studentId: null, subject: null, lecture: { lectureId: lecture.id, fingerprint: descriptor.fingerprint }, teachingScope: { grade: null } });
    expect(result.origin.location.href).toContain('/studio/classroom?'); expect(result.origin.messages[0].sourceReferences).toEqual([reference]);
    expect(await fingerprint()).toBe(before);
  });

  it('reads an owner-ready adult material lesson without its private input, upload body or scoring keys', async () => {
    const id = 'artifact-material-' + randomUUID(), quote = '比较同一纸带的两部分之前，先确认每份的大小一致。';
    const row = { id, ownerUserId: owner.user.id, studentId: null, subject: null, audience: 'adult', targetGoals: [],
      input: { title: 'PRIVATE_INPUT', goal: 'PRIVATE_INPUT', language: 'zh-CN', minutesPerSession: 15, modelId: 'fixture', targetAtomIds: [] },
      sources: [{ key: 'page-one', materialId: 'PRIVATE_UPLOAD', page: 3, title: '匿名资料原页', kind: 'text', text: quote + 'PRIVATE_FULL_TEXT', blocks: [],
        sha256: 'a'.repeat(64), version: 'source-v1', fingerprint: 'PRIVATE_SOURCE_HASH', structureReviewRequired: false }],
      revision: 1, status: 'ready', taskId: null, result: { title: '原资料教学', overview: '资料概览', lessons: [{ title: '确认比较单位', objective: '说明比较条件',
        introduction: '先看清每份的实际大小。', concept: quote, notes: ['确认整体', '确认单位'], example: { scenario: '同一纸带的两个部分', steps: ['确认每份大小', '再比较份数'], board: ['看单位', '看份数'], conclusion: quote },
        misconception: { claim: '直接比较数字即可。', correction: '需要先确认单位。', board: ['先核对比较条件'] }, transfer: '换一个匿名情境解释条件。',
        summary: quote, takeaways: ['看清单位'], citations: [{ sourceKey: 'page-one', quote }],
        questions: [0, 1].map(answer => ({ prompt: 'PRIVATE_QUESTION', options: ['A', 'B', 'C', 'D'], answer, explanation: 'PRIVATE_SCORING', hints: ['PRIVATE_HINT', 'PRIVATE_HINT'] })) }] },
      originalResult: null, edits: [], fingerprint: 'PRIVATE_GENERATION_HASH', modelName: 'Synthetic', confirmedAt: null,
      createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z', requests: [],
      versioning: { familyId: id, parentCourseId: null, number: 1, state: 'draft', events: [] } };
    await store.transaction(() => store.append('sourceCourses', row));
    const itemId = 'source:' + id + ':1', descriptor = await call('get', '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'material_lesson', courseId: id, itemId }));
    const session = await openCourse(descriptor), catalog = src('modules/ai/assistant-teaching-content').materialLessonTeachingCatalog(row, itemId);
    const reference = (await call('get', '/ai/assistant/sessions/' + session.id + '/sources/' + catalog.sources[0].key)).reference;
    const [message] = await save(session, [{ sender: 'assistant', content: quote, sourceReferences: [reference] }]);
    const before = await fingerprint(), result = await preflight(session, [message.id]);
    expect(result.origin).toMatchObject({ studentId: null, subject: null, course: { kind: 'material_lesson', accessMode: 'authoring', current: true } });
    expect(result.origin.messages[0].sourceReferences).toEqual([reference]); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expect(await fingerprint()).toBe(before);
  });

  it('uses frozen grade9 chemistry and trusted original references while retaining the grade4 learner and another guardian boundary', async () => {
    const descriptor = await call('get', coursePath()), session = await openCourse(descriptor);
    const preview = await call('get', '/ai/assistant/sessions/' + session.id + '/sources/atom-1');
    const [message] = await save(session, [{ sender: 'assistant', content: '判断变化要核对有无新物质生成。', sourceReferences: [preview.reference], modelId: 'saved-chemistry-model' }]);
    await store.transaction(() => store.append('bindings', { id: randomUUID(), parentUserId: other.user.id, studentId: student.id, status: 'active', createdAt: new Date().toISOString() }));
    expect((await call('get', coursePath(), undefined, other)).subject).toBe('chemistry');
    const before = await fingerprint(), result = await preflight(session, [message.id]);
    expect(result.origin).toMatchObject({ studentId: student.id, subject: 'chemistry', course: { fingerprint: descriptor.fingerprint, current: true }, teachingScope: { grade: 9 } });
    expect(result.origin.messages[0].sourceReferences).toEqual([preview.reference]);
    expect(JSON.stringify(result)).not.toMatch(/"questions"|"answerSchema"|"prepared"|"evidenceIds"/);
    await preflight(session, [message.id], {}, other, 404);
    expect(await store.requestContext(() => store.find('students', { id: student.id }).grade)).toBe(4);
    expect(await fingerprint()).toBe(before);
    const lesson = course.units[0].lessons.find((entry: any) => entry.kind === 'learn'), original = lesson.teaching.teaching.explanation;
    await store.transaction(() => { store.find('studioCourses', { id: course.id }).units[0].lessons.find((entry: any) => entry.kind === 'learn').teaching.teaching.explanation += '\n新的教学版本。'; });
    try {
      const old = await preflight(session, [message.id]); expect(old.origin.course).toMatchObject({ current: false, fingerprint: descriptor.fingerprint });
      expect(old.origin.teachingScope.grade).toBe(9); expect(old.origin.messages[0].content).toBe(message.content);
      expect(old.origin.messages[0].sourceReferences).toEqual([preview.reference]);
    } finally { await store.transaction(() => { store.find('studioCourses', { id: course.id }).units[0].lessons.find((entry: any) => entry.kind === 'learn').teaching.teaching.explanation = original; }); }
  });

  it('fences a real learning-code student during paused/in-progress assessment and allows source preflight after it ends', async () => {
    const access = await call('post', '/students/' + student.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '匿名来源预检' });
    const code = await call('post', '/students/' + student.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    const actor = await call('post', '/auth/learning-code', { code: code.code }, null), descriptor = await call('get', coursePath(), undefined, actor);
    const session = await openCourse(descriptor, actor, 'student'), [message] = await save(session, [{ sender: 'assistant', content: '原保存说明，结束评测后再整理。' }]);
    await preflight(independent, [message.id], {}, actor, 404);
    const id = 'synthetic-artifact-assessment-' + randomUUID();
    await store.transaction(() => store.append('diagnosticSessions', { id, studentId: student.id, subject: 'chemistry', status: 'paused' }));
    try {
      for (const status of ['paused', 'in_progress']) {
        await store.transaction(() => { store.find('diagnosticSessions', { id }).status = status; });
        const before = await fingerprint(); await preflight(session, [message.id], {}, actor, 409); expect(await fingerprint()).toBe(before);
      }
    } finally { await store.transaction(() => { store.find('diagnosticSessions', { id }).status = 'aborted'; }); }
    const before = await fingerprint(); expect((await preflight(session, [message.id], {}, actor)).origin.studentId).toBe(student.id);
    expect(await fingerprint()).toBe(before);
  });
});
