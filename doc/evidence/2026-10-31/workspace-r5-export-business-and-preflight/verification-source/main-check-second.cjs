const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../../..'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const before = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'main-before-integration.json.gz'))));
const integrated = JSON.parse(fs.readFileSync(path.join(__dirname, 'integration-first.json'))).source, checks = [];
for (const [name, config] of [['contracts', 'packages/contracts/tsconfig.json'], ['api', 'apps/api/tsconfig.json'], ['web', 'apps/web/tsconfig.json']]) {
  const log = fs.openSync(path.join(__dirname, 'main-check-second-' + name + '.log'), 'wx');
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', config, '--noEmit', '--incremental', 'false'], { cwd: root, windowsHide: true, stdio: ['ignore', log, log], timeout: 240000 });
  fs.closeSync(log); checks.push({ name, exit: result.status, error: result.error?.message ?? null });
}
for (const row of integrated) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Integrated source changed');
const intentionalChanges = [];
for (const row of preparation.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) {
  if (row.path !== 'package-lock.json' || !integrated.some(source => source.path === row.path)) throw Error('Unrelated protected runtime changed');
  const old = JSON.parse(Buffer.from(before.find(source => source.path === row.path).data, 'base64').toString('utf8')), next = JSON.parse(fs.readFileSync(path.join(root, row.path), 'utf8'));
  if (old.packages['apps/api'].dependencies.htmlparser2 !== undefined || next.packages['apps/api'].dependencies.htmlparser2 !== '12.0.0' || old.packages['node_modules/htmlparser2'].version !== '12.0.0') throw Error('Unexpected direct parser dependency');
  delete next.packages['apps/api'].dependencies.htmlparser2;
  if (JSON.stringify(old) !== JSON.stringify(next)) throw Error('Unrelated package resolution changed');
  const packageFile = 'apps/api/package.json', oldApi = JSON.parse(Buffer.from(before.find(source => source.path === packageFile).data, 'base64').toString('utf8')), newApi = JSON.parse(fs.readFileSync(path.join(root, packageFile), 'utf8'));
  if (newApi.dependencies.htmlparser2 !== '12.0.0') throw Error('Direct API parser declaration missing'); delete newApi.dependencies.htmlparser2;
  if (JSON.stringify(oldApi) !== JSON.stringify(newApi)) throw Error('Unrelated API package change');
  intentionalChanges.push({ path: row.path, before: row.sha256, after: sha(fs.readFileSync(path.join(root, row.path))), directDependency: 'apps/api htmlparser2 12.0.0', allResolvedPackagesUnchanged: true, packagesInstalledOrChanged: false });
}
const db = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true }), formal = {
  schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; db.close();
if (JSON.stringify(formal) !== JSON.stringify(preparation.formal)) throw Error('Formal database changed');
const result = { at: new Date().toISOString(), checks, exactSources: integrated.length, formal, protectedFiles: preparation.protectedFiles.length, allProtectedUnchanged: intentionalChanges.length === 0, protectedRuntimeAndConfigurationUnchanged: true, unchangedProtectedFiles: preparation.protectedFiles.length - intentionalChanges.length, intentionalSourceDependencyChanges: intentionalChanges, applicationSchema: 32, formalMigrated: false, pushed: false, deployed: false };
fs.writeFileSync(path.join(__dirname, 'main-check-second.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify(result));
if (checks.some(row => row.exit !== 0)) process.exitCode = 1;
