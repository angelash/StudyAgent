const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-paper-persistence-and-privacy');
const sha = value => crypto.createHash('sha256').update(value).digest('hex'), read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
if (fs.existsSync(out)) throw Error('Unused evidence directory required');
const integration = read('integration-first.json'), main = read('main-check-first.json'), formal = read('formal-copy-migration-first.json');
if (main.checks.some(row => row.exit !== 0) || !main.allProtectedUnchanged || !formal.formalUnchanged || !formal.original31Refused32 ||
    formal.before.businessBytesAndOrderSha256 !== formal.after.businessBytesAndOrderSha256 || formal.before.records !== 89864 ||
    formal.after.schema !== 32 || formal.after.revision !== 187 || !read('postgres-stop-first.json').stopped) throw Error('Final actual evidence required');
for (const row of integration.source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Main source changed');
fs.mkdirSync(out, { recursive: true }); const files = [];
function copy(source, relative, compressed = false) {
  if (/private|\.sqlite|\.dump|\.db$/.test(relative)) throw Error('Private artifact refused');
  const raw = fs.readFileSync(source), bytes = compressed ? zlib.gzipSync(raw) : raw, destination = path.join(out, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== sha(bytes)) throw Error('Evidence readback failed');
  files.push({ path: relative, bytes: bytes.length, sha256: sha(bytes), originalSha256: sha(raw), ...(compressed ? { encoding: 'gzip' } : {}) });
}
for (const row of integration.source) copy(path.join(root, row.path), 'source/' + row.path);
const reportPrefixes = /^(api-full-(first|second)|types-(first|second|third|fourth|fifth|sixth)|build-(first|second)|persistence-(first|second)|privacy-first|postgres-first|reader-first|reader-regression-first|legacy-postgres-first|reader-expectations|main-before-integration|integration-first|main-check-first|formal-copy-migration-first|preparation-first|main-protection-during-full-first|check-source-list-first|web-types-first|docs-candidate-first|postgres-stop-first|postgres-start-first)/;
for (const name of fs.readdirSync(__dirname).filter(name => reportPrefixes.test(name) && /\.(json|log|gz)$/.test(name) && !name.includes('private'))) {
  copy(path.join(__dirname, name), 'reports/' + name + (name.endsWith('.gz') ? '' : '.gz'), !name.endsWith('.gz'));
}
for (const name of fs.readdirSync(__dirname).filter(name => /\.(cjs|py)$/.test(name))) copy(path.join(__dirname, name), 'verification-source/' + name);
function tests(name) {
  const report = read(name + '-vitest.json'); return { report: 'reports/' + name + '-vitest.json.gz', passed: report.numPassedTests, failed: report.numFailedTests,
    skipped: report.numPendingTests, success: report.success, sourceUnchanged: read(name + '.json').sourceUnchanged };
}
const full = read('api-full-second-vitest.json');
const receipt = { at: new Date().toISOString(), baseline: integration.baseline, scope: 'R5 six native paper collections, transaction integrity, actual privacy erasure and SQLite/PostgreSQL native file recovery',
  source: integration.source, applicationSchema: 32, main,
  batches: Object.fromEntries(['persistence-first', 'persistence-second', 'privacy-first', 'postgres-first', 'reader-first', 'api-full-second', 'reader-regression-first', 'legacy-postgres-first'].map(name => [name, tests(name)])),
  fullApiFailures: full.testResults.flatMap(suite => suite.assertionResults.filter(row => row.status === 'failed').map(row => ({ suite: suite.name.split('/src/')[1], name: row.fullName,
    reason: 'Current-schema assertion still fixed to31; exact failure in immutable complete report.' }))),
  assertionRecheck: { applicationSourceChangedAfterFullRun: false, updatedCurrentFutureAssertionsAndOneTestRestoreGuardOnly: true,
    originalFullReportPreserved: true, failedAssertionsCovered: 12, archivedReadersOrFixedHistoricalVersionsChanged: false, combinedSingleAllGreenClaim: false },
  originalFailures: [
    { name: 'api-full-first', report: 'reports/api-full-first.json.gz', reason: 'Four-minute runner budget ETIMEDOUT; no complete Vitest JSON; no invented test counts.' },
    { name: 'api-full-second', report: 'reports/api-full-second-vitest.json.gz', reason: 'Twelve fixed current-schema31 assertions; production code unchanged during corresponding rechecks.' },
    { name: 'check-source-list-first', report: 'reports/check-source-list-first.log.gz', reason: 'QA runner parenthesis syntax; original runner retained.' },
    { name: 'prepare-copy-first', reason: 'A preparation copy lacked a destination directory; no product or formal data changed. Original interactive output was not separately captured.' },
  ],
  formalReadOnlyCopy: formal,
  artifacts: { actualSqlitePdfRetainedAndErased: true, actualPostgresDocxRetainedAndErased: true,
    source: 'Unchanged immutable synthetic outputs from committed170 evidence, copied byte-for-byte with complete SHA verification; no new generator or visual-quality claim.' },
  postgresShutdown: read('postgres-stop-first.json'),
  privacy: { realSourceDatabaseOrRowsPublished: false, privateRuntimeCredentialsPublished: false, summaryCountsAndDigestsOnly: true },
  readiness: { sixCollectionsAndSchema32Registered: true, nativeRecordReaderReady: true, businessRoutes: false, liveRenderAndCleanupWorkers: false,
    currentSourceFileHandleDownloads: false, studentMeasurementExposureIntegration: false, oldBodyMediaPdfPrintDiagnosticBypassClosed: false, originalWorkspaceUiAndDrafts: false,
    formalMigrated: false, pushed: false, deployed: false, wholeGoal: 'active' },
  remaining: ['selection/export/source-read business routes and original command receipt recovery', 'actual render/cleanup workers and verified same-handle file delivery',
    'student exact source exposure measurement exclusion and all old body/reference/media/PDF/print restrictions',
    'original workspace list/dialog/drawer/real artifact previews and complete drafts/two tabs/no storage/unknown results',
    'all other R5/R6 textbooks/GESP/R7/R8, original72/WS, teachers, real devices/new machine/physical printer and real 1/3/7/14-day evidence'], files };
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(out, 'README.md'), '# 选题导出持久化、真实隐私与双库恢复\n\n主干源码注册32，六集合、当前授权与原命令事务、实际隐私删除和精确文件回收/恢复已接入。业务接口、实际worker、学生旧读取防旁路与原工作台UI继续。\n\n完整API第二轮2552通过/12失败/106条件跳过；12项旧当前版本断言经对应46/0/8复验，另批真实PG20/0/1。应用源码在完整回归后未变，原报告和复验分列；首轮预算中断无完整计数。专项与全量不相加。\n\n正式库只读副本24→32保留89,864条原业务行的原文/顺序/SHA及revision187，两次冷开和实际31拒读通过。副本含真实资料，仅留私有QA；这里仅有统计与摘要。正式24/revision187和1063运行文件保持，测试PG已准确停止；未推送部署，完整目标active。\n', { flag: 'wx' });
console.log(JSON.stringify({ archivedFiles: files.length, sourceFiles: integration.source.length, bytes: files.reduce((n, row) => n + row.bytes, 0), formalDataPublished: false, goal: 'active' }));
