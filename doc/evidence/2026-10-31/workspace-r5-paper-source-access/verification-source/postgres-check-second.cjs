const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'), 'utf8'));
const expected = path.join(__dirname, 'postgres/cluster'), binary = path.join(config.bin, 'pg_ctl.exe');
if (path.resolve(config.data) !== expected || config.port !== 15445) throw Error('Exact generated QA cluster required');
function command(label, args) {
  const log = fs.openSync(path.join(__dirname, label + '.log'), 'wx');
  const result = spawnSync(binary, args, { windowsHide: true, stdio: ['ignore', log, log], timeout: 55000 }); fs.closeSync(log); return result.status;
}
(async () => {
  const statusBefore = command('postgres-restart-second-before', ['-D', expected, 'status']);
  if (statusBefore !== 3) throw Error('Owned QA cluster must initially be stopped');
  const startExit = command('postgres-restart-second-start', ['-D', expected, '-l', path.join(__dirname, 'postgres/server-second.private.log'), '-o', '-p 15445 -h 127.0.0.1 -c max_connections=40 -c shared_buffers=32MB', '-w', '-t', '45', 'start']);
  if (startExit !== 0) throw Error('Owned PostgreSQL restart failed; exact log retained');
  let testExit = null, schema = null;
  try {
    const { Pool } = require('node:module').createRequire(path.join(__dirname, '../p173/package.json'))('pg');
    const pool = new Pool({ connectionString: config.connectionString, max: 1 });
    try { schema = 'study_qa_access_' + crypto.randomUUID().replaceAll('-', ''); await pool.query('CREATE SCHEMA "' + schema + '"'); } finally { await pool.end(); }
    const url = new URL(config.connectionString); url.searchParams.set('options', '-c search_path=' + schema);
    const result = spawnSync(process.execPath, [path.join(__dirname, 'check.cjs'), 'postgres-second', 'test', 'src/modules/library/paper-student-source-access.integration.test.ts'],
      { windowsHide: true, env: { ...process.env, STUDY_TEST_PAPER_ACCESS_POSTGRES_URL: url.toString() }, stdio: 'inherit', timeout: 660000 });
    testExit = result.status ?? 1;
  } finally {
    const stopExit = command('postgres-stop-second', ['-D', expected, '-m', 'fast', '-w', '-t', '45', 'stop']);
    const statusExit = command('postgres-stop-second-status', ['-D', expected, 'status']);
    const report = { at: new Date().toISOString(), exactQaClusterOnly: true, port: 15445, statusBefore, startExit, schema, generatedSchemaPreserved: true, testExit,
      stopExit, statusExit, stopped: stopExit === 0 && statusExit === 3, otherServicesTouched: false };
    fs.writeFileSync(path.join(__dirname, 'postgres-stop-second.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report));
    if (testExit !== 0 || !report.stopped) process.exitCode = 1;
  }
})().catch(() => { console.error('Owned PostgreSQL validation failed; original logs retained.'); process.exitCode = 1; });
