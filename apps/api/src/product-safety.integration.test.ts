import 'reflect-metadata';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

const require = createRequire(__filename);

describe('product authorization and measurement safety regressions', () => {
  let app: INestApplication;
  let store: any;
  let auth: any;
  beforeAll(async () => {
    const { AppModule } = require('../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.init();
    store = app.get(InMemoryStoreService);
    auth = app.get(AuthService);
  });
  beforeEach(() => store.reset());
  afterAll(() => app.close());
  const account = (name: string) => auth.register({ principal: name, credential: 'test-credential-123' }, name);
  function child(owner: string) {
    const id = store.nextId('student');
    store.students.push({ id, userId: 'student-user', nickname: '小禾', grade: 3, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'math', chinese: 'chinese', english: 'english' } });
    store.bindings.push({ id: store.nextId('binding'), parentUserId: owner, studentId: id, relation: 'guardian', status: 'active' });
    return id;
  }
  function question(id: string, status = 'published') {
    store.questions.push({ id, subject: 'math', type: 'objective', stem: '3 + 3 = ?', answer: '6', analysis: '两组3相加',
      difficultyLevel: 1, knowledgePointIds: ['addition'], status });
  }

  it('never grants admin from an account name, requires explicit registration, sets a private cookie and revokes logout', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/auth/login').send({ principal: 'new-admin@test', credential: 'test-credential-123' }).expect(401);
    const created = await request(server).post('/api/auth/register').send({ principal: 'new-admin@test', credential: 'test-credential-123' }).expect(201);
    expect(created.body.data.user.role).toBe('parent');
    expect(created.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(store.sessions[0]).not.toHaveProperty('token');
    const token = created.body.data.token;
    await request(server).get('/api/auth/me').set('Cookie', created.headers['set-cookie']).expect(200);
    await request(server).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(201);
    await request(server).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('rejects expired sessions and invalid profile fields', async () => {
    const owner = await account('expiry@test');
    await request(app.getHttpServer()).post('/api/students').set('Authorization', `Bearer ${owner.token}`)
      .send({ nickname: 'test', grade: 13, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } }).expect(400);
    store.sessions[0].expiresAt = '2000-01-01T00:00:00Z';
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${owner.token}`).expect(401);
  });

  it('prevents self-binding by ID and allows only the invited recipient', async () => {
    const owner = await account('owner@test');
    const stranger = await account('stranger@test');
    const recipient = await account('recipient@test');
    const studentId = child(owner.user.id);
    const server = app.getHttpServer();
    await request(server).post(`/api/parents/${stranger.user.id}/bindings`).set('Authorization', `Bearer ${stranger.token}`).send({ studentId }).expect(403);
    const invitation = await request(server).post(`/api/students/${studentId}/invitations`).set('Authorization', `Bearer ${owner.token}`)
      .send({ recipientPrincipal: 'recipient@test' }).expect(201);
    const inviteToken = invitation.body.data.token;
    await request(server).post(`/api/parents/${stranger.user.id}/bindings`).set('Authorization', `Bearer ${stranger.token}`).send({ studentId, inviteToken }).expect(403);
    await request(server).post(`/api/parents/${recipient.user.id}/bindings`).set('Authorization', `Bearer ${recipient.token}`).send({ studentId, inviteToken }).expect(201);
    await request(server).get(`/api/students/${studentId}/profile`).set('Authorization', `Bearer ${recipient.token}`).expect(200);
    await request(server).get(`/api/students/${studentId}/profile`).set('Authorization', `Bearer ${stranger.token}`).expect(403);
    expect(store.studentInvitations[0].consumedAt).toBeTruthy();
  });

  it('protects drafts, correct answers and grading keys', async () => {
    const owner = await account('content@test');
    question('published');
    question('draft', 'draft');
    store.questionAnswerSchemas.push({ questionId: 'published', mode: 'numeric_blank', responseShape: { value: 'number' },
      validationRules: {}, gradingConfig: { correctAnswer: '6' } });
    const server = app.getHttpServer();
    await request(server).get('/api/questions').expect(401);
    await request(server).get('/api/questions/draft/render').expect(401);
    await request(server).get('/api/questions/draft/render').set('Authorization', `Bearer ${owner.token}`).expect(404);
    const list = await request(server).get('/api/questions').set('Authorization', `Bearer ${owner.token}`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).not.toHaveProperty('answer');
    expect(list.body.data[0]).not.toHaveProperty('analysis');
    const render = await request(server).get('/api/questions/published/render').set('Authorization', `Bearer ${owner.token}`).expect(200);
    expect(render.body.data.answerSchema.gradingConfig).toEqual({});
    const blank = await request(server).post('/api/questions/published/answers/validate').set('Authorization', `Bearer ${owner.token}`).send({ answer: '' }).expect(201);
    expect(blank.body.data.valid).toBe(false);
    const zero = await request(server).post('/api/questions/published/answers/validate').set('Authorization', `Bearer ${owner.token}`).send({ answer: 0 }).expect(201);
    expect(zero.body.data.normalizedAnswer).toBe(0);
  });

  it('protects assistant sessions from anonymous and cross-parent access', async () => {
    const owner = await account('assistant-owner@test');
    const stranger = await account('assistant-stranger@test');
    const studentId = child(owner.user.id);
    const body = { studentId, userRole: 'parent', pageContext: 'weekly_report', subject: 'math' };
    const server = app.getHttpServer();
    await request(server).post('/api/ai/assistant/sessions').send(body).expect(401);
    await request(server).post('/api/ai/assistant/sessions').set('Authorization', `Bearer ${stranger.token}`).send(body).expect(403);
    const opened = await request(server).post('/api/ai/assistant/sessions').set('Authorization', `Bearer ${owner.token}`).send(body).expect(201);
    const url = `/api/ai/assistant/sessions/${opened.body.data.id}/messages`;
    await request(server).get(url).expect(401);
    await request(server).get(url).set('Authorization', `Bearer ${stranger.token}`).expect(404);
    await request(server).get(url).set('Authorization', `Bearer ${owner.token}`).expect(200);
  });

  it('cannot complete a three-question mission by answering the first question three times', async () => {
    const owner = await account('mission@test');
    const studentId = child(owner.user.id);
    for (const id of ['q1', 'q2', 'q3']) question(id);
    store.missions.push({ id: 'mission1', studentId, subject: 'math', missionType: 'practice', title: '任务',
      targetKnowledgePointIds: [], questionIds: ['q1', 'q2', 'q3'], estimatedMinutes: 10, status: 'in_progress', createdAt: new Date().toISOString(), studentSummary: '' });
    const server = app.getHttpServer();
    for (let attempt = 0; attempt < 3; attempt++) await request(server).post('/api/missions/mission1/answers')
      .set('Authorization', `Bearer ${owner.token}`).send({ itemId: 'q1', answer: '6', elapsedMs: 1000 }).expect(201);
    await request(server).post('/api/missions/mission1/complete').set('Authorization', `Bearer ${owner.token}`).send({}).expect(400);
    for (const id of ['q2', 'q3']) await request(server).post('/api/missions/mission1/answers')
      .set('Authorization', `Bearer ${owner.token}`).send({ itemId: id, answer: '6', elapsedMs: 1000 }).expect(201);
    const result = await request(server).post('/api/missions/mission1/complete').set('Authorization', `Bearer ${owner.token}`).send({}).expect(201);
    expect(result.body.data.totalCount).toBe(3);
    expect(result.body.data.correctCount).toBe(3);
  });
});
