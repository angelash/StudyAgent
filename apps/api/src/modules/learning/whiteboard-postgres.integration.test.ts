import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { whiteboardPresentation } from '@study-agent/contracts';

describe.skipIf(!process.env.STUDY_TEST_WHITEBOARD_POSTGRES_URL)('whiteboard current authority and frozen narration on native PostgreSQL', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-whiteboard-pg-'));
  const names = ['NODE_ENV', 'STUDY_STORAGE', 'DATABASE_URL', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED', 'OPENAI_API_KEY', 'MINIMAX_API_KEY'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  let pool: Pool, schema: string, app: any, store: any, owner: any, other: any, saved: any, command: any;
  async function boot() {
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
  }
  async function call(method: 'post' | 'put' | 'get', path: string, body?: any, actor = owner, status = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body); const result = await query;
    expect(result.status, JSON.stringify(result.body.error)).toBe(status); return result.body.data;
  }
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.STUDY_TEST_WHITEBOARD_POSTGRES_URL });
    expect((await pool.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
    schema = 'study_qa_whiteboard_' + randomUUID().replace(/-/g, ''); await pool.query(`CREATE SCHEMA "${schema}"`);
    const url = new URL(process.env.STUDY_TEST_WHITEBOARD_POSTGRES_URL!); url.searchParams.set('options', '-c search_path=' + schema);
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'postgres', DATABASE_URL: url.toString(), STUDY_DATA_DIR: directory,
      STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' });
    await boot();
    owner = await call('post', '/auth/register', { principal: 'whiteboard-owner-' + randomUUID(), credential: 'Synthetic-whiteboard-only-20261026' }, null);
    other = await call('post', '/auth/register', { principal: 'whiteboard-other-' + randomUUID(), credential: 'Synthetic-whiteboard-only-20261026' }, null);
    await store.transaction(() => {
      store.append('students', { id: 'whiteboard-child', userId: 'synthetic-student', nickname: '匿名验证', grade: 5, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } });
      store.append('bindings', { id: 'whiteboard-binding', studentId: 'whiteboard-child', parentUserId: owner.user.id, relation: 'guardian', status: 'active' });
      store.append('knowledgeAtoms', { id: 'whiteboard-atom', name: '统一单位', subject: 'math', grade: 5, term: 'upper', strand: '分数', objective: '先观察。再统一单位。', successCriterion: '在新情境中验证', prerequisiteIds: [], curriculumVersion: 'synthetic', status: 'published', version: 1 });
    });
    await call('put', '/students/whiteboard-child/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null, textbookVersion: 'Synthetic', learnedAtomIds: ['whiteboard-atom'], currentAtomId: 'whiteboard-atom', minutesPerSession: 15 });
    const draft = { studentId: 'whiteboard-child', subject: 'math', prompt: '解释统一单位', atomId: 'whiteboard-atom' };
    const preview = await call('post', '/learning/studio/whiteboards/preview', draft);
    command = { ...draft, fingerprint: preview.fingerprint, requestKey: randomUUID() };
    saved = await call('post', '/learning/studio/whiteboards', command);
  });
  afterAll(async () => {
    vi.restoreAllMocks(); await app?.close();
    if (pool && schema) { if (!/^study_qa_whiteboard_[a-f0-9]{32}$/.test(schema)) throw Error('Unknown isolated QA schema'); await pool.query(`DROP SCHEMA "${schema}" CASCADE`); await pool.end(); }
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    rmSync(directory, { recursive: true, force: true });
  });
  it('replays only its original command and retains exact frozen content after closing and reopening storage', async () => {
    expect((await call('post', '/learning/studio/whiteboards', command)).id).toBe(saved.id);
    await call('post', '/learning/studio/whiteboards', { ...command, prompt: '新的不同操作' }, owner, 409);
    await call('post', '/learning/studio/whiteboards', command, other, 403);
    await app.close(); await boot();
    const overview = await call('get', '/learning/studio/overview?studentId=whiteboard-child&subject=math');
    expect(overview.whiteboards.find((row: any) => row.id === saved.id)).toEqual(saved);
    expect((await call('post', '/learning/studio/whiteboards', command)).id).toBe(saved.id);
  });
  it('uses frozen sentence identities after native restart and refuses tampering before synthesis', async () => {
    const projection = whiteboardPresentation(saved), unit = projection.units[0], body = { presentationVersion: projection.version, fingerprint: saved.fingerprint, unitId: unit.id };
    const path = '/api/learning/studio/whiteboards/' + saved.id + '/narration/' + encodeURIComponent(unit.sceneId);
    const spy = vi.spyOn(app.get(load('modules/ai/speech.service').SpeechService), 'synthesize').mockResolvedValue({ content: Buffer.from('synthetic-only'), contentType: 'audio/wav' });
    try {
      const response = await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + owner.token).send(body).expect(201);
      expect(response.headers['x-whiteboard-unit']).toBe(unit.id); expect(spy).toHaveBeenLastCalledWith(unit.text, undefined, expect.any(AbortSignal));
      await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + owner.token).send({ ...body, fingerprint: 'b'.repeat(64) }).expect(409);
      await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + other.token).send(body).expect(403);
      expect(spy).toHaveBeenCalledTimes(1);
      let arrive!: () => void, release!: (value: any) => void;
      const arrival = new Promise<void>(resolve => { arrive = resolve; });
      spy.mockImplementationOnce(() => { arrive(); return new Promise(resolve => { release = resolve; }); });
      const pending = request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + owner.token).send(body).then(result => result);
      try {
        await Promise.race([arrival, pending.then(() => { throw Error('PostgreSQL narration returned before controlled synthesis'); })]);
        await store.transaction(() => { store.find('bindings', { id: 'whiteboard-binding' }).status = 'revoked'; });
      } finally { release?.({ content: Buffer.from('late-private-audio'), contentType: 'audio/wav' }); }
      expect((await pending).status).toBe(403);
      await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + owner.token).send(body).expect(403);
      await call('post', '/learning/studio/whiteboards', command, owner, 403);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally { spy.mockRestore(); }
  });

  async function held(actor: any, mutation: () => Promise<unknown>, legacy = false) {
    const projection = whiteboardPresentation(saved), unit = projection.units[0];
    let arrive!: () => void, release!: (value: any) => void; const arrival = new Promise<void>(resolve => { arrive = resolve; });
    const spy = vi.spyOn(app.get(load('modules/ai/speech.service').SpeechService), 'synthesize').mockImplementationOnce(() => { arrive(); return new Promise(resolve => { release = resolve; }); });
    const audio = { content: Buffer.from('late-private-audio'), contentType: 'audio/wav' };
    const operation = request(app.getHttpServer()).post('/api/learning/studio/whiteboards/' + saved.id + '/narration/' + encodeURIComponent(unit.sceneId))
      .set('Authorization', 'Bearer ' + actor.token).send(legacy ? {} : { presentationVersion: projection.version, fingerprint: saved.fingerprint, unitId: unit.id }).then(result => result);
    try {
      await Promise.race([arrival, operation.then(() => { throw Error('Native request completed before held synthesis'); })]);
      await mutation(); release(audio); expect((await operation).status).toBe(401);
    } finally { release?.(audio); await operation; spy.mockRestore(); }
  }
  it('refuses late legacy audio after a separately committed logout of the original native session', async () => {
    await store.transaction(() => { store.find('bindings', { id: 'whiteboard-binding' }).status = 'active'; });
    await held(owner, () => call('post', '/auth/logout', {}, owner), true);
  });
  it('requires the original learner access epoch even when a new epoch is currently enabled', async () => {
    owner = await call('post', '/auth/login', { principal: owner.user.principal, credential: 'Synthetic-whiteboard-only-20261026' }, null);
    const access = await call('post', '/students/whiteboard-child/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: 'Native synthetic narration epoch check.' });
    const code = await call('post', '/students/whiteboard-child/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    const learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    await held(learner, () => store.transaction(() => { store.find('studentLearningAccess', { studentId: 'whiteboard-child' }).version++; }));
  });
});
