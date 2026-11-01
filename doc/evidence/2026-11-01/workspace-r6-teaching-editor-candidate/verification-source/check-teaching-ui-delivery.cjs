const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), prefix = 'doc/evidence/2026-11-01/workspace-r6-teaching-editor-candidate/', folder = path.join(root, prefix),
  documents = ['doc/product/148-current-work-checkpoint-and-remaining-scope.md', 'doc/product/150-integrated-delivery-plan-and-work-ledger.md', 'doc/product/181-textbook-teaching-package-and-classroom-adoption.md'];
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (git(['branch', '--show-current']).trim() !== 'main' || git(['diff', '--cached', '--name-only']).trim()) throw Error('Only clean main staging is allowed');
fs.copyFileSync(__filename, path.join(folder, 'verification-source/check-teaching-ui-delivery.cjs'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), files = [], findings = []; let decoded = 0;
function walk(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isSymbolicLink()) throw Error('Linked evidence refused'); if (entry.isDirectory()) walk(file); else files.push(file); } } walk(folder);
function scan(label, bytes) {
  const value = bytes.toString('utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{24,}\b|\bBearer\s+[A-Za-z0-9_.-]{40,}\b/.test(value)) findings.push({ label, kind: 'private-key-or-token-pattern' });
  if (/(?:postgres(?:ql)?|mysql):\/\/[^\s'"`/:]+:[^\s'"`@/]+@[^\s'"`]+/.test(value)) findings.push({ label, kind: 'credential-url' });
  let parsed; try { parsed = JSON.parse(value); } catch { return; }
  function visit(item) { if (!item || typeof item !== 'object') return; if (typeof item.base64 === 'string' && typeof item.sha256 === 'string') {
    const body = Buffer.from(item.base64, 'base64'); if (sha(body) !== item.sha256) throw Error('Archived source integrity differs'); decoded++; scan(label + '#' + (item.path ?? decoded), body); return;
  } for (const child of Object.values(item)) visit(child); } visit(parsed);
}
for (const file of [...documents.map(file => path.join(root, file)), ...files]) if (!file.endsWith('.png')) { const raw = fs.readFileSync(file); scan(path.relative(root, file), file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw); }
if (findings.length) { fs.writeFileSync(path.join(__dirname, 'ui-delivery-private-scan-first.json'), JSON.stringify({ findings }, null, 2), { flag: 'wx' }); throw Error('Evidence requires credential review before staging'); }
const docs = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/qa/verify-doc-links.cjs')], { cwd: root, encoding: 'utf8' })); if (docs.missing.length) throw Error('Documentation links failed');
const baseline = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'preparation-first.json.gz')))); for (const file of baseline.protectedFiles) if (sha(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw Error('Protected runtime changed');
const report = { at: new Date().toISOString(), files: files.length + documents.length, decodedSourceFiles: decoded, findings, docs, protectedFilesUnchanged: baseline.protectedFiles.length,
  mainApplicationSchema: 32, formal: { schema: 24, revision: 187 }, applicationIntegrated: false, fifthAdoptionCollectionImplemented: false, wholeGoal: 'active', localCommitOnly: true };
fs.writeFileSync(path.join(folder, 'delivery-checks-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
git(['add', '--', ...documents, prefix]); const staged = git(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
if (staged.some(file => !documents.includes(file) && !file.startsWith(prefix)) || documents.some(file => !staged.includes(file))) throw Error('Unexpected staged scope');
git(['diff', '--cached', '--check']); console.log(JSON.stringify({ staged: staged.length, findings: findings.length, decoded, documentationLinks: docs.checked, missing: docs.missing.length, protectedFiles: report.protectedFilesUnchanged, sourceApplicationIntegrated: false }));
