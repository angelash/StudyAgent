import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

describe.skipIf(process.platform !== 'win32')('GESP isolated student programming loop', () => {
  let app: any, base: any, parent: any, learner: any, studentId: string;
  beforeAll(async () => {
    const from = (file: string) => require(`../../../dist/apps/api/src/${file}.js`);
    app = await NestFactory.create(from('app.module').AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.init();
    base = request(app.getHttpServer());
    parent = await call('post', '/auth/register', { principal: `gesp-parent-${randomUUID()}`, credential: randomBytes(18).toString('hex') }, null);
    const created = await call('post', '/students', { nickname: 'GESP合成学习者', grade: 4, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } }, parent); studentId = created.profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0,
      requestKey: randomUUID(), reason: '家长确认独立使用GESP试点编程学习身份' }, parent);
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() }, parent);
    learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    await call('put', `/gesp/students/${studentId}/scope`, { level: 1, atomIds: ['gesp-cpp.l1.io', 'gesp-cpp.l1.division', 'gesp-cpp.l1.loop'],
      requestKey: randomUUID(), reason: '仅开放已完成的原创试点编程知识点' }, parent);
  });
  afterAll(async () => { await app?.close(); });
  async function call(method: 'get' | 'post' | 'put', route: string, body?: unknown, actor: any = parent, expected = method === 'post' ? 201 : 200) {
    let query = base[method]('/api' + route); if (actor?.token) query = query.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object); const response = await query;
    expect(response.status, `${method} ${route}: ${response.body.error?.message ?? ''}`).toBe(expected); return response.body.data;
  }

  it('keeps hidden tests private and requires the parent-confirmed independent scope', async () => {
    const workspace = await call('get', `/gesp/students/${studentId}/workspace`);
    expect(workspace.scope).toMatchObject({ level: 1, atomIds: ['gesp-cpp.l1.division', 'gesp-cpp.l1.io', 'gesp-cpp.l1.loop'] });
    expect(workspace.tasks).toHaveLength(3); expect(JSON.stringify(workspace)).not.toContain('expected'); expect(JSON.stringify(workspace)).not.toContain('tests');
    expect(workspace.tasks.find((task: any) => task.atomId === 'gesp-cpp.l1.io').probes).toHaveLength(2);
    expect(JSON.stringify(workspace.tasks)).not.toContain('"answer"');
    await call('put', `/gesp/students/${studentId}/scope`, { level: 1, atomIds: ['gesp-cpp.l1.io'], requestKey: randomUUID(),
      reason: '学生不能自行修改家长确认的范围' }, learner, 403);
    const requestKey = randomUUID(), narrowed = await call('put', `/gesp/students/${studentId}/scope`, { level: 1, atomIds: ['gesp-cpp.l1.io'], requestKey,
      reason: '家长完成首次核对后只保留输入输出试点' }, parent); expect(narrowed).toMatchObject({ version: 2, atomIds: ['gesp-cpp.l1.io'] });
    const replay = await call('put', `/gesp/students/${studentId}/scope`, { level: 1, atomIds: ['gesp-cpp.l1.io'], requestKey,
      reason: '家长完成首次核对后只保留输入输出试点' }, parent); expect(replay.version).toBe(2);
    await call('put', `/gesp/students/${studentId}/scope`, { level: 1, atomIds: ['gesp-cpp.l1.loop'], requestKey,
      reason: '同一请求键不能改变范围内容' }, parent, 409);
    const history = await call('get', `/gesp/students/${studentId}/workspace`); expect(history.scopeHistory).toHaveLength(2);
  });

  it('keeps concept and state-tracking evidence independent from code execution', async () => {
    const probeKey = randomUUID(), answer = await call('post', '/gesp/probe-submissions', { studentId, atomId: 'gesp-cpp.l1.io',
      probeId: 'gesp-student-cpp-sum-two-concept', answer: 'cin 与 cout', requestKey: probeKey }, learner);
    expect(answer).toMatchObject({ status: 'correct', dimension: 'understanding' });
    const replay = await call('post', '/gesp/probe-submissions', { studentId, atomId: 'gesp-cpp.l1.io',
      probeId: 'gesp-student-cpp-sum-two-concept', answer: 'cin 与 cout', requestKey: probeKey }, learner); expect(replay.id).toBe(answer.id);
    await call('post', '/gesp/probe-submissions', { studentId, atomId: 'gesp-cpp.l1.io', probeId: 'gesp-student-cpp-sum-two-concept',
      answer: 'printf 与 scanf', requestKey: probeKey }, learner, 409);
    const wrong = await call('post', '/gesp/probe-submissions', { studentId, atomId: 'gesp-cpp.l1.io',
      probeId: 'gesp-student-cpp-sum-two-trace', answer: '23', requestKey: randomUUID() }, learner); expect(wrong.status).toBe('incorrect');
    await call('post', '/gesp/probe-submissions', { studentId, atomId: 'gesp-cpp.l1.io', probeId: 'gesp-student-cpp-sum-two-trace',
      answer: '5', requestKey: randomUUID() }, parent, 403);
    const workspace = await call('get', `/gesp/students/${studentId}/workspace`);
    const capability = workspace.capabilities.find((row: any) => row.atomId === 'gesp-cpp.l1.io');
    expect(capability.state).toBe('needs_verification'); expect(capability.hypothesis).toContain('状态跟踪');
    expect(capability.dimensions).toContainEqual({ dimension: 'understanding', status: 'correct', attempts: 1 });
  }, 30_000);

  it('runs source with hidden tests and returns only sanitized evidence', async () => {
    const source = '#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}';
    const requestKey = randomUUID(), first = await call('post', '/gesp/code-submissions', { studentId, atomId: 'gesp-cpp.l1.io', source, requestKey }, learner);
    expect(first).toMatchObject({ status: 'passed', compilePassed: true, taskId: 'gesp-student-cpp-sum-two' }); expect(first.tests).toHaveLength(5);
    expect(JSON.stringify(first)).not.toContain('expected'); expect(JSON.stringify(first)).not.toContain(source);
    const replay = await call('post', '/gesp/code-submissions', { studentId, atomId: 'gesp-cpp.l1.io', source, requestKey }, learner);
    expect(replay.id).toBe(first.id);
    await call('post', '/gesp/code-submissions', { studentId, atomId: 'gesp-cpp.l1.io', source: 'int main(){return 1;}', requestKey }, learner, 409);
    const wrong = await call('post', '/gesp/code-submissions', { studentId, atomId: 'gesp-cpp.l1.io', source: 'int main(){return 0;}', requestKey: randomUUID() }, learner);
    expect(wrong.status).toBe('failed'); expect(wrong.tests.some((row: any) => row.status === 'wrong_output')).toBe(true);
    const compileError = await call('post', '/gesp/code-submissions', { studentId, atomId: 'gesp-cpp.l1.io', source: 'int main(){ this is invalid; }',
      requestKey: randomUUID() }, learner); expect(compileError).toMatchObject({ status: 'error', compilePassed: false });
    expect(compileError.compileDiagnostics.length).toBeGreaterThan(0); expect(JSON.stringify(compileError)).not.toContain('/tmp/study-');
  }, 60_000);

  it('rejects points outside scope, parent code submission and unrelated guardians', async () => {
    await call('post', '/gesp/code-submissions', { studentId, atomId: 'gesp-cpp.l1.branch', source: 'int main(){}', requestKey: randomUUID() }, learner, 403);
    await call('post', '/gesp/code-submissions', { studentId, atomId: 'gesp-cpp.l1.io', source: 'int main(){}', requestKey: randomUUID() }, parent, 403);
    const outsider = await call('post', '/auth/register', { principal: `gesp-outsider-${randomUUID()}`, credential: randomBytes(18).toString('hex') }, null);
    await call('get', `/gesp/students/${studentId}/workspace`, undefined, outsider, 403);
  }, 30_000);
});
