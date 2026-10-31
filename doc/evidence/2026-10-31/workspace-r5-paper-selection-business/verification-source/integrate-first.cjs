const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p172'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const source = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'regression-first-source.json.gz'))));
for (const [name, passed, files] of [['business-second', 16, 1], ['postgres-first', 16, 1], ['regression-first', 170, 11]]) {
  const report = JSON.parse(fs.readFileSync(path.join(__dirname, name + '-vitest.json'))), execution = JSON.parse(fs.readFileSync(path.join(__dirname, name + '.json')));
  if (report.numPassedTests !== passed || report.numFailedTests || report.numPendingTests || report.testResults.length !== files || !execution.sourceUnchanged) throw Error('Complete final scoped evidence required');
}
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== preparation.head || execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Exact clean main baseline required');
if (source.length !== 7 || source.some(row => !/^apps\/api\/src\/.*\.ts$/.test(row.path))) throw Error('Unexpected source scope');
for (const row of preparation.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
const before = [];
for (const row of source) {
  if (sha(fs.readFileSync(path.join(candidate, row.path))) !== row.sha256 || sha(Buffer.from(row.data, 'base64')) !== row.sha256) throw Error('Candidate changed');
  const target = path.join(root, row.path), baseline = preparation.files.find(file => file.path === row.path), exists = fs.existsSync(target);
  if (baseline ? !exists || sha(fs.readFileSync(target)) !== baseline.sha256 : exists) throw Error('Main target changed');
  before.push({ path: row.path, data: exists ? fs.readFileSync(target).toString('base64') : null });
}
fs.writeFileSync(path.join(__dirname, 'main-before-integration.json.gz'), zlib.gzipSync(JSON.stringify(before)), { flag: 'wx' });
for (const row of source) {
  const target = path.join(root, row.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(row.data, 'base64'), { flag: before.find(file => file.path === row.path).data === null ? 'wx' : 'w' });
  if (sha(fs.readFileSync(target)) !== row.sha256) throw Error('Main readback mismatch');
}
const result = { at: new Date().toISOString(), baseline: preparation.head, source: source.map(({data, ...row}) => row),
  applicationSchema: 32, selectionAndReadRoutes: true, oldBodyMediaDiagnosticRestrictions: false, renderCleanupWorkers: false, workspaceSelectionUi: false, pushed: false, deployed: false };
fs.writeFileSync(path.join(__dirname, 'integration-first.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ integrated: source.length, applicationSchema: 32, selectionReadRoutes: true, wholeGoal: 'active' }));
