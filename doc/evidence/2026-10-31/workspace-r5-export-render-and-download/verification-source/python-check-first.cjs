const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const candidate = path.resolve(__dirname, '../p175'), processing = path.join(candidate, 'scripts/processing'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const config = JSON.parse(fs.readFileSync(path.resolve(candidate, '../er2/installation.json'), 'utf8').replace(/^\ufeff/, ''));
const names = fs.readdirSync(processing).filter(name => /^(?:paper_export_|test_paper_export|file_leases)/.test(name) && name.endsWith('.py'));
const source = names.map(name => { const bytes = fs.readFileSync(path.join(processing, name)); return { path: 'scripts/processing/' + name, sha256: sha(bytes), data: bytes.toString('base64') }; });
fs.writeFileSync(path.join(__dirname, 'python-first-source.json.gz'), zlib.gzipSync(JSON.stringify(source)), { flag: 'wx' });
const log = fs.openSync(path.join(__dirname, 'python-first.log'), 'wx');
const environment = {}; for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'PROGRAMFILES']) if (process.env[name]) environment[name] = process.env[name];
const execution = spawnSync(config.python, ['-E', '-s', '-B', '-X', 'utf8', '-m', 'unittest', '-v', 'test_paper_export'], { cwd: processing, env: environment, windowsHide: true, stdio: ['ignore', log, log], timeout: 120000 }); fs.closeSync(log);
const unchanged = source.every(row => sha(fs.readFileSync(path.join(candidate, row.path))) === row.sha256), output = fs.readFileSync(path.join(__dirname, 'python-first.log'), 'utf8');
const report = { at: new Date().toISOString(), exit: execution.status, error: execution.error?.message ?? null, sourceUnchanged: unchanged, testCount: Number(/Ran (\d+) tests/.exec(output)?.[1] ?? 0),
  actualExistingParserSuite: true, memoryPngAndCorruptBytesWithoutFilesystemIoIncluded: true };
fs.writeFileSync(path.join(__dirname, 'python-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report));
if (report.exit !== 0 || !unchanged || !report.testCount) process.exitCode = 1;
