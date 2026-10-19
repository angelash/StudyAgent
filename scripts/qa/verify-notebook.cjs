// Independent synthetic-family HTTP acceptance in production mode; never touches real family data.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-notebook-runtime-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/notebook-runtime.json'), driver = process.argv[3] ?? 'sqlite';
assert(['sqlite', 'postgres'].includes(driver));
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
  STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_ASSET_ROOT: path.join(directory, 'assets') });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
let app, store, base, adminPool, database;
const tokens = {}, credential = randomBytes(24).toString('hex');
const evidence = { at: new Date().toISOString(), driver, passed: false,
  scope: 'Original synthetic student, production HTTP, independent student access, concurrent organization, frozen redo, unseen verification, scoring revision and three restarts. Browser layout and human educational validity are separate.',
  sourceSha256: Object.fromEntries(['apps/api/src/modules/learning/notebook.service.ts', 'apps/api/src/modules/learning/notebook.controller.ts',
    'apps/api/src/modules/learning/learning.service.ts', 'apps/api/src/modules/ai/ai.service.ts', 'apps/api/src/modules/privacy/privacy-records.ts',
    'apps/web/components/mistake-notebook.tsx', 'apps/web/components/mistake-notebook.css', 'packages/contracts/src/learning.ts'].map(file => [file,
      createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
async function start() { app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1'); store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`; }
async function stop() { await app?.close(); app = undefined; }
async function raw(method, route, body, actor = 'learner') {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json(); return { status: response.status, data: result.data, error: result.error?.message };
}
async function call(method, route, body, expected = method === 'POST' ? 201 : 200, actor = 'learner') {
  const result = await raw(method, route, body, actor); assert.equal(result.status, expected, `${method} ${route}: ${result.error ?? ''}`); return result.data;
}
const command = (row, extra = {}) => ({ expectedVersion: row?.version ?? 0, requestKey: randomUUID(), reason: '原创合成QA：回看原始表现、记录卡点并独立验证后续新题。', ...extra });
async function main() {
  if (driver === 'postgres') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
    assert.equal(config.purpose, 'StudyAgent isolated QA cluster'); assert.equal(config.port, 15439); assert.equal(config.appUser, 'study_agent_app');
    adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
    database = 'study_notebook_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${database}`);
    const setup = new Pool({ host: '127.0.0.1', port: config.port, database, user: config.adminUser, password: config.adminPassword });
    try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
    const url = new URL(`postgresql://127.0.0.1:${config.port}/${database}`); url.username = config.appUser; url.password = config.appPassword;
    process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
  }
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-notebook-admin'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(boot.status, 0, 'Formal administrator bootstrap'); await start();
  tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-notebook-admin', credential }, 201, 'admin')).token;
  tokens.parent = (await call('POST', '/auth/register', { principal: 'qa-notebook-parent', credential }, 201, 'parent')).token;
  tokens.other = (await call('POST', '/auth/register', { principal: 'qa-notebook-other', credential: randomBytes(24).toString('hex') }, 201, 'other')).token;
  await store.transaction(() => {
    store.append('knowledgeAtoms', { id: 'qa-merge', subject: 'math', grade: 3, name: '合成QA合并关系', strand: '数与关系', term: 'both',
      objective: '识别两个部分属于同一个整体并说明合并', successCriterion: '在独立新题中解释关系并求整体', prerequisiteIds: [], curriculumVersion: 'qa-v1', status: 'published', version: 1 });
    for (let n = 0; n < 32; n++) {
      const id = `qa-notebook-q${n}`;
      store.append('questions', { id, subject: 'math', type: 'objective', stem: `原创合成题${n}：三个与两个合并是多少？`, answer: 5,
        analysis: '识别两个部分，再合并为同一个整体。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
      store.append('questionAnswerSchemas', { questionId: id, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
      store.append('questionSources', { questionId: id, sourceType: 'internal_authoring', sourceName: '原创QA', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'test', importJobId: null, reviewStatus: 'approved', notes: null });
      store.append('measurementItems', { id: `qa-notebook-item${n}`, questionId: id, questionVersion: 1, atomId: 'qa-merge', dimension: n % 2 ? 'transfer' : 'understanding',
        family: `qa-family${n % 8}`, probeRole: n % 2 ? 'transfer' : 'anchor', expectedSeconds: 20, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'merge_mismatch', version: 1 });
    }
  });
  const student = (await call('POST', '/students', { nickname: '错题闭环合成QA', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: '', chinese: '', english: '' } }, 201, 'parent')).profile;
  await call('PUT', `/students/${student.id}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创QA范围', learnedAtomIds: ['qa-merge'], currentAtomId: 'qa-merge', minutesPerSession: 15 }, 200, 'parent');
  await call('POST', `/students/${student.id}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '核对学生独立错题整理与权限隔离。' }, 201, 'parent');
  const code = await call('POST', `/students/${student.id}/learning-access/codes`, { expectedVersion: 1, requestKey: randomUUID() }, 201, 'parent');
  tokens.learner = (await call('POST', '/auth/learning-code', { code: code.code })).token;
  const prefix = `/learning/students/${student.id}/notebook`;
  const initial = await call('POST', '/diagnostics/sessions', { studentId: student.id, subject: 'math', intent: 'micro', maxItems: 2, includePrerequisites: false });
  const response = await call('POST', `/diagnostics/sessions/${initial.id}/responses`, { itemId: initial.items[0].id, answer: 2, elapsedMs: 1700 });
  assert.equal((await call('GET', prefix + '?subject=math')).total, 0);
  const route = `${prefix}/diagnostic/${response.responseId}`;
  await call('GET', route, undefined, 409); await call('GET', route, undefined, 403, 'other');
  await call('POST', `/diagnostics/sessions/${initial.id}/responses`, { itemId: initial.items[1].id, answer: 5, elapsedMs: 1700 });
  await call('POST', `/diagnostics/sessions/${initial.id}/complete`, {});
  let row = await call('GET', route); assert.equal(row.referenceAnswer, 5); assert.deepEqual(row.payload.answerSchema.gradingConfig, {});
  const metadata = { ...row.metadata, favorite: true, tags: ['核对条件'], errorSteps: ['把两个部分对应到同一个整体'], reflection: '保留原来的错误，之后用新题检验解释。', reviewState: 'reviewed' };
  const organize = command(row, { metadata });
  const parallel = await Promise.all([raw('POST', route + '/organize', organize), raw('POST', route + '/organize', organize)]);
  assert(parallel.some(result => result.status === 201)); assert(parallel.every(result => [201, 409].includes(result.status)), JSON.stringify(parallel));
  row = await call('POST', route + '/organize', organize); assert.equal(row.version, 1); assert.equal(row.history.length, 1);
  assert.equal((await call('GET', prefix + '?subject=math&favorite=true&tag=' + encodeURIComponent('核对条件'))).total, 1);
  const redoCommand = command(row), redo = await call('POST', route + '/redo', redoCommand), qid = redo.questions[0].id;
  assert.equal(redo.origin, 'notebook'); assert.equal(redo.planId, null); assert.equal(redo.planRevision, redo.currentPlanRevision);
  const draft = { questionId: qid, mode: 'numeric_blank', response: { value: 5 } };
  await call('PATCH', `/learning/practice/${redo.id}/questions/${qid}/draft`, { answer: draft });
  await stop(); await start();
  assert.equal((await call('POST', route + '/redo', redoCommand)).id, redo.id);
  const restored = await call('GET', `/learning/practice/${redo.id}/questions/${qid}`); assert.deepEqual(restored.draft.answer, draft);
  const answered = await call('POST', `/learning/practice/${redo.id}/responses`, { questionId: qid, requestKey: randomUUID(), answer: draft, elapsedMs: 2000 });
  assert.equal(answered.attempt.correct, true); assert.equal(answered.attempt.solutionExposedBefore, true); assert(!answered.notice.includes('已独立完成'));
  const completed = await call('POST', `/learning/practice/${redo.id}/complete`, {}); assert.equal(completed.summary.independentFirstPass, 0);
  row = await call('GET', route); const verification = command(row), preview = await call('POST', route + '/verification', verification);
  await stop(); await start();
  assert.equal((await call('POST', route + '/verification', verification)).id, preview.id);
  const next = await call('POST', `/diagnostics/blueprints/${preview.id}/start`, {});
  assert(next.items.every(item => !initial.items.some(old => old.questionId === item.questionId)));
  for (const item of next.items) await call('POST', `/diagnostics/sessions/${next.id}/responses`, { itemId: item.id, answer: 5, elapsedMs: 1500 });
  await call('POST', `/diagnostics/sessions/${next.id}/complete`, {});
  await call('POST', `/admin/diagnostic-responses/${response.responseId}/review`, { expectedVersion: 0, requestKey: randomUUID(), score: 1,
    reason: '合成QA验证重评分保留原始证据并更新错题状态，不主张本题真实教育正确性。' }, 201, 'admin');
  row = await call('GET', route); assert.equal(row.correct, true); assert.equal(row.originalScore, 0); assert.equal(row.verifications[0].status, 'completed');
  row = await call('POST', route + '/organize', command(row, { metadata: { ...metadata, removed: true } }));
  assert.equal((await call('GET', prefix + '?subject=math')).total, 0); assert.equal((await call('GET', prefix + '?subject=math&state=removed')).total, 1);
  row = await call('POST', route + '/organize', command(row, { metadata }));
  await stop(); await start();
  row = await call('GET', route); assert.equal(row.metadata.reflection, metadata.reflection); assert.equal(row.redos.length, 1); assert.equal(row.verifications[0].status, 'completed');
  const exported = await call('POST', `/privacy/students/${student.id}/export`, { credential, requestKey: randomUUID() }, 201, 'parent');
  const notes = exported.students[0].records.mistakeNotebookEntries; assert.equal(notes.length, 1); assert.equal(notes[0].metadata.reflection, metadata.reflection);
  assert(!JSON.stringify(notes).includes('inputHash')); assert(!JSON.stringify(notes).includes('requestKey'));
  assert.equal(await store.transaction(() => store.find('diagnosticResponses', { id: response.responseId }).score), 0);
  evidence.result = { unfinishedAnswersWithheld: true, familyAndStudentBoundaries: true, minimalPaginatedList: true,
    parallelOrganizationStatuses: parallel.map(result => result.status), oneVersionedReceipt: true, originalRedoWithoutPlan: true,
    draftsAndReferenceSurviveRestart: true, redoDoesNotCountAsIndependent: true, unseenVerification: true, previewReplaysAfterRestart: true,
    revisedScoreRetainsNotesAndOriginal: true, reversibleRemoval: true, portableNotesExcludeInternalDigests: true,
    persistedRedoAndVerificationHistory: true, restarts: 3 };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) { try { if (database && /^study_notebook_[a-f0-9]{32}$/.test(database)) {
    await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [database]); await adminPool.query(`DROP DATABASE IF EXISTS ${database}`);
  } } finally { await adminPool.end(); } }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, result: evidence.result, error: evidence.error }));
  const target = path.resolve(directory); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-notebook-runtime-')) throw new Error('Unexpected temporary cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
