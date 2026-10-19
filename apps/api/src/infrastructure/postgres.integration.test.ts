import 'reflect-metadata';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
    const expectedCases = process.env.STUDY_TEST_POSTGRES_ADMIN_URL ? 4 : 3;
    if (process.env.STUDY_POSTGRES_EVIDENCE) writeFileSync(process.env.STUDY_POSTGRES_EVIDENCE, JSON.stringify({ at: new Date().toISOString(), driver: 'postgres', passedAllCases: metrics.length === expectedCases && metrics.every(m => m.passed), metrics,
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
      await expect(first.commit(empty, { privacyRequests: [{ id: 'a', actorId: 'owner', requestKey: 'same' }, { id: 'b', actorId: 'owner', requestKey: 'same' }] })).rejects.toThrow();
      await expect(first.commit(empty, { studentMedia: [{ id: 'a', ownerUserId: 'owner', requestKey: 'same' }, { id: 'b', ownerUserId: 'owner', requestKey: 'same' }] })).rejects.toThrow();
      await first.commit(empty, { bindings: [{ id: 'binding', parentUserId: 'owner', studentId: 'child', status: 'active' }] });
      const authorized = await first.read(), latest = await second.read();
      await second.commit(latest, { bindings: [{ id: 'binding', parentUserId: 'owner', studentId: 'child', status: 'inactive' }] });
      await expect(first.commit(authorized, { ...authorized.state, responses: [{ id: 'never-published' }] })).rejects.toThrow('数据已更新');
      expect((await first.read()).state.responses ?? []).toHaveLength(0);
      await first.close(); await second.close();
      const upgrade = new Pool({ connectionString: target });
      try { await upgrade.query('DELETE FROM schema_migrations WHERE version>=4; DROP TABLE study_restore_guard'); } finally { await upgrade.end(); }
      const migrated = new DomainDatabase(target); await migrated.open();
      try { expect((await migrated.read()).state.bindings).toEqual([{ id: 'binding', parentUserId: 'owner', studentId: 'child', status: 'inactive' }]); } finally { await migrated.close(); }
      metrics.push({ case: 'migrations_uniqueness_revocation', passed: true, upgradedFromVersion: 3, currentVersion: 6 });
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

  (process.env.STUDY_TEST_POSTGRES_ADMIN_URL ? it : it.skip)('exports a consistent native dump and restores into an empty database with file validation, credential revocation and worker fencing', async () => {
    const admin = new Pool({ connectionString: process.env.STUDY_TEST_POSTGRES_ADMIN_URL });
    const tag = randomUUID().replace(/-/g, ''), names = [`study_qa_source_${tag}`, `study_qa_restored_${tag}`, `study_qa_restored_${randomUUID().replace(/-/g, '')}`], created: string[] = [];
    const directory = mkdtempSync(join(tmpdir(), 'study-pg-backup-')), sourceFiles = join(directory, 'source'), bundle = join(directory, 'bundle'), restoredFiles = join(directory, 'restored');
    const tools = resolve(__dirname, '../../../../data/tools/postgresql-17.11-5/pgsql/bin');
    const { createPostgresBundle, verifyPostgresBundle, restorePostgresBundle } = require(resolve(__dirname, '../../../../scripts/operations/postgres-backup.cjs'));
    const { makeLedger } = require(resolve(__dirname, '../../../../scripts/operations/privacy-ledger.cjs'));
    const databases: DomainDatabase[] = [];
    try {
      if ((await admin.query('SELECT current_user AS name')).rows[0].name !== 'study_qa_admin') throw new Error('Only isolated QA administration is allowed');
      for (const name of names) { await admin.query(`CREATE DATABASE "${name}" OWNER study_agent_app`); created.push(name); }
      const source = new URL(location!), restored = new URL(location!); source.pathname = '/' + names[0]; restored.pathname = '/' + names[1];
      const db = new DomainDatabase(source.toString()); databases.push(db); await db.open();
      const bytes = Buffer.from('%PDF-1.4 immutable PostgreSQL backup fixture'), sha256 = createHash('sha256').update(bytes).digest('hex');
      mkdirSync(join(sourceFiles, 'processing/blobs'), { recursive: true }); writeFileSync(join(sourceFiles, 'processing/blobs', sha256), bytes);
      const keptMediaId = `student_media_${randomUUID()}`, erasedMediaId = `student_media_${randomUUID()}`, pendingMediaId = `student_media_${randomUUID()}`;
      for (const id of [keptMediaId, erasedMediaId, pendingMediaId]) {
        const directory = join(sourceFiles, 'student-media', id, id === pendingMediaId ? 'chunks' : 'ready'); mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, id === pendingMediaId ? `0-${sha256}` : sha256), bytes);
      }
      await db.commit(await db.read(), { users: [{ id: 'owner', principal: 'postgres-backup' }], sessions: [{ id: 'old-session', tokenHash: 'old-token-hash', revokedAt: null }],
        students: [{ id: 'erase-child', nickname: '私有恢复样本' }],
        diagnosticResponses: [{ id: 'original-evidence', score: 0.5 }, { id: 'erased-evidence', studentId: 'erase-child', score: 0 }], diagnosticPlans: [{ id: 'plan', revision: 4 }],
        importFiles: [{ id: `import_file_${randomUUID()}`, status: 'ready', sha256, size: bytes.length }],
        studentMedia: [keptMediaId, erasedMediaId, pendingMediaId].map(id => ({ id, studentId: id === erasedMediaId ? 'erase-child' : 'keep-child', ownerUserId: 'owner', requestKey: id,
          status: id === pendingMediaId ? 'uploading' : 'ready', sha256, size: bytes.length, storedSize: bytes.length, chunks: id === pendingMediaId ? [{ index: 0, size: bytes.length, sha256 }] : [] })) },
      { enqueue: [{ id: 'pending-task', kind: 'pdf.import', ownerUserId: 'owner', requestKey: 'pg-backup-task', payloadHash: 'hash', payload: {}, createdAt: new Date().toISOString(), maxAttempts: 3 }] });
      const oldWorker = (await db.tasks.claim(['pdf.import']))!;
      await createPostgresBundle({ connectionString: source.toString(), pgBin: tools, dataDir: sourceFiles, destination: bundle });
      expect((await verifyPostgresBundle({ bundle, pgBin: tools })).verifiedFiles).toBe(5);
      const subjectHash = createHash('sha256').update(JSON.stringify({ id: 'erase-child' })).digest('hex'), ledgerPath = join(directory, 'deletions.json');
      writeFileSync(ledgerPath, JSON.stringify(makeLedger([{ id: 'privacy-test-receipt', actorId: 'owner', kind: 'student_delete', subjectHash, requestKey: 'postgres-delete-child', inputHash: 'a'.repeat(64),
        completedAt: new Date().toISOString(), counts: { records: 2, observations: 1, activities: 0, plans: 0, conversations: 0, accessRecords: 0 }, erasedStudentHashes: [subjectHash], retainedStudentHashes: [] }])));
      const receipt = await restorePostgresBundle({ connectionString: restored.toString(), pgBin: tools, bundle, destination: restoredFiles, deletionLedger: ledgerPath });
      expect(receipt).toMatchObject({ revokedSessions: 1, fencedTasks: 1, assetsIncluded: false });
      expect(existsSync(join(restoredFiles, '.study-restore-incomplete'))).toBe(false);
      expect(readFileSync(join(restoredFiles, 'processing/blobs', sha256))).toEqual(bytes);
      expect(readFileSync(join(restoredFiles, 'student-media', keptMediaId, 'ready', sha256))).toEqual(bytes);
      expect(readFileSync(join(restoredFiles, 'student-media', pendingMediaId, 'chunks', `0-${sha256}`))).toEqual(bytes);
      expect(existsSync(join(restoredFiles, 'student-media', erasedMediaId))).toBe(false); expect(receipt.mediaDirectoriesPurged).toBe(1);
      const recovered = new DomainDatabase(restored.toString()); databases.push(recovered); await recovered.open();
      const snapshot = await recovered.read();
      expect(snapshot.state.diagnosticResponses).toEqual([{ id: 'original-evidence', score: 0.5 }]);
      expect(snapshot.state.students ?? []).toHaveLength(0); expect(receipt.appliedDeletionReceipts).toBe(1);
      expect(snapshot.state.diagnosticPlans).toEqual([{ id: 'plan', revision: 4 }]);
      expect((snapshot.state.sessions[0] as any).revokedAt).toBeTruthy();
      await expect(recovered.commit(snapshot, { ...snapshot.state, outputs: [{ id: 'old-worker-output' }] }, { fence: { id: oldWorker.id, token: oldWorker.leaseToken! } })).rejects.toThrow();
      const fresh = (await recovered.tasks.claim(['pdf.import']))!;
      await recovered.commit(snapshot, { ...snapshot.state, outputs: [{ id: 'recovered-output' }] }, { fence: { id: fresh.id, token: fresh.leaseToken! } });
      expect((await recovered.tasks.get(fresh.id))?.state).toBe('succeeded');
      await expect(restorePostgresBundle({ connectionString: restored.toString(), pgBin: tools, bundle, destination: join(directory, 'must-not-exist') })).rejects.toThrow('empty_database');
      expect(existsSync(join(directory, 'must-not-exist'))).toBe(false);
      const before = await db.read(); expect((before.state.sessions[0] as any).revokedAt).toBeNull();
      // A valid dump with inconsistent expected metadata fails after pg_restore;
      // changing the configured file directory cannot bypass the database guard.
      const manifestPath = join(bundle, 'manifest.json'), originalManifest = readFileSync(manifestPath, 'utf8'), manifest = JSON.parse(originalManifest);
      manifest.database.revision++; writeFileSync(manifestPath, JSON.stringify(manifest));
      const failed = new URL(restored.toString()); failed.pathname = '/' + names[2];
      const failedFiles = join(directory, 'failed-restore');
      await expect(restorePostgresBundle({ connectionString: failed.toString(), pgBin: tools, bundle, destination: failedFiles })).rejects.toThrow('restored_database_summary_mismatch');
      expect(existsSync(join(failedFiles, '.study-restore-incomplete'))).toBe(true);
      const failedControl = new Pool({ connectionString: failed.toString() });
      try {
        expect((await failedControl.query('SELECT state FROM study_restore_guard WHERE id=1')).rows[0].state).toBe('restoring');
        await expect(new DomainDatabase(failed.toString()).open()).rejects.toThrow('restoration is incomplete');
        await expect(createPostgresBundle({ connectionString: failed.toString(), pgBin: tools, dataDir: sourceFiles, destination: join(directory, 'refused-backup') })).rejects.toThrow('source_database_restore_incomplete');
        expect(existsSync(join(directory, 'refused-backup'))).toBe(false);
        await failedControl.query('DELETE FROM study_restore_guard');
        await expect(new DomainDatabase(failed.toString()).open()).rejects.toThrow('restoration is incomplete');
      } finally { await failedControl.end(); }
      writeFileSync(manifestPath, originalManifest);
      writeFileSync(join(bundle, 'database/postgres.dump'), 'damaged dump');
      await expect(verifyPostgresBundle({ bundle, pgBin: tools })).rejects.toThrow('bundle_integrity_failed');
      metrics.push({ case: 'native_backup_restore', passed: true, verifiedFiles: receipt.verifiedFiles, revokedSessions: receipt.revokedSessions, fencedTasks: receipt.fencedTasks, databaseGuardFailureVerified: true, privacyDeletionLedgerVerified: true });
    } finally {
      for (const db of databases) await db.close();
      for (const name of created) { if (!/^study_qa_(source|restored)_[a-f0-9]{32}$/.test(name)) throw new Error('Invalid owned database name'); await admin.query(`DROP DATABASE "${name}"`); }
      await admin.end(); rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
