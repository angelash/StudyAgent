const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p172'), batch = process.argv[2], mode = process.argv[3] ?? 'types';
if (!/^[a-z0-9-]+$/.test(batch ?? '')) throw Error('New batch required');
const temporary = path.join(candidate, 'data/qa/temporary'); fs.mkdirSync(temporary, { recursive: true });
const env = { ...process.env, TEMP: temporary, TMP: temporary, XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '' }, sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const changed = preparation.files.filter(row => /^(?:apps\/api\/src|apps\/web|packages\/contracts\/src|scripts\/operations)\//.test(row.path) && !/\/(?:\.next|dist)\//.test(row.path) && fs.existsSync(path.join(candidate, row.path)) && sha(fs.readFileSync(path.join(candidate, row.path))) !== row.sha256).map(row => row.path);
const owned = ['paper-library-authorization.ts', 'paper-selection.service.ts', 'paper-selection.controller.ts', 'paper-selection-business.integration.test.ts']
  .map(name => 'apps/api/src/modules/library/' + name);
const source = [...new Set([...changed, ...owned])].filter(file => fs.existsSync(path.join(candidate, file))).map(file => {
  const bytes = fs.readFileSync(path.join(candidate, file)); return { path: file, sha256: sha(bytes), data: bytes.toString('base64') };
});
fs.writeFileSync(path.join(__dirname, batch + '-source.json.gz'), zlib.gzipSync(JSON.stringify(source)), { flag: 'wx' });
const suites = process.argv.slice(4);
const steps = mode === 'test' ? [['unit', 'node_modules/vitest/vitest.mjs', ['run', ...suites, '--reporter=json', '--outputFile=' + path.join(__dirname, batch + '-vitest.json')], path.join(candidate, 'apps/api')]] :
  mode === 'build' ? [['build', 'node_modules/typescript/bin/tsc', ['-p', 'apps/api/tsconfig.build.json'], candidate]] :
  [['contracts', 'node_modules/typescript/bin/tsc', ['-p', 'packages/contracts/tsconfig.json'], candidate], ['config', 'node_modules/typescript/bin/tsc', ['-p', 'packages/config/tsconfig.json'], candidate],
    ['api', 'node_modules/typescript/bin/tsc', ['-p', 'apps/api/tsconfig.json', '--noEmit'], candidate]];
const results = [];
for (const [name, script, args, cwd] of steps) {
  const log = fs.openSync(path.join(__dirname, batch + '-' + name + '.log'), 'wx');
  const result = spawnSync(process.execPath, [path.join(candidate, script), ...args], { cwd, env, windowsHide: true, stdio: ['ignore', log, log], timeout: 600000 }); fs.closeSync(log);
  results.push({ name, exit: result.status, error: result.error?.message ?? null });
}
const sourceUnchanged = source.every(row => sha(fs.readFileSync(path.join(candidate, row.path))) === row.sha256);
fs.writeFileSync(path.join(__dirname, batch + '.json'), JSON.stringify({ at: new Date().toISOString(), results, sourceUnchanged }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ batch, results, sourceUnchanged })); if (!sourceUnchanged || results.some(row => row.exit !== 0)) process.exitCode = 1;
