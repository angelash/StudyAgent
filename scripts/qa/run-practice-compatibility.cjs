// Owned regression only: preserve each attempt, exact source/build bytes and original logs.
// Credentials are read only into the child environment, never copied into evidence.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), [attempt, engine = 'sqlite', suite = 'compatibility', credentialFile] = process.argv.slice(2);
if (!attempt || !/^[a-z0-9-]+$/.test(attempt) || !['sqlite', 'postgres'].includes(engine)
  || !['compatibility', 'complete-api'].includes(suite) || (suite === 'complete-api' && engine !== 'sqlite'))
  throw Error('Choose a new attempt, sqlite/postgres and compatibility/complete-api (complete API uses SQLite environment)');
const output = path.join(root, 'data/qa/practice-compatibility', attempt);
if (fs.existsSync(output)) throw Error('Original attempt already exists');
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '', STUDY_WORKER_ENABLED: 'false' };
for (const name of Object.keys(env)) if (/^STUDY_TEST_.*POSTGRES.*URL$/.test(name)) delete env[name];
if (engine === 'postgres') {
  const file = path.resolve(credentialFile ?? path.join(root, 'data/qa/postgres/credentials.json'));
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.database !== 'study_agent_qa'
    || config.appUser !== 'study_agent_app' || config.adminUser !== 'study_qa_admin') throw Error('Owned local QA cluster required');
  const url = new URL('postgresql://127.0.0.1:' + config.port + '/' + config.database); url.username = config.appUser; url.password = config.appPassword;
  const admin = new URL(url); admin.pathname = '/postgres'; admin.username = config.adminUser; admin.password = config.adminPassword;
  for (const scope of ['ASSISTANT_NOTE_STORAGE', 'ASSISTANT_WHITEBOARD_STORAGE', 'TEACHING_TOOL', 'TOPIC_WHITEBOARD',
    'TOPIC_VISUAL', 'WHITEBOARD_QUESTION', 'QUESTION_VISUAL', 'ASSISTANT_PRACTICE', 'ASSISTANT_WHITEBOARD', 'PAPER_PRACTICE'])
    env['STUDY_TEST_' + scope + '_POSTGRES_URL'] = url.toString();
  env.STUDY_TEST_POSTGRES_ADMIN_URL = admin.toString();
  env.STUDY_TEST_PG_BIN = path.resolve(path.dirname(file), '../../tools/postgresql-17.11-5/pgsql/bin');
  if (!fs.existsSync(path.join(env.STUDY_TEST_PG_BIN, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump')))
    throw Error('Prepared QA native binaries required');
}
const compatibility = [
  'infrastructure/assistant-note-storage.integration.test.ts', 'infrastructure/assistant-whiteboard-reader.integration.test.ts',
  'infrastructure/backup.integration.test.ts', 'infrastructure/paper-practice-migration.test.ts',
  'infrastructure/teaching-tool-storage.integration.test.ts', 'infrastructure/topic-whiteboard-postgres.integration.test.ts',
  'infrastructure/topic-whiteboard-storage.integration.test.ts', 'infrastructure/topic-whiteboard-visual-postgres.integration.test.ts',
  'infrastructure/topic-whiteboard-visual-storage.integration.test.ts', 'infrastructure/whiteboard-question-postgres.integration.test.ts',
  'infrastructure/whiteboard-question-storage.integration.test.ts', 'infrastructure/whiteboard-question-visual-storage.integration.test.ts',
  'modules/library/paper-practice-recovery.integration.test.ts', 'modules/learning/topic-whiteboard-visual-files.test.ts',
  'modules/learning/whiteboard-question-visual.integration.test.ts', 'modules/learning/assistant-practice-preflight.integration.test.ts',
  'modules/learning/assistant-whiteboard.integration.test.ts', 'modules/learning/assistant-practice-content.test.ts',
  'modules/learning/assistant-whiteboard-content.test.ts', 'modules/learning/assistant-practice-bank-selection.test.ts',
].map(file => 'src/' + file);
const candidates = execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 }).split('\0');
const inputs = [...new Set(candidates.filter(file => file && fs.statSync(path.join(root, file)).isFile()
  && (/^(apps\/api\/|packages\/|scripts\/)/.test(file) || /^resources\/(curriculum|compatibility|qa)\//.test(file)
    || ['package.json', 'package-lock.json', 'tsconfig.base.json'].includes(file))))].sort();
function walk(relative) {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(path.join(relative, entry.name)) : entry.isFile() ? [path.join(relative, entry.name).replaceAll('\\', '/')] : []);
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function freeze(files, kind) {
  return Object.fromEntries(files.map(file => {
    const source = path.join(root, file), target = path.join(output, kind, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    return [file, { sha256: hash(source), bytes: fs.statSync(source).size }];
  }));
}
const source = freeze(inputs, 'source');
const build = freeze(['apps/api/dist', 'packages/contracts/dist', 'packages/config/dist'].flatMap(walk).sort(), 'build');
const command = [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...(suite === 'compatibility' ? compatibility : []),
  '--maxWorkers=1', '--reporter=default', '--reporter=json', '--outputFile=' + path.join(output, 'vitest.json')];
fs.writeFileSync(path.join(output, 'inputs-before.json'), JSON.stringify({ at: new Date().toISOString(), suite, engine,
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), source, build,
  scope: suite === 'compatibility' ? compatibility : 'All apps/api/src/**/*.test.ts; external database cases without configured engines may skip.' }, null, 2) + '\n', { flag: 'wx' });
const result = spawnSync(process.execPath, command, { cwd: path.join(root, 'apps/api'), env, windowsHide: true, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 });
fs.writeFileSync(path.join(output, 'stdout.log'), result.stdout ?? '', { flag: 'wx' });
fs.writeFileSync(path.join(output, 'stderr.log'), result.stderr ?? '', { flag: 'wx' });
const changed = Object.entries(source).filter(([file, identity]) => hash(path.join(root, file)) !== identity.sha256).map(([file]) => file);
const changedBuild = Object.entries(build).filter(([file, identity]) => hash(path.join(root, file)) !== identity.sha256).map(([file]) => file);
const report = fs.existsSync(path.join(output, 'vitest.json')) ? JSON.parse(fs.readFileSync(path.join(output, 'vitest.json'), 'utf8')) : null;
const receipt = { at: new Date().toISOString(), suite, engine, passed: result.status === 0 && report?.success === true && !changed.length && !changedBuild.length,
  exitCode: result.status, error: result.error?.message ?? null, sourceInputs: inputs.length, compiledInputs: Object.keys(build).length, changed, changedBuild,
  tests: report ? { total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests } : null,
  limits: ['Generated users/content and owned isolated stores only; no actual model/TTS/image provider or real learner evidence.',
    'Compatibility/full API results are distinct from browser, precise remote CI, schema24 delivery and complete product acceptance.'] };
fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(receipt)); if (!receipt.passed) process.exitCode = 1;
