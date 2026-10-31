const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { spawnSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../../..'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'integration-first.json'))).source;
const checks = [];
for (const [name, config] of [['contracts', 'packages/contracts/tsconfig.json'], ['api', 'apps/api/tsconfig.json'], ['web', 'apps/web/tsconfig.json']]) {
  const log = fs.openSync(path.join(__dirname, 'main-check-first-' + name + '.log'), 'wx');
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', config, '--noEmit', '--incremental', 'false'], { cwd: root, windowsHide: true, stdio: ['ignore', log, log], timeout: 240000 });
  fs.closeSync(log); checks.push({ name, exit: result.status, error: result.error?.message ?? null });
}
for (const row of source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Integrated source changed');
for (const row of preparation.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
const db = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true });
const formal = { schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; db.close();
if (JSON.stringify(formal) !== JSON.stringify(preparation.formal)) throw Error('Formal state changed');
const result = { at: new Date().toISOString(), checks, exactIntegratedSources: source.length, formal, protectedFiles: preparation.protectedFiles.length, allProtectedUnchanged: true,
  applicationSchema: 32, businessRoutesEnabled: false, actualWorkersEnabled: false, formalMigrated: false, pushed: false, deployed: false };
fs.writeFileSync(path.join(__dirname, 'main-check-first.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify(result));
if (checks.some(row => row.exit !== 0)) process.exitCode = 1;
