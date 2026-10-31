const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p171');
const ts = require(path.join(candidate, 'node_modules/typescript/lib/typescript.js'));
const files = [
  ...['teaching-tool-storage.integration.test.ts', 'topic-whiteboard-storage.integration.test.ts', 'topic-whiteboard-visual-storage.integration.test.ts',
    'whiteboard-question-storage.integration.test.ts', 'whiteboard-question-visual-storage.integration.test.ts', 'topic-whiteboard-postgres.integration.test.ts',
    'topic-whiteboard-visual-postgres.integration.test.ts', 'whiteboard-question-postgres.integration.test.ts'].map(name => 'apps/api/src/infrastructure/' + name),
  'apps/api/src/modules/library/paper-practice-recovery.integration.test.ts',
  ...['assistant-teaching.integration.test.ts', 'topic-whiteboard-visual-files.test.ts', 'whiteboard-question-visual.integration.test.ts',
    'paper-capture-recovery.integration.test.ts'].map(name => 'apps/api/src/modules/learning/' + name),
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), originals = [], updates = [];
for (const file of files) {
  const target = path.join(candidate, file), bytes = fs.readFileSync(target), original = bytes.toString('utf8');
  originals.push({ path: file, sha256: hash(bytes), data: bytes.toString('base64') });
  let next = original.replace(/\.toBe\(31\)/g, '.toBe(CURRENT_SCHEMA_VERSION)')
    .replaceAll('.toEqual({ version: 31 })', '.toEqual({ version: CURRENT_SCHEMA_VERSION })');
  next = next.replace("'INSERT INTO schema_migrations VALUES(32,?)'", "'INSERT INTO schema_migrations VALUES(?,?)'")
    .replace(".run(new Date().toISOString()); } finally { future.close(); }", ".run(CURRENT_SCHEMA_VERSION + 1, new Date().toISOString()); } finally { future.close(); }")
    .replace("'INSERT INTO schema_migrations(version,applied_at) VALUES(32,$1)', [new Date().toISOString()]", "'INSERT INTO schema_migrations(version,applied_at) VALUES($1,$2)', [CURRENT_SCHEMA_VERSION + 1, new Date().toISOString()]");
  next = next.replace('await query("UPDATE study_restore_guard SET state=\'ready-schema31\' WHERE id=1")',
    'await query("UPDATE study_restore_guard SET state=? WHERE id=1",[CURRENT_READY_STATE])');
  if (next === original) throw Error('Expected current/future assertion or restore guard: ' + file);
  const syntax = ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true);
  let insertion = 0;
  for (const statement of syntax.statements) if (ts.isImportDeclaration(statement)) insertion = Math.max(insertion, statement.end);
  const relative = path.relative(path.dirname(target), path.join(candidate, 'scripts/operations/database-reader-guard.cjs')).replaceAll('\\', '/');
  const fields = file.endsWith('paper-capture-recovery.integration.test.ts') ? 'READY_STATE: CURRENT_READY_STATE' : 'SCHEMA_VERSION: CURRENT_SCHEMA_VERSION';
  const declaration = "\nconst { " + fields + " } = require(require('node:path').resolve(__dirname, '" + relative + "'));\n";
  next = next.slice(0, insertion) + declaration + next.slice(insertion);
  if (ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true).parseDiagnostics.length) throw Error('Invalid changed syntax: ' + file);
  updates.push({ path: file, beforeSha256: hash(bytes), afterSha256: hash(Buffer.from(next)), next });
}
fs.writeFileSync(path.join(__dirname, 'reader-expectations-before-second.json.gz'), zlib.gzipSync(JSON.stringify(originals)), { flag: 'wx' });
for (const row of updates) fs.writeFileSync(path.join(candidate, row.path), row.next);
fs.writeFileSync(path.join(__dirname, 'reader-expectations-second.json'), JSON.stringify({
  updated: updates.map(({next, ...row}) => row),
  reason: 'Actual full API regression exposed twelve fixed current-schema31 assertions. Current and future versions now follow the actual guard; archived binaries, historical versions, original business records and migration failure triggers are unchanged.',
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ currentVersionTestFilesUpdated: updates.length, applicationSourceChanged: false, archivedReadersChanged: false }));
