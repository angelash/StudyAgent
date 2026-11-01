const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p184'), label = process.argv[2];
if (!/^[a-z0-9-]+$/.test(label || '')) throw Error('Exact new checkpoint label required');
const folder = path.join(__dirname, label); if (fs.existsSync(folder)) throw Error('Previous checkpoints must remain'); fs.mkdirSync(folder);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), initial = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz')))), baseline = new Map(initial.files.map(file => [file.path, file]));
const changed = [], inputs = [];
function inspect(file) {
  const bytes = fs.readFileSync(path.join(candidate, file)), digest = sha(bytes), original = baseline.get(file), mainFile = path.join(root, file), current = fs.existsSync(mainFile) ? sha(fs.readFileSync(mainFile)) : null;
  inputs.push({ path: file, sha256: digest }); if (current === digest) return;
  if (original && current !== original.sha256) throw Error('Main input changed independently: ' + file);
  const destination = path.join(folder, 'source', file); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== digest) throw Error('Checkpoint source readback failed'); changed.push({ path: file, sha256: digest, previousSha256: current, bytes: bytes.length });
}
function walk(relative) { for (const entry of fs.readdirSync(path.join(candidate, relative), { withFileTypes: true })) {
  const file = relative + '/' + entry.name; if (entry.isSymbolicLink()) throw Error('Source junction unexpected');
  if (entry.isDirectory()) walk(file); else if (entry.isFile()) inspect(file);
} }
for (const directory of ['apps/api/src', 'apps/web/app', 'apps/web/components', 'apps/web/lib', 'packages/contracts/src']) walk(directory);
for (const file of ['scripts/operations/database-reader-guard.cjs', 'scripts/operations/privacy-ledger.cjs']) inspect(file);
for (const file of initial.protectedFiles) if (sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw Error('Protected formal input changed');
const { DatabaseSync } = require('node:sqlite'), database = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true });
let formal; try { formal = { schema: database.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: database.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; } finally { database.close(); }
if (formal.schema !== 24 || formal.revision !== 187) throw Error('Unexpected formal database state');
const build = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui-production-fifth.json'))), browser = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui-product-browser-ninth/receipt.json'))), model = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui-workspace-model-fourth.json')));
if (build.status !== 0 || !browser.completed || browser.passed !== 12 || browser.failed !== 0 || browser.buildId !== build.buildId || model.numFailedTests !== 0 || model.numPassedTests !== 39) throw Error('Expected exact tested UI batch required');
const report = { at: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), candidate: 'data/qa/p184', changed, inputs,
  sourceReadback: true, protectedFiles: initial.protectedFiles.length, formal, applicationMainSchema: 32, candidateSchema: 33,
  productionBuild: { label: 'ui-production-fifth', buildId: build.buildId, inputFiles: build.inputFiles }, productBrowser: { label: 'ui-product-browser-ninth', passed: 12, failed: 0, pageErrors: browser.pageErrors.length },
  model: { label: 'ui-workspace-model-fourth', passed: 39, failed: 0 },
  originalFullApi: { candidate: 'p183', label: 'api-full-first', passed: 2741, failed: 1, pending: 131 },
  remaining: ['fifth server-only adoption collection', 'exact original course adoption and full-goal classroom/practice/retention', 'real-source teaching candidate review', 'final native/full-suite verification and narrow application integration', 'all original 72/WS/R5/R6/R7/R8 content and real-world requirements'],
  originalPlan72: { implemented: 11, in_progress: 50, planned: 11, verified: 0 }, fullGoal: 'active', pushed: false, deployed: false };
fs.writeFileSync(path.join(folder, 'receipt.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ changed: changed.length, inputs: inputs.length, protectedFiles: report.protectedFiles, formal, productBrowser: report.productBrowser, model: report.model, sourceReadback: true }));
