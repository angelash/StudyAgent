import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('resumable managed uploads and import task API', () => {
  let app: any, store: any, auth: any, admin: any, other: any, parent: any;
  const dir = mkdtempSync(join(tmpdir(), 'study-upload-'));
  const previousDir = process.env.STUDY_DATA_DIR;
  const bytes = Buffer.from('%PDF-1.4\nManaged upload fixture. Not parsed in this API suite.\n%%EOF');
  beforeAll(async () => {
    process.env.STUDY_DATA_DIR = dir;
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService);
    admin = await auth.register({ principal: 'upload-author', credential: 'managed-upload-123' });
    other = await auth.register({ principal: 'upload-other', credential: 'managed-upload-123' });
    parent = await auth.register({ principal: 'upload-parent', credential: 'managed-upload-123' });
    for (const actor of [admin, other]) store.users.find((u: any) => u.id === actor.user.id).role = 'admin';
  });
  afterAll(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); if (previousDir === undefined) delete process.env.STUDY_DATA_DIR; else process.env.STUDY_DATA_DIR = previousDir; });
  async function call(method: 'get' | 'post' | 'put', path: string, body?: unknown, actor = admin, expected?: number) {
    let query = request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${actor.token}`);
    if (Buffer.isBuffer(body)) query = query.set('Content-Type', 'application/octet-stream').send(body);
    else if (body !== undefined) query = query.send(body as object);
    const response = await query.expect(expected ?? (method === 'post' ? 201 : 200)); return response.body.data;
  }
  const start = (key: string, size = bytes.length) => call('post', '/admin/import-files', { name: '数学练习.pdf', mediaType: 'application/pdf', size, requestKey: key });
  async function ready(key: string) { const file = await start(key); await call('put', `/admin/import-files/${file.id}/chunks/0`, bytes); return call('post', `/admin/import-files/${file.id}/complete`, {}); }

  it('validates metadata and roles before accepting a file', async () => {
    await call('post', '/admin/import-files', { name: 'a.pdf', mediaType: 'application/pdf', size: 10, requestKey: 'parent-denied' }, parent, 403);
    await call('post', '/admin/import-files', { name: 'a.exe', mediaType: 'application/pdf', size: 10, requestKey: 'wrong-extension' }, admin, 400);
    await call('post', '/admin/import-files', { name: 'a.pdf', mediaType: 'application/pdf', size: 0, requestKey: 'empty-upload' }, admin, 400);
    await call('put', '/admin/import-files/missing/chunks/0', Buffer.alloc(4 * 1024 * 1024 + 1), admin, 413);
    await call('get', '/admin/processing/tasks', undefined, parent, 403);
    await call('get', '/admin/processing/tasks?state=arbitrary', undefined, admin, 400);
  });

  it('resumes immutable chunks and rejects different bytes or incomplete completion', async () => {
    const file = await start('resume-upload');
    expect((await start('resume-upload')).id).toBe(file.id);
    await call('post', `/admin/import-files/${file.id}/complete`, {}, admin, 400);
    await call('put', `/admin/import-files/${file.id}/chunks/0`, bytes.subarray(1), admin, 400);
    await call('put', `/admin/import-files/${file.id}/chunks/1`, bytes, admin, 400);
    await call('put', `/admin/import-files/${file.id}/chunks/0`, bytes);
    expect((await call('get', `/admin/import-files/${file.id}`)).chunks).toHaveLength(1);
    expect((await call('put', `/admin/import-files/${file.id}/chunks/0`, bytes)).chunks).toHaveLength(1);
    const changed = Buffer.from(bytes); changed[10] ^= 1;
    await call('put', `/admin/import-files/${file.id}/chunks/0`, changed, admin, 409);
    const completed = await call('post', `/admin/import-files/${file.id}/complete`, {});
    expect(completed.status).toBe('ready'); expect(completed.sha256).toMatch(/^[a-f0-9]{64}$/);
    const response = await request(app.getHttpServer()).get(`/api/admin/import-files/${file.id}/content`).set('Authorization', `Bearer ${admin.token}`).set('Range', 'bytes=0-4').expect(206);
    expect(response.headers['content-range']).toBe(`bytes 0-4/${bytes.length}`);
    await request(app.getHttpServer()).get(`/api/admin/import-files/${file.id}/content`).set('Authorization', `Bearer ${admin.token}`).set('Range', 'bytes=-0').expect(416);
  });

  it('enforces ownership and file signatures, and never allows a declared PDF to hide arbitrary bytes', async () => {
    const file = await start('ownership-upload');
    await call('get', `/admin/import-files/${file.id}`, undefined, other, 403);
    await call('put', `/admin/import-files/${file.id}/chunks/0`, bytes, other, 403);
    const fake = Buffer.alloc(bytes.length, 'x'); await call('put', `/admin/import-files/${file.id}/chunks/0`, fake);
    await call('post', `/admin/import-files/${file.id}/complete`, {}, admin, 400);
    expect((await call('get', `/admin/import-files/${file.id}`)).status).toBe('uploading');
  });

  it('queues quickly, deduplicates requests, keeps inputs internal and supports versioned cancel/retry', async () => {
    const file = await ready('queued-upload');
    const input = { importType: 'textbook_pdf', subject: 'math', fileIds: [file.id], requestKey: 'queue-import-one', sourcePolicy: { sourceType: 'internal_textbook', licenseClass: 'C_PUBLIC_REFERENCE_ONLY', licenseName: null } };
    const job = await call('post', '/admin/question-import-jobs', input);
    expect(job.status).toBe('pending'); expect(job.recordCount).toBe(0); expect(job.taskId).toBeTruthy();
    expect((await call('post', '/admin/question-import-jobs', input)).id).toBe(job.id);
    await call('post', '/admin/question-import-jobs', { ...input, subject: 'chinese' }, admin, 409);
    const task = await call('get', `/admin/processing/tasks/${job.taskId}`);
    expect(task.state).toBe('queued'); expect(task.payload).toBeUndefined(); expect(task.leaseToken).toBeUndefined();
    const cancelled = await call('post', `/admin/processing/tasks/${job.taskId}/cancel`, { expectedVersion: task.version });
    expect(cancelled.state).toBe('cancelled');
    await call('post', `/admin/processing/tasks/${job.taskId}/retry`, { expectedVersion: task.version }, admin, 409);
    const retried = await call('post', `/admin/processing/tasks/${job.taskId}/retry`, { expectedVersion: cancelled.version });
    expect(retried.state).toBe('queued'); expect(retried.generation).toBe(2);
    expect((await call('get', `/admin/question-import-jobs/${job.id}`)).status).toBe('pending');
    await call('post', '/admin/processing/handwriting-preview', { fileId: file.id, requestKey: 'pdf-not-image' }, admin, 400);
  });

  it('preserves extraction evidence when correcting candidates and keeps source permission separate from candidate review', async () => {
    const file = await ready('candidate-file');
    const input = { importType: 'textbook_pdf', subject: 'math', fileIds: [file.id], requestKey: 'candidate-import', sourcePolicy: { sourceType: 'public_reference', licenseClass: 'C_PUBLIC_REFERENCE_ONLY', licenseName: null } };
    const job = await call('post', '/admin/question-import-jobs', input);
    const id = 'review-candidate';
    store.questionImportRecords.push({ id, jobId: job.id, subject: 'math', sourceName: file.name, sourcePath: `upload:${file.id}`, pageNumber: 1, candidateIndexOnPage: 1,
      splitMode: 'page', sectionLabel: null, qualityLevel: 'low', qualityFlags: ['ocr_requires_visual_review'], excerpt: 'OCR raw content', candidateStem: 'OCR uncertain heading',
      previewImageDataUrl: '/api/admin/processing/artifacts/original-page', detectionReason: 'test fixture', aiSuggestion: { suggestedStem: 'Do not silently prefer AI stem', suggestedSectionLabel: null, suggestedAnswerMode: null, reviewAdvice: 'review', actionablePoints: [], confidenceLevel: 'low', reviewRequired: true },
      aiSuggestedAt: null, reviewStatus: 'pending', reviewComment: null, candidateQuestionId: null, createdAt: new Date().toISOString(), reviewedAt: null, fileId: file.id, reviewVersion: 0,
      pageEvidence: { text: 'immutable original page', imageUrl: '/api/admin/processing/artifacts/original-page' } });
    const path = `/admin/question-import-records/${id}/review`;
    const body = { decision: 'approved', comment: '已逐项对照原页，纠正题干和识别错误。', correctedStem: 'Reviewed heading from original', correctedExcerpt: 'Reviewed original context', createDraft: true };
    await call('post', path, body, admin, 400);
    const reviewed = await call('post', path, { ...body, expectedVersion: 0 });
    expect(reviewed.record.reviewVersion).toBe(1); expect(reviewed.record.originalCandidate.excerpt).toBe('OCR raw content');
    expect(reviewed.record.pageEvidence.text).toBe('immutable original page');
    expect(reviewed.question.stem).toBe('Reviewed heading from original'); expect(reviewed.question.status).toBe('draft');
    const source = store.questionSources.find((s: any) => s.questionId === reviewed.question.id);
    expect(source.reviewStatus).toBe('pending'); expect(source.licenseClass).toBe('C_PUBLIC_REFERENCE_ONLY');
    const document = store.questionDocuments.find((d: any) => d.questionId === reviewed.question.id);
    expect(document.blocks.some((b: any) => b.type === 'image' && b.url.includes('/admin/'))).toBe(false);
    await call('post', path, { decision: 'rejected', comment: '重复旧版本不可覆盖', expectedVersion: 0 }, admin, 409);
    expect((await call('get', `/admin/question-import-jobs/${job.id}/candidates?state=approved`)).total).toBe(1);
  });
});
