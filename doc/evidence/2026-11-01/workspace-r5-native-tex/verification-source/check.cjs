const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p180'), [batch, mode = 'types', ...suites] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(batch ?? '') || fs.existsSync(path.join(__dirname, batch + '.json'))) throw Error('New named batch required');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const owned = ['apps/api/package.json', 'package-lock.json', 'apps/api/src/modules/library/paper-export-tex.ts', 'apps/api/src/modules/library/paper-export-tex.test.ts', 'apps/api/src/modules/library/paper-export-document-source.ts', 'apps/api/src/modules/library/paper-export.service.ts', 'scripts/processing/paper_export_content.py', 'scripts/processing/paper_export_math.py', 'scripts/processing/paper_export_document.py', 'scripts/processing/test_paper_export.py', 'apps/api/src/modules/library/paper-export-tex.integration.test.ts'];
const source = owned.filter(file => fs.existsSync(path.join(candidate, file))).map(file => { const bytes = fs.readFileSync(path.join(candidate, file)); return { path: file, sha256: sha(bytes), data: bytes.toString('base64') }; });
fs.writeFileSync(path.join(__dirname, batch + '-source.json.gz'), zlib.gzipSync(JSON.stringify(source)), { flag: 'wx' });
const temporary = path.join(candidate, 'data/qa/temporary'); fs.mkdirSync(temporary, { recursive: true });
const env = { ...process.env, TEMP: temporary, TMP: temporary, OPENAI_API_KEY: '', XIAOJIU_CHAT_ENABLED: 'false', STUDY_TEST_PAPER_EXPORT_INSTALLATION: path.join(root, 'data/qa/er2/installation.json'), STUDY_TEST_PAPER_EXPORT_PROJECT_ROOT: root, STUDY_TEST_PAPER_EXPORT_WORKSPACE: path.join(root, 'data/qa/w180r'), STUDY_TEST_PAPER_TEX_WORKSPACE: process.env.STUDY_TEST_PAPER_TEX_WORKSPACE ?? path.join(root, 'data/qa/w180t1') };
const steps = mode === 'test' ? [['vitest', process.execPath, [path.join(candidate, 'node_modules/vitest/vitest.mjs'), 'run', ...suites, '--reporter=json', '--outputFile=' + path.join(__dirname, batch + '-vitest.json')], path.join(candidate, 'apps/api')]] :
  mode === 'python' ? [['python', path.join(root, 'data/qa/er2/python/Scripts/python.exe'), ['-B', '-X', 'utf8', '-m', 'unittest', '-v', 'test_paper_export'], path.join(candidate, 'scripts/processing')]] :
  [['contracts', process.execPath, [path.join(candidate, 'node_modules/typescript/bin/tsc'), '-p', 'packages/contracts/tsconfig.json'], candidate], ['config', process.execPath, [path.join(candidate, 'node_modules/typescript/bin/tsc'), '-p', 'packages/config/tsconfig.json'], candidate], ['api', process.execPath, [path.join(candidate, 'node_modules/typescript/bin/tsc'), '-p', 'apps/api/' + (mode === 'build' ? 'tsconfig.build.json' : 'tsconfig.json'), ...(mode === 'build' ? [] : ['--noEmit'])], candidate]];
const results = [];
for (const [name, executable, args, cwd] of steps) {
  const log = fs.openSync(path.join(__dirname, batch + '-' + name + '.log'), 'wx');
  const result = spawnSync(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', log, log], timeout: 600000 }); fs.closeSync(log);
  results.push({ name, exit: result.status, error: result.error?.message ?? null });
}
const sourceUnchanged = source.every(row => sha(fs.readFileSync(path.join(candidate, row.path))) === row.sha256);
const report = { at: new Date().toISOString(), mode, suites, sourceUnchanged, results };
fs.writeFileSync(path.join(__dirname, batch + '.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report));
if (!sourceUnchanged || results.some(row => row.exit !== 0)) process.exitCode = 1;
