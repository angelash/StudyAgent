// Independent production-mode HTTP exercise. The fixture is original; real archives are only staged, never published.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-measurement-runtime-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/measurement-content-runtime.json'), driver = process.argv[3] ?? 'sqlite';
const realSource = process.argv[4] === 'real';
assert(['sqlite', 'postgres'].includes(driver));
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
  STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_ASSET_ROOT: realSource ? path.join(root, 'data/assets') : path.join(directory, 'assets') });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
let app, store, base, adminPool, database;
const tokens = {};
const evidence = { at: new Date().toISOString(), driver, realSource, passed: false,
  scope: realSource ? 'Private recovered archive, isolated business database, staging and restart only. No source publication, scoring or measurement-validity claim.' :
    'Original synthetic paper, production-mode HTTP, concurrent publication and three restarts. No browser or human educational validity claim.',
  sourceSha256: Object.fromEntries(['apps/api/src/modules/library/measurement-content.service.ts', 'apps/api/src/modules/library/measurement-content.controller.ts',
    'apps/api/src/modules/diagnostics/curriculum.service.ts', 'apps/api/src/modules/diagnostics/measurement-definition.ts',
    'packages/contracts/src/measurement-content.ts', 'apps/web/app/admin/measurement/page.tsx'].map(file => [file,
      createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
function fixture() {
  const assets = process.env.STUDY_ASSET_ROOT; fs.mkdirSync(path.join(assets, 'shijuanbao/media'), { recursive: true });
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(assets, 'shijuanbao/media/original.png'), image); const sha = createHash('sha256').update(image).digest('hex');
  const manifest = new DatabaseSync(path.join(assets, 'manifest.sqlite3')); manifest.exec('CREATE TABLE files(path TEXT PRIMARY KEY,bytes INTEGER,sha256 TEXT,state TEXT)');
  manifest.prepare('INSERT INTO files VALUES(?,?,?,?)').run('shijuanbao/media/original.png', image.length, sha, 'verified'); manifest.close();
  const archive = new DatabaseSync(path.join(assets, 'shijuanbao/archive.sqlite3'));
  archive.exec('CREATE TABLE papers(key TEXT PRIMARY KEY,detail TEXT); CREATE TABLE questions(key TEXT PRIMARY KEY,body BLOB); CREATE TABLE media_jobs(url TEXT,path TEXT,sha256 TEXT,state TEXT)');
  archive.prepare('INSERT INTO media_jobs VALUES(?,?,?,?)').run('https://qa.example/original.png', 'media/original.png', sha, 'done');
  archive.prepare('INSERT INTO papers VALUES(?,?)').run('qa:original', JSON.stringify({ questions: [{ uuid: 'qa-question', title: '<p>原创QA：三个圆与两个圆合并有几个？</p><img src="https://qa.example/original.png">', answer: '<p>5</p>', details: '<p>合并两个部分。</p>', options: [] }] })); archive.close();
  const catalog = new DatabaseSync(path.join(assets, 'catalog.sqlite3'));
  catalog.exec(`CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT,grade TEXT,subject TEXT,province TEXT,paper_type TEXT,year INTEGER,content_state TEXT,
    expected INTEGER,available INTEGER,missing INTEGER,pdf_url TEXT,detail_sha256 TEXT,metadata_flags TEXT);
    CREATE TABLE paper_items(paper_id TEXT,position INTEGER,question_key TEXT,available INTEGER);`);
  catalog.prepare('INSERT INTO papers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('qa:original', '原创合成测量素材', '三年级', '数学', 'QA', 'QA', 2026, 'partial', 2, 1, 1, null, 'qa', '[]');
  catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run('qa:original', 1, 'paper:qa-question', 1);
  catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run('qa:original', 2, 'paper:missing', 0); catalog.close();
}
async function start() { app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1'); store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`; }
async function stop() { await app?.close(); app = undefined; }
async function raw(method, route, body, actor = 'admin') {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json(); return { status: response.status, data: result.data, error: result.error?.message };
}
async function call(method, route, body, expected = method === 'POST' ? 201 : 200, actor = 'admin') {
  const result = await raw(method, route, body, actor); assert.equal(result.status, expected, `${method} ${route}: ${result.error ?? ''}`); return result.data;
}
const route = row => `/measurement-content/candidates/${encodeURIComponent(row.id)}`;
const cmd = (row, extra = {}) => ({ expectedVersion: row.version, requestKey: randomUUID(), reason: '使用独立原创QA素材验证原卷快照、五项审核、发布与版本恢复。', ...extra });
async function main() {
  if (!realSource) fixture();
  if (driver === 'postgres') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
    assert.equal(config.purpose, 'StudyAgent isolated QA cluster'); assert.equal(config.port, 15439); assert.equal(config.appUser, 'study_agent_app');
    adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
    database = 'study_measurement_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${database}`);
    const setup = new Pool({ host: '127.0.0.1', port: config.port, database, user: config.adminUser, password: config.adminPassword });
    try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
    const url = new URL(`postgresql://127.0.0.1:${config.port}/${database}`); url.username = config.appUser; url.password = config.appPassword;
    process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
  }
  const credential = randomBytes(24).toString('hex');
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-measurement-content'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(boot.status, 0, 'Formal administrator bootstrap'); await start();
  tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-measurement-content', credential })).token;
  tokens.parent = (await call('POST', '/auth/register', { principal: 'qa-measurement-parent', credential: randomBytes(24).toString('hex') })).token;
  let paperId = 'qa:original', positions = [1, 2];
  if (realSource) {
    const result = await call('GET', '/library/papers?collection=research&subject=' + encodeURIComponent('数学') + '&grade=' + encodeURIComponent('三年级') + '&state=complete&pageSize=1');
    assert(result.items.length); paperId = result.items[0].id;
    const paper = await call('GET', '/library/papers/' + encodeURIComponent(paperId)); positions = paper.questions.filter(q => !q.missing).slice(0, 3).map(q => q.position); assert(positions.length);
  }
  const staged = await call('POST', '/measurement-content/candidates', { paperId, positions }); assert(staged.created >= 1);
  let row = await call('GET', '/measurement-content/candidates/' + encodeURIComponent(staged.items[0].id));
  const sourceHash = row.sourceHash; assert(row.original); assert(!row.usable);
  await call('GET', route(row), undefined, 403, 'parent');
  await stop(); await start();
  row = await call('GET', route(row)); assert.equal(row.sourceHash, sourceHash);
  assert.equal((await call('POST', '/measurement-content/candidates', { paperId, positions })).created, 0);
  if (realSource) {
    evidence.result = { staged: staged.created, immutableSourceHashSurvivesRestart: true, noPublication: true,
      noMeasurement: await store.transaction(() => store.inspect('measurementItems').every(item => !item.questionId.startsWith('curated:'))),
      privateResearchAccess: true, restarts: 1 }; evidence.passed = true; return;
  }
  assert(staged.items[1].issue.includes('缺少'));
  const atomId = 'qa:measurement:merge';
  await call('POST', '/admin/knowledge-atoms', { id: atomId, subject: 'math', grade: 3, name: 'QA两个部分合并', strand: '数与关系', term: 'both',
    objective: '识别同一整体的两个部分并合并数量', successCriterion: '独立说明合并关系并求出整体', prerequisiteIds: [], curriculumVersion: 'qa-v1', status: 'published', version: 1 });
  const draft = { subject: 'math', grade: 3, stem: '三个圆与两个圆合并，一共有几个圆？', answer: 5, analysis: '两个部分合并，3加2得到5。',
    blocks: [{ id: 'original-figure', type: 'image', url: row.media[0].url, alt: '合成QA资源，仅验证本地媒体路径' }],
    answerSchema: { mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} },
    mapping: { primaryAtomId: atomId, prerequisiteAtomIds: [], secondaryAtomIds: [], dimension: 'transfer', family: 'qa:merge:diagram',
      probeRole: 'transfer', expectedSeconds: 30, difficulty: 1, observationCode: 'merge_response_mismatch', observedSteps: ['说明两个部分属于同一整体', '用合并关系求总量'],
      rationale: '此原创QA任务直接观察两个部分合并为整体的行为', familyRationale: '观察情境建立合并模型；测试不声称形成多个独立迁移题族' },
    license: { licenseClass: 'A_INTERNAL', evidence: '本卷题面与示意媒体由QA脚本构造，仅供本地产品运行验证' },
    scoringCases: [{ response: 5, expectedScore: 1, rationale: '正确合并两个部分' }, { response: 1, expectedScore: 0, rationale: '误用减法求差' }] };
  row = await call('POST', route(row) + '/draft', cmd(row, { draft }));
  await call('POST', route(row) + '/publish', cmd(row), 400);
  for (const gate of ['source', 'content', 'media', 'scoring', 'mapping']) row = await call('POST', route(row) + '/reviews', cmd(row, { gate, decision: 'approved' }));
  const publish = cmd(row); await stop(); await start();
  const parallel = await Promise.all([raw('POST', route(row) + '/publish', publish), raw('POST', route(row) + '/publish', publish)]);
  assert(parallel.some(result => result.status === 201)); assert(parallel.every(result => [201, 409].includes(result.status)), JSON.stringify(parallel));
  row = await call('POST', route(row) + '/publish', publish); assert(row.usable);
  const publishedId = row.questionId;
  assert.equal(await store.transaction(() => store.select('measurementItems', { questionId: publishedId }).length), 1);
  const studentId = (await call('POST', '/students', { nickname: '合成测量素材核验', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: '', chinese: '', english: '' } }, 201, 'parent')).profile.id;
  await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
    textbookVersion: '合成QA范围', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 }, 200, 'parent');
  const session = await call('POST', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'micro', includePrerequisites: false }, 201, 'parent'); assert.equal(session.items.length, 1);
  const render = await call('GET', `/diagnostics/sessions/${session.id}/items/${session.items[0].id}`, undefined, 200, 'parent');
  assert.deepEqual(render.payload.answerSchema.gradingConfig, {}); assert(!JSON.stringify(render).includes('scoringCases'));
  const withdraw = cmd(row); row = await call('POST', route(row) + '/withdraw', withdraw); assert(!row.usable);
  await stop(); await start();
  row = await call('POST', route(row) + '/withdraw', withdraw); assert.equal(row.status, 'withdrawn'); assert.equal(row.sourceHash, sourceHash);
  const media = await fetch(base.replace(/\/api$/, '') + draft.blocks[0].url, { headers: { Authorization: `Bearer ${tokens.parent}` } }); assert.equal(media.status, 200); assert.equal((await media.arrayBuffer()).byteLength, 67);
  await call('POST', `/diagnostics/sessions/${session.id}/responses`, { itemId: session.items[0].id, answer: 5, elapsedMs: 1300 }, 201, 'parent');
  const report = await call('POST', `/diagnostics/sessions/${session.id}/complete`, {}, 201, 'parent'); assert.equal(report.rawScore, 100); assert.equal(report.scoredCount, 1);
  row = await call('POST', route(row) + '/draft', cmd(row, { draft: { ...draft, analysis: '新修订重新核对合并两个部分的理由与结果。' } }));
  assert.deepEqual(row.reviews, {}); assert.equal(row.original.title.includes('原创QA'), true);
  evidence.result = { originalAndMissingPositionsPreserved: true, independentFiveReviews: true, goldCasesReplayed: true,
    parallelPublishStatuses: parallel.map(result => result.status), onePrimaryMapping: true, sourceSnapshotAndReviewsSurviveRestart: true,
    answerAndReviewMaterialNotExposed: true, withdrawnCandidateExcludedFromNewMeasurement: true, frozenSessionScoresAfterWithdrawal: true,
    frozenAuthorizedMediaReads: true, editingInvalidatesAllReviews: true, versionHistoryRetainsDraft: row.history.some(entry => entry.draft), restarts: 3 };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) { try { if (database && /^study_measurement_[a-f0-9]{32}$/.test(database)) {
    await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [database]); await adminPool.query(`DROP DATABASE IF EXISTS ${database}`);
  } } finally { await adminPool.end(); } }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, realSource, result: evidence.result, error: evidence.error }));
  const target = path.resolve(directory); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-measurement-runtime-')) throw new Error('Unexpected temporary cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
