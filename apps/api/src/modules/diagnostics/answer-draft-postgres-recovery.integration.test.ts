import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import request from 'supertest';

const location = process.env.STUDY_TEST_ANSWER_DRAFT_POSTGRES_URL;
(location ? describe : describe.skip)('native PostgreSQL answer-draft recovery and latest privacy ledger', () => {
  const directory = location ? mkdtempSync(join(tmpdir(), 'study-pg-answer-recovery-')) : '', databases: string[] = [];
  const names = ['NODE_ENV','DATABASE_URL','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION'] as const, prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const repo = resolve(process.cwd(), '../..'), backup = require(join(repo, 'scripts/operations/postgres-backup.cjs')), ledger = require(join(repo, 'scripts/operations/privacy-ledger.cjs'));
  const principal = 'native-answer@local.test', credential = 'Native-Answer-QA-20261025';
  let app: any, store: any, admin: Pool, actor: any;
  async function database() { const name = 'study_qa_answer_recovery_' + randomUUID().replace(/-/g, ''); await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name); const url = new URL(location!); url.pathname = '/' + name; return url.toString(); }
  async function boot(url: string, dataDir: string) {
    Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: url, STUDY_STORAGE: 'postgres', STUDY_DATA_DIR: dataDir, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false' });
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js'); app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js').InMemoryStoreService);
  }
  async function call(method: 'get'|'post'|'patch', path: string, body?: unknown, status = method === 'post' ? 201 : 200, token = actor?.token) {
    let q = request(app.getHttpServer())[method]('/api' + path); if (token) q = q.set('Authorization', 'Bearer ' + token); if (body !== undefined) q = q.send(body as object);
    const response = await q; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
  }
  beforeAll(async () => {
    const probe = new Pool({ connectionString: location }); try { expect((await probe.query('SELECT current_database() name,current_user owner')).rows[0]).toEqual({ name: 'study_agent_qa', owner: 'study_agent_app' }); } finally { await probe.end(); }
    if (!process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw new Error('Dedicated QA administration and native tools required');
    admin = new Pool({ connectionString: process.env.STUDY_TEST_POSTGRES_ADMIN_URL }); expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
  });
  afterAll(async () => {
    await app?.close(); if (admin) { try { for (const name of databases) { if (!/^study_qa_answer_recovery_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe answer QA database'); await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)'); } } finally { await admin.end(); } }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe answer recovery directory'); rmSync(directory, { recursive: true, force: true });
  });
  it('retains actual frozen first submissions and pending draft commands through native recovery, then removes them under a newer child deletion', async () => {
    const sourceUrl = await database(), targetUrl = await database(), deletedUrl = await database(), source = join(directory, 'source'), target = join(directory, 'target'), deleted = join(directory, 'deleted'), bundle = join(directory, 'bundle'), deletionLedger = join(directory, 'deletions.json');
    await boot(sourceUrl, source); actor = await call('post', '/auth/register', { principal, credential });
    const studentId = (await call('post', '/students', { nickname: '原生恢复验收', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    const questionId = 'native-answer-question', itemId = 'native-answer-item', diagnosticId = 'diagnostic_' + randomUUID(), practiceId = 'practice_' + randomUUID();
    await store.transaction(() => {
      store.append('questions', { id: questionId, subject: 'math', type: 'objective', stem: '3+3等于多少？', answer: '6', analysis: '合成恢复验收', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
      store.append('questionAnswerSchemas', { questionId, mode: 'numeric_blank', responseShape: {}, validationRules: {}, gradingConfig: {} });
      store.append('questionSources', { questionId, sourceType: 'internal_authoring', sourceName: '合成恢复验收', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'QA', reviewStatus: 'approved', importJobId: null, notes: null });
      const workspace = app.get(require('../../../dist/apps/api/src/modules/question-workspace/question-workspace.service.js').QuestionWorkspaceService), user = store.find('users', { id: actor.user.id }), renderPayload = workspace.buildAuthorizedRenderPayload(questionId, user);
      const snapshot = { id: questionId, stem: '3+3等于多少？', answer: '6', analysis: '合成恢复验收', document: renderPayload.document, answerSchema: renderPayload.answerSchema, renderPayload, questionType: 'objective' }, startedAt = new Date().toISOString();
      store.append('diagnosticSessions', { id: diagnosticId, studentId, subject: 'math', intent: 'baseline', status: 'in_progress', scopeSnapshot: { studentId, grade: 3, subject: 'math', term: 'upper', textbookVersion: 'QA', learnedAtomIds: [] }, itemIds: [itemId], itemSnapshots: [{ id: itemId, questionId, questionVersion: 1, atomId: 'qa-atom', dimension: 'procedure', family: 'qa-family', mappingWeight: 1, version: 1 }], questionSnapshots: [snapshot], coverage: [], selectionReasons: { [itemId]: '合成恢复核对' }, startedAt, completedAt: null });
      store.append('practiceSessions', { id: practiceId, studentId, subject: 'math', planId: null, actionId: 'qa-action', atomId: 'qa-atom', day: '2026-10-25', status: 'in_progress', questionIds: [questionId], snapshots: [structuredClone(snapshot)], createdAt: startedAt, completedAt: null, origin: 'notebook', actionSnapshot: { id: 'qa-action', atomId: 'qa-atom', title: '合成恢复', activity: '核对原稿', minutes: 5 } });
    });
    const answer = { questionId, mode: 'numeric_blank', response: { value: '6' } }, paths = ['/diagnostics/sessions/' + diagnosticId + '/items/' + itemId, '/learning/practice/' + practiceId + '/questions/' + questionId];
    const pending: any[] = [];
    for (const path of paths) { const { draftState: s } = await call('get', path), command = { protocol: 'answer-draft-v2', actorId: s.actorId, expectedRevision: s.revision, baseHash: s.baseHash, attempt: s.attempt, requestKey: randomUUID(), answer }; const saved = await call('patch', path + '/draft', command); pending.push({ path, command, saved }); }
    const practiceState = pending[1].saved.draftState, firstCommand = { questionId, answer, disposition: 'answered', requestKey: randomUUID(), elapsedMs: 2468, draftFence: { actorId: practiceState.actorId, revision: practiceState.revision, baseHash: practiceState.baseHash, attempt: practiceState.attempt } }, first = await call('post', '/learning/practice/' + practiceId + '/responses', firstCommand);
    await backup.createPostgresBundle({ connectionString: sourceUrl, pgBin: process.env.STUDY_TEST_PG_BIN, dataDir: source, destination: bundle }); await app.close(); app = null;
    await backup.restorePostgresBundle({ connectionString: targetUrl, pgBin: process.env.STUDY_TEST_PG_BIN, bundle, destination: target }); await boot(targetUrl, target); actor = await call('post', '/auth/login', { principal, credential });
    expect(await call('patch', pending[0].path + '/draft', pending[0].command)).toEqual(pending[0].saved);
    expect((await call('post', '/learning/practice/' + practiceId + '/responses', firstCommand)).attempt).toEqual(first.attempt);
    expect((await call('get', paths[1])).feedback.attempt).toMatchObject({ elapsedMs: 2468, attempt: 1, answer });
    const preview = await call('get', '/privacy/students/' + studentId + '/deletion-preview'); await call('post', '/privacy/students/' + studentId + '/delete', { credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() });
    await ledger.exportLedger({ connectionString: targetUrl, destination: deletionLedger }); await app.close(); app = null;
    await backup.restorePostgresBundle({ connectionString: deletedUrl, pgBin: process.env.STUDY_TEST_PG_BIN, bundle, destination: deleted, deletionLedger });
    const probe = new Pool({ connectionString: deletedUrl }); try { expect((await probe.query("SELECT COUNT(*)::int n FROM domain_records WHERE collection IN ('diagnosticDrafts','practiceSessions','practiceAttempts') AND (body->>'sessionId'=ANY($1) OR record_id=ANY($1))", [[diagnosticId, practiceId]])).rows[0].n).toBe(0); } finally { await probe.end(); }
  }, 60000);
});
