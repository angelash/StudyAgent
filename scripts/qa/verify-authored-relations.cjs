// Owned production-mode legacy upgrade fixtures; never mutates a developer's or family's existing database.
require('reflect-metadata');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg'), { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-authored-relations-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/authored-relations-runtime.json'), driver = process.argv[3] ?? 'sqlite';
assert(['sqlite', 'postgres'].includes(driver));
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY; delete process.env.STUDY_SEED_FOUNDATION;
const fromApi = file => require(path.join(root, 'apps/api/dist/apps/api/src', file));
const { AppModule } = fromApi('app.module.js'), { InMemoryStoreService } = fromApi('infrastructure/in-memory-store.service.js');
const { CurriculumService } = fromApi('modules/diagnostics/curriculum.service.js');
const { authoredRelationRelease: release } = fromApi('modules/diagnostics/authored-relation-release.js');
const { atomDefinitionFingerprint } = fromApi('modules/diagnostics/measurement-definition.js');
const { buildFoundationCurriculum, foundationQuestionId } = fromApi('modules/diagnostics/foundation-curriculum.js');
const { blueprintContentHash } = fromApi('modules/diagnostics/assessment-blueprint.js');
const { gradeResponse } = fromApi('modules/diagnostics/scoring.js');
const { answerInputConfiguration } = require('@study-agent/contracts');
const files = ['apps/api/src/modules/diagnostics/authored-relation-release.ts', 'apps/api/src/modules/diagnostics/foundation-curriculum.ts',
  'apps/api/src/modules/diagnostics/foundation-seed.service.ts', 'apps/api/src/modules/diagnostics/measurement-definition.ts',
  'apps/api/src/modules/diagnostics/curriculum.service.ts', 'resources/curriculum/authored-relations-2026-10-20-v1.json', 'scripts/qa/verify-authored-relations.cjs'];
const evidence = { at: new Date().toISOString(), driver, passed: false,
  scope: 'Owned legacy records, unchanged original content, real production HTTP, interrupted startup and restarts; no browser, human-teacher review or complete curriculum claim.',
  sourceSha256: Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
const tokens = {}, oldFingerprint = atomDefinitionFingerprint(release.before), newFingerprint = atomDefinitionFingerprint(release.after);
let app, store, base, adminPool, qaDatabase;
async function start(fault = false) {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api');
  if (fault) {
    const curriculum = app.get(CurriculumService), save = curriculum.upsertMapping.bind(curriculum); let calls = 0;
    curriculum.upsertMapping = (...args) => { if (++calls === 2) throw new Error('owned startup interruption'); return save(...args); };
    try { await app.init(); throw new Error('Expected startup interruption'); } catch (error) { assert.equal(error.message, 'owned startup interruption'); }
    await app.close(); app = undefined; return;
  }
  await app.listen(0, '127.0.0.1'); store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function call(method, route, body, actor = 'parent', expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${result.error?.message ?? ''}`); return result.data;
}
const allOriginalIds = new Set(buildFoundationCurriculum().flatMap(row => row.exercises.filter(task => task.identityVersion !== 2).map(task => foundationQuestionId(row.atom.id, task))));
const packet = id => ({ question: store.find('questions', { id }), document: store.find('questionDocuments', { questionId: id }),
  answerSchema: store.find('questionAnswerSchemas', { questionId: id }), source: store.find('questionSources', { questionId: id }),
  mapping: store.find('measurementItems', { id: `measurement:${id}` }) });
const originalSnapshot = () => store.transaction(() => Object.fromEntries(['questions', 'questionDocuments', 'questionAnswerSchemas', 'questionSources', 'measurementItems'].map(collection => {
  const rows = store.inspect(collection).filter(row => allOriginalIds.has(collection === 'questions' ? row.id : row.questionId));
  return [collection, { count: rows.length, sha256: blueprintContentHash(rows) }];
})));
const stableRows = rows => [...rows].sort((a, b) => String(a.id ?? a.eventId).localeCompare(String(b.id ?? b.eventId)));
const releaseCheckpoint = () => store.transaction(() => structuredClone({ atom: store.find('knowledgeAtoms', { id: release.after.id }),
  mappings: stableRows(store.select('measurementItems', { atomId: release.after.id })),
  revisions: stableRows(store.inspect('curriculumRevisions')), events: stableRows(store.inspect('events')) }));
async function answer(id, item, wrong = false) {
  const snapshot = await store.transaction(() => structuredClone(store.find('diagnosticSessions', { id }).questionSnapshots.find(row => row.id === item.questionId)));
  if (!wrong) return snapshot.answer;
  const schema = snapshot.answerSchema, expected = snapshot.answer, mode = schema.mode, config = answerInputConfiguration(schema);
  const wrongValue = value => Number.isFinite(Number(value)) ? String(Number(value) + 1) : 'QA未达标';
  let value;
  if (mode === 'boolean') value = gradeResponse(schema, expected, true).score === 1 ? false : true;
  else if (mode === 'single_choice') value = schema.options.find(option => option.value !== expected)?.value;
  else if (mode === 'hotspot') value = config.targets.find(target => target.id !== expected)?.id;
  else if (mode === 'multiple_choice') {
    const outside = schema.options.find(option => !expected.includes(option.value)); value = [outside?.value ?? expected[0]];
  } else if (mode === 'multi_blank') value = expected.map(entry => ({ ...entry, value: wrongValue(entry.value) }));
  else if (mode === 'sorting') value = [...expected].reverse();
  else if (mode === 'matching') value = { pairs: expected.pairs.map(pair => ({ ...pair,
    right: config.right[(config.right.findIndex(option => option.id === pair.right) + 1) % config.right.length].id })) };
  else if (mode === 'table_fill') value = { cells: Object.fromEntries(Object.entries(expected.cells).map(([key, entry]) => [key, wrongValue(entry)])) };
  else if (mode === 'drag_drop') value = { placements: Object.fromEntries(Object.entries(expected.placements).map(([key, entry]) =>
    [key, config.groups.find(group => group.id !== entry)?.id])) };
  else if (mode === 'text_blank') value = 'QA未达标';
  else if (mode === 'formula_blank') value = '-999999';
  else if (mode === 'numeric_blank') value = -999999;
  else throw new Error(`This deterministic QA fixture requires a dedicated manual-review journey for ${mode}`);
  assert.equal(gradeResponse(schema, expected, value).score, 0, `Legal zero-score fixture: ${schema.questionId} / ${mode}`); return value;
}
async function setupPostgres() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
  assert.equal(config.purpose, 'StudyAgent isolated QA cluster'); assert.equal(config.port, 15439); assert.equal(config.appUser, 'study_agent_app');
  adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
  qaDatabase = 'study_relations_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
  const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
  try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
  const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
  process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
}
async function main() {
  if (driver === 'postgres') await setupPostgres();
  const credential = randomBytes(24).toString('hex');
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-authored-relations'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(boot.status, 0, 'Formal administrator bootstrap'); await start();
  tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-authored-relations', credential }, 'anonymous')).token;
  tokens.parent = (await call('POST', '/auth/register', { principal: 'qa-authored-relations-parent', credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
  const modified = release.questions.slice(0, 8).map(row => row.questionId);
  const editedBefore = await store.transaction(() => {
    Object.assign(store.find('knowledgeAtoms', { id: release.before.id }), structuredClone(release.before));
    for (const mapping of store.select('measurementItems', { atomId: release.before.id })) mapping.atomDefinitionFingerprint = oldFingerprint;
    packet(modified[0]).question.analysis += '合成旧库中的已有编辑'; packet(modified[1]).document.blocks[0].text += '合成已有题面';
    packet(modified[2]).answerSchema.validationRules.required = false; packet(modified[3]).source.reviewStatus = 'draft';
    packet(modified[4]).mapping.reviewStatus = 'draft'; packet(modified[5]).mapping.expectedSeconds++;
    packet(modified[6]).mapping.version = 2; packet(modified[7]).mapping.contentFingerprint = 'f'.repeat(64);
    return modified.map(id => blueprintContentHash(packet(id)));
  });
  const legacyMappings = await store.transaction(() => structuredClone(store.select('measurementItems', { atomId: release.before.id })));
  const originals = await originalSnapshot(); assert.equal(originals.questions.count, 3435);
  const studentId = (await call('POST', '/students', { nickname: '合成关系升级学生', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile.id;
  const access = await call('POST', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '核对先修关系升级后的旧证据与新验证' });
  const code = await call('POST', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() });
  tokens.learner = (await call('POST', '/auth/learning-code', { code: code.code }, 'anonymous')).token;
  await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创能力路径', learnedAtomIds: [release.before.id], currentAtomId: release.before.id, minutesPerSession: 15 });
  // Bind the old plan to this target; the new baseline below independently checks prerequisite inclusion.
  const baseline = await call('POST', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [release.before.id], includePrerequisites: false, maxItems: 12 }, 'learner');
  for (const item of baseline.items) await call('POST', `/diagnostics/sessions/${baseline.id}/responses`, { itemId: item.id, answer: await answer(baseline.id, item, true), elapsedMs: 1000 }, 'learner');
  await call('POST', `/diagnostics/sessions/${baseline.id}/complete`, {}, 'learner');
  const oldReport = await call('GET', `/diagnostics/sessions/${baseline.id}/report`, undefined, 'learner');
  const oldTargetEvidence = oldReport.evidence.filter(row => row.atomId === release.before.id).length; assert(oldTargetEvidence > 0);
  const plan = await call('POST', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 10, useAi: false });
  const preview = await call('POST', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [release.before.id], includePrerequisites: false, maxItems: 8, requestKey: randomUUID() }, 'learner');
  const unfinished = await call('POST', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'micro', targetAtomIds: [release.before.id], includePrerequisites: false, maxItems: 4 }, 'learner');
  const beforeInterruption = await releaseCheckpoint();
  await stop();
  await start(true); // The startup checkpoint must remain unchanged even after the first mapping was reviewed in memory.
  process.env.STUDY_SEED_FOUNDATION = 'false'; await start();
  assert.deepEqual(await releaseCheckpoint(), beforeInterruption, 'Interrupted startup must not persist a partial release');
  await stop(); delete process.env.STUDY_SEED_FOUNDATION;
  await start();
  const graph = (await call('GET', '/diagnostics/curriculum?subject=math&grade=3')).find(row => row.id === release.after.id);
  assert.deepEqual(graph, release.after);
  assert.deepEqual(await originalSnapshot(), originals);
  assert.deepEqual(await store.transaction(() => modified.map(id => blueprintContentHash(packet(id)))), editedBefore);
  const mappings = await call('GET', `/admin/curriculum/atoms/${encodeURIComponent(release.after.id)}/items`, undefined, 'admin');
  const reviewedIds = release.questions.slice(8).map(row => `measurement:${row.questionId}`);
  assert(reviewedIds.every(id => mappings.some(row => row.mapping.id === id && row.eligible)));
  assert(modified.every(id => mappings.some(row => row.mapping.questionId === id && !row.eligible)));
  await store.transaction(() => {
    for (const id of reviewedIds) {
      const mapping = store.find('measurementItems', { id }); assert.equal(mapping.version, 2); assert.equal(mapping.atomDefinitionFingerprint, newFingerprint);
      const history = store.select('curriculumRevisions', { entityId: id, kind: 'measurement' });
      assert.deepEqual(history.map(row => row.version), [1, 2]); assert.equal(history[0].snapshot.atomDefinitionFingerprint, oldFingerprint);
    }
  });
  assert.deepEqual(await call('GET', `/diagnostics/sessions/${baseline.id}/report`, undefined, 'learner'), oldReport);
  const profile = await call('GET', `/diagnostics/students/${studentId}/profile?subject=math`);
  assert.equal(profile.estimates.find(row => row.atomId === release.after.id).scoredCount, 0);
  assert.equal(profile.definitionCompatibility.incompatibleEvidenceIds.length, oldTargetEvidence);
  await call('POST', `/diagnostics/blueprints/${preview.id}/start`, {}, 'learner', 409);
  assert((await call('GET', `/diagnostics/plans/${plan.id}`)).impact.definitionChangedActionIds.length > 0);
  for (const item of unfinished.items) await call('POST', `/diagnostics/sessions/${unfinished.id}/responses`, { itemId: item.id, answer: await answer(unfinished.id, item), elapsedMs: 1000 }, 'learner');
  const oldCompletion = await call('POST', `/diagnostics/sessions/${unfinished.id}/complete`, {}, 'learner');
  assert.equal(oldCompletion.definitionContext.atoms.find(row => row.id === release.before.id).version, 1);
  const current = await call('POST', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [release.after.id], includePrerequisites: true, maxItems: 12 }, 'learner');
  assert(current.blueprint.prerequisiteAtomIds.includes('foundation:math:divisiontable'));
  for (const item of current.items) await call('POST', `/diagnostics/sessions/${current.id}/responses`, { itemId: item.id, answer: await answer(current.id, item, true), elapsedMs: 1000 }, 'learner');
  const report = await call('POST', `/diagnostics/sessions/${current.id}/complete`, {}, 'learner');
  const hypothesis = report.hypotheses.find(row => row.atomId === release.after.id && row.cause === 'prerequisite_gap'); assert(hypothesis);
  const check = await call('POST', '/diagnostics/blueprints', { studentId, subject: 'math', intent: 'verification', hypothesisId: hypothesis.id,
    includePrerequisites: true, maxItems: 12, requestKey: randomUUID() }, 'learner');
  assert(check.blueprint.verification.groups.some(row => row.atomId === 'foundation:math:divisiontable'));
  const checkpoint = await store.transaction(() => blueprintContentHash({ atom: store.find('knowledgeAtoms', { id: release.after.id }),
    mappings: store.select('measurementItems', { atomId: release.after.id }), revisions: store.inspect('curriculumRevisions') }));
  await stop(); await start();
  assert.equal(await store.transaction(() => blueprintContentHash({ atom: store.find('knowledgeAtoms', { id: release.after.id }),
    mappings: store.select('measurementItems', { atomId: release.after.id }), revisions: store.inspect('curriculumRevisions') })), checkpoint);
  assert.deepEqual(await call('GET', `/diagnostics/sessions/${baseline.id}/report`, undefined, 'learner'), oldReport);
  // Exercise the actual v2 produced by the previous teaching-card migration, including its persisted lineage.
  const { teaching: _teaching, ...withoutTeaching } = release.before;
  const writeLegacyV2 = async (actorId, edit = {}) => store.transaction(() => {
    const previous = { ...structuredClone(release.before), version: 2, ...edit };
    Object.assign(store.find('knowledgeAtoms', { id: release.before.id }), previous);
    store.remove('curriculumRevisions', { kind: 'atom', entityId: release.before.id });
    for (const [version, snapshot] of [[1, withoutTeaching], [2, previous]]) store.append('curriculumRevisions', {
      id: store.nextId('owned_legacy_revision'), kind: 'atom', entityId: release.before.id, version, actorId,
      at: '2026-10-19T00:00:00.000Z', snapshot: structuredClone(snapshot) });
  });
  await store.transaction(() => {
    for (const mapping of legacyMappings) store.remove('curriculumRevisions', { kind: 'measurement', entityId: mapping.id });
    store.remove('measurementItems', { atomId: release.before.id });
    for (const mapping of legacyMappings) store.append('measurementItems', structuredClone(mapping));
  });
  await writeLegacyV2('system:authored-teaching-v1'); await stop(); await start();
  await store.transaction(() => {
    assert.deepEqual(store.find('knowledgeAtoms', { id: release.after.id }), { ...release.after, version: 3 });
    const history = store.select('curriculumRevisions', { kind: 'atom', entityId: release.after.id });
    assert.deepEqual(history.map(row => row.version), [1, 2, 3]); assert.equal(history[2].actorId, `system:${release.releaseId}`);
    assert(reviewedIds.every(id => store.find('measurementItems', { id }).version === 2));
  });
  const teachingMigrationCheckpoint = await releaseCheckpoint(); await stop(); await start();
  assert.deepEqual(await releaseCheckpoint(), teachingMigrationCheckpoint);
  // A manual v2 with identical values lacks the system lineage; an edited system v2 is also left for review.
  await writeLegacyV2('owned:teacher'); const manualV2Checkpoint = await releaseCheckpoint(); await stop(); await start();
  assert.deepEqual(await releaseCheckpoint(), manualV2Checkpoint);
  await writeLegacyV2('system:authored-teaching-v1', { name: '合成教师已修改的定义' });
  const editedV2Checkpoint = await releaseCheckpoint(); await stop(); await start(); assert.deepEqual(await releaseCheckpoint(), editedV2Checkpoint);
  evidence.result = { originalCollections: originals, reviewedMappings: reviewedIds.length, editedPacketsPreserved: modified.length,
    interruptedStartupDidNotDoubleIncrement: true, newDefinitionVersion: graph.version, oldTargetEvidenceExcludedFromCurrentProfile: oldTargetEvidence,
    oldReportAndUnfinishedSessionFrozen: true, oldPreviewRejected: true, oldPlanRequiresReconfirmation: true,
    divisionIncludedInNewScopeAndRootVerification: true, repeatedRestartIdempotent: true,
    priorSystemTeachingV2UpgradesToV3WithLineage: true, manualAndEditedV2PreservedAcrossRestart: true,
    restartsIncludingInterrupted: 8 };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.stack; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) { try { if (qaDatabase && /^study_relations_[a-f0-9]{32}$/.test(qaDatabase)) {
    await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]); await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
  } } finally { await adminPool.end(); } }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, result: evidence.result, error: evidence.error }));
  assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert(path.basename(directory).startsWith('study-authored-relations-'));
  fs.rmSync(directory, { recursive: true, force: true });
});
