const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), assert = require('node:assert/strict'), { spawnSync, execFileSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../../..'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz')))), integration = JSON.parse(fs.readFileSync(path.join(__dirname, 'integration-first.json'))), source = integration.source;
const checks = [];
for (const [name, config] of [['contracts', 'packages/contracts/tsconfig.json'], ['api', 'apps/api/tsconfig.json'], ['web', 'apps/web/tsconfig.json']]) {
  const log = fs.openSync(path.join(__dirname, 'main-check-second-' + name + '.log'), 'wx');
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', config, '--noEmit', '--incremental', 'false'], { cwd: root, windowsHide: true, stdio: ['ignore', log, log], timeout: 240000 }); fs.closeSync(log); checks.push({ name, exit: result.status, error: result.error?.message ?? null });
}
for (const row of source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Integrated source changed');
const intentionalManifestChanges = [];
for (const row of preparation.protectedFiles) {
  const bytes = fs.readFileSync(path.join(root, row.path)); if (sha(bytes) === row.sha256) continue;
  if (row.path !== 'package-lock.json' || !source.some(file => file.path === row.path && file.sha256 === sha(bytes))) throw Error('Unrelated protected runtime changed: ' + row.path);
  const baselineBytes = execFileSync('git', ['show', integration.baseline + ':package-lock.json'], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
  // Git normalizes source text; the recorded baseline guard hashes actual
  // working bytes. Compare the precise JSON objects, preserving the old hash.
  const original = JSON.parse(baselineBytes), current = JSON.parse(bytes);
  assert.equal(current.packages['apps/api'].dependencies.katex, '0.19.0'); assert.equal(current.packages['apps/web'].dependencies.katex, '0.19.0');
  delete current.packages['apps/api'].dependencies.katex; assert.deepEqual(current, original);
  intentionalManifestChanges.push({ path: row.path, beforeSha256: row.sha256, currentSha256: sha(bytes), change: 'API directly declares existing katex@0.19.0; every resolved dependency entry unchanged', installationRun: false });
}
const db = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true }), formal = { schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; db.close();
assert.deepEqual(formal, preparation.formal);
const report = { at: new Date().toISOString(), checks, exactSourceFiles: source.length, protectedFiles: preparation.protectedFiles.length, protectedFilesUnchanged: preparation.protectedFiles.length - intentionalManifestChanges.length, intentionalManifestChanges, allOtherProtectedRuntimeBuildsConfigsAndDependenciesUnchanged: true, formal, applicationSchema: 32, noFormalMigrationPushOrDeployment: true };
fs.writeFileSync(path.join(__dirname, 'main-check-second.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report)); if (checks.some(row => row.exit !== 0)) process.exitCode = 1;
