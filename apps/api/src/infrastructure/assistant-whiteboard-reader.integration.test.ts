import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { gunzipSync } from 'node:zlib';

const root = resolve(__dirname, '../../../..'), qa = join(root, 'data/qa');
mkdirSync(qa, { recursive: true });
const baseline = mkdtempSync(join(qa, 'reader22-extract-'));
const bundle = readFileSync(join(root, 'resources/compatibility/domain-reader-schema22-v1.json.gz'));
const receipt = JSON.parse(readFileSync(join(root, 'resources/compatibility/domain-reader-schema22-v1.receipt.json'), 'utf8'));
expect(createHash('sha256').update(bundle).digest('hex')).toBe(receipt.gzipSha256);
const manifest = JSON.parse(gunzipSync(bundle, { maxOutputLength: 32 * 1024 * 1024 }).toString('utf8'));
expect(manifest.protocol).toBe('study-domain-reader22-baseline-v1'); expect(manifest.schemaVersion).toBe(22);
for (const [name, record] of Object.entries(manifest.files) as [string, { sha256: string; base64: string }][]) {
  if (!/^(apps\/api\/dist\/|scripts\/operations\/)/.test(name) || name.split('/').some(part => !part || part === '..' || part === '.') || /[\\:\x00]/.test(name)) throw Error('Unsafe compatibility baseline path');
  const bytes = Buffer.from(record.base64, 'base64'), target = join(baseline, name);
  expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(record.sha256);
  mkdirSync(resolve(target, '..'), { recursive: true }); writeFileSync(target, bytes, { flag: 'wx' });
}
afterAll(() => { if (!resolve(baseline).startsWith(qa + sep)) throw Error('Unsafe compatibility extraction'); rmSync(baseline, { recursive: true, force: true }); });
const { DomainDatabase } = require('../../dist/apps/api/src/infrastructure/domain-database.js');
const { DomainDatabase: OldReader } = require(join(baseline, 'apps/api/dist/apps/api/src/infrastructure/domain-database.js'));
const backup = require(join(root, 'scripts/operations/backup.cjs')), oldBackup = require(join(baseline, 'scripts/operations/backup.cjs'));
for (const [name, record] of Object.entries(manifest.files) as [string, { sha256: string }][]) {
  expect(createHash('sha256').update(readFileSync(join(baseline, name))).digest('hex'), name).toBe(record.sha256);
}
const pgUrl = process.env.STUDY_TEST_ASSISTANT_WHITEBOARD_STORAGE_POSTGRES_URL;
for (const driver of ['sqlite', 'postgres'] as const) (driver === 'sqlite' || pgUrl ? describe : describe.skip)(driver + ' actual schema22 reader through conversation-whiteboard23 and practice24', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-reader23-')), schemas: string[] = [];
  let pg: Pool | undefined;
  async function location(label: string) {
    if (driver === 'sqlite') return join(directory, label, 'study-agent.sqlite3');
    const target = new URL(pgUrl!); expect(target.hostname).toBe('127.0.0.1'); expect(target.port).toBe(process.env.CI === 'true' ? '5432' : '15439');
    pg ??= new Pool({ connectionString: target.toString() }); expect((await pg.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa');
    const schema = 'study_qa_reader23_' + randomUUID().replaceAll('-', ''); schemas.push(schema); await pg.query('CREATE SCHEMA "' + schema + '"'); target.searchParams.set('options', '-c search_path=' + schema); return target.toString();
  }
  async function sql(url: string, text: string, values: any[] = []) {
    if (driver === 'sqlite') { const db = new DatabaseSync(url); try { return db.prepare(text).all(...values); } finally { db.close(); } }
    const client = new Pool({ connectionString: url }); try { let index = 0; return (await client.query(text.replace(/\?/g, () => '$' + ++index), values)).rows; } finally { await client.end(); }
  }
  async function recordSnapshot(url: string) { return { records: await sql(url, 'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,record_id'), meta: await sql(url, 'SELECT * FROM store_meta') }; }
  async function version(url: string) { return Number((await sql(url, 'SELECT MAX(version) version FROM schema_migrations'))[0].version); }
  async function state(url: string) { return (await sql(url, 'SELECT state FROM study_restore_guard WHERE id=1'))[0].state; }
  async function original(label: string) {
    const url = await location(label), reader = new OldReader(url); await reader.open();
    try { expect(await version(url)).toBe(22); await reader.commit(await reader.read(), { studioTopicWhiteboards: [{ id: 'original-v1-board', ownerUserId: 'synthetic-owner', studentId: null, kind: 'ai-topic-whiteboard', title: 'Original v1 teaching' }], notebookEntries: [{ id: 'original-notebook', content: 'Owned synthetic original' }] }); }
    finally { await reader.close(); }
    return url;
  }
  afterAll(async () => {
    if (pg) { for (const schema of schemas) { if (!/^study_qa_reader23_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe reader schema'); await pg.query('DROP SCHEMA "' + schema + '" CASCADE'); } await pg.end(); }
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe reader directory'); rmSync(directory, { recursive: true, force: true });
  });
  it('upgrades unchanged original records and the saved old reader rejects before opening or rewriting them', async () => {
    const url = await original('upgrade'), before = await recordSnapshot(url), current = new DomainDatabase(url); await current.open(); await current.close();
    expect(await version(url)).toBe(24); expect(await state(url)).toBe('ready-schema24'); expect(await recordSnapshot(url)).toEqual(before);
    const old = new OldReader(url); try { await expect(old.open()).rejects.toThrow('Database restoration is incomplete'); } finally { await old.close(); }
    expect(await recordSnapshot(url)).toEqual(before); expect(await version(url)).toBe(24); expect(await state(url)).toBe('ready-schema24');
  });
  it('rolls back the marker and migration together when the actual marker write is interrupted', async () => {
    const url = await original('rollback'), before = await recordSnapshot(url);
    if (driver === 'sqlite') await sql(url, "CREATE TRIGGER reject_reader23 BEFORE UPDATE ON study_restore_guard WHEN NEW.state='ready-schema23' BEGIN SELECT RAISE(ABORT,'injected_reader23_failure'); END");
    else {
      await sql(url, "CREATE FUNCTION reject_reader23() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.state=''ready-schema23'' THEN RAISE EXCEPTION ''injected_reader23_failure''; END IF; RETURN NEW; END'");
      await sql(url, 'CREATE TRIGGER reject_reader23 BEFORE UPDATE ON study_restore_guard FOR EACH ROW EXECUTE FUNCTION reject_reader23()');
    }
    const current = new DomainDatabase(url); try { await expect(current.open()).rejects.toThrow('injected_reader23_failure'); } finally { await current.close(); }
    expect(await version(url)).toBe(22); expect(await state(url)).toBe('ready'); expect(await recordSnapshot(url)).toEqual(before);
    const old = new OldReader(url); await old.open(); await old.close(); expect(await version(url)).toBe(22);
    await sql(url, 'DROP TRIGGER reject_reader23' + (driver === 'postgres' ? ' ON study_restore_guard' : ''));
    const retry = new DomainDatabase(url); await retry.open(); await retry.close(); expect(await state(url)).toBe('ready-schema24'); expect(await recordSnapshot(url)).toEqual(before);
  });
  it('refuses future25 and inconsistent current markers without silently resetting either one', async () => {
    const url = await original('future'), current = new DomainDatabase(url); await current.open(); await current.close(); const before = await recordSnapshot(url);
    await sql(url, driver === 'sqlite' ? 'INSERT INTO schema_migrations VALUES(25,?)' : 'INSERT INTO schema_migrations(version,applied_at) VALUES(25,?)', [new Date().toISOString()]);
    const future = new DomainDatabase(url); try { await expect(future.open()).rejects.toThrow('unsupported_database_schema'); } finally { await future.close(); }
    expect(await version(url)).toBe(25); expect(await recordSnapshot(url)).toEqual(before); await sql(url, 'DELETE FROM schema_migrations WHERE version=25');
    await sql(url, "UPDATE study_restore_guard SET state='ready' WHERE id=1"); const inconsistent = new DomainDatabase(url);
    try { await expect(inconsistent.open()).rejects.toThrow('minimum_reader_guard_mismatch'); } finally { await inconsistent.close(); }
    expect(await state(url)).toBe('ready'); expect(await recordSnapshot(url)).toEqual(before);
  });
  if (driver === 'sqlite') it('keeps old22 backup compatibility and current24 native restore markers, including resume after a legal upgrade', async () => {
    const url = await original('backup'), dataDir = resolve(url, '..'), legacyBundle = join(directory, 'legacy-bundle'), legacyRestored = join(directory, 'legacy-restored');
    await backup.createBundle({ dataDir, destination: legacyBundle }); expect((await backup.verifyBundle({ bundle: legacyBundle })).database.schemaVersions.at(-1)).toBe(22);
    const legacyReceipt = await backup.restoreBundle({ bundle: legacyBundle, destination: legacyRestored }); const restoredUrl = join(legacyRestored, 'study-agent.sqlite3');
    expect(await state(restoredUrl)).toBe('ready'); const old = new OldReader(restoredUrl); await old.open(); await old.close();
    const upgraded = new DomainDatabase(restoredUrl); await upgraded.open(); try { await upgraded.commit(await upgraded.read(), { notebookEntries: [{ id: 'original-notebook', content: 'Owned synthetic original' }, { id: 'after-upgrade', content: 'Keep later work' }] }); } finally { await upgraded.close(); }
    expect(await backup.restoreBundle({ bundle: legacyBundle, destination: legacyRestored, resume: true })).toEqual(legacyReceipt); expect((await sql(restoredUrl, "SELECT record_id FROM domain_records WHERE record_id='after-upgrade'")).length).toBe(1);
    const bundle = join(directory, 'current24-bundle'), destination = join(directory, 'current24-restored'); await backup.createBundle({ dataDir: legacyRestored, destination: bundle }); expect((await backup.verifyBundle({ bundle })).database.schemaVersions.at(-1)).toBe(24);
    await expect(oldBackup.createBundle({ dataDir: legacyRestored, destination: join(directory, 'old-backup-refused') })).rejects.toThrow('source_database_restore_incomplete');
    const receipt = await backup.restoreBundle({ bundle, destination }); expect(await state(join(destination, 'study-agent.sqlite3'))).toBe('ready-schema24'); expect(await backup.restoreBundle({ bundle, destination, resume: true })).toEqual(receipt);
    const rejected = new OldReader(join(destination, 'study-agent.sqlite3')); try { await expect(rejected.open()).rejects.toThrow('Database restoration is incomplete'); } finally { await rejected.close(); }
    const readable = new DomainDatabase(join(destination, 'study-agent.sqlite3')); await readable.open(); await readable.close();
  });
});
