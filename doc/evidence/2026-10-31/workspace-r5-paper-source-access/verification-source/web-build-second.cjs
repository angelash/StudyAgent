const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p173'), dist = '.next-access173-second', sha = value => crypto.createHash('sha256').update(value).digest('hex');
if (fs.existsSync(path.join(candidate, '.env')) || fs.existsSync(path.join(candidate, 'apps/web', dist))) throw Error('Clean isolated production target required');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const authored = ['apps/web/lib/paper-source-read.ts', 'apps/web/app/library/studio.tsx', 'apps/web/next.config.ts', ...preparation.files.filter(row => row.path.startsWith('packages/ui/')).map(row => row.path)];
const frozen = [...new Set(authored)].map(file => { const bytes = fs.readFileSync(path.join(candidate, file)); return { path: file, sha256: sha(bytes), data: bytes.toString('base64') }; });
const profiles = ['apps/web/next-env.d.ts', 'apps/web/tsconfig.json'].map(file => ({ path: file, before: fs.readFileSync(path.join(candidate, file), 'utf8') }));
fs.writeFileSync(path.join(__dirname, 'web-build-second-source.json.gz'), zlib.gzipSync(JSON.stringify(frozen)), { flag: 'wx' });
const uiLink = path.join(candidate, 'node_modules/@study-agent/ui'), uiTarget = path.join(candidate, 'packages/ui');
if (fs.existsSync(uiLink)) { if (fs.realpathSync(uiLink) !== fs.realpathSync(uiTarget)) throw Error('Unexpected UI module target'); }
else fs.symlinkSync(uiTarget, uiLink, 'junction');
const env = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', STUDY_WEB_DIST_DIR: dist, API_PORT: '16173', NEXT_PUBLIC_API_BASE_URL: '', WEB_PORT: '13173', PORT: '13173', XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' };
const results = [];
for (const [name, file, args] of [['assets', 'scripts/build-web-assets.cjs', []], ['production', 'scripts/run-web.cjs', ['build', '--webpack']]]) {
  const log = fs.openSync(path.join(__dirname, 'web-build-second-' + name + '.log'), 'wx');
  const result = spawnSync(process.execPath, [path.join(candidate, file), ...args], { cwd: candidate, env, windowsHide: true, stdio: ['ignore', log, log], timeout: 1200000 }); fs.closeSync(log);
  results.push({ name, exit: result.status, error: result.error?.message ?? null }); if (result.status !== 0) break;
}
const authoredUnchanged = frozen.every(row => sha(fs.readFileSync(path.join(candidate, row.path))) === row.sha256);
const generatedProfiles = profiles.map(row => ({ ...row, after: fs.readFileSync(path.join(candidate, row.path), 'utf8') }));
for (const row of preparation.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
const target = path.join(candidate, 'apps/web', dist), successful = results.length === 2 && results.every(row => row.exit === 0);
const buildId = successful ? fs.readFileSync(path.join(target, 'BUILD_ID'), 'utf8').trim() : null;
const routes = successful ? JSON.parse(fs.readFileSync(path.join(target, 'routes-manifest.json'), 'utf8')).rewrites : null;
if (successful && !JSON.stringify(routes).includes('http://127.0.0.1:16173/api/')) throw Error('Wrong isolated API rewrite');
const report = { at: new Date().toISOString(), results, authoredUnchanged, generatedProfiles, generatedProfilePointersMustNotBeIntegrated: true,
  candidate, dist, buildId, apiPort: 16173, webPort: 13173, rewrites: routes, protectedFiles: preparation.protectedFiles.length, allProtectedUnchanged: true };
fs.writeFileSync(path.join(__dirname, 'web-build-second.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ results, authoredUnchanged, buildId, apiPort: 16173, webPort: 13173 }));
if (!authoredUnchanged || !successful) process.exitCode = 1;
