import 'reflect-metadata';
import { createRequire } from 'node:module';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

const require = createRequire(__filename);
describe('capability HTTP authorization and read-only projection', () => {
  let app: any, store: any, service: any, admin: any, parent: any, probes = 0;
  beforeAll(async () => {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    const { OperationsCapabilitiesService } = require('../../../dist/apps/api/src/modules/operations/operations-capabilities.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); const auth = app.get(AuthService);
    admin = await store.transaction(() => auth.register({ principal: 'capability-http-admin', credential: 'Synthetic-capability-password' }));
    parent = await store.transaction(() => auth.register({ principal: 'capability-http-parent', credential: 'Synthetic-capability-password' }));
    await store.transaction(() => { store.find('users', { id: admin.user.id }).role = 'admin'; });
    service = app.get(OperationsCapabilitiesService);
    service.check = async () => { probes++; return { at: new Date().toISOString(), cacheSeconds: 30, scope: 'synthetic local diagnostics',
      checks: [{ id: 'storage', title: '业务存储', state: 'ready', optional: false, message: 'synthetic', repair: null }] }; };
  });
  afterAll(async () => { await app?.close(); });
  it('reuses the classroom and paper export providers from their owning modules', () => {
    const { LearningModule } = require('../../../dist/apps/api/src/modules/learning/learning.module.js');
    const { LibraryModule } = require('../../../dist/apps/api/src/modules/library/library.module.js');
    const { ClassroomImageService } = require('../../../dist/apps/api/src/modules/ai/classroom-image.service.js');
    const { PaperExportRuntimeService } = require('../../../dist/apps/api/src/modules/library/paper-export-runtime.service.js');
    const images = app.select(LearningModule).get(ClassroomImageService, { strict: true });
    const paper = app.select(LibraryModule).get(PaperExportRuntimeService, { strict: true });
    expect(service.images).toBe(images);
    expect(service.paper).toBe(paper);
    expect(app.get(ClassroomImageService)).toBe(images);
    expect(app.get(PaperExportRuntimeService)).toBe(paper);
  });
  it('rejects anonymous and parent requests without starting a diagnostic process', async () => {
    await request(app.getHttpServer()).get('/api/admin/operations/capabilities').expect(401);
    await request(app.getHttpServer()).get('/api/admin/operations/capabilities').set('Authorization', 'Bearer ' + parent.token).expect(403);
    expect(probes).toBe(0);
  });
  it('returns the admin report while preserving learning, course and task records', async () => {
    const names = ['diagnosticResponses', 'practiceAttempts', 'classroomSessions', 'studioCourses', 'events'];
    const before = await store.requestContext(() => names.map(name => JSON.stringify(store.inspect(name))));
    const tasks = await store.tasks.summary();
    const result = (await request(app.getHttpServer()).get('/api/admin/operations/capabilities').set('Authorization', 'Bearer ' + admin.token).expect(200)).body.data;
    expect(result.checks[0]).toMatchObject({ id: 'storage', state: 'ready' }); expect(probes).toBe(1);
    expect(await store.requestContext(() => names.map(name => JSON.stringify(store.inspect(name))))).toEqual(before);
    expect(await store.tasks.summary()).toEqual(tasks);
  });
});
