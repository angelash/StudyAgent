import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 232 §4.3: a guardian sets the per-profile minor switch; the learner list reports it; others cannot change it.
const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'XIAOJIU_CHAT_ENABLED'];
describe('learner profile minor switch', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-minor-')), previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any, store: any;
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false });
    require('../../../dist/apps/api/src/common/http-body.js').configureJsonBody(app);
    app.setGlobalPrefix('api'); await app.init();
    store = app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);
  });
  afterAll(async () => {
    await app?.close();
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    rmSync(directory, { recursive: true, force: true });
  });
  async function call(method: 'get' | 'post', path: string, token: string | null, body?: object, status = method === 'get' ? 200 : 201) {
    let query = (request(app.getHttpServer()) as any)[method]('/api' + path);
    if (token) query = query.set('Authorization', 'Bearer ' + token);
    if (body) query = query.send(body);
    const result = await query; expect(result.status, JSON.stringify(result.body)).toBe(status); return result.body.data;
  }

  it('defaults to minor, lets the guardian relax it, and refuses other accounts and learners', async () => {
    const parent = await call('post', '/auth/register', null, { principal: 'minor-parent@test', credential: 'Minor-test-only' });
    const other = await call('post', '/auth/register', null, { principal: 'minor-other@test', credential: 'Minor-test-only' });
    const child = (await call('post', '/students', parent.token, { nickname: '合成档案', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { chinese: '', math: '', english: '' } })).profile;
    expect((await call('get', '/learning/students', parent.token)).find((row: any) => row.id === child.id)).toMatchObject({ minor: true });
    const audience = require('../../../dist/apps/api/src/modules/ai/learner-audience.js').learnerAudience;
    expect(await store.requestContext(() => audience(store, child.id))).toBe('minor');
    expect(await store.requestContext(() => audience(store, null))).toBe('adult');
    expect(await call('post', '/students/' + child.id + '/settings', parent.token, { minor: false })).toEqual({ studentId: child.id, minor: false });
    expect((await call('get', '/learning/students', parent.token)).find((row: any) => row.id === child.id)).toMatchObject({ minor: false });
    expect(await store.requestContext(() => audience(store, child.id))).toBe('adult');
    await call('post', '/students/' + child.id + '/settings', other.token, { minor: true }, 403);
    await call('post', '/students/' + child.id + '/settings', parent.token, { minor: 'no' }, 400);
    await call('post', '/students/' + child.id + '/settings', parent.token, { minor: true, nickname: 'x' }, 400);
    expect(await store.requestContext(() => audience(store, child.id))).toBe('adult');
  });
});
