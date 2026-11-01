const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto'), { spawnSync } = require('node:child_process');
const { Pool } = require(path.resolve(__dirname, '../../../node_modules/pg'));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'teaching33-postgres-runtime.private.json'))), label = process.argv[2], file = process.argv[3];
async function main() {
  if (!/^[a-z0-9-]+$/.test(label || '') || !['src/infrastructure/textbook-teaching-native.integration.test.ts', 'src/infrastructure/textbook-teaching-adoption-native.integration.test.ts', 'src/infrastructure/textbook-teaching-early33-readers.integration.test.ts', 'src/infrastructure/textbook-teaching-course-history-native.integration.test.ts', 'src/modules/diagnostics/textbook-teaching.integration.test.ts', 'src/modules/learning/textbook-teaching-course.integration.test.ts', 'src/modules/learning/textbook-teaching-course-upgrade.integration.test.ts'].includes(file)) throw Error('Exact teaching33 test required');
  if (Number(fs.readFileSync(path.join(config.data, 'postmaster.pid'), 'utf8').split(/\r?\n/)[3]) !== 15455) throw Error('Owned live teaching33 cluster required');
  const url = new URL(config.connectionString);
  if (file.includes('/diagnostics/') || file.includes('/learning/')) {
    const database = 'study_teaching_package33_http_' + randomUUID().replaceAll('-', ''), pool = new Pool({ connectionString: config.connectionString, max: 1 });
    try { await pool.query('CREATE DATABASE "' + database + '"'); } finally { await pool.end(); } url.pathname = '/' + database;
  }
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run-package-check.cjs'), label, 'model', file], {
    cwd: path.resolve(__dirname, '../../..'), env: { ...process.env, STUDY_TEST_TEACHING_POSTGRES_URL: url.toString(), STUDY_TEST_TEACHING_PG_BIN: config.bin }, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
  });
  console.log(result.stdout); if (result.stderr) console.error(result.stderr); process.exitCode = result.status ?? 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
