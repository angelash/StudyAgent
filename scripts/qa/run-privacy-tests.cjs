const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');
const directory = resolve('doc/evidence/2026-10-20'); mkdirSync(directory, { recursive: true });
const child = spawn(process.execPath, ['--env-file=../../.env', '../../node_modules/vitest/vitest.mjs', 'run',
  'src/modules/privacy/privacy.integration.test.ts', 'src/modules/privacy/privacy.durability.integration.test.ts'], {
  cwd: resolve('apps/api'), windowsHide: true, stdio: 'inherit', env: { ...process.env, STUDY_PRIVACY_EVIDENCE: resolve(directory, 'privacy-runtime.json') },
});
child.on('error', () => { console.error('Unable to start privacy tests'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
