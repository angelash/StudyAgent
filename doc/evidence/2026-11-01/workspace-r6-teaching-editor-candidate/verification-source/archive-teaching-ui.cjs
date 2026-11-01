const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const root = path.resolve(__dirname, '../../..'), folder = path.join(root, 'doc/evidence/2026-11-01/workspace-r6-teaching-editor-candidate'), checkpoint = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui-checkpoint-first/receipt.json')));
if (fs.existsSync(folder)) throw Error('Exact new evidence directory required'); fs.mkdirSync(folder, { recursive: true });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), members = [];
for (const row of checkpoint.changed) { const bytes = fs.readFileSync(path.join(__dirname, 'ui-checkpoint-first/source', row.path)); if (sha(bytes) !== row.sha256) throw Error('Frozen source differs'); members.push({ ...row, base64: bytes.toString('base64') }); }
const archive = zlib.gzipSync(JSON.stringify({ protocol: 'study-agent-isolated-source-increment-v1', baselineHead: checkpoint.head, source: 'data/qa/p184', applicationIntegration: false, files: members }));
fs.writeFileSync(path.join(folder, 'candidate-source.json.gz'), archive, { flag: 'wx' });
const readback = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(folder, 'candidate-source.json.gz'))));
for (const row of readback.files) if (sha(Buffer.from(row.base64, 'base64')) !== row.sha256) throw Error('Archived source readback differs');
fs.writeFileSync(path.join(folder, 'source-inventory.json'), JSON.stringify({ ...checkpoint, changed: checkpoint.changed, inputs: checkpoint.inputs }, null, 2), { flag: 'wx' });
const sources = ['run-package-check.cjs', 'run-teaching-ui-check.cjs', 'run-teaching33-postgres.cjs', 'build-teaching-ui.cjs', 'verify-teaching-product-ui.cjs', 'freeze-teaching-ui.cjs', 'verify-teaching-editor-storage-first.cjs', 'archive-teaching-ui.cjs'];
fs.mkdirSync(path.join(folder, 'verification-source')); for (const file of sources) fs.copyFileSync(path.join(__dirname, file), path.join(folder, 'verification-source', file));
const browserBatches = [], modelBatches = [];
for (const number of ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth']) {
  const label = 'ui-product-browser-' + number, file = path.join(__dirname, label, 'receipt.json'), bytes = fs.readFileSync(file), value = JSON.parse(bytes);
  const row = { label, sha256: sha(bytes), buildId: value.buildId, passed: value.passed, failed: value.failed, completed: value.completed, error: value.error, checks: value.checks };
  browserBatches.push(row);
  fs.writeFileSync(path.join(folder, label + '.json'), JSON.stringify(row, null, 2), { flag: 'wx' });
}
for (const number of ['first', 'second', 'third', 'fourth']) {
  const label = 'ui-workspace-model-' + number, bytes = fs.readFileSync(path.join(__dirname, label + '.json')), value = JSON.parse(bytes);
  const row = { label, sha256: sha(bytes), passed: value.numPassedTests, failed: value.numFailedTests, pending: value.numPendingTests,
    failures: value.testResults.flatMap(suite => suite.assertionResults.filter(test => test.status === 'failed').map(test => ({ name: test.fullName, messages: test.failureMessages }))) };
  modelBatches.push(row); fs.writeFileSync(path.join(folder, label + '.json'), JSON.stringify(row, null, 2), { flag: 'wx' });
}
const additional = [];
for (const label of ['ui-http-detail-sqlite-fourth', 'ui-http-detail-postgres-third', 'ui-native-sqlite-lineage-first', 'ui-native-postgres-lineage-first', 'ui-paper-persistence-recheck-first']) {
  const bytes = fs.readFileSync(path.join(__dirname, label + '.json')), value = JSON.parse(bytes); additional.push({ label, sha256: sha(bytes), passed: value.numPassedTests, failed: value.numFailedTests, pending: value.numPendingTests });
}
for (const label of ['ui-type-workspace-second', 'ui-api-workspace-first', 'ui-production-first', 'ui-production-second', 'ui-production-third', 'ui-production-fourth', 'ui-production-fifth']) fs.copyFileSync(path.join(__dirname, label + '.json'), path.join(folder, label + '.json'));
const screenshots = [];
for (const name of ['workspace-390x844.png', 'workspace-768x900.png', 'workspace-1440x1000.png', 'workspace-1440x500.png']) {
  const bytes = fs.readFileSync(path.join(__dirname, 'ui-product-browser-ninth', name)); fs.writeFileSync(path.join(folder, name), bytes, { flag: 'wx' }); screenshots.push({ name, sha256: sha(bytes), visuallyInspected: true });
}
const originalBytes = fs.readFileSync(path.join(__dirname, 'api-full-first.json')), original = JSON.parse(originalBytes);
const receipt = { protocol: 'study-agent-teaching-editor-candidate-evidence-v1', at: new Date().toISOString(), baselineHead: checkpoint.head, candidate: 'data/qa/p184',
  sourceIncrement: { files: members.length, archive: 'candidate-source.json.gz', sha256: sha(archive), allMembersReadBack: true, copiedIntoMainApplication: false },
  latestProductBrowser: browserBatches.at(-1), latestModel: modelBatches.at(-1), earlierBrowserBatches: browserBatches.slice(0, -1), earlierModelBatches: modelBatches.slice(0, -1), additional,
  originalFullApi: { label: 'api-full-first', source: 'p183', sha256: sha(originalBytes), passed: original.numPassedTests, failed: original.numFailedTests, pending: original.numPendingTests,
    failures: original.testResults.flatMap(suite => suite.assertionResults.filter(test => test.status === 'failed').map(test => ({ name: test.fullName, messages: test.failureMessages }))) },
  screenshots, generatedEngineeringFixturesOnly: true, actualTextbookTeacherReview: false, fullTextbookCoverage: false, wholeSiteFinalValidation: false,
  limitations: ['Only the editor product journey is validated in this batch; independent course adoption/classroom/practice/retention remains unfinished.', 'The still-unreleased schema33 must include the fifth server-only adoption collection before main application integration.', 'Model/API/browser batches are independent and are not added together.', 'Physical devices, new machines, native Word/physical printing, teachers and actual learner 1/3/7/14-day evidence remain unverified.'],
  protectedFilesUnchanged: checkpoint.protectedFiles, formal: checkpoint.formal, mainApplicationSchema: 32, candidateSchema: 33, originalPlan72: checkpoint.originalPlan72, wholeGoal: 'active', localOnly: true, pushed: false, deployed: false };
fs.writeFileSync(path.join(folder, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ sourceFiles: members.length, browser: { passed: receipt.latestProductBrowser.passed, failed: receipt.latestProductBrowser.failed }, model: { passed: receipt.latestModel.passed, failed: receipt.latestModel.failed }, screenshots: screenshots.length, protectedFiles: checkpoint.protectedFiles }));
