const path = require('node:path'), { spawnSync } = require('node:child_process');
const args = process.argv.slice(2), mode = args[1];
const script = mode === 'postgres' ? 'run-teaching33-postgres.cjs' : 'run-package-check.cjs';
if (mode === 'postgres') args.splice(1, 1);
const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { cwd: path.resolve(__dirname, '../../..'), env: { ...process.env, STUDY_TEACHING_QA_CANDIDATE: 'p184' }, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
console.log(result.stdout); if (result.stderr) console.error(result.stderr); process.exitCode = result.status ?? 1;
