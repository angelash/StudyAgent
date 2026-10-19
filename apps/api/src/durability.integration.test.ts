import 'reflect-metadata';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';

const require = createRequire(__filename);

describe('real API persistence across application restarts', () => {
  it('restores session, student, immutable assessment and practice draft; failed requests leave no partial mutations', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-restart-'));
    const previous = { NODE_ENV: process.env.NODE_ENV, STUDY_STORAGE: process.env.STUDY_STORAGE, STUDY_DATA_DIR: process.env.STUDY_DATA_DIR };
    const sourceDirectory = join(directory, 'source');
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: sourceDirectory });
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
      let token = created.body.data.token;
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
      await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision });
      const activity = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {});
      expect(activity.questions.length).toBeGreaterThan(1);
      await call('post', `/learning/practice/${activity.id}/responses`, { questionId: activity.questions[0].id, requestKey: 'first', disposition: 'skip', elapsedMs: 1000 });
      await call('patch', `/learning/practice/${activity.id}/questions/${activity.questions[1].id}/draft`, { answer: { value: '正在思考' } });
      await call('post', `/learning/practice/${activity.id}/complete`, {}, 400);
      await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'restart-learning-access', reason: '家长开启独立学习，检查重启后仍可恢复已保存的学习记录。' });
      const learningCode = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: 1, requestKey: 'restart-learning-code' });
      const learner = (await request(app.getHttpServer()).post('/api/auth/learning-code').send({ code: learningCode.code }).expect(201)).body.data;
      const assistantInput = { userRole: 'student', studentId, subject: 'math', pageContext: 'mission', contextRefType: 'practice',
        contextRefId: activity.id, contextItemId: activity.questions[1].id };
      const assistant = await call('post', '/ai/assistant/sessions', assistantInput);
      await call('post', `/ai/assistant/sessions/${assistant.id}/messages`, { message: '我已经写下草稿，下一步怎样检查条件？', requestKey: 'restart-assistant-question' });
      await app.close();
      app = await start();
      await request(app.getHttpServer()).get(`/api/students/${studentId}/profile`).set('Authorization', `Bearer ${token}`).expect(200);
      const restored = await call('get', `/learning/practice/${activity.id}`);
      expect(restored.id).toBe(activity.id); expect(restored.status).toBe('in_progress');
      expect(restored.summary.attempted).toBe(1);
      const learningMe = await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${learner.token}`).expect(200);
      expect(learningMe.body.data.studentId).toBe(studentId);
      const resumedAssistant = await call('post', '/ai/assistant/sessions', assistantInput);
      expect(resumedAssistant.id).toBe(assistant.id);
      const assistantHistory = await call('get', `/ai/assistant/sessions/${assistant.id}/messages`);
      expect(assistantHistory).toHaveLength(2); expect(assistantHistory[1].assistanceRecorded).toBe(true);
      await call('post', `/ai/assistant/sessions/${assistant.id}/messages`, { message: '我已经写下草稿，下一步怎样检查条件？', requestKey: 'restart-assistant-question' });
      expect(await call('get', `/ai/assistant/sessions/${assistant.id}/messages`)).toHaveLength(2);
      await request(app.getHttpServer()).get(`/api/learning/practice/${activity.id}`).set('Authorization', `Bearer ${learner.token}`).expect(200);
      await request(app.getHttpServer()).get('/api/learning/overview').set('Authorization', `Bearer ${learner.token}`).expect(403);
      const draft = await call('get', `/learning/practice/${activity.id}/questions/${activity.questions[1].id}`);
      expect(draft.draft.answer).toEqual({ value: '正在思考' });
      expect((await call('get', `/diagnostics/sessions/${baseline.id}/report`)).evidence).toHaveLength(baseline.items.length);
      const evidence = await app.get<any>(InMemoryStoreService).transaction(() => {
        const restoredStore = app.get<any>(InMemoryStoreService);
        return { answers: restoredStore.practiceAttempts.filter((item: any) => item.sessionId === activity.id), events: restoredStore.events };
      });
      expect(evidence.answers).toHaveLength(1);
      expect(evidence.events.some((item: any) => item.eventName === 'student.created')).toBe(true);
      await app.close();
      const { createBundle, restoreBundle } = require(resolve(__dirname, '../../../scripts/operations/backup.cjs'));
      const bundle = join(directory, 'bundle'), restoredDirectory = join(directory, 'restored');
      await createBundle({ dataDir: sourceDirectory, destination: bundle });
      const recovered = await restoreBundle({ bundle, destination: restoredDirectory });
      expect(recovered.revokedSessions).toBeGreaterThanOrEqual(2);
      process.env.STUDY_DATA_DIR = restoredDirectory;
      const marker = join(restoredDirectory, '.study-restore-incomplete'); writeFileSync(marker, 'simulated interrupted restore');
      await expect(new InMemoryStoreService().onModuleInit()).rejects.toThrow('restoration is incomplete');
      unlinkSync(marker); app = await start();
      await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
      await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${learner.token}`).expect(401);
      const signedIn = await request(app.getHttpServer()).post('/api/auth/login').send({ principal: 'restart@test', credential: 'restart-secret-123' }).expect(201);
      token = signedIn.body.data.token;
      const recoveredActivity = await call('get', `/learning/practice/${activity.id}`);
      expect(recoveredActivity.summary.attempted).toBe(1);
      expect((await call('get', `/learning/practice/${activity.id}/questions/${activity.questions[1].id}`)).draft.answer).toEqual({ value: '正在思考' });
      expect((await call('get', `/diagnostics/sessions/${baseline.id}/report`)).evidence).toHaveLength(baseline.items.length);
      expect(await call('get', `/ai/assistant/sessions/${assistant.id}/messages`)).toHaveLength(2);
    } finally {
      await app.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  }, 25_000);
});
