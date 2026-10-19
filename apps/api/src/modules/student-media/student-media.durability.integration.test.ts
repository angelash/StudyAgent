import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('real SQLite media upload recovery and deletion outbox', () => {
  it('resumes a partially uploaded image across API restarts, restores the saved draft, and cleans bytes only after committed deletion', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-media-durable-'));
    const previous = Object.fromEntries(['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED'].map(key => [key, process.env[key]]));
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { StudentMediaService } = require('../../../dist/apps/api/src/modules/student-media/student-media.service.js');
    const { StudentMediaCleanupService } = require('../../../dist/apps/api/src/modules/student-media/student-media-cleanup.service.js');
    async function start() { const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); return app; }
    let app: any, token: string;
    const credential = 'durable-media-fixture';
    async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown) {
      let q = request(app.getHttpServer())[method]('/api' + path); if (token) q = q.set('Authorization', `Bearer ${token}`);
      if (body !== undefined) q = q.send(body as object); return (await q.expect(method === 'post' ? 201 : 200)).body.data;
    }
    try {
      app = await start(); token = (await call('post', '/auth/register', { principal: 'durable-media-parent', credential })).token;
      const child = (await call('post', '/students', { nickname: '媒体恢复样本', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile;
      const store = app.get(InMemoryStoreService);
      await store.transaction(() => {
        const imageIds = new Set(store.questionAnswerSchemas.filter((s: any) => s.mode === 'image_upload').map((s: any) => s.questionId));
        for (const item of store.measurementItems) if (item.atomId === 'core:math:rectanglecover' && !imageIds.has(item.questionId)) item.reviewStatus = 'draft';
      });
      await call('put', `/students/${child.id}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '通用原创基础',
        learnedAtomIds: ['core:math:rectanglecover'], currentAtomId: 'core:math:rectanglecover', minutesPerSession: 15 });
      const session = await call('post', '/diagnostics/sessions', { studentId: child.id, subject: 'math', intent: 'baseline', maxItems: 2, includePrerequisites: false });
      const item = session.items[0]; expect(item).toBeDefined();
      const bytes = await sharp(randomBytes(800 * 500 * 3), { raw: { width: 800, height: 500, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
      expect(bytes.length).toBeGreaterThan(1048576);
      const file = await call('post', '/learning/media', { kind: 'diagnostic', sessionId: session.id, itemId: item.id, requestKey: 'durable-media-upload', name: '作答.png', mediaType: 'image/png', size: bytes.length });
      async function put(index: number) { return request(app.getHttpServer()).put(`/api/learning/media/${file.id}/chunks/${index}`).set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/octet-stream').send(bytes.subarray(index * file.chunkSize, Math.min(bytes.length, (index + 1) * file.chunkSize))).expect(200); }
      await put(0); await app.close(); app = await start();
      const resumed = await call('get', `/learning/media/${file.id}`); expect(resumed.chunks).toHaveLength(1); expect(resumed.status).toBe('uploading');
      await put(0); for (let n = 1; n < Math.ceil(bytes.length / file.chunkSize); n++) await put(n);
      const ready = await call('post', `/learning/media/${file.id}/complete`, {}); expect(ready.status).toBe('ready');
      const answer = { questionId: item.questionId, mode: 'image_upload', response: { mediaIds: [file.id], description: '独立完成的面积图。' } };
      await call('patch', `/diagnostics/sessions/${session.id}/items/${item.id}/draft`, { answer });
      await app.close(); app = await start();
      const render = await call('get', `/diagnostics/sessions/${session.id}/items/${item.id}`); expect(render.draft).toEqual(answer);
      const submitted = await call('post', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id, answer, elapsedMs: 9000 }); expect(submitted.status).toBe('pending_review');
      const reopenedStore = app.get(InMemoryStoreService), media = app.get(StudentMediaService), actorId = (await call('get', '/auth/me')).id;
      await expect(reopenedStore.transaction(async () => {
        reopenedStore.studentMedia = [];
        await media.schedulePurge([file.id], actorId, 'must-rollback-media-deletion');
        throw new Error('simulated_transaction_failure');
      })).rejects.toThrow('simulated_transaction_failure');
      expect(await reopenedStore.tasks.find(actorId, 'student.media.purge', 'must-rollback-media-deletion')).toBeNull();
      expect(existsSync(media.path(file.id))).toBe(true);
      expect((await call('get', `/learning/media/${file.id}`)).status).toBe('ready');
      const preview = await call('get', `/privacy/students/${child.id}/deletion-preview`);
      await call('post', `/privacy/students/${child.id}/delete`, { credential, requestKey: 'durable-media-deletion', confirmation: preview.confirmation, fingerprint: preview.fingerprint });
      expect(existsSync(media.path(file.id))).toBe(true);
      await app.close(); app = await start();
      const worker = app.get(StudentMediaCleanupService); for (let n = 0; n < 10 && await worker.runNext(); n++) { /* Persisted outbox survives the restart. */ }
      expect(existsSync(join(directory, 'student-media', file.id))).toBe(false);
      expect(await worker.runNext()).toBe(false);
    } finally {
      await app?.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(directory, { recursive: true, force: true });
    }
  }, 90000);

  it('prevents a decoding request from recreating files after another request deletes the child', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-media-delete-race-'));
    const previous = Object.fromEntries(['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED'].map(key => [key, process.env[key]]));
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { StudentMediaCleanupService } = require('../../../dist/apps/api/src/modules/student-media/student-media-cleanup.service.js');
    const normalizer = require('../../../dist/apps/api/src/modules/student-media/media-normalization.js');
    let app: any, release!: () => void, begun!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { begun = resolve; });
    let spy: ReturnType<typeof vi.spyOn> | undefined;
    const credential = 'media-delete-race-secret'; let token: string;
    async function call(method: 'post' | 'get', path: string, body?: unknown) {
      let q = request(app.getHttpServer())[method]('/api' + path); if (token) q = q.set('Authorization', `Bearer ${token}`); if (body !== undefined) q = q.send(body as object);
      return (await q.expect(method === 'post' ? 201 : 200)).body.data;
    }
    try {
      app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
      const user = await call('post', '/auth/register', { principal: 'media-race-parent', credential }); token = user.token;
      const child = (await call('post', '/students', { nickname: '并发删除样本', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile;
      const store = app.get(InMemoryStoreService), bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#eee' } }).png().toBuffer();
      await store.transaction(() => {
        const schema = { questionId: 'race-question', mode: 'image_upload', responseShape: { mediaPolicy: 'student-media-v1' }, validationRules: {}, gradingConfig: {} };
        store.diagnosticSessions.push({ id: 'race-session', studentId: child.id, status: 'in_progress', questionSnapshots: [{ id: 'race-question', answerSchema: schema }], itemSnapshots: [{ id: 'race-item', questionId: 'race-question' }] });
      });
      const file = await call('post', '/learning/media', { kind: 'diagnostic', sessionId: 'race-session', itemId: 'race-item', requestKey: 'media-race-file', name: '回答.png', size: bytes.length, mediaType: 'image/png' });
      await request(app.getHttpServer()).put(`/api/learning/media/${file.id}/chunks/0`).set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/octet-stream').send(bytes).expect(200);
      const original = normalizer.normalizeImage;
      spy = vi.spyOn(normalizer, 'normalizeImage').mockImplementation(async (...args: unknown[]) => { begun(); await gate; return original(...args); });
      const completing = request(app.getHttpServer()).post(`/api/learning/media/${file.id}/complete`).set('Authorization', `Bearer ${token}`).send({}).then(response => response);
      await started;
      const preview = await call('get', `/privacy/students/${child.id}/deletion-preview`);
      await call('post', `/privacy/students/${child.id}/delete`, { credential, requestKey: 'media-race-delete', confirmation: preview.confirmation, fingerprint: preview.fingerprint });
      const worker = app.get(StudentMediaCleanupService); await worker.runNext();
      release(); expect((await completing).status).toBe(409);
      expect(existsSync(join(directory, 'student-media', file.id))).toBe(false);
      expect(existsSync(join(directory, 'student-media', '.erased', file.id))).toBe(true);
    } finally {
      release(); spy?.mockRestore(); await app?.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(directory, { recursive: true, force: true });
    }
  }, 45000);
});
