import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';

describe.sequential('actual old child classroom, chemistry maintenance ancestry and native recovery', () => {
  const root = resolve(process.cwd(), '../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
  const folder = mkdtempSync(join(qa, 'rhist-')), configured = process.env.STUDY_TEST_RETENTION_POSTGRES_URL;
  const driver = configured ? 'postgres' : 'sqlite', databases: string[] = [], source = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  const operation = (name: string) => require(join(root, 'scripts/operations/' + name + '.cjs'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'DATABASE_URL', 'XIAOJIU_CHAT_ENABLED'];
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any, store: any, admin: Pool | undefined, directory = join(folder, 'initial'), url = '', parent: any, learner: any, child: any;
  let course: any, classroom: any, legacy: any, original: any, originalEvents: any;
  async function newDatabase() {
    if (!configured) return '';
    const target = new URL(configured); expect(target.hostname).toBe('127.0.0.1'); expect(target.port).toBe(process.env.CI === 'true' ? '5432' : '15439'); expect(target.pathname).toBe('/study_agent_qa');
    const control = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL!); expect(control.hostname).toBe(target.hostname); expect(control.port).toBe(target.port);
    admin ??= new Pool({ connectionString: control.toString() }); expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
    const name = 'study_qa_history_' + randomUUID().replaceAll('-', ''); databases.push(name);
    await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); target.pathname = '/' + name; return target.toString();
  }
  async function boot() {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: driver, STUDY_DATA_DIR: directory, DATABASE_URL: url,
      STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    app = await NestFactory.create(source('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(source('infrastructure/in-memory-store.service').InMemoryStoreService);
  }
  async function call(method: 'get' | 'post' | 'patch', path: string, body?: unknown, actor = parent) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor?.token) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect({ path, status: response.status, error: response.body.error }).toMatchObject({ path, status: method === 'post' ? 201 : 200 }); return response.body.data;
  }
  const read = (collection: string, where: any) => store.requestContext(() => structuredClone(store.select(collection, where)));
  async function authenticateAfterRestore() {
    parent = { ...parent, ...await call('post', '/auth/login', { principal: parent.principal, credential: parent.credential }, null) };
    const access = (await read('studentLearningAccess', { studentId: child.id }))[0];
    const code = await call('post', '/students/' + child.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    learner = await call('post', '/auth/learning-code', { code: code.code }, null);
  }
  async function reveal(session: any) {
    const step = session.lesson.steps[0], unit = session.presentation.tracks[step.id].units[0];
    return call('patch', '/learning/classroom/sessions/' + session.id, { expectedRevision: session.revision, cursor: 0, revealed: 1,
      sentenceCursor: 0, presentationVersion: session.presentation.version, unitId: unit.id }, learner);
  }
  beforeAll(async () => {
    url = await newDatabase(); await boot();
    const principal = 'history-' + randomUUID() + '@test', credential = 'history-synthetic-only-2026';
    parent = { ...await call('post', '/auth/register', { principal, credential }, null), principal, credential };
    child = (await call('post', '/students', { nickname: '课程升级工程合成档案', grade: 9, preferredSessionMinutes: 25,
      defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    await store.transaction(() => {
      const atoms = source('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum().map((row: any) => row.atom);
      for (const atom of atoms) store.append('knowledgeAtoms', atom);
      course = source('modules/learning/chemistry-course').buildChemistryCourse(child.id, atoms);
      delete course.teachingVersion; course.fingerprint = source('modules/learning/chemistry-course').chemistryCourseFingerprint(course);
      store.append('studioCourses', course);
    });
    const access = await call('post', '/students/' + child.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '核查真实升级路径中的孩子本人课堂。' });
    const code = await call('post', '/students/' + child.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    const lessons = course.units.flatMap((unit: any) => unit.lessons).filter((row: any) => row.kind === 'learn');
    classroom = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: lessons[0].id }, learner);
    legacy = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: lessons[1].id }, learner);
    await store.transaction(() => { const row = store.find('classroomSessions', { id: legacy.id }); delete row.retentionContext; delete row.retentionDisplays; });
    await reveal(classroom); original = (await read('classroomSessions', { id: classroom.id }))[0]; originalEvents = await read('retentionExposureEvents', { studentId: child.id });
    expect(original.retentionContext.targets).toHaveLength(1); expect(originalEvents).toHaveLength(1);
    await source('modules/learning/chemistry-tutorial-revision').reviseChemistryTutorial(store, course.id, course.fingerprint, true);
  }, 180000);
  afterAll(async () => {
    await app?.close();
    if (admin) { for (const name of databases) { if (!/^study_qa_history_[a-f0-9]{32}$/.test(name)) throw Error('Unsafe history QA database'); await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)'); } await admin.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (!resolve(folder).startsWith(resolve(qa) + sep)) throw Error('Unsafe history QA cleanup'); rmSync(folder, { recursive: true, force: true });
  });
  it('backs up and cold restores the actual upgraded course without relabelling or losing its old child displays', async () => {
    const bundle = join(folder, 'native'), destination = join(folder, 'restored');
    if (driver === 'sqlite') await operation('backup').createBundle({ dataDir: directory, destination: bundle });
    else await operation('postgres-backup').createPostgresBundle({ dataDir: directory, destination: bundle, connectionString: url, pgBin: process.env.STUDY_TEST_PG_BIN });
    const restoredUrl = await newDatabase();
    if (driver === 'sqlite') await operation('backup').restoreBundle({ bundle, destination });
    else await operation('postgres-backup').restorePostgresBundle({ bundle, destination, connectionString: restoredUrl, pgBin: process.env.STUDY_TEST_PG_BIN });
    await app.close(); directory = destination; url = restoredUrl; await boot(); await authenticateAfterRestore();
    expect((await read('classroomSessions', { id: classroom.id }))[0]).toEqual(original);
    expect(await read('retentionExposureEvents', { studentId: child.id })).toEqual(originalEvents);
    expect((await call('get', '/learning/classroom/sessions/' + classroom.id, undefined, learner)).contentStatus).toBe('archived');
  });
  it('prepares an actual untouched legacy classroom using the exact old lesson from the retained upgrade audit', async () => {
    const current = await call('get', '/learning/classroom/sessions/' + legacy.id, undefined, learner);
    expect(current.contentStatus).toBe('archived'); await reveal(current);
    const row = (await read('classroomSessions', { id: legacy.id }))[0];
    expect(row.retentionContext.targets).toHaveLength(1); expect(row.retentionContext.unmappedTarget).toBe(false);
    expect(row.contentFingerprint).toBe(legacy.contentFingerprint);
    expect((await read('retentionExposureEvents', { studentId: child.id })).find((event: any) => event.sourceId === legacy.id)?.atomId).toBe(row.retentionContext.targets[0].atomId);
    // A second real boot validates the newly captured legacy provision too.
    await app.close(); await boot(); expect((await read('classroomSessions', { id: legacy.id }))[0]).toEqual(row);
  });
  it('rejects missing, disconnected and cross-child upgrade origins instead of trusting recalculated saved contexts', async () => {
    let rows: any[];
    if (driver === 'sqlite') { const db = new DatabaseSync(join(directory, 'study-agent.sqlite3'), { readOnly: true }); try { rows = db.prepare(operation('assistant-practice-integrity').sql).all(); } finally { db.close(); } }
    else { const pool = new Pool({ connectionString: url }); try { rows = (await pool.query(operation('assistant-practice-integrity').sql)).rows; } finally { await pool.end(); } }
    const assert = source('modules/diagnostics/retention-integrity').assertRetentionNativeRows;
    expect(() => assert(rows)).not.toThrow();
    const decode = () => rows.map(row => ({ ...row, body: typeof row.body === 'string' ? JSON.parse(row.body) : structuredClone(row.body) }));
    const absent = decode().filter(row => row.collection !== 'events'); expect(() => assert(absent)).toThrow('retention_saved_integrity_failed');
    for (const field of ['replacementFingerprint', 'previousChild', 'eventName']) {
      const changed = decode(), event = changed.find(row => row.collection === 'events' && row.body.eventName === 'studio.chemistry_tutorial_revised').body;
      if (field === 'previousChild') event.payload.previousCourse.studentId = 'another-child';
      else if (field === 'eventName') event.eventName = 'unrelated.audit';
      else event.payload.replacementFingerprint = 'f'.repeat(64);
      expect(() => assert(changed), field).toThrow('retention_saved_integrity_failed');
    }
  });
});
