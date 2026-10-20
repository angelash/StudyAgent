// Owned synthetic database, real HTTP and restarts. Does not touch a family database.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const { gradeResponse } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/scoring.js');
const { answerInputConfiguration } = require('@study-agent/contracts');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-definition-runtime-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/measurement-definition-runtime.json');
const driver = process.argv[3] ?? 'sqlite';
if (!['sqlite', 'postgres'].includes(driver)) throw new Error('Expected sqlite or postgres');
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const evidence = { at: new Date().toISOString(), driver, passed: false,
  scope: 'Owned production-mode database, synthetic family, original authored tasks, real HTTP and two restarts; no browser or content-completeness claim',
  sourceSha256: Object.fromEntries(['apps/api/src/modules/diagnostics/measurement-definition.ts', 'apps/api/src/modules/diagnostics/diagnostics.service.ts',
    'apps/api/src/modules/diagnostics/guidance.service.ts', 'apps/api/src/modules/ai/ai.service.ts', 'apps/api/src/modules/learning/learning.service.ts',
    'scripts/qa/verify-measurement-definitions.cjs'].map(file =>
    [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
let app, store, base, adminToken, parentToken, adminPool, qaDatabase;
async function start() {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function call(method, route, body, actor = 'parent', expected = method === 'POST' ? 201 : 200) {
  const token = actor === 'admin' ? adminToken : actor === 'parent' ? parentToken : null;
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${result.error?.message ?? ''}`); return result.data;
}
function legalWrongAnswer(schema, expected) {
  const mode = schema.mode, config = answerInputConfiguration(schema);
  const wrongValue = value => Number.isFinite(Number(value)) ? String(Number(value) + 1) : 'QA未达标';
  let answer;
  if (mode === 'boolean') answer = gradeResponse(schema, expected, true).score === 1 ? false : true;
  else if (mode === 'single_choice') answer = schema.options.find(option => option.value !== expected)?.value;
  else if (mode === 'hotspot') answer = config.targets.find(target => target.id !== expected)?.id;
  else if (mode === 'multiple_choice') answer = [schema.options.find(option => !expected.includes(option.value))?.value ?? expected[0]];
  else if (mode === 'multi_blank') answer = expected.map(entry => ({ ...entry, value: wrongValue(entry.value) }));
  else if (mode === 'sorting') answer = [...expected].reverse();
  else if (mode === 'matching') answer = { pairs: expected.pairs.map(pair => ({ ...pair,
    right: config.right[(config.right.findIndex(option => option.id === pair.right) + 1) % config.right.length].id })) };
  else if (mode === 'table_fill') answer = { cells: Object.fromEntries(Object.entries(expected.cells).map(([key, value]) => [key, wrongValue(value)])) };
  else if (mode === 'drag_drop') answer = { placements: Object.fromEntries(Object.entries(expected.placements).map(([key, value]) =>
    [key, config.groups.find(group => group.id !== value)?.id])) };
  else if (mode === 'text_blank') answer = 'QA未达标';
  else if (mode === 'formula_blank') answer = '-999999';
  else if (mode === 'numeric_blank') answer = -999999;
  else throw new Error(`Definition QA fixture needs a dedicated manual response for ${mode}`);
  assert.equal(gradeResponse(schema, expected, answer).score, 0, `QA wrong response must be legal and score zero: ${schema.questionId} / ${mode}`);
  return answer;
}
async function finish(session, correct = false) {
  const snapshots = await store.transaction(() => structuredClone(store.find('diagnosticSessions', { id: session.id }).questionSnapshots));
  for (const item of session.items) {
    const snapshot = snapshots.find(q => q.id === item.questionId);
    await call('POST', `/diagnostics/sessions/${session.id}/responses`,
      { itemId: item.id, answer: correct ? snapshot.answer : legalWrongAnswer(snapshot.answerSchema, snapshot.answer), elapsedMs: 2000 });
  }
  return call('POST', `/diagnostics/sessions/${session.id}/complete`, {});
}
async function main() {
  if (driver === 'postgres') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
    if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.appUser !== 'study_agent_app') throw new Error('Expected the owned local QA cluster');
    adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
    qaDatabase = 'study_definition_' + randomUUID().replaceAll('-', '');
    await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
    const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
    try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
    const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
    process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
  }
  const credential = randomBytes(24).toString('hex');
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-measurement-definitions'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(boot.status, 0, 'Formal administrator bootstrap');
  await start();
  adminToken = (await call('POST', '/auth/login', { principal: 'qa-measurement-definitions', credential }, null)).token;
  parentToken = (await call('POST', '/auth/register', { principal: 'qa-definition-parent', credential: randomBytes(24).toString('hex') }, null)).token;
  const studentId = (await call('POST', '/students', { nickname: '合成知识定义核验', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile.id;
  const atomId = 'foundation:math:multiplydigits';
  const original = await store.transaction(() => structuredClone(store.find('knowledgeAtoms', { id: atomId })));
  await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创能力路径', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
  const startCommand = { studentId, subject: 'math', targetAtomIds: [atomId], intent: 'baseline', maxItems: 4, includePrerequisites: false };
  const baseline = await call('POST', '/diagnostics/sessions', startCommand), baselineReport = await finish(baseline);
  assert(baselineReport.hypotheses.length > 0);
  const plan = await call('POST', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 10, useAi: false });
  const active = await call('PATCH', `/diagnostics/plans/${plan.id}`, { expectedRevision: plan.revision, status: 'active' });
  const practice = await call('POST', `/learning/plans/${plan.id}/actions/${plan.actions[0].id}/start`, {});
  const pending = await call('POST', '/diagnostics/sessions', startCommand);
  const updated = await call('POST', '/admin/knowledge-atoms', { ...original, name: '合成修改后的知识名称',
    objective: '合成的新测量目标，用来检查定义变化不会重新解释原始表现' }, 'admin');
  assert.equal(updated.version, original.version + 1);
  const frozenView = await call('GET', `/diagnostics/sessions/${pending.id}`);
  assert(frozenView.items.every(item => item.atomName === original.name));
  const frozenReport = await finish(pending, true);
  assert.equal(frozenReport.definitionContext.atoms.find(atom => atom.id === atomId).objective, original.objective);
  const profile = await call('GET', `/diagnostics/students/${studentId}/profile?subject=math`);
  const oldEvidenceCount = baselineReport.evidence.length + frozenReport.evidence.length;
  assert.equal(profile.definitionCompatibility.incompatibleEvidenceIds.length, oldEvidenceCount);
  assert.equal(profile.estimates.find(atom => atom.atomId === atomId).scoredCount, 0);
  const mappings = await call('GET', `/admin/curriculum/atoms/${encodeURIComponent(atomId)}/items`, undefined, 'admin');
  assert(mappings.length > 0 && mappings.every(row => !row.eligible && row.definitionIssue));
  await call('POST', '/diagnostics/sessions', startCommand, 'parent', 400);
  await call('POST', '/diagnostics/sessions', { ...startCommand, planId: plan.id, intent: 'verification' }, 'parent', 409);
  assert.equal((await call('GET', `/diagnostics/plans/${plan.id}`)).impact.definitionChangedActionIds.length, 1);
  assert.equal((await call('GET', `/learning/practice/${practice.id}`)).id, practice.id);
  await call('POST', `/learning/practice/${practice.id}/questions/${practice.questions[0].id}/hint`, {});
  assert((await call('POST', `/learning/practice/${practice.id}/questions/${practice.questions[0].id}/hint`, {})).hint.includes(original.objective));
  assert((await call('GET', `/learning/students/${studentId}/mistakes?subject=math`)).every(row => row.atomName === original.name));
  const retrospective = await call('GET', `/diagnostics/plans/${plan.id}/retrospective`);
  await stop(); await start();
  assert.deepEqual((await call('GET', `/diagnostics/sessions/${pending.id}/report`)).definitionContext, frozenReport.definitionContext);
  assert.deepEqual((await call('GET', `/diagnostics/plans/${plan.id}/retrospective`)).fingerprint, retrospective.fingerprint);
  assert.deepEqual((await call('GET', `/learning/practice/${practice.id}`)).action, practice.action);
  for (const { mapping } of mappings) await call('POST', '/admin/measurement-items', mapping, 'admin');
  const current = await call('POST', '/diagnostics/sessions', startCommand), currentReport = await finish(current, true);
  assert(currentReport.evidence.length >= 2);
  assert.equal(currentReport.definitionContext.atoms.find(atom => atom.id === atomId).objective, updated.objective);
  assert.equal(currentReport.estimates.find(atom => atom.atomId === atomId).scoredCount, currentReport.evidence.length);
  assert.equal(currentReport.definitionContext.incompatibleEvidenceIds.length, oldEvidenceCount);
  await call('POST', `/admin/diagnostic-responses/${encodeURIComponent(frozenReport.evidence[0].id)}/review`,
    { score: 0, reason: '合成旧定义评分修订，不得使另一知识定义的新报告失效', requestKey: 'definition-runtime-review', expectedVersion: 0 }, 'admin');
  assert.equal((await call('GET', `/diagnostics/sessions/${current.id}/report`)).version, 1);
  assert.equal((await call('GET', `/diagnostics/sessions/${pending.id}/report`)).version, 2);
  const history = await call('GET', `/diagnostics/sessions/${pending.id}/report-history`);
  assert.deepEqual(history.map(report => report.version), [2, 1]);
  assert.equal(history[1].rawScore, 100);
  assert.deepEqual(history[1].definitionContext, frozenReport.definitionContext);
  await stop(); await start();
  const restored = await call('GET', `/diagnostics/sessions/${pending.id}/report`);
  assert.equal(restored.version, 2); assert.deepEqual(restored.definitionContext.atoms, frozenReport.definitionContext.atoms);
  assert.equal((await call('GET', `/diagnostics/sessions/${current.id}/report`)).version, 1);
  assert.equal((await call('GET', `/diagnostics/plans/${active.id}`)).impact.needsReview, true);
  evidence.result = { oldEvidenceCount, currentEvidenceCount: currentReport.evidence.length, mappingsReapproved: mappings.length,
    frozenDefinitionSurvivesCompletionAndRestart: true, hintsAndAiUseFrozenDefinitions: 'covered by integration tests',
    currentProfileExcludesOldDefinitions: true, reapprovalRequired: true, oldPlanNewProbeBlocked: true,
    startedPracticePreserved: true, retrospectiveFingerprintSurvivesRestart: true, unrelatedDefinitionReportNotRevised: true,
    originalReportAndRevisedReportRetained: true, restarts: 2 };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) {
    try {
      if (qaDatabase && /^study_definition_[a-f0-9]{32}$/.test(qaDatabase)) {
        await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]);
        await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
      }
    } finally { await adminPool.end(); }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, result: evidence.result, error: evidence.error }));
  const target = path.resolve(directory);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-definition-runtime-')) throw new Error('Unexpected temporary cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
