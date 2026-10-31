const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p170'), temporary = path.join(candidate, 'data/qa/regression-temp');
fs.mkdirSync(temporary, { recursive: true }); const env = { ...process.env, TEMP: temporary, TMP: temporary };
const steps = [['build', 'node_modules/typescript/bin/tsc', ['-p', 'apps/api/tsconfig.build.json'], candidate],
  ['privacy', 'node_modules/vitest/vitest.mjs', ['run', 'src/modules/privacy/privacy.integration.test.ts', 'src/modules/privacy/privacy.durability.integration.test.ts', '--reporter=json', '--outputFile=' + path.join(__dirname, 'regression-first-vitest.json')], path.join(candidate, 'apps/api')]];
const results = [];
for (const [name, script, args, cwd] of steps) {
  const log = fs.openSync(path.join(__dirname, 'regression-first-' + name + '.log'), 'wx');
  const result = spawnSync(process.execPath, [path.join(candidate, script), ...args], { cwd, env, windowsHide: true, stdio: ['ignore', log, log], timeout: 240000 }); fs.closeSync(log);
  results.push({ name, exit: result.status, error: result.error?.message ?? null }); if (result.status !== 0) break;
}
fs.writeFileSync(path.join(__dirname, 'regression-first.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(results)); if (results.some(row => row.exit !== 0)) process.exitCode = 1;
