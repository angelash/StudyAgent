const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p173'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name)));
for (const [batch, passed, skipped] of [['media-first', 9, 0], ['access-second', 13, 0], ['postgres-second', 14, 0], ['regression-first', 186, 0], ['learner-race-first', 1, 13]]) {
  const report = read(batch + '-vitest.json'); if (report.numPassedTests !== passed || report.numFailedTests || report.numPendingTests !== skipped || !read(batch + '.json').sourceUnchanged) throw Error('Exact complete scoped batch required');
}
for (const [name, passed] of [['browser-ui-third', 7], ['browser-ui-fourth', 3]]) { const result = read(name + '.json'); if (result.passed !== passed || result.failed || result.actualProductionBuild !== 'Tmm-pp82w_t9fbcDokZwJ') throw Error('Actual current production browser evidence required'); }
if (!read('browser-stop-first.json').stopped || !read('postgres-stop-second.json').stopped) throw Error('Own validation services must be stopped');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== preparation.head || execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Exact clean main baseline required');
const paths = ['apps/api/src/common/auth.guard.ts', ...['library.controller.ts', 'library.service.ts', 'paper-practice.service.ts', 'paper-student-source-access.ts', 'verified-library-media.ts', 'paper-student-source-access.integration.test.ts', 'verified-library-media.test.ts'].map(name => 'apps/api/src/modules/library/' + name), 'apps/web/app/library/studio.tsx', 'apps/web/lib/paper-source-read.ts'];
const webSource = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'web-build-second-source.json.gz'))));
const testedSource = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'postgres-second-source.json.gz'))));
const before = [], source = [];
for (const relative of paths) {
  const bytes = fs.readFileSync(path.join(candidate, relative)), hash = sha(bytes), exact = (relative.startsWith('apps/web/') ? webSource : testedSource).find(row => row.path === relative);
  if (!exact || hash !== exact.sha256 || sha(Buffer.from(exact.data, 'base64')) !== hash) throw Error('Candidate differs from actual tested source: ' + relative);
  const baseline = preparation.files.find(row => row.path === relative), target = path.join(root, relative), exists = fs.existsSync(target);
  if (baseline ? !exists || sha(fs.readFileSync(target)) !== baseline.sha256 : exists) throw Error('Main target changed');
  before.push({ path: relative, data: exists ? fs.readFileSync(target).toString('base64') : null }); source.push({ path: relative, sha256: hash, data: bytes.toString('base64') });
}
if (source.length !== 10) throw Error('Unexpected authored source scope');
for (const row of preparation.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
fs.writeFileSync(path.join(__dirname, 'main-before-integration.json.gz'), zlib.gzipSync(JSON.stringify(before)), { flag: 'wx' });
for (const row of source) { const target = path.join(root, row.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(row.data, 'base64'), { flag: before.find(entry => entry.path === row.path).data === null ? 'wx' : 'w' }); if (sha(fs.readFileSync(target)) !== row.sha256) throw Error('Main readback mismatch'); }
const report = { at: new Date().toISOString(), baseline: preparation.head, source: source.map(({ data, ...row }) => row), applicationSchema: 32,
  oldBodyReferenceMediaPdfPrintRestrictions: true, sameVerifiedHandleResponse: true, originalPreviewExplicitReadUi: true, qaGeneratedNextProfilesIntegrated: false,
  renderCleanupWorkers: false, workspaceSelectionExportDraftUi: false, formalMigrated: false, pushed: false, deployed: false };
fs.writeFileSync(path.join(__dirname, 'integration-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ integrated: source.length, applicationSchema: 32, wholeGoal: 'active' }));
