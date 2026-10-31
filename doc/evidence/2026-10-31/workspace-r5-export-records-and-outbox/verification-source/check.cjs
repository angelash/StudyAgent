const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p170'), batch = process.argv[2];
if (!/^[a-z0-9-]+$/.test(batch ?? '')) throw Error('Batch required');
const files = ['packages/contracts/src/paper-export.ts', 'packages/contracts/src/index.ts', 'packages/contracts/src/privacy.ts', 'apps/api/src/infrastructure/task-repository.ts',
  ...fs.readdirSync(path.join(candidate, 'apps/api/src/modules/library')).filter(name => name.startsWith('paper-export-')).map(name => 'apps/api/src/modules/library/' + name),
  'scripts/operations/privacy-ledger.cjs'].filter(file => fs.existsSync(path.join(candidate, file)));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
fs.writeFileSync(path.join(__dirname, batch + '-source.json.gz'), zlib.gzipSync(JSON.stringify(files.map(file => { const bytes = fs.readFileSync(path.join(candidate, file)); return { path: file, sha256: sha(bytes), data: bytes.toString('base64') }; }))), { flag: 'wx' });
const results = [];
const steps = process.argv[3] === 'test' ? [['unit', 'node_modules/vitest/vitest.mjs', 'run', 'src/modules/library/paper-export-record.test.ts', 'src/modules/library/paper-export-native.test.ts', 'src/modules/library/paper-selection-record.test.ts', 'src/modules/library/paper-selection-source.test.ts', 'src/infrastructure/task-repository.test.ts', '--reporter=json', '--outputFile=' + path.join(__dirname, batch + '-vitest.json')]] :
  [['contracts', 'node_modules/typescript/bin/tsc', '-p', 'packages/contracts/tsconfig.json'], ['config', 'node_modules/typescript/bin/tsc', '-p', 'packages/config/tsconfig.json'], ['api', 'node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.json', '--noEmit']];
for (const [name, tool, ...args] of steps) {
  const log = fs.openSync(path.join(__dirname, batch + '-' + name + '.log'), 'wx');
  const actualTool = path.join(candidate, tool), result = spawnSync(process.execPath, [actualTool, ...args], { cwd: process.argv[3] === 'test' ? path.join(candidate, 'apps/api') : candidate, windowsHide: true, stdio: ['ignore', log, log], timeout: 240000 });
  fs.closeSync(log); results.push({ name, exit: result.status, error: result.error?.message ?? null });
}
fs.writeFileSync(path.join(__dirname, batch + '.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ batch, results })); if (results.some(row => row.exit !== 0)) process.exitCode = 1;
