// Exercises only an independently verified, fenced synthetic backup recovery.
// Keeps the recovered directory and all original learning facts for inspection.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..');
if (process.argv.length !== 5) throw new Error('Usage: verify-full-restore-runtime <recovered directory> <independent asset verification> <evidence>');
const directory = fs.realpathSync(process.argv[2]), output = path.resolve(process.argv[4]);
const verified = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'restore-receipt.json'), 'utf8'));
assert.equal(verified.passed, true); assert.equal(verified.errors, 0); assert.equal(verified.files, 396135);
assert.equal(receipt.backupId, verified.backupId); assert.equal(receipt.backupId, 'ceee8518-e5b8-460e-aeb4-f61d95197441');
assert.equal(receipt.assetsIncluded, true); assert.equal(receipt.sourceRevision, 85);
const assets = fs.realpathSync(path.join(directory, 'assets')), database = path.join(directory, 'study-agent.sqlite3');
assert.notEqual(directory, path.resolve(root, 'data')); assert.notEqual(assets, path.resolve(root, 'data/assets'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const collections = ['diagnosticSessions', 'diagnosticResponses', 'diagnosticReports', 'diagnosticHypotheses', 'diagnosticPlans',
  'guidancePlanRevisions', 'practiceSessions', 'practiceAttempts', 'practiceHints', 'assistantSessions', 'assistantMessages',
  'learningScopes', 'scoringRevisions', 'reviewTasks', 'evidenceFeedback', 'importFiles', 'importPages', 'processingArtifacts', 'sessions'];
function readDatabase(action) { const db = new DatabaseSync(database, { readOnly: true }); try { return action(db); } finally { db.close(); } }
const rows = (db, collection) => db.prepare('SELECT record_id,body FROM domain_records WHERE collection=? ORDER BY record_id').all(collection);
const values = collection => readDatabase(db => rows(db, collection).map(row => JSON.parse(row.body)));
const schema = () => readDatabase(db => db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version));
const snapshot = () => readDatabase(db => Object.fromEntries(collections.map(collection => [collection,
  rows(db, collection).map(row => ({ id: row.record_id, sha256: hash(row.body) }))])));
const baselinePath = path.join(directory, 'qa-acceptance/legacy-baseline.json');
let baseline;
if (fs.existsSync(baselinePath)) {
  baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')); assert.equal(baseline.backupId, receipt.backupId);
} else {
  assert.deepEqual(schema(), [1, 2, 3], 'Take the immutable-fact baseline before upgrading');
  assert(values('users').every(user => /^qa-/.test(user.principal) || user.role === 'student' && user.principal === `@learner/${user.id}`));
  baseline = { backupId: receipt.backupId, at: new Date().toISOString(), schema: schema(), facts: snapshot() };
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true }); fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
}
const evidence = { at: new Date().toISOString(), passed: false, backupId: receipt.backupId,
  scope: 'The complete independently verified restored assets and an older schema-3 synthetic QA business snapshot, upgraded and exercised by current production-mode application code. No real-family recovery, browser or calibrated measurement acceptance.',
  assets: { files: verified.files, bytes: verified.bytes, manifestSha256: verified.manifestSha256, independentErrors: verified.errors },
  schemaBefore: baseline.schema, sourceSha256: Object.fromEntries(['scripts/qa/verify-full-restore-runtime.cjs',
    'apps/api/src/infrastructure/domain-database.ts', 'apps/api/src/modules/diagnostics/diagnostics.service.ts',
    'apps/api/src/modules/diagnostics/guidance.service.ts', 'apps/api/src/modules/learning/learning.service.ts',
    'apps/api/src/modules/library/library.repository.ts'].map(file => [file, hash(fs.readFileSync(path.join(root, file)))])) };
function compareLegacy() {
  const current = snapshot();
  return Object.fromEntries(collections.map(collection => {
    const byId = new Map(current[collection].map(row => [row.id, row.sha256]));
    for (const row of baseline.facts[collection]) assert.equal(byId.get(row.id), row.sha256, `Original ${collection} fact changed`);
    const aggregate = hash(JSON.stringify(baseline.facts[collection]));
    return [collection, { originalCount: baseline.facts[collection].length, preserved: true, originalIdAndBodySha256: aggregate }];
  }));
}
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_ASSET_ROOT: assets,
  STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'true' });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const { LibraryRepository } = require('../../apps/api/dist/apps/api/src/modules/library/library.repository.js');
let app, store, repo, base;
const tokens = {}, runId = randomUUID(), credential = randomBytes(24).toString('hex');
async function start() {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  store = app.get(InMemoryStoreService); repo = app.get(LibraryRepository); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function call(method, route, body, actor = 'parent', expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${result.error?.message ?? ''}`);
  return result.data;
}
async function binary(route, expectedHash, expectedSize) {
  const response = await fetch(new URL(route, base + '/'), { headers: { Authorization: `Bearer ${tokens.admin}` }, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `Recovered media or artifact ${route}`); const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, expectedSize); assert.equal(hash(bytes), expectedHash); return bytes.length;
}
async function main() {
  const oldSessions = values('sessions').filter(row => baseline.facts.sessions.some(old => old.id === row.id));
  assert(oldSessions.length && oldSessions.every(row => row.revokedAt), 'Every old login remains revoked');
  evidence.originalSessionsRevoked = oldSessions.length;
  const adminName = `qa-full-restore-admin-${runId}`;
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', adminName],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(boot.status, 0, 'Formal local administrator bootstrap on recovered database');
  evidence.schemaAfter = schema(); assert.deepEqual(evidence.schemaAfter, [1, 2, 3, 4, 5, 6, 7, 8]); compareLegacy();
  await start(); assert.equal(repo.root, assets); await call('GET', '/ready', undefined, 'anonymous');
  tokens.admin = (await call('POST', '/auth/login', { principal: adminName, credential }, 'anonymous')).token;
  const legacyReads = { assessmentSessions: 0, reports: 0, plans: 0, practices: 0, artifacts: 0, importFilesVerified: 0 };
  for (const { id } of baseline.facts.diagnosticSessions) {
    assert.equal((await call('GET', `/diagnostics/sessions/${encodeURIComponent(id)}`, undefined, 'admin')).id, id);
    const report = await call('GET', `/diagnostics/sessions/${encodeURIComponent(id)}/report`, undefined, 'admin');
    assert.equal(report.sessionId, id); legacyReads.assessmentSessions++; legacyReads.reports++;
  }
  for (const { id } of baseline.facts.diagnosticPlans) { assert.equal((await call('GET', `/diagnostics/plans/${encodeURIComponent(id)}`, undefined, 'admin')).id, id); legacyReads.plans++; }
  for (const { id } of baseline.facts.practiceSessions) { assert.equal((await call('GET', `/learning/practice/${encodeURIComponent(id)}`, undefined, 'admin')).id, id); legacyReads.practices++; }
  for (const artifact of values('processingArtifacts')) { await binary(`/api/admin/processing/artifacts/${encodeURIComponent(artifact.id)}`, artifact.sha256, artifact.size); legacyReads.artifacts++; }
  for (const file of values('importFiles').filter(row => row.status === 'ready')) {
    const bytes = fs.readFileSync(path.join(directory, 'processing/blobs', file.sha256)); assert.equal(hash(bytes), file.sha256); assert.equal(bytes.length, file.size);
    await call('GET', `/admin/import-files/${encodeURIComponent(file.id)}`, undefined, 'admin', 403); legacyReads.importFilesVerified++;
  }
  evidence.legacyReads = legacyReads; console.log('Legacy reports, plans, practices and processing files verified');
  const previews = []; let pdfRoute;
  for (const state of ['complete', 'partial', 'pdf']) {
    const found = await call('GET', `/library/papers?collection=research&state=${state}&pageSize=3`, undefined, 'admin'); assert(found.total > 0);
    const paper = await call('GET', `/library/papers/${encodeURIComponent(found.items[0].id)}`, undefined, 'admin'); assert.equal(paper.state, state);
    if (state === 'partial') assert(paper.questions.some(question => question.missing));
    if (state === 'pdf') { assert(paper.pdf); pdfRoute = paper.pdf; }
    previews.push({ state, total: found.total, id: paper.id, questions: paper.questions.length, missingMedia: paper.missingMedia });
  }
  const pdfUrl = new URL(pdfRoute, 'http://localhost').searchParams.get('url'), media = repo.media(pdfUrl);
  assert(media && fs.realpathSync(media.path).startsWith(assets + path.sep)); await binary(pdfRoute, media.sha256, media.size);
  evidence.paperLibrary = { ready: true, previews, pdfBytes: media.size, pdfSha256: media.sha256, servedFromRestoredAssetRoot: true };
  tokens.parent = (await call('POST', '/auth/register', { principal: `qa-full-restore-parent-${runId}`, credential }, 'anonymous')).token;
  const studentId = (await call('POST', '/students', { nickname: '恢复后学习合成QA', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile.id;
  const atomId = 'foundation:math:multiplydigits';
  await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创能力路径', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
  await call('POST', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '恢复后使用正式学习身份完成评测与训练核验。' });
  const code = await call('POST', `/students/${studentId}/learning-access/codes`, { expectedVersion: 1, requestKey: randomUUID() });
  tokens.learner = (await call('POST', '/auth/learning-code', { code: code.code }, 'anonymous')).token;
  const preview = await call('POST', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [atomId],
    maxItems: 4, includePrerequisites: false, adaptive: true, requestKey: randomUUID() }, 'learner'); assert(preview.canStart);
  let session = await call('POST', `/diagnostics/blueprints/${encodeURIComponent(preview.id)}/start`, {}, 'learner');
  const current = session.items.find(item => item.id === session.routing.currentItemId);
  await call('PATCH', `/diagnostics/sessions/${session.id}/items/${current.id}/draft`, { answer: 0 }, 'learner');
  await stop(); await start();
  assert.equal((await call('GET', '/auth/me', undefined, 'learner')).studentId, studentId);
  assert.equal((await call('GET', `/diagnostics/sessions/${session.id}/items/${current.id}`, undefined, 'learner')).draft, 0);
  while (session.routing.currentItemId) {
    await call('POST', `/diagnostics/sessions/${session.id}/responses`, { itemId: session.routing.currentItemId, answer: 0, elapsedMs: 1500, requestKey: randomUUID() }, 'learner');
    session = await call('GET', `/diagnostics/sessions/${session.id}`, undefined, 'learner');
  }
  await call('POST', `/diagnostics/sessions/${session.id}/complete`, {}, 'learner');
  const report = await call('GET', `/diagnostics/sessions/${session.id}/report`, undefined, 'learner'); assert.equal(report.scoredCount, session.totalCount);
  assert.equal((await call('GET', `/diagnostics/students/${studentId}/evidence/${encodeURIComponent(report.evidence[0].id)}`, undefined, 'learner')).response.id, report.evidence[0].id);
  let plan = await call('POST', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: session.id, minutesPerDay: 15, useAi: true });
  assert.equal(plan.aiStatus, 'unavailable'); assert.equal(plan.source, 'rules');
  plan = await call('PATCH', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision });
  const practice = await call('POST', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {}, 'learner');
  for (const question of practice.questions) await call('POST', `/learning/practice/${practice.id}/responses`, {
    questionId: question.id, answer: 0, elapsedMs: 1500, requestKey: randomUUID() }, 'learner');
  assert.equal((await call('POST', `/learning/practice/${practice.id}/complete`, {}, 'learner')).status, 'completed');
  const reviews = await call('GET', `/diagnostics/plans/${plan.id}/reviews`); assert.deepEqual([...new Set(reviews.map(review => review.intervalDays))].sort((a, b) => a - b), [1, 3, 7, 14]);
  await call('POST', `/diagnostics/reviews/${encodeURIComponent(reviews[0].id)}/start`, {}, 'learner', 400);
  const retrospective = await call('GET', `/diagnostics/plans/${plan.id}/retrospective`);
  await stop(); await start();
  assert.deepEqual(await call('GET', `/diagnostics/sessions/${session.id}/report`), report);
  assert.equal((await call('GET', `/learning/practice/${practice.id}`, undefined, 'learner')).status, 'completed');
  assert.deepEqual(await call('GET', `/diagnostics/plans/${plan.id}/reviews`), reviews);
  assert.equal((await call('GET', `/diagnostics/plans/${plan.id}/retrospective`)).fingerprint, retrospective.fingerprint);
  evidence.newLearning = { formalParentAndLearner: true, scopeAndFrozenBlueprint: true, assessmentDraftSurvivesRestart: true,
    responseCount: report.scoredCount, evidenceAvailableToLearnerAfterEnd: true, noKeyGuidanceFallback: true,
    completedPracticeQuestions: practice.questions.length, scheduledIntervals: [1, 3, 7, 14], prematureRetestBlocked: true,
    reportPracticeScheduleAndRetrospectiveSurviveRestart: true, restarts: 2 };
  evidence.legacyFacts = compareLegacy(); evidence.schemaAfter = schema(); evidence.passed = true; evidence.completedAt = new Date().toISOString();
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop(); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, error: evidence.error, legacyReads: evidence.legacyReads, newLearning: evidence.newLearning }));
});
