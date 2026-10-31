const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'), 'utf8')), [batch, ...suites] = process.argv.slice(2);
if (!batch || !suites.length) throw Error('Batch and actual suites required');
const result = spawnSync(process.execPath, [path.join(__dirname, 'check.cjs'), batch, 'test', ...suites], { windowsHide: true,
  env: { ...process.env, STUDY_TEST_PAPER_LIBRARY_POSTGRES_URL: config.connectionString, STUDY_TEST_PAPER_LIBRARY_PG_BIN: config.bin }, stdio: 'inherit', timeout: 420000 });
process.exitCode = result.status ?? 1;
