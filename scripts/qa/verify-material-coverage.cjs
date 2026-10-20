// Owned synthetic databases, formal role grants, production HTTP and persistent restarts.
require('reflect-metadata');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process'), { performance } = require('node:perf_hooks');
const { Pool } = require('pg'), { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-material-coverage-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/material-coverage-runtime.json'), driver = process.argv[3] ?? 'sqlite';
assert(['sqlite', 'postgres'].includes(driver));
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY; delete process.env.STUDY_SEED_FOUNDATION;
const from = file => require(path.join(root, 'apps/api/dist/apps/api/src', file));
const { AppModule } = from('app.module.js'), { InMemoryStoreService } = from('infrastructure/in-memory-store.service.js');
const { blueprintContentHash } = from('modules/diagnostics/assessment-blueprint.js');
const files = ['packages/contracts/src/curriculum.ts', 'apps/api/src/modules/diagnostics/curriculum.service.ts',
  'apps/api/src/modules/diagnostics/diagnostics.controller.ts', 'apps/api/src/modules/diagnostics/textbook-registry.service.ts',
  'apps/api/src/modules/diagnostics/textbook-registry-document.test.ts', 'apps/api/src/common/stream-file.ts',
  'apps/api/src/modules/diagnostics/verification-materials.ts', 'apps/api/src/modules/diagnostics/verification-blueprint.ts',
  'apps/api/src/modules/diagnostics/measurement-definition.ts', 'apps/api/src/modules/diagnostics/family-identity.ts',
  'apps/api/src/modules/diagnostics/diagnosis.ts', 'apps/web/app/admin/curriculum/page.tsx',
  'apps/api/src/modules/diagnostics/authored-probes.ts', 'apps/api/src/modules/diagnostics/authored-english-foundation-probes.ts',
  'apps/api/src/modules/diagnostics/authored-english-lexical-probes.ts', 'resources/curriculum/authored-task-baseline-6830-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade1-probes.ts', 'resources/curriculum/authored-task-baseline-6974-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-oral-grade1-probes.ts', 'resources/curriculum/authored-task-baseline-7550-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade2-probes.ts', 'resources/curriculum/authored-task-baseline-7598-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade3-probes.ts', 'resources/curriculum/authored-task-baseline-8222-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade4-probes.ts', 'resources/curriculum/authored-task-baseline-8846-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade5-probes.ts', 'apps/api/src/modules/diagnostics/authored-chinese-grade6-probes.ts',
  'resources/curriculum/authored-task-baseline-9470-v1.json',
  'apps/api/src/modules/diagnostics/authored-english-grade1-grade2-probes.ts',
  'apps/api/src/modules/diagnostics/authored-english-grade1-grade2-probes.test.ts',
  'apps/api/src/modules/diagnostics/authored-english-grade3-grade6-probes.ts',
  'apps/api/src/modules/diagnostics/authored-english-grade3-grade6-probes.test.ts',
  'resources/curriculum/authored-task-baseline-10718-v1.json',
  'resources/curriculum/authored-task-baseline-14174-v1.json',
  'apps/api/src/modules/diagnostics/authored-math-grade5-grade6-probes.ts',
  'apps/api/src/modules/diagnostics/authored-math-grade5-grade6-probes.test.ts',
  'resources/curriculum/authored-task-baseline-15758-v1.json',
  'packages/contracts/src/gesp.ts', 'apps/api/src/modules/gesp/gesp.service.ts', 'apps/api/src/modules/gesp/gesp.controller.ts',
  'apps/api/src/modules/gesp/isolated-runner.test.ts', 'apps/api/src/modules/gesp/gesp-student.integration.test.ts',
  'scripts/gesp/run_submission.cjs', 'scripts/gesp/backup_archive.py', 'scripts/gesp/test_backup_archive.py',
  'scripts/gesp/capture_sources.py', 'scripts/gesp/restore_archive.py', 'scripts/gesp/build_runtime_index.py',
  'scripts/gesp/validate_preparation.py', 'scripts/qa/verify-gesp-runner.cjs',
  'resources/gesp/student-curriculum-v1-base.json', 'resources/gesp/student-curriculum-v2.json',
  'scripts/content/build-gesp-student-curriculum.cjs', 'scripts/qa/audit-gesp-student-curriculum.cjs',
  'apps/api/src/modules/gesp/student-curriculum.test.ts',
  'apps/web/app/parent/gesp/page.tsx', 'apps/web/app/student/gesp/page.tsx',
  'apps/web/app/admin/curriculum/mapping-worklist.tsx', 'apps/web/app/admin/curriculum/mapping-worklist.css',
  'resources/curriculum/atom-catalog-v1.json', 'resources/curriculum/chinatextbook-chinese-v1.json',
  'resources/curriculum/textbook-mapping-candidates-v1.json', 'scripts/assets/import_chinatextbook.py',
  'scripts/assets/verify_chinatextbook_manifest.py', 'scripts/assets/build_textbook_mapping_candidates.py',
  'scripts/assets/test_textbook_mapping_candidates.py', 'scripts/content/export-foundation-atoms.cjs',
  'apps/api/src/modules/diagnostics/foundation-curriculum.ts', 'apps/api/src/modules/diagnostics/foundation-seed.service.ts',
  'apps/api/src/modules/question-workspace/question-workspace.service.ts',
  'resources/curriculum/authored-task-baseline-6686-v1.json',
  'apps/web/app/admin/curriculum/material-coverage.tsx', 'apps/web/app/admin/curriculum/curriculum.css',
  'scripts/qa/audit-authored-curriculum.cjs', 'scripts/qa/verify-material-coverage.cjs'];
const evidence = { at: new Date().toISOString(), driver, passed: false,
  scope: 'Synthetic family, existing original tasks, formal administrator/teacher HTTP, complete business-record hashes and two persistent restarts. Warm local read samples only; no browser, classroom, calibration or complete textbook claim.',
  sourceSha256: Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
const collections = ['knowledgeAtoms', 'questions', 'questionDocuments', 'questionAnswerSchemas', 'questionSources', 'measurementItems',
  'measurementCandidates', 'curriculumRevisions', 'textbookAtomMappings', 'learningScopes', 'diagnosticSessions', 'diagnosticResponses',
  'diagnosticBlueprints', 'diagnosticReports', 'diagnosticHypotheses', 'diagnosticPlans', 'guidancePlanRevisions', 'reviewTasks', 'scoringRevisions'];
let app, store, base, adminPool, qaDatabase; const tokens = {}, atomId = 'core:math:multiple';
async function start() {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function call(method, route, body, actor = 'admin', expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${result.error?.message ?? ''}`); return result.data;
}
const overview = (query = '', actor = 'admin') => call('GET', '/admin/curriculum/overview' + query, undefined, actor);
const target = result => result.atoms.find(row => row.id === atomId);
const fingerprint = () => store.transaction(() => Object.fromEntries(collections.map(collection => {
  const rows = [...store.inspect(collection)].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return [collection, { records: rows.length, sha256: blueprintContentHash(rows) }];
})));
async function verifyPublishedCounts() {
  const result = await overview(); assert.equal(result.atoms.length, 258); assert.equal(result.cells.length, 18);
  assert.equal(result.atoms.filter(row => row.materialCoverage.ready).length, 258);
  assert.equal(result.cells.reduce((sum, cell) => sum + cell.needingVerificationMaterials, 0), 0);
  assert(result.cells.every(cell => cell.withVerificationMaterials + cell.needingVerificationMaterials === cell.atoms));
  assert(result.atoms.every(row => row.materialCoverage.version === 'verification-materials-v1'));
  for (const [subject, count, ready, gap] of [['math', 19, 19, 0], ['chinese', 13, 13, 0], ['english', 13, 13, 0]]) {
    const filtered = await overview(`?subject=${subject}&grade=${subject === 'math' ? 5 : 1}`);
    assert.equal(filtered.atoms.length, count); assert.equal(filtered.cells.length, 1);
    assert.equal(filtered.cells[0].withVerificationMaterials, ready); assert.equal(filtered.cells[0].needingVerificationMaterials, gap);
  }
  const teacher = await overview('', 'teacher'); assert.deepEqual(teacher.atoms, result.atoms); assert.deepEqual(teacher.cells, result.cells);
  return result;
}
async function verifyDenied() {
  for (const [actor, status] of [['parent', 403], ['learner', 403], ['anonymous', 401]]) await call('GET', '/admin/curriculum/overview', undefined, actor, status);
}
async function setupPostgres() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
  assert.equal(config.purpose, 'StudyAgent isolated QA cluster'); assert.equal(config.port, 15439); assert.equal(config.appUser, 'study_agent_app');
  adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
  qaDatabase = 'study_materials_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
  const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
  try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
  const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
  process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
}
async function main() {
  if (driver === 'postgres') await setupPostgres();
  const credential = randomBytes(24).toString('hex'), teacherCredential = randomBytes(24).toString('hex');
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-material-admin'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(boot.status, 0, 'Formal administrator bootstrap'); await start();
  tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-material-admin', credential }, 'anonymous')).token;
  const registered = await call('POST', '/auth/register', { principal: 'qa-material-teacher', credential: teacherCredential }, 'anonymous');
  const teacherId = registered.user.id;
  const promoted = await call('PATCH', `/admin/accounts/${teacherId}`, { role: 'teacher', status: 'active', expectedVersion: 1,
    reason: '隔离合成教研素材核验，正式授予教师角色', adminCredential: credential });
  assert.equal(promoted.role, 'teacher'); tokens.oldTeacher = registered.token;
  await call('GET', '/admin/curriculum/overview', undefined, 'oldTeacher', 401);
  tokens.teacher = (await call('POST', '/auth/login', { principal: 'qa-material-teacher', credential: teacherCredential }, 'anonymous')).token;
  tokens.parent = (await call('POST', '/auth/register', { principal: 'qa-material-parent', credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
  const studentId = (await call('POST', '/students', { nickname: '合成素材核验学生', grade: 5, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } }, 'parent')).profile.id;
  const access = await call('POST', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(),
    reason: '核验独立学生身份不能读取教研素材统计' }, 'parent');
  const code = await call('POST', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() }, 'parent');
  tokens.learner = (await call('POST', '/auth/learning-code', { code: code.code }, 'anonymous')).token;
  // Create genuine frozen student records, so read-only verification includes nonempty learning history.
  const historyAtom = 'foundation:math:multiplydigits';
  await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创能力路径', learnedAtomIds: [historyAtom, atomId], currentAtomId: historyAtom, minutesPerSession: 15 }, 'parent');
  const command = { studentId, subject: 'math', intent: 'baseline', targetAtomIds: [historyAtom], maxItems: 2, includePrerequisites: false };
  const baseline = await call('POST', '/diagnostics/sessions', command, 'parent'); assert.equal(baseline.items.length, 2);
  const frozen = await store.transaction(() => structuredClone(store.find('diagnosticSessions', { id: baseline.id })));
  const { gradeResponse } = from('modules/diagnostics/scoring.js');
  for (const item of baseline.items) {
    const packet = frozen.questionSnapshots.find(row => row.id === item.questionId), schema = packet.answerSchema;
    const wrong = schema.mode === 'multi_blank' ? packet.answer.map(entry => ({ ...entry, value: String(Number(entry.value) + 1) })) :
      schema.mode === 'single_choice' ? schema.options.find(option => option.value !== packet.answer).value :
        schema.mode === 'boolean' ? !packet.answer : '-999999';
    assert.equal(gradeResponse(schema, packet.answer, wrong).score, 0, 'Legal synthetic below-standard answer');
    await call('POST', `/diagnostics/sessions/${baseline.id}/responses`, { itemId: item.id, answer: wrong, elapsedMs: 1800 }, 'parent');
  }
  await call('POST', `/diagnostics/sessions/${baseline.id}/complete`, {}, 'parent');
  const report = await call('GET', `/diagnostics/sessions/${baseline.id}/report`, undefined, 'parent'); assert.equal(report.scoredCount, 2);
  const plan = await call('POST', `/diagnostics/students/${studentId}/plans`, { baselineSessionId: baseline.id, minutesPerDay: 10, useAi: false }, 'parent');
  assert(plan.actions.length > 0);
  await call('PATCH', `/diagnostics/plans/${plan.id}`, { expectedRevision: plan.revision, status: 'active', requestKey: randomUUID() }, 'parent');
  const preview = await call('POST', '/diagnostics/blueprints', { ...command, requestKey: randomUUID() }, 'parent'); assert(preview.id);
  const before = await fingerprint();
  for (const name of ['diagnosticSessions', 'diagnosticResponses', 'diagnosticReports', 'diagnosticBlueprints', 'diagnosticPlans', 'reviewTasks']) assert(before[name].records > 0, name);
  const initial = await verifyPublishedCounts(); await verifyDenied(); assert.deepEqual(await fingerprint(), before);
  evidence.readOnlyBefore = before;
  const mappings = (await call('GET', `/admin/curriculum/atoms/${encodeURIComponent(atomId)}/items`)).filter(row => row.mapping.dimension === 'understanding').map(row => row.mapping);
  assert.equal(mappings.length, 12);
  const withdrawn = [];
  for (const mapping of mappings) withdrawn.push(await call('POST', '/admin/measurement-items', { ...mapping, reviewStatus: 'draft' }, 'teacher'));
  const withGap = await overview('?subject=math&grade=5');
  assert.equal(target(withGap).materialCoverage.ready, false); assert.equal(target(withGap).materialCoverage.structure.understandingFamilies, 0);
  assert(target(withGap).materialCoverage.structure.gaps.includes('understanding_family_missing'));
  assert.equal(withGap.cells[0].withVerificationMaterials, 18); assert.equal(withGap.cells[0].needingVerificationMaterials, 1);
  const withdrawnState = await fingerprint();
  await stop(); await start(); assert.deepEqual(await fingerprint(), withdrawnState);
  const restoredGap = await overview('?subject=math&grade=5'); assert.deepEqual(restoredGap.atoms, withGap.atoms); assert.deepEqual(restoredGap.cells, withGap.cells); await verifyDenied();
  for (const mapping of withdrawn) await call('POST', '/admin/measurement-items', { ...mapping, reviewStatus: 'approved' }, 'teacher');
  const restored = await verifyPublishedCounts();
  assert.deepEqual(restored.atoms.map(row => ({ id: row.id, materialCoverage: row.materialCoverage })), initial.atoms.map(row => ({ id: row.id, materialCoverage: row.materialCoverage })));
  assert.deepEqual(await call('GET', `/diagnostics/sessions/${baseline.id}/report`, undefined, 'parent'), report);
  assert.deepEqual(await call('GET', `/diagnostics/blueprints/${encodeURIComponent(preview.id)}`, undefined, 'parent'), preview);
  const revisedState = await fingerprint();
  for (const collection of collections.filter(name => !['measurementItems', 'curriculumRevisions'].includes(name))) assert.deepEqual(revisedState[collection], before[collection], collection);
  await stop(); await start(); assert.deepEqual(await fingerprint(), revisedState);
  await verifyPublishedCounts(); await verifyDenied(); assert.deepEqual(await fingerprint(), revisedState);
  const revoked = await call('PATCH', `/admin/accounts/${teacherId}`, { role: 'parent', status: 'active', expectedVersion: promoted.version,
    reason: '隔离素材核验结束后撤销教师权限并核对旧会话', adminCredential: credential });
  assert.equal(revoked.role, 'parent'); await call('GET', '/admin/curriculum/overview', undefined, 'teacher', 401);
  tokens.revoked = (await call('POST', '/auth/login', { principal: 'qa-material-teacher', credential: teacherCredential }, 'anonymous')).token;
  await call('GET', '/admin/curriculum/overview', undefined, 'revoked', 403);
  const samples = [];
  for (let index = 0; index < 12; index++) { const at = performance.now(); await overview(); samples.push(performance.now() - at); }
  const sorted = [...samples].sort((a, b) => a - b), p95Ms = sorted[Math.ceil(sorted.length * .95) - 1];
  evidence.performance = { scope: '12 warm sequential production HTTP overview reads on owned local database; excludes startup and hash verification',
    samples: samples.length, p50Ms: +sorted[Math.ceil(sorted.length * .5) - 1].toFixed(2), p95Ms: +p95Ms.toFixed(2), maxMs: +sorted.at(-1).toFixed(2), referenceTargetMs: 500 };
  assert(p95Ms < 500, `Warm material overview p95 ${p95Ms.toFixed(2)}ms exceeded local 500ms reference`);
  assert.deepEqual(await fingerprint(), revisedState);
  evidence.result = { points: 258, cells: 18, readyMaterials: 258, needingMaterials: 0, currentEligibilityAndBudget: true,
    formalTeacherGrantAndRevocation: true, parentLearnerAndAnonymousDenied: true, reviewedWithdrawalAndRestoration: mappings.length,
    withdrawnStateSurvivesRestart: true, restoredStateSurvivesRestart: true, nonemptyStudentHistoryAndPreviewUnchanged: true,
    allBusinessRecordHashesUnchangedByReads: true, restarts: 2 };
  evidence.readOnlyAfter = revisedState; evidence.passed = true;
}
main().catch(error => { evidence.error = error.stack; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) { try { if (qaDatabase && /^study_materials_[a-f0-9]{32}$/.test(qaDatabase)) {
    await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]); await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
  } } finally { await adminPool.end(); } }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, result: evidence.result, performance: evidence.performance, error: evidence.error }));
  assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert(path.basename(directory).startsWith('study-material-coverage-'));
  fs.rmSync(directory, { recursive: true, force: true });
});
