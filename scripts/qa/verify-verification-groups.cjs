// Uses real authored questions in an owned temporary store; never invents production families to pass coverage.
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
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-verification-runtime-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/verification-groups-runtime.json');
const driver = process.argv[3] ?? 'sqlite';
if (!['sqlite', 'postgres'].includes(driver)) throw new Error('Expected sqlite or postgres');
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const files = ['packages/contracts/src/diagnostics.ts', 'apps/api/src/modules/diagnostics/assessment-blueprint.ts',
  'apps/api/src/modules/diagnostics/verification-blueprint.ts', 'apps/api/src/modules/diagnostics/diagnosis.ts',
  'apps/api/src/modules/diagnostics/diagnostics.service.ts', 'apps/web/app/student/assessment/studio.tsx',
  'apps/web/components/assessment-blueprint.tsx', 'apps/web/components/verification-observations.tsx', 'apps/web/components/verification-observations.css'];
const evidence = { at: new Date().toISOString(), driver, passed: false,
  scope: 'Synthetic family accounts, real authored questions, formal administrator bootstrap, production-mode HTTP, concurrent requests and restarts. Genuine material gaps remain; not browser or standardized measurement acceptance.',
  sourceSha256: Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
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
async function snapshotAnswer(id, questionId) {
  return store.transaction(() => store.find('diagnosticSessions', { id }).questionSnapshots.find(row => row.id === questionId).answer);
}
const previewRoute = id => `/diagnostics/blueprints/${encodeURIComponent(id)}`;
const sessionRoute = id => `/diagnostics/sessions/${id}`;
async function main() {
  if (driver === 'postgres') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
    if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.appUser !== 'study_agent_app') throw new Error('Expected owned QA cluster');
    adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
    qaDatabase = 'study_verification_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
    const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
    try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
    const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
    process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
  }
  const credential = randomBytes(24).toString('hex');
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-verification'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(boot.status, 0, 'Formal administrator bootstrap');
  await start();
  tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-verification', credential }, 'anonymous')).token;
  for (const actor of ['parent', 'outsider']) tokens[actor] = (await call('POST', '/auth/register', {
    principal: `qa-verification-${actor}`, credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
  const studentId = (await call('POST', '/students', { nickname: '合成对照运行', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile.id;
  const access = await call('POST', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '合成家庭核对受限学生自己的评测证据' });
  const code = await call('POST', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() });
  tokens.learner = (await call('POST', '/auth/learning-code', { code: code.code }, 'anonymous')).token;
  const atomId = 'foundation:math:multiplydigits';
  await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创能力路径', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
  const baseline = await call('POST', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline',
    targetAtomIds: [atomId], includePrerequisites: true, maxItems: 12 });
  for (const item of baseline.items) await call('POST', sessionRoute(baseline.id) + '/responses', {
    itemId: item.id, answer: -999999, elapsedMs: 1000 });
  const baselineReport = await call('POST', sessionRoute(baseline.id) + '/complete', {});
  const rootCause = baselineReport.hypotheses.find(row => row.atomId === atomId && row.cause === 'prerequisite_gap');
  const transferCause = baselineReport.hypotheses.find(row => row.atomId === atomId && row.cause === 'representation_gap');
  assert(rootCause && transferCause);
  const command = { studentId, subject: 'math', intent: 'verification', hypothesisId: transferCause.id, includePrerequisites: true,
    maxItems: 12, requestKey: randomUUID() };
  const preview = await call('POST', '/diagnostics/blueprints', command, 'learner');
  assert.equal(preview.blueprint.verification.groups.length, 2); assert(preview.canStart);
  assert.equal(preview.blueprint.verification.fullyCovered, false, 'Original material depth gap must not disappear');
  assert(preview.blueprint.verification.groups.every(row => row.gap && row.selectedFamilies.length < 2));
  assert(!JSON.stringify(preview).includes('gradingConfig'));
  const rootPreview = await call('POST', '/diagnostics/blueprints', { ...command, hypothesisId: rootCause.id, requestKey: randomUUID() });
  const prerequisites = await store.transaction(() => store.find('knowledgeAtoms', { id: atomId }).prerequisiteIds);
  assert.deepEqual(new Set(rootPreview.blueprint.verification.groups.map(row => row.atomId)), new Set([atomId, ...prerequisites]));
  assert.deepEqual(rootPreview.blueprint.targetAtomIds, [atomId]);
  await call('GET', previewRoute(preview.id), undefined, 'outsider', 404);
  await call('POST', '/diagnostics/blueprints', { ...command, intent: 'baseline', requestKey: randomUUID() }, 'parent', 400);
  await stop(); await start();
  assert.deepEqual(await call('GET', previewRoute(preview.id), undefined, 'learner'), preview);
  const concurrent = await Promise.all([raw('POST', previewRoute(preview.id) + '/start', {}, 'learner'), raw('POST', previewRoute(preview.id) + '/start', {}, 'learner')]);
  assert(concurrent.every(row => [201, 409].includes(row.status))); assert(concurrent.some(row => row.status === 201));
  let session = await call('POST', previewRoute(preview.id) + '/start', {}, 'learner');
  assert.deepEqual(session.blueprint, preview.blueprint); assert.equal(session.items.length, preview.itemCount);
  const draft = { questionId: session.items[0].questionId, mode: 'numeric_blank', response: { value: '12' } };
  await call('PATCH', sessionRoute(session.id) + `/items/${session.items[0].id}/draft`, { answer: draft }, 'learner');
  session = await call('POST', sessionRoute(session.id) + '/state', { action: 'pause', expectedRevision: session.revision,
    requestKey: randomUUID(), reason: '核对冻结观察组与草稿重启恢复' }, 'learner');
  await stop(); await start();
  const restored = await call('GET', sessionRoute(session.id), undefined, 'learner');
  assert.equal(restored.status, 'paused'); assert.deepEqual(restored.blueprint, preview.blueprint);
  session = await call('POST', sessionRoute(session.id) + '/state', { action: 'resume', expectedRevision: restored.revision,
    requestKey: randomUUID(), reason: '继续核对独立与受提示的实际观察' }, 'learner');
  const baseItem = session.items.find(row => row.dimension !== 'transfer'), transferItem = session.items.find(row => row.dimension === 'transfer');
  assert(baseItem && transferItem);
  await call('POST', sessionRoute(session.id) + `/items/${baseItem.id}/hint`, {}, 'learner');
  for (const item of session.items) await call('POST', sessionRoute(session.id) + '/responses', {
    itemId: item.id, answer: await snapshotAnswer(session.id, item.questionId), elapsedMs: 1000 }, 'learner');
  await call('POST', sessionRoute(session.id) + '/complete', {}, 'learner');
  const firstReport = await call('GET', sessionRoute(session.id) + '/report', undefined, 'learner');
  assert.equal(firstReport.verification.independentObservationsComplete, false);
  assert.equal(firstReport.verification.groups.reduce((n, row) => n + row.assistedOrExposed, 0), 1);
  const transferEvidence = firstReport.evidence.find(row => row.itemId === transferItem.id);
  await call('POST', `/admin/diagnostic-responses/${encodeURIComponent(transferEvidence.id)}/review`, { score: 0,
    reason: '合成运行修订一次评分，核对报告版本与独立观察归类', requestKey: randomUUID(), expectedVersion: 0 }, 'admin');
  const latestReport = await call('GET', sessionRoute(session.id) + '/report', undefined, 'learner');
  assert.equal(latestReport.version, 2); assert.equal(latestReport.verification.groups[1].belowStandardFamilies, 1);
  assert.deepEqual(latestReport.verification.blueprint, preview.blueprint.verification);
  const history = await call('GET', sessionRoute(session.id) + '/report-history', undefined, 'learner'); assert.deepEqual(history.at(-1), firstReport);
  await call('POST', previewRoute(rootPreview.id) + '/start', {}, 'parent', 409);
  await stop(); await start();
  assert.deepEqual(await call('GET', sessionRoute(session.id) + '/report', undefined, 'learner'), latestReport);
  assert.deepEqual(await call('GET', sessionRoute(session.id) + '/report-history', undefined, 'learner'), history);
  assert.equal((await call('POST', previewRoute(preview.id) + '/start', {}, 'learner')).id, session.id);
  evidence.result = { previewItemCount: preview.itemCount, requiredObservationGroups: preview.blueprint.verification.groups.length,
    genuineMaterialGaps: preview.blueprint.verification.groups.map(row => ({ dimensions: row.dimensions, availableFamilies: row.availableFamilies, selectedFamilies: row.selectedFamilies.length, gap: row.gap })),
    targetAndAllDirectPrerequisitesCompared: true, learnerAuthorization: true, outsiderBlocked: true,
    concurrentStartStatuses: concurrent.map(row => row.status), frozenGroupsAndPauseSurviveRestart: true,
    hintedAnswerExcludedFromIndependentObservations: true, revisionUpdatesActualObservations: true, oldReportAndOriginalBlueprintFrozen: true,
    staleBasisPreviewRejected: true, completedPreviewReceiptReplayed: true, restarts: 3 };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) {
    try { if (qaDatabase && /^study_verification_[a-f0-9]{32}$/.test(qaDatabase)) {
      await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]); await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
    } } finally { await adminPool.end(); }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, result: evidence.result, error: evidence.error }));
  const target = path.resolve(directory);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-verification-runtime-')) throw new Error('Unexpected temporary cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
