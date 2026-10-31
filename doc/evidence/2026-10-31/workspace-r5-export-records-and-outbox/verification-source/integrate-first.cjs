const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p170'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz'))));
const frozen = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'types-fourth-source.json.gz'))));
const regression = JSON.parse(fs.readFileSync(path.join(__dirname, 'queue-third-vitest.json'))), privacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'regression-first-vitest.json')));
const types = JSON.parse(fs.readFileSync(path.join(__dirname, 'types-fourth.json'))), build = JSON.parse(fs.readFileSync(path.join(__dirname, 'regression-first.json')));
const bridge = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/g170/result.json'))), review = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/c170/review-second.json')));
if (regression.numPassedTests !== 113 || regression.numFailedTests || regression.numPendingTests || privacy.numPassedTests !== 6 || privacy.numFailedTests || privacy.numPendingTests ||
    types.results.some(row => row.exit !== 0) || build.results.some(row => row.exit !== 0) || bridge.files.length !== 2 || !review.allPagesReadable) throw Error('Complete scoped evidence required');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== preparation.head || execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Expected clean baseline main');
const before = [];
for (const row of frozen) {
  const current = fs.readFileSync(path.join(candidate, row.path)); if (sha(current) !== row.sha256 || sha(Buffer.from(row.data, 'base64')) !== row.sha256) throw Error('Candidate changed after validation');
  const destination = path.join(root, row.path), baseline = preparation.files.find(file => file.path === row.path), exists = fs.existsSync(destination);
  if (baseline ? !exists || sha(fs.readFileSync(destination)) !== baseline.sha256 : exists) throw Error('Main target changed');
  before.push({ path: row.path, existed: exists, data: exists ? fs.readFileSync(destination).toString('base64') : null });
}
fs.writeFileSync(path.join(__dirname, 'main-before-integration.json.gz'), zlib.gzipSync(JSON.stringify(before)), { flag: 'wx' });
for (const row of frozen) { const destination = path.join(root, row.path); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(path.join(candidate, row.path), destination);
  if (sha(fs.readFileSync(destination)) !== row.sha256) throw Error('Main readback mismatch'); }
const summary = { at: new Date().toISOString(), source: frozen.map(({ data: _data, ...row }) => row), scopedTests: { passed: 113, failed: 0, skipped: 0 },
  existingPrivacyRegression: { passed: 6, failed: 0, skipped: 0 }, actualBridge: { files: 2, publishedPdfSlots: 1, pageImagesOpened: 2 }, schema32Registered: false, routesEnabled: false };
fs.writeFileSync(path.join(__dirname, 'integration-first.json'), JSON.stringify(summary, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ integrated: frozen.length, schema32Registered: false, routesEnabled: false }));
