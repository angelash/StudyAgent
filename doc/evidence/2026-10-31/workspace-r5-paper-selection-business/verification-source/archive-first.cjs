const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-paper-selection-business');
const sha = value => crypto.createHash('sha256').update(value).digest('hex'), read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const integration = read('integration-first.json'), main = read('main-check-first.json');
if (fs.existsSync(out) || main.checks.some(row => row.exit !== 0) || !main.allProtectedUnchanged || !read('postgres-stop-first.json').stopped) throw Error('Unused archive and complete actual validation required');
for (const row of integration.source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Main source changed');
fs.mkdirSync(out, { recursive: true }); const files = [];
function copy(source, relative, compressed = false) {
  if (/private|\.(?:sqlite3?|dump|db)$/.test(relative)) throw Error('Private artifact refused');
  const raw = fs.readFileSync(source), bytes = compressed ? zlib.gzipSync(raw) : raw, destination = path.join(out, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== sha(bytes)) throw Error('Archive readback failed');
  files.push({ path: relative, sha256: sha(bytes), bytes: bytes.length, originalSha256: sha(raw), ...(compressed ? { encoding: 'gzip' } : {}) });
}
for (const row of integration.source) copy(path.join(root, row.path), 'source/' + row.path);
for (const name of fs.readdirSync(__dirname).filter(name => /^(?:types-|build-|business-|postgres-(?:first|start-first|stop-first)|regression-|integration-first|main-check-first|preparation-first|main-before-integration)/.test(name) && /\.(json|log|gz)$/.test(name) && !name.includes('private')))
  copy(path.join(__dirname, name), 'reports/' + name + (name.endsWith('.gz') ? '' : '.gz'), !name.endsWith('.gz'));
for (const name of fs.readdirSync(__dirname).filter(name => /\.cjs$/.test(name))) copy(path.join(__dirname, name), 'verification-source/' + name);
const batches = Object.fromEntries(['business-first', 'business-second', 'postgres-first', 'regression-first'].map(name => {
  const row = read(name + '-vitest.json'); return [name, { passed: row.numPassedTests, failed: row.numFailedTests, skipped: row.numPendingTests, files: row.testResults.length,
    report: 'reports/' + name + '-vitest.json.gz', sourceUnchanged: read(name + '.json').sourceUnchanged }];
}));
const receipt = { at: new Date().toISOString(), baseline: integration.baseline, scope: '172 first business slice: private selection originals, explicit learner source reads and provenance-based measurement exclusion', source: integration.source,
  batches, main, postgresShutdown: read('postgres-stop-first.json'),
  actualChecks: ['Current user/session/guardian/access version and strict private/learner scope', 'Complete original command and immutable receipt recovery after later revisions',
    'Real concurrent HTTP revision winner and losing-command rollback', 'Actual archive-byte SHA change and publication-version change without silent refreezing',
    'Learner selection and per-paper exposure committed in the same native transaction', 'Active diagnostic blocks new content while retaining clear/metadata/original-result recovery',
    'Whole PDF exposure explicitly includes possible references', 'Actual SQLite and PostgreSQL diagnostic creation excludes newly read provenance without requiring equal packet hashes',
    'Revocation and actual cold application reopen preserve original facts'],
  qaCorrections: [{ batch: 'build-first', actual: 'Default types mode; three type-check steps, not an API build.', actualBuilds: ['build-second', 'build-third'], reportPreserved: true }],
  readiness: { selectionAndReadBusinessRoutes: true, exactMetadataGetReadOnly: true, exactSourceMeasurementExclusion: true, applicationSchema: 32,
    oldBodyReferenceMediaPdfPrintDiagnosticRestrictions: false, sameVerifiedHandleMediaResponse: false, originalPreviewExplicitReadUi: false,
    exportBusinessRoutesAndWorkers: false, selectionExportCompleteDraftUi: false, formalMigrated: false, pushed: false, deployed: false, wholeGoal: 'active' },
  remaining: ['172 second slice: old preview/practice/reference/media/PDF/print restrictions and same verified handle response',
    'Original workspace preview explicit-read integration and browser/role/recovery checks', 'Actual export and cleanup workers, full export routes and original workspace selection/complete draft UI',
    'All other R5/R6 textbooks/GESP/R7/R8, original72/WS, teachers/devices/new machine/physical printer and real1/3/7/14-day evidence'],
  privateDataPublished: false, files };
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(out, 'README.md'), '# 本人选题业务与学生明确来源阅读\n\n新增完整清单/原命令/原回执、只读准确题位目录及学生明确阅读；保存与曝光使用实际同一事务，并接入按原来源排除的新诊断。\n\n首轮SQLite15/0/0；最终SQLite16/0/0、真实PostgreSQL16/0/0和既有十一文件170/0/0分别记录，不拼合。两种数据库均实际创建诊断并确认已读原题被排除。主干contracts/API/Web无输出检查和1063运行文件保护通过。\n\n旧正文/参考/媒体/PDF/打印防旁路、同句柄响应、原视图阅读及完整选题/导出UI和实际worker仍按172第二批/后续实施。正式24/revision187保持，独占15444测试PG已停止；无真实资料或凭据入档，未推送部署，完整目标active。\n', { flag: 'wx' });
console.log(JSON.stringify({ sourceFiles: integration.source.length, archivedFiles: files.length, bytes: files.reduce((n, row) => n + row.bytes, 0), wholeGoal: 'active' }));
