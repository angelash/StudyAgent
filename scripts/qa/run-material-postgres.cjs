// Runs only against an explicitly marked local QA cluster; credentials never enter argv or reports.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const restoreOnly = process.argv[3] === '--restore', importOnly=process.argv[3] === '--import',resumeOnly=process.argv[3]==='--resume';
if (process.argv[3] && !restoreOnly && !importOnly && !resumeOnly) throw new Error('Expected --restore, --import, --resume or no suite selector');
const configuration = path.resolve(process.argv[2] ?? path.join(root, 'data/qa/postgres/credentials.json'));
const config = JSON.parse(fs.readFileSync(configuration, 'utf8'));
if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.database !== 'study_agent_qa' || config.appUser !== 'study_agent_app' || config.adminUser !== 'study_qa_admin') throw new Error('Expected the dedicated local QA database');
const url = new URL(`postgresql://127.0.0.1:${config.port}/${config.database}`); url.username = config.appUser; url.password = config.appPassword;
const admin = new URL(`postgresql://127.0.0.1:${config.port}/postgres`); admin.username = config.adminUser; admin.password = config.adminPassword;
const pgBin = process.env.STUDY_TEST_PG_BIN ?? path.resolve(path.dirname(configuration), '../../tools/postgresql-17.11-5/pgsql/bin');
const report = path.resolve(root, process.env.STUDY_MATERIAL_PG_REPORT ?? 'doc/evidence/2026-10-24/long-pdf-upload-postgres.json');
const resumeSuite='src/infrastructure/postgres-restore-resume.integration.test.ts';
const suites = importOnly ? ['src/infrastructure/postgres-restore-import.integration.test.ts'] : resumeOnly ? [resumeSuite] : restoreOnly ? ['src/infrastructure/postgres-restore-import.integration.test.ts',resumeSuite,'src/infrastructure/restored-materials.integration.test.ts','src/infrastructure/postgres.integration.test.ts'] : ['src/modules/learning/studio-material-upload.integration.test.ts', 'src/infrastructure/studio-file-coordination.test.ts', 'src/modules/learning/studio-material-maintenance.integration.test.ts', 'src/modules/learning/studio-material-integrity.integration.test.ts', 'src/infrastructure/restored-materials.integration.test.ts','src/infrastructure/postgres-restore-import.integration.test.ts',resumeSuite];
const child = spawn(process.execPath, ['--env-file=../../.env', '../../node_modules/vitest/vitest.mjs', 'run', ...suites, '--reporter=default', '--reporter=json', '--outputFile=' + report], {
  cwd: path.join(root, 'apps/api'), windowsHide: true, stdio: 'inherit', env: { ...process.env, STUDY_TEST_POSTGRES_URL:url.toString(), STUDY_TEST_POSTGRES_RESTORE_IMPORT_URL:url.toString(), STUDY_TEST_POSTGRES_RESTORE_RESUME_URL:url.toString(), STUDY_POSTGRES_EVIDENCE:path.resolve(root,process.env.STUDY_POSTGRES_EVIDENCE ?? 'doc/evidence/2026-10-24/restored-materials-postgres-runtime.json'), STUDY_TEST_MATERIAL_UPLOAD_POSTGRES_URL: url.toString(), STUDY_TEST_FILE_COORDINATION_POSTGRES_URL: url.toString(), STUDY_TEST_MATERIAL_MAINTENANCE_POSTGRES_URL: url.toString(), STUDY_TEST_MATERIAL_INTEGRITY_POSTGRES_URL: url.toString(), STUDY_TEST_MATERIAL_RESTORE_POSTGRES_URL: url.toString(), STUDY_TEST_POSTGRES_ADMIN_URL: admin.toString(), STUDY_TEST_PG_BIN: pgBin },
});
child.on('error', () => { console.error('Unable to start material PostgreSQL tests'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
