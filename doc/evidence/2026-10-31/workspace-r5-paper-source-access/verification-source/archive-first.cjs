const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-paper-source-access');
const sha = value => crypto.createHash('sha256').update(value).digest('hex'), read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const integration = read('integration-first.json'), main = read('main-check-first.json');
if (fs.existsSync(out) || main.checks.some(row => row.exit !== 0) || !main.allProtectedUnchanged || !read('postgres-stop-second.json').stopped || !read('browser-stop-first.json').stopped) throw Error('Unused archive and completed actual validation required');
for (const row of integration.source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Main source changed');
fs.mkdirSync(out, { recursive: true }); const files = [];
function copy(source, relative, compressed = false) {
  if (/private|\.(?:sqlite3?|dump|db|zip)$/.test(relative)) throw Error('Private artifact refused');
  const raw = fs.readFileSync(source), bytes = compressed ? zlib.gzipSync(raw) : raw, destination = path.join(out, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== sha(bytes)) throw Error('Archive readback failed');
  files.push({ path: relative, sha256: sha(bytes), bytes: bytes.length, originalSha256: sha(raw), ...(compressed ? { encoding: 'gzip' } : {}) });
}
for (const row of integration.source) copy(path.join(root, row.path), 'source/' + row.path);
for (const name of fs.readdirSync(__dirname).filter(name => /^(?:types-|build-|web-types-|web-build-|media-|access-|learner-race-|postgres-|regression-|browser-(?:api-|ui-|web-|stop-)|integration-first|main-check-first|preparation-first|main-before-integration)/.test(name) && /\.(?:json|log|gz)$/.test(name) && !name.includes('private')))
  copy(path.join(__dirname, name), 'reports/' + name + (name.endsWith('.gz') ? '' : '.gz'), !name.endsWith('.gz'));
for (const name of fs.readdirSync(__dirname).filter(name => /\.cjs$/.test(name))) copy(path.join(__dirname, name), 'verification-source/' + name);
copy(path.join(__dirname, 'pdf-print-before-first.tsx'), 'source-history/pdf-print-before-first.tsx');
for (const batch of ['browser-ui-first', 'browser-ui-second', 'browser-ui-third', 'browser-ui-fourth']) {
  for (const name of fs.readdirSync(path.join(__dirname, batch)).filter(name => name.endsWith('.png'))) copy(path.join(__dirname, batch, name), 'screenshots/' + batch + '/' + name);
}
const batches = Object.fromEntries(['media-first', 'access-first', 'access-second', 'postgres-first', 'postgres-second', 'regression-first', 'learner-race-first'].map(name => {
  const row = read(name + '-vitest.json'); return [name, { passed: row.numPassedTests, failed: row.numFailedTests, skipped: row.numPendingTests, files: row.testResults.length,
    report: 'reports/' + name + '-vitest.json.gz', sourceUnchanged: read(name + '.json').sourceUnchanged }];
}));
const browserBatches = Object.fromEntries(['browser-ui-first', 'browser-ui-second', 'browser-ui-third', 'browser-ui-fourth'].map(name => [name, read(name + '.json')]));
const receipt = { at: new Date().toISOString(), baseline: integration.baseline,
  scope: '172 second business slice: old source entry authorization, same verified file handle HTTP streaming, original workspace explicit reads and current PDF/HTML print checks', source: integration.source,
  batches, browserBatches, main, browserShutdown: read('browser-stop-first.json'), postgresShutdown: read('postgres-stop-second.json'),
  actualChecks: ['Whole-preview exact learner read coverage and separate reference/media provenance', 'Old learner-owned practice grants preserve actual first-answer/revealed semantics without synthetic read history',
    'Active diagnosis blocks old prompt/options/reference/media/PDF and new print while retaining original own answers/drafts/receipts',
    'Complete file SHA and before/after file identity use the same open handle as HTTP Range/full streaming',
    'Actual same-size corruption, path replacement after hash, real client interruption and 416 close their handles',
    'Fresh native snapshot after hashing rejects actual account closure, publication withdrawal and learner guardian access revocation',
    'Original workspace records explicit accurate learner read before content; ambiguous POST recovers its original key/input once',
    'Optional actor header fences cookie identity switches; leaving cancels late print',
    'PDF checks stream one byte only after full server hash/current authorization and then navigate the original PDF window',
    'Denied PDF closes placeholder and reports in original workspace; unchanged desktop shell and 390px without horizontal overflow'],
  qaCorrections: [
    { batch: 'browser-api-first', actual: 'Generic setup error only; original concrete stack not captured.', marker: 'reports/browser-api-first-observed-failure.json.gz', originalSourcePreserved: true },
    { batch: 'browser-api-second', actual: 'Independent registration setup failure; original stack private. A forced process exit produced a Windows UV_HANDLE_CLOSING assertion; original stderr retained locally.', privateLogsExcluded: true },
    { batch: 'browser-api-third', actual: 'Actual register 400: expected object, received undefined. Local control parser prevented registration body parsing.', privateResponseExcluded: true },
    { batch: 'browser-api-fourth', actual: 'Reused product configureJsonBody, removed local parser, set candidate cwd. Real registration succeeded.', credentialsAndRuntimeExcluded: true },
    { batch: 'browser-ui-first', actual: '4 passed/3 failed. Two alert selectors selected Next announcements; PDF print denial actually opened an error window.', originalReportAndScreenshotsPreserved: true },
    { batch: 'browser-ui-second', actual: '2 passed/1 failed with corrected local alert selectors; confirmed PDF issue remained.', originalReportAndScreenshotPreserved: true },
    { batch: 'web-build-second', actual: 'PDF explicit-read/source check, one-byte authorization preflight, isolated placeholder and same-handler original link.', buildId: read('web-build-second.json').buildId },
    { batch: 'browser-ui-third', actual: '7 passed/0 failed on actual second build; original PDF normal navigation and diagnosis denial both tested.' },
    { batch: 'browser-ui-fourth', actual: '3 passed/0 failed on unchanged second build. Screenshot review found a premature reference checkpoint; waits now include actual 409 response and final UI instead of prior alert/loading.', distinctBatchNotAddedToThird: true }
  ],
  validationLimits: { overlappingBatchesNotAdded: true, sqliteFinalScoped13PlusSeparateGuardianRace: true, postgresFinalScoped14: true, fullApiOrWholeSiteRerunThisSlice: false,
    realTeacherOrPhysicalPrinterEvidence: false, newMachineOrPhysicalMobileEvidence: false, noRealDataOrPrivateTracePublished: true },
  readiness: { selectionAndReadBusinessRoutes: true, applicationSchema: 32, oldBodyReferenceMediaPdfPrintDiagnosticRestrictions: true,
    sameVerifiedHandleMediaResponse: true, originalPreviewExplicitReadUi: true, exportBusinessRoutesAndWorkers: false, selectionExportCompleteDraftUi: false,
    formalMigrated: false, pushed: false, deployed: false, wholeGoal: 'active' },
  remaining: ['Real render/cleanup workers, full export business interfaces and verified artifact downloads', 'Original workspace selection/export complete draft, multi-tab/storage-denied/unknown-result UI',
    'All other R5/R6 textbooks/GESP/R7/R8, original72/WS, teachers/devices/new machine/physical printer and real1/3/7/14-day evidence'],
  privateDataPublished: false, files };
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(out, 'README.md'), '# 原卷旧入口、同句柄响应与工作台阅读打印\n\n本批接入学生明确阅读、诊断期间旧正文/参考/媒体/PDF/打印阻断，以及同一已完整校验文件句柄的HTTP响应；本人首答、草稿和原回执保持。沿用原工作台设计。\n\n媒体专项9/0/0；SQLite旧入口13/0/0与另批撤权race1/0/13过滤跳过，实际PG最终14/0/0；既有十二文件186/0/0分别记录。生产浏览器第一轮4/3、第二轮2/1保留，修复后第三轮7/0、等待真实响应的第四轮3/0，不合计成单次结果。\n\n十份准确源码逐SHA归并；主干contracts/API/Web检查通过，正式24/revision187及1063运行文件保持。独占PG和浏览器API/Web已准确停止，无凭据、真实库或私有trace入档。未推送部署，导出worker与完整选题UI及全部原范围继续，整体active。\n', { flag: 'wx' });
console.log(JSON.stringify({ sourceFiles: integration.source.length, archivedFiles: files.length, bytes: files.reduce((n, row) => n + row.bytes, 0), wholeGoal: 'active' }));
