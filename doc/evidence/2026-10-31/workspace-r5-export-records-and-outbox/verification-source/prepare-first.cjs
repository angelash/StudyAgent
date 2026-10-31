const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { execFileSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../../..'), target = path.join(root, 'data/qa/p170'), prior = path.join(root, 'data/qa/p168');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!head.startsWith('862f2d8f') || fs.existsSync(target)) throw Error('Expected baseline and unused candidate directory');
const preparation = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data/qa/workspace-paper-native-first-20261031/source-preparation-first.json.gz'))));
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 }).split('\0').filter(Boolean));
const selected = new Set([...preparation.files.map(row => row.path), ...[...tracked].filter(file => /^(apps|packages|resources|scripts|tests\/e2e)\//.test(file))]);
const files = [], links = [];
for (const file of [...selected].sort()) {
  if (file.includes('..') || /(^|\/)(\.env[^/]*|credentials.json|node_modules|\.next[^/]*)(\/|$)/.test(file)) throw Error('Private or generated path');
  const bytes = fs.readFileSync(path.join(tracked.has(file) ? root : prior, file)), destination = path.join(target, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(destination)) !== sha(bytes)) throw Error('Copy readback failed');
  files.push({ path: file, sha256: sha(bytes), bytes: bytes.length });
}
fs.mkdirSync(path.join(target, 'node_modules'));
for (const entry of fs.readdirSync(path.join(prior, 'node_modules'), { withFileTypes: true })) {
  if (entry.name === '@study-agent' || entry.name.startsWith('.') && entry.name !== '.bin') continue;
  const source = fs.realpathSync(path.join(prior, 'node_modules', entry.name)); if (!fs.statSync(source).isDirectory()) continue;
  const destination = path.join(target, 'node_modules', entry.name); fs.symlinkSync(source, destination, 'junction'); links.push({ path: destination, target: source });
}
fs.mkdirSync(path.join(target, 'node_modules/@study-agent'));
for (const name of ['config', 'contracts']) { const source = path.join(target, 'packages', name), destination = path.join(target, 'node_modules/@study-agent', name); fs.symlinkSync(source, destination, 'junction'); links.push({ path: destination, target: source }); }
const protection = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/workspace-adult-models-first-20261031/adult165-main-protection-third.json')));
for (const row of protection.files) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
const db = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true });
const formal = { schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; db.close();
if (JSON.stringify(formal) !== JSON.stringify(protection.formal)) throw Error('Formal metadata changed');
fs.writeFileSync(path.join(__dirname, 'preparation-first.json.gz'), zlib.gzipSync(JSON.stringify({ head, target, files, links, formal, protectedFiles: protection.files })), { flag: 'wx' });
console.log(JSON.stringify({ head, target, copied: files.length, junctions: links.length, formal, protected: protection.files.length }));
