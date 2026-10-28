import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { XiaojiuChatService } from './xiaojiu-chat.service';

describe('adult lecture assistant HTTP and frozen task boundaries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-lecture-assistant-'));
  const names = ['NODE_ENV','STUDY_STORAGE','DATABASE_URL','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION','XIAOJIU_CHAT_ENABLED'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any, store: any, ai: any, worker: any, parent: any, other: any, pg: Pool | undefined, schema: string | undefined;
  let chat: XiaojiuChatService;
  const curriculum = require('../../../dist/apps/api/src/modules/learning/classroom-curriculum.js');
  const course = curriculum.classroomCourse(), lecture = course.units[0].lectures[0];
  const descriptorPath = '/ai/assistant/lecture-context?' + new URLSearchParams({ courseId: course.id, lectureId: lecture.id });
  const base = (id: string) => '/ai/assistant/sessions/' + id;
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = parent, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    return (await query.expect(status)).body.data;
  }
  async function boot() {
    app = await NestFactory.create(require('../../../dist/apps/api/src/app.module.js').AppModule, { logger: false });
    app.setGlobalPrefix('api'); await app.init();
    store = app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);
    ai = app.get(require('../../../dist/apps/api/src/modules/ai/ai.service.js').AiService);
    worker = app.get(require('../../../dist/apps/api/src/modules/ai/assistant-turn-worker.service.js').AssistantTurnWorkerService);
    chat = app.get(require('../../../dist/apps/api/src/modules/ai/xiaojiu-chat.service.js').XiaojiuChatService);
  }
  beforeAll(async () => {
    let driver = 'sqlite'; const url = process.env.STUDY_TEST_LECTURE_POSTGRES_URL;
    if (url) {
      pg = new Pool({ connectionString: url }); expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
      schema = 'study_qa_lecture_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"');
      const scoped = new URL(url); scoped.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = scoped.toString(); driver = 'postgres';
    }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: driver, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true' });
    await boot();
    parent = await call('post', '/auth/register', { principal: 'lecture-parent@local.test', credential: 'Lecture-QA-only-20261028' }, null);
    other = await call('post', '/auth/register', { principal: 'lecture-other@local.test', credential: 'Lecture-QA-only-20261028' }, null);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    if (pg) { if (!/^study_qa_lecture_[a-f0-9]{32}$/.test(schema ?? '')) throw Error('Unsafe owned QA schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); }
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    const owned=resolve(directory);
    if(dirname(owned)!==resolve(tmpdir())||!basename(owned).startsWith('study-lecture-assistant-'))throw Error('Unsafe owned lecture QA directory');
    rmSync(owned, { recursive: true, force: true });
  });
  const command = (descriptor: any) => ({ userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom', contextRefType: 'classroom_lecture', contextRefId: descriptor.referenceId, contextItemId: descriptor.lectureId });
  const open = async (actor = parent) => { const descriptor = await call('get', descriptorPath, undefined, actor); return { descriptor, session: await call('post', '/ai/assistant/sessions', command(descriptor), actor) }; };
  const input = async (id: string) => ({ requestKey: randomUUID(), message: '请结合本讲四个概念说明相互关系，并给一个匿名情境。', modelId: 'deepseek-v4-flash', contextVersion: (await call('get', base(id) + '/context')).contextVersion });
  const model = () => vi.spyOn(chat, 'reply').mockResolvedValue({ reply: '先比较个人处境与社会结构，再用新的匿名情境检验解释。', evidenceIds: [], modelId: 'deepseek-v4-flash', modelName: 'Synthetic lecture model' });

  it('isolates current lecture context without starting a classroom or exposing complete internal snapshots', async () => {
    const before = await store.requestContext(() => store.classroomSessions.length);
    const { descriptor, session } = await open();
    expect(descriptor).toMatchObject({ courseId: course.id, lectureId: lecture.id, lectureTitle: lecture.title, unitPosition: 1, lecturePosition: 1, current: true });
    expect(descriptor.referenceId).toBe(course.id + '@' + descriptor.fingerprint);
    expect(JSON.stringify(descriptor)).not.toMatch(/lessons|objective|answerKeys|questions/);
    expect(JSON.stringify(session)).not.toMatch(/lectureSnapshot|ownerUserId|scopeKey/);
    const context = await call('get', base(session.id) + '/context');
    expect(context.lecture).toMatchObject({ lectureId: lecture.id, current: true });
    expect(context.location.href).toContain('/studio/classroom?');
    expect(await store.requestContext(() => store.classroomSessions.length)).toBe(before);
    expect((await call('post', '/ai/assistant/sessions', command(descriptor))).id).toBe(session.id);
  });

  it('rejects unbound, stale, student-scoped and forged lecture opens and extra descriptor fields', async () => {
    const descriptor = await call('get', descriptorPath);
    await call('get', descriptorPath + '&unknown=value', undefined, parent, 400);
    await call('get', '/ai/assistant/lecture-context?courseId=missing&lectureId=missing', undefined, parent, 404);
    await call('post', '/ai/assistant/sessions', { ...command(descriptor), contextRefId: course.id + '@' + '0'.repeat(64) }, parent, 409);
    await call('post', '/ai/assistant/sessions', { ...command(descriptor), subject: 'math' }, parent, 400);
    await call('post', '/ai/assistant/sessions', { ...command(descriptor), pageContext: 'review' }, parent, 400);
    await call('post', '/ai/assistant/sessions', { ...command(descriptor), userRole: 'student' }, parent, 403);
    await call('post', '/ai/assistant/sessions', { ...command(descriptor), lectureSnapshot: { title: 'Forged' } }, parent, 400);
    await store.transaction(() => { store.find('users', { id: other.user.id }).role = 'student'; });
    try { await call('get', descriptorPath, undefined, other, 401); }
    finally { await store.transaction(() => { store.find('users', { id: other.user.id }).role = 'parent'; }); }
    const child = (await call('post', '/students', { nickname: '匿名讲座权限验收', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    const access = await call('post', '/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '匿名讲座权限隔离验证' });
    const code = await call('post', '/students/' + child.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    const learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    await call('post', '/ai/assistant/sessions', { userRole: 'student', studentId: child.id, subject: 'math', pageContext: 'student_home', contextRefType: null, contextRefId: null }, learner);
    await call('get', descriptorPath, undefined, learner, 403);
    await call('post', '/ai/assistant/sessions', command(descriptor), learner, 403);
  });

  it('keeps two accounts separate and provides owner-only history positions', async () => {
    const first = await open(), second = await open(other);
    expect(first.session.id).not.toBe(second.session.id);
    await call('get', base(first.session.id) + '/context', undefined, other, 404);
    await call('get', base(first.session.id) + '/turns', undefined, other, 404);
    await call('get', base(first.session.id) + '/messages/page', undefined, other, 404);
  });

  it('runs one durable turn with adult teaching context and no child, scoring or progress writes', async () => {
    const { session } = await open(); const original = await store.requestContext(() => JSON.stringify(store.find('assistantSessions', { id: session.id }).lectureSnapshot));
    const reply = model(), c = await input(session.id), turn = await call('post', base(session.id) + '/turns', c);
    expect(turn.status).toBe('queued'); expect(reply).not.toHaveBeenCalled();
    expect((await call('post', base(session.id) + '/turns', c)).id).toBe(turn.id);
    await worker.runNext(); expect((await call('get', base(session.id) + '/turns/' + turn.id)).status).toBe('completed');
    const rendered = reply.mock.calls[0][0], context = JSON.parse(rendered.context);
    expect(rendered.system).toContain('成人'); expect(rendered.system).not.toContain('小学');
    expect(context.lecture.lessons).toHaveLength(4);
    expect(context).toMatchObject({ scope: null, report: null, plan: null, memory: null, currentQuestion: null, evidenceIds: [] });
    expect(JSON.stringify(context)).not.toMatch(/answerKeys|gradingConfig|studentId|PRIVATE_/);
    const page = await call('get', base(session.id) + '/messages/page'); expect(page.messages).toHaveLength(2);
    expect(page.location.href).toContain(lecture.id);
    expect(await store.requestContext(() => JSON.stringify(store.find('assistantSessions', { id: session.id }).lectureSnapshot))).toBe(original);
    expect(await store.requestContext(() => store.classroomSessions.length)).toBe(0);
  });

  it('retains old messages but rejects stale retries and a worker after a same-version curriculum edit', async () => {
    const { session } = await open(); const reply = model();
    const initial = await call('post', base(session.id) + '/turns', await input(session.id));
    await worker.runNext(); expect((await call('get', base(session.id) + '/turns/' + initial.id)).status).toBe('completed');
    reply.mockClear(); const turn = await call('post', base(session.id) + '/turns', await input(session.id));
    const changed = structuredClone(course); changed.units[0].lectures[0].lessons[0].objective += ' Updated teaching boundary.';
    vi.spyOn(curriculum, 'classroomCourse').mockReturnValue(changed);
    const context = await call('get', base(session.id) + '/context'); expect(context.lecture.current).toBe(false);
    await worker.runNext(); expect(reply).not.toHaveBeenCalled();
    const failed = await call('get', base(session.id) + '/turns/' + turn.id);
    expect(failed.status).toBe('failed'); expect(failed.task.errorCode).toBe('assistant_context_changed');
    await call('post', base(session.id) + '/turns/' + turn.id + '/retry', { version: failed.task.version, generation: failed.task.generation }, parent, 409);
    await call('post', base(session.id) + '/turns', { ...await input(session.id), requestKey: randomUUID() }, parent, 409);
    expect((await call('get', base(session.id) + '/messages/page')).messages.length).toBeGreaterThanOrEqual(2);
    const next = await open(); expect(next.session.id).not.toBe(session.id);
  });

  it('reopens the same frozen session and exact receipt after a cold restart', async () => {
    const { session } = await open(), reply = model(), c = await input(session.id), turn = await call('post', base(session.id) + '/turns', c);
    await worker.runNext(); const done = await call('get', base(session.id) + '/turns/' + turn.id); expect(done.status).toBe('completed');
    await app.close(); vi.restoreAllMocks(); await boot();
    const reopened = await open(); expect(reopened.session.id).toBe(session.id);
    expect((await call('post', base(session.id) + '/turns', c)).assistantMessageId).toBe(done.assistantMessageId);
    expect((await call('get', base(session.id) + '/messages/page')).location.href).toContain('/studio/classroom?');
  });

  it('uses an independent learning conversation after removing a lecture and preserves both scopes', async () => {
    const original = await open(), c = { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio', contextRefType: null, contextRefId: null, contextItemId: null };
    const independent = await call('post', '/ai/assistant/sessions', c); expect(independent.id).not.toBe(original.session.id);
    expect((await call('post', '/ai/assistant/sessions', c)).id).toBe(independent.id);
    await call('post', '/ai/assistant/sessions', { ...c, subject: 'math' }, parent, 400);
    const reply = model(), turn = await call('post', base(independent.id) + '/turns', await input(independent.id)); await worker.runNext();
    expect((await call('get', base(independent.id) + '/turns/' + turn.id)).status).toBe('completed');
    expect(reply.mock.calls[0][0].system).toContain('自主学习助教'); expect(reply.mock.calls[0][0].system).not.toContain('小学');
    const context = JSON.parse(reply.mock.calls[0][0].context); expect(context.independentStudy).toBe(true);
    expect(context.lecture).toBeUndefined(); expect(context).toMatchObject({ report: null, plan: null, scope: null, currentQuestion: null, evidenceIds: [] });
    expect((await call('get', base(independent.id) + '/context')).location.href).toBe('/studio?view=home&mode=instant&audience=independent');
    expect((await open()).session.id).toBe(original.session.id);
  });

  it('finds only the owner retained version without writes and keeps messages readable if its source is corrupt', async () => {
    const target = course.units[0].lectures[1], path = '/ai/assistant/lecture-context?' + new URLSearchParams({ courseId: course.id, lectureId: target.id });
    const descriptor = await call('get', path), session = await call('post', '/ai/assistant/sessions', command(descriptor));
    model(); const turn = await call('post', base(session.id) + '/turns', await input(session.id)); await worker.runNext();
    expect((await call('get', base(session.id) + '/turns/' + turn.id)).status).toBe('completed');
    const changed = structuredClone(course); changed.units[0].lectures[1].description += ' New curriculum boundary.';
    vi.spyOn(curriculum, 'classroomCourse').mockReturnValue(changed);
    const count = await store.requestContext(() => store.assistantSessions.length), retained = await call('get', path + '&fingerprint=' + descriptor.fingerprint);
    expect(retained).toMatchObject({ sessionId: session.id, current: false, lectureTitle: descriptor.lectureTitle });
    expect(await store.requestContext(() => store.assistantSessions.length)).toBe(count);
    const stranger = await call('post', '/auth/register', { principal: 'lecture-new-' + randomUUID() + '@local.test', credential: 'Lecture-new-account-only-20261028' }, null);
    await call('get', path + '&fingerprint=' + descriptor.fingerprint, undefined, stranger, 409);
    await store.transaction(() => { store.find('assistantSessions', { id: session.id }).lectureSnapshot.description = 'Corrupt original without matching fingerprint'; });
    await call('get', path + '&fingerprint=' + descriptor.fingerprint, undefined, parent, 409);
    await call('get', base(session.id) + '/context', undefined, parent, 409);
    const page = await call('get', base(session.id) + '/messages/page'); expect(page.messages).toHaveLength(2); expect(page.location.href).toBeNull();
  });

  it('deduplicates a lecture open and one original request across two real HTTP application instances', async () => {
    const second=await NestFactory.create(require('../../../dist/apps/api/src/app.module.js').AppModule,{logger:false});second.setGlobalPrefix('api');await second.init();
    try {
      const descriptor=await call('get','/ai/assistant/lecture-context?'+new URLSearchParams({courseId:course.id,lectureId:course.units[1].lectures[0].id}));
      const invoke=(target:any,path:string,body:unknown)=>request(target.getHttpServer()).post('/api'+path).set('Authorization','Bearer '+parent.token).send(body as object).expect(201);
      const opened=await Promise.all([invoke(app,'/ai/assistant/sessions',command(descriptor)),invoke(second,'/ai/assistant/sessions',command(descriptor))]);
      const id=opened[0].body.data.id;expect(opened[1].body.data.id).toBe(id);const original=await input(id),reply=model();
      const receipts=await Promise.all([invoke(app,base(id)+'/turns',original),invoke(second,base(id)+'/turns',original)]);
      expect(receipts[1].body.data.id).toBe(receipts[0].body.data.id);await worker.runNext();expect(reply).toHaveBeenCalledTimes(1);
      const page=await request(second.getHttpServer()).get('/api'+base(id)+'/messages/page').set('Authorization','Bearer '+parent.token).expect(200);
      expect(page.body.data.messages).toHaveLength(2);expect((await call('get',base(id)+'/turns')).turns).toHaveLength(1);
    }finally{await second.close();}
  });

  it('reads an owner retained lecture after removal from the current curriculum without reconstructing or sending it',async()=>{
    const target=course.units[4].lectures[0],path='/ai/assistant/lecture-context?'+new URLSearchParams({courseId:course.id,lectureId:target.id});
    const descriptor=await call('get',path),session=await call('post','/ai/assistant/sessions',command(descriptor));model();
    const c=await input(session.id);await call('post',base(session.id)+'/turns',c);await worker.runNext();
    const changed=structuredClone(course);changed.units[4].lectures=changed.units[4].lectures.filter((item:any)=>item.id!==target.id);vi.spyOn(curriculum,'classroomCourse').mockReturnValue(changed);
    await call('get',path,undefined,parent,404);expect(await call('get',path+'&fingerprint='+descriptor.fingerprint)).toMatchObject({sessionId:session.id,current:false,lectureTitle:target.title});
    await call('get',path+'&fingerprint='+descriptor.fingerprint,undefined,other,409);
    expect((await call('get',base(session.id)+'/messages/page')).messages).toHaveLength(2);
    await call('post',base(session.id)+'/turns',{...c,requestKey:randomUUID()},parent,409);
  });

  it('refuses an open when its authenticated login is revoked before the durable transaction begins',async()=>{
    const actor=await call('post','/auth/register',{principal:'lecture-revoked-'+randomUUID()+'@local.test',credential:'Lecture-revocation-only-20261028'},null),descriptor=await call('get',descriptorPath,undefined,actor);
    const original=ai.openDurableAssistantSession.bind(ai),before=await store.requestContext(()=>store.select('assistantSessions',{ownerUserId:actor.user.id}).length);
    vi.spyOn(ai,'openDurableAssistantSession').mockImplementation(async(c:any,user:any,auth:any)=>{
      await store.transaction(()=>{store.find('sessions',{id:auth.id}).revokedAt=new Date().toISOString();});
      return original(c,user,auth);
    });
    await call('post','/ai/assistant/sessions',command(descriptor),actor,403);
    expect(await store.requestContext(()=>store.select('assistantSessions',{ownerUserId:actor.user.id}).length)).toBe(before);
  });

  const independent = () => call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' });
  const formalDigest = () => store.requestContext(() => createHash('sha256').update(JSON.stringify(
    ['classroomSessions', 'diagnosticResponses', 'practiceAttempts', 'diagnosticPlans', 'diagnosticHypotheses', 'scoringRevisions']
      .map(name => store.select(name, {})))).digest('hex'));

  it('publishes normal mathematical explanation once with its policy version and unchanged formal records', async () => {
    const session = await independent(), original = await input(session.id), before = await formalDigest();
    const text = '奇数不一定是质数，9是反例；每个正方形一定是长方形，因为它有四个直角。';
    const reply = vi.spyOn(chat, 'reply').mockResolvedValue({ reply: text, evidenceIds: [], modelId: 'deepseek-v4-flash', modelName: 'Synthetic policy model' });
    const turn = await call('post', base(session.id) + '/turns', original);
    await worker.runNext();
    const done = await call('get', base(session.id) + '/turns/' + turn.id);
    expect(done.status).toBe('completed');
    const page = await call('get', base(session.id) + '/messages/page');
    expect(page.messages.find((message: any) => message.id === done.assistantMessageId)).toMatchObject({ content: text, modelId: 'deepseek-v4-flash' });
    expect((await call('post', base(session.id) + '/turns', original)).assistantMessageId).toBe(done.assistantMessageId);
    expect(reply).toHaveBeenCalledOnce();
    const insight = await store.requestContext(() => store.select('aiInsights', { sourceId: session.id }).at(-1));
    expect(insight.payload.structuredResult.outputPolicyVersion).toBe('teaching-output-policy-v1');
    expect(await formalDigest()).toBe(before);
  });

  it('keeps a rejected learner claim unpublished and replays or explicitly retries only its original turn', async () => {
    const session = await independent(), original = await input(session.id), before = await formalDigest();
    const count = await store.requestContext(() => store.select('assistantMessages', { sessionId: session.id }).length);
    const rejected = '我不能诊断；但是孩子就是笨。';
    const reply = vi.spyOn(chat, 'reply').mockResolvedValue({ reply: rejected, evidenceIds: [], modelId: 'deepseek-v4-flash', modelName: 'Synthetic rejected model' });
    const turn = await call('post', base(session.id) + '/turns', original);
    await worker.runNext();
    const failed = await call('get', base(session.id) + '/turns/' + turn.id);
    expect(failed.status).toBe('failed');
    expect(JSON.stringify(failed)).not.toContain(rejected);
    expect((await call('post', base(session.id) + '/turns', original)).id).toBe(turn.id);
    expect(reply).toHaveBeenCalledOnce();
    expect(await store.requestContext(() => store.select('assistantMessages', { sessionId: session.id }).length)).toBe(count);
    reply.mockResolvedValue({ reply: '单次答错不能说明孩子笨，先核对步骤，再用独立新题验证。', evidenceIds: [], modelId: 'deepseek-v4-flash', modelName: 'Synthetic recovered model' });
    const retry = await call('post', base(session.id) + '/turns/' + turn.id + '/retry', { generation: failed.task.generation, version: failed.task.version });
    expect(retry.id).toBe(turn.id);
    await worker.runNext();
    expect((await call('get', base(session.id) + '/turns/' + turn.id)).status).toBe('completed');
    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls.map(args => args[0].modelId)).toEqual(['deepseek-v4-flash', 'deepseek-v4-flash']);
    expect(await store.requestContext(() => store.select('assistantMessages', { sessionId: session.id }).length)).toBe(count + 2);
    expect(await formalDigest()).toBe(before);
  });

  it('does not mark deterministic rules as a model output policy inspection', async () => {
    const session = await independent();
    vi.spyOn(chat, 'enabled', 'get').mockReturnValue(false);
    const reply = vi.spyOn(chat, 'reply');
    const result = await call('post', base(session.id) + '/messages', { message: '请先说明独立学习的一步。', requestKey: randomUUID() });
    expect(result.source).toBe('rules');
    expect(reply).not.toHaveBeenCalled();
    const insight = await store.requestContext(() => store.select('aiInsights', { sourceId: session.id }).at(-1));
    expect(insight.payload.source).toBe('rules');
    expect(insight.payload.structuredResult).not.toHaveProperty('outputPolicyVersion');
  });
});
