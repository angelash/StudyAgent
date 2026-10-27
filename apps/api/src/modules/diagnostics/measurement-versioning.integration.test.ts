import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

// All historical reports in this suite are explicitly constructed anonymous protocol fixtures.
describe('self reports and versioned measurement through authenticated HTTP', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-measurement-v3-'));
  const envNames = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'DATABASE_URL', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'] as const;
  const prior = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  let control: Pool | undefined, sourceLocation: string | undefined;
  const databases: string[] = [];
  async function newDatabase() {
    if (!control || !sourceLocation) return undefined;
    const name = 'study_qa_measurement_api_' + randomUUID().replace(/-/g, '');
    await control.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
    const url = new URL(sourceLocation); url.pathname = '/' + name; return url.toString();
  }
  let app: any, store: any, seed: any, owner: any, outsider: any, learner: any, studentId: string;
  const atomId = 'core:math:brackets';
  const route = (id: string) => `/diagnostics/sessions/${encodeURIComponent(id)}`;
  const read = <T,>(action: () => T): Promise<T> => store.transaction(() => structuredClone(action()));
  async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = owner, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor?.token) query = query.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object);
    const result = await query;
    expect(result.status, `${method} ${path}: ${result.body.error?.message ?? ''}`).toBe(expected);
    return result.body.data;
  }
  beforeAll(async () => {
    const location = process.env.STUDY_TEST_MEASUREMENT_POSTGRES_URL;
    if (location) {
      const url = new URL(location);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/study_agent_qa') throw Error('Dedicated measurement QA cluster required');
      if (!process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw Error('Dedicated native measurement recovery settings required');
      const admin = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL);
      if (admin.hostname !== url.hostname || admin.port !== url.port || decodeURIComponent(admin.username) !== 'study_qa_admin') throw Error('Unexpected measurement QA administration');
      control = new Pool({ connectionString: admin.toString() }); expect((await control.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
      sourceLocation = location; sourceLocation = await newDatabase(); process.env.DATABASE_URL = sourceLocation!;
    } else delete process.env.DATABASE_URL;
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: location ? 'postgres' : 'sqlite', STUDY_DATA_DIR: directory,
      STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'true', XIAOJIU_CHAT_ENABLED: 'false' });
    const from = (file: string) => require(`../../../dist/apps/api/src/${file}.js`);
    app = await NestFactory.create(from('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService);
    seed = app.get(from('modules/diagnostics/foundation-seed.service').FoundationSeedService);
  });
  beforeEach(async () => {
    owner = await call('post', '/auth/register', { principal: 'measure-owner-' + randomUUID(), credential: 'Anonymous-measurement-password' }, undefined);
    outsider = await call('post', '/auth/register', { principal: 'measure-outsider-' + randomUUID(), credential: 'Anonymous-measurement-password' }, undefined);
    studentId = (await call('post', '/students', { nickname: '匿名计量测试', grade: 4, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: crypto.randomUUID(), reason: '核查实际作答与自述的能力计量区别' });
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: crypto.randomUUID() });
    learner = await call('post', '/auth/learning-code', { code: code.code }, undefined);
    await call('put', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null,
      textbookVersion: '原创能力路径', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
  });
  afterAll(async () => {
    try { await app?.close(); for (const database of databases) { if (!/^study_qa_measurement_api_[a-f0-9]{32}$/.test(database)) throw Error('Unsafe measurement QA database'); await control!.query('DROP DATABASE "' + database + '"'); } }
    finally { await control?.end(); for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
      if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe measurement QA path'); rmSync(directory, { recursive: true, force: true }); }
  });
  async function complete(disposition: 'dont_know' | 'answered' = 'dont_know') {
    const session = await call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [atomId], includePrerequisites: false, maxItems: 8 });
    const raw: any = await read(() => store.find('diagnosticSessions', { id: session.id }));
    expect(raw.itemSnapshots.length).toBeGreaterThan(0);
    for (const item of raw.itemSnapshots) await call('post', route(session.id) + '/responses', { itemId: item.id, disposition,
      ...(disposition === 'answered' ? { answer: raw.questionSnapshots.find((q: any) => q.id === item.questionId).answer } : {}), elapsedMs: 1000 }, learner);
    return { session, report: await call('post', route(session.id) + '/complete', {}, learner) };
  }
  async function legacy(id: string, evidenceId?: string) { return store.transaction(() => {
    const saved = store.diagnosticReports.find((row: any) => row.sessionId === id);
    saved.report.measurementVersion = 'rule-estimate-v2';
    const estimate = saved.report.estimates.find((row: any) => row.atomId === atomId);
    Object.assign(estimate, { algorithmVersion: 'rule-estimate-v2', mastery: 33.3, lower: 1.3, upper: 84.2,
      status: 'insufficient', scoredCount: 1, effectiveSamples: 1, independentFamilies: 1,
      evidenceIds: [evidenceId ?? saved.report.evidence[0].id] });
    return structuredClone(saved);
  }); }
  it('retains original self-report scores and cause uncertainty but leaves every ability dimension unmeasured', async () => {
    const { report } = await complete();
    expect(report.evidence.every((r: any) => r.disposition === 'dont_know' && r.score === 0 && r.correct === false)).toBe(true);
    expect(report.estimates.find((r: any) => r.atomId === atomId)).toMatchObject({ status: 'unknown', mastery: null,
      lower: null, upper: null, scoredCount: 0, effectiveSamples: 0, independentFamilies: 0, algorithmVersion: 'rule-estimate-v3' });
    expect(report.hypotheses.every((h: any) => h.status === 'proposed' && !h.supportingEvidenceIds.length)).toBe(true);
    const profile = await call('get', `/diagnostics/students/${studentId}/profile?subject=math`, undefined, learner);
    expect(profile.estimates.find((r: any) => r.atomId === atomId).mastery).toBeNull();
  });
  it('detects actual older self-report inputs across sessions and explicitly appends a replayable report', async () => {
    const first = await complete();
    const second = await complete('answered');
    const saved = await legacy(second.session.id, first.report.evidence[0].id);
    const original = structuredClone(saved), answers = await read(() => store.diagnosticResponses);
    const status = await call('get', route(second.session.id) + '/analysis-status');
    expect(status).toMatchObject({ requiresReanalysis: true, measurementRulesChanged: true,
      reportMeasurementVersion: 'rule-estimate-v2', currentMeasurementVersion: 'rule-estimate-v3', canReanalyze: true });
    expect(status.affectedEvidenceIds).toContain(first.report.evidence[0].id);
    await call('get', route(second.session.id) + '/analysis-status', undefined, outsider, 403);
    const command = { requestKey: 'measurement-explicit-reanalysis', expectedReportVersion: 1, reason: '按原始实际作答核对计量，不将自述当作解题失败' };
    await call('post', route(second.session.id) + '/reanalyze', command, learner, 403);
    const updated = await call('post', route(second.session.id) + '/reanalyze', command);
    expect(updated.version).toBe(2); expect(updated.measurementVersion).toBe('rule-estimate-v3');
    expect(updated.revisionReason).toContain('不等同于学习改善');
    expect(await call('post', route(second.session.id) + '/reanalyze', command)).toEqual(updated);
    await call('post', route(second.session.id) + '/reanalyze', { ...command, reason: '同键不同内容不能重新提交' }, owner, 409);
    await call('post', route(second.session.id) + '/reanalyze', { ...command, requestKey: 'measurement-stale-version' }, owner, 409);
    expect(await read(() => store.diagnosticReports.find((row: any) => row.id === saved.id))).toEqual(original);
    expect(await read(() => store.diagnosticResponses)).toEqual(answers);
    expect((await call('get', route(second.session.id) + '/analysis-status')).requiresReanalysis).toBe(false);
  });
  it('keeps unaffected actual-answer v2 reports compatible instead of requiring a version-only rewrite', async () => {
    const { session } = await complete('answered');
    await store.transaction(() => {
      const saved = store.diagnosticReports.find((row: any) => row.sessionId === session.id);
      saved.report.measurementVersion = 'rule-estimate-v2'; saved.report.estimates.forEach((r: any) => { r.algorithmVersion = 'rule-estimate-v2'; });
    });
    expect((await call('get', route(session.id) + '/analysis-status')).requiresReanalysis).toBe(false);
  });
  it('reports missing or unrecognised original eligibility as unknown without resurrecting deleted evidence', async () => {
    const { session } = await complete('answered');
    const saved = await legacy(session.id), original: any = await read(() => store.diagnosticResponses.find((r: any) => r.id === saved.report.estimates[0].evidenceIds[0]));
    await store.transaction(() => { delete store.find('diagnosticResponses', { id: original.id }).disposition; });
    const status = await call('get', route(session.id) + '/analysis-status');
    expect(status.requiresReanalysis).toBe(true);
    expect(status.unverifiedEvidenceIds).toContain(original.id);
    const mixed = (await call('get', `/diagnostics/students/${studentId}/profile?subject=math`)).estimates.find((r: any) => r.atomId === atomId);
    expect(mixed.evidenceIds).not.toContain(original.id);
    await store.transaction(() => { for (const row of store.diagnosticResponses.filter((r: any) => r.studentId === studentId)) delete row.disposition; });
    expect((await call('get', `/diagnostics/students/${studentId}/profile?subject=math`)).estimates.find((r: any) => r.atomId === atomId).mastery).toBeNull();
  });
  it('blocks new guidance on affected reports and marks an existing plan as requiring review', async () => {
    const { session, report } = await complete();
    const plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 10, useAi: false });
    await legacy(session.id);
    await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 10, useAi: false }, owner, 409);
    expect((await call('get', `/diagnostics/plans/${plan.id}`)).impact).toMatchObject({ needsReview: true, measurementRulesChanged: true });
    expect(report.evidence.every((r: any) => r.disposition === 'dont_know')).toBe(true);
  });
  it('keeps a started activity frozen while reanalysis and explicit plan confirmation save the current methods', async () => {
    const { session } = await complete();
    let plan = await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 10, useAi: false });
    plan = await call('patch', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision, requestKey: 'measurement-plan-activate' });
    const started = await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {}, learner);
    const frozen = await read(() => store.find('practiceSessions', { id: started.id }));
    await legacy(session.id);
    expect((await call('post', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {}, learner)).id).toBe(started.id);
    await call('post', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'verification', planId: plan.id,
      targetAtomIds: [atomId], includePrerequisites: false, maxItems: 8 }, learner, 409);
    await call('post', route(session.id) + '/reanalyze', { requestKey: 'measurement-started-reanalysis', expectedReportVersion: 1, reason: '核对原自述资格，保留已开始活动' });
    expect((await call('get', `/diagnostics/plans/${plan.id}`)).impact.needsReview).toBe(true);
    plan = await call('post', `/diagnostics/plans/${plan.id}/adjust`, { expectedRevision: plan.revision,
      requestKey: 'measurement-plan-acknowledge', acknowledgeReportVersion: 2, reason: '按当前实际作答方法确认原指导，不把方法变化当作进步', minutesPerDay: 10,
      actions: plan.actions.map((row: any) => ({ actionId: row.id, minutes: row.minutes, activity: row.activity })) });
    expect(plan).toMatchObject({ baselineMeasurementVersion: 'rule-estimate-v3', baselineFamilyIdentityVersion: 'authored-family-identity-v1' });
    expect(plan.impact.needsReview).toBe(false);
    expect(await read(() => store.find('practiceSessions', { id: started.id }))).toEqual(frozen);
    const retrospective = await call('get', `/diagnostics/plans/${plan.id}/retrospective`);
    expect(retrospective.measurementContext.measurementVersion).toBe('rule-estimate-v3');
    expect(retrospective.comparisons.every((row: any) => row.before.mastery === null && row.outcome === 'awaiting_retest')).toBe(true);
  });
  it('retains an original numerical report when an input is missing and refuses to manufacture replacement evidence', async () => {
    const { session } = await complete(); const saved = await legacy(session.id), original = structuredClone(saved);
    const id = saved.report.estimates[0].evidenceIds[0];
    await store.transaction(() => { store.diagnosticResponses.splice(store.diagnosticResponses.findIndex((row: any) => row.id === id), 1); });
    expect(await call('get', route(session.id) + '/analysis-status')).toMatchObject({ requiresReanalysis: true, canReanalyze: false, unverifiedEvidenceIds: [id] });
    await call('post', route(session.id) + '/reanalyze', { requestKey: 'measurement-missing-original', expectedReportVersion: 1, reason: '缺失原计量记录不能从快照重建' }, owner, 409);
    expect(await read(() => store.diagnosticReports.find((row: any) => row.id === saved.id))).toEqual(original);
    expect(await read(() => store.diagnosticResponses.some((row: any) => row.id === id))).toBe(false);
  });
  it('replays reanalysis across two instances and a cold restart with only one appended method version', async () => {
    const { session } = await complete(); await legacy(session.id);
    const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
    const other = await NestFactory.create(load('app.module').AppModule, { logger: false }); other.setGlobalPrefix('api'); await other.init();
    const input = { requestKey: 'measurement-racing-method-update', expectedReportVersion: 1, reason: '两实例只追加一份方法核对报告，保留原记录' };
    try {
      const results = await Promise.all([app, other].map(instance => request(instance.getHttpServer()).post('/api' + route(session.id) + '/reanalyze')
        .set('Authorization', 'Bearer ' + owner.token).send(input)));
      expect(results.some(row => row.status === 201)).toBe(true);
      expect(results.every(row => [201, 409].includes(row.status))).toBe(true);
      const expected = await call('post', route(session.id) + '/reanalyze', input);
      expect(expected.version).toBe(2);
      const replay = await request(other.getHttpServer()).post('/api' + route(session.id) + '/reanalyze').set('Authorization', 'Bearer ' + owner.token).send(input);
      expect(replay.status).toBe(201); expect(replay.body.data).toEqual(expected);
      expect((await call('get', route(session.id) + '/report-history')).map((row: any) => row.version)).toEqual([2, 1]);
    } finally { await other.close(); }
    await app.close();
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    expect((await call('post', route(session.id) + '/reanalyze', input)).version).toBe(2);
    expect((await call('get', route(session.id) + '/report-history')).map((row: any) => row.version)).toEqual([2, 1]);
  });
  it('preserves earlier displayed-question exposure even when a legacy response omitted its exposure flag', async () => {
    const start = { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [atomId], includePrerequisites: false, adaptive: false, maxItems: 8 };
    const earlier = await call('post', '/diagnostics/sessions', start);
    const frozen: any = await read(() => store.find('diagnosticSessions', { id: earlier.id }));
    const later = await call('post', '/diagnostics/sessions', start), item = frozen.itemSnapshots[0];
    await store.transaction(() => {
      const row = store.find('diagnosticSessions', { id: later.id });
      row.itemSnapshots = [structuredClone(item)]; row.itemIds = [item.id]; row.exposedQuestionIds = [];
      row.questionSnapshots = frozen.questionSnapshots.filter((question: any) => question.id === item.questionId);
    });
    await call('post', route(later.id) + '/responses', { itemId: item.id, answer: frozen.questionSnapshots.find((q: any) => q.id === item.questionId).answer, elapsedMs: 1000 }, learner);
    const id: any = await store.transaction(() => { const response = store.select('diagnosticResponses', { sessionId: later.id })[0]; delete response.priorExposure; return response.id; });
    const report = await call('post', route(later.id) + '/complete', {}, learner);
    expect(report.estimates.find((row: any) => row.atomId === atomId)).toMatchObject({ mastery: null, scoredCount: 0 });
    const evidence = await call('get', `/diagnostics/students/${studentId}/evidence/${id}`);
    expect(evidence.originalResponse).not.toHaveProperty('priorExposure'); expect(evidence.response.priorExposure).toBe(true);
    await legacy(later.id, id);
    expect(await call('get', route(later.id) + '/analysis-status')).toMatchObject({ requiresReanalysis: true, affectedEvidenceIds: [id] });
  });
  it('natively restores both measurement methods and plan confirmations, then applies the current child deletion ledger to an old bundle', async () => {
    const backup = require(resolve(__dirname, '../../../../../scripts/operations/backup.cjs'));
    const pgBackup = require(resolve(__dirname, '../../../../../scripts/operations/postgres-backup.cjs'));
    const ledger = require(resolve(__dirname, '../../../../../scripts/operations/privacy-ledger.cjs'));
    const { DomainDatabase } = require('../../../dist/apps/api/src/infrastructure/domain-database.js');
    const recovery = mkdtempSync(join(tmpdir(), 'study-measurement-native-'));
    try {
      const { session } = await complete(); await legacy(session.id);
      await call('post', route(session.id) + '/reanalyze', { requestKey: 'measurement-before-native-backup', expectedReportVersion: 1, reason: '原生备份前保留新旧计量报告和原自述' });
      await call('post', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 10, useAi: false });
      const originals: any = await read(() => ({ diagnosticResponses: store.select('diagnosticResponses', { studentId }),
        diagnosticReports: store.select('diagnosticReports', { sessionId: session.id }), diagnosticPlans: store.select('diagnosticPlans', { studentId }) }));
      const bundle = join(recovery, 'original-bundle');
      if (sourceLocation) await pgBackup.createPostgresBundle({ connectionString: sourceLocation, dataDir: directory, destination: bundle, pgBin: process.env.STUDY_TEST_PG_BIN });
      else await backup.createBundle({ dataDir: directory, destination: bundle });
      async function restore(name: string, deletionLedger?: string) {
        const destination = join(recovery, name), location = await newDatabase();
        if (location) await pgBackup.restorePostgresBundle({ connectionString: location, bundle, destination, deletionLedger, pgBin: process.env.STUDY_TEST_PG_BIN });
        else await backup.restoreBundle({ bundle, destination, deletionLedger });
        const restored = new DomainDatabase(location ?? join(destination, 'study-agent.sqlite3')); await restored.open();
        try { return (await restored.read()).state; } finally { await restored.close(); }
      }
      const restored = await restore('original-restored');
      for (const [collection, values] of Object.entries(originals)) expect(restored[collection].filter((row: any) =>
        collection === 'diagnosticReports' ? row.sessionId === session.id : row.studentId === studentId)).toEqual(values);
      const preview = await call('get', `/privacy/students/${studentId}/deletion-preview`);
      await call('post', `/privacy/students/${studentId}/delete`, { credential: 'Anonymous-measurement-password', requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint });
      const deletionLedger = join(recovery, 'current-deletion-ledger.json');
      await ledger.exportLedger({ dataDir: directory, connectionString: sourceLocation, destination: deletionLedger });
      const filtered = await restore('deleted-restored', deletionLedger);
      for (const collection of Object.keys(originals)) expect((filtered[collection] ?? []).filter((row: any) =>
        collection === 'diagnosticReports' ? row.sessionId === session.id : row.studentId === studentId)).toEqual([]);
    } finally { if (!resolve(recovery).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe native measurement recovery path'); rmSync(recovery, { recursive: true, force: true }); }
  }, 120000);
});
