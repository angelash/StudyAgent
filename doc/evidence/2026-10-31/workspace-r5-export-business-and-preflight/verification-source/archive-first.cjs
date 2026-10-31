const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-export-business-and-preflight');
const sha = value => crypto.createHash('sha256').update(value).digest('hex'), read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const integration = read('integration-first.json'), main = read('main-check-second.json');
if (fs.existsSync(out) || main.checks.some(row => row.exit !== 0) || !main.protectedRuntimeAndConfigurationUnchanged || main.unchangedProtectedFiles !== 1062 || main.intentionalSourceDependencyChanges.length !== 1 || !read('postgres-stop-first.json').stopped) throw Error('Unused archive and completed validation required');
for (const row of integration.source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Main source changed');
fs.mkdirSync(out, { recursive: true }); const files = [];
function copy(source, relative, compressed = false) {
  if (/private|\.(?:sqlite3?|dump|db|zip)$/.test(relative)) throw Error('Private artifact refused');
  const raw = fs.readFileSync(source), bytes = compressed ? zlib.gzipSync(raw) : raw, target = path.join(out, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' }); if (sha(fs.readFileSync(target)) !== sha(bytes)) throw Error('Archive readback failed');
  files.push({ path: relative, sha256: sha(bytes), bytes: bytes.length, originalSha256: sha(raw), ...(compressed ? { encoding: 'gzip' } : {}) });
}
for (const row of integration.source) copy(path.join(root, row.path), 'source/' + row.path);
for (const name of fs.readdirSync(__dirname).filter(name => /^(?:types-|build-|business-|postgres-|regression-|python-|reproduce-|integration-first|main-check-|preparation-first|main-before-integration)/.test(name) && /\.(json|log|gz)$/.test(name) && !name.includes('private')))
  copy(path.join(__dirname, name), 'reports/' + name + (name.endsWith('.gz') ? '' : '.gz'), !name.endsWith('.gz'));
for (const name of fs.readdirSync(__dirname).filter(name => /\.cjs$/.test(name))) copy(path.join(__dirname, name), 'verification-source/' + name);
const batches = Object.fromEntries(['business-first', 'business-second', 'business-third', 'business-fourth', 'postgres-first', 'postgres-second', 'postgres-third', 'regression-first'].map(name => {
  const report = read(name + '-vitest.json'); return [name, { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests, files: report.testResults.length,
    report: 'reports/' + name + '-vitest.json.gz', sourceUnchanged: read(name + '.json').sourceUnchanged }];
}));
const receipt = { at: new Date().toISOString(), baseline: integration.baseline, source: integration.source,
  scope: '174 first slice: actual per-book memory preflight, exact export originals, native create/control/exposure queue transactions and private safe directory views',
  batches, python: read('python-first.json'), main, postgresShutdown: read('postgres-stop-first.json'),
  actualChecks: ['Actual archive bytes/qualified original positions reconstruct complete prompt/options/references and preserve exact old list revision',
    'Image adapter changes only image URL attributes and keeps unsupported original markup/attributes for the real parser to refuse',
    'Complete handle-verified PNG SHA/bytes/dimensions; unsupported reference image remains original and only its book is refused',
    'Actual Python/MathML/font/PNG per-book parser takes bounded stdin without creating a preflight workspace or starting Office',
    'Read-only preflight retains native business revision, exposure, queue and data-directory entries',
    'Full create command, immutable receipt, all four slots and accurate learner export exposures commit in one native transaction',
    'Different authors, arbitrary client document fields, stale list fingerprints and same-key different full commands refused',
    'Real cancellation/retry uses exact slot/version/generation; concurrent loser rolls back its command',
    'Actual publication/guardian revocation after Python preflight is rejected without export facts',
    'Diagnosis retains original-result recovery/cancel while blocking new preflight/create/retry',
    'Cold application reopen retains original receipts, frozen intent and actual native queued tasks',
    'Absent explicit tool configuration gives bounded unavailable response without business writes'],
  originalFailures: [
    { batch: 'business-first', actual: '6 passed/12 failed. Memory parser keyword was shadowed by an integer media-byte counter; complete record creation also rejected media IDs computed from extra descriptor fields.', originalReportAndExactSourcePreserved: true },
    { batch: 'reproduce-first', actual: 'Direct Python reproducer captured AttributeError on actual PNG. The source adapter alone did not reach the complete record check, so sourceFailure was null.', originalRetained: true },
    { batch: 'reproduce-second', actual: 'Direct preparePaperExport and actual parser separately reproduced paper_export_original_record_changed and AttributeError before fixes.', originalRetained: true },
    { batch: 'business-second', actual: '18 passed/0 failed after both application fixes.' },
    { batch: 'postgres-first', actual: '13 passed/1 failed. Test directory observation expected a SQLite-created local source directory; PostgreSQL does not create that directory. Added explicit fixture mkdir; business source was unchanged.' },
    { batch: 'business-third/postgres-second', actual: '19/0/0 and15/0/0 respectively after explicit fixture directory and an absent-tool scenario.' },
    { batch: 'business-fourth/postgres-third', actual: '19/0/0 and15/0/0 respectively on final sources: explicit test installation path, portable conditional test setup and safe directory without unimplemented download URL.' },
    { batch: 'main-check-first', actual: 'Protection gate refused the intentional package-lock direct dependency declaration. Original exact script, empty compiler logs and mismatch report preserved. Second check requires only this exact new htmlparser2 declaration, unchanged API package fields and byte-equivalent resolved dependency records; other 1062 protected files unchanged.' }
  ],
  validationLimits: { overlappingBatchesNotAdded: true, regression207WasBeforeFinalDirectoryUrlOmission: true, finalScopedBusinessAndPostgresUseFinalApplicationSources: true,
    apiBuildThirdActual: true, mainTypeChecksOnlyDoNotReplaceFormalBuild: true, fullApiOrWholeSiteRerunThisSlice: false, noWebChangesThisSlice: true,
    realRendererWorkerOrArtifactDownloadTestThisSlice: false, realDeviceTeacherPhysicalPrinterOrLearnerEvidence: false },
  readiness: { applicationSchema: 32, completeExportBusinessCommands: true, realReadOnlyPerBookPreflight: true, actualNativeQueuedTasks: true, renderCleanupWorkers: false,
    publishedArtifactDownloadRoute: false, selectionExportCompleteDraftUi: false, formalMigrated: false, pushed: false, deployed: false, wholeGoal: 'active' },
  remaining: ['Real render worker with lease/current author/source checks and actual two-format output before native publication', 'Same verified handle published artifact reads and exact workspace cleanup worker',
    'Original workspace selection/export full draft, multi-tab/storage-denied/unknown-result UI', 'All remaining R5/R6 textbooks/GESP/R7/R8 and original72/WS/teachers/devices/new machine/physical printer/real1/3/7/14-day evidence'],
  privateDataPublished: false, files };
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(out, 'README.md'), '# 导出业务与实际逐册内存预检\n\n准确旧清单重建完整文档/PNG，实际Python解析器分别预检练习/答案册；预检不创建工作区、不启动Office、不保存曝光或导出。完整create/control、原回执、学生曝光与真实原生任务已接入。\n\nSQLite首轮6/12保留，修复后18/0及最终19/0；PG原13/1的测试目录准备问题保留，最终15/0。十四文件207/0既有回归与Python25/0分列，不合计；最终主干contracts/API/Web检查、正式24/revision187及1062受保护文件保持。锁文件仅新增已存在htmlparser2 12.0.0的直接依赖声明，所有实际依赖解析条目不变，未安装依赖；初次保护拒绝保留。\n\n本批只创建真实持久任务，尚未接消费它们的render/cleanup worker、产物下载及完整工作台选题UI。独占15446测试PG已停止，凭据与真实数据未入档，未推送部署，全部原目标继续active。\n', { flag: 'wx' });
console.log(JSON.stringify({ sourceFiles: integration.source.length, archivedFiles: files.length, bytes: files.reduce((sum, row) => sum + row.bytes, 0), wholeGoal: 'active' }));
