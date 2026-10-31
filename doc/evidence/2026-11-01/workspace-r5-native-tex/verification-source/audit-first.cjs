const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../../..'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const before = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data/qa/workspace-audio-first-20261101/preparation-first.json.gz'))));
for (const row of before.protectedFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Protected runtime changed');
const old = JSON.parse(fs.readFileSync(path.join(root, 'doc/evidence/2026-11-01/workspace-r5-classroom-audio/receipt.json')));
for (const row of old.source) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256) throw Error('Committed audio source changed');
const archiveRoot = path.join(root, 'doc/evidence/2026-11-01/workspace-r5-classroom-audio');
const hashes = JSON.parse(fs.readFileSync(path.join(archiveRoot, 'SHA256.json')));
for (const row of hashes.files) if (sha(fs.readFileSync(path.join(archiveRoot, row.path))) !== row.sha256) throw Error('Committed archive changed');
const db = new DatabaseSync(path.join(root, 'data/study-agent.sqlite3'), { readOnly: true });
const formal = { schema: db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, revision: db.prepare('SELECT revision FROM store_meta WHERE id=1').get().revision }; db.close();
if (JSON.stringify(formal) !== JSON.stringify(before.formal)) throw Error('Formal metadata changed');
const archive = new DatabaseSync(path.join(root, 'data/assets/shijuanbao/archive.sqlite3'), { readOnly: true });
const sampled = archive.prepare('SELECT detail FROM papers WHERE length(detail) <= 1048576 LIMIT 200').all();
const tags = {}, delimiters = { texInline: 0, texDisplay: 0 }, perPaper = {};
let chars = 0;
for (const row of sampled) {
  const text = typeof row.detail === 'string' ? row.detail : Buffer.from(row.detail).toString('utf8'); chars += text.length;
  const found = new Set();
  for (const match of text.matchAll(/<(math|mfrac|msup|msub|msubsup|msqrt|mroot|mfenced|mtable|mtr|mtd|munder|mover|munderover|semantics|annotation|mstyle|menclose|svg|audio|video)\b/gi)) { const name = match[1].toLowerCase(); tags[name] = (tags[name] ?? 0) + 1; found.add(name); }
  for (const name of found) perPaper[name] = (perPaper[name] ?? 0) + 1;
  if (text.includes('\\\\(')) delimiters.texInline++;
  if (text.includes('$$') || text.includes('\\\\[')) delimiters.texDisplay++;
}
archive.close();
const source = ['scripts/processing/paper_export_content.py', 'scripts/processing/paper_export_math.py', 'scripts/processing/paper_export_document.py', 'scripts/processing/test_paper_export.py'].map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
const result = { at: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), formal, protectedFiles: before.protectedFiles.length, audioCommitArchiveVerified: hashes.files.length, sampledPapers: sampled.length, sourceCharacters: chars, tags, perPaper, delimiters, sampleIsBoundedNotArchiveCoverage: true, referenceOnlyNoPublication: true, source, wholeGoal: 'active' };
fs.writeFileSync(path.join(__dirname, 'audit-first.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(result));
