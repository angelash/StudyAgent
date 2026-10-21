const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const apiPort = process.env.E2E_API_PORT || '4107';
const webPort = process.env.E2E_WEB_PORT || '3107';
const adminPrincipal = 'browser-admin';
const adminCredential = 'Browser-admin-only-20261021';
const dataDir = process.env.E2E_DATA_DIR || path.join(root, 'data', 'qa', `browser-product-${Date.now()}-${process.pid}`);
const environment = {
  ...process.env,
  CI: process.env.CI || '',
  NEXT_TELEMETRY_DISABLED: '1',
  OPENAI_API_KEY: '',
  CODEX_MODEL: '',
  NEXT_PUBLIC_API_BASE_URL: `http://localhost:${apiPort}`,
  E2E_API_PORT: apiPort,
  E2E_WEB_PORT: webPort,
  E2E_DATA_DIR: dataDir,
  STUDY_DATA_DIR: dataDir,
  E2E_ADMIN_PRINCIPAL: adminPrincipal,
  E2E_ADMIN_PASSWORD: adminCredential,
  STUDY_ADMIN_PASSWORD: adminCredential,
};
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const playwrightCli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');

function run(command, args, useShell = false) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: 'inherit', shell: useShell });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, 'run', 'build']);
else run(npm, ['run', 'build'], process.platform === 'win32');
run(process.execPath, [
  path.join(root, 'apps/api/dist/apps/api/src/cli.js'),
  'create-admin',
  adminPrincipal,
]);
run(process.execPath, [playwrightCli, 'test']);
