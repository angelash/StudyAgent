const fs = require('node:fs');
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');
const config = JSON.parse(fs.readFileSync('data/qa/postgres/credentials.json', 'utf8'));
if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.database !== 'study_agent_qa') throw new Error('Expected the dedicated local QA database');
const url = new URL(`postgresql://127.0.0.1:${config.port}/${config.database}`); url.username = config.appUser; url.password = config.appPassword;
const child = spawn(process.execPath, ['--env-file=../../.env', '../../node_modules/vitest/vitest.mjs', 'run', 'src/infrastructure/postgres.integration.test.ts'], {
  cwd: resolve('apps/api'), windowsHide: true, stdio: 'inherit', env: { ...process.env, STUDY_TEST_POSTGRES_URL: url.toString(),
    STUDY_POSTGRES_EVIDENCE: resolve('doc/evidence/2026-10-19/postgres-runtime.json') },
});
child.on('error', () => { console.error('Unable to start PostgreSQL tests'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
