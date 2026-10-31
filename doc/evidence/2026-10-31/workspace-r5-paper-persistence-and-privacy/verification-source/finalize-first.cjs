const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const out = path.resolve(__dirname, '../../../doc/evidence/2026-10-31/workspace-r5-paper-persistence-and-privacy'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const receiptPath = path.join(out, 'receipt.json'), receipt = JSON.parse(fs.readFileSync(receiptPath));
const scan = JSON.parse(fs.readFileSync(path.join(__dirname, 'staged-scan-first.json'))), staging = JSON.parse(fs.readFileSync(path.join(__dirname, 'staging-first.json')));
if (scan.credentialPatternFindings.length || staging.documentation.missing.length || !staging.onlyOwnedScope || staging.checkExit !== 0) throw Error('Actual delivery checks required');
function copy(name, relative, compressed = false) {
  const raw = fs.readFileSync(path.join(__dirname, name)), bytes = compressed ? zlib.gzipSync(raw) : raw, destination = path.join(out, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== sha(bytes)) throw Error('Evidence readback failed');
  receipt.files.push({ path: relative, bytes: bytes.length, sha256: sha(bytes), originalSha256: sha(raw), ...(compressed ? { encoding: 'gzip' } : {}) });
}
for (const name of ['stage-first.cjs', 'finish-staging-first.cjs', 'scan-staged.cjs', 'finalize-first.cjs']) copy(name, 'verification-source/' + name);
for (const name of ['docs-first.log', 'staged-scan-first.json', 'staging-first.json', 'diff-check-first.log', 'source-normalization-first.json']) copy(name, 'reports/' + name + '.gz', true);
copy('source-final-first.json.gz', 'reports/source-final-first.json.gz');
receipt.deliveryChecks = { documentationLinks: staging.documentation.checked, missingLinks: staging.documentation.missing.length,
  initialStagedFiles: scan.stagedFiles, textParts: scan.textParts, decodedEmbeddedSourceParts: scan.embeddedSourceParts, credentialPatternFindings: scan.credentialPatternFindings.length,
  stagedDiffCheck: 0, sourceScopeStagedOnly: true, note: 'Final staged scan repeated after adding these review records; the separate exact output remains in private QA.' };
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt.deliveryChecks));
