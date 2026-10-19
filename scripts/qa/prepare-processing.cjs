// Exercise the real resumable upload API against ONLY the isolated loopback QA fixture.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const base = 'http://127.0.0.1:14000/api';
async function api(route, body, method = 'POST', raw = false) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' },
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }) });
  const result = await response.json(); if (!response.ok || result.error) throw new Error(result.error?.message ?? 'QA API failed'); return result.data;
}
async function main() {
  const evidence = { at: new Date().toISOString(), inputMethod: 'real HTTP chunk upload API; synthetic loopback preauthentication; browser file picker not automated', files: [] };
  for (const name of ['native-and-scanned.pdf', 'handwriting-input.png']) {
    const bytes = await fs.readFile(path.join('data/qa/processing-input', name));
    let file = await api('/admin/import-files', { name, mediaType: name.endsWith('.pdf') ? 'application/pdf' : 'image/png', size: bytes.length, requestKey: `qa-${crypto.createHash('sha256').update(bytes).digest('hex')}` });
    for (let i = 0; i < Math.ceil(bytes.length / file.chunkSize); i++) {
      if (!file.chunks.some(c => c.index === i)) file = await api(`/admin/import-files/${file.id}/chunks/${i}`, bytes.subarray(i * file.chunkSize, (i + 1) * file.chunkSize), 'PUT', true);
    }
    file = await api(`/admin/import-files/${file.id}/complete`, {});
    if (file.sha256 !== crypto.createHash('sha256').update(bytes).digest('hex')) throw new Error('Upload bytes differ from fixture');
    evidence.files.push({ id: file.id, name, sha256: file.sha256, size: file.size, chunks: file.chunks.length, status: file.status });
  }
  await fs.writeFile('data/qa/processing-upload-evidence.json', JSON.stringify(evidence, null, 2));
  process.stdout.write(JSON.stringify(evidence) + '\n');
}
main().catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
