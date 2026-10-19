const fs = require('node:fs');
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');
const config = JSON.parse(fs.readFileSync('data/qa/postgres/credentials.json', 'utf8'));
if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.database !== 'study_agent_qa') throw new Error('Expected the dedicated local QA database');
const url = new URL(`postgresql://127.0.0.1:${config.port}/${config.database}`); url.username = config.appUser; url.password = config.appPassword;
const admin = new URL(`postgresql://127.0.0.1:${config.port}/postgres`); admin.username = config.adminUser; admin.password = config.adminPassword;
const child = spawn(process.execPath, ['--env-file=../../.env', '../../node_modules/vitest/vitest.mjs', 'run', 'src/infrastructure/postgres.integration.test.ts'], {
  cwd: resolve('apps/api'), windowsHide: true, stdio: 'inherit', env: { ...process.env, STUDY_TEST_POSTGRES_URL: url.toString(),
    STUDY_TEST_POSTGRES_ADMIN_URL: admin.toString(),
    STUDY_POSTGRES_EVIDENCE: resolve(process.env.STUDY_POSTGRES_EVIDENCE ?? 'doc/evidence/2026-10-20/postgres-media-runtime.json') },
});
child.on('error', () => { console.error('Unable to start PostgreSQL tests'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
