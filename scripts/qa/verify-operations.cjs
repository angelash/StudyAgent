// Real local HTTP, fresh production-mode SQLite, formal admin bootstrap and restart.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-operations-runtime-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/operations-runtime.json');
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
let app, base, token;
const evidence = { at: new Date().toISOString(), scope: 'Fresh local production-mode SQLite, formal local admin bootstrap, HTTP and service restart; no browser or remote deployment acceptance', passed: false };
async function start() {
  app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function call(method, route, body, status = 200) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, status, `${method} ${route}`);
  return { response, payload: await response.json() };
}
async function main() {
  const credential = randomBytes(24).toString('hex');
  const bootstrap = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-production-operations'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(bootstrap.status, 0, 'Administrator bootstrap'); evidence.formalAdminBootstrap = true;
  await start();
  token = (await call('POST', '/auth/login', { principal: 'qa-production-operations', credential }, 201)).payload.data.token;
  assert.equal((await call('GET', '/auth/me')).payload.data.role, 'admin');
  assert.equal((await call('GET', '/ready')).payload.data.storage.durable, true);
  const code = '0123456789deadbeefcafe';
  for (let index = 0; index < 30; index++) await call('POST', '/auth/learning-code', { code }, 401);
  const limited = await call('POST', '/auth/learning-code', { code }, 429);
  assert(Number(limited.response.headers.get('retry-after')) > 0); evidence.failedGuessesBeforeLimit = 30;
  await app.close(); app = undefined; await start();
  assert.equal((await call('GET', '/auth/me')).payload.data.role, 'admin');
  await call('POST', '/auth/learning-code', { code }, 429); evidence.quotaSurvivesRestart = true;
  await call('GET', '/health'); await call('GET', '/ready');
  const overview = (await call('GET', '/admin/operations')).payload.data;
  assert.equal(overview.storage.driver, 'sqlite'); assert(overview.storage.counters.cacheHits > 0);
  const text = JSON.stringify(overview); assert(!text.includes(token)); assert(!text.includes(credential)); assert(!text.includes(code));
  const database = new DatabaseSync(path.join(directory, 'study-agent.sqlite3'), { readOnly: true });
  try { evidence.schemaVersion = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version; } finally { database.close(); }
  // Fault injection: the native database connection is closed while HTTP still runs.
  await app.get(InMemoryStoreService).onModuleDestroy();
  await call('GET', '/health'); await call('GET', '/ready', undefined, 500);
  evidence.healthIndependentOfStorage = true; evidence.readinessRejectsClosedStorage = true;
  evidence.operations = overview; evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await app?.close(); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, schemaVersion: evidence.schemaVersion, formalAdminBootstrap: evidence.formalAdminBootstrap, quotaSurvivesRestart: evidence.quotaSurvivesRestart, error: evidence.error }));
  const target = path.resolve(directory);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-operations-runtime-')) throw new Error('Unexpected temporary cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
