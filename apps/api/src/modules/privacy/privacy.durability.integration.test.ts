import 'reflect-metadata';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
const require = createRequire(__filename);

describe('family deletion survives restart and old-snapshot recovery', () => {
  it('reapplies the latest deletion ledger inside recovery without resurrecting a closed account or erasing a shared child', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-privacy-recovery-')), source = join(directory, 'source'), bundle = join(directory, 'bundle'), recovered = join(directory, 'recovered');
    const previous = Object.fromEntries(['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED'].map(key => [key, process.env[key]]));
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: source, STUDY_WORKER_ENABLED: 'false' });
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { createBundle, restoreBundle, verifyBundle } = require(resolve(__dirname, '../../../../../scripts/operations/backup.cjs'));
    const { exportLedger, readLedger } = require(resolve(__dirname, '../../../../../scripts/operations/privacy-ledger.cjs'));
    async function start() { const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init(); return app; }
    let app: any, token: string;
    const credential = 'durable-privacy-secret';
    async function call(method: 'get' | 'post', path: string, body?: unknown, actor = token, expected = method === 'post' ? 201 : 200) {
      let q = request(app.getHttpServer())[method]('/api' + path); if (actor) q = q.set('Authorization', `Bearer ${actor}`); if (body !== undefined) q = q.send(body as object);
      return (await q.expect(expected)).body.data;
    }
    try {
      app = await start();
      const parent = await call('post', '/auth/register', { principal: 'durable-privacy-parent', credential }); token = parent.token;
      const other = await call('post', '/auth/register', { principal: 'durable-privacy-other', credential });
      async function child(nickname: string) { return (await call('post', '/students', { nickname, grade: 2, preferredSessionMinutes: 10, defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile; }
      const shared = await child('共同监护的档案'), exclusive = await child('独立管理的档案');
      const invite = await call('post', `/students/${shared.id}/invitations`, { recipientPrincipal: other.user.principal });
      await call('post', `/parents/${other.user.id}/bindings`, { studentId: shared.id, inviteToken: invite.token }, other.token);
      await call('post', `/students/${shared.id}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'durable-privacy-enable', reason: '检查备份恢复时旧账号和学习权限不会复活。' });
      const code = await call('post', `/students/${shared.id}/learning-access/codes`, { expectedVersion: 1, requestKey: 'durable-privacy-code' });
      const learner = await call('post', '/auth/learning-code', { code: code.code });
      const store = app.get(InMemoryStoreService);
      await store.transaction(() => {
        store.diagnosticResponses.push({ id: 'preserved-shared-response', studentId: shared.id, sessionId: 'shared-session', answer: '保留的原始表达', score: 0.75 },
          { id: 'erased-exclusive-response', studentId: exclusive.id, sessionId: 'exclusive-session', answer: '应删除的原始表达', score: 0 });
        store.diagnosticSessions.push({ id: 'shared-session', studentId: shared.id }, { id: 'exclusive-session', studentId: exclusive.id });
        store.diagnosticReports.push({ id: 'shared-report', sessionId: 'shared-session', report: { studentId: shared.id, version: 1 } });
        store.guidancePlanRevisions.push({ id: 'shared-plan-revision', planId: 'shared-plan', actorId: parent.user.id, snapshot: { studentId: shared.id, createdBy: parent.user.id } });
        store.diagnosticPlans.push({ id: 'shared-plan', studentId: shared.id });
      });
      const exported = await call('post', '/privacy/account/export', { credential, requestKey: 'before-deletion-export' });
      expect(exported.students).toHaveLength(2);
      await createBundle({ dataDir: source, destination: bundle });
      const preview = await call('get', '/privacy/account/deletion-preview');
      const receipt = await call('post', '/privacy/account/delete', { credential, requestKey: 'close-durable-parent', confirmation: preview.confirmation, fingerprint: preview.fingerprint });
      await call('get', '/auth/me', undefined, parent.token, 401); await call('get', '/auth/me', undefined, learner.token, 401);
      await app.close(); app = await start();
      await call('get', `/students/${shared.id}/profile`, undefined, other.token);
      await call('post', '/auth/login', { principal: parent.user.principal, credential }, '', 401);
      const ledgerPath = join(directory, 'latest-deletions.json'); const ledger = await exportLedger({ dataDir: source, destination: ledgerPath });
      expect(ledger.deletions).toBe(1); expect(readLedger(ledgerPath).entries[0].id).toBe(receipt.id);
      const ledgerText = readFileSync(ledgerPath, 'utf8'); expect(ledgerText).not.toContain(exclusive.nickname); expect(ledgerText).not.toContain(parent.user.principal);
      await app.close(); app = undefined;
      const restored = await restoreBundle({ bundle, destination: recovered, deletionLedger: ledgerPath });
      expect(restored.appliedDeletionReceipts).toBe(1); expect(restored.privacyRowsRemoved).toBeGreaterThan(0);
      expect(restored.deletionLedgerSha256).toBe(ledger.sha256);
      process.env.STUDY_DATA_DIR = recovered; app = await start();
      await call('get', '/auth/me', undefined, parent.token, 401); await call('get', '/auth/me', undefined, learner.token, 401);
      await call('post', '/auth/login', { principal: parent.user.principal, credential }, '', 401);
      const otherLogin = await call('post', '/auth/login', { principal: other.user.principal, credential }, '');
      const overview = await call('get', '/privacy/overview', undefined, otherLogin.token);
      expect(overview.children.map((row: any) => row.id)).toEqual([shared.id]);
      const recoveredStore = app.get(InMemoryStoreService);
      await recoveredStore.transaction(() => {
        expect(recoveredStore.diagnosticResponses.map((row: any) => row.answer)).toEqual(['保留的原始表达']);
        expect(recoveredStore.guidancePlanRevisions[0].actorId).toBe('deleted-account');
        expect(recoveredStore.privacyRequests.find((row: any) => row.id === receipt.id).kind).toBe('account_delete');
        expect(recoveredStore.events.some((row: any) => row.eventName === 'privacy.restore_deletions_applied')).toBe(true);
      });
      expect((await verifyBundle({ bundle })).manifest.database.collections.some((row: any) => row.collection === 'users' && row.count >= 3)).toBe(true);
      const damagedLedger = JSON.parse(ledgerText); damagedLedger.entries[0].erasedStudentHashes = []; writeFileSync(ledgerPath, JSON.stringify(damagedLedger));
      await expect(restoreBundle({ bundle, destination: join(directory, 'must-not-exist'), deletionLedger: ledgerPath })).rejects.toThrow('privacy_ledger_integrity_failed');
      expect(existsSync(join(directory, 'must-not-exist'))).toBe(false);
      if (process.env.STUDY_PRIVACY_EVIDENCE) writeFileSync(process.env.STUDY_PRIVACY_EVIDENCE, JSON.stringify({ at: new Date().toISOString(), driver: 'sqlite', passed: true,
        cases: ['portable_raw_evidence', 'credential_recheck', 'account_closed_across_restart', 'shared_child_preserved', 'deleted_child_absent', 'old_authentication_revoked',
          'deletion_ledger_applied_in_restore_transaction', 'shared_attribution_anonymized', 'corrupt_ledger_rejected_before_target_creation'],
        appliedDeletionReceipts: restored.appliedDeletionReceipts, privacyRowsRemoved: restored.privacyRowsRemoved, ledgerSha256: restored.deletionLedgerSha256,
        limits: 'Synthetic family data; new page browser interactions remain unverified. External offline copies require operator retention and the latest deletion ledger.' }, null, 2) + '\n');
    } finally {
      await app?.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120000);
});
