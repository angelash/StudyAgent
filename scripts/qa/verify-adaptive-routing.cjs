// Owned temporary databases; real production-mode HTTP, reviewed original items and restarts.
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
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-routing-runtime-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/adaptive-routing-runtime.json');
const driver = process.argv[3] ?? 'sqlite';
if (!['sqlite', 'postgres'].includes(driver)) throw new Error('Expected sqlite or postgres');
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const evidence = { at: new Date().toISOString(), driver, passed: false,
  scope: 'Synthetic family, reviewed original math tasks, real HTTP, concurrent requests and three API restarts. Bounded frozen-item routing, not calibrated CAT or browser acceptance.',
  sourceSha256: Object.fromEntries(['apps/api/src/common/auth.guard.ts', 'apps/api/src/modules/diagnostics/guidance.service.ts',
    'apps/api/src/modules/diagnostics/adaptive-routing.ts', 'apps/api/src/modules/diagnostics/assessment-blueprint.ts',
    'apps/api/src/modules/diagnostics/diagnostics.service.ts', 'apps/api/src/modules/diagnostics/diagnosis.ts', 'apps/api/src/modules/diagnostics/observations.ts',
    'apps/api/src/modules/diagnostics/scoring.ts', 'apps/api/src/modules/ai/ai.service.ts', 'apps/api/src/modules/student-media/student-media.service.ts',
    'apps/web/app/student/assessment/studio.tsx', 'apps/web/components/diagnostic-evidence.tsx',
    'packages/contracts/src/diagnostics.ts'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
let app, store, base, adminPool, qaDatabase;
const tokens = {};
async function start() {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function raw(method, route, body, actor = 'parent') {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); return { status: response.status, data: result.data, error: result.error?.message };
}
async function call(method, route, body, actor = 'parent', expected = method === 'POST' ? 201 : 200) {
  const result = await raw(method, route, body, actor); assert.equal(result.status, expected, `${method} ${route}: ${result.error ?? ''}`); return result.data;
}
const get = id => call('GET', `/diagnostics/sessions/${id}`);
const begin = id => call('POST', `/diagnostics/blueprints/${encodeURIComponent(id)}/start`, {});
const current = session => session.items.find(item => item.id === session.routing.currentItemId);
const savedRouting = id => store.transaction(() => structuredClone(store.find('diagnosticSessions', { id }).routing));
const state = (session, action) => call('POST', `/diagnostics/sessions/${session.id}/state`, { action, expectedRevision: session.revision,
  requestKey: randomUUID(), reason: '合成运行核验冻结题组、逐题顺序与首次响应在重启后完整恢复。' });
async function main() {
  if (driver === 'postgres') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
    if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.appUser !== 'study_agent_app') throw new Error('Expected owned QA cluster');
    adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
    qaDatabase = 'study_routing_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
    const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
    try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
    const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
    process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
  }
  const credential = randomBytes(24).toString('hex');
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-routing'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(boot.status, 0, 'Formal administrator bootstrap');
  await start();
  tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-routing', credential }, 'anonymous')).token;
  for (const actor of ['parent', 'outsider']) tokens[actor] = (await call('POST', '/auth/register', { principal: `qa-routing-${actor}`, credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
  const studentId = (await call('POST', '/students', { nickname: '合成在线核查', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile.id;
  const atomId = 'foundation:math:multiplydigits';
  await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创能力路径', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
  const command = { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [atomId], includePrerequisites: true, maxItems: 12, adaptive: true, requestKey: randomUUID() };
  const preview = await call('POST', '/diagnostics/blueprints', command);
  assert(preview.canStart); assert.equal(preview.blueprint.routing.mode, 'adaptive');
  assert(!JSON.stringify(preview).includes('decisions')); assert(!JSON.stringify(preview).includes('gradingConfig'));
  await stop(); await start();
  assert.deepEqual(await call('GET', `/diagnostics/blueprints/${encodeURIComponent(preview.id)}`), preview);
  const started = await Promise.all([raw('POST', `/diagnostics/blueprints/${encodeURIComponent(preview.id)}/start`, {}), raw('POST', `/diagnostics/blueprints/${encodeURIComponent(preview.id)}/start`, {})]);
  assert(started.every(row => [201, 409].includes(row.status))); assert(started.some(row => row.status === 201));
  let session = await begin(preview.id); const sessionId = session.id, first = current(session);
  assert.equal(first.atomId, atomId); assert(!('decisions' in session.routing));
  const initialIds = new Set(preview.blueprint.groups.flatMap(group => group.itemIds));
  assert.deepEqual(new Set(session.items.map(item => item.id)), initialIds);
  const future = session.items.find(item => item.id !== first.id);
  await call('GET', `/diagnostics/sessions/${sessionId}/items/${future.id}`, undefined, 'parent', 409);
  await call('PATCH', `/diagnostics/sessions/${sessionId}/items/${future.id}/draft`, { answer: 0 }, 'parent', 400);
  await call('POST', `/diagnostics/sessions/${sessionId}/items/${future.id}/hint`, {}, 'parent', 400);
  await call('POST', `/diagnostics/sessions/${sessionId}/responses`, { itemId: future.id, answer: 0, elapsedMs: 1000 }, 'parent', 409);
  await call('POST', '/ai/assistant/sessions', { userRole: 'student', studentId, subject: 'math', pageContext: 'assessment', contextRefType: 'diagnostic', contextRefId: sessionId, contextItemId: future.id }, 'parent', 400);
  await call('POST', '/learning/media', { kind: 'diagnostic', sessionId, itemId: future.id, name: '作答.png', mediaType: 'image/png', size: 100, requestKey: randomUUID() }, 'parent', 409);
  await call('GET', `/diagnostics/sessions/${sessionId}`, undefined, 'outsider', 403);
  const body = { itemId: first.id, answer: -999999, elapsedMs: 1200, requestKey: randomUUID() };
  const submitted = await Promise.all([raw('POST', `/diagnostics/sessions/${sessionId}/responses`, body), raw('POST', `/diagnostics/sessions/${sessionId}/responses`, body)]);
  assert(submitted.every(row => [201, 409].includes(row.status))); assert(submitted.some(row => row.status === 201));
  const replay = await call('POST', `/diagnostics/sessions/${sessionId}/responses`, body);
  assert(submitted.filter(row => row.status === 201).every(row => row.data.responseId === replay.responseId));
  await call('GET', `/diagnostics/sessions/${sessionId}/report`, undefined, 'parent', 409);
  await call('GET', `/diagnostics/sessions/${sessionId}/report-history`, undefined, 'parent', 409);
  const evidencePath = `/diagnostics/students/${studentId}/evidence/${encodeURIComponent(replay.responseId)}`;
  await call('GET', evidencePath, undefined, 'parent', 409);
  const unfinishedProfile = await call('GET', `/diagnostics/students/${studentId}/profile?subject=math`);
  assert(unfinishedProfile.estimates.every(estimate => estimate.status === 'unknown' && estimate.scoredCount === 0));
  session = await get(sessionId); const checkpoint = await savedRouting(sessionId);
  assert.equal(checkpoint.decisions.length, 2); assert.equal(checkpoint.decisions[1].rule, 'prerequisite_probe');
  assert.equal(checkpoint.decisions[1].basis[0].correct, false);
  const draft = { questionId: current(session).questionId, mode: 'numeric_blank', response: { value: '42' } };
  await call('PATCH', `/diagnostics/sessions/${sessionId}/items/${current(session).id}/draft`, { answer: draft });
  session = await state(session, 'pause');
  await stop(); await start();
  session = await get(sessionId); assert.equal(session.status, 'paused'); assert.deepEqual(await savedRouting(sessionId), checkpoint);
  assert.deepEqual((await call('GET', `/diagnostics/sessions/${sessionId}/items/${current(session).id}`)).draft, draft);
  await call('POST', `/diagnostics/sessions/${sessionId}/responses`, { itemId: current(session).id, answer: 42, elapsedMs: 1000 }, 'parent', 400);
  session = await state(session, 'resume');
  const answer = await store.transaction(() => store.find('diagnosticSessions', { id: sessionId }).questionSnapshots.find(question => question.id === current(session).questionId).answer);
  await call('POST', `/diagnostics/sessions/${sessionId}/responses`, { itemId: current(session).id, answer, elapsedMs: 1000 });
  session = await get(sessionId); assert.equal(current(session).atomId, atomId);
  assert.equal((await savedRouting(sessionId)).decisions.at(-1).rule, 'return_to_target');
  while (session.routing.currentItemId) {
    await call('POST', `/diagnostics/sessions/${sessionId}/responses`, { itemId: current(session).id, disposition: 'skip', elapsedMs: 1000 });
    session = await get(sessionId);
  }
  assert.equal(session.answeredCount, preview.itemCount); assert.equal(session.routing.currentItemId, null); assert(!('decisions' in session.routing));
  const report = await call('POST', `/diagnostics/sessions/${sessionId}/complete`, {});
  assert.equal(report.observations.length, preview.itemCount);
  let detail = await call('GET', evidencePath);
  assert.equal(detail.response.correct, false); assert.equal(detail.observation.kind, 'below_standard');
  assert.deepEqual(detail.payload.answerSchema.gradingConfig, {}); assert.equal(detail.payload.source.sourcePathOrUrl, '');
  await call('GET', evidencePath, undefined, 'outsider', 403);
  session = await get(sessionId); const history = session.routing.decisions;
  assert.equal(history.length, preview.itemCount); assert.deepEqual(new Set(history.map(row => row.itemId)), initialIds);
  assert.deepEqual(session.blueprint, preview.blueprint); assert(report.estimates.every(row => row.status !== 'secure'));
  await call('POST', `/admin/diagnostic-responses/${encodeURIComponent(replay.responseId)}/review`, { score: 1,
    reason: '合成评分修订验证当时选题依据保留原始评分', requestKey: randomUUID(), expectedVersion: 0 }, 'admin');
  assert.deepEqual((await get(sessionId)).routing.decisions, history);
  detail = await call('GET', evidencePath); assert.equal(detail.originalResponse.score, 0); assert.equal(detail.response.score, 1);
  assert.equal(detail.revisions.length, 1); assert.equal(detail.observation.kind, 'meets_standard');
  await call('POST', '/diagnostics/blueprints', { ...command, intent: 'retest', requestKey: randomUUID() }, 'parent', 400);
  const targetQuestionCount = await store.transaction(() => store.select('measurementItems', { atomId }).length);
  let aborted;
  // New variants stay independent. Exhaust the finite approved set through actual session
  // reservations before asserting the deliberately conservative prior-reservation boundary.
  for (let attempt = 0; attempt <= targetQuestionCount; attempt++) {
    aborted = await call('POST', '/diagnostics/sessions', { ...command, requestKey: undefined, includePrerequisites: false, maxItems: 4 });
    const exposed = await store.transaction(() => store.find('diagnosticSessions', { id: aborted.id }).exposedQuestionIds.includes(current(aborted).questionId));
    if (exposed) break;
  }
  await call('POST', `/diagnostics/sessions/${aborted.id}/responses`, { itemId: current(aborted).id, answer: -999999, elapsedMs: 1000 });
  aborted = await state(await get(aborted.id), 'abort');
  assert(['uncertain_followup', 'coverage'].includes(aborted.routing.decisions[1].rule)); assert.equal(aborted.routing.decisions[1].basis[0].priorExposure, true);
  await stop(); await start();
  assert.deepEqual((await get(sessionId)).routing.decisions, history); assert.equal((await get(sessionId)).status, 'completed');
  assert.equal((await begin(preview.id)).id, sessionId);
  assert.deepEqual((await get(aborted.id)).routing, aborted.routing);
  assert.equal((await call('GET', `/diagnostics/sessions/${sessionId}/report`)).version, 2);
  const restoredEvidence = await call('GET', evidencePath); assert.deepEqual(restoredEvidence, detail);
  evidence.result = { concurrentStartStatuses: started.map(row => row.status), concurrentResponseStatuses: submitted.map(row => row.status),
    samePreviewAndFirstResponseReplayedOnce: true, frozenItemCount: preview.itemCount, futureItemPathsBlocked: ['render', 'draft', 'hint', 'submit', 'assistant', 'media'],
    actorIsolation: true, nearestPrerequisiteAndReturnToTarget: true, activeDecisionBasisHidden: true,
    pausedDraftAndRoutingSurviveRestart: true, allFrozenItemsAnsweredOnce: true, rescoringPreservesOriginalRoutingBasis: true,
    adaptiveRetestRejected: true, priorReservedQuestionDoesNotTriggerIndependentFailureRoute: true, abortedAndCompletedHistoryRestored: true,
    unfinishedReportHistoryEvidenceAndProfileDoNotRevealScores: true, observationFactsAndFrozenQuestionAvailableAfterEnd: true,
    originalAndRevisedScoringEvidenceSurviveRestart: true, restarts: 3 };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) {
    try { if (qaDatabase && /^study_routing_[a-f0-9]{32}$/.test(qaDatabase)) {
      await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]); await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
    } } finally { await adminPool.end(); }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, result: evidence.result, error: evidence.error }));
  const target = path.resolve(directory);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-routing-runtime-')) throw new Error('Unexpected temporary cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
