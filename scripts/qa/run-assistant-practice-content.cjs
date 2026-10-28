// Pure source/content regression. No HTTP service, database, provider or dependency installation.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), attempt = process.argv[2];
if (!attempt || !/^[a-z0-9-]+$/.test(attempt)) throw Error('Pass a new, unique attempt name');
const folder = path.join(root, 'data/qa/assistant-practice-content', attempt);
if (fs.existsSync(folder)) throw Error('Original attempt already exists'); fs.mkdirSync(folder, { recursive: true });
const inputs = ['packages/contracts/src/index.ts', 'packages/contracts/src/assistant-practice-content.ts', 'packages/contracts/src/diagnostics.ts',
  'packages/contracts/src/assistant-practice.ts', 'packages/contracts/src/assistant-artifact.ts', 'packages/contracts/src/assistant-whiteboard.ts',
  'apps/api/src/modules/learning/assistant-practice-source.ts', 'apps/api/src/modules/learning/assistant-practice-content.ts',
  'apps/api/src/modules/learning/assistant-practice-content.test.ts', 'apps/api/src/modules/learning/assistant-whiteboard-source.ts',
  'apps/api/src/modules/learning/assistant-whiteboard-content.ts', 'apps/api/src/modules/learning/assistant-whiteboard-content.test.ts',
  'apps/api/src/modules/learning/topic-whiteboard-digest.ts', 'apps/api/vitest.config.ts', 'scripts/qa/run-assistant-practice-content.cjs'];
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const manifest = {};
for (const relative of inputs) {
  const source = path.join(root, relative), target = path.join(folder, 'source', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  manifest[relative] = { sha256: hash(source), bytes: fs.statSync(source).size };
}
const compiled = {};
for (const relative of ['apps/api/dist/apps/api/src/modules/learning/assistant-practice-source.js',
  'apps/api/dist/apps/api/src/modules/learning/assistant-practice-content.js', 'packages/contracts/dist/index.js'])
  compiled[relative] = { sha256: hash(path.join(root, relative)), bytes: fs.statSync(path.join(root, relative)).size };
fs.writeFileSync(path.join(folder, 'inputs-before.json'), JSON.stringify({ at: new Date().toISOString(), manifest, compiled }, null, 2) + '\n', { flag: 'wx' });
const run = spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/modules/learning/assistant-practice-content.test.ts', 'src/modules/learning/assistant-whiteboard-content.test.ts',
  '--reporter=default', '--reporter=json', '--outputFile=' + path.join(folder, 'vitest.json')], {
  cwd: path.join(root, 'apps/api'), encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024,
  env: { ...process.env, XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', TASK_WORKER_ENABLED: 'false', STORAGE_SEED_DEMO_DATA: 'false' },
});
fs.writeFileSync(path.join(folder, 'stdout.log'), run.stdout ?? '', { flag: 'wx' });
fs.writeFileSync(path.join(folder, 'stderr.log'), run.stderr ?? '', { flag: 'wx' });
const changed = inputs.filter(relative => hash(path.join(root, relative)) !== manifest[relative].sha256);
const changedCompiled = Object.keys(compiled).filter(relative => hash(path.join(root, relative)) !== compiled[relative].sha256);
const report = fs.existsSync(path.join(folder, 'vitest.json')) ? JSON.parse(fs.readFileSync(path.join(folder, 'vitest.json'), 'utf8')) : null;
const receipt = { at: new Date().toISOString(), passed: run.status === 0 && report?.success === true && !changed.length && !changedCompiled.length,
  exitCode: run.status, error: run.error?.message ?? null, inputs: inputs.length, compiled: Object.keys(compiled).length, changed, changedCompiled,
  tests: report ? { total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests } : null,
  limits: ['Pure protocol plus existing source-content compatibility only; no database, endpoint, persistence, actual model or learner evidence.',
    'Prepared content is neither current authorization nor formally reviewed measurement; complete D2-D4 and product remain in progress.'] };
fs.writeFileSync(path.join(folder, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(receipt)); if (!receipt.passed) process.exitCode = 1;
