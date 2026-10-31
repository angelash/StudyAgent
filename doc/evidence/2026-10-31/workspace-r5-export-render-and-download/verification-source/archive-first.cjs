const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-export-render-and-download');
const sha = value => crypto.createHash('sha256').update(value).digest('hex'), read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const integration = read('integration-first.json'), main = read('main-check-first.json');
if (fs.existsSync(out) || main.checks.some(row => row.exit !== 0) || !main.allProtectedUnchanged || !read('postgres-stop-first.json').stopped) throw Error('Unused archive and completed verification required');
for (const row of integration.source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Main source changed');
fs.mkdirSync(out, { recursive: true }); const files = [];
function copy(source, relative, compressed = false) {
  if (/private|\.(?:sqlite3?|dump|db|zip|docx)$/.test(relative)) throw Error('Private or large font-embedded artifact refused');
  const raw = fs.readFileSync(source), bytes = compressed ? zlib.gzipSync(raw) : raw, target = path.join(out, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' }); if (sha(fs.readFileSync(target)) !== sha(bytes)) throw Error('Archive readback failed');
  files.push({ path: relative, sha256: sha(bytes), bytes: bytes.length, originalSha256: sha(raw), ...(compressed ? { encoding: 'gzip' } : {}) });
}
for (const row of integration.source) copy(path.join(root, row.path), 'source/' + row.path);
for (const name of fs.readdirSync(__dirname).filter(name => /^(?:types-|build-|render-|learner-|postgres-|regression-|python-|visual-|integration-first|main-check-|preparation-first|main-before-integration)/.test(name) && /\.(json|log|gz)$/.test(name) && !name.includes('private')))
  copy(path.join(__dirname, name), 'reports/' + name + (name.endsWith('.gz') ? '' : '.gz'), !name.endsWith('.gz'));
for (const name of fs.readdirSync(__dirname).filter(name => /\.(?:cjs|py)$/.test(name))) copy(path.join(__dirname, name), 'verification-source/' + name);
const visualRoot = path.join(root, 'data/qa/v175a'), visual = JSON.parse(fs.readFileSync(path.join(visualRoot, 'result.json')));
copy(path.join(visualRoot, 'result.json'), 'reports/independent-visual-first.json');
for (const observation of visual.observations) for (const png of observation.pngs) copy(path.join(visualRoot, png), 'screenshots/' + png.replaceAll('\\', '/'));
const originals = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/w175a/actual-render-files.json')));
for (const file of originals.records[0].files) {
  const actual = path.join(root, 'data/qa/w175a', file.path); if (sha(fs.readFileSync(actual)) !== file.publication.sha256) throw Error('Published artifact changed');
  if (file.format === 'pdf') copy(actual, 'synthetic-published/' + file.book + '.pdf');
}
for (const scope of ['w175a', 'w175b', 'w175c']) copy(path.join(root, 'data/qa', scope, 'actual-render-files.json'), 'reports/' + scope + '-actual-render-files.json');
const batches = Object.fromEntries(['render-first', 'learner-first', 'postgres-first', 'regression-first'].map(name => {
  const report = read(name + '-vitest.json'); return [name, { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests, files: report.testResults.length,
    report: 'reports/' + name + '-vitest.json.gz', sourceUnchanged: read(name + '.json').sourceUnchanged }];
}));
const receipt = { at: new Date().toISOString(), baseline: integration.baseline, source: integration.source,
  scope: '174 actual render worker and published artifact downloads, whole-renderer job containment, exact author/source/lease/current-file fences',
  batches, python: read('python-first.json'), main, postgresShutdown: read('postgres-stop-first.json'), visual, visualInspection: read('visual-inspection-first.json'),
  actualChecks: ['Four real practice/answer PDF/DOCX slots consumed by the actual application worker and published through reserved/rendered/native success fences',
    'Complete source reconstruction and source/media identity checks before writing exact frozen input and PNGs',
    'Every workspace belongs to actual task/generation/token; filesystem leases protect rendering and actual HTTP streaming',
    'Python supervisor puts the entire renderer tree in a Windows job before child resume; parent pipe/kill closes the job',
    'Actual PDF/DOCX and source maps are read back and validated before each slot publication; another slot is not overwritten',
    'Actual full and Range HTTP bytes match the published hash, 416 closes files, and stream completion releases its lease',
    'Current author/source rights checked again after actual artifact hashing; publication or guardian revocation refuses bytes and closes handles',
    'Actual in-flight Office process observed before real cancellation; late output is unpublished and all owned processes have stopped',
    'Real same-size source PNG corruption after queueing prevents publication and registers a native cleanup task',
    'Actual learner answer-book rendering/download preserves original export exposure after guardian revocation',
    'Raw workbench TeX delimiters explicitly refused rather than printed as literal formulas; actual supported native fractions remain visible'],
  setupFailures: [{ phase: 'independent DOCX renderer help', original: 'Initial read-only helper invocation omitted the loaded Python package directory and failed with missing pdf2image. Tool output retained in conversation; independent exact reproduction captured.',
    reproduction: 'reports/render-help-first-failure.json.gz', correction: 'Pass the authoritative bundled PYTHONPATH; renderer help and all actual independent renders exited zero.', noProductSourceChanged: true }],
  validationLimits: { sqliteFourSceneBatchAndSeparateLearnerCaseNotAdded: true, postgresFiveSceneBatchUsesFinalTestSource: true, sourceUnchangedAcrossActualRenderingAndVisualReview: true,
    twoActualPdfPagesAndTwoIndependentDocxPagesOpened: true, independentDocxMathUsesTimesNewRomanWhilePublishedPdfUsesPinnedPrintMath: true,
    physicalWordMobileDeviceTeacherPhysicalPrinterOrLearnerEffectEvidence: false, fullApiOrWholeSiteRerunThisSlice: false, noWebChangesThisSlice: true,
    exactCleanupTaskRegistrationIsNotActualFileCollection: true, largeFontEmbeddedDocxFilesRemainLocalWithHashes: true },
  readiness: { applicationSchema: 32, actualRenderWorker: true, wholeRendererJobContainment: true, publishedArtifactDownloadRoute: true, cleanupTasksRegistered: true, cleanupWorker: false,
    selectionExportCompleteDraftUi: false, formalMigrated: false, pushed: false, deployed: false, wholeGoal: 'active' },
  remaining: ['Exact registered-workspace cleanup worker, active writer/reader leases, unknown-entry retention and actual privacy/cold-restore cleanup',
    'More two-instance/lease-reclaim/render cancellation/source/diagnosis matrices and complete export/native recovery',
    'Original workspace selection/export full draft, multi-tab/storage-denied/unknown-result UI and complete regression',
    'All other R5/R6 textbooks/GESP/R7/R8 and original72/WS/teachers/devices/new machine/physical printer/real1/3/7/14-day evidence'],
  privateDataPublished: false, files };
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(out, 'README.md'), '# 真实导出任务、整体进程保护与产物下载\n\n应用worker实际消费册/格式任务，准确来源/租约、reserved、rendered与原生完成栅栏接通；实际完整/Range下载使用同一已校验文件句柄和当前授权。\n\nSQLite四场景4/0/0和本人答案册另批1/0/4过滤跳过，实际PG最终5/0/0、十六文件226/0/0与Python26/0分列。四个真实发布slot、两份原PDF及两份DOCX独立渲染共四页均打开检查；数学字体差异如实记录，原件SHA保持。\n\n初次只读文档工具缺PYTHONPATH的独立重现保留。十一份源码逐SHA归并，正式24/revision187与1063受保护文件保持，15447 PG停止，未推送部署。文件回收任务已登记，但实际cleanup worker、完整选题UI及全部原范围仍未完成，整体active。\n', { flag: 'wx' });
console.log(JSON.stringify({ sourceFiles: integration.source.length, archivedFiles: files.length, bytes: files.reduce((sum, row) => sum + row.bytes, 0), wholeGoal: 'active' }));
