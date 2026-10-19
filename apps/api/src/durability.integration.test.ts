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
  it('restores session, student, first answer and mission; failed requests leave no partial mutations', async () => {
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
      const mission = await request(app.getHttpServer()).get(`/api/missions/today?studentId=${studentId}&subject=math`)
        .set('Authorization', `Bearer ${token}`).expect(200);
      const missionId = mission.body.data.id;
      await request(app.getHttpServer()).post(`/api/missions/${missionId}/answers`).set('Authorization', `Bearer ${token}`)
        .send({ itemId: mission.body.data.questionIds[0], answer: '6', elapsedMs: 1000 }).expect(201);
      await request(app.getHttpServer()).post(`/api/missions/${missionId}/complete`).set('Authorization', `Bearer ${token}`).send({}).expect(400);
      await app.close();
      app = await start();
      await request(app.getHttpServer()).get(`/api/students/${studentId}/profile`).set('Authorization', `Bearer ${token}`).expect(200);
      const restored = await request(app.getHttpServer()).get(`/api/missions/today?studentId=${studentId}&subject=math`)
        .set('Authorization', `Bearer ${token}`).expect(200);
      expect(restored.body.data.id).toBe(missionId);
      expect(restored.body.data.status).not.toBe('completed');
      const evidence = await app.get<any>(InMemoryStoreService).transaction(() => {
        const store = app.get<any>(InMemoryStoreService);
        return { answers: store.missionAnswers.filter((item: any) => item.missionId === missionId), events: store.events };
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
  }, 15_000);
});
