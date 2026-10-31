const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json')));
const url = new URL(config.connectionString);
if (url.hostname !== '127.0.0.1' || url.port !== '15451' || url.pathname !== '/study_paper_tex') throw Error('Exact generated PostgreSQL required');
const root = path.resolve(__dirname, '../../..'), log = fs.openSync(path.join(__dirname, 'postgres-first-driver.log'), 'wx');
const result = spawnSync(process.execPath, [path.join(__dirname, 'check.cjs'), 'postgres-first', 'test', 'src/modules/library/paper-export-tex.integration.test.ts'], {
  cwd: root, env: { ...process.env, STUDY_TEST_PAPER_TEX_POSTGRES_URL: config.connectionString, STUDY_TEST_PAPER_TEX_WORKSPACE: path.join(root, 'data/qa/w180pg1') },
  windowsHide: true, stdio: ['ignore', log, log], timeout: 600000,
}); fs.closeSync(log); console.log(JSON.stringify({ exit: result.status, error: result.error?.message ?? null }));
if (result.status !== 0) process.exitCode = 1;
