import 'reflect-metadata';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';

const require = createRequire(__filename);

describe('real API persistence across application restarts', () => {
  it('restores session, student, immutable assessment and practice draft; failed requests leave no partial mutations', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-restart-'));
    const previous = { NODE_ENV: process.env.NODE_ENV, STUDY_STORAGE: process.env.STUDY_STORAGE, STUDY_DATA_DIR: process.env.STUDY_DATA_DIR };
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory });
    const { AppModule } = require('../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    async function start() {
      const app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix('api');
      await app.init();
      return app;
    }
    let app = await start();
    try {
      expect(app.get<any>(InMemoryStoreService).persistence.durable).toBe(true);
      const created = await request(app.getHttpServer()).post('/api/auth/register')
        .send({ principal: 'restart@test', credential: 'restart-secret-123' }).expect(201);
      const token = created.body.data.token;
      const profile = await request(app.getHttpServer()).post('/api/students').set('Authorization', `Bearer ${token}`).send({
        nickname: '小禾', grade: 3, preferredSessionMinutes: 15,
        defaultVersionMap: { math: 'math', chinese: 'chinese', english: 'english' },
      }).expect(201);
      const studentId = profile.body.data.profile.id;
      const store = app.get<any>(InMemoryStoreService);
      const atomId = await store.transaction(() => store.measurementItems.find((item: any) =>
        store.knowledgeAtoms.some((atom: any) => atom.id === item.atomId && atom.subject === 'math' && atom.grade <= 3) &&
        store.questionAnswerSchemas.some((schema: any) => schema.questionId === item.questionId && schema.mode === 'numeric_blank')).atomId);
      async function call(method: 'post' | 'put' | 'get' | 'patch', path: string, body?: unknown, status?: number) {
        const query = request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${token}`);
        if (body !== undefined) query.send(body as object);
        return (await query.expect(status ?? (method === 'post' ? 201 : 200))).body.data;
      }
      await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
        textbookVersion: '通用基础', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
      const baseline = await call('post', '/diagnostics/sessions', { studentId, subject: 'math', maxItems: 2, intent: 'baseline' });
      for (const item of baseline.items) await call('post', `/diagnostics/sessions/${baseline.id}/responses`, { itemId: item.id, disposition: 'dont_know', elapsedMs: 1000 });
      await call('post', `/diagnostics/sessions/${baseline.id}/complete`, {});
      const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 15, useAi: false });
      await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active' });
      const activity = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {});
      expect(activity.questions.length).toBeGreaterThan(1);
      await call('post', `/learning/practice/${activity.id}/responses`, { questionId: activity.questions[0].id, requestKey: 'first', disposition: 'skip', elapsedMs: 1000 });
      await call('patch', `/learning/practice/${activity.id}/questions/${activity.questions[1].id}/draft`, { answer: { value: '正在思考' } });
      await call('post', `/learning/practice/${activity.id}/complete`, {}, 400);
      await app.close();
      app = await start();
      await request(app.getHttpServer()).get(`/api/students/${studentId}/profile`).set('Authorization', `Bearer ${token}`).expect(200);
      const restored = await call('get', `/learning/practice/${activity.id}`);
      expect(restored.id).toBe(activity.id); expect(restored.status).toBe('in_progress');
      expect(restored.summary.attempted).toBe(1);
      const draft = await call('get', `/learning/practice/${activity.id}/questions/${activity.questions[1].id}`);
      expect(draft.draft.answer).toEqual({ value: '正在思考' });
      expect((await call('get', `/diagnostics/sessions/${baseline.id}/report`)).evidence).toHaveLength(baseline.items.length);
      const evidence = await app.get<any>(InMemoryStoreService).transaction(() => {
        const restoredStore = app.get<any>(InMemoryStoreService);
        return { answers: restoredStore.practiceAttempts.filter((item: any) => item.sessionId === activity.id), events: restoredStore.events };
      });
      expect(evidence.answers).toHaveLength(1);
      expect(evidence.events.some((item: any) => item.eventName === 'student.created')).toBe(true);
    } finally {
      await app.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  }, 25_000);
});
