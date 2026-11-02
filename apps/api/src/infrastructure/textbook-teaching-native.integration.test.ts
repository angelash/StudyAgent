import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import { teachingFixture } from '../modules/diagnostics/textbook-teaching-fixture';
import { prepareTextbookTeachingPackage, teachingHash } from '../modules/diagnostics/textbook-teaching-package';
import { prepareTeachingChange } from '../modules/diagnostics/textbook-teaching-record';

let workspace = resolve(__dirname); while (!existsSync(join(workspace, '.git')) && dirname(workspace) !== workspace) workspace = dirname(workspace);
const root = resolve(__dirname, '../../../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
const directory = mkdtempSync(join(qa, 'teaching33-native-')), configured = process.env.STUDY_TEST_TEACHING_POSTGRES_URL, driver = configured ? 'postgres' : 'sqlite',
  digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const archive = readFileSync(join(root, 'resources/compatibility/domain-reader-schema32-v1.json.gz')),
  receipt = JSON.parse(readFileSync(join(root, 'resources/compatibility/domain-reader-schema32-v1.receipt.json'), 'utf8')),
  manifest = JSON.parse(gunzipSync(archive).toString('utf8')), actual32 = join(workspace, 'data/qa/r32b');
expect(digest(archive)).toBe(receipt.gzipSha256); expect(manifest.schemaVersion).toBe(32);
for (const [file, member] of Object.entries(manifest.files) as Array<[string, { sha256: string }]>) {
  if (!/^(?:apps\/api\/dist\/|packages\/(?:contracts|config)\/|scripts\/operations\/|resources\/paper-export\/)/.test(file) || /[\\:\x00]/.test(file) || file.split('/').some(part => !part || ['.', '..'].includes(part))) throw Error('Unsafe actual32 baseline member');
  expect(digest(readFileSync(join(actual32, file))), file).toBe(member.sha256);
}
for (const dependency of manifest.externalDependencies) expect(digest(readFileSync(join(workspace, dependency.path))), dependency.path).toBe(dependency.sha256);
const { DomainDatabase: Reader32 } = require(join(actual32, 'apps/api/dist/apps/api/src/infrastructure/domain-database.js')),
  oldGuard = require(join(actual32, 'scripts/operations/database-reader-guard.cjs'));
let pool: Pool | undefined;
async function location(label: string) {
  if (!configured) { const path = join(directory, label); mkdirSync(path); return join(path, 'study-agent.sqlite3'); }
  const url = new URL(configured); if (url.hostname !== '127.0.0.1' || url.port !== '15455' || url.pathname !== '/study_teaching_package33') throw Error('Exact isolated teaching33 PostgreSQL required');
  pool ??= new Pool({ connectionString: configured, max: 2 }); const schema = 'teaching33_' + randomUUID().replaceAll('-', ''); await pool.query('CREATE SCHEMA "' + schema + '"');
  url.searchParams.set('options', '-c search_path=' + schema); return url.toString();
}
async function sql(url: string, query: string, args: any[] = []): Promise<any[]> {
  if (!configured) { const db = new DatabaseSync(url); try { return db.prepare(query).all(...args); } finally { db.close(); } }
  const client = new Pool({ connectionString: url, max: 1 }); try { let parameter = 0; return (await client.query(query.replace(/\?/g, () => '$' + ++parameter), args)).rows; } finally { await client.end(); }
}
async function snapshot(url: string) { return { records: (await sql(url, 'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,position,record_id')).map(row => ({ ...row, body: typeof row.body === 'string' ? JSON.parse(row.body) : row.body })),
  meta: await sql(url, 'SELECT * FROM store_meta'), tasks: await sql(url, 'SELECT * FROM durable_tasks'), history: await sql(url, 'SELECT * FROM durable_task_history') }; }
const schema = async (url: string) => Number((await sql(url, 'SELECT MAX(version) version FROM schema_migrations'))[0].version);
async function original(label: string) {
  const url = await location(label), old = new Reader32(url); await old.open();
  try { await old.commit(await old.read(), { notebookEntries: [{ id: 'teaching-original', content: 'Generated migration fixture; no learner evidence.' }] }); } finally { await old.close(); }
  return url;
}
function nativeFixture() {
  const f = teachingFixture(2), now = new Date(), at = now.toISOString(), actorId = 'qa:teacher', authorization = { role: 'teacher' as const, accountVersion: 1, sessionId: 'qa:teacher:session' },
    prepared = prepareTextbookTeachingPackage(f.store, f.input, f.source), change = prepareTeachingChange({ actorId, authorization, input: f.input, at, previous: null, prepared });
  const state: Record<string, any[]> = { users: [{ id: actorId, principal: 'generated-native-teaching-owner', role: 'teacher', status: 'active', version: 1 }],
    sessions: [{ id: authorization.sessionId, userId: actorId, tokenHash: 'qa-session-hash', createdAt: new Date(+now - 1000).toISOString(), expiresAt: new Date(+now + 86400000).toISOString(), revokedAt: null }],
    textbookTeachingPackages: [change.header], textbookTeachingVersions: [change.saved], textbookTeachingSources: [change.source], textbookTeachingCommands: [change.command] };
  for (const name of ['knowledgeAtoms', 'questions', 'questionAnswerSchemas', 'questionSources', 'measurementItems'] as const) state[name] = [...structuredClone(f.store.inspect(name))];
  return { ...f, prepared, change, state, authorization, actorId, at };
}

describe(driver + ' actual32 to33 reader and complete teaching native transactions', () => {
  afterAll(async () => { await pool?.end(); });
  it('executes the sealed actual32, migrates atomically with every old row preserved, then refuses33 in the same actual32', async () => {
    const url = await original('migration'), before = await snapshot(url); expect(await schema(url)).toBe(32);
    const current = new DomainDatabase(url); await current.open(); await current.close(); expect(await schema(url)).toBe(36); expect(teachingHash(await snapshot(url))).toBe(teachingHash(before));
    const originalBytes = configured ? null : digest(readFileSync(url)), old = new Reader32(url); await expect(old.open()).rejects.toThrow(/schema|restoration/i);
    expect(teachingHash(await snapshot(url))).toBe(teachingHash(before)); if (originalBytes) expect(digest(readFileSync(url))).toBe(originalBytes);
    expect(() => oldGuard.assertReady('ready-schema33', Array.from({ length: 33 }, (_, index) => index + 1))).toThrow('unsupported_database_schema');
  });
  it('rejects unknown private33 records in an actual32 database before registering33 or its indexes', async () => {
    const url = await original('invalid'), old = new Reader32(url); await old.open();
    try { await old.commit(await old.read(), { notebookEntries: [{ id: 'teaching-original', content: 'Generated migration fixture; no learner evidence.' }], textbookTeachingPackages: [{ id: 'incomplete-private-package' }] }); } finally { await old.close(); }
    const before = await snapshot(url); await expect(new DomainDatabase(url).open()).rejects.toThrow('textbook_teaching_native_integrity_failed');
    expect(await schema(url)).toBe(32); expect(teachingHash(await snapshot(url))).toBe(teachingHash(before));
  });
  it('rolls the33 version, unique indexes and ready marker back on injected migration failure', async () => {
    const url = await original('rollback'), before = await snapshot(url);
    if (!configured) await sql(url, "CREATE TRIGGER reject_teaching33 BEFORE UPDATE ON study_restore_guard WHEN NEW.state='ready-schema33-exact-edition-v1' BEGIN SELECT RAISE(ABORT,'injected_teaching33_failure'); END");
    else { await sql(url, "CREATE FUNCTION reject_teaching33() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.state=''ready-schema33-exact-edition-v1'' THEN RAISE EXCEPTION ''injected_teaching33_failure''; END IF; RETURN NEW; END'"); await sql(url, 'CREATE TRIGGER reject_teaching33 BEFORE UPDATE ON study_restore_guard FOR EACH ROW EXECUTE FUNCTION reject_teaching33()'); }
    await expect(new DomainDatabase(url).open()).rejects.toThrow('injected_teaching33_failure'); expect(await schema(url)).toBe(32); expect(teachingHash(await snapshot(url))).toBe(teachingHash(before));
    const indexes = configured ? await sql(url, "SELECT indexname name FROM pg_indexes WHERE schemaname=current_schema() AND indexname LIKE 'textbook_teaching_%'") : await sql(url, "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'textbook_teaching_%'"); expect(indexes).toEqual([]);
    const old = new Reader32(url); await old.open(); await old.close(); await sql(url, 'DROP TRIGGER reject_teaching33' + (configured ? ' ON study_restore_guard' : ''));
    const current = new DomainDatabase(url); await current.open(); await current.close(); expect(await schema(url)).toBe(36);
  });
  it('rejects future35 with both native state and SQLite bytes preserved', async () => {
    const url = await original('future'), current = new DomainDatabase(url); await current.open(); await current.close();
    await sql(url, 'INSERT INTO schema_migrations(version,applied_at) VALUES(37,?)', [new Date().toISOString()]); const before = await snapshot(url), bytes = configured ? null : digest(readFileSync(url));
    await expect(new DomainDatabase(url).open()).rejects.toThrow('unsupported_database_schema'); expect(teachingHash(await snapshot(url))).toBe(teachingHash(before)); if (bytes) expect(digest(readFileSync(url))).toBe(bytes);
  });
  it('persists full originals and independently cold-opens saved/publication history without learner writes', async () => {
    const f = nativeFixture(), url = await location('complete'), db = new DomainDatabase(url); await db.open(); await db.commit(await db.read(), f.state);
    const snapshot = await db.read(), publication = prepareTeachingChange({ actorId: f.actorId, authorization: f.authorization, at: new Date().toISOString(), previous: f.change.header, saved: f.change.saved, current: f.prepared,
      input: { action: 'publish', packageId: f.input.packageId, requestKey: 'qa-native-publish', expectedRevision: 1, contentVersion: 1, contentFingerprint: f.prepared.report.contentFingerprint,
        preflightFingerprint: f.prepared.report.fingerprint, reviewed: true, originalTeaching: true, reason: '仅确认合成工程稿，验证真实事务不产生学习或教师审核结论。' } });
    const next = structuredClone(snapshot.state); next.textbookTeachingPackages = [publication.header]; next.textbookTeachingCommands.push(publication.command); await db.commit(snapshot, next); await db.close();
    for (let n = 0; n < 2; n++) { const cold = new DomainDatabase(url); await cold.open(); const actual = await cold.read(); await cold.close(); expect(actual.state.textbookTeachingVersions).toEqual(f.state.textbookTeachingVersions); expect(actual.state.textbookTeachingCommands).toEqual(next.textbookTeachingCommands); expect(actual.state.diagnosticResponses ?? []).toEqual([]); }
  });
  it('enforces real unique request, content-version and source-version indexes before a duplicate native insert', async () => {
    const f = nativeFixture(), url = await location('unique'), db = new DomainDatabase(url); await db.open(); await db.commit(await db.read(), f.state); await db.close();
    const before = await snapshot(url);
    for (const name of ['textbookTeachingCommands', 'textbookTeachingVersions', 'textbookTeachingSources']) {
      const row = f.state[name][0]; await expect(sql(url, 'INSERT INTO domain_records(collection,record_id,body,position) VALUES(?,?,?,?)', [name, 'different-duplicate-native-id', JSON.stringify({ ...row, id: 'different-duplicate-native-id' }), 999])).rejects.toThrow(/unique|duplicate/i);
      expect(teachingHash(await snapshot(url))).toBe(teachingHash(before));
    }
  });
  it.each(['version', 'command', 'source', 'header', 'unauthorized_delete', 'revoke_before_write', 'material_before_write'] as const)('rolls back a direct %s bypass without changing any native row', async kind => {
    const f = nativeFixture(), url = await location('bypass-' + kind), db = new DomainDatabase(url); await db.open(); await db.commit(await db.read(), f.state);
    const before = await snapshot(url), base = await db.read(), next = structuredClone(base.state);
    if (kind === 'version') (next.textbookTeachingVersions[0] as any).body.content.title += '篡改';
    if (kind === 'command') (next.textbookTeachingCommands[0] as any).input.content.concept.explanation += ' ';
    if (kind === 'source') (next.textbookTeachingSources[0] as any).snapshot.pages[0].text += '篡改';
    if (kind === 'header') (next.textbookTeachingPackages[0] as any).status = 'published';
    if (kind === 'unauthorized_delete') for (const name of ['textbookTeachingPackages', 'textbookTeachingVersions', 'textbookTeachingSources', 'textbookTeachingCommands']) next[name] = [];
    if (kind === 'revoke_before_write' || kind === 'material_before_write') {
      const input = { ...structuredClone(f.input), expectedRevision: 1, requestKey: 'qa-direct-stale-authorization',
        basedOn: { contentVersion: 1, contentFingerprint: f.change.saved!.report.contentFingerprint } }, prepared = prepareTextbookTeachingPackage(f.store, input, f.source),
        change = prepareTeachingChange({ actorId: f.actorId, authorization: f.authorization, at: new Date().toISOString(), previous: f.change.header, base: f.change.saved, input, prepared });
      next.textbookTeachingPackages = [change.header]; next.textbookTeachingVersions.push(change.saved!); next.textbookTeachingCommands.push(change.command);
      if (kind === 'revoke_before_write') (next.sessions[0] as any).revokedAt = new Date().toISOString(); else (next.measurementItems[0] as any).reviewStatus = 'rejected';
    }
    await expect(db.commit(base, next)).rejects.toThrow('textbook_teaching_native_integrity_failed'); expect(teachingHash(await snapshot(url))).toBe(teachingHash(before)); await db.close();
  });
});
