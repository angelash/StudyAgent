// Actual Nest HTTP against an owned synthetic SQLite database. No tokens enter evidence.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { NestFactory } = require('@nestjs/core');
const request = require('supertest');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-concurrent-learning-'));
Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const { AuthService } = require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
const evidencePath = path.resolve(process.argv[2] ?? 'data/qa/concurrent-learning.json');
const metrics = [];
const summary = samples => {
  const values = samples.sort((a, b) => a - b);
  return { samples: values.length, p50Ms: +values[Math.ceil(values.length * .5) - 1].toFixed(2), p95Ms: +values[Math.ceil(values.length * .95) - 1].toFixed(2), maxMs: +values.at(-1).toFixed(2) };
};
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
  const store = app.get(InMemoryStoreService), auth = app.get(AuthService);
  try {
    const families = [];
    // Hashing is outside performance samples; every subsequent command uses the real authorization guard.
    for (let index = 0; index < 8; index++) families.push({ index, ...await store.transaction(() => auth.register({
      principal: `concurrent-synthetic-parent-${index}`, credential: 'Synthetic-concurrent-password',
    }, `fixture-${index}`)) });
    await store.transaction(() => {
      for (let index = 0; index < 1000; index++) store.append('students', { id: `unrelated-student-${index}`, userId: `unrelated-user-${index}`, nickname: '合成规模样本', grade: 3,
        preferredSessionMinutes: 15, defaultVersionMap: { math: 'original', chinese: '', english: '' } });
      for (let index = 0; index < 20000; index++) store.append('diagnosticResponses', { id: `unrelated-response-${index}`, studentId: `unrelated-student-${index % 1000}`,
        sessionId: `unrelated-session-${index % 2000}`, benchmarkPayload: '仅作并发与隔离检查的合成存储记录。'.repeat(28) });
    });
    async function call(family, method, route, body, expected = method === 'post' ? 201 : 200) {
      let query = request(app.getHttpServer())[method]('/api' + route).set('Authorization', `Bearer ${family.token}`);
      if (body !== undefined) query = query.send(body);
      const response = await query;
      assert.equal(response.status, expected, `${method} ${route}: ${response.body.error?.message ?? ''}`);
      if (expected < 400) assert.equal(response.body.error, null);
      return response.body.data;
    }
    async function wave(name, action) {
      const samples = await Promise.all(families.map(async family => { const start = performance.now(); await action(family); return performance.now() - start; }));
      metrics.push({ name, concurrency: families.length, ...summary(samples) });
    }
    await wave('create_child', async f => { const result = await call(f, 'post', '/students', { nickname: `合成孩子${f.index}`, grade: 3,
      preferredSessionMinutes: 15, defaultVersionMap: { math: 'original', chinese: '', english: '' } }); f.studentId = result.profile.id; });
    const atomId = 'foundation:math:multiplydigits';
    await wave('save_scope', f => call(f, 'put', `/students/${f.studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper',
      textbookVolumeId: null, textbookVersion: '原创能力路径', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 }));
    await wave('start_assessment', async f => { f.session = await call(f, 'post', '/diagnostics/sessions', { studentId: f.studentId, subject: 'math',
      intent: 'baseline', maxItems: 4, includePrerequisites: false }); assert.ok(f.session.items.length >= 2); });
    for (let index = 0; index < Math.max(...families.map(f => f.session.items.length)); index++) {
      await wave(`save_assessment_draft_${index}`, async f => {
        const item = f.session.items[index]; if (item) await call(f, 'patch', `/diagnostics/sessions/${f.session.id}/items/${item.id}/draft`, { answer: 0 });
      });
      await wave(`submit_assessment_${index}`, async f => {
        const item = f.session.items[index]; if (item) await call(f, 'post', `/diagnostics/sessions/${f.session.id}/responses`, { itemId: item.id, answer: 0, elapsedMs: 1234 });
      });
    }
    await wave('complete_assessment', async f => { f.report = await call(f, 'post', `/diagnostics/sessions/${f.session.id}/complete`, {});
      assert.equal(f.report.rawScore, 0); assert.ok(f.report.estimates.every(e => e.status !== 'secure')); });
    await wave('generate_rule_plan', async f => { f.plan = await call(f, 'post', `/diagnostics/students/${f.studentId}/plans`, {
      baselineSessionId: f.session.id, minutesPerDay: 15, useAi: false }); assert.ok(f.plan.actions.length); });
    await wave('activate_plan', async f => { f.plan = await call(f, 'patch', `/diagnostics/plans/${f.plan.id}`, { status: 'active', expectedRevision: f.plan.revision }); });
    await wave('start_practice', async f => { f.practice = await call(f, 'post', `/learning/plans/${f.plan.id}/actions/${f.plan.actions[0].id}/start`, {}); });
    await wave('save_practice_draft', f => call(f, 'patch', `/learning/practice/${f.practice.id}/questions/${f.practice.questions[0].id}/draft`, { answer: 0 }));
    await wave('submit_practice', f => call(f, 'post', `/learning/practice/${f.practice.id}/responses`, {
      questionId: f.practice.questions[0].id, requestKey: `synthetic-attempt-${f.index}`, answer: 0, elapsedMs: 1234 }));
    await wave('recover_own_draft_and_report', async f => {
      const own = await call(f, 'get', `/learning/practice/${f.practice.id}`); assert.equal(own.studentId, f.studentId); assert.equal(own.summary.attempted, 1);
      await call(f, 'get', `/diagnostics/sessions/${families[(f.index + 1) % families.length].session.id}`, undefined, 403);
      assert.equal((await call(f, 'get', `/diagnostics/sessions/${f.session.id}/report`)).sessionId, f.session.id);
    });
    await store.requestContext(() => {
      for (const f of families) {
        assert.equal(store.select('diagnosticResponses', { sessionId: f.session.id }).length, f.session.items.length);
        assert.equal(store.select('diagnosticDrafts', { sessionId: f.session.id }).length, 0);
        assert.equal(store.select('practiceAttempts', { sessionId: f.practice.id }).length, 1);
        assert.ok(store.select('reviewTasks', { studentId: f.studentId }).length >= 4);
      }
      assert.equal(store.select('diagnosticResponses', { studentId: Array.from({ length: 1000 }, (_, index) => `unrelated-student-${index}`) }).length, 20000);
    });
    const performanceTargetsMet = metrics.every(metric => metric.p95Ms < 500);
    const evidence = { at: new Date().toISOString(), passed: performanceTargetsMet, functionalPassed: true, performanceTargetsMet, performanceTargetMs: 500,
      driver: 'sqlite', families: 8, unrelatedFamilies: 1000, unrelatedResponses: 20000,
      conflicts: 0, requestsAutomaticallyReplayed: 0, scope: 'Actual local HTTP with synthetic data. No browser or production capacity claim.',
      metrics, storage: store.storageDiagnostics, runtime: { node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model }, memory: process.memoryUsage() };
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true }); fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ passed: evidence.passed, functionalPassed: true, performanceTargetsMet, families: 8, metrics, storage: evidence.storage }));
    if (!performanceTargetsMet) throw new Error('Functional checks passed; at least one p95 sample exceeded the 500ms target');
  } finally {
    await app.close();
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(directory).startsWith('study-concurrent-learning-')) throw new Error('Unexpected cleanup target');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
