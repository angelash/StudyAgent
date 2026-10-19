// Owned synthetic database; production-mode HTTP, concurrent requests and restarts.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-blueprint-runtime-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/assessment-blueprint-runtime.json');
const driver = process.argv[3] ?? 'sqlite';
if (!['sqlite', 'postgres'].includes(driver)) throw new Error('Expected sqlite or postgres');
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const evidence = { at: new Date().toISOString(), driver, passed: false,
  scope: 'Synthetic family, original authored tasks, real HTTP and three restarts; an explicitly altered QA due date tests queue release, not genuine delayed retention. No browser acceptance.',
  sourceSha256: Object.fromEntries(['apps/api/src/modules/diagnostics/assessment-blueprint.ts', 'apps/api/src/modules/diagnostics/diagnostics.service.ts',
    'apps/api/src/modules/privacy/privacy-records.ts', 'apps/web/app/student/assessment/studio.tsx', 'apps/web/components/assessment-blueprint.tsx'].map(file =>
    [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
let app, store, base, adminPool, qaDatabase;
const tokens = {};
async function start() {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function raw(method, route, body, actor = 'parent') {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); return { status: response.status, data: result.data, error: result.error?.message };
}
async function call(method, route, body, actor = 'parent', expected = method === 'POST' ? 201 : 200) {
  const result = await raw(method, route, body, actor);
  assert.equal(result.status, expected, `${method} ${route}: ${result.error ?? ''}`); return result.data;
}
const preview = command => call('POST', '/diagnostics/blueprints', { ...command, requestKey: randomUUID() });
const begin = id => call('POST', `/diagnostics/blueprints/${encodeURIComponent(id)}/start`, {});
const state = (id, action, revision, key) => call('POST', `/diagnostics/sessions/${id}/state`, { action, expectedRevision: revision,
  requestKey: key, reason: '合成环境核对评测状态、草稿、首次作答和幂等回执的持久恢复。' });
async function main() {
  if (driver === 'postgres') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
    if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.appUser !== 'study_agent_app') throw new Error('Expected the owned local QA cluster');
    adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
    qaDatabase = 'study_blueprint_' + randomUUID().replaceAll('-', '');
    await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
    const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
    try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
    const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
    process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
  }
  const credential = randomBytes(24).toString('hex');
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-assessment-blueprint'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(boot.status, 0, 'Formal administrator bootstrap');
  await start();
  tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-assessment-blueprint', credential }, 'anonymous')).token;
  for (const actor of ['parent', 'outsider']) tokens[actor] = (await call('POST', '/auth/register',
    { principal: `qa-blueprint-${actor}`, credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
  const studentId = (await call('POST', '/students', { nickname: '合成蓝图恢复核验', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile.id;
  const atomId = 'foundation:math:multiplydigits';
  const scope = { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null, textbookVersion: '原创能力路径',
    learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 };
  await call('PUT', `/students/${studentId}/learning-scope`, scope);
  const command = { studentId, subject: 'math', intent: 'baseline', maxItems: 4, includePrerequisites: false };
  const initial = await preview(command);
  // This authored atom has two independent families; extra number variants cannot fill the budget.
  assert.equal(initial.itemCount, 2); assert(initial.canStart);
  assert(!JSON.stringify(initial).includes('gradingConfig')); assert(!('command' in initial));
  assert.equal(await store.transaction(() => store.inspect('diagnosticSessions').length), 0);
  await call('GET', `/diagnostics/blueprints/${encodeURIComponent(initial.id)}`, undefined, 'outsider', 404);
  await stop(); await start();
  assert.deepEqual(await call('GET', `/diagnostics/blueprints/${encodeURIComponent(initial.id)}`), initial);
  const parallel = await Promise.all([raw('POST', `/diagnostics/blueprints/${encodeURIComponent(initial.id)}/start`, {}),
    raw('POST', `/diagnostics/blueprints/${encodeURIComponent(initial.id)}/start`, {})]);
  assert(parallel.some(result => result.status === 201), JSON.stringify(parallel.map(row => ({ status: row.status, error: row.error }))));
  assert(parallel.every(result => [201, 409].includes(result.status)));
  const session = await begin(initial.id);
  assert(parallel.filter(result => result.status === 201).every(result => result.data.id === session.id));
  assert.deepEqual(session.blueprint, initial.blueprint);
  assert.deepEqual(session.items.map(item => item.id), initial.blueprint.groups.flatMap(group => group.itemIds));
  assert.equal(await store.transaction(() => store.inspect('diagnosticSessions').length), 1);
  await call('POST', `/diagnostics/sessions/${session.id}/responses`, { itemId: session.items[0].id, answer: 0, elapsedMs: 1800 });
  const draft = { questionId: session.items[1].questionId, mode: 'numeric_blank', response: { value: '42' } };
  await call('PATCH', `/diagnostics/sessions/${session.id}/items/${session.items[1].id}/draft`, { answer: draft });
  const paused = await state(session.id, 'pause', 1, 'qa-blueprint-pause');
  assert.equal(paused.status, 'paused'); assert.equal(paused.revision, 2);
  await call('POST', `/diagnostics/sessions/${session.id}/responses`, { itemId: session.items[1].id, answer: 42, elapsedMs: 2000 }, 'parent', 400);
  await stop(); await start();
  assert.equal((await call('GET', `/diagnostics/sessions/${session.id}`)).status, 'paused');
  assert.deepEqual((await call('GET', `/diagnostics/sessions/${session.id}/items/${session.items[1].id}`)).draft, draft);
  assert.equal((await state(session.id, 'pause', 1, 'qa-blueprint-pause')).revision, 2);
  assert.equal((await call('GET', `/learning/students/${studentId}/today?subject=math`)).incompleteAssessments[0].status, 'paused');
  await state(session.id, 'resume', 2, 'qa-blueprint-resume');
  await state(session.id, 'abort', 3, 'qa-blueprint-abort');
  const partial = await call('GET', `/diagnostics/sessions/${session.id}/report`);
  assert.equal(partial.status, 'aborted'); assert.equal(partial.scoredCount, 1); assert.equal(partial.rawScore, 0); assert.equal(partial.totalCount, initial.itemCount);
  await call('POST', `/admin/diagnostic-responses/${encodeURIComponent(partial.evidence[0].id)}/review`,
    { score: 1, reason: '合成部分报告评分修订，保留原始作答与每一版报告', requestKey: 'qa-partial-review', expectedVersion: 0 }, 'admin');
  assert.deepEqual((await call('GET', `/diagnostics/sessions/${session.id}/report-history`)).map(row => row.rawScore), [100, 0]);
  const stale = await preview(command);
  await call('PUT', `/students/${studentId}/learning-scope`, { ...scope, minutesPerSession: 20 });
  await call('POST', `/diagnostics/blueprints/${encodeURIComponent(stale.id)}/start`, {}, 'parent', 409);
  const expired = await preview(command);
  await store.transaction(() => { store.find('diagnosticBlueprints', { id: expired.id }).expiresAt = new Date(Date.now() - 1).toISOString(); });
  await call('POST', `/diagnostics/blueprints/${encodeURIComponent(expired.id)}/start`, {}, 'parent', 409);
  const baseline = await begin((await preview({ ...command, maxItems: 2 })).id);
  for (const item of baseline.items) await call('POST', `/diagnostics/sessions/${baseline.id}/responses`, { itemId: item.id, answer: 0, elapsedMs: 1000 });
  await call('POST', `/diagnostics/sessions/${baseline.id}/complete`, {});
  const plan = await call('POST', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 10, useAi: false });
  await call('PATCH', `/diagnostics/plans/${plan.id}`, { expectedRevision: plan.revision, status: 'active' });
  const review = (await call('GET', `/diagnostics/plans/${plan.id}/reviews`))[0];
  await store.transaction(() => { store.find('reviewTasks', { id: review.id }).dueAt = new Date(Date.now() - 1000).toISOString(); });
  const retestCommand = { studentId, subject: 'math', intent: 'retest', reviewTaskId: review.id };
  const first = await begin((await preview(retestCommand)).id);
  await state(first.id, 'abort', 1, 'qa-abort-delayed-review');
  const next = await begin((await preview(retestCommand)).id);
  assert.notEqual(next.id, first.id); assert(next.items.every(item => !first.items.some(old => old.questionId === item.questionId)));
  await stop(); await start();
  assert.equal((await call('GET', `/diagnostics/sessions/${session.id}`)).stateHistory.length, 3);
  assert.equal((await call('GET', `/diagnostics/sessions/${session.id}/report`)).version, 2);
  assert.equal((await begin(initial.id)).id, session.id);
  const restoredTask = (await call('GET', `/diagnostics/plans/${plan.id}/reviews`)).find(item => item.id === review.id);
  assert.equal(restoredTask.sessionId, next.id); assert.equal(restoredTask.status, 'in_progress');
  evidence.result = { concurrentStatuses: parallel.map(result => result.status), oneSessionPerPreview: true, previewRestoresBeforeStart: true,
    exactGroupsPreserved: true, previewDoesNotExposeAnswersOrCreateLearningEvidence: true, actorIsolation: true,
    draftAndPausedStateSurviveRestart: true, lostPauseReceiptReplays: true, partialReportOnlyCountsAnsweredItems: true,
    partialReportRevisionHistory: [100, 0], changedScopeAndExpiredPreviewBlocked: true,
    abortedRetestReleasedAndNewQuestionsSelected: true, historyAndReceiptsSurviveRestart: true, restarts: 3 };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) {
    try {
      if (qaDatabase && /^study_blueprint_[a-f0-9]{32}$/.test(qaDatabase)) {
        await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]);
        await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
      }
    } finally { await adminPool.end(); }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, result: evidence.result, error: evidence.error }));
  const target = path.resolve(directory);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-blueprint-runtime-')) throw new Error('Unexpected temporary cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
