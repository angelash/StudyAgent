import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';

describe('workspace overview with durable identity and read-only recovery', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-workspace-overview-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'STUDY_PDF_STRUCTURE_MODEL', 'XIAOJIU_CHAT_ENABLED', 'OPENAI_API_KEY', 'MINIMAX_API_KEY'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const postgresUrl = process.env.STUDY_TEST_WORKSPACE_POSTGRES_URL;
  let app: any, store: any, parent: any, other: any, learner: any, first: any, second: any;
  let control: Pool | undefined, schema: string | undefined;
  const businessCollections = ['learningScopes', 'diagnosticSessions', 'diagnosticPlans', 'practiceSessions', 'studioCourses', 'classroomSessions', 'studioScheduleEvents', 'studioWhiteboards'];
  async function boot() {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService);
  }
  async function call(method: 'get' | 'post', path: string, body?: unknown, actor = parent, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    return (await query.expect(expected)).body.data;
  }
  const businessSnapshot = () => store.requestContext(() => JSON.stringify(businessCollections.map(name => store.inspect(name))));
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
      STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_PDF_STRUCTURE_MODEL: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    delete process.env.OPENAI_API_KEY; delete process.env.MINIMAX_API_KEY;
    if (postgresUrl) {
      control = new Pool({ connectionString: postgresUrl });
      if ((await control.query('SELECT current_database() AS name')).rows[0].name !== 'study_agent_qa') throw new Error('Only the dedicated study_agent_qa database is allowed');
      schema = 'study_qa_workspace_' + randomUUID().replace(/-/g, '');
      await control.query('CREATE SCHEMA "' + schema + '"');
      const scoped = new URL(postgresUrl); scoped.searchParams.set('options', '-c search_path=' + schema);
      process.env.STUDY_STORAGE = 'postgres'; process.env.DATABASE_URL = scoped.toString();
    }
    await boot();
    parent = await call('post', '/auth/register', { principal: 'durable-workspace-parent@test', credential: 'Workspace-durable-QA-only' }, null);
    other = await call('post', '/auth/register', { principal: 'durable-workspace-other@test', credential: 'Workspace-durable-QA-only' }, null);
    const create = async (nickname: string) => (await call('post', '/students', { nickname, grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } })).profile;
    first = await create('合成工作台甲'); second = await create('合成工作台乙');
    const access = await call('post', '/students/' + first.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '合成工作台双库身份验证' });
    const issued = await call('post', '/students/' + first.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    learner = await call('post', '/auth/learning-code', { code: issued.code }, null);
  });
  afterAll(async () => {
    await app?.close();
    if (control) { if (schema && /^study_qa_workspace_[a-f0-9]{32}$/.test(schema)) await control.query('DROP SCHEMA "' + schema + '" CASCADE'); await control.end(); }
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    rmSync(directory, { recursive: true, force: true });
  });
  it('uses the real durable driver and rejects unauthenticated or invalid audiences', async () => {
    expect(store.persistence).toEqual({ driver: postgresUrl ? 'postgres' : 'sqlite', durable: true });
    await call('get', '/learning/studio/overview?audience=independent', undefined, null, 401);
    await call('get', '/learning/studio/overview?audience=unknown', undefined, parent, 400);
  });
  it('keeps two lawful profile metadata rows but no child business projections or writes in self mode', async () => {
    const before = await businessSnapshot();
    for (let index = 0; index < 3; index++) {
      const overview = await call('get', '/learning/studio/overview?audience=independent');
      expect(overview.selected).toBeNull(); expect(overview.children.map((row: any) => row.id)).toEqual([first.id, second.id]);
      for (const key of ['courses', 'feed', 'activities', 'plans', 'materials', 'studyPacks', 'whiteboards']) expect(overview[key]).toEqual([]);
      expect(overview.integrations).toEqual({ connectors: [], events: [] }); expect(overview.speech).toBeTruthy();
    }
    expect(await businessSnapshot()).toBe(before);
    expect((await call('get', '/learning/studio/overview?audience=independent', undefined, other)).children).toEqual([]);
  });
  it('rejects learner self mode, mixed intentions and another account without substituting a child', async () => {
    await call('get', '/learning/studio/overview?audience=independent', undefined, learner, 403);
    await call('get', '/learning/studio/overview?audience=independent&studentId=' + first.id, undefined, parent, 400);
    await call('get', '/learning/studio/overview?audience=independent&courseId=unknown-child-course', undefined, parent, 400);
    await call('get', '/learning/studio/overview?studentId=' + first.id, undefined, other, 403);
    await call('get', '/learning/studio/overview?studentId=' + second.id, undefined, learner, 403);
    expect((await call('get', '/learning/studio/overview?studentId=' + second.id + '&subject=english')).selected.id).toBe(second.id);
  });
  it('restores original accounts, profiles and learner binding after reopening the durable application', async () => {
    const before = await businessSnapshot(); await app.close(); await boot();
    expect(store.persistence.driver).toBe(postgresUrl ? 'postgres' : 'sqlite');
    const personal = await call('get', '/learning/studio/overview?audience=independent');
    expect(personal.selected).toBeNull(); expect(personal.children.map((row: any) => row.id)).toEqual([first.id, second.id]);
    expect((await call('get', '/learning/studio/overview?subject=math', undefined, learner)).selected.id).toBe(first.id);
    expect((await call('get', '/learning/studio/overview?audience=independent', undefined, other)).children).toEqual([]);
    expect(await businessSnapshot()).toBe(before);
  });
  it('ends the original learning-code identity after revocation and keeps guardian metadata lawful', async () => {
    await call('post', '/students/' + first.id + '/learning-access', { enabled: false, expectedVersion: 1, requestKey: randomUUID(), reason: '合成工作台撤权恢复验证' });
    const response = await request(app.getHttpServer()).get('/api/learning/studio/overview?subject=math').set('Authorization', 'Bearer ' + learner.token);
    expect([401, 403]).toContain(response.status);
    expect((await call('get', '/learning/studio/overview?audience=independent')).children.map((row: any) => row.id)).toEqual([first.id, second.id]);
  });
});
