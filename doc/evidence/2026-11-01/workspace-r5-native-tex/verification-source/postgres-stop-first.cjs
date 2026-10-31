const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres-runtime.private.json'))), expected = path.join(__dirname, 'postgres/cluster');
if (path.resolve(config.data) !== path.resolve(expected) || config.port !== 15451 || Number(fs.readFileSync(path.join(expected, 'postmaster.pid'), 'utf8').split(/\r?\n/)[3]) !== 15451) throw Error('Exact owned cluster identity required');
const stop = spawnSync(path.join(config.bin, 'pg_ctl.exe'), ['-D', config.data, '-m', 'fast', '-w', '-t', '30', 'stop'], { windowsHide: true, encoding: 'utf8', timeout: 45000 });
const status = spawnSync(path.join(config.bin, 'pg_ctl.exe'), ['-D', config.data, 'status'], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
const result = { at: new Date().toISOString(), ownedPort: 15451, stop: stop.status, status: status.status, stopped: stop.status === 0 && status.status === 3, firstAndSecondNativeDatabasesPreserved: true };
fs.writeFileSync(path.join(__dirname, 'postgres-stop-first.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(result)); if (!result.stopped) process.exitCode = 1;
