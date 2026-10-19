import 'reflect-metadata';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DomainDatabase } from './domain-database';
const require = createRequire(__filename);
const location = process.env.STUDY_TEST_POSTGRES_URL;
const suite = location ? describe : describe.skip;
suite('real PostgreSQL storage and API recovery', () => {
  let control: Pool;
  const schemas: string[] = [], metrics: Array<Record<string, unknown>> = [];
  beforeAll(async () => {
    control = new Pool({ connectionString: location });
    if ((await control.query('SELECT current_database() AS name')).rows[0].name !== 'study_agent_qa') throw new Error('Only the dedicated study_agent_qa database is allowed');
  });
  afterAll(async () => {
    for (const schema of schemas) {
      if (!/^study_qa_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid owned test schema');
      await control.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await control?.end();
    if (process.env.STUDY_POSTGRES_EVIDENCE) writeFileSync(process.env.STUDY_POSTGRES_EVIDENCE, JSON.stringify({ at: new Date().toISOString(), driver: 'postgres', passedAllCases: metrics.length === 3 && metrics.every(m => m.passed), metrics,
      limits: 'Small isolated functional sample. Global revision conflicts and whole-domain loading remain production scaling work.' }, null, 2) + '\n');
  });
  async function scoped() {
    const schema = `study_qa_${randomUUID().replace(/-/g, '')}`; await control.query(`CREATE SCHEMA "${schema}"`); schemas.push(schema);
    const url = new URL(location!); url.searchParams.set('options', `-c search_path=${schema}`); return url.toString();
  }

  it('applies all migrations, rolls back uniqueness failures and rejects authorization snapshots after a concurrent revocation', async () => {
    const target = await scoped(), first = new DomainDatabase(target), second = new DomainDatabase(target);
    await first.open(); await second.open();
    try {
      const empty = await first.read();
      await expect(first.commit(empty, { users: [{ id: 'a', principal: 'same' }, { id: 'b', principal: 'same' }] })).rejects.toThrow();
      expect(await first.read()).toEqual(empty);
      await expect(first.commit(empty, { studentProgressProposals: [{ id: 'a', studentId: 's', scope: { subject: 'math' }, status: 'pending' }, { id: 'b', studentId: 's', scope: { subject: 'math' }, status: 'pending' }] })).rejects.toThrow();
      expect(await first.read()).toEqual(empty);
      await expect(first.commit(empty, { assistantSessions: [{ id: 'a', scopeKey: 'same' }, { id: 'b', scopeKey: 'same' }] })).rejects.toThrow();
      await first.commit(empty, { bindings: [{ id: 'binding', parentUserId: 'owner', studentId: 'child', status: 'active' }] });
      const authorized = await first.read(), latest = await second.read();
      await second.commit(latest, { bindings: [{ id: 'binding', parentUserId: 'owner', studentId: 'child', status: 'inactive' }] });
      await expect(first.commit(authorized, { ...authorized.state, responses: [{ id: 'never-published' }] })).rejects.toThrow('数据已更新');
      expect((await first.read()).state.responses ?? []).toHaveLength(0);
      metrics.push({ case: 'migrations_uniqueness_revocation', passed: true });
    } finally { await first.close(); await second.close(); }
  });

  it('claims exclusively across pools, recovers expired leases and commits output only with the current fence', async () => {
    let now = 1000; const target = await scoped(), first = new DomainDatabase(target, () => now), second = new DomainDatabase(target, () => now);
    await first.open(); await second.open();
    try {
      await first.commit(await first.read(), { imports: [{ id: 'import', status: 'pending' }] }, { enqueue: [{ id: 'job', kind: 'pdf.import', ownerUserId: 'owner', requestKey: 'same-request', payloadHash: 'same-hash', payload: {}, createdAt: new Date().toISOString(), maxAttempts: 3 }] });
      const claims = await Promise.all([first.tasks.claim(['pdf.import'], 100), second.tasks.claim(['pdf.import'], 100)]);
      expect(claims.filter(Boolean)).toHaveLength(1); const old = claims.find(Boolean)!;
      now = 1200; const fresh = (await second.tasks.claim(['pdf.import'], 100))!;
      const before = await first.read();
      await expect(first.commit(before, { imports: [{ id: 'import', status: 'stale' }] }, { fence: { id: old.id, token: old.leaseToken! } })).rejects.toThrow();
      expect(await first.read()).toEqual(before);
      await second.commit(before, { imports: [{ id: 'import', status: 'complete' }] }, { fence: { id: fresh.id, token: fresh.leaseToken! } });
      expect((await first.tasks.get('job'))?.state).toBe('succeeded');
      metrics.push({ case: 'cross_pool_queue_fencing', passed: true });
    } finally { await first.close(); await second.close(); }
  });

  it('restores real parent/student access, immutable responses, practice drafts and contextual assistant history after API restart', async () => {
    const target = await scoped(), directory = mkdtempSync(join(tmpdir(), 'study-pg-api-'));
    const prior = { NODE_ENV: process.env.NODE_ENV, STUDY_STORAGE: process.env.STUDY_STORAGE, DATABASE_URL: process.env.DATABASE_URL, STUDY_DATA_DIR: process.env.STUDY_DATA_DIR, STUDY_WORKER_ENABLED: process.env.STUDY_WORKER_ENABLED };
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'postgres', DATABASE_URL: target, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
    const { AppModule } = require('../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    async function start() { const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); return app; }
    let app: any, token: string;
    async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor?: string, status = method === 'post' ? 201 : 200) {
      let q = request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${actor ?? token}`);
      if (body !== undefined) q = q.send(body as object); return (await q.expect(status)).body.data;
    }
    const started = Date.now();
    try {
      app = await start(); const account = await call('post', '/auth/register', { principal: 'postgres-fixture', credential: 'postgres-fixture-secret' }); token = account.token;
      const child = (await call('post', '/students', { nickname: '小禾', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile;
      const store = app.get(InMemoryStoreService), atomId = await store.transaction(() => store.measurementItems.find((m: any) =>
        store.knowledgeAtoms.some((a: any) => a.id === m.atomId && a.subject === 'math' && a.grade <= 3) && store.questionAnswerSchemas.some((s: any) => s.questionId === m.questionId && s.mode === 'numeric_blank')).atomId);
      await call('put', `/students/${child.id}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '原创范围', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
      const baseline = await call('post', '/diagnostics/sessions', { studentId: child.id, subject: 'math', maxItems: 2 });
      for (const item of baseline.items) await call('post', `/diagnostics/sessions/${baseline.id}/responses`, { itemId: item.id, disposition: 'dont_know', elapsedMs: 1200 });
      const report = await call('post', `/diagnostics/sessions/${baseline.id}/complete`, {});
      const plan = await call('post', `/diagnostics/students/${child.id}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 15, useAi: false });
      await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision });
      const practice = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {});
      await call('patch', `/learning/practice/${practice.id}/questions/${practice.questions[0].id}/draft`, { answer: { value: '保留我的思路' } });
      await call('post', `/students/${child.id}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'postgres-enable', reason: '家长开启隔离环境中的学生身份，核对持久化。' });
      const code = await call('post', `/students/${child.id}/learning-access/codes`, { expectedVersion: 1, requestKey: 'postgres-learning-code' });
      const student = await call('post', '/auth/learning-code', { code: code.code });
      const input = { userRole: 'student', studentId: child.id, subject: 'math', pageContext: 'mission', contextRefType: 'practice', contextRefId: practice.id, contextItemId: practice.questions[0].id };
      const assistant = await call('post', '/ai/assistant/sessions', input, student.token);
      await call('post', `/ai/assistant/sessions/${assistant.id}/messages`, { message: '我怎样检查已知条件？', requestKey: 'postgres-assistant-help' }, student.token);
      await app.close(); app = await start();
      expect((await call('get', '/auth/me', undefined, student.token)).studentId).toBe(child.id);
      await call('get', '/learning/overview', undefined, student.token, 403);
      expect((await call('get', `/learning/practice/${practice.id}/questions/${practice.questions[0].id}`, undefined, student.token)).draft.answer).toEqual({ value: '保留我的思路' });
      expect((await call('get', `/diagnostics/sessions/${baseline.id}/report`, undefined, student.token)).evidence).toEqual(report.evidence);
      expect((await call('post', '/ai/assistant/sessions', input, student.token)).id).toBe(assistant.id);
      expect(await call('get', `/ai/assistant/sessions/${assistant.id}/messages`, undefined, student.token)).toHaveLength(2);
      metrics.push({ case: 'real_api_restart', passed: true, elapsedMs: Date.now() - started, evidenceCount: report.evidence.length });
    } finally {
      await app?.close(); for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
