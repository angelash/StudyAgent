const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { execFileSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const qa = __dirname, root = path.resolve(qa, '../../..'), out = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-export-font-protocol');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const acceptance = JSON.parse(fs.readFileSync(path.join(qa, 'portable-fonts-third-acceptance.json')));
if (!acceptance.noTimesNewRomanOrOpenSymbolFallback || !acceptance.docxOriginalBytesUnchanged || acceptance.applicationExportImplemented || acceptance.physicalPrintVerified) throw Error('Actual bounded font proof required');
if (fs.existsSync(out)) throw Error('Keep any existing evidence archive'); fs.mkdirSync(out, { recursive: true });
const artifacts = [];
function copy(from, relative, compressed = false) {
  const original = fs.readFileSync(from), bytes = compressed ? zlib.gzipSync(original) : original;
  const target = path.resolve(out, relative); if (!target.startsWith(out + path.sep) || fs.existsSync(target)) throw Error('Unique bounded evidence path required');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(target)) !== sha(bytes)) throw Error('Evidence readback failed');
  artifacts.push({ path: relative, bytes: bytes.length, sha256: sha(bytes), originalSha256: sha(original), ...(compressed ? { encoding: 'gzip' } : {}) });
}
for (const file of ['probe-portable-fonts-first.py', 'probe-portable-fonts-second.py', 'inspect-math-fonts-uno-first.py', 'inspect-math-fonts-uno-second.py',
  'render-explicit-math-fonts-third.py', 'verify-portable-fonts-third.py', 'prepare-isolated-export-source-first.cjs', 'archive-font-and-render-protocol-first.cjs']) copy(path.join(qa, file), 'sources/' + file);
for (const file of ['uno-font-query-first-failure.json', 'uno-font-query-second-process.json', 'uno-math-font-query-second.json', 'uno-font-render-third-process.json',
  'uno-math-font-render-third.json', 'portable-fonts-third-acceptance.json', 'pinned-font-origin-first.json']) copy(path.join(qa, file), 'reports/' + file + '.gz', true);
copy(path.join(qa, 'export166-source-preparation-first.json.gz'), 'reports/export166-source-preparation-first.json.gz');
for (const label of ['first', 'second']) {
  copy(path.join(qa, 'portable-font-probe-' + label + '/build.json'), 'reports/font-' + label + '-build.json.gz', true);
  copy(path.join(qa, 'portable-font-probe-' + label + '/render.log'), 'reports/font-' + label + '-render.log.gz', true);
  copy(path.join(qa, 'portable-font-probe-' + label + '/png/portable-fonts.pdf'), 'original-font-failures/' + label + '.pdf');
  copy(path.join(qa, 'portable-font-probe-' + label + '/png/page-1.png'), 'original-font-failures/' + label + '.png');
}
const finalFiles = acceptance.files;
for (const file of finalFiles) {
  const original = path.join(qa, file.path); if (sha(fs.readFileSync(original)) !== file.sha256) throw Error('Accepted font file changed');
  copy(original, 'final/' + path.basename(file.path));
}
for (const file of ['Noto-OFL.txt', 'STIX-OFL.txt']) copy(path.join(root, 'data/tools/paper-export-fonts-first', file), 'licenses/' + file);
const protection = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/workspace-adult-models-first-20261031/adult165-main-protection-third.json')));
for (const file of protection.files) if (sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw Error('Protected main changed');
const db = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true }); let formal;
try { formal = { schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; } finally { db.close(); }
if (JSON.stringify(formal) !== JSON.stringify(protection.formal)) throw Error('Formal metadata changed');
const source = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(qa, 'export166-source-preparation-first.json.gz'))));
const result = {
  at: new Date().toISOString(), baseMain: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: '166 concrete document-rendering protocol and font/dependency feasibility, before business record registration. Real synthetic DOCX/OMML/PDF proof, no API feature claim.',
  fontProof: acceptance, isolatedSource: { path: source.source, files: source.files, bytes: source.bytes, dependencyLinks: source.dependencyLinks.length, workspacePackagesLocal: true, schema: 31, schema32Registered: false },
  failures: ['GitHub release API lookup hit its anonymous rate limit; read-only official release/tag archive used instead.',
    'First guessed master static-OTF path returned404; no binary from that response was used.',
    'Both actual OTF and TTF direct DOCX conversions used Times New Roman/OpenSymbol for formulas despite embedded math fonts; retained as font-policy failures.',
    'First isolated UNO query failed before its remote context was available. Second query with the explicit context and bounded startup completed; third applies per-document formula properties.'],
  knownLimits: ['Actual Windows/LibreOffice build only; Linux, Microsoft Word and physical print remain unverified.',
    'This is a single synthetic equation/font proof, not all source formulas or completed export layout.',
    'Standalone source font binaries, old source ZIPs and original DOCX variants remain in ignored local tools/QA. Final exact DOCX/PDF/PNG are archived.'],
  formalReadOnly: formal, protectedMainFiles: protection.files.length, allProtectedBytesUnchanged: true,
  applicationExportImplemented: false, native32Registered: false, studentLearningFactsCreated: false, humanReviewCompleted: false, wholeGoal: 'active',
  artifacts,
};
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(out, 'README.md'), '# 导出文档具体协议与字体验证\n\n166先冻结文档层协议，后续完整清单/导出记录、接口、权限与删除恢复关系仍须补齐后才注册32。\n\n实际两套OFL字体的派生名称及完整字体嵌入DOCX；最终经独立profile/本地pipe的Office实例只修改当前加载文档的公式字体，源DOCX字节保持。实际最终PDF只有StudyAgent Print Serif/Math两套字体，三处分式、上标、根号和中文已打开PNG检查。\n\n原OTF/TTF直接转换都触发默认公式字体，未称为通过；首UNO查询失败也另存。未安装系统字体。data/qa/p166复制3289文件、约99MB，并使用自己的contracts/config，287个共享依赖junction保留且不能递归删除；仍是31基线，不含已注册32业务。\n\n最终实际DOCX/PDF/PNG见final。源字体原件/下载归档和旧DOCX留在本地QA/tools，licenses保留原OFL。全公式、所有题型、跨环境/实体打印、工作台应用与全部原目标仍未完成。\n', { flag: 'wx' });
for (const file of artifacts) if (sha(fs.readFileSync(path.join(out, file.path))) !== file.sha256) throw Error('Final evidence changed');
console.log(JSON.stringify({ archive: out, artifacts: artifacts.length, finalPdfFonts: acceptance.actualEmbeddedPdfFonts, isolatedFiles: source.files, native32Registered: false }));
