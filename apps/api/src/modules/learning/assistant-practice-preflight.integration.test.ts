import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('read-only source practice and atomic coverage over actual HTTP', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-source-practice-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'XIAOJIU_CHAT_ENABLED'];
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const src = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  const atomId = 'atomic:math:averagecount', providers: any[] = [];
  let app: any, store: any, owner: any, other: any, independent: any, student: any, second: any, chemistry: any, chemicalAtom: string, pg: Pool | undefined, schema = '';
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const fingerprint = async () => digest((await store.database.read()).state);
  async function call(method: 'get' | 'post' | 'put', path: string, body?: unknown, actor = owner, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor) query = query.set('Authorization', 'Bearer ' + actor.token); if (body) query = query.send(body as object);
    const response = await query; expect(response.status, path + ':' + JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  const root = (session: any) => '/ai/assistant/sessions/' + session.id + '/artifacts/practice';
  const audience = () => ({ kind: 'student', studentId: student.id, subject: 'math', targetAtomIds: [atomId] });
  const preflight = (session: any, ids: string[], extra = {}, actor = owner, status = 200) => call('post', root(session) + '/preflight', {
    selection: { messageIds: ids, includeLinkedQuestions: false }, objective: '比较原解释的条件，并用独立新情境核查', audience: { kind: 'adult' }, ...extra,
  }, actor, status);
  async function save(session: any, values: any[]) {
    const rows = values.map(value => ({ id: randomUUID(), sessionId: session.id, sender: 'user', content: '匿名比较条件与反例。', createdAt: '2026-10-29T00:00:00.000Z', ...value }));
    await store.transaction(() => rows.forEach(row => store.append('assistantMessages', row))); return rows;
  }
  const scope = (grade = 4) => call('put', '/students/' + student.id + '/learning-scope', { subject: 'math', grade, term: 'upper', textbookVolumeId: null,
    textbookVersion: '匿名已确认教学范围', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
  async function openChem(actor = owner, userRole = 'parent') {
    const descriptor = await call('get', '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'primary_unit', courseId: chemistry.id, itemId: chemistry.units[0].id }), undefined, actor);
    return call('post', '/ai/assistant/sessions', { userRole, studentId: student.id, subject: 'chemistry', pageContext: 'course', contextRefType: descriptor.kind,
      contextRefId: descriptor.referenceId, contextItemId: descriptor.itemId, contextSelection: descriptor.selection }, actor);
  }
  beforeAll(async () => {
    let driver = 'sqlite'; const url = process.env.STUDY_TEST_ASSISTANT_PRACTICE_POSTGRES_URL;
    if (url) {
      const target = new URL(url); expect(target.hostname).toBe('127.0.0.1'); expect(target.port).toBe(process.env.CI === 'true' ? '5432' : '15439');
      pg = new Pool({ connectionString: url }); expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_source_practice_' + randomUUID().replaceAll('-', ''); await pg.query('CREATE SCHEMA "' + schema + '"'); target.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = target.toString(); driver = 'postgres';
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: driver, STUDY_DATA_DIR: directory, STUDY_SEED_FOUNDATION: 'true', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    app = await NestFactory.create(src('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(src('infrastructure/in-memory-store.service').InMemoryStoreService);
    const chat = app.get(src('modules/ai/xiaojiu-chat.service').XiaojiuChatService); for (const method of ['reply', 'structured']) providers.push(vi.spyOn(chat, method).mockRejectedValue(Error('No model calls during source preflight')));
    const register = () => call('post', '/auth/register', { principal: 'source-practice-' + randomUUID() + '@local.test', credential: 'Owned-source-practice-' + randomUUID() }, null);
    owner = await register(); other = await register(); independent = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' });
    const child = (nickname: string) => call('post', '/students', { nickname, grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } });
    student = (await child('匿名原子预检学习者')).profile; second = (await child('匿名未设范围学习者')).profile; await scope();
    const definitions = src('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum(); chemicalAtom = definitions[0].atom.id;
    chemistry = src('modules/learning/chemistry-course').buildChemistryCourse(student.id, definitions.map((row: any) => row.atom)); await store.transaction(() => store.append('studioCourses', chemistry));
    await call('put', '/students/' + student.id + '/learning-scope', { subject: 'chemistry', grade: 9, term: 'upper', textbookVolumeId: null,
      textbookVersion: '匿名已学九年级化学', learnedAtomIds: [chemicalAtom], currentAtomId: chemicalAtom, minutesPerSession: 15 });
  });
  afterAll(async () => {
    providers.forEach(provider => expect(provider).not.toHaveBeenCalled()); vi.restoreAllMocks(); await app?.close();
    if (pg) { if (!/^study_qa_source_practice_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe practice QA schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !directory.includes('study-source-practice-')) throw Error('Unsafe fixture directory'); rmSync(directory, { recursive: true, force: true });
  });

  it('keeps full linked adult sources, fixed original model and stable hashes without creating evidence, tasks or practice', async () => {
    const [question] = await save(independent, [{}]), [answer] = await save(independent, [{ sender: 'assistant', inReplyTo: question.id, modelId: 'deepseek-v4-flash', modelName: 'DeepSeek V4.1 Flash',
      content: '完整原文\n|条件|数量|\n|---|---|\n|整体一致|2|\n$1+2$\n```js\n1+2\n```', sourceReferences: [] }]);
    const before = await fingerprint(), input = { selection: { messageIds: [answer.id], includeLinkedQuestions: true } }, result = await preflight(independent, [answer.id], input);
    expect(result.origin.messages.map((row: any) => row.id)).toEqual([question.id, answer.id]); expect(result.origin.messages[1].content).toBe(answer.content);
    expect(result).toMatchObject({ canPrepareTeachingPractice: true, coverage: [], isTeachingOnly: true, formalEvidenceCreated: false, creationAvailable: false });
    expect((await preflight(independent, [answer.id], input)).fingerprint).toBe(result.fingerprint); await call('post', root(independent), {}, owner, 404); expect(await fingerprint()).toBe(before);
  });
  it('requires explicit adult-to-child confirmation and returns only reviewed atomic counts with no candidate answers', async () => {
    const [message] = await save(independent, [{}]); const before = await fingerprint();
    const unconfirmed = await preflight(independent, [message.id], { audience: audience() }); expect(unconfirmed.blocked.code).toBe('audience_transfer_confirmation_required');
    const result = await preflight(independent, [message.id], { audience: audience(), acknowledgeAudienceTransfer: true });
    expect(result).toMatchObject({ canPrepareTeachingPractice: true, audience: { profileGrade: 4, scopeGrade: 4 }, formalEvidenceCreated: false }); expect(result.coverage[0].unseenFamilyCount).toBeGreaterThanOrEqual(2);
    expect(Object.keys(result.coverage[0]).sort()).toEqual(['ambiguousQuestionCount','atomId','definitionFingerprint','eligibleQuestionCount','name','objective','seenQuestionCount','unseenFamilyCount','unseenQuestionCount'].sort());
    expect(JSON.stringify(result.coverage)).not.toMatch(/questionId|answerSchema|gradingConfig|standardAnswer|evidenceId/); expect(await fingerprint()).toBe(before);
  });
  it('refuses foreign conversation access even when another guardian can manage the same child', async () => {
    const [message] = await save(independent, [{}]); await store.transaction(() => store.append('bindings', { id: randomUUID(), parentUserId: other.user.id, studentId: student.id, status: 'active', createdAt: new Date().toISOString() }));
    const before = await fingerprint(); await preflight(independent, [message.id], { audience: audience(), acknowledgeAudienceTransfer: true }, other, 404); expect(await fingerprint()).toBe(before);
  });
  it('rejects forged fields, duplicate source or atom IDs, cross-session messages and points outside confirmed progress', async () => {
    const [message] = await save(independent, [{}]), otherSession = await openChem();
    const before = await fingerprint(); await preflight(independent, [message.id], { score: 1 }, owner, 400); await preflight(independent, [message.id, message.id], {}, owner, 400);
    await preflight(independent, [message.id], { audience: { ...audience(), targetAtomIds: [atomId, atomId] } }, owner, 400); await preflight(independent, [message.id], { audience: { ...audience(), targetAtomIds: ['unknown-source-atom'] } }, owner, 400);
    await preflight(otherSession, [message.id], { audience: { ...audience(), studentId: second.id } }, owner, 404); expect(await fingerprint()).toBe(before);
  });
  it('returns a precise scope entry rather than silently assigning a grade or subject to a child without progress', async () => {
    const [message] = await save(independent, [{}]); const before = await fingerprint(), result = await preflight(independent, [message.id], { audience: { ...audience(), studentId: second.id }, acknowledgeAudienceTransfer: true });
    expect(result).toMatchObject({ canPrepareTeachingPractice: false, blocked: { code: 'learning_scope_required' }, audience: { profileGrade: 4, scopeGrade: null } });
    expect(result.audience.scopeHref).toBe('/student/assessment?studentId=' + second.id + '&subject=math'); expect(await fingerprint()).toBe(before);
  });
  it('preserves complete over-budget source and all selected message identities without model or state changes', async () => {
    const text = '保留每一行条件与反例。\n'.repeat(2200) + '完整末尾_SOURCE_END', [message] = await save(independent, [{ content: text }]); const before = await fingerprint();
    const result = await preflight(independent, [message.id]); expect(result.origin.messages[0].content).toBe(text); expect(result.contextCharacters).toBeGreaterThan(18000);
    expect(result).toMatchObject({ fits: false, canPrepareTeachingPractice: false, blocked: { code: 'source_budget_exceeded' } }); expect(await fingerprint()).toBe(before);
  });
  it('counts real aborted diagnostic snapshots as exposure and excludes their canonical families from independent structures', async () => {
    const [message] = await save(independent, [{}]), input = { audience: audience(), acknowledgeAudienceTransfer: true }, initial = await preflight(independent, [message.id], input);
    const formal = await call('post', '/diagnostics/sessions', { studentId: student.id, subject: 'math', intent: 'micro', targetAtomIds: [atomId], includePrerequisites: false, maxItems: 4 });
    const active = await call('get', '/diagnostics/sessions/' + formal.id); await call('post', '/diagnostics/sessions/' + formal.id + '/state', { action: 'abort', expectedRevision: active.revision, requestKey: randomUUID(), reason: '隔离预检曝光测试，不形成掌握证据' });
    const before = await fingerprint(), result = await preflight(independent, [message.id], input); expect(result.coverage[0].seenQuestionCount).toBeGreaterThan(0); expect(result.coverage[0].unseenQuestionCount).toBeLessThan(initial.coverage[0].unseenQuestionCount);
    expect(result.coverage[0].unseenFamilyCount).toBeLessThan(initial.coverage[0].unseenFamilyCount); expect(result.fingerprint).not.toBe(initial.fingerprint); expect(result.sourceFingerprint).toBe(initial.sourceFingerprint); expect(await fingerprint()).toBe(before);
  });
  it('changes the full fingerprint when a reviewed mapping changes even if every coverage count stays the same', async () => {
    const [message] = await save(independent, [{}]), input = { audience: audience(), acknowledgeAudienceTransfer: true }, first = await preflight(independent, [message.id], input);
    const mapping = await store.requestContext(() => structuredClone(store.select('measurementItems', { atomId })[0]));
    try {
      await store.transaction(() => { store.find('measurementItems', { id: mapping.id }).expectedSeconds += 1; });
      const before = await fingerprint(), result = await preflight(independent, [message.id], input); expect(result.coverage).toEqual(first.coverage); expect(result.fingerprint).not.toBe(first.fingerprint); expect(result.sourceFingerprint).toBe(first.sourceFingerprint); expect(await fingerprint()).toBe(before);
    } finally { await store.transaction(() => Object.assign(store.find('measurementItems', { id: mapping.id }), mapping)); }
  });
  it('keeps course grade9 and profile grade4 separate, rejects subject/child reassignment and requires old-source confirmation', async () => {
    const session = await openChem(), [message] = await save(session, [{}]), input = { audience: { kind: 'student', studentId: student.id, subject: 'chemistry', targetAtomIds: [chemicalAtom] } };
    const first = await preflight(session, [message.id], input); expect(first.audience).toMatchObject({ sourceGrade: 9, scopeGrade: 9, profileGrade: 4 });
    expect((await preflight(session, [message.id], { audience: audience() })).blocked.code).toBe('source_target_subject_mismatch'); await preflight(session, [message.id], { audience: { ...audience(), studentId: second.id } }, owner, 403);
    const lesson = chemistry.units[0].lessons.find((row: any) => row.kind === 'learn'), original = lesson.teaching.teaching.explanation;
    try {
      await store.transaction(() => { store.find('studioCourses', { id: chemistry.id }).units[0].lessons.find((row: any) => row.kind === 'learn').teaching.teaching.explanation += '\n修改后的匿名教学版本。'; });
      const before = await fingerprint(), old = await preflight(session, [message.id], input); expect(old).toMatchObject({ historical: true, blocked: { code: 'historical_source_confirmation_required' } }); expect(old.sourceFingerprint).toBe(first.sourceFingerprint);
      const acknowledged = await preflight(session, [message.id], { ...input, acknowledgeHistoricalSource: true }); expect(acknowledged.blocked?.code).not.toBe('historical_source_confirmation_required'); expect(await fingerprint()).toBe(before);
    } finally { await store.transaction(() => { store.find('studioCourses', { id: chemistry.id }).units[0].lessons.find((row: any) => row.kind === 'learn').teaching.teaching.explanation = original; }); }
  });
  it('uses actual learning-code identity and blocks both learner and guardian source preflight throughout a paused assessment', async () => {
    const access = await call('post', '/students/' + student.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '隔离练习来源身份核对' }), code = await call('post', '/students/' + student.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    const learner = await call('post', '/auth/learning-code', { code: code.code }, null), session = await openChem(learner, 'student'), [message] = await save(session, [{}]), studentAudience = { kind: 'student', studentId: student.id, subject: 'chemistry', targetAtomIds: [chemicalAtom] };
    expect((await preflight(session, [message.id], { audience: studentAudience }, learner)).audience.profileGrade).toBe(4);
    const formal = await call('post', '/diagnostics/sessions', { studentId: student.id, subject: 'math', intent: 'micro', targetAtomIds: [atomId], includePrerequisites: false, maxItems: 4 }); const active = await call('get', '/diagnostics/sessions/' + formal.id);
    await call('post', '/diagnostics/sessions/' + formal.id + '/state', { action: 'pause', expectedRevision: active.revision, requestKey: randomUUID(), reason: '隔离暂停评测保护，不形成学习结论' });
    try {
      const before = await fingerprint(); await preflight(session, [message.id], { audience: studentAudience }, learner, 409); expect(await fingerprint()).toBe(before);
      const [parentMessage] = await save(independent, [{}]), parentBefore = await fingerprint(); await preflight(independent, [parentMessage.id], { audience: audience(), acknowledgeAudienceTransfer: true }, owner, 409); expect(await fingerprint()).toBe(parentBefore);
      await preflight(session, [message.id], { audience: { kind: 'adult' } }, learner, 403); expect(await fingerprint()).toBe(parentBefore);
    } finally { const paused = await call('get', '/diagnostics/sessions/' + formal.id); await call('post', '/diagnostics/sessions/' + formal.id + '/state', { action: 'abort', expectedRevision: paused.revision, requestKey: randomUUID(), reason: '结束隔离暂停保护，不形成测量结果' }); }
    expect((await preflight(session, [message.id], { audience: studentAudience }, learner)).creationAvailable).toBe(false);
  });
});
