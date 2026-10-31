const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p175'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const prep = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz')))), read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name)));
for (const [batch, passed, skipped] of [['render-first', 4, 0], ['learner-first', 1, 4], ['postgres-first', 5, 0], ['regression-first', 226, 0]]) {
  const report = read(batch + '-vitest.json'); if (report.numPassedTests !== passed || report.numFailedTests || report.numPendingTests !== skipped || !read(batch + '.json').sourceUnchanged) throw Error('Actual complete scoped evidence required');
}
if (!read('postgres-stop-first.json').stopped || read('python-first.json').testCount !== 26 || read('python-first.json').exit !== 0 || !read('python-first.json').sourceUnchanged) throw Error('Actual tool/stop checks required');
const visual = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/v175a/result.json')));
if (visual.executions.some(item => item.exit !== 0) || visual.observations.length !== 4 || !visual.publishedSourceFilesUnchanged || !read('visual-inspection-first.json').allFourPagesOpened) throw Error('Actual independent visual review required');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== prep.head || execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Exact clean main baseline required');
const paths = ['apps/api/src/common/auth.guard.ts', 'apps/api/src/infrastructure/studio-file-paths.ts', ...['library.module.ts', 'paper-export-runtime.service.ts', 'paper-export.service.ts', 'paper-export-render-worker.service.ts', 'paper-export-artifact.controller.ts', 'paper-export-render.integration.test.ts'].map(name => 'apps/api/src/modules/library/' + name),
  ...['paper_export_content.py', 'paper_export_supervisor.py', 'test_paper_export.py'].map(name => 'scripts/processing/' + name)];
const actual = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'postgres-first-source.json.gz')))), before = [], source = [];
for (const file of paths) {
  const bytes = fs.readFileSync(path.join(candidate, file)), hash = sha(bytes), tested = actual.find(row => row.path === file), baseline = prep.files.find(row => row.path === file), target = path.join(root, file), exists = fs.existsSync(target);
  if (!tested || hash !== tested.sha256 || sha(Buffer.from(tested.data, 'base64')) !== hash) throw Error('Candidate differs from tested source: ' + file);
  if (baseline ? !exists || sha(fs.readFileSync(target)) !== baseline.sha256 : exists) throw Error('Main target changed');
  before.push({ path: file, data: exists ? fs.readFileSync(target).toString('base64') : null }); source.push({ path: file, sha256: hash, data: bytes.toString('base64') });
}
for (const row of prep.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected delivered runtime baseline changed');
fs.writeFileSync(path.join(__dirname, 'main-before-integration.json.gz'), zlib.gzipSync(JSON.stringify(before)), { flag: 'wx' });
for (const row of source) { const target = path.join(root, row.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(row.data, 'base64'), { flag: before.find(entry => entry.path === row.path).data === null ? 'wx' : 'w' }); if (sha(fs.readFileSync(target)) !== row.sha256) throw Error('Source readback failed'); }
const report = { at: new Date().toISOString(), baseline: prep.head, source: source.map(({ data, ...row }) => row), applicationSchema: 32,
  actualRenderWorker: true, wholeRendererJobContainment: true, publishedArtifactDownloadRoute: true, cleanupTasksRegistered: true, cleanupWorker: false,
  selectionExportCompleteDraftUi: false, formalMigrated: false, pushed: false, deployed: false };
fs.writeFileSync(path.join(__dirname, 'integration-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ integrated: source.length, wholeGoal: 'active' }));
