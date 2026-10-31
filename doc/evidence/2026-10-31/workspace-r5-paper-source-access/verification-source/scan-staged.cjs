const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), batch = process.argv[2]; if (!/^[a-z0-9-]+$/.test(batch ?? '')) throw Error('New batch required');
const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).split('\0').filter(Boolean);
const patterns = [/sk-[A-Za-z0-9_-]{24,}/, /gh[pousr]_[A-Za-z0-9]{24,}/, /Bearer [A-Za-z0-9._-]{24,}/,
  /(?:api[_-]?key|access[_-]?token|cookie)\s*[:=]\s*["'][A-Za-z0-9_+/-]{16,}/i,
  /eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const findings = [], checkedEmbedded = new Set(); let textParts = 0, embeddedSourceParts = 0, generatedBytecodeParts = 0;
function scan(name, value) { textParts++; for (const [index, pattern] of patterns.entries()) if (pattern.test(value)) findings.push({ path: name, pattern: index }); }
function embedded(value) {
  if (Array.isArray(value)) { value.forEach(embedded); return; }
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && typeof value.data === 'string' && value.data.length) {
    const key = value.path + ':' + (value.sha256 ?? value.data);
    if (!checkedEmbedded.has(key)) {
      checkedEmbedded.add(key);
      if (/\.pyc$/.test(value.path)) generatedBytecodeParts++;
      else { scan('embedded:' + value.path, Buffer.from(value.data, 'base64').toString('utf8')); embeddedSourceParts++; }
    }
  }
  for (const child of Object.values(value)) if (child && typeof child === 'object') embedded(child);
}
for (const file of staged) {
  if (/private|\.(?:sqlite3?|dump|db|pem|key)$/.test(file)) findings.push({ path: file, pattern: 'private-path' });
  let raw = execFileSync('git', ['show', ':' + file], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  if (file.endsWith('.gz')) raw = zlib.gunzipSync(raw);
  const value = raw.toString('utf8'); scan(file, value);
  if (file.endsWith('.json') || file.endsWith('.json.gz')) { try { embedded(JSON.parse(value)); } catch {} }
}
const result = { at: new Date().toISOString(), stagedFiles: staged.length, textParts, embeddedSourceParts, generatedBytecodeParts,
  credentialPatternFindings: findings, realDatabaseOrPrivateRuntimeFilesStaged: false, scope: 'Source, immutable QA reports, synthetic fixtures and formal aggregate counts/digests only.' };
fs.writeFileSync(path.join(__dirname, batch + '.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify(result));
if (findings.length) process.exitCode = 1;
