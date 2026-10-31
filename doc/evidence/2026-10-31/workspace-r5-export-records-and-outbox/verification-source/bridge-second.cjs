require('node:module').createRequire('F:/workspace/github/StudyAgent/data/qa/p170/package.json')('tsx/cjs');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p170'), output = path.join(root, 'data/qa/g170');
const lib = path.join(candidate, 'apps/api/src/modules/library'), { fixture } = require(path.join(lib, 'paper-export-fixture.spec.ts'));
const { preparePaperExport, paperExportDocumentBytes, PAPER_EXPORT_TASK_KIND, assertPaperExportSourceMap } = require(path.join(lib, 'paper-export-record.ts'));
const { reservePaperExportFile, recordPaperExportRendered, publishPaperExportFile } = require(path.join(lib, 'paper-export-file-record.ts'));
const { assertPaperExportNativeRows } = require(path.join(lib, 'paper-export-native.ts'));
const { retentionDigest } = require(path.join(candidate, 'apps/api/src/modules/diagnostics/retention-anchor.ts'));
const { TaskRepository } = require(path.join(candidate, 'apps/api/src/infrastructure/task-repository.ts'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(output); const db = new DatabaseSync(path.join(output, 'queue.sqlite3')), queue = new TaskRepository(db);
const template = fixture(false, true); template.document.title = template.input.title = '合成导出记录与实际产物核对';
template.document.items[0].promptHtml = '<p>QORIGINAL7：先读这道题，再写出两步理由。</p>';
template.document.items[1].promptHtml = '<p>QORIGINAL3：核对保留原卷题位和题单顺序。</p>';
template.document.items[0].reference.answerHtml = '<p>ANSKEY：这里只是合成参考，不构成学习事实。</p>';
const exported = preparePaperExport({ actorId: template.actorId, authorization: template.auth, input: template.input, list: template.selection.list,
  document: template.document, media: [], at: new Date().toISOString() });
let rows = template.rows.filter(row => !['paperExports', 'paperExportCommands'].includes(row.collection));
rows.push({ collection: 'paperExports', body: exported.record }, { collection: 'paperExportCommands', body: exported.command });
const tasks = () => db.prepare('SELECT * FROM durable_tasks').all(), history = () => db.prepare('SELECT * FROM durable_task_history').all();
const replace = (collection, body) => { rows = rows.filter(row => row.collection !== collection || row.body.id !== body.id); rows.push({ collection, body }); };
async function fenced(fence) {
  db.exec('BEGIN IMMEDIATE'); try { await queue.applyFence(fence); assertPaperExportNativeRows(rows, tasks(), history()); db.exec('COMMIT'); }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
(async () => {
  await queue.open(); db.exec('BEGIN IMMEDIATE'); await queue.insert(exported.tasks); assertPaperExportNativeRows(rows, tasks(), history()); db.exec('COMMIT');
  const task = await queue.claim([PAPER_EXPORT_TASK_KIND], 300000), reserved = reservePaperExportFile(exported.record, task, new Date().toISOString());
  rows.push({ collection: 'paperExportFiles', body: reserved.file }); await fenced(reserved.fence);
  // Only now, after the persisted registration checkpoint, perform any workspace IO.
  const workspace = path.join(output, reserved.file.workspace); fs.mkdirSync(workspace, { recursive: true });
  const raw = paperExportDocumentBytes(exported.record.intent.document), input = path.join(workspace, 'input.json'); fs.writeFileSync(input, raw, { flag: 'wx' });
  if (sha(raw) !== exported.record.intent.documentSha256) throw Error('Renderer bytes changed');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/er2/installation.json'), 'utf8').replace(/^\ufeff/, ''));
  const env = {}; for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'PROGRAMFILES']) if (process.env[key]) env[key] = process.env[key];
  const execution = spawnSync(config.python, ['-E', '-s', '-B', '-X', 'utf8', path.join(candidate, 'scripts/processing/paper_export_document.py'), '--workspace', workspace,
    '--input', input, '--input-sha256', sha(raw), '--font-root', config.fontRoot, '--uno-python', config.unoPython, '--soffice', config.soffice, '--book', 'practice'],
    { cwd: workspace, env, windowsHide: true, encoding: 'utf8', timeout: 220000, maxBuffer: 2 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, 'execution-first.json'), JSON.stringify({ exit: execution.status, error: execution.error?.message ?? null, stdout: execution.stdout, stderr: execution.stderr }, null, 2));
  if (execution.status !== 0) throw Error('Real renderer failed; original result retained');
  const report = JSON.parse(fs.readFileSync(path.join(workspace, 'artifacts-practice/result.json'), 'utf8'));
  if (report.protocol !== 'paper-export-render-result-v1' || report.inputSha256 !== sha(raw) || report.files.length !== 2 || sha(fs.readFileSync(input)) !== sha(raw)) throw Error('Changed renderer receipt');
  for (const file of report.files) {
    if (file.path !== `artifacts-practice/practice.${file.format}` || !['docx', 'pdf'].includes(file.format) || file.book !== 'practice') throw Error('Unexpected output');
    const bytes = fs.readFileSync(path.join(workspace, file.path)); if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw Error('Output readback failed');
    assertPaperExportSourceMap(exported.record.intent.document, file.sourceMap, file.pageCount);
  }
  const pdf = report.files.find(file => file.format === 'pdf'), outputDescriptor = { book: pdf.book, format: pdf.format, sha256: pdf.sha256, bytes: pdf.bytes, pageCount: pdf.pageCount, sourceMapHash: retentionDigest(pdf.sourceMap) };
  const rendered = recordPaperExportRendered(exported.record, reserved.file, await queue.get(task.id), outputDescriptor, pdf.sourceMap, new Date().toISOString());
  replace('paperExportFiles', rendered.file); await fenced(rendered.fence);
  const published = publishPaperExportFile(exported.record, rendered.file, await queue.get(task.id), pdf.sourceMap, new Date().toISOString());
  replace('paperExportFiles', published.file); replace('paperExports', published.record); await fenced(published.fence);
  fs.writeFileSync(path.join(output, 'native-final.json'), JSON.stringify({ rows, tasks: tasks(), history: history() }, null, 2));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ protocol: 'paper-export-record-generator-bridge-qa-v1', inputSha256: sha(raw), workspace: path.relative(root, workspace),
    files: report.files, publication: published.record.slots[0].published, checked: ['raw input byte sha', 'both real file readbacks', 'source map', 'reserved before IO', 'rendered checkpoint', 'actual completion fence', 'native final relations'],
    limitations: ['direct isolated harness, not application HTTP worker', 'QA queue only; schema32 not registered', 'only PDF slot published; generated DOCX remains temporary', 'private authorization and actual deletion service still pending'] }, null, 2));
  console.log(JSON.stringify({ passed: true, files: report.files.map(file => ({ format: file.format, pages: file.pageCount, bytes: file.bytes })), nativeQueueState: (await queue.get(task.id)).state }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.close());
