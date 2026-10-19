// Owned synthetic families, production-mode HTTP and separate book editions.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'study-textbook-runtime-'));
const directory = path.join(temporary, 'state'), registryPath = path.join(temporary, 'textbooks.json');
const output = path.resolve(process.argv[2] ?? 'data/qa/textbook-chapters-runtime.json');
const driver = process.argv[3] ?? 'sqlite';
if (!['sqlite', 'postgres'].includes(driver)) throw new Error('Expected sqlite or postgres');
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
  STUDY_TEXTBOOK_REGISTRY: registryPath, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY; delete process.env.STUDY_SEED_FOUNDATION;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const latestRegistry = JSON.parse(fs.readFileSync(path.join(root, 'resources/curriculum/textbooks-v1.json'), 'utf8'));
const oldRegistry = structuredClone(latestRegistry);
for (const book of oldRegistry.books) if (book.chapterEvidence) {
  book.version = book.catalogVersion; book.chapterState = 'missing'; book.chapters = [];
  delete book.chapterEvidence; delete book.catalogVersion;
}
fs.writeFileSync(registryPath, JSON.stringify(oldRegistry));
const sha = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const evidence = { at: new Date().toISOString(), driver, passed: false,
  scope: 'Owned synthetic families, reviewed Chinese bibliographic TOCs, synthetic lesson mappings, real production HTTP and two restarts. No pedagogical mapping approval or browser acceptance.',
  sourceSha256: Object.fromEntries(['resources/curriculum/textbooks-v1.json', 'resources/curriculum/reviewed-textbook-chapters-v1.json',
    'apps/api/src/modules/diagnostics/textbook-registry.service.ts', 'apps/api/src/modules/diagnostics/curriculum.service.ts',
    'packages/contracts/src/curriculum.ts', 'apps/web/components/learning-progress-selector.tsx', 'apps/web/app/admin/curriculum/page.tsx'].map(file => [file, sha(file)])) };
let app, base, adminPool, qaDatabase;
const tokens = {};
async function start() {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function call(method, route, body, actor = 'parent', expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${result.error?.message ?? ''}`); return result.data;
}
async function assess(studentId) {
  const preview = await call('POST', '/diagnostics/blueprints', { studentId, subject: 'chinese', intent: 'baseline', maxItems: 4,
    includePrerequisites: false, requestKey: randomUUID() });
  assert(preview.canStart);
  return call('POST', `/diagnostics/blueprints/${encodeURIComponent(preview.id)}/start`, {});
}
async function main() {
  if (driver === 'postgres') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
    if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.appUser !== 'study_agent_app') throw new Error('Expected owned QA cluster');
    adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
    qaDatabase = 'study_textbook_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
    const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
    try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
    const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
    process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
  }
  const credential = randomBytes(24).toString('hex');
  const bootstrap = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-textbook-runtime'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(bootstrap.status, 0, 'Formal administrator bootstrap');
  await start(); tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-textbook-runtime', credential }, 'anonymous')).token;
  for (const actor of ['parent', 'outsider']) tokens[actor] = (await call('POST', '/auth/register', {
    principal: 'qa-textbook-' + actor, credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
  const studentId = (await call('POST', '/students', { nickname: '合成教材升级核验', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: '', chinese: 'original', english: '' } })).profile.id;
  const bookId = latestRegistry.books.find(book => book.subject === 'chinese' && book.grade === 3 && book.term === 'upper').id;
  const oldBook = await call('GET', '/diagnostics/textbooks/' + encodeURIComponent(bookId)); assert.equal(oldBook.chapterState, 'missing');
  const atoms = await call('GET', '/diagnostics/curriculum?subject=chinese&grade=3&term=upper');
  const atom = atoms.find(a => a.grade === 3); assert(atom);
  const command = { subject: 'chinese', grade: 3, term: 'upper', textbookVolumeId: bookId, textbookVersion: oldBook.title,
    progressMode: 'knowledge', selectedLessonIds: [], learnedAtomIds: [atom.id], currentAtomId: atom.id, minutesPerSession: 15 };
  const oldScope = await call('PUT', `/students/${studentId}/learning-scope`, command);
  const before = await assess(studentId);
  await stop(); fs.writeFileSync(registryPath, JSON.stringify(latestRegistry)); await start();
  const previous = await call('GET', `/diagnostics/sessions/${before.id}`);
  assert.deepEqual(previous.scopeSnapshot, before.scopeSnapshot); assert.equal(previous.scopeSnapshot.textbookRevision, oldBook.version);
  let entries = 0, lessons = 0, parts = 0, bookCount = 0;
  for (let grade = 1; grade <= 6; grade++) for (const term of ['upper', 'lower']) {
    const books = await call('GET', `/diagnostics/textbooks?subject=chinese&grade=${grade}&term=${term}`);
    const book = books.find(book => book.source === 'public_catalog'); assert(book);
    assert.equal(book.chapterState, 'available'); assert.equal(book.mappedLessonCount, 0); assert(book.chapterEvidence);
    const detail = await call('GET', '/diagnostics/textbooks/' + encodeURIComponent(book.id));
    assert.notEqual(book.version, book.catalogVersion);
    for (const chapter of detail.chapters) for (const lesson of chapter.lessons) {
      assert.deepEqual(lesson.atomIds, []); assert(lesson.printedPage > 0);
      assert.equal(lesson.mappingState, lesson.kind === 'reference' ? 'reference' : 'unmapped');
      for (const part of lesson.parts ?? []) { assert(!('id' in part)); assert(!('atomIds' in part)); parts++; }
    }
    assert(!JSON.stringify(detail).includes('transcode/image'));
    entries += book.entryCount; lessons += book.lessonCount; bookCount++;
  }
  assert.equal(bookCount, 12); assert.equal(entries, 558); assert.equal(lessons, 523); assert.equal(parts, 96);
  const book = await call('GET', '/diagnostics/textbooks/' + encodeURIComponent(bookId));
  const [first, second] = book.chapters[0].lessons, reference = book.chapters.at(-1).lessons[0];
  const mapping = { bookId, lessonId: first.id, atomIds: [atom.id], status: 'candidate', rationale: '合成映射仅用于生产存储审核门禁验证，不代表真实教材教研审核' };
  await call('POST', '/admin/curriculum/textbook-mappings', mapping, 'parent', 403);
  await call('POST', '/admin/curriculum/textbook-mappings', { ...mapping, lessonId: reference.id }, 'admin', 400);
  await call('POST', '/admin/curriculum/textbook-mappings', mapping, 'admin');
  const selected = { ...command, progressMode: 'textbook', selectedLessonIds: [first.id, second.id] };
  await call('PUT', `/students/${studentId}/learning-scope`, selected, 'parent', 400);
  const approved = await call('POST', '/admin/curriculum/textbook-mappings', { ...mapping, status: 'approved' }, 'admin');
  const lower = { ...atom, id: 'qa:chinese:lower', name: '合成下学期限定知识点', term: 'lower', prerequisiteIds: [], version: 1 };
  await call('POST', '/admin/knowledge-atoms', lower, 'admin');
  await call('POST', '/admin/curriculum/textbook-mappings', { ...mapping, atomIds: [lower.id] }, 'admin', 400);
  await call('PUT', `/students/${studentId}/learning-scope`, { ...selected, term: 'lower' }, 'parent', 400);
  await call('PUT', `/students/${studentId}/learning-scope`, { ...selected, selectedLessonIds: [first.id, reference.id] }, 'parent', 400);
  const currentScope = await call('PUT', `/students/${studentId}/learning-scope`, selected);
  assert.deepEqual(currentScope.uncoveredLessonIds, [second.id]); assert.deepEqual(currentScope.learnedAtomIds, [atom.id]);
  assert.equal(currentScope.mappingSnapshots[0].version, approved.version); assert.equal(currentScope.textbookRevision, book.version);
  const after = await assess(studentId); assert.equal(after.scopeSnapshot.textbookRevision, book.version);
  assert.deepEqual(after.scopeSnapshot.uncoveredLessonIds, [second.id]);
  await call('GET', `/diagnostics/sessions/${after.id}`, undefined, 'outsider', 403);
  await stop(); await start();
  assert.deepEqual(await call('GET', `/students/${studentId}/learning-scope?subject=chinese`), currentScope);
  assert.deepEqual((await call('GET', `/diagnostics/sessions/${before.id}`)).scopeSnapshot, before.scopeSnapshot);
  assert.deepEqual((await call('GET', `/diagnostics/sessions/${after.id}`)).scopeSnapshot, after.scopeSnapshot);
  const restoredBook = await call('GET', '/admin/curriculum/textbooks/' + encodeURIComponent(bookId), undefined, 'admin');
  assert.equal(restoredBook.chapters[0].lessons[0].mapping.version, 2);
  evidence.textbooks = { books: bookCount, entries, instructionalEntries: lessons, references: entries - lessons, combinedParts: parts };
  evidence.recovery = { restarts: 2, oldBookRevision: oldScope.textbookRevision, newBookRevision: currentScope.textbookRevision,
    oldAndNewAssessmentScopesPreserved: true, oldKnowledgeSelectionPreserved: true, candidateNeverEntersScope: true,
    reviewedMapSurvivesRestart: true, remainingLessonGapPreserved: true, referencesAndCrossTermMapsRejected: true, formalRateLimitsEnabled: true };
  await stop();
  if (driver === 'sqlite' && fs.existsSync(path.join(root, 'data/assets/textbook-sources/public-v1/index.json'))) {
    const backup = require('../operations/backup.cjs');
    const bundle = path.join(temporary, 'bundle'), restored = path.join(temporary, 'restored');
    const saved = await backup.createBundle({ dataDir: directory, destination: bundle, assets: path.join(root, 'data/assets/textbook-sources/public-v1') });
    const receipt = await backup.restoreBundle({ bundle, destination: restored });
    assert(receipt.revokedSessions >= 3, 'Restored authentication sessions must be revoked');
    const restoredAssets = path.join(restored, 'assets'), manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
    let independentCount = 0;
    for (const file of manifest.files.filter(file => file.path.startsWith('assets/'))) {
      const body = fs.readFileSync(path.join(restored, file.path));
      assert.equal(body.length, file.size); assert.equal(createHash('sha256').update(body).digest('hex'), file.sha256); independentCount++;
    }
    assert.equal(independentCount, saved.assetCount);
    assert.deepEqual(fs.readFileSync(path.join(restoredAssets, 'index.json')), fs.readFileSync(path.join(root, 'data/assets/textbook-sources/public-v1/index.json')));
    evidence.sourceRecovery = { scope: 'New private textbook sources only; distinct from the previous 396135-asset full-backup candidate',
      assets: independentCount, bytes: manifest.files.filter(file => file.path.startsWith('assets/')).reduce((sum, f) => sum + f.size, 0),
      allRestoredSha256VerifiedIndependently: true, databaseRestoredWithRevocationFence: true, revokedSessions: receipt.revokedSessions,
      sourceIndexExact: true, backupId: saved.id };
  }
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) {
    try {
      if (qaDatabase && /^study_textbook_[a-f0-9]{32}$/.test(qaDatabase)) {
        await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]);
        await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
      }
    } finally { await adminPool.end(); }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, textbooks: evidence.textbooks, recovery: evidence.sourceRecovery, error: evidence.error }));
  const target = path.resolve(temporary);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-textbook-runtime-')) throw new Error('Unexpected temporary target');
  fs.rmSync(target, { recursive: true, force: true });
});
