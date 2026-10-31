const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-export-records-and-outbox');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
if (fs.existsSync(out)) throw Error('New evidence directory required');
const integration = read(path.join(__dirname, 'integration-first.json')), main = read(path.join(__dirname, 'main-check-first.json')),
  scoped = read(path.join(__dirname, 'queue-third-vitest.json')), privacy = read(path.join(__dirname, 'regression-first-vitest.json')),
  bridge = read(path.join(root, 'data/qa/g170b/result.json')), canonical = read(path.join(root, 'data/qa/c170b/result.json')),
  visual = read(path.join(__dirname, 'visual-final.json'));
if (main.checks.some(row => row.exit) || scoped.numPassedTests !== 113 || scoped.numFailedTests || scoped.numPendingTests || privacy.numPassedTests !== 6 || privacy.numFailedTests ||
    !visual.allPagesReadable || visual.finalProductionPagesOpened !== 1 || visual.finalIndependentDocxPagesOpened !== 1 || !canonical.originalDocxUnchanged) throw Error('Exact final evidence required');
for (const row of integration.source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Main source changed after validation');
const workspace = path.join(root, bridge.workspace), processReport = read(path.join(workspace, 'artifacts-practice/o-process.json'));
if (processReport.processTree.after.activeProcesses !== 0) throw Error('Office process tree is not closed');
fs.mkdirSync(out, { recursive: true }); const files = [];
function copy(source, relative, gzip = false) {
  const raw = fs.readFileSync(source), bytes = gzip ? zlib.gzipSync(raw) : raw, destination = path.join(out, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== sha(bytes)) throw Error('Evidence readback failed');
  files.push({ path: relative, bytes: bytes.length, sha256: sha(bytes), originalSha256: sha(raw), ...(gzip ? { encoding: 'gzip' } : {}) });
}
for (const row of integration.source) copy(path.join(root, row.path), 'source/' + row.path);
for (const filename of fs.readdirSync(__dirname).filter(filename => /^(types-(first|second|third|fourth)|queue-(first|second|third)|regression-first|main-check-first|integration-first|render-first-failure|visual-final)/.test(filename) && /\.(json|log|gz)$/.test(filename)))
  copy(path.join(__dirname, filename), 'reports/' + filename + (filename.endsWith('.gz') ? '' : '.gz'), !filename.endsWith('.gz'));
for (const filename of fs.readdirSync(__dirname).filter(filename => /\.(cjs|py)$/.test(filename))) copy(path.join(__dirname, filename), 'verification-source/' + filename);
copy(path.join(__dirname, 'bridge-first-bootstrap.log'), 'original-failures/bridge-first-bootstrap.log.gz', true);
copy(path.join(root, 'data/qa/g170/result.json'), 'reports/earlier-queue-only-bridge.json.gz', true);
copy(path.join(root, 'data/qa/c170/production-pdf-execution.json'), 'original-failures/first-production-render.json');
copy(path.join(root, 'data/qa/c170/independent-docx-execution.json'), 'original-failures/first-independent-render.json');
copy(path.join(root, 'data/qa/c170/review-second.json'), 'reports/first-files-extraction-recheck.json');
const firstBridge = read(path.join(root, 'data/qa/g170/result.json'));
copy(path.join(root, firstBridge.workspace, 'artifacts-practice/practice.pdf'), 'original-failures/first-extraction-source.pdf');
copy(path.join(root, 'data/qa/c170/production.png'), 'original-failures/first-extraction-source.png');
for (const file of bridge.files) {
  if (sha(fs.readFileSync(path.join(workspace, file.path))) !== file.sha256) throw Error('Real final output changed');
  copy(path.join(workspace, file.path), 'final/practice.' + file.format);
}
copy(path.join(workspace, 'input.json'), 'inputs/renderer-input.json.gz', true);
copy(path.join(workspace, 'artifacts-practice/result.json'), 'final/renderer-result.json');
copy(path.join(workspace, 'artifacts-practice/o-process.json'), 'reports/actual-office-process.json.gz', true);
copy(path.join(root, 'data/qa/g170b/execution-first.json'), 'reports/actual-generator-execution.json.gz', true);
copy(path.join(root, 'data/qa/g170b/result.json'), 'reports/final-sql-generator-bridge.json');
copy(path.join(root, 'data/qa/g170b/native-final.json'), 'reports/final-qa-sql-records-tasks-history.json.gz', true);
copy(path.join(root, 'data/qa/c170b/result.json'), 'reports/final-canonical-render.json');
copy(path.join(root, 'data/qa/c170b/production.png'), 'final/production-page-1.png');
copy(path.join(root, 'data/qa/c170b/canonical/page-1.png'), 'canonical-review/page-1.png');
copy(path.join(root, 'data/qa/c170b/canonical/practice.pdf'), 'canonical-review/practice.pdf');
const receipt = {
  at: new Date().toISOString(), baseline: '862f2d8f7aa55904b26747ed90b2512ec735f1be', scope: 'R5 immutable export records, real outbox controls/checkpoints and strict native relations before application registration',
  source: integration.source, scopedTests: { passed: 113, failed: 0, skipped: 0, newRecordAndSqlQueueTests: 65, existingSelectionSourceQueueTests: 48 },
  earlierBatches: [{ name: 'queue-first', passed: 111, failed: 0 }, { name: 'queue-second', passed: 111, failed: 0 }],
  existingPrivacyHttpAndLatestLedgerRecovery: { passed: 6, failed: 0, skipped: 0, testsNewExportDeletionService: false },
  candidateTypes: { contracts: 0, config: 0, apiNoEmit: 0, apiBuild: 0 }, mainNoEmit: main.checks,
  actualFinalBridge: { qaSqlProtocolTable: true, registeredApplicationSchema: false, inputSha256: bridge.inputSha256, files: bridge.files, publishedPdfSlots: 1,
    reservedAndRenderedPersistedBeforeCompletion: true, actualCompletionFence: true, originalDocxUnchanged: true, officeChildProcessesAfter: 0,
    productionPagesOpened: 1, independentDocxPagesOpened: 1, allPagesReadable: true, sourceOrder: [7, 3], answersSeparated: true },
  originalFailures: ['initial interactive TypeScript narrowing errors; full first interactive stream not separately saved; exact subsequent reproduction/source retained',
    'types-first API narrowing errors, complete captured log and source', 'types-third test union access error, complete captured log and source',
    'bridge-first absolute package subpath could not resolve tsx/cjs; raw repeat captured before any artifacts existed',
    'render-bridge-first post-render assertion required 第4页 while extraction returned 第4 页; both renders themselves exited zero; unchanged original files rechecked'],
  mainProtection: main, schema32Registered: false, PAPER_EXPORT_NATIVE_READY: false, applicationRoutesEnabled: false, pushed: false, deployed: false, goal: 'active',
  remaining: ['six-collection Store/DomainDatabase transaction registration and startup/backup/restore hooks', 'actual export privacy deletion and latest-ledger application',
    'isolated schema32/minimum reader gate and real SQLite/PG native file recovery', 'business source authorization, actual render/cleanup workers and verified file-handle HTTP reads',
    'student exact exposure and all old body/reference/media/PDF/print diagnostic restrictions', 'original workbench UI/drafts/two tabs/no-storage/unknown original-command results',
    'all other R5/R6 textbooks and GESP/R7/R8, original72/WS, teacher/device/new-machine/physical-print/real 1/3/7/14-day conditions'], files,
};
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ archived: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), scoped: 113, oldPrivacy: 6, actualFinalFiles: 2, actualPagesOpened: 2 }));
