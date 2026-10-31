const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p180'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const source = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'product-second-source.json.gz'))));
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== preparation.head || execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Exact clean planned main required');
for (const batch of ['product-second', 'postgres-second', 'python-third']) {
  const report = JSON.parse(fs.readFileSync(path.join(__dirname, batch + '.json')));
  if (!report.sourceUnchanged || report.results.some(row => row.exit !== 0)) throw Error('Final checks required: ' + batch);
}
const visual = JSON.parse(fs.readFileSync(path.join(__dirname, 'visual-review-final.json')));
if (visual.reviewedPages !== 6 || !visual.allFinalPagesInspected || !visual.proseAlignmentRepaired) throw Error('Actual final visual review required');
const owned = new Set(source.map(row => row.path));
for (const row of preparation.files) {
  if (!owned.has(row.path) && !/\/(?:dist|\.next[^/]*)\//.test(row.path) && sha(fs.readFileSync(path.join(candidate, row.path))) !== row.sha256) throw Error('Unexpected candidate edit: ' + row.path);
}
for (const row of preparation.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
const originalLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'))), finalLock = JSON.parse(fs.readFileSync(path.join(candidate, 'package-lock.json')));
assert.equal(finalLock.packages['apps/api'].dependencies.katex, '0.19.0'); delete finalLock.packages['apps/api'].dependencies.katex; assert.deepEqual(finalLock, originalLock);
for (const row of source) {
  const bytes = fs.readFileSync(path.join(candidate, row.path)); if (sha(bytes) !== row.sha256) throw Error('Final candidate source changed: ' + row.path);
  const baseline = preparation.files.find(file => file.path === row.path), target = path.join(root, row.path);
  if (baseline ? sha(fs.readFileSync(target)) !== baseline.sha256 : fs.existsSync(target)) throw Error('Main source changed: ' + row.path);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
  if (sha(fs.readFileSync(target)) !== row.sha256) throw Error('Source integration differs');
}
const report = { at: new Date().toISOString(), baseline: preparation.head, source: source.map(({ data, ...row }) => row), onlyNewDependencyDeclaration: 'katex@0.19.0 already used by web; all resolved lock entries identical', wholeGoal: 'active' };
fs.writeFileSync(path.join(__dirname, 'integration-first.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ exactSourceFiles: source.length, baseline: preparation.head }));
