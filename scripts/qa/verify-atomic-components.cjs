// Production HTTP and durable storage with owned synthetic families and an explicitly simulated clock.
require('reflect-metadata');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { randomUUID, randomBytes, createHash } = require('node:crypto'), { spawnSync } = require('node:child_process');
const { NestFactory } = require('@nestjs/core'), { Pool } = require('pg');
const root = path.resolve(__dirname, '../..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-atomic-components-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/atomic-components-runtime.json'), driver = process.argv[3] ?? 'sqlite';
assert(['sqlite', 'postgres'].includes(driver));
const releaseKey = process.argv[4] ?? 'division'; assert(['division', 'average'].includes(releaseKey));
const configuration = releaseKey === 'average' ? { parentId: 'core:math:average', childId: 'atomic:math:averagecount', grade: 4,
  field: 'count', eligible: 72, childPrerequisite: 'core:math:count', directPrerequisites: ['foundation:math:divisiondigits'], teachingMarker: '未记录当0' } : {
  parentId: 'foundation:math:divisiondigits', childId: 'atomic:math:divisionregroup', grade: 3,
  field: 'combinedOnes', eligible: 48, childPrerequisite: 'foundation:math:placevalue', directPrerequisites: ['foundation:math:divisiontable', 'foundation:math:placevalue'], teachingMarker: '本点给定余十' };
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY; delete process.env.STUDY_SEED_FOUNDATION;
const fromApi = file => require(path.join(root, 'apps/api/dist/apps/api/src', file + '.js'));
const { AppModule } = fromApi('app.module'), { InMemoryStoreService } = fromApi('infrastructure/in-memory-store.service');
const { blueprintContentHash } = fromApi('modules/diagnostics/assessment-blueprint');
const { parentId, childId } = configuration;
const files = ['packages/contracts/src/diagnostics.ts', 'apps/api/src/modules/diagnostics/authored-atomic-curriculum.ts',
  'apps/api/src/modules/diagnostics/component-observations.ts', 'apps/api/src/modules/diagnostics/authored-relation-release.ts',
  'apps/api/src/modules/diagnostics/foundation-seed.service.ts', 'apps/api/src/modules/diagnostics/curriculum.service.ts',
  'apps/api/src/modules/diagnostics/diagnostics.service.ts', 'apps/api/src/modules/learning/learning.service.ts',
  'apps/web/components/diagnostic-evidence.tsx', 'apps/web/app/student/assessment/studio.tsx', 'apps/web/app/parent/dashboard/studio.tsx',
  'apps/web/app/admin/curriculum/component-binding-editor.tsx', 'resources/curriculum/authored-atomic-relations-2026-10-20-v1.json',
  'apps/api/src/modules/diagnostics/authored-average-atomic.ts', 'resources/curriculum/authored-average-atomic-relations-2026-10-20-v1.json',
  'apps/api/src/modules/diagnostics/authored-math-probes.ts', 'apps/api/src/modules/diagnostics/foundation-curriculum.ts',
  'apps/api/src/modules/diagnostics/authored-fourth-grade-geometry-statistics-probes.ts', 'resources/curriculum/authored-relations-2026-10-20-v1.json',
  'resources/curriculum/authored-task-baseline-6398-v1.json',
  'scripts/qa/verify-atomic-components.cjs'];
const evidence = { at: new Date().toISOString(), driver, releaseKey, parentId, childId, passed: false,
  scope: 'Owned synthetic accounts, genuine authored tasks, formal learning codes, production-mode HTTP and durable restarts. Two-day clock advance tests retention rules; it is not a real student longitudinal or browser validation.',
  sourceSha256: Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
const tokens = {}, parentPrincipal = 'qa-atomic-parent', parentCredential = randomBytes(24).toString('hex');
let app, store, base, adminPool, qaDatabase, offset = 0, restarts = 0;
const RealDate = Date;
class SyntheticDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(RealDate.now() + offset); }
  static now() { return RealDate.now() + offset; }
}
async function start() {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function restart() { await stop(); await start(); restarts++; }
async function call(method, route, body, actor = 'learner', expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${result.error?.message ?? ''}`); return result.data;
}
const rawSession = id => store.transaction(() => structuredClone(store.find('diagnosticSessions', { id })));
function wrong(expected, schema) {
  if (schema.mode === 'boolean') return !expected;
  if (schema.mode === 'single_choice') return schema.options.find(option => option.value !== expected).value;
  if (schema.mode === 'multi_blank') return expected.map(entry => ({ ...entry, value: Number.isFinite(Number(entry.value)) ? String(Number(entry.value) + 1) : 'QA未达标' }));
  return Number(expected) + 1;
}
async function complete(session, transform = (_item, expected) => expected) {
  const frozen = await rawSession(session.id);
  for (const item of session.items) {
    const packet = frozen.questionSnapshots.find(row => row.id === item.questionId);
    await call('POST', `/diagnostics/sessions/${session.id}/responses`, { itemId: item.id,
      answer: transform(item, structuredClone(packet.answer), packet.answerSchema, frozen.itemSnapshots.find(row => row.id === item.id)), elapsedMs: 1000 });
  }
  return call('POST', `/diagnostics/sessions/${session.id}/complete`, {});
}
async function setupPostgres() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
  assert.equal(config.purpose, 'StudyAgent isolated QA cluster'); assert.equal(config.port, 15439); assert.equal(config.appUser, 'study_agent_app');
  adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
  qaDatabase = 'study_atomic_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
  const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
  try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
  const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
  process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
}
async function learningCode(studentId) {
  const access = await call('GET', `/students/${studentId}/learning-access`, undefined, 'parent');
  const code = await call('POST', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() }, 'parent');
  tokens.learner = (await call('POST', '/auth/learning-code', { code: code.code }, 'anonymous')).token;
}
async function main() {
  if (driver === 'postgres') await setupPostgres();
  const credential = randomBytes(24).toString('hex');
  const bootstrap = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-atomic-admin'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(bootstrap.status, 0, 'Formal administrator bootstrap'); await start();
  tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-atomic-admin', credential }, 'anonymous')).token;
  tokens.parent = (await call('POST', '/auth/register', { principal: parentPrincipal, credential: parentCredential }, 'anonymous')).token;
  tokens.stranger = (await call('POST', '/auth/register', { principal: 'qa-atomic-stranger', credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
  const studentId = (await call('POST', '/students', { nickname: '合成子点评测学生', grade: configuration.grade, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } }, 'parent')).profile.id;
  await call('POST', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '独立核对子点评测与指导计划的持久化' }, 'parent');
  await learningCode(studentId);
  const scope = await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: configuration.grade, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创能力路径', learnedAtomIds: [parentId], currentAtomId: parentId, minutesPerSession: 15 }, 'parent');
  const items = await call('GET', `/admin/curriculum/atoms/${encodeURIComponent(parentId)}/items`, undefined, 'admin');
  assert.equal(items.filter(row => row.eligible).length, configuration.eligible); assert.equal(items.filter(row => row.mapping.componentBindings?.length).length, 12);
  const baseline = await call('POST', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [parentId], includePrerequisites: false, maxItems: 12 });
  await complete(baseline, (_item, expected, schema, mapping) => mapping.componentBindings?.length
    ? expected.map(entry => entry.key === configuration.field ? { ...entry, value: String(Number(entry.value) + 1) } : entry) : wrong(expected, schema));
  const initial = await call('GET', `/diagnostics/sessions/${baseline.id}/report`);
  assert.equal(initial.componentObservations.length, 1); assert.equal(initial.componentObservations[0].state, 'below_standard');
  assert.equal(initial.componentObservations[0].independentEstimateContribution, 0);
  const responseId = initial.componentObservations[0].responseId;
  const detail = await call('GET', `/diagnostics/students/${studentId}/evidence/${encodeURIComponent(responseId)}`);
  assert.deepEqual(detail.componentObservations, initial.componentObservations);
  await call('GET', `/diagnostics/students/${studentId}/evidence/${encodeURIComponent(responseId)}`, undefined, 'stranger', 403);
  let profile = await call('GET', `/diagnostics/students/${studentId}/profile?subject=math`);
  assert.equal(profile.estimates.find(row => row.atomId === childId).scoredCount, 0);
  const originalReportHash = blueprintContentHash(initial); await restart();
  assert.equal(blueprintContentHash(await call('GET', `/diagnostics/sessions/${baseline.id}/report`)), originalReportHash);
  await call('POST', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', targetAtomIds: [childId], includePrerequisites: false, requestKey: randomUUID() }, 'learner', 400);
  const preview = await call('POST', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', targetAtomIds: [childId], includePrerequisites: true, maxItems: 12, requestKey: randomUUID() });
  assert.deepEqual(preview.blueprint.targetAtomIds, [childId]); assert(preview.blueprint.prerequisiteAtomIds.includes(configuration.childPrerequisite));
  await restart();
  const independent = await call('POST', `/diagnostics/blueprints/${preview.id}/start`, {});
  const frozen = await rawSession(independent.id), childMappings = frozen.itemSnapshots.filter(row => row.atomId === childId);
  assert.equal(childMappings.length, 4); assert.equal(new Set(childMappings.map(row => row.family)).size, 4);
  const independentReport = await complete(independent, (_item, expected, schema, mapping) => mapping.atomId === childId && mapping.dimension !== 'transfer' ? wrong(expected, schema) : expected);
  const estimate = independentReport.estimates.find(row => row.atomId === childId);
  assert.equal(estimate.scoredCount, 4); assert.equal(estimate.independentFamilies, 4); assert.equal(estimate.retentionVerified, false); assert.notEqual(estimate.status, 'secure');
  const hypothesis = independentReport.hypotheses.find(row => row.atomId === parentId && row.cause === 'prerequisite_gap');
  assert.equal(hypothesis.status, 'supported'); assert.deepEqual(hypothesis.probeAtomIds, [childId]);
  const cause = await call('POST', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', hypothesisId: hypothesis.id, includePrerequisites: true, maxItems: 12, requestKey: randomUUID() });
  const required = cause.blueprint.verification.groups.map(row => row.atomId);
  for (const atomId of [parentId, childId, ...configuration.directPrerequisites]) assert(required.includes(atomId));
  const plan = await call('POST', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: independent.id, minutesPerDay: 5, useAi: true }, 'parent');
  assert.equal(plan.source, 'rules'); assert.equal(plan.aiStatus, 'unavailable'); assert.deepEqual(plan.actions.map(row => row.atomId), [childId]);
  assert.deepEqual(plan.actions[0].evidenceIds, estimate.evidenceIds); assert(plan.actions[0].teachingSnapshot.teaching.explanation.includes(configuration.teachingMarker));
  const active = await call('PATCH', `/diagnostics/plans/${plan.id}`, { status: 'active', expectedRevision: plan.revision, requestKey: randomUUID() }, 'parent');
  const practice = await call('POST', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {});
  const practiceSnapshot = await store.transaction(() => structuredClone(store.find('practiceSessions', { id: practice.id })));
  await call('POST', `/learning/practice/${practice.id}/questions/${encodeURIComponent(practice.questions[0].id)}/hint`, {});
  for (const question of practice.questions) {
    const frozenQuestion = practiceSnapshot.snapshots.find(row => row.id === question.id);
    await call('POST', `/learning/practice/${practice.id}/responses`, { questionId: question.id, answer: frozenQuestion.answer, elapsedMs: 1000, requestKey: randomUUID() });
  }
  await call('POST', `/learning/practice/${practice.id}/complete`, {});
  profile = await call('GET', `/diagnostics/students/${studentId}/profile?subject=math`);
  assert.equal(profile.estimates.find(row => row.atomId === childId).scoredCount, 4);
  const reviews = await call('GET', `/diagnostics/plans/${plan.id}/reviews`, undefined, 'parent'); assert.deepEqual(reviews.map(row => row.intervalDays), [1, 3, 7, 14]);
  const due = reviews.find(row => row.intervalDays === 1);
  await call('POST', `/diagnostics/reviews/${encodeURIComponent(due.id)}/start`, {}, 'learner', 400);
  global.Date = SyntheticDate; offset = 2 * 86_400_000;
  tokens.parent = (await call('POST', '/auth/login', { principal: parentPrincipal, credential: parentCredential }, 'anonymous')).token;
  await learningCode(studentId); await restart();
  const review = await call('POST', `/diagnostics/reviews/${encodeURIComponent(due.id)}/start`, {});
  const exposed = new Set([...frozen.questionSnapshots.map(row => row.id), ...practice.questions.map(row => row.id)]);
  assert(review.items.every(item => !exposed.has(item.questionId)));
  await complete(review);
  const after = await call('GET', `/diagnostics/sessions/${review.id}/report`);
  const retention = after.evidence.filter(row => row.atomId === childId);
  assert(retention.length >= 2 && retention.every(row => row.dimension === 'retention' && row.retentionDelayDays >= 1 && !row.priorExposure));
  assert.equal(new Set(retention.map(row => row.family)).size, retention.length);
  const retrospective = await call('GET', `/diagnostics/plans/${plan.id}/retrospective`, undefined, 'parent');
  assert(retrospective); assert(JSON.stringify(retrospective).includes(childId));
  const scopeAfter = await call('GET', `/students/${studentId}/learning-scope?subject=math`, undefined, 'parent'); assert.deepEqual(scopeAfter, scope);
  const beforeRestart = blueprintContentHash({ after, retrospective }); await restart();
  assert.equal(blueprintContentHash({ after: await call('GET', `/diagnostics/sessions/${review.id}/report`),
    retrospective: await call('GET', `/diagnostics/plans/${plan.id}/retrospective`, undefined, 'parent') }), beforeRestart);
  const overview = await call('GET', '/learning/overview', undefined, 'parent'), math = overview.children[0].subjects.find(row => row.subject === 'math');
  assert.equal(math.subpointEstimates.length, 1); assert(math.subpointEstimates[0].scoredCount >= 6); assert.equal(math.componentObservations[0].independentEstimateContribution, 0);
  assert.equal(blueprintContentHash(await call('GET', `/diagnostics/sessions/${baseline.id}/report`)), originalReportHash);
  evidence.result = { originalEligibleCompositeTasks: configuration.eligible, reviewedComponentBindings: 12, compositeClueDoesNotAddChildEvidence: true,
    scopeRemainsExplicit: true, independentChildTasks: 4, independentChildFamilies: 4, childEstimate: estimate,
    allDirectPrerequisitesStillRequired: true, rulePlanAvailableWithoutAi: true, trainingQuestions: practice.questions.length,
    trainingDoesNotAddDiagnosticSamples: true, reviewIntervals: [1, 3, 7, 14], simulatedClockAdvanceDays: 2,
    delayedIndependentChildFamilies: retention.length, reviewUsesUnexposedQuestions: true, retrospectivePersisted: true,
    historicalReportSha256: originalReportHash, historicalReportUnchanged: true, activePlanRevision: active.revision,
    otherFamilyDenied: true, restarts };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.stack; process.exitCode = 1; }).finally(async () => {
  global.Date = RealDate; await stop();
  if (adminPool) { try { if (qaDatabase && /^study_atomic_[a-f0-9]{32}$/.test(qaDatabase)) {
    await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]); await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
  } } finally { await adminPool.end(); } }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, restarts, error: evidence.error }));
  assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('study-atomic-components-'));
  fs.rmSync(directory, { recursive: true, force: true });
});
