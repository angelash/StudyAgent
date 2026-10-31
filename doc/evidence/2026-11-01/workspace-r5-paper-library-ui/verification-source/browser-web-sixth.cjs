const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { spawn } = require('node:child_process');
const build = JSON.parse(fs.readFileSync(path.join(__dirname, 'web-build-sixth.json'), 'utf8')), candidate = build.candidate;
if (build.results.some(row => row.exit !== 0) || !build.authoredUnchanged || fs.readFileSync(path.join(candidate, 'apps/web', build.dist, 'BUILD_ID'), 'utf8').trim() !== build.buildId) throw Error('Actual completed isolated build required');
const log = fs.openSync(path.join(__dirname, 'browser-web-sixth.log'), 'wx');
const child = spawn(process.execPath, [path.join(candidate, 'scripts/run-web.cjs'), 'start', '--hostname', '127.0.0.1', '--port', String(build.webPort)], {
  cwd: candidate, windowsHide: true, env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', STUDY_WEB_DIST_DIR: build.dist,
    API_PORT: String(build.apiPort), PORT: String(build.webPort), WEB_PORT: String(build.webPort), NEXT_PUBLIC_API_BASE_URL: '', XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' },
  stdio: ['ignore', log, log],
});
let ended = false;
child.once('exit', code => { ended = true; fs.closeSync(log); process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill('SIGTERM'));
(async () => {
  const started = Date.now(); let ready = false, contentSha256 = null;
  while (!ended && Date.now() - started < 60000) {
    try { const response = await fetch('http://127.0.0.1:' + build.webPort, { signal: AbortSignal.timeout(2000) }), text = await response.text();
      if (response.status === 200 && text.includes('/_next/static/')) { ready = true; contentSha256 = crypto.createHash('sha256').update(text).digest('hex'); break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const report = { at: new Date().toISOString(), ready, wrapperPid: process.pid, childPid: child.pid, webPort: build.webPort, apiPort: build.apiPort,
    buildId: build.buildId, dist: build.dist, contentSha256, isolatedProductionServer: true };
  fs.writeFileSync(path.join(__dirname, 'browser-web-sixth.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report));
  if (!ready) { child.kill('SIGTERM'); process.exitCode = 1; }
})();
