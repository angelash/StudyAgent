import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('private verbatim notes preserve complete sources and recover original commands', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-note-http-'));
  const envNames = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'];
  const prior = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const src = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  let app: any, store: any, owner: any, other: any, independent: any, pg: Pool | undefined, schema: string | undefined;
  const providers: any[] = [];
  const root = (session = independent) => '/ai/assistant/sessions/' + session.id + '/artifacts/notes';
  async function boot() {
    app = await NestFactory.create(src('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(src('infrastructure/in-memory-store.service').InMemoryStoreService);
    const model = app.get(src('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
    for (const method of ['reply', 'structured']) providers.push(vi.spyOn(model, method).mockRejectedValue(new Error('Verbatim notes must not call any model')));
  }
  async function call(method: 'get' | 'post' | 'patch', path: string, body?: unknown, actor = owner, expected = method === 'post' ? 201 : 200) {
    let q = request(app.getHttpServer())[method]('/api' + path); if (actor) q = q.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined) q = q.send(body as object);
    const response = await q; expect(response.status, path + ': ' + JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
  }
  const register = () => call('post', '/auth/register', { principal: 'notes-' + randomUUID() + '@local.test', credential: 'Synthetic-notes-' + randomUUID() }, null);
  const open = (actor = owner) => call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' }, actor);
  async function save(session: any, values: any[]) {
    const rows = values.map(value => ({ id: randomUUID(), sessionId: session.id, sender: 'assistant', content: '匿名完整说明', createdAt: '2026-10-28T00:00:00.000Z', ...value }));
    await store.transaction(() => rows.forEach(row => store.append('assistantMessages', row))); return rows;
  }
  async function command(session: any, messages: any[], extra: any = {}, actor = owner) {
    const input = { kind: 'verbatim_note', selection: { messageIds: messages.map(message => message.id), includeLinkedQuestions: false }, objective: '完整保留本次原文', ...extra };
    const preview = await call('post', '/ai/assistant/sessions/' + session.id + '/artifacts/preflight', input, actor, 200);
    return { ...input, title: '私人完整学习笔记', preflightFingerprint: preview.fingerprint, requestKey: randomUUID() };
  }
  const formal = () => store.requestContext(() => digest(['students', 'learningScopes', 'diagnosticSessions', 'diagnosticResponses', 'diagnosticReports', 'diagnosticPlans', 'practiceAttempts', 'masteryEstimates', 'studioScheduleEvents'].map(name => store.inspect(name))));
  beforeAll(async () => {
    const connection = process.env.STUDY_TEST_ASSISTANT_NOTE_POSTGRES_URL;
    if (connection) {
      const url = new URL(connection); expect(url.hostname).toBe('127.0.0.1'); expect(url.port).toBe(process.env.CI === 'true' ? '5432' : '15439');
      pg = new Pool({ connectionString: connection }); expect((await pg.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_notes_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"'); url.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = url.toString();
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: pg ? 'postgres' : 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    await boot(); owner = await register(); other = await register(); independent = await open();
  });
  afterAll(async () => {
    for (const provider of providers) expect(provider).not.toHaveBeenCalled(); vi.restoreAllMocks(); await app?.close();
    if (pg) { if (!/^study_qa_notes_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Unsafe note HTTP schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.split(/[\\/]/).at(-1)!.startsWith('study-note-http-')) throw Error('Unsafe note fixture path');
    rmSync(directory, { recursive: true, force: true });
  });

  it('retains75-message original order, linked question, complete table/formula/code and exact old command receipts', async () => {
    const history = await save(independent, Array.from({ length: 75 }, (_, i) => ({ sender: 'user', content: '原问题' + i })));
    const text = '|条件|数量|\n|---|---|\n|完整观察|3|\n公式：$a+b$\n```js\nconsole.log("不运行");\n```\n😀\n';
    const [message] = await save(independent, [{ content: text, inReplyTo: history[0].id, modelId: 'saved-original', modelName: '原保存模型', source: 'xiaojiu', evidenceIds: ['PRIVATE_EVIDENCE'], requestKey: 'PRIVATE_KEY', prepared: 'PRIVATE_PREPARED' }]);
    const before = await formal(), input = await command(independent, [message], { selection: { messageIds: [message.id], includeLinkedQuestions: true } });
    const first = await call('post', root(), input), note = await call('get', root() + '/' + first.noteId);
    expect(note).toMatchObject({ status: 'ready', revision: 0, origin: { studentId: null, selection: { messageIds: [history[0].id, message.id] } } });
    expect(note.origin.messages.map((m: any) => m.sequence)).toEqual([0, 75]); expect(note.origin.messages[1].content).toBe(text); expect(note.markdown).toContain(text);
    expect(JSON.stringify(note)).not.toMatch(/PRIVATE_|ownerUserId|requestKey|commands|prepared|evidenceIds/);
    const edit = { expectedRevision: 0, title: '整理稿', markdown: '  完整独立编辑稿\n' + text + '\n  ', requestKey: randomUUID() };
    const edited = await call('patch', root() + '/' + note.id + '/content', edit);
    expect(edited).toMatchObject({ revision: 1, status: 'ready' });
    expect(await call('post', root(), input)).toEqual(first); expect(await call('get', root() + '/requests/' + input.requestKey)).toEqual(first);
    expect(await call('patch', root() + '/' + note.id + '/content', edit)).toEqual(edited);
    await call('patch', root() + '/' + note.id + '/content', { ...edit, markdown: '原键不同内容' }, owner, 409);
    const updated = await call('get', root() + '/' + note.id); expect(updated.markdown).toBe(edit.markdown); expect(updated.origin).toEqual(note.origin);
    const confirm = { expectedRevision: 1, contentFingerprint: updated.contentFingerprint, acknowledgeReview: true, requestKey: randomUUID() };
    const adopted = await call('post', root() + '/' + note.id + '/confirm', confirm); expect(adopted).toMatchObject({ status: 'confirmed', revision: 2 });
    expect(await call('post', root() + '/' + note.id + '/confirm', confirm)).toEqual(adopted);
    expect(await call('get', root() + '/' + note.id + '/requests/' + edit.requestKey)).toEqual(edited);
    await call('patch', root() + '/' + note.id + '/content', { ...edit, expectedRevision: 2, requestKey: randomUUID() }, owner, 409);
    const json = await call('get', root() + '/' + note.id + '/export?format=json'); expect(JSON.parse(json.content).origin).toEqual(note.origin);
    const md = await call('get', root() + '/' + note.id + '/export?format=markdown'); expect(md.content).toContain(text); expect(md.content).toContain(edit.markdown); expect(md.content).toContain('原保存模型');
    expect(JSON.stringify([json, md])).not.toMatch(/PRIVATE_|requestKey|requestHash|commands|tokenHash/); expect(await formal()).toBe(before);
  });

  it('rejects source changes, invented bodies, over-budget selection and stale revisions without partial notes', async () => {
    const [message] = await save(independent, [{}]), input = await command(independent, [message]);
    const count = () => store.requestContext(() => store.select('assistantArtifactDrafts', { ownerUserId: owner.user.id }).length), before = await count();
    await call('post', root(), { ...input, origin: { messages: [] } }, owner, 400);
    await call('post', root(), { ...input, preflightFingerprint: '0'.repeat(64) }, owner, 409);
    await store.transaction(() => { store.find('assistantMessages', { id: message.id }).content += '原文已变化'; });
    await call('post', root(), input, owner, 409);
    const [long] = await save(independent, [{ content: '完整原文'.repeat(6000) }]), oversized = await command(independent, [long]);
    await call('post', root(), oversized, owner, 409); expect(await count()).toBe(before);
    const fresh = await command(independent, [message]), receipt = await call('post', root(), fresh), note = await call('get', root() + '/' + receipt.noteId);
    await call('patch', root() + '/' + note.id + '/content', { expectedRevision: 99, title: '错误版本', markdown: '不保存', requestKey: randomUUID() }, owner, 409);
    await call('post', root() + '/' + note.id + '/confirm', { expectedRevision: 0, contentFingerprint: '0'.repeat(64), acknowledgeReview: true, requestKey: randomUUID() }, owner, 409);
    expect(await call('get', root() + '/' + note.id)).toEqual(note);
  });

  it('pages bounded summaries in actual same-millisecond order and binds cursors to their original identity', async () => {
    const session = await open(), [message] = await save(session, [{}]), ids: string[] = [];
    for (let i = 0; i < 4; i++) { const receipt = await call('post', root(session), await command(session, [message])); ids.push(receipt.noteId); }
    await store.transaction(() => { for (const id of ids) store.find('assistantArtifactDrafts', { id }).createdAt = '2026-10-28T00:00:00.000Z'; });
    const expected = await store.requestContext(() => store.select('assistantArtifactDrafts', { ownerUserId: owner.user.id, sessionId: session.id }).map((row: any) => row.id));
    const first = await call('get', root(session) + '?pageSize=2'), all = [...first.items]; let cursor = first.nextCursor;
    while (cursor) { const next = await call('get', root(session) + '?pageSize=2&cursor=' + cursor); all.push(...next.items); cursor = next.nextCursor; }
    expect(all.map((n: any) => n.id)).toEqual(expected); expect(all.slice(-4).map((n: any) => n.id)).toEqual(ids);
    expect(JSON.stringify(first.items)).not.toMatch(/markdown|origin|sourceFingerprint|commands/);
    await call('get', root(session) + '?pageSize=51', undefined, owner, 400);
    await call('get', root(session) + '?cursor=invalid', undefined, owner, 400);
    const otherSession = await open(other); await call('get', root(otherSession) + '?cursor=' + first.nextCursor, undefined, other, 400);
  });

  it('denies another guardian private notes and retains the exact old chemistry scope and primary profile', async () => {
    const student = (await call('post', '/students', { nickname: '匿名笔记档案', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    const definitions = src('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum(), course = src('modules/learning/chemistry-course').buildChemistryCourse(student.id, definitions.map((d: any) => d.atom));
    await store.transaction(() => { for (const d of definitions) store.append('knowledgeAtoms', d.atom); store.append('studioCourses', course); store.append('bindings', { id: randomUUID(), parentUserId: other.user.id, studentId: student.id, status: 'active', createdAt: new Date().toISOString() }); });
    const coursePath = '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'primary_unit', courseId: course.id, itemId: course.units[0].id });
    const descriptor = await call('get', coursePath), session = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: student.id, subject: 'chemistry', pageContext: 'course', contextRefType: descriptor.kind, contextRefId: descriptor.referenceId, contextItemId: descriptor.itemId, contextSelection: descriptor.selection });
    const source = await call('get', '/ai/assistant/sessions/' + session.id + '/sources/atom-1'), [message] = await save(session, [{ content: '核对新物质。', sourceReferences: [source.reference] }]);
    const first = await call('post', root(session), await command(session, [message])), note = await call('get', root(session) + '/' + first.noteId), before = await formal();
    for (const path of [root(session), root(session) + '/' + note.id, root(session) + '/' + note.id + '/export?format=json']) await call('get', path, undefined, other, 404);
    const lesson = course.units[0].lessons.find((l: any) => l.kind === 'learn'); await store.transaction(() => { store.find('studioCourses', { id: course.id }).units[0].lessons.find((l: any) => l.id === lesson.id).teaching.teaching.explanation += '新版讲述。'; });
    expect(await call('get', root(session) + '/' + note.id)).toEqual(note); expect(note.origin.teachingScope.grade).toBe(9); expect(await formal()).toBe(before);
    const access = await call('post', '/students/' + student.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '匿名笔记检查' });
    const code = await call('post', '/students/' + student.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() }), actor = await call('post', '/auth/learning-code', { code: code.code }, null);
    const current = await call('get', coursePath, undefined, actor), learner = await call('post', '/ai/assistant/sessions', { userRole: 'student', studentId: student.id, subject: 'chemistry', pageContext: 'course', contextRefType: current.kind, contextRefId: current.referenceId, contextItemId: current.itemId, contextSelection: current.selection }, actor);
    const [learnerMessage] = await save(learner, [{}]), create = await command(learner, [learnerMessage], {}, actor), learnerReceipt = await call('post', root(learner), create, actor);
    const learnerNote = await call('get', root(learner) + '/' + learnerReceipt.noteId, undefined, actor);
    const assessmentId = randomUUID(); await store.transaction(() => store.append('diagnosticSessions', { id: assessmentId, studentId: student.id, subject: 'chemistry', status: 'paused' }));
    for (const status of ['paused', 'in_progress']) {
      await store.transaction(() => { store.find('diagnosticSessions', { id: assessmentId }).status = status; });
      await call('post', root(learner), { ...create, requestKey: randomUUID() }, actor, 409);
      await call('patch', root(learner) + '/' + learnerNote.id + '/content', { expectedRevision: 0, title: '不保存', markdown: '保持原稿', requestKey: randomUUID() }, actor, 409);
      await call('post', root(learner) + '/' + learnerNote.id + '/confirm', { expectedRevision: 0, contentFingerprint: learnerNote.contentFingerprint, acknowledgeReview: true, requestKey: randomUUID() }, actor, 409);
      expect(await call('get', root(learner) + '/' + learnerNote.id, undefined, actor)).toEqual(learnerNote);
    }
    await store.transaction(() => { store.find('diagnosticSessions', { id: assessmentId }).status = 'aborted'; });
    expect(await store.requestContext(() => store.find('students', { id: student.id }).grade)).toBe(4);
  });

  it('recovers one original creation after simultaneous commands from two actual API instances and a cold restart', async () => {
    const session = await open(), [message] = await save(session, [{}]), input = await command(session, [message]);
    const second = await NestFactory.create(src('app.module').AppModule, { logger: false }); second.setGlobalPrefix('api'); await second.init();
    try {
      const attempts = await Promise.all([request(app.getHttpServer()).post('/api' + root(session)).set('Authorization', 'Bearer ' + owner.token).send(input),
        request(second.getHttpServer()).post('/api' + root(session)).set('Authorization', 'Bearer ' + owner.token).send(input)]);
      expect(attempts.every(a => [201, 409].includes(a.status))).toBe(true); expect(attempts.some(a => a.status === 201)).toBe(true);
      const receipt = await call('get', root(session) + '/requests/' + input.requestKey); expect(await call('post', root(session), input)).toEqual(receipt);
      expect(await store.requestContext(() => store.select('assistantArtifactDrafts', { ownerUserId: owner.user.id, requestKey: input.requestKey }).length)).toBe(1);
      await app.close(); await boot(); expect(await call('get', root(session) + '/requests/' + input.requestKey)).toEqual(receipt);
      expect((await call('get', root(session) + '/' + receipt.noteId)).origin.messages[0].content).toBe(message.content);
    } finally { await second.close(); }
  });
});
