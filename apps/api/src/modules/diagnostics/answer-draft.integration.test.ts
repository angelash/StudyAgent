import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('recoverable diagnostic and practice drafts through real authorized routes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-answer-drafts-'));
  const recoveryDirectory = mkdtempSync(join(tmpdir(), 'study-answer-recovery-'));
  const names = ['NODE_ENV','STUDY_STORAGE','DATABASE_URL','STUDY_DATA_DIR','STUDY_WORKER_ENABLED','STUDY_SEED_FOUNDATION'] as const;
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let app: any, store: any, parent: any, other: any, pg: Pool | undefined, schema: string | undefined;
  async function boot() {
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js'), { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); store = app.get(InMemoryStoreService);
  }
  async function call(method: 'get'|'post'|'put'|'patch', path: string, body?: unknown, status = method === 'post' ? 201 : 200, actor = parent) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object); return (await query.expect(status)).body.data;
  }
  beforeAll(async () => {
    let backend = 'sqlite'; const url = process.env.STUDY_TEST_ANSWER_DRAFT_POSTGRES_URL;
    if (url) { pg = new Pool({ connectionString: url }); expect((await pg.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa'); schema = 'study_qa_answer_' + randomUUID().replace(/-/g, ''); await pg.query('CREATE SCHEMA "' + schema + '"'); const scoped = new URL(url); scoped.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = scoped.toString(); backend = 'postgres'; }
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: backend, STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false' }); await boot();
    parent = await call('post', '/auth/register', { principal: 'draft-parent@local.test', credential: 'Draft-QA-only-20261025' }, 201, null);
    other = await call('post', '/auth/register', { principal: 'draft-other@local.test', credential: 'Draft-QA-only-20261025' }, 201, null);
    await store.transaction(() => {
      store.append('knowledgeAtoms', { id: 'draft-atom', grade: 3, prerequisiteIds: [], subject: 'math', name: '草稿验收', strand: '数与运算', term: 'both', objective: '独立完成合成加法', successCriterion: '不同新题中解释加法', curriculumVersion: 'draft-qa-v1', status: 'published', version: 1 });
      for (let n = 0; n < 4; n++) {
        const id = 'draft-q' + n;
        store.append('questions', { id, subject: 'math', type: 'objective', stem: '3+3等于多少？', answer: '6', analysis: '两组3合并。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
        store.append('questionAnswerSchemas', { questionId: id, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
        store.append('questionSources', { questionId: id, sourceType: 'internal_authoring', sourceName: '合成草稿验收', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'test', importJobId: null, reviewStatus: 'approved', notes: null });
        store.append('measurementItems', { id: 'draft-item' + n, questionId: id, questionVersion: 1, atomId: 'draft-atom', dimension: 'procedure', family: 'draft-family' + n, probeRole: 'anchor', expectedSeconds: 15, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch', version: 1 });
      }
    });
  });
  afterAll(async () => { await app?.close(); if (pg) { if (!/^study_qa_answer_[a-f0-9]{32}$/.test(schema ?? '')) throw new Error('Invalid owned answer QA schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); await pg.end(); } for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } for (const owned of [directory, recoveryDirectory]) { if (!resolve(owned).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe answer QA directory'); rmSync(owned, { recursive: true, force: true }); } });
  async function fixture(kind: 'diagnostic'|'practice') {
    const studentId = (await call('post', '/students', { nickname: '草稿验收', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    await call('put', '/students/' + studentId + '/learning-scope', { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '合成验收', learnedAtomIds: ['draft-atom'], currentAtomId: 'draft-atom', minutesPerSession: 15 });
    const diagnostic = await call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', maxItems: 4, includePrerequisites: false, adaptive: false });
    let sessionId = diagnostic.id, itemId = diagnostic.items[0].id, questionId = diagnostic.items[0].questionId;
    if (kind === 'practice') {
      sessionId = 'practice_' + randomUUID(); itemId = questionId;
      await store.transaction(() => {
        const frozen = store.find('diagnosticSessions', { id: diagnostic.id });
        store.append('practiceSessions', { id: sessionId, studentId, subject: 'math', planId: null, actionId: 'draft-action', atomId: 'draft-atom', day: '2026-10-25', status: 'in_progress', questionIds: [questionId], snapshots: structuredClone(frozen.questionSnapshots.filter((q: any) => q.id === questionId)), createdAt: new Date().toISOString(), completedAt: null, origin: 'notebook', actionSnapshot: { id: 'draft-action', atomId: 'draft-atom', title: '合成练习', activity: '解释加法', minutes: 5, successCriterion: '解释过程' } });
      });
    }
    const root = kind === 'diagnostic' ? '/diagnostics/sessions/' + sessionId : '/learning/practice/' + sessionId;
    const item = root + (kind === 'diagnostic' ? '/items/' : '/questions/') + encodeURIComponent(itemId);
    const answer = { questionId, mode: 'numeric_blank', response: { value: '6' } };
    return { kind, studentId, sessionId, itemId, questionId, root, item, draft: item + '/draft', answer };
  }
  const save = (state: any, answer: unknown, requestKey = randomUUID()) => ({ protocol: 'answer-draft-v2', actorId: state.actorId, expectedRevision: state.revision, baseHash: state.baseHash, attempt: state.attempt, requestKey, answer });
  const submit = (f: any, state: any) => ({ [f.kind === 'diagnostic' ? 'itemId' : 'questionId']: f.itemId, requestKey: randomUUID(), disposition: 'answered', answer: f.answer, elapsedMs: 1234, draftFence: { actorId: state.actorId, revision: state.revision, baseHash: state.baseHash, attempt: state.attempt } });

  for (const kind of ['diagnostic', 'practice'] as const) {
    it(kind + ': old drafts advance revisions; v2 blocks legacy writes and retains exact earlier acknowledgments', async () => {
      const f = await fixture(kind), initial = await call('get', f.item); expect(initial.draftState.revision).toBe(0); expect(initial.draft).toBeNull();
      await call('patch', f.draft, { answer: f.answer }); const legacy = await call('get', f.item); expect(legacy.draftState.revision).toBe(1);
      const command = save(legacy.draftState, f.answer), first = await call('patch', f.draft, command); expect(first.acknowledgedRevision).toBe(2);
      await call('patch', f.draft, { answer: 'legacy overwrite' }, 409);
      const newer = { ...f.answer, response: { value: '7' } }, next = await call('patch', f.draft, save(first.draftState, newer));
      const replay = await call('patch', f.draft, command); expect(replay).toMatchObject({ acknowledgedRevision: 2, currentRevision: 3 });
      const reread = await call('get', f.item); expect(kind === 'diagnostic' ? reread.draft : reread.draft.answer).toEqual(newer);
      expect(reread).not.toHaveProperty('draftCommands'); expect(reread.draft).not.toHaveProperty('draftCommands'); expect(next.currentRevision).toBe(3);
      await call('patch', f.draft, { ...command, answer: newer }, 409);
      await call('get', f.item, undefined, 403, other);
    });
    it(kind + ': simultaneous pages cannot replace a newer answer or bypass a stale submission fence', async () => {
      const f = await fixture(kind), state = (await call('get', f.item)).draftState;
      const commands = [save(state, f.answer), save(state, { ...f.answer, response: { value: '9' } })];
      const result = await Promise.all(commands.map(body => request(app.getHttpServer()).patch('/api' + f.draft).set('Authorization', 'Bearer ' + parent.token).send(body)));
      expect(result.map(r => r.status).sort()).toEqual([200,409]);
      await call('post', f.root + '/responses', submit(f, state), 409);
      await call('patch', f.draft, { ...save((await call('get', f.item)).draftState, f.answer), baseHash: 'b'.repeat(64) }, 409);
      const noFence: Record<string, unknown> = submit(f, state); delete noFence.draftFence; await call('post', f.root + '/responses', noFence, 409);
    });
    it(kind + ': an account switch cannot submit another accounts cached command even when the active user can read the child', async () => {
      const f = await fixture(kind), state = (await call('get', f.item)).draftState;
      await call('patch', f.draft, { ...save(state, f.answer), actorId: other.user.id }, 409);
      const command = submit(f, state); command.draftFence.actorId = other.user.id;
      await call('post', f.root + '/responses', command, 409);
      expect((await call('get', f.item)).draftState.revision).toBe(0);
    });
    it(kind + ': lost first-submit receipts replay by JSON meaning and keep original time and independent evidence', async () => {
      const f = await fixture(kind), first = (await call('get', f.item)).draftState, saved = await call('patch', f.draft, save(first, f.answer));
      const command = submit(f, saved.draftState), response = await call('post', f.root + '/responses', command);
      const reordered = { response: { value: '6' }, mode: 'numeric_blank', questionId: f.questionId };
      const replay = await call('post', f.root + '/responses', { ...command, answer: reordered });
      expect(kind === 'diagnostic' ? replay.responseId : replay.attempt.id).toBe(kind === 'diagnostic' ? response.responseId : response.attempt.id);
      await call('post', f.root + '/responses', { ...command, elapsedMs: 2345 }, 409);
      await call('post', f.root + '/responses', { ...command, requestKey: randomUUID() }, 409);
      await store.requestContext(() => {
        const ai = app.get(require('../../../dist/apps/api/src/modules/ai/ai.service.js').AiService);
        const context = ai.resolveQuestionContext({ studentId: f.studentId, subject: 'math', contextRefType: kind, contextRefId: f.sessionId, contextItemId: f.itemId });
        expect(context.draft).toBeNull(); expect(context.response.answer).toEqual(f.answer);
      });
      const portable = await call('post', '/privacy/students/' + f.studentId + '/export', { credential: 'Draft-QA-only-20261025', requestKey: randomUUID() });
      const records = portable.students[0].records;
      if (kind === 'diagnostic') { expect(records.diagnosticDrafts.some((row: any) => row.sessionId === f.sessionId)).toBe(false); expect(records.diagnosticResponses.find((row: any) => row.sessionId === f.sessionId).answer).toEqual(f.answer); }
      else { expect(records.practiceSessions.find((row: any) => row.id === f.sessionId).drafts?.[f.questionId]).toBeUndefined(); expect(records.practiceAttempts.find((row: any) => row.sessionId === f.sessionId).answer).toEqual(f.answer); }
      if (kind === 'diagnostic') await call('patch', f.draft, save(saved.draftState, f.answer), 400);
      else {
        expect(response.attempt).not.toHaveProperty('requestHash'); const read = await call('get', f.item); expect(read.draft).toBeNull(); expect(read.draftState.attempt).toBe(1);
        const revised = await call('patch', f.draft, save(read.draftState, f.answer));
        await store.requestContext(() => { const ai = app.get(require('../../../dist/apps/api/src/modules/ai/ai.service.js').AiService); expect(ai.resolveQuestionContext({ studentId: f.studentId, subject: 'math', contextRefType: kind, contextRefId: f.sessionId, contextItemId: f.itemId }).draft).toEqual(f.answer); });
        const corrected = await call('post', f.root + '/responses', submit(f, revised.draftState));
        expect(corrected.attempt).toMatchObject({ attempt: 2, solutionExposedBefore: true, elapsedMs: 1234 });
        expect((await call('get', f.root)).questions[0].latest).not.toHaveProperty('requestHash');
      }
      await store.requestContext(() => { const rows = store.select(kind === 'diagnostic' ? 'diagnosticResponses' : 'practiceAttempts', { sessionId: f.sessionId }); expect(rows[0].elapsedMs).toBe(1234); expect(rows[0].answer).toEqual(f.answer); expect(rows[0].requestHash).toMatch(/^[a-f0-9]{64}$/); });
    });
  }
  it('keeps an unconfirmed save after restart and excludes internal command journals from real family exports', async () => {
    const f = await fixture('diagnostic'), initial = await call('get', f.item), command = save(initial.draftState, f.answer);
    const saved = await call('patch', f.draft, command); await app.close(); await boot(); expect(await call('patch', f.draft, command)).toEqual(saved);
    const portable = await call('post', '/privacy/students/' + f.studentId + '/export', { credential: 'Draft-QA-only-20261025', requestKey: randomUUID() });
    const exported = portable.students[0].records.diagnosticDrafts.find((row: any) => row.sessionId === f.sessionId);
    expect(exported.answer).toEqual(f.answer); expect(exported).not.toHaveProperty('draftCommands');
    const state = await call('get', f.root); await call('post', f.root + '/state', { action: 'pause', expectedRevision: state.revision, requestKey: randomUUID(), reason: '合成验收暂时休息，保留原题' });
    await call('patch', f.draft, command, 400);
  });
  it.skipIf(!!process.env.STUDY_TEST_ANSWER_DRAFT_POSTGRES_URL)('restores actual SQLite draft journals into an empty root and applies the latest child deletion before reopening old backups', async () => {
    const diagnostic = await fixture('diagnostic'), practice = await fixture('practice');
    const commands: Array<{ fixture: Awaited<ReturnType<typeof fixture>>; command: any; receipt: any }> = [];
    for (const f of [diagnostic, practice]) { const read = await call('get', f.item), command = save(read.draftState, f.answer), receipt = await call('patch', f.draft, command); commands.push({ fixture: f, command, receipt }); }
    const backup = require(resolve(process.cwd(), '../../scripts/operations/backup.cjs')), ledger = require(resolve(process.cwd(), '../../scripts/operations/privacy-ledger.cjs'));
    const bundle = join(recoveryDirectory, 'bundle'), target = join(recoveryDirectory, 'restored'), deleted = join(recoveryDirectory, 'deleted'), deletionLedger = join(recoveryDirectory, 'latest-deletions.json');
    await backup.createBundle({ dataDir: directory, destination: bundle }); expect((await backup.verifyBundle({ bundle })).verifiedFiles).toBeGreaterThan(0);
    await backup.restoreBundle({ bundle, destination: target }); await app.close(); process.env.STUDY_DATA_DIR = target; await boot();
    parent = await call('post', '/auth/login', { principal: 'draft-parent@local.test', credential: 'Draft-QA-only-20261025' }, 201, null);
    for (const { fixture: f, command, receipt } of commands) { expect(await call('patch', f.draft, command)).toEqual(receipt); const read = await call('get', f.item); expect(read.draftState.revision).toBe(1); expect(f.kind === 'diagnostic' ? read.draft : read.draft.answer).toEqual(f.answer); }
    const preview = await call('get', '/privacy/students/' + diagnostic.studentId + '/deletion-preview');
    await call('post', '/privacy/students/' + diagnostic.studentId + '/delete', { credential: 'Draft-QA-only-20261025', confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() });
    await ledger.exportLedger({ dataDir: target, destination: deletionLedger }); await app.close();
    await backup.restoreBundle({ bundle, destination: deleted, deletionLedger }); process.env.STUDY_DATA_DIR = deleted; await boot();
    parent = await call('post', '/auth/login', { principal: 'draft-parent@local.test', credential: 'Draft-QA-only-20261025' }, 201, null);
    await call('get', diagnostic.item, undefined, 404); expect((await call('get', practice.item)).draft.answer).toEqual(practice.answer);
    await store.requestContext(() => expect(store.select('diagnosticDrafts', { sessionId: diagnostic.sessionId })).toHaveLength(0));
    await app.close(); process.env.STUDY_DATA_DIR = directory; await boot();
  });
});
