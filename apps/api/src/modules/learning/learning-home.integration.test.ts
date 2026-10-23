import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('unified learning home with real persistence and identity boundaries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-learning-home-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'OPENAI_API_KEY', 'MINIMAX_API_KEY', 'XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any, parent: any, other: any, first: any, second: any;
  async function boot() {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
  }
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = parent, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    return (await query.expect(expected)).body.data;
  }
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
      STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    delete process.env.OPENAI_API_KEY; delete process.env.MINIMAX_API_KEY;
    await boot();
    parent = await call('post', '/auth/register', { principal: 'home-parent@test', credential: 'home-test-only-2026' }, null);
    other = await call('post', '/auth/register', { principal: 'home-other@test', credential: 'home-test-only-2026' }, null);
  });
  afterAll(async () => {
    await app?.close();
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(directory, { recursive: true, force: true });
  });
  it('requires login and validates query shape', async () => {
    await call('get', '/learning/home', undefined, null, 401);
    await call('get', '/learning/home?subject=physics', undefined, parent, 400);
    await call('get', '/learning/home?studentId=', undefined, parent, 400);
    await call('get', '/learning/home?subject=math&subject=english', undefined, parent, 400);
    await call('get', '/learning/home?ownerUserId=foreign', undefined, parent, 400);
  });
  it('lets adults learn without a child and restores only their own course', async () => {
    const empty = await call('get', '/learning/home');
    expect(empty.selected).toBeNull(); expect(empty.primary.href).toBe('/studio?view=courses');
    const session = await call('post', '/learning/classroom/sessions', { lessonId: 'soc-1-1-1' });
    const resumed = await call('get', '/learning/home');
    expect(resumed.primary.id).toBe('course:' + session.id);
    expect(resumed.primary.href).toContain('lesson=soc-1-1-1');
    expect(JSON.stringify(resumed)).not.toMatch(/answerKeys|credentialHash|tokenHash/);
    expect((await call('get', '/learning/home', undefined, other)).primary.id).toBe('adult-course');
  });
  it('projects only the explicit authorized child and never silently falls back', async () => {
    const create = async (nickname: string, grade: number) => (await call('post', '/students', { nickname, grade, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } })).profile;
    first = await create('首页孩子甲', 2); second = await create('首页孩子乙', 5);
    const home = await call('get', `/learning/home?studentId=${second.id}&subject=english`);
    expect(home.selected.id).toBe(second.id); expect(home.subject).toBe('english');
    expect(home.scope.confirmed).toBe(false); expect(home.primary.kind).toBe('scope');
    expect(home.primary.href).toContain(`studentId=${second.id}&subject=english`);
    expect(home.counts.unknownPoints).toBe(0);
    await call('get', `/learning/home?studentId=${first.id}`, undefined, other, 403);
    await call('get', '/learning/home?studentId=does-not-exist', undefined, parent, 403);
    const own = await call('get', '/learning/home', undefined, other);
    expect(own.children).toEqual([]); expect(own.memory).toBeNull();
  });
  it('does not create assessments, plans or practices when read repeatedly', async () => {
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const store = app.get(InMemoryStoreService);
    const counts = () => ['diagnosticSessions', 'diagnosticPlans', 'practiceSessions', 'classroomSessions'].map(name => store.inspect(name).length);
    const before = counts();
    for (let n = 0; n < 3; n++) await call('get', `/learning/home?studentId=${first.id}&subject=math`);
    expect(counts()).toEqual(before);
  });
  it('restricts the student identity to their own profile and revokes access immediately', async () => {
    await call('post', `/students/${first.id}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'home-enable', reason: '为首页隔离验收启用独立学习。' });
    const issued = await call('post', `/students/${first.id}/learning-access/codes`, { requestKey: 'home-issue', expectedVersion: 1 });
    const student = await call('post', '/auth/learning-code', { code: issued.code }, null);
    const home = await call('get', `/learning/home?studentId=${first.id}`, undefined, student);
    expect(home.children.map((child: any) => child.id)).toEqual([first.id]);
    expect(home.actor.canManage).toBe(false); expect(home.actor.canUseAdultCourses).toBe(false);
    expect(home.primary.label).toBe('查看学习范围');
    await call('get', `/learning/home?studentId=${second.id}`, undefined, student, 403);
    await call('post', `/students/${first.id}/learning-access`, { enabled: false, expectedVersion: 1, requestKey: 'home-disable', reason: '结束本次独立学习并撤销设备。' });
    await call('get', '/learning/home', undefined, student, 401);
  });
  it('restores the same profile and course facts after an API restart', async () => {
    await app.close(); await boot();
    const home = await call('get', `/learning/home?studentId=${second.id}&subject=chinese`);
    expect(home.selected.nickname).toBe('首页孩子乙'); expect(home.subject).toBe('chinese');
    expect(home.children).toHaveLength(2);
  });
});
