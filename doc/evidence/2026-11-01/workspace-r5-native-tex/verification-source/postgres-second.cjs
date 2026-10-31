const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process'), { Pool } = require('pg');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'))), url = new URL(config.connectionString);
if (url.hostname !== '127.0.0.1' || url.port !== '15451' || url.pathname !== '/study_paper_tex') throw Error('Exact generated cluster required');
(async () => {
  url.pathname = '/postgres'; const pool = new Pool({ connectionString: url.toString(), max: 1 });
  try { await pool.query('CREATE DATABASE study_paper_tex_second'); } finally { await pool.end(); }
  url.pathname = '/study_paper_tex_second'; const root = path.resolve(__dirname, '../../..'), log = fs.openSync(path.join(__dirname, 'postgres-second-driver.log'), 'wx');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'check.cjs'), 'postgres-second', 'test', 'src/modules/library/paper-export-tex.integration.test.ts'], {
    cwd: root, env: { ...process.env, STUDY_TEST_PAPER_TEX_POSTGRES_URL: url.toString(), STUDY_TEST_PAPER_TEX_WORKSPACE: path.join(root, 'data/qa/w180pg2') },
    windowsHide: true, stdio: ['ignore', log, log], timeout: 600000,
  }); fs.closeSync(log); console.log(JSON.stringify({ exit: result.status, error: result.error?.message ?? null, originalDatabaseKept: true }));
  if (result.status !== 0) process.exitCode = 1;
})().catch(() => { console.error('Second owned PostgreSQL batch failed; first database and private logs retained'); process.exitCode = 1; });
