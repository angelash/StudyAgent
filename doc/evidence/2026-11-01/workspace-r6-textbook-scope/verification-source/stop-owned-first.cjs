const fs = require('node:fs'), path = require('node:path'), { execFileSync, spawnSync } = require('node:child_process');
const rows = [];
function processes(web) { return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter "ProcessId = ' + web.wrapperPid + ' OR ProcessId = ' + web.childPid + '" | Select-Object ProcessId,ParentProcessId,CommandLine) -Compress'], { encoding: 'utf8', windowsHide: true })); }
(async () => {
  for (const phase of ['first', 'second']) {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-runtime-' + phase + '.private.json')));
    const response = await fetch('http://127.0.0.1:' + config.apiPort + '/__qa/scope-control', { method: 'POST', headers: { 'content-type': 'application/json', 'x-study-qa': config.nonce }, body: JSON.stringify({ action: 'shutdown' }), signal: AbortSignal.timeout(10000) });
    const result = await response.json(); if (response.status !== 200 || result.nonce !== config.nonce || !result.stopping) throw Error('Exact owned API confirmation required');
    rows.push({ phase, apiPort: config.apiPort, pid: config.pid, nonceConfirmedGracefulShutdown: true });
    const web = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-web-' + phase + '.json'))), current = processes(web), wrapper = current.find(row => row.ProcessId === web.wrapperPid), child = current.find(row => row.ProcessId === web.childPid);
    if (!wrapper?.CommandLine.includes('browser-web-' + phase + '.cjs') || child?.ParentProcessId !== web.wrapperPid || !child?.CommandLine.replaceAll('\\', '/').includes('p181/scripts/run-web.cjs')) throw Error('Exact owned Web identities required');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Stop-Process -Id ' + web.childPid + '; Stop-Process -Id ' + web.wrapperPid], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const remaining = processes(web); if (remaining.length) throw Error('Owned Web did not stop'); rows.push({ phase, webPort: web.webPort, wrapperPid: web.wrapperPid, childPid: web.childPid, exactOwnedWebStopped: true });
  }
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'))), expected = path.join(__dirname, 'postgres/cluster');
  if (path.resolve(config.data) !== path.resolve(expected) || config.port !== 15452 || Number(fs.readFileSync(path.join(expected, 'postmaster.pid'), 'utf8').split(/\r?\n/)[3]) !== 15452) throw Error('Exact owned PostgreSQL required');
  const stopped = spawnSync(path.join(config.bin, 'pg_ctl.exe'), ['-D', config.data, '-m', 'fast', '-w', '-t', '30', 'stop'], { windowsHide: true, encoding: 'utf8', timeout: 45000 });
  const status = spawnSync(path.join(config.bin, 'pg_ctl.exe'), ['-D', config.data, 'status'], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
  if (stopped.status !== 0 || status.status !== 3) throw Error('Owned PostgreSQL did not stop'); rows.push({ postgresPort: 15452, stop: stopped.status, status: status.status });
  const result = { at: new Date().toISOString(), rows, noFormalOrOtherServicesTouched: true, allBrowserAndTestBatchesHadEndedBeforeStops: true, generatedDatabasesRetained: true };
  fs.writeFileSync(path.join(__dirname, 'owned-runtime-stop-first.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(result));
})().catch(error => { fs.writeFileSync(path.join(__dirname, 'owned-stop-first-failure.json'), JSON.stringify({ error: String(error), completed: rows }, null, 2), { flag: 'wx' }); console.error('Owned stop failed; partial receipt preserved and unknown processes not touched'); process.exitCode = 1; });
