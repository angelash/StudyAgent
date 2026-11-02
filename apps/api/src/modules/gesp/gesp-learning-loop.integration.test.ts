import 'reflect-metadata';
import { randomBytes, randomUUID,createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

describe('GESP learning support HTTP boundaries', () => {
  let app: any, base: any, parent: any, learner: any, reviewer: any, studentId: string;
  beforeAll(async () => {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.init();
    base = request(app.getHttpServer());
    parent = await call('post', '/auth/register', { principal: `gesp-loop-${randomUUID()}`, credential: randomBytes(18).toString('hex') }, null);
    const created = await call('post', '/students', { nickname: 'GESP指导闭环', grade: 4, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } }, parent); studentId = created.profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0,
      requestKey: randomUUID(), reason: '家长允许孩子使用独立编程学习身份' }, parent);
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() }, parent);
    learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    reviewer = await call('post', '/auth/register', { principal: `gesp-reviewer-${randomUUID()}`,
      credential: randomBytes(18).toString('hex') }, null);
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const store=app.get(InMemoryStoreService);await store.transaction(()=>{store.find('users',{id:reviewer.user.id}).role='admin';});
    await call('put', `/gesp/students/${studentId}/scope`, { level: 1, atomIds: ['gesp-cpp.l1.io'], requestKey: randomUUID(),
      reason: '家长确认一个一级原创编程试点范围' }, parent);
  });
  afterAll(async () => { await app?.close(); });
  async function call(method: 'get' | 'post' | 'put' | 'patch', route: string, body?: unknown, actor: any = parent,
    expected = method === 'post' ? 201 : 200) {
    let query = base[method]('/api' + route); if (actor?.token) query = query.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object); const response = await query;
    expect(response.status, `${method} ${route}: ${response.body.error?.message ?? ''}`).toBe(expected); return response.body.data;
  }

  it('recovers the exact code receipt but rejects a different atom with the same source and original request key',async()=>{
    const from=(file:string)=>require('../../../dist/apps/api/src/'+file+'.js'),store=app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);
    const source='int main(){return 0;}',requestKey=randomUUID(),id=randomUUID(),sourceSha256=createHash('sha256').update(source).digest('hex');
    await store.transaction(()=>store.append('gespCodeSubmissions',{id,studentId,atomId:'gesp-cpp.l1.io',taskId:'gesp-student-cpp-sum-two',source,sourceSha256,requestKey,status:'failed',createdAt:new Date().toISOString(),compilePassed:true,tests:[],compileDiagnostics:[],runtimeDiagnostics:[],hintLevel:0,independent:true,reviewTaskId:null}));
    const before=await store.requestContext(()=>JSON.stringify(store.inspect('gespCodeSubmissions'))),command={studentId,atomId:'gesp-cpp.l1.io',source,requestKey};
    const replay=await call('post','/gesp/code-submissions',command,learner);expect(replay.id).toBe(id);expect(replay.atomId).toBe(command.atomId);expect(replay).not.toHaveProperty('source');expect(replay).not.toHaveProperty('requestKey');
    await call('post','/gesp/code-submissions',{...command,atomId:'gesp-cpp.l1.division'},learner,409);
    await call('post','/gesp/code-submissions',{...command,source:source+'\n'},learner,409);
    expect(await store.requestContext(()=>JSON.stringify(store.inspect('gespCodeSubmissions')))).toBe(before);
  });

  it('lets only the learner request progressive hints and replays the same request', async () => {
    const requestKey = randomUUID(), body = { studentId, atomId: 'gesp-cpp.l1.io', taskId: 'gesp-student-cpp-sum-two', level: 1, requestKey };
    const first = await call('post', '/gesp/hints', body, learner); const replay = await call('post', '/gesp/hints', body, learner);
    expect(replay.id).toBe(first.id); expect(first).toMatchObject({ level: 1, revealsAnswer: false });
    await call('post','/gesp/hints',{...body,atomId:'gesp-cpp.l1.loop'},learner,409);
    expect(JSON.stringify(first)).not.toContain('expected');
    await call('post', '/gesp/hints', body, parent, 403);
  });

  it('creates a rule plan for parent confirmation and exposes it only after activation', async () => {
    const createKey = randomUUID(), create = { studentId, scopeVersion: 1, minutesPerDay: 20, requestKey: createKey,
      reason: '家长根据当前GESP独立证据生成待确认计划' };
    const plan = await call('post', '/gesp/guidance-plans', create); expect(plan).toMatchObject({ status: 'awaiting_confirmation', source: 'rules', version: 1 });
    expect((await call('post', '/gesp/guidance-plans', create)).id).toBe(plan.id);
    await call('post', '/gesp/guidance-plans', create, learner, 403);
    const active = await call('patch', `/gesp/guidance-plans/${plan.id}`, { status: 'active', expectedVersion: 1,
      requestKey: randomUUID(), reason: '家长核对计划目标、证据、活动和每日时长后启用' }); expect(active).toMatchObject({ status: 'active', version: 2 });
    expect(await call('post', '/gesp/guidance-plans', create)).toMatchObject({ id: plan.id, status: 'awaiting_confirmation', version: 1 });
    const workspace = await call('get', `/gesp/students/${studentId}/workspace`, undefined, learner);
    expect(workspace.guidancePlans[0].status).toBe('active'); expect(JSON.stringify(workspace.guidancePlans)).not.toContain('requestKey');
  });

  it('shows hidden authored content only to reviewers and version-gates the publishing decision', async () => {
    const content = await call('get', '/gesp/student-content?level=1', undefined, reviewer);
    expect(content.tasks).toHaveLength(15); expect(content.tasks[0].tests.length).toBeGreaterThan(0);
    await call('get', '/gesp/student-content?level=1', undefined, parent, 403);
    const task = content.tasks.find((row: any) => row.id === 'gesp-student-cpp-sum-two');
    const gates = { atomAlignment: 'approved', instructions: 'approved', probes: 'approved', hiddenTests: 'approved', executionSafety: 'approved' };
    const review = await call('post', '/gesp/student-content/reviews', { taskId: task.id, expectedVersion: 0, gates,
      rationale: '已核对知识目标、学生说明、两类探针、隐藏输入输出边界和隔离运行资源限制。', requestKey: randomUUID() }, reviewer);
    expect(review).toMatchObject({ status: 'approved', version: 1, current: true });
    const history = await call('get', `/gesp/student-content/${task.id}/reviews`, undefined, reviewer);
    expect(history).toHaveLength(1); expect(history[0]).toMatchObject({ status: 'approved', version: 1, current: true });
    await call('post', '/gesp/student-content/reviews', { taskId: task.id, expectedVersion: 0, gates,
      rationale: '旧版本请求不能覆盖已经保存并生效的审核结论，必须先刷新最新内容审核版本。', requestKey: randomUUID() }, reviewer, 409);
  });

  it('returns the frozen scope receipt after later changes and rejects competing versioned confirmations',async()=>{
    const child=(await call('post','/students',{nickname:'合成认证范围并发',grade:4,preferredSessionMinutes:15,defaultVersionMap:{math:'',chinese:'',english:''}})).profile.id;
    const original={level:1,atomIds:['gesp-cpp.l1.io'],expectedVersion:0,requestKey:randomUUID(),reason:'合成家长确认原始范围并保留原始回执'};
    const first=await call('put','/gesp/students/'+child+'/scope',original);expect(first.version).toBe(1);
    const next=await call('put','/gesp/students/'+child+'/scope',{...original,atomIds:['gesp-cpp.l1.loop'],expectedVersion:1,requestKey:randomUUID()});expect(next.version).toBe(2);
    expect(await call('put','/gesp/students/'+child+'/scope',original)).toEqual(first);
    const current=await call('get','/gesp/students/'+child+'/workspace');expect(current.scope).toMatchObject({version:2,atomIds:['gesp-cpp.l1.loop']});expect(current.scopeHistory).toHaveLength(2);
    await call('put','/gesp/students/'+child+'/scope',{...original,expectedVersion:1},parent,409);
    const replies=await Promise.all(['gesp-cpp.l1.io','gesp-cpp.l1.division'].map(atomId=>base.put('/api/gesp/students/'+child+'/scope').set('Authorization','Bearer '+parent.token).send({...original,atomIds:[atomId],expectedVersion:2,requestKey:randomUUID()})));
    expect(replies.map(row=>row.status).sort()).toEqual([200,409]);expect((await call('get','/gesp/students/'+child+'/workspace')).scopeHistory).toHaveLength(3);
  });

  it('keeps unrelated guardians outside programming learning evidence', async () => {
    const outsider = await call('post', '/auth/register', { principal: `gesp-loop-outsider-${randomUUID()}`,
      credential: randomBytes(18).toString('hex') }, null);
    await call('get', `/gesp/students/${studentId}/workspace`, undefined, outsider, 403);
    await call('post', '/gesp/guidance-plans', { studentId, scopeVersion: 1, minutesPerDay: 20, requestKey: randomUUID(),
      reason: '无关家长不能生成指导计划' }, outsider, 403);
  });

  it('serves the complete private teaching candidate pack without approving content or changing learner evidence', async () => {
    const from = (file: string) => require('../../../dist/apps/api/src/' + file + '.js');
    const store = app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);
    const collections = ['gespCodeSubmissions', 'gespProbeSubmissions', 'gespHintEvents', 'gespTaskReviews', 'gespReviewTasks'];
    const snapshot = () => store.requestContext(() => JSON.stringify(collections.map(name => store.inspect(name))));
    const before = await snapshot(), all = await call('get', '/gesp/teaching-candidates', undefined, reviewer);
    expect(all.lessons).toHaveLength(49); expect(all).toMatchObject({ automaticPublication: false, teacherReviewed: false });
    expect(all.lessons[0].example.referenceAnswer).toBeTruthy();
    await call('get', '/gesp/teaching-candidates', undefined, learner, 403);
    await call('get', '/gesp/teaching-candidates', undefined, parent, 403);
    await call('get', '/gesp/teaching-candidates?level=0', undefined, reviewer, 400);
    const filtered = await call('get', '/gesp/teaching-candidates?level=4', undefined, reviewer);
    expect(filtered.lessons.every((row: any) => row.level === 4)).toBe(true);
    const workspace = await call('get', `/gesp/students/${studentId}/workspace`, undefined, learner);
    expect(JSON.stringify(workspace)).not.toContain('referenceAnswer');
    expect(JSON.stringify(workspace)).not.toContain(all.lessons[0].explanation);
    expect(await snapshot()).toBe(before);
  });

  it('keeps the task catalog private from a learner until the guardian confirms the scope', async () => {
    const child = (await call('post', '/students', { nickname: '未确认认证范围的合成档案', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    const access = await call('post', `/students/${child.id}/learning-access`, { enabled: true, expectedVersion: 0,
      requestKey: randomUUID(), reason: '仅开放独立身份，尚未确认认证任务范围' });
    const code = await call('post', `/students/${child.id}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() });
    const childActor = await call('post', '/auth/learning-code', { code: code.code }, null);
    const before = await call('get', `/gesp/students/${child.id}/workspace`, undefined, childActor);
    expect(before.scope).toBeNull(); expect(before.tasks).toEqual([]); expect(before.availableTasks).toEqual([]);
    expect((await call('get', `/gesp/students/${child.id}/workspace`)).availableTasks).toHaveLength(49);
    await call('put', `/gesp/students/${child.id}/scope`, { level: 1, atomIds: ['gesp-cpp.l1.io'], requestKey: randomUUID(), reason: '家长只确认一个原创认证目标' });
    const after = await call('get', `/gesp/students/${child.id}/workspace`, undefined, childActor);
    expect(after.tasks.map((row: any) => row.atomId)).toEqual(['gesp-cpp.l1.io']); expect(after.availableTasks).toEqual([]);
  });
});
