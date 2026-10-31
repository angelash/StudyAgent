const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'), { Pool } = require('pg');
const qa = __dirname, root = path.resolve(qa, '../../..'), runtime = path.join(root, 'data/qa/r31a'), checks = [], databases = [];
const source = path.join(root, 'data/qa/a165'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const archivePath = path.join(root, 'resources/compatibility/domain-reader-schema31-v1.json.gz');
const receipt = JSON.parse(fs.readFileSync(path.join(root, 'resources/compatibility/domain-reader-schema31-v1.receipt.json')));
const raw = fs.readFileSync(archivePath); assert.equal(sha(raw), receipt.gzipSha256);
const manifest = JSON.parse(zlib.gunzipSync(raw, { maxOutputLength: 50 * 1024 * 1024 }));
assert.equal(manifest.protocol, 'study-domain-reader31-baseline-v1'); assert.equal(manifest.schemaVersion, 31);
if (fs.existsSync(runtime) || fs.existsSync(path.join(qa, 'reader31-archive-execution-first.json'))) throw Error('Fresh bounded archive verification required');
for (const [relative, file] of Object.entries(manifest.files)) {
  if (!/^(?:apps\/api\/dist\/|packages\/(?:contracts|config)\/|scripts\/operations\/)/.test(relative) || relative.split('/').some(part => !part || ['.', '..'].includes(part)) || /[\\:\x00]/.test(relative)) throw Error('Invalid archived reader member');
  const bytes = Buffer.from(file.base64, 'base64'); assert.equal(sha(bytes), file.sha256);
  const target = path.join(runtime, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' });
}
for (const dependency of manifest.externalDependencies) {
  if (!dependency.path.startsWith('node_modules/') || dependency.path.split('/').includes('..')) throw Error('Invalid external dependency member');
  assert.equal(sha(fs.readFileSync(path.join(root, dependency.path))), dependency.sha256);
}
fs.mkdirSync(path.join(runtime, 'node_modules/@study-agent'), { recursive: true });
for (const name of ['contracts', 'config']) fs.symlinkSync(path.join(runtime, 'packages', name), path.join(runtime, 'node_modules/@study-agent', name), 'junction');
const { DomainDatabase } = require(path.join(runtime, 'apps/api/dist/apps/api/src/infrastructure/domain-database.js'));
const guard = require(path.join(runtime, 'scripts/operations/database-reader-guard.cjs'));
const row = { id: 'synthetic-reader31-archive', content: 'Original synthetic archive roundtrip; no learner evidence.' };
let admin;
async function sqliteStatement(location, sql, params = []) { const db = new DatabaseSync(location); try { return db.prepare(sql).all(...params); } finally { db.close(); } }
async function pgStatement(location, sql, params = []) { const pool = new Pool({ connectionString: location }); try { let i = 0; return (await pool.query(sql.replace(/\?/g, () => '$' + ++i), params)).rows; } finally { await pool.end(); } }
async function newPgDatabase(credentials) {
  const name = 'study_qa_reader31_archive_' + crypto.randomUUID().replaceAll('-', '');
  assert.match(name, /^study_qa_reader31_archive_[a-f0-9]{32}$/);
  await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
  const url = new URL('postgresql://127.0.0.1:15439/' + name); url.username = credentials.appUser; url.password = credentials.appPassword; return url.toString();
}
async function verify(driver, credentials) {
  const data = path.join(runtime, 'data', driver), bundle = path.join(runtime, 'data', driver + '-bundle'), restored = path.join(runtime, 'data', driver + '-restored');
  fs.mkdirSync(data, { recursive: true });
  const location = driver === 'sqlite' ? path.join(data, 'study-agent.sqlite3') : await newPgDatabase(credentials);
  const statement = driver === 'sqlite' ? sqliteStatement : pgStatement;
  let db = new DomainDatabase(location); await db.open();
  try { await db.commit(await db.read(), { notebookEntries: [row] }); } finally { await db.close(); }
  db = new DomainDatabase(location); await db.open();
  try { assert.deepEqual((await db.read()).state.notebookEntries, [row]); } finally { await db.close(); }
  assert.equal((await statement(location, 'SELECT MAX(version) version FROM schema_migrations'))[0].version, 31);
  assert.equal((await statement(location, 'SELECT state FROM study_restore_guard WHERE id=1'))[0].state, 'ready-schema31');
  checks.push({ driver, name: 'Extracted actual archive cold opens its original schema31 record and minimum-reader marker', passed: true });
  let restoredLocation;
  if (driver === 'sqlite') {
    const backup = require(path.join(source, 'scripts/operations/backup.cjs'));
    await backup.createBundle({ dataDir: data, destination: bundle }); await backup.verifyBundle({ bundle });
    await backup.restoreBundle({ bundle, destination: restored }); restoredLocation = path.join(restored, 'study-agent.sqlite3');
  } else {
    const backup = require(path.join(source, 'scripts/operations/postgres-backup.cjs')), pgBin = path.join(root, 'data/tools/postgresql-17.11-5/pgsql/bin');
    restoredLocation = await newPgDatabase(credentials);
    await backup.createPostgresBundle({ dataDir: data, destination: bundle, connectionString: location, pgBin }); await backup.verifyPostgresBundle({ bundle, pgBin });
    await backup.restorePostgresBundle({ bundle, destination: restored, connectionString: restoredLocation, pgBin });
  }
  db = new DomainDatabase(restoredLocation); await db.open();
  try { assert.deepEqual((await db.read()).state.notebookEntries, [row]); } finally { await db.close(); }
  checks.push({ driver, name: driver === 'sqlite' ? 'Actual native SQLite bundle restores original31 bytes and archived reader cold opens them' : 'Actual pg_dump/pg_restore bundle restores original31 record and archived reader cold opens it', passed: true });
  const before = JSON.stringify(await statement(restoredLocation, 'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,record_id'));
  await statement(restoredLocation, 'INSERT INTO schema_migrations(version,applied_at) VALUES(32,?)', [new Date().toISOString()]);
  const bytesBefore = driver === 'sqlite' ? sha(fs.readFileSync(restoredLocation)) : null;
  await assert.rejects(new DomainDatabase(restoredLocation).open(), /unsupported_database_schema/);
  assert.equal(JSON.stringify(await statement(restoredLocation, 'SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,record_id')), before);
  if (driver === 'sqlite') assert.equal(sha(fs.readFileSync(restoredLocation)), bytesBefore);
  assert.throws(() => guard.assertReady('ready-schema32', Array.from({ length: 32 }, (_, i) => i + 1)), /unsupported_database_schema/);
  checks.push({ driver, name: 'Unmodified archived31 reader and operation guard reject future32 without changing original rows', passed: true });
}
async function main() {
  await verify('sqlite');
  const credentials = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json')));
  assert.equal(credentials.purpose, 'StudyAgent isolated QA cluster'); assert.equal(credentials.port, 15439); assert.equal(credentials.database, 'study_agent_qa'); assert.equal(credentials.adminUser, 'study_qa_admin'); assert.equal(credentials.appUser, 'study_agent_app');
  const url = new URL('postgresql://127.0.0.1:15439/postgres'); url.username = credentials.adminUser; url.password = credentials.adminPassword;
  admin = new Pool({ connectionString: url.toString() }); assert.equal((await admin.query('SELECT current_user name')).rows[0].name, 'study_qa_admin');
  await verify('postgres', credentials);
}
let error;
main().catch(value => { error = { name: value.name, message: String(value.message).slice(0, 1000) }; }).finally(async () => {
  if (admin) {
    for (const name of databases) { assert.match(name, /^study_qa_reader31_archive_[a-f0-9]{32}$/); await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)'); }
    await admin.end();
  }
  const result = { at: new Date().toISOString(), scope: 'Execute the actual sealed31 archive, not current main compilation; synthetic notebook only. SQLite and real native PostgreSQL backup/restore, cold open and future32 fences. No main API, formal data or actual learner evidence.',
    archiveSha256: receipt.gzipSha256, extractedFiles: Object.keys(manifest.files).length, verifiedExternalDependencies: manifest.externalDependencies.length,
    success: !error, passed: checks.length, failed: error ? 1 : 0, checks, error: error ?? null,
    extractedRuntimeRetained: 'data/qa/r31a includes owned internal package junctions; do not recursively delete this runtime.', generatedPostgresDatabasesCleaned: databases.length, formalApplicationChanged: false };
  fs.writeFileSync(path.join(qa, 'reader31-archive-execution-first.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ passed: checks.length, failed: result.failed, success: result.success, generatedDatabasesCleaned: databases.length }));
  process.exitCode = error ? 1 : 0;
});
