// Owned SQLite QA journey. Replaces only the isolated executable receipt with a deterministic control flow.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { Pool } = require('pg');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-gesp-loop-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/gesp-learning-loop.json');
const driver = process.argv[3] ?? 'sqlite';
if (!['sqlite', 'postgres'].includes(driver)) throw new Error('Expected sqlite or postgres');
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
  STUDY_WORKER_ENABLED: 'false', STUDY_RATE_LIMIT_IP_PER_MINUTE: '10000' });
delete process.env.OPENAI_API_KEY;
let adminPool, ownedDatabase;
const curriculum = require('../../resources/gesp/student-curriculum-v2.json');
const task = curriculum.tasks.find(row => row.atomId === 'gesp-cpp.l1.io');
const evidence = { at: new Date().toISOString(), driver, passed: false,
  scope: 'Owned production-mode SQLite, formal HTTP roles, persistent restarts and deterministic control receipt; not a substitute for the real isolated runner, human review or learning-effect study.'
};
let app, store, base, parent, learner, studentId;
async function start() {
  const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
  const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
  const { GespService } = require('../../apps/api/dist/apps/api/src/modules/gesp/gesp.service.js');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
  app.get(GespService).runCpp = async (source, tests) => ({
    passed: true, sourceSha256: createHash('sha256').update(source).digest('hex'), toolchain: 'qa-control-flow',
    compile: { passed: true, stderr: '' }, tests: tests.map((_test, index) => ({ index, passed: true, status: 'passed', exitCode: 0, durationMs: 1, stderr: '' }))
  });
}
async function stop() { await app?.close(); app = undefined; }
async function call(method, route, body, actor = parent, expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json',
    ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${result.error?.message ?? ''}`); return result.data;
}
async function configureDatabase() {
  if (driver === 'sqlite') return;
  if (process.env.STUDY_TEST_POSTGRES_URL) { process.env.DATABASE_URL = process.env.STUDY_TEST_POSTGRES_URL; process.env.STUDY_STORAGE = 'postgres'; return; }
  const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
  if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.appUser !== 'study_agent_app') throw new Error('Expected the owned local QA cluster');
  adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
  ownedDatabase = 'study_gesp_loop_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${ownedDatabase}`);
  const setup = new Pool({ host: '127.0.0.1', port: config.port, database: ownedDatabase, user: config.adminUser, password: config.adminPassword });
  try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
  const url = new URL(`postgresql://127.0.0.1:${config.port}/${ownedDatabase}`); url.username = config.appUser; url.password = config.appPassword;
  process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
}
async function main() {
  await configureDatabase();
  await start();
  parent = await call('POST', '/auth/register', { principal: `gesp-loop-${randomUUID()}`, credential: randomBytes(18).toString('hex') }, null);
  const created = await call('POST', '/students', { nickname: 'GESP持久化闭环', grade: 4, preferredSessionMinutes: 15,
    defaultVersionMap: { math: '', chinese: '', english: '' } });
  studentId = created.profile.id;
  const access = await call('POST', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0,
    requestKey: randomUUID(), reason: '家长允许孩子使用独立GESP学习身份' });
  const code = await call('POST', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() });
  learner = await call('POST', '/auth/learning-code', { code: code.code }, null);
  await call('PUT', `/gesp/students/${studentId}/scope`, { level: 1, atomIds: [task.atomId], requestKey: randomUUID(),
    reason: '家长确认测试知识点的一级原创编程范围' });
  const hint = await call('POST', '/gesp/hints', { studentId, atomId: task.atomId, taskId: task.id, level: 1, requestKey: randomUUID() }, learner);
  for (const probe of task.probes) await call('POST', '/gesp/probe-submissions', { studentId, atomId: task.atomId, probeId: probe.id,
    answer: probe.answer, requestKey: randomUUID() }, learner);
  const assisted = await call('POST', '/gesp/code-submissions', { studentId, atomId: task.atomId, source: 'int main(){}',
    requestKey: randomUUID(), hintEventId: hint.id }, learner);
  assert.equal(assisted.independent, false); assert.equal(assisted.hintLevel, 1);
  const independent = await call('POST', '/gesp/code-submissions', { studentId, atomId: task.atomId, source: 'int main(){return 0;}', requestKey: randomUUID() }, learner);
  assert.equal(independent.independent, true);
  let workspace = await call('GET', `/gesp/students/${studentId}/workspace`, undefined, learner);
  assert.equal(workspace.capabilities[0].state, 'current_evidence_met', JSON.stringify({ capability: workspace.capabilities[0], submissions: workspace.submissions, probes: workspace.probeSubmissions }));
  assert.deepEqual(workspace.reviewTasks.map(row => row.stageDay), [1, 3, 7, 14], JSON.stringify({ capability: workspace.capabilities[0], reviews: workspace.reviewTasks }));
  assert(workspace.reviewTasks.every(row => /^[a-f0-9]{64}$/.test(row.testPackSha256)));
  const plan = await call('POST', '/gesp/guidance-plans', { studentId, scopeVersion: 1, minutesPerDay: 20,
    requestKey: randomUUID(), reason: '家长依据当前GESP独立证据生成待确认计划' });
  assert.equal(plan.status, 'awaiting_confirmation');
  await call('PATCH', `/gesp/guidance-plans/${plan.id}`, { status: 'active', expectedVersion: 1, requestKey: randomUUID(),
    reason: '家长核对知识点、活动、成功标准和每日时长' });
  const due = workspace.reviewTasks[0];
  await store.transaction(() => { store.find('gespReviewTasks', { id: due.id }).dueAt = new Date(Date.now() - 1000).toISOString(); });
  workspace = await call('GET', `/gesp/students/${studentId}/workspace`, undefined, learner);
  assert.equal(workspace.reviewTasks.find(row => row.id === due.id).due, true);
  const review = await call('POST', '/gesp/code-submissions', { studentId, atomId: task.atomId, source: 'int main(){}',
    requestKey: randomUUID(), reviewTaskId: due.id }, learner);
  assert.equal(review.reviewTaskId, due.id); assert.equal(review.independent, false);
  evidence.beforeRestart = { hintId: hint.id, planId: plan.id, reviewId: due.id, stages: workspace.reviewTasks.map(row => row.stageDay) };
  await stop(); await start();
  workspace = await call('GET', `/gesp/students/${studentId}/workspace`, undefined, learner);
  assert.equal(workspace.hintEvents.find(row => row.id === hint.id).revealsAnswer, false);
  assert.equal(workspace.guidancePlans.find(row => row.id === plan.id).status, 'active');
  assert.deepEqual(workspace.reviewTasks.find(row => row.id === due.id), { ...workspace.reviewTasks.find(row => row.id === due.id),
    status: 'completed', attemptCount: 1, lastStatus: 'passed' });
  assert.equal(workspace.capabilities[0].dimensions.find(row => row.dimension === 'retention').status, 'correct');
  assert.equal(workspace.capabilities[0].state, 'current_evidence_met');
  const serialized = JSON.stringify(workspace);
  assert.equal(serialized.includes('"expected"'), false, 'hidden expected output'); assert.equal(serialized.includes('requestKey'), false, 'request key');
  assert(workspace.tasks.every(row => !Object.prototype.hasOwnProperty.call(row, 'tests')));
  assert(workspace.reviewTasks.every(row => !Object.prototype.hasOwnProperty.call(row, 'tests')));
  evidence.result = { assistedSeparated: true, hintPersists: true, planConfirmedByParent: true, reviewStages: 4,
    differentPackHashes: new Set(workspace.reviewTasks.map(row => row.testPackSha256)).size, dueReviewCompleted: true,
    retentionDimensionSeparated: true, privateSourceAndTestsWithheld: true, restarts: 1 };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) {
    try {
      if (ownedDatabase && /^study_gesp_loop_[a-f0-9]{32}$/.test(ownedDatabase)) {
        await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [ownedDatabase]);
        await adminPool.query(`DROP DATABASE IF EXISTS ${ownedDatabase}`);
      }
    } finally { await adminPool.end(); }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, result: evidence.result, error: evidence.error }));
  const target = path.resolve(directory);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-gesp-loop-')) throw new Error('Unexpected cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
