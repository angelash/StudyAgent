const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'), 'utf8')), expected = path.join(__dirname, 'postgres/cluster');
if (path.resolve(config.data) !== expected || config.port !== 15446) throw Error('Exact generated cluster required');
const binary = path.join(config.bin, 'pg_ctl.exe'), log = fs.openSync(path.join(__dirname, 'postgres-stop-first.log'), 'wx');
const result = spawnSync(binary, ['-D', expected, '-m', 'fast', '-w', '-t', '45', 'stop'], { windowsHide: true, stdio: ['ignore', log, log], timeout: 55000 }); fs.closeSync(log);
const status = spawnSync(binary, ['-D', expected, 'status'], { windowsHide: true, stdio: 'pipe', timeout: 10000 });
const report = { at: new Date().toISOString(), exactQaClusterOnly: true, port: 15446, stopExit: result.status, statusExit: status.status, stopped: result.status === 0 && status.status === 3, otherServicesTouched: false };
fs.writeFileSync(path.join(__dirname, 'postgres-stop-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report)); if (!report.stopped) process.exitCode = 1;
