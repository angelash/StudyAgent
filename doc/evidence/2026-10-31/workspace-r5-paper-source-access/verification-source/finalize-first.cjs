const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const out = path.resolve(__dirname, '../../../doc/evidence/2026-10-31/workspace-r5-paper-source-access'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const receiptFile = path.join(out, 'receipt.json'), receipt = JSON.parse(fs.readFileSync(receiptFile)), scan = JSON.parse(fs.readFileSync(path.join(__dirname, 'staged-scan-first.json'))), staging = JSON.parse(fs.readFileSync(path.join(__dirname, 'staging-first.json')));
if (scan.credentialPatternFindings.length || !staging.sourceScopeOnly || staging.checkExit !== 0 || staging.documentation.missing.length) throw Error('Actual delivery checks required');
function copy(name, relative, compressed = false) {
  if (receipt.files.some(row => row.path === relative)) return;
  const raw = fs.readFileSync(path.join(__dirname, name)), bytes = compressed ? zlib.gzipSync(raw) : raw, target = path.join(out, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' }); if (sha(fs.readFileSync(target)) !== sha(bytes)) throw Error('Evidence readback failed');
  receipt.files.push({ path: relative, sha256: sha(bytes), bytes: bytes.length, originalSha256: sha(raw), ...(compressed ? { encoding: 'gzip' } : {}) });
}
copy('scan-staged.cjs', 'verification-source/scan-staged.cjs');
for (const name of ['docs-first.log', 'diff-check-first.log', 'staging-first.json', 'staged-scan-first.json']) copy(name, 'reports/' + name + '.gz', true);
receipt.deliveryChecks = { documentationLinks: staging.documentation.checked, missingLinks: 0, initialStagedFiles: scan.stagedFiles, scannedTextParts: scan.textParts,
  decodedEmbeddedSourceParts: scan.embeddedSourceParts, credentialPatternFindings: 0, stagedDiffCheck: 0, sourceScopeOnly: true,
  note: 'Final scan repeated after review records are staged; its exact output remains in QA.' };
fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt.deliveryChecks));
