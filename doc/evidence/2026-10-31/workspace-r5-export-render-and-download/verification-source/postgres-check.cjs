const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'), 'utf8')), batch = process.argv[2];
if (!/^[a-z0-9-]+$/.test(batch ?? '')) throw Error('New batch required');
const result = spawnSync(process.execPath, [path.join(__dirname, 'check.cjs'), batch, 'test', 'src/modules/library/paper-export-render.integration.test.ts'],
  { windowsHide: true, env: { ...process.env, STUDY_TEST_PAPER_EXPORT_RENDER_POSTGRES_URL: config.connectionString, STUDY_TEST_PAPER_EXPORT_WORKSPACE: path.resolve(__dirname, '../w175b') }, stdio: 'inherit', timeout: 660000 });
process.exitCode = result.status ?? 1;
