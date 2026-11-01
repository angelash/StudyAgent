const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const candidate = path.resolve(__dirname, process.env.STUDY_TEACHING_QA_CANDIDATE === 'p184' ? '../p184' : '../p183'), label = process.argv[2], mode = process.argv[3] || 'model';
if (!/^[a-z0-9-]+$/.test(label || '')) throw Error('Exact unique run label required');
const output = path.join(__dirname, label + '.json'), log = path.join(__dirname, label + '.log');
if (fs.existsSync(output) || fs.existsSync(log)) throw Error('First results must be preserved');
let command, cwd;
if (mode === 'contracts') { command = ['node_modules/tsup/dist/cli-default.js', 'src/index.ts', '--format', 'cjs', '--dts', '--clean']; cwd = path.join(candidate, 'packages/contracts'); }
else if (mode === 'type') { command = ['node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.json', '--noEmit', '--incremental', 'false']; cwd = candidate; }
else if (mode === 'webtype') { command = ['node_modules/typescript/bin/tsc', '-p', 'apps/web/tsconfig.json', '--noEmit', '--incremental', 'false']; cwd = candidate; }
else if (mode === 'build') { command = ['node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.build.json']; cwd = candidate; }
else { command = ['node_modules/vitest/vitest.mjs', 'run', ...(process.argv.slice(4).length ? process.argv.slice(4) : mode === 'all' ? [] : ['src/modules/diagnostics/textbook-teaching.test.ts']), '--reporter=json', '--outputFile=' + output]; cwd = path.join(candidate, 'apps/api'); }
const [cli, ...args] = command, result = spawnSync(process.execPath, [path.join(candidate, cli), ...args], { cwd, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
fs.writeFileSync(log, result.stdout + result.stderr, { flag: 'wx' });
if (mode !== 'model' && mode !== 'all') fs.writeFileSync(output, JSON.stringify({ mode, status: result.status, error: result.error?.message }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ mode, label, status: result.status, log }));
if (result.status !== 0) console.log((result.stdout + result.stderr).slice(-13000));
else if (fs.existsSync(output) && ['model', 'all'].includes(mode)) { const report = JSON.parse(fs.readFileSync(output, 'utf8')); console.log(JSON.stringify({ passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests })); }
process.exitCode = result.status ?? 1;
