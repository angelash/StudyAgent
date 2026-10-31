const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), target = path.join(root, 'data/qa/p174'), prior = path.join(root, 'data/qa/p173');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (head !== '1997b962570dcac64450fd243df6040329d95369' || fs.existsSync(target) || execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Expected exact clean planned baseline and unused candidate');
const previous = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data/qa/workspace-paper-access-first-20261031/preparation-first.json.gz'))));
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 }).split('\0').filter(Boolean));
const selected = new Set([...previous.files.map(row => row.path), ...[...tracked].filter(file => /^(apps|packages|resources|scripts|tests\/e2e)\//.test(file))]);
const files = [], links = [];
for (const file of [...selected].sort()) {
  if (/(^|\/)(?:\.env[^/]*|node_modules|\.next[^/]*|__pycache__)(\/|$)|\.pyc$/.test(file)) continue;
  if (file.includes('..')) throw Error('Unsafe selected path');
  const source = path.join(tracked.has(file) ? root : prior, file), bytes = fs.readFileSync(source), destination = path.join(target, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== sha(bytes)) throw Error('Candidate copy readback failed'); files.push({ path: file, sha256: sha(bytes), bytes: bytes.length });
}
fs.mkdirSync(path.join(target, 'node_modules'));
for (const entry of fs.readdirSync(path.join(prior, 'node_modules'), { withFileTypes: true })) {
  if (entry.name === '@study-agent' || entry.name.startsWith('.') && entry.name !== '.bin') continue;
  const source = fs.realpathSync(path.join(prior, 'node_modules', entry.name)); if (!fs.statSync(source).isDirectory()) continue;
  const destination = path.join(target, 'node_modules', entry.name); fs.symlinkSync(source, destination, 'junction'); links.push({ path: destination, target: source });
}
fs.mkdirSync(path.join(target, 'node_modules/@study-agent'));
for (const name of ['config', 'contracts', 'ui']) { const source = path.join(target, 'packages', name), destination = path.join(target, 'node_modules/@study-agent', name); fs.symlinkSync(source, destination, 'junction'); links.push({ path: destination, target: source }); }
for (const row of previous.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
fs.writeFileSync(path.join(__dirname, 'preparation-first.json.gz'), zlib.gzipSync(JSON.stringify({ head, target, prior, files, links, formal: previous.formal, protectedFiles: previous.protectedFiles })), { flag: 'wx' });
console.log(JSON.stringify({ head, copied: files.length, junctions: links.length, protectedFiles: previous.protectedFiles.length, applicationSchema: 32, formal: previous.formal }));
