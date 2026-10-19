// Synthetic local HTTP benchmark. Uses an owned temporary database, never real family data.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { NestFactory } = require('@nestjs/core');
const request = require('supertest');
const label = process.argv[2] ?? 'current';
const evidencePath = path.resolve(process.argv[3] ?? `data/qa/storage-performance-${label}.json`);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-performance-'));
Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const { AuthService } = require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
const { buildFoundationCurriculum } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/foundation-curriculum.js');
const authoredTasks = buildFoundationCurriculum().reduce((sum, definition) => sum + definition.exercises.length, 0);
const summary = samples => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples: sorted.length, p50Ms: +sorted[Math.ceil(sorted.length * .5) - 1].toFixed(2), p95Ms: +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2), maxMs: +sorted.at(-1).toFixed(2) };
};
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
  const delay = monitorEventLoopDelay({ resolution: 10 }); delay.enable();
  try {
    const store = app.get(InMemoryStoreService), auth = app.get(AuthService);
    const owner = await store.transaction(() => auth.register({ principal: 'performance-synthetic-owner', credential: 'Synthetic-performance-password' }));
    await store.transaction(() => {
      for (let index = 0; index < 1000; index++) {
        const id = `synthetic-child-${index}`, parentId = index === 0 ? owner.user.id : `synthetic-other-owner-${index}`;
        store.students.push({ id, userId: id, nickname: `合成样本${index}`, grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: 'original', chinese: 'original', english: 'original' } });
        store.bindings.push({ id: `synthetic-binding-${index}`, parentUserId: parentId, studentId: id, relation: 'guardian', status: 'active' });
      }
      for (let index = 0; index < 20000; index++) store.diagnosticResponses.push({ id: `synthetic-evidence-${index}`, studentId: `synthetic-child-${index % 1000}`,
        sessionId: `synthetic-session-${index % 2000}`, questionId: `synthetic-question-${index % authoredTasks}`, score: 0.5, createdAt: '2026-10-01T00:00:00.000Z',
        benchmarkPayload: '仅作存储规模与隔离验证的合成证据。'.repeat(28) });
    });
    const routes = ['/auth/me', '/learning/students', '/diagnostics/curriculum?subject=math&grade=3'];
    async function sample(route) {
      const started = performance.now(), response = await request(app.getHttpServer()).get('/api' + route).set('Authorization', `Bearer ${owner.token}`).expect(200);
      if (route === '/auth/me' && response.body.data.id !== owner.user.id) throw new Error('Incorrect principal');
      if (route === '/learning/students' && (!Array.isArray(response.body.data) || response.body.data.length !== 1 || response.body.data[0].id !== 'synthetic-child-0')) throw new Error('Family isolation failed');
      return performance.now() - started;
    }
    for (const route of routes) await sample(route);
    const metrics = [];
    for (const route of routes) {
      const samples = [];
      for (let index = 0; index < 12; index++) samples.push(await sample(route));
      metrics.push({ route, mode: 'sequential', ...summary(samples) });
    }
    const concurrent = [];
    for (let round = 0; round < 4; round++) concurrent.push(...await Promise.all(Array.from({ length: 8 }, () => sample('/auth/me'))));
    metrics.push({ route: '/auth/me', mode: '8 concurrent requests', ...summary(concurrent) });
    const withinTarget = metrics.every(row => row.p95Ms < 500);
    const data = { at: new Date().toISOString(), label, passed: withinTarget, p95TargetMs: 500, scope: 'Synthetic warm local HTTP reads; no production-load, write-contention or browser acceptance claim',
      runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
      fixture: { families: 1000, evidenceRecords: 20000, originalTasks: authoredTasks, sqliteBytes: fs.statSync(path.join(directory, 'study-agent.sqlite3')).size },
      metrics, storage: store.storageDiagnostics ?? null,
      eventLoop: { p95Ms: +(delay.percentile(95) / 1e6).toFixed(2), maxMs: +(delay.max / 1e6).toFixed(2) },
      memory: process.memoryUsage() };
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true }); fs.writeFileSync(evidencePath, JSON.stringify(data, null, 2) + '\n');
    console.log(JSON.stringify({ label, metrics, storage: data.storage }));
    if (!withinTarget) throw new Error('Local p95 sample exceeded the 500ms reference target');
  } finally {
    delay.disable(); await app.close();
    const target = path.resolve(directory), tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!target.startsWith(tempRoot) || !path.basename(target).startsWith('study-performance-')) throw new Error('Unexpected cleanup target');
    fs.rmSync(target, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
