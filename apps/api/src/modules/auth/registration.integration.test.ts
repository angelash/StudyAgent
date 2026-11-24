import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs the built API in production mode on a throwaway SQLite directory and checks the public registration gate (232 §7).
const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'XIAOJIU_CHAT_ENABLED', 'STUDY_REGISTRATION', 'STUDY_INVITE_CODES', 'JWT_SECRET'];
describe('invite-only registration over HTTP', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-invite-')), previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any;
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false',
      XIAOJIU_CHAT_ENABLED: 'false', STUDY_INVITE_CODES: 'family-invite-2026', JWT_SECRET: 'invite-test-secret-not-default-0123456789' });
    delete process.env.STUDY_REGISTRATION;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false });
    require('../../../dist/apps/api/src/common/http-body.js').configureJsonBody(app);
    app.setGlobalPrefix('api'); await app.init();
  });
  afterAll(async () => {
    await app?.close();
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    rmSync(directory, { recursive: true, force: true });
  });
  const register = (body: object) => request(app.getHttpServer()).post('/api/auth/register').send(body);

  it('reports the mode, refuses missing or wrong invites without creating accounts, and accepts a configured invite', async () => {
    const status = await request(app.getHttpServer()).get('/api/auth/registration');
    expect(status.status).toBe(200); expect(status.body.data).toEqual({ mode: 'invite', inviteRequired: true });
    for (const invite of [undefined, '', 'wrong-invite-2026']) {
      const refused = await register({ principal: 'invite-refused@test', credential: 'Invite-test-only', ...(invite === undefined ? {} : { invite }) });
      expect(refused.status).toBe(403); expect(refused.body.error.message).toBe('需要有效的邀请码才能创建账号。');
    }
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ principal: 'invite-refused@test', credential: 'Invite-test-only' });
    expect(login.status).toBe(401);
    const created = await register({ principal: 'invite-accepted@test', credential: 'Invite-test-only', invite: ' family-invite-2026 ' });
    expect(created.status).toBe(201); expect(created.body.data.user.role).toBe('parent');
    const strict = await request(app.getHttpServer()).post('/api/auth/login').send({ principal: 'invite-accepted@test', credential: 'Invite-test-only', invite: 'family-invite-2026' });
    expect(strict.status).toBe(400);
  });
});
