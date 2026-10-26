import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
const require = createRequire(__filename);
const { createBundle, verifyBundle, restoreBundle } = require(resolve(__dirname, '../../../../scripts/operations/backup.cjs'));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('verified backup and isolated recovery', () => {
  it('backs up the live WAL snapshot and referenced bytes, restores learning records, revokes old access and fences old workers', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-backup-')), source = join(directory, 'source'), bundle = join(directory, 'bundle'), restored = join(directory, 'restored'), assets = join(directory, 'assets');
    mkdirSync(source); mkdirSync(assets); writeFileSync(join(assets, 'original.bin'), 'immutable private research fixture');
    const data = Buffer.from('%PDF-1.4 backup fixture'), sha256 = hash(data), fileId = `import_file_${randomUUID()}`;
    mkdirSync(join(source, 'processing', 'blobs'), { recursive: true }); writeFileSync(join(source, 'processing', 'blobs', sha256), data);
    const db = new DomainDatabase(join(source, 'study-agent.sqlite3')); await db.open();
    try {
      await db.commit(await db.read(), { users: [{ id: 'owner', principal: 'backup-fixture' }],
        sessions: [{ id: 'session', userId: 'owner', tokenHash: 'private-session-hash', revokedAt: null }],
        studentLearningCodes: [{ id: 'code', tokenHash: 'private-code-hash', usedAt: null, revokedAt: null }],
        studentInvitations: [{ id: 'invite', consumedAt: null, expiresAt: '2099-01-01' }],
        diagnosticResponses: [{ id: 'response', score: 0.75 }], diagnosticPlans: [{ id: 'plan', revision: 3 }],
        importFiles: [{ id: fileId, status: 'ready', sha256, size: data.length, chunks: [] }],
      }, { enqueue: [{ id: 'task', ownerUserId: 'owner', kind: 'pdf.import', requestKey: 'backup-task', payloadHash: 'hash', payload: { fileId }, createdAt: new Date().toISOString(), maxAttempts: 3 }] });
      const oldWorker = (await db.tasks.claim(['pdf.import']))!;
      const receipt = await createBundle({ dataDir: source, destination: bundle, assets });
      expect(receipt.files).toBe(3); expect(receipt.assetCount).toBe(1); expect((await verifyBundle({ bundle })).verifiedFiles).toBe(3);
      const current = await db.read(); await db.commit(current, { ...current.state, diagnosticPlans: [{ id: 'plan', revision: 4 }] });
      const result = await restoreBundle({ bundle, destination: restored });
      expect(result).toMatchObject({ revokedSessions: 1, revokedLearningCodes: 1, expiredInvitations: 1, fencedTasks: 1, assetsIncluded: true });
      expect(existsSync(join(restored, '.study-restore-incomplete'))).toBe(false);
      expect(readFileSync(join(restored, 'processing', 'blobs', sha256))).toEqual(data);
      expect(readFileSync(join(restored, 'assets', 'original.bin'), 'utf8')).toContain('research');
      const recovered = new DomainDatabase(join(restored, 'study-agent.sqlite3')); await recovered.open();
      try {
        const snapshot = await recovered.read();
        expect(snapshot.state.diagnosticPlans).toEqual([{ id: 'plan', revision: 3 }]);
        expect(snapshot.state.diagnosticResponses).toEqual([{ id: 'response', score: 0.75 }]);
        expect((snapshot.state.sessions[0] as any).revokedAt).toBeTruthy(); expect((snapshot.state.studentLearningCodes[0] as any).revokedAt).toBeTruthy();
        expect(Date.parse((snapshot.state.studentInvitations[0] as any).expiresAt)).toBeLessThanOrEqual(Date.now());
        expect(snapshot.state.events).toHaveLength(1);
        const task = await recovered.tasks.get('task'); expect(task?.state).toBe('retry_wait'); expect(task?.generation).toBe(2);
        await expect(recovered.commit(snapshot, { ...snapshot.state, outputs: [{ id: 'stale' }] }, { fence: { id: 'task', token: oldWorker.leaseToken! } })).rejects.toThrow();
        const fresh = (await recovered.tasks.claim(['pdf.import']))!;
        await recovered.commit(snapshot, { ...snapshot.state, outputs: [{ id: 'restored-work' }] }, { fence: { id: 'task', token: fresh.leaseToken! } });
        expect((await recovered.tasks.get('task'))?.state).toBe('succeeded');
        expect((await recovered.tasks.history('task')).some(h => h.action === 'restored')).toBe(true);
      } finally { await recovered.close(); }
      await expect(restoreBundle({ bundle, destination: restored })).rejects.toThrow('destination_already_exists');
      expect((await db.read()).state.diagnosticPlans).toEqual([{ id: 'plan', revision: 4 }]);
    } finally { await db.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it('fails closed on corruption, omitted referenced files, path traversal, unfinished bundles and overlapping destinations', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-backup-invalid-')), source = join(directory, 'source'), bundle = join(directory, 'bundle');
    mkdirSync(source); const db = new DomainDatabase(join(source, 'study-agent.sqlite3')); await db.open();
    try {
      await db.commit(await db.read(), { diagnosticResponses: [{ id: 'r', score: 1 }] });
      await expect(createBundle({ dataDir: source, destination: join(source, 'unsafe') })).rejects.toThrow('overlapping');
      await createBundle({ dataDir: source, destination: bundle });
      const manifestPath = join(bundle, 'manifest.json'), original = readFileSync(manifestPath, 'utf8'), manifest = JSON.parse(original);
      manifest.files[0].path = 'data/processing/../../outside'; writeFileSync(manifestPath, JSON.stringify(manifest));
      await expect(verifyBundle({ bundle })).rejects.toThrow('unsafe_relative_path');
      expect(existsSync(join(directory, 'outside'))).toBe(false);
      writeFileSync(manifestPath, original); writeFileSync(join(bundle, '.study-backup-incomplete'), 'unfinished');
      await expect(verifyBundle({ bundle })).rejects.toThrow('backup_incomplete');
      rmSync(join(bundle, '.study-backup-incomplete'));
      writeFileSync(join(bundle, 'database', 'study-agent.sqlite3'), 'corrupt');
      await expect(restoreBundle({ bundle, destination: join(directory, 'must-not-exist') })).rejects.toThrow('bundle_integrity_failed');
      expect(existsSync(join(directory, 'must-not-exist'))).toBe(false);
      const missingFile = { id: `import_file_${randomUUID()}`, status: 'ready', sha256: 'a'.repeat(64), size: 1 };
      const current = await db.read(); await db.commit(current, { ...current.state, importFiles: [missingFile] });
      await expect(createBundle({ dataDir: source, destination: join(directory, 'missing') })).rejects.toThrow();
      expect(existsSync(join(directory, 'missing', '.study-backup-incomplete'))).toBe(true);
    } finally { await db.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it('migrates a version-three database without changing evidence and refuses incomplete source restores even without the file marker', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-restore-guard-')), location = join(directory, 'study-agent.sqlite3');
    let database = new DomainDatabase(location); await database.open();
    try {
      await database.commit(await database.read(), { diagnosticResponses: [{ id: 'original', score: 0.25 }] });
      await database.close();
      const old = new DatabaseSync(location);
      old.exec('DELETE FROM schema_migrations WHERE version>=4; DROP TABLE study_restore_guard'); old.close();
      database = new DomainDatabase(location); await database.open();
      expect((await database.read()).state.diagnosticResponses).toEqual([{ id: 'original', score: 0.25 }]);
      await database.close();
      const guard = new DatabaseSync(location);
      try {
        expect(guard.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version).toBe(16);
        expect(guard.prepare('SELECT state FROM study_restore_guard WHERE id=1').get()?.state).toBe('ready');
        guard.exec("UPDATE study_restore_guard SET state='restoring'");
      } finally { guard.close(); }
      const refused = new DomainDatabase(location);
      await expect(refused.open()).rejects.toThrow('restoration is incomplete');
      await expect(createBundle({ dataDir: directory, destination: join(directory + '-backup') })).rejects.toThrow('source_database_restore_incomplete');
      const unblock = new DatabaseSync(location); unblock.exec("UPDATE study_restore_guard SET state='ready'"); unblock.close();
      writeFileSync(join(directory, '.study-restore-incomplete'), 'pending receipt');
      await expect(createBundle({ dataDir: directory, destination: join(directory + '-marker') })).rejects.toThrow('source_database_restore_incomplete');
    } finally { await database.close(); rmSync(directory, { recursive: true, force: true }); rmSync(directory + '-backup', { recursive: true, force: true }); }
  });
});
