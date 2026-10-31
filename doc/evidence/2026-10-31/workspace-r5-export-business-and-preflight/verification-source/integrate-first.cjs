const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p174'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz')))), read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name)));
for (const [batch, passed, files] of [['business-fourth', 19, 2], ['postgres-third', 15, 1], ['regression-first', 207, 14]]) {
  const report = read(batch + '-vitest.json'); if (report.numPassedTests !== passed || report.numFailedTests || report.numPendingTests || report.testResults.length !== files || !read(batch + '.json').sourceUnchanged) throw Error('Actual scoped evidence required');
}
const python = read('python-first.json'); if (python.exit !== 0 || python.testCount !== 25 || !python.sourceUnchanged || !read('postgres-stop-first.json').stopped) throw Error('Actual Python and shutdown evidence required');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== preparation.head || execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Exact clean main baseline required');
const paths = ['apps/api/src/common/auth.guard.ts', 'apps/api/src/modules/library/library.module.ts', ...['paper-export-document-source.ts', 'paper-export-runtime.service.ts', 'paper-export.service.ts', 'paper-export.controller.ts', 'paper-export-business.integration.test.ts', 'paper-export-document-source.test.ts'].map(name => 'apps/api/src/modules/library/' + name),
  'apps/api/package.json', 'package-lock.json', ...['paper_export_content.py', 'paper_export_memory_preflight.py', 'test_paper_export.py'].map(name => 'scripts/processing/' + name)];
const actual = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'business-fourth-source.json.gz'))));
const before = [], source = [];
for (const relative of paths) {
  const bytes = fs.readFileSync(path.join(candidate, relative)), hash = sha(bytes), exact = actual.find(row => row.path === relative);
  if (!exact || hash !== exact.sha256 || sha(Buffer.from(exact.data, 'base64')) !== hash) throw Error('Candidate differs from tested source: ' + relative);
  const target = path.join(root, relative), baseline = preparation.files.find(row => row.path === relative), exists = fs.existsSync(target);
  if (baseline ? !exists || sha(fs.readFileSync(target)) !== baseline.sha256 : exists) throw Error('Main target changed');
  before.push({ path: relative, data: exists ? fs.readFileSync(target).toString('base64') : null }); source.push({ path: relative, sha256: hash, data: bytes.toString('base64') });
}
for (const row of preparation.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
fs.writeFileSync(path.join(__dirname, 'main-before-integration.json.gz'), zlib.gzipSync(JSON.stringify(before)), { flag: 'wx' });
for (const row of source) { const target = path.join(root, row.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(row.data, 'base64'), { flag: before.find(entry => entry.path === row.path).data === null ? 'wx' : 'w' }); if (sha(fs.readFileSync(target)) !== row.sha256) throw Error('Main readback mismatch'); }
const report = { at: new Date().toISOString(), baseline: preparation.head, source: source.map(({ data, ...row }) => row), applicationSchema: 32,
  completeExportBusinessCommands: true, actualPerBookMemoryPreflight: true, renderCleanupWorkers: false, publishedArtifactDownloadRoute: false, workspaceSelectionDraftUi: false, formalMigrated: false, pushed: false, deployed: false };
fs.writeFileSync(path.join(__dirname, 'integration-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ integrated: source.length, applicationSchema: 32, wholeGoal: 'active' }));
