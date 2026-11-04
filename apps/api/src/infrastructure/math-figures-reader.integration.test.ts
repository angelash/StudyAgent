const {SCHEMA_VERSION:latestSchemaVersion,READY_STATE:latestReadyState}=require('../../../../scripts/operations/database-reader-guard.cjs');
import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import { teachingFixture } from '../modules/diagnostics/textbook-teaching-fixture';
import { prepareTextbookTeachingPackage } from '../modules/diagnostics/textbook-teaching-package';
import { prepareTeachingChange } from '../modules/diagnostics/textbook-teaching-record';

const root = resolve(process.cwd(), '../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
let workspace = root; while (!existsSync(join(workspace, '.git')) && dirname(workspace) !== workspace) workspace = dirname(workspace);
const directory = mkdtempSync(join(qa, 'math-reader37-')), configured = process.env.STUDY_TEST_MATH_FIGURES_POSTGRES_URL;
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
let pool: Pool | undefined;
function previousReader() {
  const gzip = readFileSync(join(root, 'resources/compatibility/math-before-figures-schema36-reader-v1.json.gz')),
    receipt = JSON.parse(readFileSync(join(root, 'resources/compatibility/math-before-figures-schema36-reader-v1.receipt.json'), 'utf8')),
    capsule = JSON.parse(gunzipSync(gzip).toString());
  expect(sha(gzip)).toBe(receipt.gzipSha256); expect(capsule.protocol).toBe('study-agent-pre-math-figures36-reader-v1');
  expect(sha(capsule.reader.code)).toBe(capsule.reader.sha256);
  for (const dependency of capsule.metadata.external) expect(sha(readFileSync(join(root, dependency.path)))).toBe(dependency.sha256);
  const file = join(directory, 'reader36.cjs'); writeFileSync(file, capsule.reader.code); return require(file).DomainDatabase;
}
async function location() {
  if (!configured) return join(directory, randomUUID() + '.sqlite3');
  const url = new URL(configured); if (url.hostname !== '127.0.0.1' || url.port !== '15456' || url.pathname !== '/study_b4_gesp') throw Error('Exact block-four QA PostgreSQL required');
  pool ??= new Pool({ connectionString: configured, max: 2 });
  expect(resolve((await pool.query('SHOW data_directory')).rows[0].data_directory)).toBe(join(workspace, 'data/qa/b4pg/cluster'));
  const schema = 'math_figures37_' + randomUUID().replaceAll('-', ''); await pool.query('CREATE SCHEMA "' + schema + '"');
  url.searchParams.set('options', '-c search_path=' + schema); return url.toString();
}
async function sql(url: string, query: string): Promise<any[]> {
  if (!configured) { const db = new DatabaseSync(url); try { return db.prepare(query).all(); } finally { db.close(); } }
  const client = new Pool({ connectionString: url, max: 1 }); try { return (await client.query(query)).rows; } finally { await client.end(); }
}
async function native(url: string) {
  const result: Record<string, any[]> = {};
  for (const [name, query] of Object.entries({ records: 'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,position,record_id',
    migrations: 'SELECT * FROM schema_migrations ORDER BY version', guard: 'SELECT * FROM study_restore_guard', meta: 'SELECT * FROM store_meta',
    tasks: 'SELECT * FROM durable_tasks ORDER BY id', history: 'SELECT * FROM durable_task_history ORDER BY id' })) result[name] = await sql(url, query);
  return JSON.parse(JSON.stringify(result));
}
async function legacy() {
  const Reader = previousReader(), url = await location(), db = new Reader(url);
  await db.open(); try { await db.commit(await db.read(), { notebookEntries: [{ id: 'qa-original36', content: 'Generated previous-reader control; no learner evidence.' }] }); } finally { await db.close(); }
  return { Reader, url };
}
afterAll(async () => { await pool?.end(); });
describe('actual ' + (configured ? 'PostgreSQL' : 'SQLite') + ' mathematical content minimum-reader boundary', () => {
  it('runs the sealed36 positive control and cold-reads its own original protocol', async () => {
    const { Reader, url } = await legacy(), before = await native(url); expect(before.guard[0].state).toBe('ready-schema36-gesp-retention-feedback-v1'); expect(Number(before.migrations.at(-1).version)).toBe(36);
    const cold = new Reader(url); await cold.open(); try { expect((await cold.read()).state.notebookEntries[0].id).toBe('qa-original36'); } finally { await cold.close(); }
    expect(await native(url)).toEqual(before);
  });
  it('migrates36 to37 without changing old facts and refuses the actual36 before native or byte writes', async () => {
    const { Reader, url } = await legacy(), before = await native(url), current = new DomainDatabase(url); await current.open(); await current.close();
    const after = await native(url); expect(after.guard[0].state).toBe(latestReadyState); expect(Number(after.migrations.at(-1).version)).toBe(latestSchemaVersion);
    for (const name of ['records', 'meta', 'tasks', 'history']) expect(after[name]).toEqual(before[name]); expect(after.migrations.filter((migration:any)=>Number(migration.version)<=36)).toEqual(before.migrations);
    const bytes = configured ? null : sha(readFileSync(url)), old = new Reader(url);
    try { await expect(old.open()).rejects.toThrow(/restoration is incomplete|unsupported_database_schema|minimum_reader_guard_mismatch/); } finally { await old.close(); }
    expect(await native(url)).toEqual(after); if (bytes) expect(sha(readFileSync(url))).toBe(bytes);
    const cold = new DomainDatabase(url); await cold.open(); await cold.close(); expect(await native(url)).toEqual(after);
  });
  it('rolls the37 marker and schema migration back atomically, then recovers with both original and current readers', async () => {
    const { Reader, url } = await legacy();
    if (configured) {
      await sql(url, "CREATE FUNCTION reject_math37() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.state=''ready-schema37-math-figures-v1'' THEN RAISE EXCEPTION ''injected_math37_failure''; END IF; RETURN NEW; END'");
      await sql(url, 'CREATE TRIGGER reject_math37 BEFORE UPDATE ON study_restore_guard FOR EACH ROW EXECUTE FUNCTION reject_math37()');
    } else { const db = new DatabaseSync(url); try { db.exec("CREATE TRIGGER reject_math37 BEFORE UPDATE ON study_restore_guard WHEN NEW.state='ready-schema37-math-figures-v1' BEGIN SELECT RAISE(ABORT,'injected_math37_failure'); END"); } finally { db.close(); } }
    const before = await native(url), failed = new DomainDatabase(url); try { await expect(failed.open()).rejects.toThrow('injected_math37_failure'); } finally { await failed.close(); }
    expect(await native(url)).toEqual(before); const original = new Reader(url); await original.open(); await original.close(); expect(await native(url)).toEqual(before);
    if (configured) await sql(url, 'DROP TRIGGER reject_math37 ON study_restore_guard');
    else { const db = new DatabaseSync(url); try { db.exec('DROP TRIGGER reject_math37'); } finally { db.close(); } }
    const recovered = new DomainDatabase(url); await recovered.open(); await recovered.close(); expect((await native(url)).guard[0].state).toBe(latestReadyState);
  });
  it('retains full mathematical teaching originals and exact save commands across independent current cold reads', async () => {
    const f = teachingFixture(), url = await location(), at = new Date().toISOString(), actorId = 'qa:math:teacher', authorization = { role: 'teacher' as const, accountVersion: 1, sessionId: 'qa:math:session' };
    f.input.content.visuals = [{ kind: 'math', figure: { kind: 'clocks', title: '原创合成近整时钟面', showDigitalTime: false, showHandLabels: true, clocks: [{ hour: 7, minute: 58, caption: ' 原图注\n完整尾行 ' }] }, explanation: '先比较长短针与整时的位置关系。' }];
    const prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source), change = prepareTeachingChange({ actorId, authorization, input: f.input, at, previous: null, prepared });
    const state: Record<string, any[]> = { users: [{ id: actorId, principal: 'generated-math-owner', role: 'teacher', status: 'active', version: 1 }],
      sessions: [{ id: authorization.sessionId, userId: actorId, tokenHash: 'qa-math-session-hash', createdAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), revokedAt: null }],
      textbookTeachingPackages: [change.header], textbookTeachingVersions: [change.saved], textbookTeachingSources: [change.source], textbookTeachingCommands: [change.command] };
    for (const name of ['knowledgeAtoms', 'questions', 'questionAnswerSchemas', 'questionSources', 'measurementItems'] as const) state[name] = [...structuredClone(f.store.inspect(name))];
    const current = new DomainDatabase(url); await current.open(); try { await current.commit(await current.read(), state); } finally { await current.close(); }
    const before = await native(url);
    for (let n = 0; n < 2; n++) {
      const cold = new DomainDatabase(url); await cold.open(); try { const saved = (await cold.read()).state; expect(saved.textbookTeachingVersions).toEqual(state.textbookTeachingVersions); expect(saved.textbookTeachingCommands).toEqual(state.textbookTeachingCommands); expect(saved.diagnosticResponses ?? []).toEqual([]); } finally { await cold.close(); }
      expect(await native(url)).toEqual(before);
    }
  });
});
