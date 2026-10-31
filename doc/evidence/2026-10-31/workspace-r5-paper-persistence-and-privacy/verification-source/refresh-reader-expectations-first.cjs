const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p171');
const ts = require(path.join(candidate, 'node_modules/typescript/lib/typescript.js'));
const files = ['assistant-note-storage.integration.test.ts', 'assistant-whiteboard-reader.integration.test.ts', 'backup.integration.test.ts', 'paper-practice-migration.test.ts',
  ...[25, 26, 27, 28, 29, 30, 31].map(version => `schema${version}-reader.integration.test.ts`)].map(name => 'apps/api/src/infrastructure/' + name);
const originals = [], results = [], hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const file of files) {
  const target = path.join(candidate, file), bytes = fs.readFileSync(target), original = bytes.toString('utf8');
  originals.push({ path: file, sha256: hash(bytes), data: bytes.toString('base64') });
  let next = original.replace(/\.toBe\(31\)/g, '.toBe(CURRENT_SCHEMA_VERSION)').replace(/\.toBe\('ready-schema31'\)/g, '.toBe(CURRENT_READY_STATE)');
  next = next.replace(/\.toBe\(32\)/g, '.toBe(CURRENT_SCHEMA_VERSION + 1)');
  next = next.replace(/(['"])(INSERT INTO schema_migrations(?:\(version,applied_at\))? VALUES\()32(,\?\))\1/g,
    (_match, _quote, prefix, suffix) => '`' + prefix + '${CURRENT_SCHEMA_VERSION + 1}' + suffix + '`');
  next = next.replace(/(['"])(DELETE FROM schema_migrations WHERE version=)32\1/g,
    (_match, _quote, prefix) => '`' + prefix + '${CURRENT_SCHEMA_VERSION + 1}`');
  next = next.replaceAll('future32', 'future current-schema-plus-one').replaceAll('future schema32', 'future schema beyond the current reader');
  if (file.endsWith('backup.integration.test.ts')) next = next.replaceAll('"UPDATE study_restore_guard SET state=\'ready-schema31\'"', '`UPDATE study_restore_guard SET state=\'${CURRENT_READY_STATE}\'`');
  if (next === original) throw Error('Expected actual current-version assertions: ' + file);
  const syntax = ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true); let insertion = 0;
  for (const statement of syntax.statements) if (ts.isImportDeclaration(statement) || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(row => row.name.getText(syntax) === 'require')) insertion = Math.max(insertion, statement.end);
  const declaration = "\nconst { SCHEMA_VERSION: CURRENT_SCHEMA_VERSION, READY_STATE: CURRENT_READY_STATE } = require(require('node:path').resolve(__dirname, '../../../../scripts/operations/database-reader-guard.cjs'));\n";
  next = next.slice(0, insertion) + declaration + next.slice(insertion);
  if (ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true).parseDiagnostics.length) throw Error('Changed fixture syntax invalid');
  fs.writeFileSync(target, next); results.push({ path: file, beforeSha256: hash(bytes), afterSha256: hash(Buffer.from(next)),
    preserved: ['sealed old binary/archive', 'original business-row comparisons', 'original migration-failure triggers', 'old minimum-reader refusal assertions'] });
}
fs.writeFileSync(path.join(__dirname, 'reader-expectations-before-first.json.gz'), zlib.gzipSync(JSON.stringify(originals)), { flag: 'wx' });
fs.writeFileSync(path.join(__dirname, 'reader-expectations-first.json'), JSON.stringify({ updated: results, reason: 'The current reader is schema32. Fixed historical versions remain fixed; only current/future expectations follow the actual guard.' }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ currentVersionTestFilesUpdated: results.length, originalFailureTriggersPreserved: true, archivedReadersChanged: false }));
