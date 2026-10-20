#!/usr/bin/env node
// Private local backup bundles. A manifest proves integrity, not authenticity.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');
const { fenceRestoredState } = require('./restore-state.cjs');
const { readLedger, applyDeletionLedger, purgeRestoredMedia } = require('./privacy-ledger.cjs');
const FORMAT = 'study-agent-backup-v1';
const fail = code => { throw new Error(code); };
function noLinks(input) {
  let cursor = path.resolve(input);
  for (;;) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) fail('symbolic_link_not_allowed');
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  return path.resolve(input);
}
function within(root, relative) {
  if (typeof relative !== 'string' || !relative || /^[a-z]:|^[/\\]/i.test(relative) || /[\x00-\x1f]/.test(relative) || relative.replace(/\\/g, '/').split('/').some(p => !p || p === '.' || p === '..')) fail('unsafe_relative_path');
  const target = path.resolve(root, relative); if (!target.startsWith(path.resolve(root) + path.sep)) fail('path_outside_root');
  noLinks(target); return target;
}
function freshDestination(destination, sources) {
  const target = noLinks(destination);
  if (fs.existsSync(target)) fail('destination_already_exists');
  for (const source of sources.filter(Boolean).map(p => noLinks(p))) if (target === source || target.startsWith(source + path.sep) || source.startsWith(target + path.sep)) fail('overlapping_source_destination');
  fs.mkdirSync(target, { recursive: true, mode: 0o700 }); return target;
}
function digest(file) {
  const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024), fd = fs.openSync(file, 'r');
  try { for (;;) { const count = fs.readSync(fd, buffer); if (!count) break; hash.update(buffer.subarray(0, count)); } }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function copyVerified(source, target, expected) {
  noLinks(source); const before = fs.statSync(source); if (!before.isFile()) fail('source_not_regular_file');
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(target, (before.mode & 0o700) | 0o600);
  const hash = digest(target), after = fs.statSync(source), size = fs.statSync(target).size;
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || size !== before.size || hash !== digest(source)) fail('source_changed_during_backup');
  if (expected && (size !== expected.size || hash !== expected.sha256)) fail('referenced_file_integrity_failed');
  const fd = fs.openSync(target, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return { size, sha256: hash };
}
function openRead(file) { return new DatabaseSync(file, { readOnly: true }); }
function summary(db) {
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study_restore_guard'").get() &&
    db.prepare('SELECT state FROM study_restore_guard WHERE id=1').get()?.state !== 'ready') fail('source_database_restore_incomplete');
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') fail('database_integrity_failed');
  const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(r => r.version);
  if (!versions.length || versions.at(-1) > 9) fail('unsupported_database_schema');
  return { schemaVersions: versions, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision,
    collections: db.prepare('SELECT collection,COUNT(*) AS count FROM domain_records GROUP BY collection ORDER BY collection').all().map(r => ({ ...r })),
    tasks: db.prepare('SELECT state,COUNT(*) AS count FROM durable_tasks GROUP BY state ORDER BY state').all().map(r => ({ ...r })) };
}
function references(db) {
  return referencesFromRecords(db.prepare("SELECT collection,body FROM domain_records WHERE collection IN ('importFiles','importPages','processingArtifacts','studentMedia')").all());
}
function referencesFromRecords(rows) {
  const result = new Map();
  const add = (relative, sha256, size) => {
    within(path.resolve('.'), relative);
    if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(size) || size < 0) fail('invalid_file_reference');
    const previous = result.get(relative); if (previous && (previous.sha256 !== sha256 || previous.size !== size)) fail('conflicting_file_reference');
    result.set(relative, { sha256, size });
  };
  for (const row of rows) {
    const value = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
    if (row.collection === 'studentMedia') {
      if (!/^student_media_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.id)) fail('invalid_student_media_reference');
      if (value.status === 'ready') add(`student-media/${value.id}/ready/${value.sha256}`, value.sha256, value.storedSize);
      else if (value.status === 'uploading') for (const chunk of value.chunks ?? []) {
        if (!Number.isSafeInteger(chunk.index) || chunk.index < 0) fail('invalid_chunk_reference');
        add(`student-media/${value.id}/chunks/${chunk.index}-${chunk.sha256}`, chunk.sha256, chunk.size);
      }
    } else if (row.collection === 'importFiles') {
      if (value.status === 'ready') add(`processing/blobs/${value.sha256}`, value.sha256, value.size);
      else for (const chunk of value.chunks ?? []) {
        if (!/^import_file_[a-f0-9-]+$/.test(value.id) || !Number.isSafeInteger(chunk.index) || chunk.index < 0) fail('invalid_chunk_reference');
        add(`processing/chunks/${value.id}/${chunk.index}-${chunk.sha256}`, chunk.sha256, chunk.size);
      }
    } else add(`processing/${value.relativePath.replace(/\\/g, '/')}`, value.sha256, value.size);
  }
  return result;
}
function* walk(root, relative = '') {
  for (const entry of fs.readdirSync(relative ? within(root, relative) : root, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name, target = within(root, name);
    if (entry.isSymbolicLink()) fail('symbolic_link_not_allowed');
    if (entry.isDirectory()) yield* walk(root, name);
    else if (entry.isFile()) yield { relative: name, path: target };
    else fail('asset_not_regular_file');
  }
}
async function createBundle({ dataDir, destination, assets }) {
  const source = noLinks(dataDir), database = within(source, 'study-agent.sqlite3');
  if (fs.existsSync(within(source, '.study-restore-incomplete'))) fail('source_database_restore_incomplete');
  if (!fs.existsSync(database)) fail('source_database_missing');
  const root = freshDestination(destination, [source, assets]);
  fs.writeFileSync(within(root, '.study-backup-incomplete'), 'Backup has not passed verification.\n', { flag: 'wx' });
  fs.mkdirSync(within(root, 'database'), { mode: 0o700 });
  const dbPath = within(root, 'database/study-agent.sqlite3'), db = openRead(database);
  try { await backup(db, dbPath); fs.chmodSync(dbPath, 0o600); } finally { db.close(); }
  const snapshot = openRead(dbPath); let state, refs;
  try { state = summary(snapshot); refs = references(snapshot); } finally { snapshot.close(); }
  const files = [{ path: 'database/study-agent.sqlite3', size: fs.statSync(dbPath).size, sha256: digest(dbPath) }];
  for (const [relative, expected] of refs) files.push({ path: `data/${relative}`, ...copyVerified(within(source, relative), within(root, `data/${relative}`), expected) });
  let assetCount = 0;
  if (assets) for (const item of walk(noLinks(assets))) {
    files.push({ path: `assets/${item.relative}`, ...copyVerified(item.path, within(root, `assets/${item.relative}`)) });
    if (++assetCount % 5000 === 0) process.stderr.write(`Copied ${assetCount} asset files\n`);
  }
  const manifest = { format: FORMAT, id: randomUUID(), createdAt: new Date().toISOString(), database: state,
    assetsIncluded: Boolean(assets), referencedFileCount: refs.size, assetCount, files };
  fs.writeFileSync(within(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await verifyBundle({ bundle: root, incomplete: true }); fs.unlinkSync(within(root, '.study-backup-incomplete'));
  return { format: FORMAT, id: manifest.id, files: files.length, assetCount, database: state, assetsIncluded: Boolean(assets) };
}
async function verifyBundle({ bundle, incomplete = false }) {
  const root = noLinks(bundle);
  if (!incomplete && fs.existsSync(within(root, '.study-backup-incomplete'))) fail('backup_incomplete');
  const manifestPath = within(root, 'manifest.json');
  if (fs.statSync(manifestPath).size > 256 * 1024 * 1024) fail('manifest_too_large');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== FORMAT || !Array.isArray(manifest.files) || manifest.files.length > 1_000_000) fail('unsupported_backup_format');
  if (typeof manifest.assetsIncluded !== 'boolean' || typeof manifest.id !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))) fail('invalid_manifest_metadata');
  const paths = new Map(), portablePaths = new Set();
  let verifiedCount = 0;
  for (const file of manifest.files) {
    if (!/^(database\/study-agent\.sqlite3|data\/(?:processing|student-media)\/.+|assets\/.+)$/.test(file.path) || portablePaths.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) fail('invalid_manifest_entry');
    const target = within(root, file.path), stat = fs.statSync(target);
    if (!stat.isFile() || stat.size !== file.size || digest(target) !== file.sha256) fail('bundle_integrity_failed');
    paths.set(file.path, file);
    portablePaths.add(file.path.toLowerCase());
    if (++verifiedCount % 25000 === 0) process.stderr.write(`Verified ${verifiedCount} backup files\n`);
  }
  if (!paths.has('database/study-agent.sqlite3')) fail('database_missing_from_manifest');
  const db = openRead(within(root, 'database/study-agent.sqlite3')); let state;
  try {
    state = summary(db);
    if (JSON.stringify(state) !== JSON.stringify(manifest.database)) fail('database_summary_mismatch');
    const refs = references(db);
    if (manifest.referencedFileCount !== refs.size || manifest.assetCount !== [...paths.keys()].filter(p => p.startsWith('assets/')).length || !manifest.assetsIncluded && manifest.assetCount) fail('manifest_count_mismatch');
    for (const [relative, expected] of refs) {
      const actual = paths.get(`data/${relative}`); if (!actual || actual.sha256 !== expected.sha256 || actual.size !== expected.size) fail('database_file_missing_from_bundle');
    }
  } finally { db.close(); }
  return { manifest, database: state, verifiedFiles: paths.size };
}
async function restoreBundle({ bundle, destination, deletionLedger }) {
  const ledger = readLedger(deletionLedger), verified = await verifyBundle({ bundle }), root = freshDestination(destination, [bundle]);
  const marker = within(root, '.study-restore-incomplete'); fs.writeFileSync(marker, 'Restore has not completed. Do not start the application.\n', { flag: 'wx' });
  let restoredCount = 0;
  for (const file of verified.manifest.files) {
    const relative = file.path.startsWith('database/') ? 'study-agent.sqlite3' : file.path.startsWith('data/') ? file.path.slice(5) : file.path;
    copyVerified(within(bundle, file.path), within(root, relative), file);
    if (relative === 'study-agent.sqlite3') {
      const guard = new DatabaseSync(within(root, relative));
      try {
        guard.exec('CREATE TABLE IF NOT EXISTS study_restore_guard(id INTEGER PRIMARY KEY CHECK(id=1),state TEXT NOT NULL,backup_id TEXT,updated_at TEXT NOT NULL)');
        guard.prepare("INSERT INTO study_restore_guard VALUES(1,'restoring',?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,backup_id=excluded.backup_id,updated_at=excluded.updated_at").run(verified.manifest.id, new Date().toISOString());
      } finally { guard.close(); }
    }
    if (++restoredCount % 5000 === 0) process.stderr.write(`Restored ${restoredCount} files\n`);
  }
  const db = new DatabaseSync(within(root, 'study-agent.sqlite3')); let counts;
  try {
    db.exec('BEGIN IMMEDIATE');
    const query = (sql, params = []) => db.prepare(sql).all(...params);
    const { removedMediaIds, ...privacy } = await applyDeletionLedger(query, ledger);
    privacy.mediaDirectoriesPurged = purgeRestoredMedia(root, removedMediaIds);
    counts = { ...await fenceRestoredState(query, verified.manifest.id, verified.database.revision), ...privacy };
    if (Number(db.prepare("UPDATE study_restore_guard SET state='ready',updated_at=? WHERE id=1 AND backup_id=? AND state='restoring'").run(counts.restoredAt, verified.manifest.id).changes) !== 1) fail('restore_guard_changed');
    db.exec('COMMIT'); summary(db);
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; } finally { db.close(); }
  const receipt = { format: FORMAT, backupId: verified.manifest.id, sourceRevision: verified.database.revision,
    assetsIncluded: verified.manifest.assetsIncluded, verifiedFiles: verified.verifiedFiles, ...counts };
  fs.writeFileSync(within(root, 'restore-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); fs.unlinkSync(marker);
  return receipt;
}
module.exports = { createBundle, verifyBundle, restoreBundle,
  files: { noLinks, within, freshDestination, digest, copyVerified, referencesFromRecords, walk } };
if (require.main === module) {
  (async () => {
    const [command, ...args] = process.argv.slice(2), options = {}, allowed = command === 'create' ? ['data-dir', 'destination', 'assets'] : ['bundle', 'destination', 'deletion-ledger'];
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2);
      if (!args[i].startsWith('--') || !args[i + 1] || !allowed.includes(key) || options[key]) fail('invalid_arguments'); options[key] = args[i + 1];
    }
    return command === 'create' ? createBundle({ dataDir: options['data-dir'], destination: options.destination, assets: options.assets }) :
      command === 'verify' ? verifyBundle({ bundle: options.bundle }).then(r => ({ verifiedFiles: r.verifiedFiles, database: r.database, assetsIncluded: r.manifest.assetsIncluded })) :
      command === 'restore' ? restoreBundle({ bundle: options.bundle, destination: options.destination, deletionLedger: options['deletion-ledger'] }) : fail('usage_create_verify_restore');
  })().then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { process.stderr.write(`Backup operation failed: ${error.code ?? error.message}\n`); process.exitCode = 1; });
}
