const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p173');
const requireCandidate = require('node:module').createRequire(path.join(candidate, 'package.json')); requireCandidate('reflect-metadata');
const { NestFactory } = requireCandidate('@nestjs/core');
const own = path.join(__dirname, 'browser-fourth'), port = 16173, webPort = 13173;
if (fs.existsSync(own)) throw Error('New exclusive browser fixture directory required'); fs.mkdirSync(own);
const assets = require(path.join(candidate, 'scripts/qa/paper-practice-fixture.cjs')).preparePaperPracticeAssets(own, root);
Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: path.join(own, 'source'), STUDY_ASSET_ROOT: assets,
  STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '', MINIMAX_API_KEY: '', CORS_ORIGINS: 'http://localhost:' + webPort }); delete process.env.DATABASE_URL;
process.chdir(candidate);
const compiled = file => require(path.join(candidate, 'apps/api/dist/apps/api/src', file + '.js'));
const nonce = crypto.randomBytes(24).toString('base64url'), principal = 'browser-paper-access-' + crypto.randomUUID(), credential = crypto.randomBytes(24).toString('base64url');
let runningApp;
(async () => {
  let store;
  const app = await NestFactory.create(compiled('app.module').AppModule, { logger: false, cors: { origin: ['http://localhost:' + webPort], credentials: true } });
  // This loopback-only, generated fixture control is not product source and is
  // never installed in main. It cannot reach another data directory.
  runningApp = app;
  compiled('common/http-body').configureJsonBody(app);
  app.use('/__qa/control', (request, response) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress) || request.headers['x-study-qa'] !== nonce || request.method !== 'POST') return response.status(403).end();
    void (async () => {
      const body = request.body;
      if (body?.action === 'facts' && typeof body.actorId === 'string') {
        const values = await store.requestContext(() => store.select('paperSourceExposures', { actorId: body.actorId }).map(row => ({ id: row.id, input: row.input, result: row.result })));
        return response.json({ nonce, values });
      }
      if (body?.action === 'diagnostic' && typeof body.studentId === 'string') {
        const id = 'qa173_diagnostic_' + crypto.randomUUID();
        await store.transaction(() => { if (!store.find('students', { id: body.studentId })) throw Error('Unknown generated learner'); store.append('diagnosticSessions', {
          id, studentId: body.studentId, status: 'in_progress', startedAt: new Date().toISOString(),
        }); });
        return response.json({ nonce, id });
      }
      if (body?.action === 'shutdown') { response.json({ nonce, stopping: true }); setImmediate(() => app.close().then(() => process.exit(0))); return; }
      response.status(400).json({ error: 'Unknown generated fixture action' });
    })().catch(() => response.status(500).json({ error: 'Generated fixture operation failed' }));
  });
  app.setGlobalPrefix('api'); await app.init(); store = app.get(compiled('infrastructure/in-memory-store.service').InMemoryStoreService);
  await app.listen(port, '127.0.0.1');
  const result = await fetch('http://127.0.0.1:' + port + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principal, credential }) });
  const rawResponse = await result.text(); fs.writeFileSync(path.join(__dirname, 'browser-api-fourth-registration.private.json'), JSON.stringify({ status: result.status, body: rawResponse }), { flag: 'wx' }); const registered = JSON.parse(rawResponse).data; if (result.status !== 201 || !registered?.token) throw Error('Actual synthetic admin registration failed');
  await store.transaction(() => { store.find('users', { id: registered.user.id }).role = 'admin'; });
  fs.writeFileSync(path.join(__dirname, 'browser-runtime-fourth.private.json'), JSON.stringify({ candidate, own, data: process.env.STUDY_DATA_DIR, assets, port, webPort, nonce, principal, credential, adminToken: registered.token, adminId: registered.user.id, pid: process.pid }), { flag: 'wx' });
  const report = { at: new Date().toISOString(), port, webPort, pid: process.pid, loopbackOnly: true, realAuthAndPersistence: true, generatedFixtureOnly: true, formalDataContacted: false };
  fs.writeFileSync(path.join(__dirname, 'browser-api-fourth.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
})().catch(async error => { fs.writeFileSync(path.join(__dirname, 'browser-api-fourth-failure.private.log'), String(error.stack ?? error), { flag: 'wx' }); fs.writeFileSync(path.join(__dirname, 'browser-api-fourth-failure.json'), JSON.stringify({ at: new Date().toISOString(), ready: false, name: error.name, code: error.code ?? null, privateStackCaptured: true }, null, 2), { flag: 'wx' }); console.error('Isolated browser API reproduction failed; exact stack retained privately.'); await runningApp?.close().catch(() => {}); process.exitCode = 1; });
