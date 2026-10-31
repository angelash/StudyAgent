import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { actualPdf, actualDocx, preparedLibrary, publishedSources, sample } from './paper-library-fixture.spec';
import { paperExportDocumentBytes, PAPER_EXPORT_TASK_KIND } from './paper-export-record';
import { reservePaperExportFile, recordPaperExportRendered, publishPaperExportFile } from './paper-export-file-record';

export const paperLibraryCredential = 'synthetic-paper-privacy-credential'; const credential = paperLibraryCredential, sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
export async function paperLibraryApplication<T>(test: (h: any) => Promise<T>, options: { connectionString?: string } = {}) {
  const qa = resolve(process.cwd(), '../../data/qa/paper-library-http-tests'); mkdirSync(qa, { recursive: true }); const directory = mkdtempSync(join(qa, 'http-')), data = join(directory, 'source');
  const keys = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'DATABASE_URL'], previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: options.connectionString ? 'postgres' : 'sqlite', STUDY_DATA_DIR: data, STUDY_WORKER_ENABLED: 'false', ...(options.connectionString ? { DATABASE_URL: options.connectionString } : {}) });
  const { AppModule } = require('../../../dist/apps/api/src/app.module.js'), { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
  const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); const store = app.get(InMemoryStoreService);
  async function api(token: string | null, method: 'get' | 'post', path: string, body?: unknown, status = method === 'post' ? 201 : 200) {
    let call = request(app.getHttpServer())[method]('/api' + path); if (token) call = call.set('Authorization', 'Bearer ' + token); if (body !== undefined) call = call.send(body as object);
    return (await call.expect(status)).body.data;
  }
  const register = (name: string) => api(null, 'post', '/auth/register', { principal: name, credential });
  async function prepare(actorId: string, studentId: string | null = null, guardianId: string | null = null, suffix = 'http-first', format: 'pdf' | 'docx' = 'pdf') {
    let prepared: ReturnType<typeof preparedLibrary>;
    await store.transaction(() => {
      const actor = store.find('users', { id: actorId }), access = studentId && store.find('studentLearningAccess', { studentId, userId: actorId, status: 'enabled' });
      prepared = preparedLibrary(actorId, { actorRole: actor.role, actorVersion: actor.version ?? 1,
        learningAccess: studentId ? { studentId, guardianId: guardianId!, accessVersion: access.version } : null }, studentId, suffix, format);
      for (const publication of publishedSources(prepared.items)) if (!store.find('paperPublications', { paperId: publication.paperId })) store.append('paperPublications', publication);
      for (const [collection, rows] of Object.entries({ paperSelectionLists: [prepared.selection.list], paperSelectionCommands: [prepared.selection.command], paperExports: [prepared.record], paperExportCommands: [prepared.command], paperSourceExposures: prepared.exposures }))
        for (const row of rows) store.append(collection, row);
      return Promise.all(prepared.tasks.map(task => store.enqueueTask(task)));
    }); return prepared!;
  }
  async function publish(prepared: ReturnType<typeof preparedLibrary>) {
    const task = await store.tasks.claim([PAPER_EXPORT_TASK_KIND], 120000); expect(task.id).toBe(prepared.tasks[0].id);
    const reserved = reservePaperExportFile(prepared.record, task, new Date().toISOString());
    await store.transaction(() => store.append('paperExportFiles', reserved.file), reserved.fence);
    await require('../../../dist/apps/api/src/infrastructure/studio-file-coordination.js').registerPaperExportWriterProtocol(data, reserved.file.workspace.split('/')[1]);
    const workspace = join(data, reserved.file.workspace); mkdirSync(join(workspace, 'artifacts-practice'), { recursive: true });
    const format = prepared.record.slots[0].format, original = format === 'pdf' ? actualPdf : actualDocx;
    writeFileSync(join(workspace, 'input.json'), paperExportDocumentBytes(prepared.document)); copyFileSync(join(sample, 'final/practice.' + format), join(workspace, 'artifacts-practice/practice.' + format));
    const output = { book: 'practice' as const, format, sha256: original.sha256, bytes: original.bytes, pageCount: original.pageCount, sourceMapHash: digest(original.sourceMap) },
      rendered = recordPaperExportRendered(prepared.record, reserved.file, await store.tasks.get(task.id), output, original.sourceMap, new Date().toISOString());
    await store.transaction(() => Object.assign(store.find('paperExportFiles', { id: rendered.file.id }), rendered.file), rendered.fence);
    const published = publishPaperExportFile(prepared.record, rendered.file, await store.tasks.get(task.id), original.sourceMap, new Date().toISOString());
    await store.transaction(() => { Object.assign(store.find('paperExports', { id: prepared.record.id }), published.record); Object.assign(store.find('paperExportFiles', { id: published.file.id }), published.file); }, published.fence);
    return published;
  }
  const cold = async () => { const db = new DomainDatabase(options.connectionString ?? join(data, 'study-agent.sqlite3')); await db.open(); try { return await db.read(); } finally { await db.close(); } };
  try { return await test({ directory, data, app, store, api, register, prepare, publish, cold, connectionString: options.connectionString }); }
  finally { await app.close(); for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
}
