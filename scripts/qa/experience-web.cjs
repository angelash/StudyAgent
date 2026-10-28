/* Isolated production Web copy for QA. Does not touch the daemon's .next or configuration. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const target = path.resolve(root, process.env.E2E_WEB_DIRECTORY || 'data/qa/experience-web');
if (!target.startsWith(path.join(root, 'data/qa') + path.sep)) throw new Error('QA Web directory must stay inside data/qa');
const next = path.join(root, 'node_modules/next/dist/bin/next');
const command = process.argv[2] ?? 'build';
const runtimeLock = path.join(target, '.runtime-lock.json');
const buildContext = path.join(target, '.build-context.json');
const apiPort = Number(process.env.E2E_API_PORT || '4107');
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('Invalid isolated API port');
if (!['build', 'start'].includes(command)) throw new Error('Use build or start');
if (command === 'start') {
  if (!fs.existsSync(buildContext)) throw new Error('QA Web build context missing; rebuild this isolated Web before starting');
  const context = JSON.parse(fs.readFileSync(buildContext, 'utf8'));
  const buildId = fs.readFileSync(path.join(target, '.next/BUILD_ID'), 'utf8').trim();
  if (context.apiPort !== apiPort || context.buildId !== buildId) throw new Error('QA Web build API port or BUILD_ID mismatch; rebuild with E2E_API_PORT=' + apiPort);
}
// Never replace a .next directory while browser acceptance is serving it.
if (fs.existsSync(runtimeLock)) {
  if (fs.lstatSync(runtimeLock).isSymbolicLink()) throw new Error('Linked QA runtime lock refused');
  const lock = JSON.parse(fs.readFileSync(runtimeLock, 'utf8'));
  if (!Number.isSafeInteger(lock.pid) || lock.pid < 1) throw new Error('Invalid QA runtime lock');
  let alive = false;
  try { process.kill(lock.pid, 0); alive = true; } catch (error) { if (error.code !== 'ESRCH') throw error; }
  if (alive) throw new Error('Stop the isolated QA Web runtime before rebuilding or starting another copy');
  fs.unlinkSync(runtimeLock);
}
if (command === 'build') {
  const prepared = spawnSync(process.execPath, [path.join(root, 'scripts/build-web-assets.cjs')], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (prepared.error) throw prepared.error;
  if (prepared.status !== 0) throw new Error('Required local math editor fonts could not be prepared');
  const source = path.join(root, 'apps/web');
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, { recursive: true, filter: file => !path.relative(source, file).split(path.sep).some(part => ['.next', 'node_modules'].includes(part)) && !file.endsWith('.tsbuildinfo') });
  const config = JSON.parse(fs.readFileSync(path.join(source, 'tsconfig.json'), 'utf8'));
  config.extends = path.join(root, 'tsconfig.base.json').replaceAll('\\', '/');
  fs.writeFileSync(path.join(target, 'tsconfig.json'), JSON.stringify(config, null, 2) + '\n');
}
if (command === 'start') fs.writeFileSync(runtimeLock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + '\n', { flag: 'wx' });
let result;
try {
  result = spawnSync(process.execPath, [next, command, target, ...(command === 'build' ? ['--webpack'] : ['--hostname', '127.0.0.1', '--port', process.env.E2E_WEB_PORT || '3107'])],
    { cwd: root, env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'http://localhost:' + apiPort, NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'inherit' });
} finally {
  if (command === 'start' && fs.existsSync(runtimeLock) && JSON.parse(fs.readFileSync(runtimeLock, 'utf8')).pid === process.pid) fs.unlinkSync(runtimeLock);
}
if (result.error) throw result.error;
if (command === 'build' && result.status === 0) {
  fs.writeFileSync(buildContext, JSON.stringify({ version: 1, apiPort, buildId: fs.readFileSync(path.join(target, '.next/BUILD_ID'), 'utf8').trim() }) + '\n');
}
process.exit(result.status ?? 1);
