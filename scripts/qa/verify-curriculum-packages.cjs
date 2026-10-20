// Owned production-mode SQLite and real HTTP. No learner data or credentials enter evidence.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-curriculum-runtime-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/curriculum-package-runtime.json');
const driver = process.argv[3] ?? 'sqlite';
if (!['sqlite', 'postgres'].includes(driver)) throw new Error('Expected sqlite or postgres');
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY; delete process.env.STUDY_SEED_FOUNDATION;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const evidence = { at: new Date().toISOString(), driver, scope: 'Owned production-mode database, real HTTP, exact original v1 seed enrichment, protection of released definitions and two service restarts; no browser acceptance or curriculum-completeness claim', passed: false,
  sourceSha256: Object.fromEntries(['scripts/qa/verify-curriculum-packages.cjs', 'apps/api/src/modules/diagnostics/foundation-seed.service.ts',
    'apps/api/src/modules/diagnostics/authored-relation-release.ts', 'apps/api/src/modules/diagnostics/curriculum.service.ts']
    .map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
let app, store, base, token, adminPool, qaDatabase;
async function start() {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function call(method, route, body, expected = method === 'POST' ? 201 : 200) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(15000), headers: {
    'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, ...(body !== undefined ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) } : {}) });
  const result = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${result.error?.message ?? ''}`); return result.data;
}
async function main() {
  if (driver === 'postgres') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
    if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.appUser !== 'study_agent_app') throw new Error('Expected the owned local QA cluster');
    adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
    qaDatabase = 'study_curriculum_' + randomUUID().replaceAll('-', '');
    await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
    const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
    try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
    const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
    process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
  }
  const credential = randomBytes(24).toString('hex');
  const bootstrap = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-curriculum-runtime'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(bootstrap.status, 0, 'Formal administrator bootstrap');
  await start(); token = (await call('POST', '/auth/login', { principal: 'qa-curriculum-runtime', credential })).token;
  const original = await store.transaction(() => structuredClone(store.inspect('knowledgeAtoms')));
  const cards = original.filter(atom => atom.teaching); assert.equal(cards.length, 258);
  evidence.original = { atoms: original.length,
    questions: await store.transaction(() => store.inspect('questions').filter(question => question.id.startsWith('foundation_q_')).length),
    allQuestionsIncludingLegacyFixtures: await store.transaction(() => store.inspect('questions').length),
    approvedTeaching: cards.length, missingTeaching: original.length - cards.length,
    cells: (await call('GET', '/admin/curriculum/overview')).cells };
  // Model an owned older database: leave changed definitions, newer versions and drafts intact.
  await store.transaction(() => {
    for (const { id } of cards) {
      const atom = store.find('knowledgeAtoms', { id }); delete atom.teaching;
    }
    store.find('knowledgeAtoms', { id: cards[1].id }).name += ' · 合成编辑';
    store.find('knowledgeAtoms', { id: cards[2].id }).version = 2;
    store.find('knowledgeAtoms', { id: cards[3].id }).teaching = { ...structuredClone(cards[3].teaching), reviewStatus: 'draft' };
  });
  await stop(); await start();
  const restored = await store.transaction(() => structuredClone(store.inspect('knowledgeAtoms')));
  const byId = new Map(restored.map(atom => [atom.id, atom]));
  const migrated = cards.filter((atom, i) => atom.version === 1 && ![1, 2, 3].includes(i));
  const releasedDefinitions = cards.filter(atom => atom.version > 1);
  for (const { id, teaching } of migrated) {
    assert.equal(byId.get(id).version, 2); assert.deepEqual(byId.get(id).teaching, teaching);
    const history = await call('GET', '/admin/curriculum/revisions/' + encodeURIComponent(id));
    assert.deepEqual(history.map(row => row.version), [2, 1]); assert.equal(history[1].snapshot.teaching, undefined);
  }
  assert(byId.get(cards[1].id).name.endsWith('合成编辑')); assert.equal(byId.get(cards[1].id).teaching, undefined);
  assert.equal(byId.get(cards[2].id).teaching, undefined); assert.equal(byId.get(cards[2].id).version, 2);
  assert.equal(byId.get(cards[3].id).teaching.reviewStatus, 'draft');
  for (const { teaching: _teaching, ...definition } of releasedDefinitions) assert.deepEqual(byId.get(definition.id), definition);
  evidence.exactSeedMigration = { upgraded: migrated.length, customDefinitionPreserved: true, newerVersionPreserved: true,
    draftPreserved: true, originalAndEnrichedRevisions: true, releasedDefinitionsPreserved: releasedDefinitions.map(({ id, version }) => ({ id, version })) };
  const atom = { ...structuredClone(cards[0]), id: 'qa:package:root', name: '合成课程包根节点', version: 1, prerequisiteIds: [] };
  const content = { format: 'study-curriculum-package-v1', title: '持久课程包重启核验', provenance: '合成定义用于检查真实HTTP导入与回执，独立于正式课程内容。',
    atoms: [{ expectedVersion: 0, atom: { ...atom, id: 'qa:package:child', name: '合成课程包子节点', prerequisiteIds: [atom.id], parentId: atom.id } },
      { expectedVersion: 0, atom }] };
  const bytes = Buffer.from(JSON.stringify(content));
  const upload = await call('POST', '/admin/import-files', { name: '课程包.json', mediaType: 'application/json', size: bytes.length, requestKey: randomUUID() });
  for (let index = 0; index < Math.ceil(bytes.length / upload.chunkSize); index++) await call('PUT', `/admin/import-files/${upload.id}/chunks/${index}`, bytes.subarray(index * upload.chunkSize, (index + 1) * upload.chunkSize));
  const file = await call('POST', `/admin/import-files/${upload.id}/complete`, {});
  const preview = await call('POST', '/admin/curriculum/packages/preview', { fileId: file.id }); assert.equal(preview.added, 2);
  const command = { fileId: file.id, fingerprint: preview.fingerprint, requestKey: randomUUID(), reviewed: true };
  const submissions = await Promise.all([0, 1].map(async () => {
    const response = await fetch(base + '/admin/curriculum/packages/apply', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(command), signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() };
  }));
  assert(submissions.every(row => [201, 409].includes(row.status))); assert(submissions.some(row => row.status === 201));
  const result = submissions.find(row => row.status === 201).body.data; assert.equal(result.applied, 2);
  assert.deepEqual(await call('POST', '/admin/curriculum/packages/apply', command), result);
  await stop(); await start();
  assert.equal((await call('GET', '/auth/me')).role, 'admin');
  assert.deepEqual(await call('POST', '/admin/curriculum/packages/apply', command), result);
  const exported = await call('GET', '/admin/curriculum/package?subject=math');
  assert.equal(exported.atoms.find(row => row.atom.id === 'qa:package:child').expectedVersion, 1);
  for (const { id } of migrated) assert.equal((await store.transaction(() => store.find('knowledgeAtoms', { id }))).version, 2);
  for (const { teaching: _teaching, ...definition } of releasedDefinitions) assert.deepEqual(await store.transaction(() => store.find('knowledgeAtoms', { id: definition.id })), definition);
  evidence.packagePersistence = { fileSha256: file.sha256, applied: result.applied, receiptSurvivesRestart: true,
    tokenSurvivesRestart: true, retryDoesNotIncrementVersions: true, seedDoesNotIncrementAgain: true,
    concurrentSameKeyStatuses: submissions.map(row => row.status) };
  if (driver === 'sqlite') {
    const db = new DatabaseSync(path.join(directory, 'study-agent.sqlite3'), { readOnly: true });
    try { evidence.schemaVersion = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version; } finally { db.close(); }
  } else {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try { evidence.schemaVersion = (await pool.query('SELECT MAX(version) AS version FROM schema_migrations')).rows[0].version; } finally { await pool.end(); }
  }
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) {
    try {
      if (qaDatabase && /^study_curriculum_[a-f0-9]{32}$/.test(qaDatabase)) {
        await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]);
        await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
      }
    } finally { await adminPool.end(); }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, original: evidence.original && { atoms: evidence.original.atoms, questions: evidence.original.questions,
    approvedTeaching: evidence.original.approvedTeaching }, migrated: evidence.exactSeedMigration?.upgraded, error: evidence.error }));
  const target = path.resolve(directory);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-curriculum-runtime-')) throw new Error('Unexpected temporary cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
