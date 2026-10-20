import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

describe('GESP learning support HTTP boundaries', () => {
  let app: any, base: any, parent: any, learner: any, studentId: string;
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

  it('lets only the learner request progressive hints and replays the same request', async () => {
    const requestKey = randomUUID(), body = { studentId, atomId: 'gesp-cpp.l1.io', taskId: 'gesp-student-cpp-sum-two', level: 1, requestKey };
    const first = await call('post', '/gesp/hints', body, learner); const replay = await call('post', '/gesp/hints', body, learner);
    expect(replay.id).toBe(first.id); expect(first).toMatchObject({ level: 1, revealsAnswer: false });
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
    const workspace = await call('get', `/gesp/students/${studentId}/workspace`, undefined, learner);
    expect(workspace.guidancePlans[0].status).toBe('active'); expect(JSON.stringify(workspace.guidancePlans)).not.toContain('requestKey');
  });

  it('keeps unrelated guardians outside programming learning evidence', async () => {
    const outsider = await call('post', '/auth/register', { principal: `gesp-loop-outsider-${randomUUID()}`,
      credential: randomBytes(18).toString('hex') }, null);
    await call('get', `/gesp/students/${studentId}/workspace`, undefined, outsider, 403);
    await call('post', '/gesp/guidance-plans', { studentId, scopeVersion: 1, minutesPerDay: 20, requestKey: randomUUID(),
      reason: '无关家长不能生成指导计划' }, outsider, 403);
  });
});
