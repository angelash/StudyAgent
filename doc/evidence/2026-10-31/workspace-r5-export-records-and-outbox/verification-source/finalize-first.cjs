const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'doc/evidence/2026-10-31/workspace-r5-export-records-and-outbox'), target = path.join(out, 'receipt.json');
const rawReceipt = fs.readFileSync(target), receipt = JSON.parse(rawReceipt), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(__dirname, 'receipt-before-delivery-checks.json'), rawReceipt, { flag: 'wx' });
const scan = JSON.parse(fs.readFileSync(path.join(__dirname, 'staged-scan-first.json'))), docs = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs-first.log')));
if (scan.credentialPatternFindings.length || scan.stagedFiles !== 100 || docs.missing.length || docs.checked !== 5065) throw Error('Verified initial delivery checks required');
for (const filename of ['stage-first.cjs', 'scan-staged-first.py', 'finalize-first.cjs', 'docs-first.log', 'staged-scan-first.json', 'staging-first.json']) {
  const source = fs.readFileSync(path.join(__dirname, filename)), relative = /\.(cjs|py)$/.test(filename) ? 'verification-source/' + filename : 'reports/' + filename + '.gz';
  const bytes = relative.endsWith('.gz') ? zlib.gzipSync(source) : source, destination = path.join(out, relative); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== sha(bytes)) throw Error('Readback mismatch');
  receipt.files.push({ path: relative, bytes: bytes.length, sha256: sha(bytes), originalSha256: sha(source), ...(relative.endsWith('.gz') ? { encoding: 'gzip' } : {}) });
}
receipt.deliveryChecks = { documentationLinks: docs.checked, missingLinks: 0, initialStagedFiles: 100, initialTextXmlPdfPartsScanned: scan.textXmlPdfPartsChecked, credentialPatternFindings: 0, sourceScopeStagedOnly: true, stagedDiffCheck: 0,
  note: 'A final staged scan is run again after adding these review records; its exact output is retained in the QA checkpoint.' };
fs.writeFileSync(target, JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify({ evidenceFiles: receipt.files.length, links: docs.checked, initialScanned: scan.stagedFiles }));
