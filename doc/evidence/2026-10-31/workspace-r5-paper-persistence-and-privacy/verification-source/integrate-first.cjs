const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p171'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const fullSource = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'api-full-second-source.json.gz'))));
const final = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'reader-regression-first-source.json.gz'))));
const full = read('api-full-second-vitest.json'), regression = read('reader-regression-first-vitest.json'), pg = read('legacy-postgres-first-vitest.json');
if (full.numPassedTests !== 2552 || full.numFailedTests !== 12 || full.numPendingTests !== 106 || regression.numPassedTests !== 46 || regression.numFailedTests ||
    regression.numPendingTests !== 8 || pg.numPassedTests !== 20 || pg.numFailedTests || pg.numPendingTests !== 1 ||
    ['api-full-second.json', 'reader-regression-first.json', 'legacy-postgres-first.json'].some(file => !read(file).sourceUnchanged)) throw Error('Actual final regression evidence required');
const failures = full.testResults.flatMap(suite => suite.assertionResults.filter(row => row.status === 'failed'));
if (failures.length !== 12 || failures.some(row => !row.failureMessages.every(message => /expected (?:32 to be 31|\{ version: 32 \} to deeply equal \{ version: 31 \})/.test(message)))) throw Error('Unresolved non-version regression');
if (final.some(row => !/\.(test|spec)\.ts$/.test(row.path) && !row.path.includes('/dist/') && fullSource.some(old => old.path === row.path && old.sha256 !== row.sha256))) throw Error('Application changed after full regression');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== preparation.head ||
    execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '?? doc/product/171-paper-library-persistence-privacy-and-native-recovery.md') throw Error('Unexpected main changes');
for (const row of preparation.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
const database = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true });
const formal = { schema: database.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: database.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; database.close();
if (JSON.stringify(formal) !== JSON.stringify(preparation.formal)) throw Error('Formal metadata changed');
const changes = [], before = [];
for (const row of final.filter(row => /^(apps\/api\/src\/.*\.ts|scripts\/operations\/.*\.cjs)$/.test(row.path))) {
  const current = fs.readFileSync(path.join(candidate, row.path)); if (sha(current) !== row.sha256 || sha(Buffer.from(row.data, 'base64')) !== row.sha256) throw Error('Candidate changed');
  const destination = path.join(root, row.path), baseline = preparation.files.find(file => file.path === row.path), exists = fs.existsSync(destination);
  if (baseline ? !exists || sha(fs.readFileSync(destination)) !== baseline.sha256 : exists) throw Error('Main target changed');
  if (baseline?.sha256 === row.sha256) continue;
  before.push({ path: row.path, existed: exists, data: exists ? fs.readFileSync(destination).toString('base64') : null }); changes.push(row);
}
if (changes.length !== 50) throw Error('Unexpected source delta');
fs.writeFileSync(path.join(__dirname, 'main-before-integration.json.gz'), zlib.gzipSync(JSON.stringify(before)), { flag: 'wx' });
for (const row of changes) {
  const destination = path.join(root, row.path); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, Buffer.from(row.data, 'base64'), { flag: before.find(item => item.path === row.path).existed ? 'w' : 'wx' });
  if (sha(fs.readFileSync(destination)) !== row.sha256) throw Error('Main source readback failed');
}
const result = { at: new Date().toISOString(), baseline: preparation.head, source: changes.map(({data, ...row}) => row), formal, protectedFiles: preparation.protectedFiles.length,
  applicationSchema: 32, formalSchemaMigrated: false, routesEnabled: false, workerEnabled: false, fullRegression: { passed: 2552, failed: 12, skipped: 106 },
  versionAssertionRecheck: { passed: 46, failed: 0, skipped: 8 }, actualLegacyPostgres: { passed: 20, failed: 0, skipped: 1 }, applicationIdenticalToFullRegression: true };
fs.writeFileSync(path.join(__dirname, 'integration-first.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ integrated: changes.length, formal, applicationSchema: 32, routesEnabled: false }));
