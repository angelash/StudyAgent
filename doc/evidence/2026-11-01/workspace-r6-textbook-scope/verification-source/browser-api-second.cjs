require('reflect-metadata');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), net = require('node:net');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p181'), directory = path.join(candidate, 'data/qa/scope-browser-second'), registryPath = path.join(directory, 'registry.json'), nonce = crypto.randomBytes(24).toString('base64url');
if (fs.existsSync(directory)) throw Error('Unused generated browser data required'); fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(path.join(directory, 'empty-assets'));
const registry = JSON.parse(fs.readFileSync(path.join(candidate, 'resources/curriculum/textbooks-v1.json')));
const book = (id, term, chapters = [], chapterState = 'missing') => ({ id: 'qa-scope:' + id, subject: 'chemistry', grade: 9, term, title: '原创核对样本 ' + id, edition: '隔离结构样本', version: 'qa-v1', source: 'public_catalog', sourceRef: 'original QA metadata only', sourceSha256: 'a'.repeat(64), chapterState, chapters });
registry.books.push(...Array.from({ length: 12 }, (_, index) => book('missing-' + index, 'upper')), book('usable', 'upper', [{ id: 'qa-unit', name: '原始合成单元', lessons: [{ id: 'combined', name: '组合课时', parts: [{ name: '子标题甲', printedPage: 1 }, { name: '子标题乙', printedPage: 2 }] }, { id: 'activity', name: '活动', kind: 'activity' }, { id: 'reference', name: '附录', kind: 'reference' }] }], 'available'), book('appendix', 'upper', [{ id: 'qa-unit', name: '附录单元', lessons: [{ id: 'only-reference', name: '只含附录', kind: 'reference' }] }], 'available'), book('unconfirmed', 'upper', [{ id: 'qa-unit', name: '待核对单元', lessons: [{ id: 'unconfirmed', name: '未确认课时' }] }]), book('lower-one', 'lower'), book('lower-two', 'lower'));
fs.writeFileSync(registryPath, JSON.stringify(registry), { flag: 'wx' });
Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_ASSET_ROOT: path.join(directory, 'empty-assets'), TEXTBOOK_BASE_PATH: '', STUDY_TEXTBOOK_REGISTRY: registryPath, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '', API_PORT: '16182', CORS_ORIGINS: 'http://localhost:13182,http://127.0.0.1:13182' }); delete process.env.DATABASE_URL;
process.chdir(candidate);
const load = file => require(path.join(candidate, 'apps/api/dist/apps/api/src', file + '.js')), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let app, actor;
(async () => {
  await new Promise((yes, no) => { const probe = net.createServer(); probe.once('error', no); probe.listen(16182, '127.0.0.1', () => probe.close(yes)); });
  const { NestFactory } = require('@nestjs/core'); app = await NestFactory.create(load('app.module').AppModule, { logger: false });
  app.setGlobalPrefix('api'); app.enableCors({ origin: ['http://localhost:13182', 'http://127.0.0.1:13182'], credentials: true });
  const store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
  app.getHttpAdapter().getInstance().post('/__qa/scope-control', require('express').json({ limit: '4kb' }), async (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers['x-study-qa'] !== nonce) return res.status(403).end();
    try {
      if (req.body?.action === 'snapshot') { const { DomainDatabase } = load('infrastructure/domain-database'), db = new DomainDatabase(path.join(directory, 'study-agent.sqlite3')); await db.open(); let value; try { value = await db.read(); } finally { await db.close(); } return res.json({ nonce, revision: value.revision, hash: sha(JSON.stringify(value)), tasks: await store.tasks.summary() }); }
      if (req.body?.action === 'role' && ['admin', 'parent'].includes(req.body.role) && actor) { await store.transaction(() => { store.find('users', { id: actor.user.id }).role = req.body.role; }); return res.json({ nonce, role: req.body.role }); }
      if (req.body?.action === 'shutdown') { res.json({ nonce, stopping: true }); setImmediate(() => app.close().then(() => process.exit(0))); return; }
      res.status(400).end();
    } catch { res.status(500).json({ error: 'Owned QA control failed' }); }
  });
  await app.listen(16182, '127.0.0.1');
  const principal = 'scope-browser-' + crypto.randomUUID(), credential = crypto.randomBytes(24).toString('base64url');
  const response = await fetch('http://127.0.0.1:16182/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  if (response.status !== 201) throw Error('Generated account registration failed'); actor = (await response.json()).data;
  await store.transaction(() => { store.find('users', { id: actor.user.id }).role = 'admin'; });
  fs.writeFileSync(path.join(__dirname, 'browser-runtime-second.private.json'), JSON.stringify({ candidate, directory, registryPath, nonce, principal, credential, actorId: actor.user.id, apiPort: 16182, webPort: 13182, pid: process.pid }), { flag: 'wx', mode: 0o600 });
  const report = { at: new Date().toISOString(), ready: true, pid: process.pid, apiPort: 16182, webPort: 13182, actualPrimaryRegisteredBooks: 448, additionalSyntheticChemistryBooks: 17, generatedDataOnly: true, externalModelsCalled: false, formalDatabaseContacted: false, sourceOriginalsNotInstalledInFixture: true };
  fs.writeFileSync(path.join(__dirname, 'browser-api-second.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report));
})().catch(async error => { fs.writeFileSync(path.join(__dirname, 'browser-api-second-failure.log'), String(error.stack ?? error), { flag: 'wx' }); await app?.close(); console.error('Owned browser API failed; original private runtime and logs retained'); process.exitCode = 1; });
