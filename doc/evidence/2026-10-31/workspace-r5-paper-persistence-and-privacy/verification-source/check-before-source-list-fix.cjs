const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p171'), batch = process.argv[2], mode = process.argv[3] ?? 'types';
if (!/^[a-z0-9-]+$/.test(batch ?? '')) throw Error('Batch required');
const temporary = path.join(candidate, 'data/qa/temporary'); fs.mkdirSync(temporary, { recursive: true });
const env = { ...process.env, TEMP: temporary, TMP: temporary, XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '' };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const changed = preparation.files.filter(file => fs.existsSync(path.join(candidate, file.path)) && sha(fs.readFileSync(path.join(candidate, file.path))) !== file.sha256).map(file => file.path);
const files = [...new Set([...changed, 'apps/api/src/infrastructure/schema32-reader.integration.test.ts', 'packages/contracts/src/index.ts', 'packages/contracts/src/privacy.ts', 'apps/api/src/infrastructure/task-repository.ts', 'apps/api/src/infrastructure/domain-database.ts',
  'apps/api/src/infrastructure/in-memory-store.service.ts', 'apps/api/src/modules/privacy/privacy-records.ts', 'apps/api/src/modules/privacy/privacy.service.ts',
  ...fs.readdirSync(path.join(candidate, 'apps/api/src/modules/library')).filter(name => name.startsWith('paper-')).map(name => 'apps/api/src/modules/library/' + name),
  ...['privacy-ledger.cjs', 'database-reader-guard.cjs', 'assistant-practice-integrity.cjs', 'backup.cjs', 'postgres-backup.cjs', 'restored-paper-exports.cjs', 'sqlite-restore.cjs', 'postgres-restore.cjs'].map(name => 'scripts/operations/' + name)]
  .filter(file => fs.existsSync(path.join(candidate, file)))])];
const frozen = files.map(file => { const bytes = fs.readFileSync(path.join(candidate, file)); return { path: file, sha256: sha(bytes), data: bytes.toString('base64') }; });
fs.writeFileSync(path.join(__dirname, batch + '-source.json.gz'), zlib.gzipSync(JSON.stringify(frozen)), { flag: 'wx' });
const suites = process.argv.slice(4);
const steps = mode === 'test' ? [['unit', 'node_modules/vitest/vitest.mjs', ['run', ...(suites.length ? suites : ['src/modules/library/paper-library-persistence.test.ts', 'src/modules/library/paper-export-native.test.ts', 'src/modules/library/paper-export-record.test.ts', 'src/modules/library/paper-selection-record.test.ts', 'src/modules/library/paper-selection-source.test.ts', 'src/infrastructure/task-repository.test.ts']), '--reporter=json', '--outputFile=' + path.join(__dirname, batch + '-vitest.json')], path.join(candidate, 'apps/api')]] :
  mode === 'build' ? [['build', 'node_modules/typescript/bin/tsc', ['-p', 'apps/api/tsconfig.build.json'], candidate]] :
  [['contracts', 'node_modules/typescript/bin/tsc', ['-p', 'packages/contracts/tsconfig.json'], candidate], ['config', 'node_modules/typescript/bin/tsc', ['-p', 'packages/config/tsconfig.json'], candidate], ['api', 'node_modules/typescript/bin/tsc', ['-p', 'apps/api/tsconfig.json', '--noEmit'], candidate]];
const results = [];
for (const [name, script, args, cwd] of steps) {
  const log = fs.openSync(path.join(__dirname, batch + '-' + name + '.log'), 'wx'); const result = spawnSync(process.execPath, [path.join(candidate, script), ...args],
    { cwd, env, windowsHide: true, stdio: ['ignore', log, log], timeout: 240000 }); fs.closeSync(log); results.push({ name, exit: result.status, error: result.error?.message ?? null });
}
const sourceUnchanged = frozen.every(file => sha(fs.readFileSync(path.join(candidate, file.path))) === file.sha256);
fs.writeFileSync(path.join(__dirname, batch + '.json'), JSON.stringify({ at: new Date().toISOString(), results, sourceUnchanged }, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ batch, results, sourceUnchanged }));
if (!sourceUnchanged) process.exitCode = 1;
if (results.some(row => row.exit !== 0)) process.exitCode = 1;
