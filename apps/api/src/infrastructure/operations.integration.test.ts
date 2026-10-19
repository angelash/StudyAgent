import 'reflect-metadata';
import { createRequire } from 'node:module';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { trustedProxies } from './trusted-proxy';

const require = createRequire(__filename);
describe('protected operational counters and request limits', () => {
  let app: any, store: any, auth: any, admin: any, parent: any;
  beforeAll(async () => {
    const { AppModule } = require('../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
    admin = await auth.register({ principal: 'operations-admin', credential: 'Synthetic-operations-password' });
    parent = await auth.register({ principal: 'private-parent-identity', credential: 'Synthetic-parent-password' });
    store.users.find((row: any) => row.id === admin.user.id).role = 'admin';
  });
  afterAll(async () => { await app?.close(); });

  it('keeps monitoring administrator-only and publishes aggregate current work without private content', async () => {
    await request(app.getHttpServer()).get('/api/admin/operations').expect(401);
    await request(app.getHttpServer()).get('/api/admin/operations').set('Authorization', `Bearer ${parent.token}`).expect(403);
    await request(app.getHttpServer()).get('/api/library/papers/private-child-identity?token=private-query-secret').set('Authorization', `Bearer ${parent.token}`);
    store.diagnosticSessions.push({ id: 'complete', status: 'completed' }, { id: 'in-progress', status: 'in_progress' });
    store.assessments.push({ id: 'legacy-only', status: 'completed' });
    store.diagnosticResponses.push({ id: 'pending', sessionId: 'complete', status: 'pending_review', answer: 'private-answer-content' },
      { id: 'already-reviewed', sessionId: 'complete', status: 'pending_review' }, { id: 'unfinished', sessionId: 'in-progress', status: 'pending_review' });
    store.scoringRevisions.push({ id: 'review', responseId: 'already-reviewed', version: 1 });
    store.diagnosticPlans.push({ id: 'active', status: 'active' }, { id: 'paused', status: 'paused' });
    store.reviewTasks.push({ id: 'due', planId: 'active', status: 'pending', dueAt: new Date(0).toISOString() },
      { id: 'paused-due', planId: 'paused', status: 'pending', dueAt: new Date(0).toISOString() });
    await store.enqueueTask({ id: 'operational-task', kind: 'qa.metrics', ownerUserId: admin.user.id, requestKey: 'synthetic-monitoring', payloadHash: 'synthetic',
      payload: { private: 'private-task-payload' }, createdAt: new Date().toISOString(), maxAttempts: 1 });
    const result = (await request(app.getHttpServer()).get('/api/admin/operations').set('Authorization', `Bearer ${admin.token}`).expect(200)).body.data;
    expect(result.learning).toMatchObject({ completedAssessments: 1, activePlans: 1, pendingRubrics: 1, dueReviews: 1 });
    expect(result.tasks.counts.queued).toBe(1);
    expect(result.requests.clientErrors).toBeGreaterThanOrEqual(2);
    const serialized = JSON.stringify(result);
    for (const secret of ['private-parent-identity', 'private-child-identity', 'private-query-secret', 'private-answer-content', 'private-task-payload', parent.token, admin.token]) expect(serialized).not.toContain(secret);
    expect(result.requests.routes.some((row: any) => row.route.includes(':'))).toBe(true);
    const overview = (await request(app.getHttpServer()).get('/api/admin/analytics/overview').set('Authorization', `Bearer ${admin.token}`).expect(200)).body.data;
    expect(overview.completedAssessmentCount).toBe(1);
  });

  it('counts rejected code guesses outside rolled-back requests and returns a bounded Retry-After', async () => {
    for (let index = 0; index < 30; index++) await request(app.getHttpServer()).post('/api/auth/learning-code').send({ code: 'fedcba98765432100123' }).expect(401);
    const response = await request(app.getHttpServer()).post('/api/auth/learning-code').send({ code: 'fedcba98765432100123' }).expect(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(900);
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('trusts forwarded client addresses only through an explicit proxy network', async () => {
    const express = require('express'), server = express();
    server.set('trust proxy', trustedProxies(undefined)); server.get('/', (req: any, res: any) => res.json({ ip: req.ip }));
    const direct = await request(server).get('/').set('X-Forwarded-For', '198.51.100.1');
    expect(direct.body.ip).not.toBe('198.51.100.1');
    server.set('trust proxy', trustedProxies('127.0.0.1/32,::1/128'));
    expect((await request(server).get('/').set('X-Forwarded-For', '198.51.100.1, 203.0.113.10')).body.ip).toBe('203.0.113.10');
    expect(() => trustedProxies('true')).toThrow(); expect(() => trustedProxies('0.0.0.0/0')).toThrow();
  });
});
