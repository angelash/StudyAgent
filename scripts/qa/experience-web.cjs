/* Isolated production Web copy for QA. Does not touch the daemon's .next or configuration. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const target = path.join(root, 'data/qa/experience-web');
const next = path.join(root, 'node_modules/next/dist/bin/next');
const command = process.argv[2] ?? 'build';
const apiPort = Number(process.env.E2E_API_PORT || '4107');
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('Invalid isolated API port');
if (!['build', 'start'].includes(command)) throw new Error('Use build or start');
if (command === 'build') {
  const source = path.join(root, 'apps/web');
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, { recursive: true, filter: file => !path.relative(source, file).split(path.sep).some(part => ['.next', 'node_modules'].includes(part)) && !file.endsWith('.tsbuildinfo') });
  const config = JSON.parse(fs.readFileSync(path.join(source, 'tsconfig.json'), 'utf8'));
  config.extends = path.join(root, 'tsconfig.base.json').replaceAll('\\', '/');
  fs.writeFileSync(path.join(target, 'tsconfig.json'), JSON.stringify(config, null, 2) + '\n');
}
const result = spawnSync(process.execPath, [next, command, target, ...(command === 'build' ? ['--webpack'] : ['--hostname', '127.0.0.1', '--port', process.env.E2E_WEB_PORT || '3107'])],
  { cwd: root, env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'http://localhost:' + apiPort, NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
