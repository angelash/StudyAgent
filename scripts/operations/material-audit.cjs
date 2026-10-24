#!/usr/bin/env node
// Read-only inventory. An eligible result is a candidate, never permission to unlink.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const HASH = /^[a-f0-9]{64}$/;
const UPLOAD = /^studio_upload_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ACTIVE = new Set(['queued', 'running', 'retry_wait', 'cancel_requested']);
const COLLECTIONS = ['studioSourceMaterials', 'studioMaterialUploads', 'sourceCourses', 'studioMaterialAssets'];
const MAX_ENTRIES = 100000;
const fail = code => { throw new Error(code); };
const body = row => typeof row.body === 'string' ? JSON.parse(row.body) : row.body;

function noLinks(input) {
  let cursor = path.resolve(input);
  for (;;) {
    try { if (fs.lstatSync(cursor).isSymbolicLink()) fail('material_audit_link_not_allowed'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(cursor); if (parent === cursor) return path.resolve(input); cursor = parent;
  }
}
function target(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..') || /^[a-z]:|^\//i.test(relative)) fail('unsafe_material_audit_path');
  const result = path.resolve(root, relative);
  if (!result.startsWith(path.resolve(root) + path.sep)) fail('unsafe_material_audit_path');
  return result;
}

async function readMaterialSnapshot({ dataDir, connectionString }) {
  const placeholders = COLLECTIONS.map(() => '?').join(',');
  const recordsSql = `SELECT collection,body FROM domain_records WHERE collection IN (${placeholders}) LIMIT ${MAX_ENTRIES + 1}`;
  const tasksSql = `SELECT id,kind,state,payload FROM durable_tasks WHERE kind='studio.material.process' AND state IN ('queued','running','retry_wait','cancel_requested') LIMIT ${MAX_ENTRIES + 1}`;
  const validate = snapshot => {
    if (snapshot.rows.length > MAX_ENTRIES || snapshot.tasks.length > MAX_ENTRIES) fail('material_audit_record_limit');
    snapshot.rows = snapshot.rows.map(row => ({ collection: row.collection, body: body(row) }));
    snapshot.tasks = snapshot.tasks.map(row => ({ ...row, payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload }));
    return snapshot;
  };
  if (connectionString) {
    if (!/^postgres(?:ql)?:/.test(connectionString)) fail('material_audit_postgres_required');
    const { Pool } = require('pg'), pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 }); let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      let index = 0;
      const revision = Number((await client.query('SELECT revision FROM store_meta WHERE id=1')).rows[0]?.revision);
      const rows = (await client.query(recordsSql.replace(/\?/g, () => '$' + (++index)), COLLECTIONS)).rows;
      const tasks = (await client.query(tasksSql)).rows;
      await client.query('COMMIT'); return validate({ revision, rows, tasks, driver: 'postgres' });
    } catch (error) { await client?.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client?.release(); await pool.end(); }
  }
  const database = new DatabaseSync(noLinks(path.resolve(dataDir, 'study-agent.sqlite3')), { readOnly: true });
  try {
    database.exec('BEGIN');
    const revision = Number(database.prepare('SELECT revision FROM store_meta WHERE id=1').get()?.revision);
    const rows = database.prepare(recordsSql).all(...COLLECTIONS), tasks = database.prepare(tasksSql).all();
    database.exec('COMMIT'); return validate({ revision, rows, tasks, driver: 'sqlite' });
  } finally { database.close(); }
}

/** Shared by the audit and future collector. Invalid references conservatively disable eligibility. */
function materialReferences(rows, tasks = [], now = Date.now()) {
  const assets = new Map(), uploads = new Map(), expected = new Map(), issues = [], materialById = new Map(), frozenPdfs = new Set();
  const asset = sha => { if (!HASH.test(sha ?? '')) { issues.push('invalid_source_hash'); return; } if (!assets.has(sha)) assets.set(sha, { references: new Set(), active: false }); return assets.get(sha); };
  const expect = (relative, hash, size) => {
    if (!HASH.test(hash ?? '') || !Number.isSafeInteger(size) || size < 0) { issues.push('invalid_file_integrity_reference'); return; }
    const prior = expected.get(relative);
    if (prior && (prior.sha256 !== hash || prior.size !== size)) issues.push('conflicting_file_integrity_reference');
    else expected.set(relative, { sha256: hash, size });
  };
  for (const entry of rows) {
    const row = body(entry);
    if (!row || typeof row !== 'object') { issues.push('invalid_material_record'); continue; }
    if (entry.collection === 'studioSourceMaterials') {
      const ref = asset(row.sha256); if (!ref) continue; ref.references.add('material:' + row.id); materialById.set(row.id, row.sha256);
      if (row.kind !== 'text' || row.originalFormat === 'txt') {
        const format = row.originalFormat ?? 'pdf';
        if (!['pdf', 'txt'].includes(format)) issues.push('invalid_original_format');
        else expect(`studio-materials/${row.sha256}.${format}`, row.sha256, row.byteSize);
      }
      for (const [kind, files] of [['page', row.pageFiles], ['checkpoint', row.checkpointFiles]]) {
        if (files !== undefined && !Array.isArray(files)) { issues.push('invalid_page_file_list'); continue; }
        for (const file of files ?? []) {
          if (!Number.isSafeInteger(file.page) || file.page < 1 || file.page > 500) { issues.push('invalid_page_number'); continue; }
          const extension = kind === 'page' ? 'png' : 'json', name = file.name ?? (kind === 'page' ? `page-${file.page}.png` : '');
          if (!new RegExp(`^(?:study-pdf-structure-v[1-9]\\d*/)?page-${file.page}\\.${extension}$`).test(name) || kind === 'checkpoint' && !name.includes('/')) { issues.push('invalid_page_file_name'); continue; }
          expect(`studio-materials/processed/${row.sha256}/${name}`, file.sha256, file.size);
        }
      }
    } else if (entry.collection === 'sourceCourses') {
      if (!Array.isArray(row.sources)) { issues.push('invalid_frozen_course_sources'); continue; }
      for (const source of row.sources) { const ref = asset(source.sha256); ref?.references.add('course:' + row.id); if (ref && source.kind === 'pdf') frozenPdfs.add(source.sha256); }
    } else if (entry.collection === 'studioMaterialUploads') {
      if (!UPLOAD.test(row.id ?? '') || !['uploading', 'completed', 'cancelled'].includes(row.status) || !Number.isFinite(Date.parse(row.expiresAt))) { issues.push('invalid_upload_record'); continue; }
      const active = row.status === 'uploading' && Date.parse(row.expiresAt) > now;
      uploads.set(row.id, { active, expiresAt: row.expiresAt });
      if (active) { const ref = asset(row.sha256); if (ref) { ref.references.add('upload:' + row.id); ref.active = true; } }
      if (!Array.isArray(row.chunks)) { issues.push('invalid_upload_chunk_list'); continue; }
      if (active) for (const chunk of row.chunks) {
        if (!Number.isSafeInteger(chunk.index) || chunk.index < 0 || chunk.index > 100000) { issues.push('invalid_upload_chunk_index'); continue; }
        if (!HASH.test(chunk.sha256 ?? '')) { issues.push('invalid_upload_chunk_hash'); continue; }
        expect(`studio-uploads/${row.id}/${chunk.index}-${chunk.sha256}`, chunk.sha256, chunk.size);
      }
    } else if (entry.collection === 'studioMaterialAssets') {
      if (row.state === 'deleting') { const ref = asset(row.id); if (ref) ref.active = true; }
    }
  }
  for (const task of tasks) {
    if (!ACTIVE.has(task.state) || task.kind !== 'studio.material.process') continue;
    const sha = task.payload?.sha256 ?? materialById.get(task.payload?.materialId), ref = asset(sha);
    if (ref) { ref.references.add('task:' + task.id); ref.active = true; }
  }
  // A frozen PDF source still requires its original when the mutable material row is gone.
  for (const sha of frozenPdfs) if (!expected.has(`studio-materials/${sha}.pdf`)) expected.set(`studio-materials/${sha}.pdf`, { sha256: sha, size: null });
  return { assets, uploads, expected, issues: [...new Set(issues)] };
}

function managedEntry(relative, directory) {
  if (directory) {
    if (['studio-materials', 'studio-materials/processed', 'studio-uploads'].includes(relative)) return { container: true };
    let match = relative.match(/^studio-materials\/processed\/([a-f0-9]{64})(?:\/study-pdf-structure-v[1-9]\d*)?$/);
    if (match) return { key: match[1], kind: 'source' };
    match = relative.match(/^studio-uploads\/(studio_upload_[a-f0-9-]+)$/);
    if (match && UPLOAD.test(match[1])) return { key: match[1], kind: 'upload' };
    return null;
  }
  let match = relative.match(/^studio-materials\/([a-f0-9]{64})\.(pdf|txt)$/);
  if (match) return { key: match[1], kind: 'source', part: 'original' };
  match = relative.match(/^studio-materials\/processed\/([a-f0-9]{64})\/(?:study-pdf-structure-v[1-9]\d*\/)?page-([1-9]\d*)\.(png|json)$/);
  if (match && Number(match[2]) <= 500) return { key: match[1], kind: 'source', part: match[3] === 'png' ? 'page' : 'checkpoint' };
  match = relative.match(/^studio-uploads\/(studio_upload_[a-f0-9-]+)\/(0|[1-9]\d*)-([a-f0-9]{64})$/);
  if (match && UPLOAD.test(match[1]) && Number(match[2]) <= 100000) return { key: match[1], kind: 'upload', part: 'chunk' };
  return null;
}

async function fileDigest(file) {
  const hash = createHash('sha256'); for await (const bytes of fs.createReadStream(file)) hash.update(bytes); return hash.digest('hex');
}
async function auditMaterials({ dataDir, snapshot, graceHours = 24, now = Date.now(), verify = true }) {
  if (!Number.isFinite(now) || !Number.isFinite(graceHours) || graceHours < 0 || graceHours > 8760) fail('invalid_material_audit_budget');
  const root = noLinks(dataDir), references = materialReferences(snapshot.rows, snapshot.tasks, now), entries = [], seen = new Set();
  let count = 0, complete = references.issues.length === 0;
  async function visit(relative) {
    if (++count > MAX_ENTRIES) fail('material_audit_file_limit');
    const location = target(root, relative); let stat;
    try { stat = await fsp.lstat(location); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) { entries.push({ path: relative, state: 'unknown', reason: 'link_not_followed', bytes: 0 }); complete = false; return; }
    const managed = managedEntry(relative, stat.isDirectory());
    if (!managed || !stat.isFile() && !stat.isDirectory()) { entries.push({ path: relative, state: 'unknown', reason: 'unmanaged_entry', bytes: stat.isFile() ? stat.size : 0 }); complete = false; return; }
    if (stat.isDirectory()) {
      // Recheck ancestors before every read; unknown directories are never traversed.
      noLinks(location);
      for (const name of (await fsp.readdir(location)).sort()) await visit(relative + '/' + name);
      return;
    }
    seen.add(relative);
    const ref = managed.kind === 'source' ? references.assets.get(managed.key) : undefined, upload = managed.kind === 'upload' ? references.uploads.get(managed.key) : undefined;
    const state = ref?.active || upload?.active ? 'active' : ref?.references.size ? 'referenced' : now - stat.mtimeMs < graceHours * 3600000 ? 'grace' : 'eligible';
    const entry = { path: relative, key: managed.key, part: managed.part, state, bytes: stat.size, references: ref?.references.size ?? (upload?.active ? 1 : 0) };
    const expected = references.expected.get(relative);
    if (expected) {
      entry.integrity = 'not_checked';
      if (verify) {
        noLinks(location); const before = await fsp.lstat(location);
        const digest = before.isFile() && !before.isSymbolicLink() && (expected.size === null || before.size === expected.size) ? await fileDigest(location) : null;
        const after = await fsp.lstat(location);
        entry.integrity = digest === expected.sha256 && before.mtimeMs === after.mtimeMs && before.ino === after.ino && before.size === after.size ? 'verified' : 'mismatch';
        if (entry.integrity !== 'verified') { entry.state = 'unknown'; entry.reason = 'integrity_mismatch_or_changed'; complete = false; }
      }
    }
    entries.push(entry);
  }
  await visit('studio-materials'); await visit('studio-uploads');
  for (const [relative, expected] of references.expected) if (!seen.has(relative)) {
    entries.push({ path: relative, state: 'unknown', reason: 'registered_file_missing_or_unreachable', bytes: 0, expectedBytes: expected.size }); complete = false;
  }
  if (!complete) for (const entry of entries) if (entry.state === 'eligible') { entry.state = 'unknown'; entry.reason = 'incomplete_reference_or_file_inventory'; }
  const totals = Object.fromEntries(['referenced', 'eligible', 'grace', 'active', 'unknown'].map(state => [state, { files: 0, bytes: 0 }]));
  for (const entry of entries) { totals[entry.state].files++; totals[entry.state].bytes += entry.bytes; }
  return { format: 'study-material-audit-v1', readOnly: true, capturedAt: new Date(now).toISOString(), database: { driver: snapshot.driver, revision: snapshot.revision }, graceHours, verifiedHashes: verify, complete, issues: references.issues, totals, entries,
    notice: 'This is a read-only snapshot. Eligible files require a fresh transactional reference check and process/write leases before any collection.' };
}

async function main(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]; if (!['--data-dir', '--connection-env', '--grace-hours', '--output'].includes(flag) || !args[index + 1] || Object.hasOwn(options, flag)) fail('invalid_material_audit_arguments');
    options[flag] = args[index + 1];
  }
  if (!options['--data-dir']) fail('material_audit_data_dir_required');
  const connectionString = options['--connection-env'] ? process.env[options['--connection-env']] : undefined;
  if (options['--connection-env'] && !connectionString) fail('material_audit_connection_environment_missing');
  const snapshot = await readMaterialSnapshot({ dataDir: options['--data-dir'], connectionString });
  const report = await auditMaterials({ dataDir: options['--data-dir'], snapshot, graceHours: options['--grace-hours'] === undefined ? 24 : Number(options['--grace-hours']) });
  if (options['--output']) {
    const destination = noLinks(options['--output']);
    // Never place reports in the inventory or replace existing evidence.
    const root = path.resolve(options['--data-dir']); if (destination === root || destination.startsWith(root + path.sep)) fail('material_audit_output_inside_data_root');
    await fsp.writeFile(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { ...report, entries: undefined, output: destination };
  }
  return report;
}
module.exports = { readMaterialSnapshot, materialReferences, managedEntry, auditMaterials, main };
if (require.main === module) main(process.argv.slice(2)).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error('Material audit failed: ' + (error.code ?? error.message)); process.exitCode = 1; });
