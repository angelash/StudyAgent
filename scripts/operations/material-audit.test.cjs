const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { auditMaterials, readMaterialSnapshot, main } = require('./material-audit.cjs');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = Date.parse('2026-10-24T01:00:00Z');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-material-audit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const data = path.join(directory, 'data'); fs.mkdirSync(data);
  const write = (name, bytes, ageHours = 48) => { const file = path.join(data, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); fs.utimesSync(file, new Date(stamp - ageHours * 3600000), new Date(stamp - ageHours * 3600000)); return file; };
  const rows = [], tasks = [], snapshot = { rows, tasks, revision: 7, driver: 'fixture' };
  const add = (collection, body) => rows.push({ collection, body });
  const original = (text, id) => { const bytes = Buffer.from('%PDF-' + text), sha256 = digest(bytes); write(`studio-materials/${sha256}.pdf`, bytes); return { id, kind: 'pdf', sha256, byteSize: bytes.length }; };
  const audit = extra => auditMaterials({ dataDir: data, snapshot, now: stamp, ...extra });
  return { directory, data, write, rows, tasks, snapshot, add, original, audit };
}

test('shared materials, frozen courses, active tasks and live uploads protect the complete SHA group', async t => {
  const f = fixture(t), shared = f.original('shared', 'first'), frozen = f.original('frozen', 'removed-material'), active = f.original('active', 'worker-only');
  f.add('studioSourceMaterials', shared); f.add('studioSourceMaterials', { ...shared, id: 'second-family' });
  f.add('sourceCourses', { id: 'frozen-course', sources: [{ sha256: frozen.sha256, materialId: frozen.id, kind: 'pdf' }] });
  f.tasks.push({ id: 'worker', kind: 'studio.material.process', state: 'cancel_requested', payload: { sha256: active.sha256 } });
  const uploadId = 'studio_upload_' + randomUUID(), chunk = Buffer.from('pending chunk'), chunkHash = digest(chunk), chunkPath = `studio-uploads/${uploadId}/0-${chunkHash}`;
  f.add('studioMaterialUploads', { id: uploadId, status: 'uploading', sha256: 'e'.repeat(64), chunks: [{ index: 0, sha256: chunkHash, size: chunk.length }], expiresAt: '2026-10-25T00:00:00Z' });
  f.write(chunkPath, chunk); f.write(`studio-materials/processed/${shared.sha256}/study-pdf-structure-v3/page-1.png`, 'registered group, unregistered page');
  const report = await f.audit(); assert.equal(report.complete, true);
  assert.equal(report.entries.find(e => e.key === shared.sha256).references, 2);
  assert.equal(report.entries.filter(e => e.key === shared.sha256).every(e => e.state === 'referenced'), true);
  assert.equal(report.entries.find(e => e.key === frozen.sha256).state, 'referenced');
  assert.equal(report.entries.find(e => e.key === active.sha256).state, 'active');
  assert.equal(report.entries.find(e => e.path === chunkPath).state, 'active');
  assert.equal(JSON.stringify(report).includes('first'), false); assert.equal(JSON.stringify(report).includes('pending chunk'), false);
});

test('unreferenced originals and ended upload chunks observe the grace period without changing any bytes', async t => {
  const f = fixture(t), old = f.original('orphan', 'gone'), freshHash = digest(Buffer.from('fresh')), uploadId = 'studio_upload_' + randomUUID();
  f.write(`studio-materials/${freshHash}.txt`, 'fresh', 1);
  f.add('studioMaterialUploads', { id: uploadId, status: 'uploading', sha256: old.sha256, chunks: [], expiresAt: '2026-10-20T00:00:00Z' });
  const chunkPath = `studio-uploads/${uploadId}/0-${'a'.repeat(64)}`; f.write(chunkPath, 'expired bytes');
  const before = fs.readFileSync(path.join(f.data, chunkPath)), report = await f.audit();
  assert.equal(report.entries.find(e => e.key === old.sha256).state, 'eligible');
  assert.equal(report.entries.find(e => e.key === freshHash).state, 'grace');
  assert.equal(report.entries.find(e => e.path === chunkPath).state, 'eligible');
  assert.deepEqual(fs.readFileSync(path.join(f.data, chunkPath)), before); assert.equal(report.readOnly, true);
  assert.equal((await f.audit({ graceHours: 72 })).entries.every(e => e.state === 'grace'), true);
});

test('unknown paths, directories and links are never traversed and disable all candidate deletion', async t => {
  const f = fixture(t); f.original('orphan', 'gone');
  const outside = path.join(f.directory, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'private.txt'), 'outside sentinel');
  fs.symlinkSync(outside, path.join(f.data, 'studio-materials', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  f.write('studio-materials/unknown/nested.pdf', 'never traverse');
  f.write('assets/retained.txt', 'not in the managed roots');
  const report = await f.audit(); assert.equal(report.complete, false); assert.equal(report.totals.eligible.files, 0);
  assert.equal(report.entries.some(e => e.path.includes('nested.pdf') || e.path.includes('retained.txt') || e.path.includes('private.txt')), false);
  assert.equal(report.entries.find(e => e.path.endsWith('/linked')).reason, 'link_not_followed');
  assert.equal(fs.readFileSync(path.join(outside, 'private.txt'), 'utf8'), 'outside sentinel');
});

test('registered missing, corrupted and conflicting files are reported, including checkpoint JSON', async t => {
  const f = fixture(t), material = f.original('valid', 'material'), page = Buffer.from('original page'), checkpoint = Buffer.from('saved checkpoint');
  material.pageFiles = [{ page: 1, name: 'study-pdf-structure-v3/page-1.png', sha256: digest(page), size: page.length }];
  material.checkpointFiles = [{ page: 1, name: 'study-pdf-structure-v3/page-1.json', sha256: digest(checkpoint), size: checkpoint.length }];
  f.add('studioSourceMaterials', material);
  f.write(`studio-materials/processed/${material.sha256}/study-pdf-structure-v3/page-1.json`, Buffer.alloc(checkpoint.length, 'x'));
  f.original('unreferenced', 'orphan');
  const report = await f.audit(); assert.equal(report.complete, false); assert.equal(report.totals.eligible.files, 0);
  assert.equal(report.entries.find(e => e.path.endsWith('.json')).integrity, 'mismatch');
  assert.equal(report.entries.find(e => e.path.endsWith('.png')).reason, 'registered_file_missing_or_unreachable');
  material.pageFiles[0].name = '../../outside.png';
  assert.equal((await f.audit()).issues.includes('invalid_page_file_name'), true);
});

test('reads a consistent SQLite snapshot with read-only access and writes reports only outside the data root', async t => {
  const f = fixture(t), material = f.original('sqlite-backed', 'material'), db = new DatabaseSync(path.join(f.data, 'study-agent.sqlite3'));
  db.exec('CREATE TABLE store_meta(id INTEGER PRIMARY KEY,revision INTEGER); INSERT INTO store_meta VALUES(1,19); CREATE TABLE domain_records(collection TEXT,body TEXT); CREATE TABLE durable_tasks(id TEXT,kind TEXT,state TEXT,payload TEXT);');
  db.prepare('INSERT INTO domain_records VALUES(?,?)').run('studioSourceMaterials', JSON.stringify(material)); db.close();
  const snapshot = await readMaterialSnapshot({ dataDir: f.data }); assert.equal(snapshot.driver, 'sqlite'); assert.equal(snapshot.revision, 19);
  assert.equal(snapshot.rows[0].body.sha256, material.sha256);
  const reportFile = path.join(f.directory, 'report.json'), receipt = await main(['--data-dir', f.data, '--output', reportFile]);
  assert.equal(receipt.complete, true); assert.equal(JSON.parse(fs.readFileSync(reportFile)).totals.referenced.files, 1);
  await assert.rejects(main(['--data-dir', f.data, '--output', reportFile]), /EEXIST/);
  await assert.rejects(main(['--data-dir', f.data, '--output', path.join(f.data, 'report.json')]), /output_inside_data_root/);
  const reopened = new DatabaseSync(path.join(f.data, 'study-agent.sqlite3'), { readOnly: true });
  assert.equal(reopened.prepare('SELECT revision FROM store_meta').get().revision, 19); assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM domain_records').get().count, 1); reopened.close();
});

test('bad references and invalid budgets fail conservatively; inline text requires no physical original', async t => {
  const f = fixture(t); f.original('orphan', 'gone');
  f.add('studioSourceMaterials', { id: 'paste', kind: 'text', sha256: 'a'.repeat(64), byteSize: 40 });
  assert.equal((await f.audit()).complete, true);
  f.add('sourceCourses', { id: 'bad', sources: [{ sha256: '../bad' }] });
  const report = await f.audit(); assert.equal(report.complete, false); assert.equal(report.totals.eligible.files, 0);
  await assert.rejects(f.audit({ graceHours: -1 }), /invalid_material_audit_budget/);
});

test('missing originals remain visible when only a frozen PDF course references them', async t => {
  const f = fixture(t), material = f.original('frozen missing', 'removed');
  f.add('sourceCourses', { id: 'retained-course', sources: [{ sha256: material.sha256, kind: 'pdf' }] });
  assert.equal((await f.audit()).entries[0].integrity, 'verified');
  fs.unlinkSync(path.join(f.data, `studio-materials/${material.sha256}.pdf`));
  const report = await f.audit(); assert.equal(report.complete, false);
  assert.equal(report.entries[0].reason, 'registered_file_missing_or_unreachable');
});
