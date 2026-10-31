const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'))), url = new URL(config.connectionString);
if (url.hostname !== '127.0.0.1' || url.port !== '15453' || url.pathname !== '/study_textbook_sources') throw Error('Exact owned PostgreSQL required');
const root = path.resolve(__dirname, '../../..'), log = fs.openSync(path.join(__dirname, 'postgres-first-driver.log'), 'wx');
const result = spawnSync(process.execPath, [path.join(__dirname, 'check.cjs'), 'postgres-first', 'test', 'src/modules/diagnostics/textbook-lesson-source.integration.test.ts'], { cwd: root, env: { ...process.env, STUDY_TEST_TEXTBOOK_SOURCE_POSTGRES_URL: config.connectionString }, windowsHide: true, stdio: ['ignore', log, log], timeout: 300000 }); fs.closeSync(log);
console.log(JSON.stringify({ exit: result.status, error: result.error?.message ?? null })); if (result.status !== 0) process.exitCode = 1;
