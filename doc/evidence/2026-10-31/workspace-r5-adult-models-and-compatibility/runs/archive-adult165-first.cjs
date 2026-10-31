const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { execFileSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const qa = __dirname, root = path.resolve(qa, '../../..'), source = path.join(root, 'data/qa/a165');
const archive = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-adult-models-and-compatibility');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(qa, name), 'utf8'));
const candidate = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(qa, 'adult165-source-candidate-third.json.gz'))));
const protection = read('adult165-main-protection-third.json');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== candidate.baseMain) throw Error('Main changed before final archival');
for (const file of candidate.files) if (sha(Buffer.from(file.utf8)) !== file.sha256 || sha(fs.readFileSync(path.join(source, file.path))) !== file.sha256) throw Error('Frozen source changed: ' + file.path);
for (const file of protection.files) if (sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw Error('Protected main changed: ' + file.path);
function vitest(name) {
  const value = read(name);
  return { file: name, passed: value.numPassedTests, failed: value.numFailedTests, skipped: value.numPendingTests,
    files: value.testResults.map(file => ({ path: path.relative(path.join(source, 'apps/api'), file.name).replaceAll('\\', '/'),
      passed: file.assertionResults.filter(row => row.status === 'passed').length,
      failed: file.assertionResults.filter(row => row.status === 'failed').length,
      skipped: file.assertionResults.filter(row => ['pending', 'skipped', 'todo'].includes(row.status)).length })) };
}
function browser(name) {
  const value = read(name), attempts = [];
  function walk(suite) { for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) attempts.push({ id: spec.id, status: result.status, retry: result.retry }); for (const child of suite.suites ?? []) walk(child); }
  for (const suite of value.suites ?? []) walk(suite);
  return { file: name, passed: value.stats.expected, failed: value.stats.unexpected, flaky: value.stats.flaky, skipped: value.stats.skipped,
    attempts: attempts.length, retries: attempts.filter(row => row.retry > 0).length, uniqueIds: new Set(attempts.map(row => row.id)).size };
}
const checks = {
  contentSecond: vitest('adult165-unit-second.json'),
  assistantSqliteFirst: vitest('adult165-assistant-compat-sqlite-first.json'),
  assistantPostgresFirst: vitest('adult165-assistant-compat-postgres-first.json'),
  assistantSqliteThird: vitest('adult165-assistant-compat-sqlite-third.json'),
  assistantPostgresThird: vitest('adult165-assistant-compat-postgres-third.json'),
  classroomSqliteFirst: vitest('adult165-classroom-compat-sqlite-first.json'),
  classroomPostgresFirst: vitest('adult165-classroom-compat-postgres-first.json'),
  apiFullThird: vitest('adult165-api-full-third.json'),
  durabilityNormalFourth: vitest('adult165-durability-diagnostic-sqlite-fourth.json'),
  durabilitySeedDisabledFifth: vitest('adult165-durability-diagnostic-sqlite-seed-disabled-fifth.json'),
  browserFirst: browser('adult165-browser-first.json'), browserSecond: browser('adult165-browser-second.json'), browserThird: browser('adult165-browser-third.json'),
  oldNewSqliteFirst: read('adult165-history-sqlite-first.json'), oldNewSqliteSecond: read('adult165-history-sqlite-second.json'),
  oldNewPostgresFirst: read('adult165-history-postgres-native-first.json'),
};
for (const key of ['assistantSqliteThird', 'assistantPostgresThird', 'browserThird', 'durabilityNormalFourth']) if (checks[key].failed || checks[key].flaky) throw Error('Unresolved final run: ' + key);
const failedCases = value => value.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed').map(test => test.fullName)).sort();
const environment = read('adult165-durability-environment-differential-fifth.json');
if (checks.apiFullThird.failed !== 2 || checks.durabilityNormalFourth.passed !== 3 || checks.durabilitySeedDisabledFifth.failed !== 2 || !environment.exactTestAndCompiledInputsEqual ||
  JSON.stringify(failedCases(read('adult165-api-full-third.json'))) !== JSON.stringify(failedCases(read('adult165-durability-diagnostic-sqlite-seed-disabled-fifth.json')))) throw Error('Unclassified broad failure or changed environmental differential');
if (checks.assistantSqliteThird.passed !== 69 || checks.assistantPostgresThird.passed !== 70 || checks.browserThird.passed !== 50 || checks.browserThird.retries) throw Error('Unexpected final scope');
if (checks.oldNewSqliteSecond.passed !== 4 || checks.oldNewPostgresFirst.passed !== 4) throw Error('Actual old/new native history checks required');
for (const name of ['adult165-api-types-third.json', 'adult165-api-build-third.json', 'adult165-web-build-second.json']) if (read(name).status) throw Error('Final type/build failure: ' + name);
if (fs.existsSync(archive)) throw Error('Do not replace an existing evidence archive');
fs.mkdirSync(archive, { recursive: true });
const artifacts = [], redactions = [], knownDefaults = [];
const configText = fs.readFileSync(path.join(root, 'packages/config/src/index.ts'), 'utf8');
const publicDefault = (configText.match(/postgres(?:ql)?:\/\/[^\s'"`]+/g) ?? []).find(value =>
  sha(value) === 'c3390ca53f9fef2d568d91228f08cedd8073449e0dfc042ac6623b2f1f4f624a' && fs.readFileSync(path.join(root, '.env.example'), 'utf8').includes(value));
const publicDefaultPrefix = publicDefault ? publicDefault.slice(0, publicDefault.indexOf('@') + 1) : null;
function sanitize(input, name) {
  let value = input;
  const rules = [
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_SESSION_TOKEN]'],
    [/\bBearer [A-Za-z0-9_.-]{40,}/g, 'Bearer [REDACTED_SESSION_TOKEN]'],
    [/(postgres(?:ql)?:\/\/[^\s:/"'\\]+:)[^\s@"'\\]+(@)/g, '$1[REDACTED_QA_PASSWORD]$2'],
    [/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g, '[REDACTED_API_KEY]'],
  ];
  let count = 0;
  for (const [pattern, replacement] of rules) value = value.replace(pattern, (...args) => {
    if (replacement.includes('$1') && args[0] === publicDefaultPrefix) {
      knownDefaults.push({ source: name, matchSha256: sha(args[0]), kind: 'Exact tracked config and .env.example local default; no runtime environment value.' });
      return args[0];
    }
    count++; return replacement.includes('$1') ? args[1] + '[REDACTED_QA_PASSWORD]' + args[2] : replacement;
  });
  if (count) redactions.push({ source: name, count, originalTextSha256: sha(input), publicTextSha256: sha(value) });
  return value;
}
function save(relative, bytes, original = bytes, extra = {}) {
  const target = path.resolve(archive, relative);
  if (!target.startsWith(archive + path.sep) || fs.existsSync(target)) throw Error('Unique bounded artifact required');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(target)) !== sha(bytes)) throw Error('Artifact readback failed');
  artifacts.push({ path: relative, bytes: bytes.length, sha256: sha(bytes), originalSha256: sha(original), ...extra });
}
const names = fs.readdirSync(qa).filter(name => /\.(?:json|cjs|log|gz)$/.test(name)).sort();
for (const name of names) {
  const original = fs.readFileSync(path.join(qa, name));
  if (name.endsWith('.gz')) {
    const plain = zlib.gunzipSync(original), clean = Buffer.from(sanitize(plain.toString('utf8'), name));
    save('runs/' + name, sha(plain) === sha(clean) ? original : zlib.gzipSync(clean), original, { encoding: 'gzip', plainSha256: sha(clean) });
  } else {
    const clean = Buffer.from(sanitize(original.toString('utf8'), name));
    if (clean.length > 50_000 || name.endsWith('.log')) save('runs/' + name + '.gz', zlib.gzipSync(clean), original, { encoding: 'gzip', plainSha256: sha(clean) });
    else save('runs/' + name, clean, original);
  }
}
const compiled = [];
function compileWalk(relative) {
  for (const entry of fs.readdirSync(path.join(source, relative), { withFileTypes: true })) {
    const file = relative + '/' + entry.name;
    if (entry.isSymbolicLink()) throw Error('No runtime source links in archive');
    if (entry.isDirectory()) compileWalk(file);
    else if (entry.isFile() && /\.(?:js|cjs)$/.test(file)) {
      const bytes = fs.readFileSync(path.join(source, file)); compiled.push({ path: file, sha256: sha(bytes), utf8: bytes.toString('utf8') });
    }
  }
}
for (const dir of ['apps/api/dist', 'packages/contracts/dist', 'packages/config/dist', 'scripts/operations']) compileWalk(dir);
const compiledText = JSON.stringify({ at: new Date().toISOString(), scope: 'Actual final third compiled API and operation inputs; not the first or second compiled runtime.', files: compiled });
if (sanitize(compiledText, 'final-compiled-runtime') !== compiledText) throw Error('Review final compiled runtime before publishing');
save('final-compiled-runtime.json.gz', zlib.gzipSync(compiledText), Buffer.from(compiledText), { encoding: 'gzip', plainSha256: sha(compiledText) });
const screenshots = [], otherBrowserFiles = [];
for (const label of ['adult165-browser-first', 'adult165-browser-second', 'adult165-browser-third']) {
  const folder = path.join(qa, label + '-output');
  function images(relative = '') {
    for (const entry of fs.readdirSync(path.join(folder, relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name); if (entry.isSymbolicLink()) throw Error('No evidence source links');
      if (entry.isDirectory()) images(file);
      else if (entry.isFile()) {
        const relativePath = file.replaceAll('\\', '/');
        if (entry.name.endsWith('.png')) {
          const bytes = fs.readFileSync(path.join(folder, file)), target = 'screenshots/' + label + '/' + relativePath;
          save(target, bytes); screenshots.push({ run: label, source: relativePath, path: target, sha256: sha(bytes) });
        } else otherBrowserFiles.push({ run: label, path: relativePath, reason: 'Raw traces and runtime files remain local; public reports and PNG evidence are archived.' });
      }
    }
  }
  images();
}
save('screenshots.json', Buffer.from(JSON.stringify({ screenshots, localOnly: otherBrowserFiles }, null, 2) + '\n'));
save('README.md', Buffer.from(`# 成人课堂模型与完整助教兼容\n\n本批为本地隔离验证和源码归并证据；正式库、运行构建与配置保持。完整目标继续active。\n\n60课中首课教学保持，其余59课增加自编假设情境、预测、具体对照及结论边界。185微题、60单元题和5项目保持。仅助教投影省去已在章节标题中完整保留的相同heading，未提高原容量、裁切正文或替换成概览。\n\n最终完整API：${checks.apiFullThird.passed}通过/${checks.apiFullThird.failed}失败/${checks.apiFullThird.skipped}条件跳过。最终生产浏览器50/50、零重试；此前第二轮12/12和首次7过5失败分别保存。助教7文件复验SQLite69/0/1、PG配置70/0/0；PG配置批包含重复纯函数或SQLite分支，不把全部70项称为PG。原首轮助教SQLite54/11/1、PG配置54/12/0保留。\n\n旧44真实API创建的原课堂、首答、字幕断点和完整稿，经新165冷开、明确升级和原生恢复：SQLite第二轮4/0，真实PG4/0。SQLite首次3/1是恢复后错误沿用已清除的旧登录凭据；实际重新认证后的复验另列。评分/字幕/项目隐私SQLite22/0/1、PG配置23/0/0属于各自输入，不累计成单次结果。\n\n完整源码变体、每轮输入SHA和报告在runs；实际最终第三轮编译字节在final-compiled-runtime.json.gz。旧编译主要保留准确输入摘要与源码，不冒充每轮都有完整独立运行副本。截图索引见screenshots.json，原始trace及运行数据留在本地QA。\n\n教师审核、真实设备、听感、实体打印、真人1/3/7/14日与R6全教材/GESP等完整范围仍未完成。controlled-main-integration.json记录后续实际归并读回；本批没有推送、部署或写正式学习事实。\n`));
const db = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true }); let formal;
try { formal = { schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; } finally { db.close(); }
if (JSON.stringify(formal) !== JSON.stringify(protection.formal)) throw Error('Protected formal metadata changed');
const receipt = {
  at: new Date().toISOString(), baseMain: candidate.baseMain, scope: 'Adult classroom models, unchanged original practice and complete assistant projection compatibility. Synthetic test actors only.',
  sourceFiles: candidate.files.map(({ path, baselineSha256, sha256 }) => ({ path, baselineSha256, sha256 })), schema: 31, formalReadOnly: formal,
  content: { lessons: 60, addedModels: 59, microQuestions: 185, unitQuestions: 60, projects: 5, firstLessonTeachingUnchanged: true,
    source: 'Independently authored fictional situations; actual original teaching baseline is in the previous preparation archive.' },
  checks, finalWeb: read('adult165-production-context-second.json'), protectedMainFiles: protection.files.length,
  projection: { removed: 'Only heading blocks whose full text equals the section title, already retained verbatim in part.title.',
    retained: 'All narration, distinct headings, text, points, tables, diagrams, code, image alternatives, phases, source references and nine classroom steps.',
    originalSnapshotLimit: 17800, originalProviderContextLimit: 18000, completeAllFifteenLectures: true, oldV1V2ReadOnly: true },
  history: { originalFailuresPreserved: true, countsAreSeparateRuns: true, postgresBatchesContainRepeatedPureOrSqliteBranches: true,
    broadApiFailureClassification: 'The runner forced foundation seeding off for two existing development fixtures requiring seeded original items. Exact same tests/compiled inputs: normal configuration3/0; seed-disabled reproduction1/2. Full-run failed test identities must exactly match that reproduction; broad original2 failures stay reported.',
    earlierCompiledManifests: 'Exact run input hashes and source variants are archived; the actual final third compiled bytes are separately frozen. Earlier compiled files are not all independently copied.' },
  humanReviewCompleted: false, realDeviceAcceptance: false, realLearnerEvidence: false, formalApplicationUpdated: false,
  applicationIntegration: 'Recorded separately after controlled source readback. No main API startup, push or deployment.', wholeGoal: 'active',
  remaining: ['R5 sound and full classroom/reference conditions', 'R5 selected-question PDF/DOCX export, print and review flow', 'R6 complete primary textbooks and GESP', 'R7 engineering/cross-environment', 'R8 teachers/devices/real learners at 1/3/7/14 days', 'Every original 72 and WS requirement retains its complete acceptance scope'],
  publicScan: { rules: ['JWT session tokens', 'long Bearer tokens', 'credential-bearing PostgreSQL URLs', 'API key prefixes'], redactions, knownDefaults },
  screenshots: screenshots.length, artifacts,
};
fs.writeFileSync(path.join(archive, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
for (const row of artifacts) if (sha(fs.readFileSync(path.join(archive, row.path))) !== row.sha256) throw Error('Final artifact readback failed');
fs.writeFileSync(path.join(qa, 'adult165-archive-readback-first.json'), JSON.stringify({ at: new Date().toISOString(), archive: path.relative(root, archive).replaceAll('\\', '/'), artifacts: artifacts.length, screenshots: screenshots.length, sourceFiles: candidate.files.length, redactions: redactions.length, verified: true }) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ archive, artifacts: artifacts.length, screenshots: screenshots.length, redactions: redactions.length, api: checks.apiFullThird, browser: checks.browserThird }));
