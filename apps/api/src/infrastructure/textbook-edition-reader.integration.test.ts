import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import { teachingAdoptionNativeFixture } from '../modules/diagnostics/textbook-teaching-adoption-fixture';
import { teachingHash } from '../modules/diagnostics/textbook-teaching-package';

const candidate = resolve(process.cwd(), '../..'), qa = join(candidate, 'data/qa'); mkdirSync(qa, { recursive: true });
const directory = mkdtempSync(join(qa, 'edition-reader-')), configured = process.env.STUDY_TEST_TEACHING_POSTGRES_URL,
  packed = JSON.parse(gunzipSync(readFileSync(join(candidate, 'resources/compatibility/course-history-schema33-reader-v1.json.gz'))).toString('utf8')),
  sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
let pool: Pool | undefined;
function oldReader() {
  expect(packed.protocol).toBe('study-agent-course-history33-reader-v1');
  const bytes = Buffer.from(packed.reader.code); expect(sha(bytes)).toBe(packed.reader.sha256);
  expect(packed.reader.code).toContain('ready-schema33-course-history-v1'); expect(packed.reader.code).not.toContain('ready-schema33-exact-edition-v1');
  for (const file of packed.metadata.external) expect(sha(readFileSync(join(candidate, file.path)))).toBe(file.sha256);
  const file = join(directory, 'actual-compiled-previous-reader.cjs');
  try { writeFileSync(file, bytes, { flag: 'wx' }); } catch { expect(sha(readFileSync(file))).toBe(packed.reader.sha256); }
  return require(file).DomainDatabase;
}
async function location() {
  if (!configured) return join(directory, randomUUID() + '.sqlite3');
  const url = new URL(configured); if (url.hostname !== '127.0.0.1' || url.port !== '15455' || url.pathname !== '/study_teaching_package33') throw Error('Exact owned native edition PostgreSQL required');
  pool ??= new Pool({ connectionString: configured, max: 2 }); const schema = 'edition_reader_' + randomUUID().replaceAll('-', '');
  await pool.query('CREATE SCHEMA "' + schema + '"'); url.searchParams.set('options', '-c search_path=' + schema); return url.toString();
}
async function native(url: string) {
  let sqlite: DatabaseSync | undefined, postgres: Pool | undefined;
  try {
    if (configured) postgres = new Pool({ connectionString: url, max: 1 }); else sqlite = new DatabaseSync(url, { readOnly: true });
    const rows: Record<string, any[]> = {};
    for (const [name, sql] of Object.entries({ records: 'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,position,record_id', meta: 'SELECT * FROM store_meta', tasks: 'SELECT * FROM durable_tasks ORDER BY id', history: 'SELECT * FROM durable_task_history ORDER BY id', guard: 'SELECT * FROM study_restore_guard', migrations: 'SELECT * FROM schema_migrations ORDER BY version' }))
      rows[name] = sqlite ? sqlite.prepare(sql).all() : (await postgres!.query(sql)).rows;
    return JSON.parse(JSON.stringify(rows));
  } finally { sqlite?.close(); await postgres?.end(); }
}
afterAll(async () => { await pool?.end(); });
describe('actual ' + (configured ? 'PostgreSQL' : 'SQLite') + ' previous compiled33 reader and exact-edition minimum guard', () => {
  it('proves the actual previous reader still saves, publishes, adopts and cold-reads its own original protocol', async () => {
    const Reader = oldReader(), url = await location(), database = new Reader(url), f = teachingAdoptionNativeFixture(),
      { textbookTeachingPackages: _headers, textbookTeachingVersions: _versions, textbookTeachingSources: _sources, textbookTeachingCommands: _commands, ...common } = f.native.before,
      saved = f.native.saved, initial = { ...common, textbookTeachingPackages: [saved.header], textbookTeachingVersions: [saved.saved], textbookTeachingSources: [saved.source], textbookTeachingCommands: [saved.command] };
    await database.open(); try {
      await database.commit(await database.read(), initial);
      await database.commit(await database.read(), { ...initial, textbookTeachingPackages: [f.native.published.header], textbookTeachingCommands: [saved.command, f.native.published.command] });
      await database.commit(await database.read(), f.native.state);
    } finally { await database.close(); }
    const before = await native(url), bytes = configured ? null : sha(readFileSync(url)); expect(before.guard[0].state).toBe('ready-schema33-course-history-v1');
    const cold = new Reader(url); await cold.open(); try { const state = (await cold.read()).state; expect(state.studioCourses).toEqual([f.course]); expect(state.textbookTeachingAdoptions).toHaveLength(1); expect(state.textbookTeachingCommands).toHaveLength(2); } finally { await cold.close(); }
    expect(await native(url)).toEqual(before); if (bytes) expect(sha(readFileSync(url))).toBe(bytes);
  });
  it('refuses the new exact-edition protocol before changing any native state or SQLite bytes', async () => {
    const Reader = oldReader(), url = await location(), current = new DomainDatabase(url); await current.open();
    try { await current.commit(await current.read(), { notebookEntries: [{ id: 'qa-new-edition-reader', content: 'Generated minimum-reader marker probe only.' }] }); } finally { await current.close(); }
    const before = await native(url), bytes = configured ? null : sha(readFileSync(url)); expect(before.guard[0].state).toBe('ready-schema37-math-figures-v1');
    const old = new Reader(url); try { await expect(old.open()).rejects.toThrow(/restoration is incomplete|minimum_reader_guard_mismatch/); } finally { await old.close(); }
    expect(teachingHash(await native(url))).toBe(teachingHash(before)); if (bytes) expect(sha(readFileSync(url))).toBe(bytes);
    const cold = new DomainDatabase(url); await cold.open(); await cold.close(); expect(await native(url)).toEqual(before);
  });
});
