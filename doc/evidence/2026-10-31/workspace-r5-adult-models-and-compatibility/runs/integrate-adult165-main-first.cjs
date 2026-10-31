const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { execFileSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const qa = __dirname, root = path.resolve(qa, '../../..'), source = path.join(root, 'data/qa/a165');
const archive = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-adult-models-and-compatibility');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(qa, name), 'utf8'));
const candidate = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(qa, 'adult165-source-candidate-third.json.gz'))));
const protection = read('adult165-main-protection-third.json');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (head !== candidate.baseMain || head !== protection.head || candidate.files.length !== 12) throw Error('Reviewed twelve-file baseline required');
for (const file of candidate.files) {
  if (!/^(?:apps\/api\/src\/modules\/(?:learning|ai)\/|apps\/web\/app\/studio\/classroom\/|tests\/e2e\/adult-models\.spec\.ts$)/.test(file.path) || file.path.includes('..')) throw Error('Unexpected source path');
  const location = path.join(root, file.path), before = fs.existsSync(location) ? sha(fs.readFileSync(location)) : null;
  if (before !== file.baselineSha256 || sha(Buffer.from(file.utf8)) !== file.sha256 || sha(fs.readFileSync(path.join(source, file.path))) !== file.sha256) throw Error('Source baseline or final candidate changed: ' + file.path);
}
for (const file of protection.files) if (sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw Error('Protected main changed: ' + file.path);
function formal() {
  const db = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true });
  try { return { schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; } finally { db.close(); }
}
if (JSON.stringify(formal()) !== JSON.stringify(protection.formal)) throw Error('Review changed formal metadata');
const plan = { at: new Date().toISOString(), head, sourceFiles: candidate.files.map(({ path, baselineSha256, sha256 }) => ({ path, baselineSha256, sha256 })),
  protectedMainFiles: protection.files.length, formalReadOnly: formal(), scope: 'Exact final twelve source/fixture files only. No generated Next imports, output, dependency, database or junction copied.', push: false, deployment: false };
if (process.argv[2] === '--plan') {
  fs.writeFileSync(path.join(qa, 'adult165-main-integration-plan-first.json'), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ planned: plan.sourceFiles.length, formal: plan.formalReadOnly, applied: false })); process.exit(0);
}
if (process.argv[2] !== '--apply') throw Error('Use explicit --plan or --apply');
const receipt = JSON.parse(fs.readFileSync(path.join(archive, 'receipt.json'), 'utf8'));
if (receipt.baseMain !== head || receipt.checks.apiFullThird.failed !== 2 || receipt.checks.durabilityNormalFourth.passed !== 3 || receipt.checks.durabilityNormalFourth.failed ||
  receipt.checks.durabilitySeedDisabledFifth.failed !== 2 || receipt.checks.browserThird.passed !== 50 || receipt.checks.browserThird.retries || receipt.checks.assistantPostgresThird.passed !== 70) throw Error('Actual final classified evidence required');
for (const file of receipt.artifacts) if (sha(fs.readFileSync(path.join(archive, file.path))) !== file.sha256) throw Error('Archive readback failed: ' + file.path);
for (const file of candidate.files) {
  const location = path.join(root, file.path); fs.mkdirSync(path.dirname(location), { recursive: true }); fs.writeFileSync(location, Buffer.from(file.utf8));
  if (sha(fs.readFileSync(location)) !== file.sha256) throw Error('Integrated source readback failed: ' + file.path);
}
for (const file of protection.files) if (sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw Error('Protected runtime changed after source integration');
if (JSON.stringify(formal()) !== JSON.stringify(protection.formal)) throw Error('Formal metadata changed after integration');
const result = { ...plan, at: new Date().toISOString(), applicationIntegrated: true, sourceReadback: true, protectedMainUnchanged: true,
  formalAfter: formal(), testedInput: 'Final candidate third exact source and compiled runtime, with second unchanged actual production Web build.',
  actualRuntimeUpdated: false, wholeGoal: 'active' };
for (const folder of [qa, archive]) fs.writeFileSync(path.join(folder, 'controlled-main-integration.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ integrated: candidate.files.length, protectedMainFiles: protection.files.length, formal: result.formalAfter, push: false, deployment: false }));
