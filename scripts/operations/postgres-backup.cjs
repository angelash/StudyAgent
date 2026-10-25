#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');
const { files: { noLinks, within, freshDestination, digest, copyVerified, referencesFromRecords, walk } } = require('./backup.cjs');
const { connectionEnvironment:config } = require('./postgres-restore-import.cjs');
const FORMAT = 'study-agent-postgres-backup-v1';
const fail = message => { throw new Error(message); };
function native(name, args, pgBin, connectionString) {
  return new Promise((resolve, reject) => {
    const executable = pgBin ? path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...(connectionString ? config(connectionString) : {}) } });
    let error = ''; child.stderr.on('data', bytes => { error += bytes; }); child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${name}_failed: ${error.slice(-1500)}`)));
  });
}
async function summary(client) {
  const versions = (await client.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r => r.version);
  if (!versions.length || versions.at(-1) > 13) fail('unsupported_database_schema');
  return { schemaVersions: versions, revision: Number((await client.query('SELECT revision FROM store_meta WHERE id=1')).rows[0].revision),
    collections: (await client.query('SELECT collection,COUNT(*) AS count FROM domain_records GROUP BY collection ORDER BY collection')).rows.map(r => ({ collection: r.collection, count: Number(r.count) })),
    tasks: (await client.query('SELECT state,COUNT(*) AS count FROM durable_tasks GROUP BY state ORDER BY state')).rows.map(r => ({ state: r.state, count: Number(r.count) })) };
}
async function createPostgresBundle({ connectionString, pgBin, dataDir, destination, assets }) {
  if(dataDir && fs.existsSync(within(dataDir,'.study-restore-incomplete'))) fail('source_database_restore_incomplete');
  config(connectionString); const pool = new Pool({ connectionString, max: 1 }), client = await pool.connect();
  let root, database, refs;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if ((await client.query("SELECT to_regclass('study_restore_guard') AS name")).rows[0].name &&
      (await client.query('SELECT state FROM study_restore_guard WHERE id=1')).rows[0]?.state !== 'ready') fail('source_database_restore_incomplete');
    database = await summary(client);
    refs = referencesFromRecords((await client.query("SELECT collection,body FROM domain_records WHERE collection IN ('importFiles','importPages','processingArtifacts','studentMedia','classroomVisuals','studioSourceMaterials','studioMaterialUploads','sourceCourses','studioMaterialAssets')")).rows);
    if (refs.size && !dataDir) fail('data_dir_required_for_referenced_files');
    root = freshDestination(destination, [dataDir, assets]);
    fs.writeFileSync(within(root, '.study-backup-incomplete'), 'PostgreSQL backup has not passed verification.\n', { flag: 'wx', mode: 0o600 });
    fs.mkdirSync(within(root, 'database'), { mode: 0o700 });
    const snapshot = (await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    await native('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--exclude-table=*.study_restore_guard', '--exclude-schema=study_restore_runtime', '--snapshot=' + snapshot, '--file=' + within(root, 'database/postgres.dump')], pgBin, connectionString);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); await pool.end(); }
  const dump = within(root, 'database/postgres.dump'); fs.chmodSync(dump, 0o600);
  const files = [{ path: 'database/postgres.dump', size: fs.statSync(dump).size, sha256: digest(dump) }];
  for (const [relative, expected] of refs) files.push({ path: `data/${relative}`, ...copyVerified(within(dataDir, relative), within(root, `data/${relative}`), expected) });
  let assetCount = 0;
  if (assets) for (const item of walk(noLinks(assets))) {
    files.push({ path: `assets/${item.relative}`, ...copyVerified(item.path, within(root, `assets/${item.relative}`)) });
    if (++assetCount % 5000 === 0) process.stderr.write(`Copied ${assetCount} asset files\n`);
  }
  const copied = new Map(files.map(file => [file.path,file]));
  const manifest = { format: FORMAT, id: randomUUID(), createdAt: new Date().toISOString(), database, assetsIncluded: Boolean(assets), assetCount, referencedFileCount: refs.size,
    references: [...refs.keys()].map(relative => copied.get(`data/${relative}`)), files };
  fs.writeFileSync(within(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await verifyPostgresBundle({ bundle: root, pgBin, incomplete: true }); fs.unlinkSync(within(root, '.study-backup-incomplete'));
  return { format: FORMAT, id: manifest.id, database, verifiedFiles: files.length, assetsIncluded: Boolean(assets) };
}
async function verifyPostgresBundle({ bundle, pgBin, incomplete = false }) {
  const root = noLinks(bundle);
  if (!incomplete && fs.existsSync(within(root, '.study-backup-incomplete'))) fail('backup_incomplete');
  const manifestPath = within(root, 'manifest.json'); if (fs.statSync(manifestPath).size > 256 * 1024 * 1024) fail('manifest_too_large');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== FORMAT || !Array.isArray(manifest.files) || manifest.files.length > 1_000_000 || !Array.isArray(manifest.references) || typeof manifest.assetsIncluded !== 'boolean' || typeof manifest.id !== 'string') fail('unsupported_backup_format');
  const paths = new Map(), portable = new Set();
  for (const file of manifest.files) {
    if (!/^(database\/postgres\.dump|data\/(?:processing|student-media|classroom-visuals|studio-materials|studio-uploads)\/.+|assets\/.+)$/.test(file.path) || portable.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) fail('invalid_manifest_entry');
    const actual = within(root, file.path), stat = fs.statSync(actual);
    if (!stat.isFile() || stat.size !== file.size || digest(actual) !== file.sha256) fail('bundle_integrity_failed');
    paths.set(file.path, file); portable.add(file.path.toLowerCase());
  }
  if (!paths.has('database/postgres.dump') || manifest.assetCount !== [...paths.keys()].filter(p => p.startsWith('assets/')).length || manifest.referencedFileCount !== manifest.references.length || !manifest.assetsIncluded && manifest.assetCount) fail('manifest_count_mismatch');
  for (const ref of manifest.references) if (!paths.has(ref.path) || paths.get(ref.path).size !== ref.size || paths.get(ref.path).sha256 !== ref.sha256) fail('database_file_missing_from_bundle');
  await native('pg_restore', ['--list', within(root, 'database/postgres.dump')], pgBin);
  return { manifest, verifiedFiles: paths.size };
}
async function restorePostgresBundle(options) { return require('./postgres-restore.cjs').restorePostgres(options); }
module.exports = { createPostgresBundle, verifyPostgresBundle, restorePostgresBundle, summary };
if (require.main === module) {
  (async () => {
    const [command, ...args] = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2);
      if (command === 'restore' && args[i] === '--resume' && !options.resume) { options.resume = true; i--; continue; }
      if (!args[i].startsWith('--') || !args[i + 1] || !['connection-env', 'pg-bin', 'data-dir', 'destination', 'assets', 'bundle', 'deletion-ledger'].includes(key) || options[key]) fail('invalid_arguments'); options[key] = args[i + 1];
    }
    const common = { connectionString: process.env[options['connection-env'] ?? 'DATABASE_URL'], pgBin: options['pg-bin'], dataDir: options['data-dir'], destination: options.destination, assets: options.assets, bundle: options.bundle, deletionLedger: options['deletion-ledger'], resume: options.resume };
    return command === 'create' ? createPostgresBundle(common) : command === 'verify' ? verifyPostgresBundle(common).then(v => ({ verifiedFiles: v.verifiedFiles, database: v.manifest.database })) : command === 'restore' ? restorePostgresBundle(common) : fail('usage_create_verify_restore');
  })().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(`PostgreSQL backup operation failed: ${error.code ?? error.message}`); process.exitCode = 1; });
}
