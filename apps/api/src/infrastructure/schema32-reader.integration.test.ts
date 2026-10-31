import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';

let workspace = resolve(__dirname); while (!existsSync(join(workspace, '.git')) && dirname(workspace) !== workspace) workspace = dirname(workspace);
const root = resolve(__dirname, '../../../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
const baseline = mkdtempSync(join(qa, 'actual-reader31-for32-')), sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const archive = readFileSync(join(root, 'resources/compatibility/domain-reader-schema31-v1.json.gz')), receipt = JSON.parse(readFileSync(join(root, 'resources/compatibility/domain-reader-schema31-v1.receipt.json'), 'utf8'));
expect(sha(archive)).toBe(receipt.gzipSha256); const manifest = JSON.parse(gunzipSync(archive, { maxOutputLength: 40 * 1024 * 1024 }).toString('utf8'));
expect(manifest.protocol).toBe('study-domain-reader31-baseline-v1'); expect(manifest.schemaVersion).toBe(31);
for (const [name, value] of Object.entries(manifest.files) as [string, { base64: string; sha256: string }][]) {
  if (!/^(apps\/api\/dist\/|packages\/(contracts|config)\/|scripts\/operations\/)/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..') || /[\\:\x00]/.test(name)) throw Error('Unsafe actual reader31 member');
  const bytes = Buffer.from(value.base64, 'base64'); expect(sha(bytes), name).toBe(value.sha256); const target = join(baseline, name);
  mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: 'wx' });
}
for (const item of manifest.externalDependencies) { if (!item.path.startsWith('node_modules/') || item.path.split('/').includes('..')) throw Error('Unsafe reader31 dependency'); expect(sha(readFileSync(join(workspace, item.path))), item.path).toBe(item.sha256); }
mkdirSync(join(baseline, 'node_modules/@study-agent'), { recursive: true });
for (const name of ['contracts', 'config']) symlinkSync(join(baseline, 'packages', name), join(baseline, 'node_modules/@study-agent', name), 'junction');
const { DomainDatabase: Reader31 } = require(join(baseline, 'apps/api/dist/apps/api/src/infrastructure/domain-database.js')),
  oldGuard = require(join(baseline, 'scripts/operations/database-reader-guard.cjs'));
const configured = process.env.STUDY_TEST_PAPER_LIBRARY_POSTGRES_URL;
for (const driver of ['sqlite', 'postgres'] as const) (driver === 'sqlite' || configured ? describe : describe.skip)(driver + ' actual31 reader migration/refusal for32', () => {
  const folder = mkdtempSync(join(qa, 'reader32-' + driver + '-')); let pool: Pool | undefined;
  async function location(label: string) {
    if (driver === 'sqlite') { const directory = join(folder, label); mkdirSync(directory); return join(directory, 'study-agent.sqlite3'); }
    const url = new URL(configured!); if (url.hostname !== '127.0.0.1' || url.port !== '15443' || url.pathname !== '/study_paper_persistence') throw Error('Exclusive reader32 PostgreSQL fixture required');
    pool ??= new Pool({ connectionString: configured!, max: 2 }); const schema = 'study_paper_reader_' + randomUUID().replaceAll('-', ''); await pool.query('CREATE SCHEMA "' + schema + '"');
    url.searchParams.set('options', '-c search_path=' + schema); return url.toString();
  }
  async function sql(url: string, text: string, values: any[] = []): Promise<any[]> {
    if (driver === 'sqlite') { const { DatabaseSync } = await import('node:sqlite'), db = new DatabaseSync(url); try { return db.prepare(text).all(...values); } finally { db.close(); } }
    const client = new Pool({ connectionString: url, max: 1 }); try { let parameter = 0; return (await client.query(text.replace(/\?/g, () => '$' + ++parameter), values)).rows; } finally { await client.end(); }
  }
  async function snapshot(url: string) { return { rows: (await sql(url, 'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,position,record_id')).map(row => ({ ...row, body: typeof row.body === 'string' ? JSON.parse(row.body) : row.body })),
    meta: await sql(url, 'SELECT * FROM store_meta'), tasks: await sql(url, 'SELECT * FROM durable_tasks'), history: await sql(url, 'SELECT * FROM durable_task_history') }; }
  const version = async (url: string) => Number((await sql(url, 'SELECT MAX(version) version FROM schema_migrations'))[0].version);
  async function original(label: string) { const url = await location(label), old = new Reader31(url); await old.open();
    try { await old.commit(await old.read(), { users: [{ id: 'reader-owner', principal: 'synthetic-reader32-owner', role: 'parent', status: 'active', version: 1 }] }); } finally { await old.close(); } return url; }
  afterAll(async () => { await pool?.end(); });
  it('migrates the sealed actual31 without changing original rows and refuses32 in the unmodified old reader before writing', async () => {
    const url = await original('migration'), before = await snapshot(url); expect(await version(url)).toBe(31);
    const current = new DomainDatabase(url); await current.open(); await current.close(); expect(await version(url)).toBe(32); expect(await snapshot(url)).toEqual(before);
    const bytes = driver === 'sqlite' ? sha(readFileSync(url)) : null, old = new Reader31(url); await expect(old.open()).rejects.toThrow(/restoration|schema|reader/i);
    expect(await snapshot(url)).toEqual(before); if (bytes) expect(sha(readFileSync(url))).toBe(bytes);
    expect(() => oldGuard.assertReady('ready-schema32', Array.from({ length: 32 }, (_, index) => index + 1))).toThrow('unsupported_database_schema');
  });
  it('rejects an incomplete native original before advancing the31 marker or recording32', async () => {
    const url = await original('invalid'), old = new Reader31(url); await old.open(); try { await old.commit(await old.read(), { paperExports: [{ id: 'orphan-export-original', protocol: 'paper-export-record-v1' }] }); } finally { await old.close(); }
    const before = await snapshot(url); await expect(new DomainDatabase(url).open()).rejects.toThrow('paper_export_native_integrity_failed');
    expect(await version(url)).toBe(31); expect(await snapshot(url)).toEqual(before);
  });
  it('rolls the32 constraints/version and minimum reader marker back together on actual migration failure', async () => {
    const url = await original('rollback'), before = await snapshot(url);
    if (driver === 'sqlite') await sql(url, "CREATE TRIGGER reject_reader32 BEFORE UPDATE ON study_restore_guard WHEN NEW.state='ready-schema32' BEGIN SELECT RAISE(ABORT,'injected_reader32_failure'); END");
    else { await sql(url, "CREATE FUNCTION reject_reader32() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.state=''ready-schema32'' THEN RAISE EXCEPTION ''injected_reader32_failure''; END IF; RETURN NEW; END'"); await sql(url, 'CREATE TRIGGER reject_reader32 BEFORE UPDATE ON study_restore_guard FOR EACH ROW EXECUTE FUNCTION reject_reader32()'); }
    await expect(new DomainDatabase(url).open()).rejects.toThrow('injected_reader32_failure'); expect(await version(url)).toBe(31); expect(await snapshot(url)).toEqual(before);
    const old = new Reader31(url); await old.open(); await old.close(); expect(await version(url)).toBe(31);
    await sql(url, 'DROP TRIGGER reject_reader32' + (driver === 'postgres' ? ' ON study_restore_guard' : '')); const current = new DomainDatabase(url); await current.open(); await current.close();
    expect(await version(url)).toBe(32); expect(await snapshot(url)).toEqual(before);
  });
  it('refuses unknown future33 before resetting its marker or touching original records', async () => {
    const url = await original('future'), current = new DomainDatabase(url); await current.open(); await current.close(); await sql(url, 'INSERT INTO schema_migrations(version,applied_at) VALUES(33,?)', [new Date().toISOString()]);
    const before = await snapshot(url); await expect(new DomainDatabase(url).open()).rejects.toThrow('unsupported_database_schema'); expect(await snapshot(url)).toEqual(before); expect(await version(url)).toBe(33);
  });
});
