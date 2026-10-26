import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import request from 'supertest';

const connection = process.env.STUDY_TEST_PAPER_PRACTICE_POSTGRES_URL;
for (const driver of ['sqlite', 'postgres'] as const) describe.skipIf(driver === 'postgres' && !connection)(driver + ' original paper practice native recovery', () => {
  it('cold restores exact first answers, corrections and request receipts with original media, and applies newer child and account deletion receipts', async () => {
    const repo = resolve(__dirname, '../../../../..'), qa = join(repo, 'data/qa'); mkdirSync(qa, { recursive: true });
    const directory = mkdtempSync(join(qa, 'paper-practice-native-')), databases: string[] = [];
    const names = ['NODE_ENV', 'DATABASE_URL', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_ASSET_ROOT', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'XIAOJIU_CHAT_ENABLED'] as const;
    const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
    const backup = require(join(repo, 'scripts/operations/backup.cjs')), native = require(join(repo, 'scripts/operations/postgres-backup.cjs'));
    const ledger = require(join(repo, 'scripts/operations/privacy-ledger.cjs'));
    const assets = require(join(repo, 'scripts/qa/paper-practice-fixture.cjs')).preparePaperPracticeAssets(directory, repo);
    const principal = 'paper-native-' + randomUUID(), credential = 'Synthetic-Paper-Native-20261026', bundle = join(directory, 'bundle');
    let app: any, store: any, actor: any, admin: Pool | undefined;
    const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
    async function database() {
      if (driver === 'sqlite') return '';
      const name = 'study_qa_paper_native_' + randomUUID().replace(/-/g, ''); await admin!.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
      const url = new URL(connection!); url.pathname = '/' + name; return url.toString();
    }
    async function boot(location: string, root: string, originals: string) {
      Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: location, STUDY_STORAGE: driver, STUDY_DATA_DIR: root, STUDY_ASSET_ROOT: originals,
        STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
      app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
      store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    }
    async function call(method: 'get' | 'post', path: string, body?: unknown, status = method === 'post' ? 201 : 200, token = actor?.token) {
      let query = request(app.getHttpServer())[method]('/api' + path); if (token) query = query.set('Authorization', 'Bearer ' + token); if (body !== undefined) query = query.send(body as object);
      const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(status); return response.body.data;
    }
    async function create(studentId: string | null) {
      const selection = [{ paperId: 'qa:paper:0:complete' }, { paperId: 'qa:paper:0:pdf' }], preview = await call('post', '/library/practice/preview', { studentId, selection });
      const command = { studentId, selection, sourceHash: preview.sourceHash, requestKey: randomUUID() }; return { command, row: await call('post', '/library/practice/sessions', command) };
    }
    const commandPath = (id: string) => '/library/practice/sessions/' + id + '/commands';
    async function change(row: any, input: object) {
      const command = { ...input, expectedVersion: row.version, requestKey: randomUUID() }; return { command, result: await call('post', commandPath(row.id), command) };
    }
    async function restore(location: string, destination: string, deletionLedger?: string) {
      const options = { bundle, destination, connectionString: location, deletionLedger, pgBin: process.env.STUDY_TEST_PG_BIN };
      return driver === 'sqlite' ? backup.restoreBundle(options) : native.restorePostgresBundle(options);
    }
    try {
      if (driver === 'postgres') {
        const probe = new Pool({ connectionString: connection }); try { expect((await probe.query('SELECT current_database() name,current_user owner')).rows[0]).toEqual({ name: 'study_agent_qa', owner: 'study_agent_app' }); } finally { await probe.end(); }
        if (!process.env.STUDY_TEST_POSTGRES_ADMIN_URL || !process.env.STUDY_TEST_PG_BIN) throw Error('Dedicated native paper QA settings required');
        admin = new Pool({ connectionString: process.env.STUDY_TEST_POSTGRES_ADMIN_URL }); expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
      }
      const source = join(directory, 'source'), sourceLocation = await database(); await boot(sourceLocation, source, assets);
      actor = await call('post', '/auth/register', { principal, credential });
      await store.transaction(() => { store.find('users', { id: actor.user.id }).role = 'admin'; });
      for (const id of ['qa:paper:0:complete', 'qa:paper:0:pdf']) await call('post', '/library/papers/' + encodeURIComponent(id) + '/publication', {
        status: 'published', reason: '原创恢复夹具逐项核对', licenseEvidence: '合成题干与原图 PDF 均为测试独立构造', contentReviewed: true, mediaReviewed: true });
      await store.transaction(() => { store.find('users', { id: actor.user.id }).role = 'parent'; });
      const child = (await call('post', '/students', { nickname: '匿名原卷恢复', grade: 3, preferredSessionMinutes: 10, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
      const childStart = await create(child); let row = childStart.row;
      const submitted = await change(row, { kind: 'submit', itemId: row.items[0].id, disposition: 'answered', text: '原生备份前不可覆盖的首答' }); row = submitted.result.session;
      row = (await change(row, { kind: 'reveal', itemId: row.items[0].id })).result.session;
      row = (await change(row, { kind: 'self_review', itemId: row.items[0].id, value: 'needs_correction' })).result.session;
      const corrected = await change(row, { kind: 'correct', itemId: row.items[0].id, text: '订正与原答分别保留，不自动量化' }); row = corrected.result.session;
      row = (await change(row, { kind: 'complete', acknowledgeUnanswered: true })).result.session;
      const organized = await change(row, { kind: 'organize', itemId: row.items[0].id, values: { tags: ['原生恢复'], favorite: true, archived: false, errorSteps: '遗漏了条件的单位', reflection: 'PRIVATE_NATIVE_REVIEW_原反思完整保留', plannedDate: '2026-11-09' } }); row = organized.result.session;
      const reviewed = await change(row, { kind: 'review_complete', itemId: row.items[0].id }); row = reviewed.result.session;
      const adultStart = await create(null), paused = (await change(adultStart.row, { kind: 'pause' })).result.session;
      const frozen = await store.requestContext(() => structuredClone({ session: store.find('paperPracticeSessions', { id: row.id }), commands: store.select('paperPracticeCommands', { sessionId: row.id }) }));
      const options = { dataDir: source, destination: bundle, assets, connectionString: sourceLocation, pgBin: process.env.STUDY_TEST_PG_BIN };
      if (driver === 'sqlite') await backup.createBundle(options); else await native.createPostgresBundle(options);
      const verified = driver === 'sqlite' ? await backup.verifyBundle({ bundle }) : await native.verifyPostgresBundle({ bundle, pgBin: process.env.STUDY_TEST_PG_BIN });
      expect(verified.manifest.database.schemaVersions.at(-1)).toBe(18);
      await app.close(); app = null; const target = join(directory, 'target'), targetLocation = await database(); expect((await restore(targetLocation, target)).assetsIncluded).toBe(true);
      const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
      for (const name of ['catalog.sqlite3', 'shijuanbao/archive.sqlite3', 'shijuanbao/media/figure.png', 'shijuanbao/media/paper.pdf']) expect(hash(join(target, 'assets', name))).toBe(hash(join(assets, name)));
      await boot(targetLocation, target, join(target, 'assets')); await call('get', '/auth/me', undefined, 401, actor.token); actor = await call('post', '/auth/login', { principal, credential }, 201, '');
      expect(await store.requestContext(() => structuredClone({ session: store.find('paperPracticeSessions', { id: row.id }), commands: store.select('paperPracticeCommands', { sessionId: row.id }) }))).toEqual(frozen);
      expect((await call('get', '/library/practice/requests/' + childStart.command.requestKey)).session.id).toBe(row.id);
      expect((await call('post', '/library/practice/sessions', childStart.command)).id).toBe(row.id);
      for (const original of [submitted, corrected, organized, reviewed]) {
        const receipt = await call('get', commandPath(row.id) + '/' + original.command.requestKey); expect(receipt.appliedVersion).toBe(original.result.appliedVersion);
        expect((await call('post', commandPath(row.id), original.command)).appliedVersion).toBe(original.result.appliedVersion);
      }
      expect((await call('get', '/library/practice/sessions/' + paused.id)).status).toBe('paused');
      const item = await call('get', '/library/practice/sessions/' + row.id + '/items/' + row.items[0].id); expect(item.firstAnswer.text).toBe('原生备份前不可覆盖的首答'); expect(item.corrections).toHaveLength(1); expect(item.reference.answerHtml).toContain('合成原参考：5');
      expect(item.organization).toMatchObject({ reflection: 'PRIVATE_NATIVE_REVIEW_原反思完整保留', plannedDate: '2026-11-09', status: 'reviewed', history: [{ action: 'organize' }, { action: 'review_complete' }] });
      const calendar = await call('get', '/library/practice/reviews/calendar?from=2026-11-01&to=2026-11-30'); expect(calendar.events.filter((event: any) => event.sessionId === row.id)).toHaveLength(1);
      const ics = await call('get', '/library/practice/reviews/calendar/export?from=2026-11-01&to=2026-11-30'); expect(ics.content).toContain('DTSTART;VALUE=DATE:20261109'); expect(ics.content).not.toContain('PRIVATE_NATIVE_REVIEW');
      const exported = await call('post', '/privacy/account/export', { credential, requestKey: randomUUID() }); expect(exported.accountRecords.paperPracticeSessions.some((record: any) => record.id === row.id)).toBe(true);
      const portableCommand = exported.accountRecords.paperPracticeCommands.find((record: any) => record.sessionId === row.id && record.kind === 'submit');
      expect(portableCommand).toMatchObject({ appliedVersion: submitted.result.appliedVersion });
      expect(portableCommand).not.toHaveProperty('requestKey'); expect(portableCommand).not.toHaveProperty('inputHash');
      const preview = await call('get', '/privacy/students/' + child + '/deletion-preview'); await call('post', '/privacy/students/' + child + '/delete', { credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() });
      await call('get', '/library/practice/sessions/' + row.id, undefined, 404); expect((await call('get', '/library/practice/sessions/' + paused.id)).status).toBe('paused');
      const account = await call('get', '/privacy/account/deletion-preview'); await call('post', '/privacy/account/delete', { credential, confirmation: account.confirmation, fingerprint: account.fingerprint, requestKey: randomUUID() });
      const deletionLedger = join(directory, 'latest-deletions.json'); expect((await ledger.exportLedger({ ...driver === 'sqlite' ? { dataDir: target } : { connectionString: targetLocation }, destination: deletionLedger })).deletions).toBe(2);
      await app.close(); app = null; const deleted = join(directory, 'deleted'), deletedLocation = await database(); expect((await restore(deletedLocation, deleted, deletionLedger)).appliedDeletionReceipts).toBe(2);
      await boot(deletedLocation, deleted, join(deleted, 'assets')); await call('post', '/auth/login', { principal, credential }, 401, '');
      await store.requestContext(() => { expect(store.paperPracticeSessions).toHaveLength(0); expect(store.paperPracticeCommands).toHaveLength(0); expect(store.paperPublications.length).toBe(2); });
      await app.close(); app = null;
      if (driver === 'sqlite') { const future = new DatabaseSync(join(deleted, 'study-agent.sqlite3')); try { future.prepare('INSERT INTO schema_migrations VALUES(19,?)').run(new Date().toISOString()); } finally { future.close(); } }
      else { const future = new Pool({ connectionString: deletedLocation }); try { await future.query('INSERT INTO schema_migrations(version) VALUES(19)'); } finally { await future.end(); } }
      const futureOptions = { dataDir: deleted, destination: join(directory, 'future-refused'), connectionString: deletedLocation, pgBin: process.env.STUDY_TEST_PG_BIN };
      await expect(driver === 'sqlite' ? backup.createBundle(futureOptions) : native.createPostgresBundle(futureOptions)).rejects.toThrow('unsupported_database_schema');
      expect(existsSync(join(futureOptions.destination, 'manifest.json'))).toBe(false);
    } finally {
      await app?.close(); if (admin) { try { for (const name of databases) { if (!/^study_qa_paper_native_[a-f0-9]{32}$/.test(name)) throw Error('Unsafe native paper QA database'); await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)'); } } finally { await admin.end(); } }
      for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
      if (!resolve(directory).startsWith(resolve(qa) + sep)) throw Error('Unsafe native paper QA directory'); rmSync(directory, { recursive: true, force: true });
    }
  }, 60000);
});
