const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const candidate = path.resolve(__dirname, '../p184'), label = process.argv[2];
if (!/^[a-z0-9-]+$/.test(label || '')) throw Error('Exact new build label required');
const folder = path.join(candidate, 'apps/web'), distDir = '.next-' + label, output = path.join(__dirname, label + '.json');
if (fs.existsSync(path.join(folder, distDir)) || fs.existsSync(output)) throw Error('Previous builds must remain');
if (fs.readdirSync(folder).some(name => /^\.env(?:\.|$)/.test(name))) throw Error('Isolated build must not load an unexpected environment file');
const inputs = [], sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function scan(relative) { for (const entry of fs.readdirSync(path.join(candidate, relative), { withFileTypes: true })) {
  const file = relative + '/' + entry.name; if (entry.isSymbolicLink()) throw Error('Source input link unexpected');
  if (entry.isDirectory()) scan(file); else if (entry.isFile()) inputs.push({ path: file, sha256: sha(fs.readFileSync(path.join(candidate, file))) });
} }
for (const directory of ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/web/public', 'packages/contracts/src', 'packages/config/src']) scan(directory);
for (const file of ['package.json', 'package-lock.json', 'tsconfig.base.json', 'apps/web/tsconfig.json', 'apps/web/next.config.ts', 'apps/web/package.json']) inputs.push({ path: file, sha256: sha(fs.readFileSync(path.join(candidate, file))) });
fs.writeFileSync(path.join(__dirname, label + '-inputs.json'), JSON.stringify({ candidate: 'data/qa/p184', inputs }), { flag: 'wx' });
const log = fs.openSync(path.join(__dirname, label + '.log'), 'wx'), result = spawnSync(process.execPath, ['../../node_modules/next/dist/bin/next', 'build', '--webpack'], {
  cwd: folder, windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, NODE_ENV: 'production', STUDY_WEB_DIST_DIR: distDir, API_PORT: '4284', NEXT_PUBLIC_API_BASE_URL: '',
    NEXT_TELEMETRY_DISABLED: '1', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' },
}); fs.closeSync(log);
const report = { at: new Date().toISOString(), status: result.status, error: result.error?.message ?? null, distDir, source: 'data/qa/p184',
  buildId: result.status === 0 ? fs.readFileSync(path.join(folder, distDir, 'BUILD_ID'), 'utf8').trim() : null, inputFiles: inputs.length, apiPort: 4284, webPort: 3284 };
fs.writeFileSync(output, JSON.stringify(report), { flag: 'wx' }); console.log(JSON.stringify(report));
if (result.status !== 0) console.log(fs.readFileSync(path.join(__dirname, label + '.log'), 'utf8').slice(-7000)); process.exitCode = result.status ?? 1;
