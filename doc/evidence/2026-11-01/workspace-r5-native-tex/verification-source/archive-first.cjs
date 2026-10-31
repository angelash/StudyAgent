const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../../..'), archive = path.join(root, 'doc/evidence/2026-11-01/workspace-r5-native-tex'), read = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/^\ufeff/, '')), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const integration = read('integration-first.json'), main = read('main-check-second.json'), visual = read('visual-review-final.json');
if (fs.existsSync(archive) || main.checks.some(row => row.exit !== 0) || !main.allOtherProtectedRuntimeBuildsConfigsAndDependenciesUnchanged || visual.reviewedPages !== 6 || !read('postgres-stop-first.json').stopped) throw Error('Unused archive and final checked source required');
for (const row of integration.source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Final source changed');
fs.mkdirSync(archive, { recursive: true }); const files = [];
function copy(from, name, compressed = false) {
  if (/private|\.(?:sqlite3?|db|dump|docx|webm|zip)$/.test(name)) throw Error('Private/large runtime artifact refused');
  const original = fs.readFileSync(from), bytes = compressed ? zlib.gzipSync(original) : original, to = path.join(archive, name);
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(to)) !== sha(bytes)) throw Error('Archive readback mismatch'); files.push({ path: name, bytes: bytes.length, sha256: sha(bytes), originalSha256: sha(original) });
}
function add(bytes, name) { const temp = path.join(__dirname, 'archive-' + name.replaceAll('/', '-')); fs.writeFileSync(temp, bytes, { flag: 'wx' }); copy(temp, name); }
for (const row of integration.source) copy(path.join(root, row.path), 'source/' + row.path);
for (const file of fs.readdirSync(__dirname).filter(name => !/private|^archive-/.test(name) && /\.(?:json|log|gz)$/.test(name))) copy(path.join(__dirname, file), 'reports/' + file + (file.endsWith('.gz') ? '' : '.gz'), !file.endsWith('.gz'));
for (const file of fs.readdirSync(__dirname).filter(name => /\.(?:cjs|py)$/.test(name))) copy(path.join(__dirname, file), 'verification-source/' + file);
for (const file of fs.readdirSync(path.join(__dirname, 'native-xml'))) copy(path.join(__dirname, 'native-xml', file), 'native-xml/' + file);
function pictures(directory, prefix) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name); if (entry.isSymbolicLink()) throw Error('Linked visual evidence refused');
    if (entry.isDirectory()) pictures(file, prefix + '/' + entry.name);
    else if (/\.(?:png|json)$/.test(entry.name)) copy(file, prefix + '/' + entry.name);
  }
}
pictures(path.join(root, 'data/qa/v180t2'), 'visual-original'); pictures(path.join(root, 'data/qa/v180t4'), 'visual-final');
for (const [phase, directory] of [['first', 'w180t1'], ['final', 'w180t2']]) {
  for (const book of ['practice', 'answers']) copy(path.join(root, 'data/qa', directory, 'downloaded', book + '.pdf'), 'pdf/' + phase + '-' + book + '.pdf');
  copy(path.join(root, 'data/qa', directory, 'tex-product-receipt.json'), 'product/' + phase + '-sqlite.json');
}
copy(path.join(root, 'data/qa/w180pg2/tex-product-receipt.json'), 'product/final-postgres.json');
const { paperExportDocumentBytes } = require(path.join(root, 'data/qa/p180/apps/api/dist/apps/api/src/modules/library/paper-export-record.js'));
const frozen = [];
for (const [phase, directory] of [['first', 'w180t1'], ['final', 'w180t2'], ['legacy', 'w180old']]) {
  const db = new DatabaseSync(path.join(root, 'data/qa', directory, 'study-agent.sqlite3'), { readOnly: true });
  const rows = db.prepare("SELECT body FROM domain_records WHERE collection='paperExports'").all(); db.close();
  if (rows.length !== 1) throw Error('Expected one actual synthetic export'); const record = JSON.parse(rows[0].body), bytes = paperExportDocumentBytes(record.intent.document);
  if (sha(bytes) !== record.intent.documentSha256) throw Error('Frozen original digest differs');
  const name = 'inputs/' + phase + '-input.json.gz'; add(zlib.gzipSync(bytes), name); frozen.push({ phase, inputSha256: sha(bytes), path: name, noActorOrCommandCredentialsIncluded: true });
}
const batches = Object.fromEntries(['tex-unit-first', 'tex-unit-second', 'regression-first', 'product-first', 'product-second', 'postgres-first', 'postgres-second'].map(name => { const r = read(name + '-vitest.json'); return [name, { passed: r.numPassedTests, failed: r.numFailedTests, skipped: r.numPendingTests, sourceUnchanged: read(name + '.json').sourceUnchanged }]; }));
const receipt = { at: new Date().toISOString(), scope: '178 source-preserving KaTeX to frozen native Word math; separate display paragraphs; exact old-book compatibility', baseline: integration.baseline, source: integration.source, main, batches, countsAreSeparateAndOverlappingBatchesNotSummed: true,
  finalEvidence: { sqlite: 'product-second', postgres: 'postgres-second', python: { batch: 'python-third', passed: 33, failed: 0 }, types: 'types-final', productionPages: { practice: 2, answers: 1 }, canonicalDocxPages: { practice: 2, answers: 1 }, allSixFinalPngsActuallyOpened: true, originalResolvedGraphUnchanged: true },
  originalDefectsAndFailures: ['Actual production parser rejected all three original TeX delimiters before the adapter', 'First unit batch had one invalid KaTeX fixture; the original failing report remains and valid escaped-brace coverage was corrected', 'First visual count probe expected five fractions but the actual four were correct; no source/output changed for that repair', 'First successful SQLite/PG jobs had a real visual defect: oMathPara centered surrounding prose/labels; final renderer separates equation paragraphs, preserves emphasis/list indentation and trims empty continuations', 'Third visual coordinate probe used a word prefix but PDF extraction joined the marker after a fullwidth colon; contained unique-marker lookup retained the same line-position and left-edge assertions', 'First main protection guard refused the intentional package-lock source edit; exact JSON proof permits only the API declaration of already resolved katex@0.19.0, preserving all other protected bytes'],
  compatibility: { actualOldGeneratedBook: 'reports/legacy-baseline-first.json.gz', actualNewReaderExactDownload: 'reports/legacy-upgrade-first.json.gz', allOldNativeRowsRevisionIntentCommandAndResultUnchanged: true, frozen },
  retention: { actualDocxFilesRetainedInLocalQa: true, originalDocxAndPartHashes: 'reports/native-files-first.json.gz', nativeWordXmlArchived: true, largeEmbeddedFontDocxNotCommitted: true, noDatabaseCredentialsOrPrivateTracesPublished: true },
  limits: { full17TypesOrOtherWrongQuestionSources: false, matricesOrAllTexMarkup: false, cjkFormulaFontPath: false, nativeMicrosoftWordPhysicalPrinterTeacherOrNewMachine: false, wholeApiOrWholeSiteThisSlice: false, regression91PrecedesDisplayParagraphRepair: true, canonicalDefaultFormulaFontsAreNotProductionFontProof: true, original72AndWsStatusesNotRaised: true, formalSchema: 24, formalRevision: 187, applicationSchema: 32, pushed: false, deployed: false, wholeGoal: 'active' }, files };
fs.writeFileSync(path.join(archive, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(archive, 'README.md'), '# 原卷TeX与原生公式\n\n实际来源在冻结输入前复用KaTeX0.19.0，普通文本三类公式分隔符转MathML/Word原生公式，非公式字节与原件保持。原题、选项、答案和解析逐字段/逐册处理；复杂结构明确拒绝。旧版实际生成的含未使用TeX参考的练习册由新版冷开、原命令恢复并逐SHA下载，所有原生记录保持。\n\n最终SQLite2/0/0、实际PG2/0/0与Python33/0分别通过。早先91项回归先于块公式段落修正，最终实际生成覆盖修正后的渲染器。独立Poppler/规范DOCX渲染均为练习2页、答案1页；全部六张最终PNG实际打开。原缺陷、视觉居中、无效测试样本、计数/分词与保护拦截均保持。\n\n大型原DOCX保留在本机QA并逐摘要核对；Git保存原生XML、完整分包清单、PDF、PNG与源码/报告。正式24/revision187保持，1062份保护文件不变；锁文件仅新增API对已有KaTeX的声明，全部依赖解析不变，没有安装、推送或部署。全题型、其他来源、教材/GESP及全部原目标继续active。\n', { flag: 'wx' });
console.log(JSON.stringify({ sourceFiles: integration.source.length, files: files.length, bytes: files.reduce((sum, row) => sum + row.bytes, 0), wholeGoal: 'active' }));
