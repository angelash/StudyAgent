const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const qa = __dirname, root = path.resolve(qa, '../../..'), out = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-export-preparation');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const read = file => JSON.parse(fs.readFileSync(path.join(qa, file), 'utf8').replace(/^\uFEFF/, ''));
const acceptance = read('render-probe-second-acceptance.json'), office = read('libreoffice-version-first.json'), installer = read('libreoffice-download-first.json'), poppler = read('poppler-preparation-first.json');
if (!acceptance.layoutAcceptedForThisProbe || acceptance.pages !== 4 || acceptance.actualApplicationExportImplemented || acceptance.physicalPrintVerified || installer.SignatureStatus !== 'Valid') throw Error('Actual bounded preparation evidence required');
for (const file of acceptance.files) if (sha(fs.readFileSync(path.join(qa, file.path))) !== file.sha256) throw Error('Accepted probe changed');
if (fs.existsSync(out)) throw Error('Preserve any existing preparation archive');
fs.mkdirSync(out, { recursive: true });
const artifacts = [];
function save(file) {
  const original = fs.readFileSync(path.join(qa, file));
  const bytes = file.endsWith('.log') ? zlib.gzipSync(original) : original;
  const relative = file + (file.endsWith('.log') ? '.gz' : ''), target = path.resolve(out, relative);
  if (!target.startsWith(out + path.sep) || fs.existsSync(target)) throw Error('Unique bounded evidence path required');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(target)) !== sha(bytes)) throw Error('Artifact readback failed');
  artifacts.push({ path: relative, bytes: bytes.length, sha256: sha(bytes), originalSha256: sha(original) });
}
for (const file of fs.readdirSync(qa).filter(name => /\.(?:json|py|cjs)$/.test(name)).sort()) save(file);
for (const name of ['render-probe-first', 'render-probe-second']) {
  for (const file of ['synthetic-paper.docx', 'synthetic-equal-squares.png', 'build.json', 'render.log',
    'png/synthetic-paper.pdf', 'png/page-1.png', 'png/page-2.png', 'png/page-3.png', 'png/page-4.png']) save(name + '/' + file);
}
const helper = 'C:/Users/Lenovo/AppData/Roaming/xiaojiu-ai/profiles/production-profile-v1-8b56a2c7820e132288bd137250466b099804897ae6e38431b9df9c5809eabdfd/codex-home/skills/documents/render_docx.py';
const receipt = {
  at: new Date().toISOString(), baseMain: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: '166 implementation preparation. Actual synthetic DOCX->PDF->PNG tool chain, not the application selection/export feature.',
  office: { version: office.Version, officialInstallerSha256: installer.SHA256, signature: installer.SignatureStatus,
    signer: installer.Signer, method: 'Project-local administrative image, isolated profile; no formal application runtime path changed.' },
  poppler: { source: poppler.Source, archiveSha256: poppler.SHA256 },
  canonicalHelper: { source: 'Integrated documents skill render_docx.py', sha256: sha(fs.readFileSync(helper)) },
  final: { pages: 4, completeRows: 32, nativeFractions: 2, figureAndCaptionWithPrompt: true, repeatedTableHeader: true,
    separateAnswerPage: 4, allPagesVisuallyInspected: true, a4: true, originalDocxUnchangedByRendering: true },
  firstFailure: 'First real render split the third prompt and its figure across pages; the built-in title added an unwanted rule. Original first DOCX/PDF/PNGs and source remain separate.',
  verifierFailures: 'Two exact phrase checks incorrectly read unsorted PDF content streams. The final position-sorted reader retains all original assertions and reads the unchanged second document in visual order.',
  applicationImplemented: false, durableExportTasksImplemented: false, studentDataChanged: false, crossEnvironmentVerified: false,
  fontRedistributionReviewed: false, physicalPrintVerified: false, teacherReviewCompleted: false, wholeGoal: 'active',
  localOnly: ['Official MSI and extracted LibreOffice tree', 'Poppler release ZIP and native tree', 'Verbose MSI extraction log', 'Temporary isolated LibreOffice profiles'],
  remaining: ['Freeze exact production renderer/font dependencies and protocol', 'Seal actual final schema31 reader before any schema32 native records',
    'Persistent selection/export commands and worker/file lifecycle', 'Original preview/media/student exposure boundaries', 'Workbench UI and complete draft recovery',
    'SQLite/real PG/native file recovery and matching application regression', 'Other native question sources, real devices, teachers and physical print'],
  artifacts,
};
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(out, 'README.md'), '# 纸面导出工具准备\n\n本目录只记录166规格实施前的真实合成工具样本。应用的跨卷清单、持久导出任务、学生授权与曝光、工作台预览尚未实现。\n\n固定下载并核对官方签名/SHA的LibreOffice及独立Poppler，使用集成documents技能的真实render_docx.py完成DOCX→PDF→四页PNG。最终32行表格/续表头、两个原生分式、同页题干配图/来源、独立答案页和A4几何通过结构/文字/逐页视觉检查。\n\n首轮图与题干分离、默认标题横线及两次错误的PDF内容流顺序检查均另存；最终验证采用位置排序，不删改原断言。第二份DOCX/PDF原字节保持。\n\n本机字体、工具链能跑通不代表跨环境生产部署、全部题型/公式、内容审核或实体打印完成。原生二进制和安装日志留在忽略提交的本地工具/QA目录，源、样本、页面和摘要见receipt.json。全目标继续active。\n', { flag: 'wx' });
for (const file of artifacts) if (sha(fs.readFileSync(path.join(out, file.path))) !== file.sha256) throw Error('Final preparation artifact readback failed');
console.log(JSON.stringify({ archive: out, artifacts: artifacts.length, pages: 4, applicationImplemented: false, physicalPrint: false }));
