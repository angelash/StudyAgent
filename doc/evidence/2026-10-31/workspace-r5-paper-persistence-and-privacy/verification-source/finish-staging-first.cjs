const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p171'), evidence = 'doc/evidence/2026-10-31/workspace-r5-paper-persistence-and-privacy';
const out = path.join(root, evidence), receiptFile = path.join(out, 'receipt.json'), receipt = JSON.parse(fs.readFileSync(receiptFile)), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const first = spawnSync('git', ['diff', '--cached', '--check'], { cwd: root, encoding: 'utf8', windowsHide: true });
fs.writeFileSync(path.join(__dirname, 'diff-check-first.log'), first.stdout + first.stderr, { flag: 'wx' });
const fixture = 'apps/api/src/modules/library/paper-library-app.fixture.spec.ts';
if (first.status !== 2 || !first.stdout.split('\n').filter(Boolean).every(line => line.endsWith('paper-library-app.fixture.spec.ts:56: new blank line at EOF.'))) throw Error('Unexpected staged formatting failure');
const original = fs.readFileSync(path.join(root, fixture)), next = Buffer.from(original.toString('utf8').replace(/(?:\r?\n)+$/, '\n'));
if (sha(original) !== receipt.source.find(row => row.path === fixture).sha256 || original.equals(next)) throw Error('Exact original fixture required');
for (const base of [root, candidate, path.join(out, 'source')]) {
  const target = path.join(base, fixture); if (sha(fs.readFileSync(target)) !== sha(original)) throw Error('Fixture changed'); fs.writeFileSync(target, next);
}
const source = receipt.source.map(row => row.path === fixture ? { ...row, sha256: sha(next) } : row);
const archived = receipt.files.find(row => row.path === 'source/' + fixture); archived.sha256 = sha(next); archived.originalSha256 = sha(next); archived.bytes = next.length;
const normalization = { path: fixture, beforeSha256: sha(original), afterSha256: sha(next), removedBytes: original.length - next.length,
  change: 'One surplus blank line at EOF in test fixture only; application source unchanged. Exact original is preserved in immutable test source snapshots.', additionalTestsNeeded: false };
fs.writeFileSync(path.join(__dirname, 'source-normalization-first.json'), JSON.stringify(normalization, null, 2), { flag: 'wx' });
fs.writeFileSync(path.join(__dirname, 'source-final-first.json.gz'), zlib.gzipSync(JSON.stringify(source.map(row => ({ ...row, data: fs.readFileSync(path.join(root, row.path)).toString('base64') })))), { flag: 'wx' });
receipt.source = source; receipt.sourceNormalization = normalization;
receipt.originalFailures.push({ name: 'diff-check-first', reason: 'One surplus EOF blank line in new test fixture and its evidence copy; normalized without semantic change. Original diff-check output and tested source snapshots preserved.' });
fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
const owned = [...source.map(row => row.path), ...['148-current-work-checkpoint-and-remaining-scope.md', '150-integrated-delivery-plan-and-work-ledger.md',
  '168-paper-selection-export-native-protocol.md', '170-paper-export-records-and-outbox-relations.md', '171-paper-library-persistence-privacy-and-native-recovery.md'].map(name => 'doc/product/' + name), evidence];
execFileSync('git', ['add', '--', ...owned], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
execFileSync('git', ['diff', '--cached', '--check'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).split('\0').filter(Boolean);
if (staged.some(file => !owned.includes(file) && !file.startsWith(evidence + '/'))) throw Error('Unexpected staged path');
const documentation = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs-first.log'), 'utf8'));
fs.writeFileSync(path.join(__dirname, 'staging-first.json'), JSON.stringify({ stagedFiles: staged.length, onlyOwnedScope: true, checkExit: 0, documentation, files: staged }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ staged: staged.length, ownedOnly: true, diffCheck: 0, fixtureEofOnly: true, documentation }));
