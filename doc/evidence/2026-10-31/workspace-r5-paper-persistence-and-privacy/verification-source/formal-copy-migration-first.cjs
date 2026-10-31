const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib'), { DatabaseSync, backup } = require('node:sqlite');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p171'), own = path.join(__dirname, 'formal24-to32-first');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (fs.existsSync(own)) throw Error('Exclusive migration directory required'); fs.mkdirSync(own);
const source = path.join(root, 'data/study-agent.sqlite3'), target = path.join(own, 'formal-snapshot.private.sqlite3');
if (!path.resolve(target).startsWith(path.resolve(__dirname) + path.sep) || target === source) throw Error('Unsafe isolated target');
function observation(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const hash = crypto.createHash('sha256'); let count = 0;
    for (const row of db.prepare('SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,position,record_id').iterate()) { hash.update(JSON.stringify(row) + '\n'); count++; }
    return { schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision,
      records: count, businessBytesAndOrderSha256: hash.digest('hex'), collections: db.prepare('SELECT collection,COUNT(*) count FROM domain_records GROUP BY collection ORDER BY collection').all(),
      guard: db.prepare('SELECT state FROM study_restore_guard WHERE id=1').get().state };
  } finally { db.close(); }
}
(async () => {
  const actualBefore = observation(source); if (actualBefore.schema !== 24 || actualBefore.revision !== 187) throw Error('Formal metadata changed; do not assume authorization to alter it');
  const readOnly = new DatabaseSync(source, { readOnly: true }); try { await backup(readOnly, target); } finally { readOnly.close(); }
  const before = observation(target); if (JSON.stringify(before) !== JSON.stringify(actualBefore)) throw Error('Read-only snapshot differs');
  const { DomainDatabase } = require(path.join(candidate, 'apps/api/dist/apps/api/src/infrastructure/domain-database.js'));
  for (let index = 0; index < 2; index++) { const db = new DomainDatabase(target); await db.open(); await db.close(); }
  const after = observation(target);
  if (after.schema !== 32 || after.guard !== 'ready-schema32' || after.revision !== before.revision || after.records !== before.records ||
      after.businessBytesAndOrderSha256 !== before.businessBytesAndOrderSha256 || JSON.stringify(after.collections) !== JSON.stringify(before.collections)) throw Error('Isolated migration rewrote business facts');
  const archive = fs.readFileSync(path.join(root, 'resources/compatibility/domain-reader-schema31-v1.json.gz')), receipt = JSON.parse(fs.readFileSync(path.join(root, 'resources/compatibility/domain-reader-schema31-v1.receipt.json')));
  if (sha(archive) !== receipt.gzipSha256) throw Error('Actual old archive changed');
  const manifest = JSON.parse(zlib.gunzipSync(archive)), oldRoot = path.join(own, 'actual-reader31');
  for (const [name, file] of Object.entries(manifest.files)) {
    if (!/^(apps\/api\/dist\/|packages\/(contracts|config)\/|scripts\/operations\/)/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..') || /[\\:\x00]/.test(name)) throw Error('Unsafe archive entry');
    const bytes = Buffer.from(file.base64, 'base64'); if (sha(bytes) !== file.sha256) throw Error('Actual old source changed'); const destination = path.join(oldRoot, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  for (const file of manifest.externalDependencies) if (!file.path.startsWith('node_modules/') || file.path.split('/').includes('..') || sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw Error('Old external dependency changed');
  fs.mkdirSync(path.join(oldRoot, 'node_modules/@study-agent'), { recursive: true });
  for (const name of ['contracts', 'config']) fs.symlinkSync(path.join(oldRoot, 'packages', name), path.join(oldRoot, 'node_modules/@study-agent', name), 'junction');
  const { DomainDatabase: Reader31 } = require(path.join(oldRoot, 'apps/api/dist/apps/api/src/infrastructure/domain-database.js')), bytesBefore = sha(fs.readFileSync(target)), old = new Reader31(target);
  let refused = false; try { await old.open(); } catch (error) { refused = /restoration|schema|reader/i.test(error.message); } finally { await old.close(); }
  if (!refused || sha(fs.readFileSync(target)) !== bytesBefore || JSON.stringify(observation(target)) !== JSON.stringify(after)) throw Error('Old reader did not refuse without writes');
  const actualAfter = observation(source); if (JSON.stringify(actualAfter) !== JSON.stringify(actualBefore)) throw Error('Formal state changed');
  const report = { at: new Date().toISOString(), before, after, twoColdOpens: true, formalReadOnly: true, formalUnchanged: true, original31Refused32: true,
    original31ArchiveSha256: sha(archive), externalDependenciesVerified: manifest.externalDependencies.length, privateDatabaseNeverPublished: true,
    scope: 'Native database compatibility only. Does not prove copied media, new-device tools, HTTP routes or teaching effect.' };
  fs.writeFileSync(path.join(__dirname, 'formal-copy-migration-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ records: before.records, collections: before.collections.length, migrated: '24->32', twoColdOpens: true, businessBytesAndOrderUnchanged: true, revision: after.revision, actual31RefusedWithoutWrite: true, formalUnchanged: true }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
