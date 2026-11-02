import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
const directory = mkdtempSync(join(qa, 'gesp-reader34-')), configured = process.env.STUDY_TEST_GESP_EVIDENCE_POSTGRES_URL;
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

let pool: Pool | undefined;
function currentReader() {
  // Compile the actual source into the owned fixture. Do not use the protected daemon's old workspace dist.
  const result = require('esbuild').buildSync({ absWorkingDir: root, entryPoints: ['apps/api/src/infrastructure/domain-database.ts'],
    bundle: true, platform: 'node', format: 'cjs', external: ['zod', 'sharp', '@nestjs/common', 'pdf-lib', 'pg'], write: false });
  const file = join(directory, 'current-reader.cjs'); writeFileSync(file, result.outputFiles[0].contents);
  delete require.cache[file]; return require(file).DomainDatabase;
}
function previousReader(version = 33) {
  const capsule = JSON.parse(gunzipSync(readFileSync(join(root, `resources/compatibility/gesp-before-evidence-schema${version}-reader-v1.json.gz`))).toString());
  expect(capsule.protocol).toBe(({33:'study-agent-pre-gesp-evidence33-reader-v1',34:'study-agent-pre-gesp-feedback34-reader-v1',35:'study-agent-pre-gesp-retention35-reader-v1'} as Record<number,string>)[version]);
  expect(sha(capsule.reader.code)).toBe(capsule.reader.sha256);
  for (const input of capsule.metadata.external) expect(sha(readFileSync(join(root, input.path)))).toBe(input.sha256);
  const file = join(directory, `reader${version}.cjs`);
  try { writeFileSync(file, capsule.reader.code, { flag: 'wx' }); } catch { expect(sha(readFileSync(file))).toBe(capsule.reader.sha256); }
  return require(file).DomainDatabase;
}
async function location() {
  if (!configured) return join(directory, randomUUID() + '.sqlite3');
  const url = new URL(configured);
  if (url.hostname !== '127.0.0.1' || url.port !== '15456' || url.pathname !== '/study_b4_gesp') throw Error('Exact block-four QA PostgreSQL required');
  pool ??= new Pool({ connectionString: configured, max: 2 }); const schema = 'gesp_evidence34_' + randomUUID().replaceAll('-', '');
  await pool.query('CREATE SCHEMA "' + schema + '"'); url.searchParams.set('options', '-c search_path=' + schema); return url.toString();
}
async function native(url: string) {
  const sqlite = configured ? undefined : new DatabaseSync(url, { readOnly: true }), pg = configured ? new Pool({ connectionString: url, max: 1 }) : undefined;
  try {
    const result: Record<string, unknown> = {};
    for (const [key, sql] of Object.entries({ records: 'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,position,record_id',
      migrations: 'SELECT * FROM schema_migrations ORDER BY version', guard: 'SELECT * FROM study_restore_guard', meta: 'SELECT * FROM store_meta',
      tasks: 'SELECT * FROM durable_tasks ORDER BY id', history: 'SELECT * FROM durable_task_history ORDER BY id' })) result[key] = sqlite ? sqlite.prepare(sql).all() : (await pg!.query(sql)).rows;
    return JSON.parse(JSON.stringify(result));
  } finally { sqlite?.close(); await pg?.end(); }
}
afterAll(async () => { await pool?.end(); });
describe('actual ' + (configured ? 'PostgreSQL' : 'SQLite') + ' GESP first-response minimum-reader boundary', () => {
  it('proves the frozen previous reader can write and cold-read its own schema33', async () => {
    const Reader = previousReader(), url = await location(), old = new Reader(url);
    await old.open(); try { await old.commit(await old.read(), { notebookEntries: [{ id: 'qa-previous33', content: 'Generated legacy-reader control' }] }); } finally { await old.close(); }
    const before = await native(url); expect(before.guard[0].state).toBe('ready-schema33-exact-edition-v1');
    const cold = new Reader(url); await cold.open(); await cold.close(); expect(await native(url)).toEqual(before);
  });
  it.each([33, 34, 35])('upgrades schema%s without changing historical facts and refuses its reader before writes', async (version) => {
    const Reader = previousReader(version), url = await location(), old = new Reader(url), original = { id: 'qa-legacy-gesp-probe',
      studentId: 'qa-child', atomId: 'gesp-cpp.l1.io', taskId: 'gesp-student-cpp-sum-two', status: 'correct', createdAt: '2026-10-01T00:00:00.000Z' };
    await old.open(); try { await old.commit(await old.read(), { gespProbeSubmissions: [original] }); } finally { await old.close(); }
    const CurrentReader = currentReader(), current = new CurrentReader(url); await current.open(); try { expect((await current.read()).state.gespProbeSubmissions).toEqual([original]); } finally { await current.close(); }
    const before = await native(url), bytes = configured ? null : sha(readFileSync(url));
    expect(before.guard[0].state).toBe('ready-schema36-gesp-retention-feedback-v1');
    expect(before.migrations.at(-1).version).toBe(36);
    const incompatible = new Reader(url); try { await expect(incompatible.open()).rejects.toThrow(/restoration is incomplete|unsupported_database_schema|minimum_reader_guard_mismatch/); } finally { await incompatible.close(); }
    expect(await native(url)).toEqual(before); if (bytes) expect(sha(readFileSync(url))).toBe(bytes);
    const cold = new CurrentReader(url); await cold.open(); try { expect((await cold.read()).state.gespProbeSubmissions).toEqual([original]); } finally { await cold.close(); }
  });
  it('rolls back the36 marker and version atomically when the migration is interrupted', async () => {
    const Reader = previousReader(35), url = await location(), old = new Reader(url); await old.open(); await old.close();
    async function execute(sql: string) {
      if (configured) { const pg = new Pool({ connectionString: url, max: 1 }); try { await pg.query(sql); } finally { await pg.end(); } }
      else { const db = new DatabaseSync(url); try { db.exec(sql); } finally { db.close(); } }
    }
    if (configured) {
      await execute("CREATE FUNCTION reject_gesp36() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.state=''ready-schema36-gesp-retention-feedback-v1'' THEN RAISE EXCEPTION ''injected_gesp36_failure''; END IF; RETURN NEW; END'");
      await execute('CREATE TRIGGER reject_gesp36 BEFORE UPDATE ON study_restore_guard FOR EACH ROW EXECUTE FUNCTION reject_gesp36()');
    } else await execute("CREATE TRIGGER reject_gesp36 BEFORE UPDATE ON study_restore_guard WHEN NEW.state='ready-schema36-gesp-retention-feedback-v1' BEGIN SELECT RAISE(ABORT,'injected_gesp36_failure'); END");
    const before = await native(url), CurrentReader = currentReader(), failed = new CurrentReader(url);
    try { await expect(failed.open()).rejects.toThrow('injected_gesp36_failure'); } finally { await failed.close(); }
    expect(await native(url)).toEqual(before);
    const legacy = new Reader(url); await legacy.open(); await legacy.close();
    await execute('DROP TRIGGER reject_gesp36' + (configured ? ' ON study_restore_guard' : ''));
    const recovered = new CurrentReader(url); await recovered.open(); await recovered.close();
    expect((await native(url)).guard[0].state).toBe('ready-schema36-gesp-retention-feedback-v1');
  });
});
