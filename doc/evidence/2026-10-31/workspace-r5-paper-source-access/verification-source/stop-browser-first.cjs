const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-runtime-fourth.private.json'), 'utf8'));
const web = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-web-second.json'), 'utf8'));
function processes(ids) { return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter "' + ids.map(id => 'ProcessId = ' + id).join(' OR ') + '" | Select-Object ProcessId,ParentProcessId,CommandLine) -Compress'], { encoding: 'utf8', windowsHide: true })); }
(async () => {
  const rows = processes([94276, web.wrapperPid, web.childPid]), server = rows.find(row => row.ProcessId === 94276), wrapper = rows.find(row => row.ProcessId === web.wrapperPid), child = rows.find(row => row.ProcessId === web.childPid);
  if (!server?.CommandLine.includes('browser-api-fourth.cjs') || !wrapper?.CommandLine.includes('browser-web-second.cjs') || child?.ParentProcessId !== web.wrapperPid || !child?.CommandLine.includes('p173\\scripts\\run-web.cjs')) throw Error('Exact own browser fixture process identities required');
  const response = await fetch('http://127.0.0.1:' + config.port + '/__qa/control', { method: 'POST', headers: { 'content-type': 'application/json', 'x-study-qa': config.nonce }, body: JSON.stringify({ action: 'shutdown' }), signal: AbortSignal.timeout(5000) });
  const result = await response.json(); if (response.status !== 200 || result.nonce !== config.nonce || !result.stopping) throw Error('Exact QA shutdown response required');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Stop-Process -Id ' + web.childPid + '; Stop-Process -Id ' + web.wrapperPid], { windowsHide: true });
  const start = Date.now(); while (processes([94276, web.wrapperPid, web.childPid]).length && Date.now() - start < 10000) await new Promise(resolve => setTimeout(resolve, 100));
  const remaining = processes([94276, web.wrapperPid, web.childPid, 90428, 86172]);
  const report = { at: new Date().toISOString(), exactFixtureNonceVerified: true, apiPid: 94276, wrapperPid: web.wrapperPid, childPid: web.childPid, previousWebPidsAlsoAbsent: !remaining.some(row => [90428, 86172].includes(row.ProcessId)), stopped: remaining.length === 0, otherServicesTouched: false };
  fs.writeFileSync(path.join(__dirname, 'browser-stop-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report)); if (!report.stopped) process.exitCode = 1;
})().catch(() => { console.error('Exact browser shutdown failed; no broader process termination attempted.'); process.exitCode = 1; });
