require('reflect-metadata');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), request = require('supertest');
const root = path.resolve(__dirname, '../../..'), candidate = path.join(root, 'data/qa/p180'), config = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy-runtime.private.json')));
if (config.directory !== path.join(root, 'data/qa/w180old') || config.assets !== path.join(config.directory, 'paper-assets')) throw Error('Exact old generated fixture required');
Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: config.directory, STUDY_ASSET_ROOT: config.assets, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', STUDY_PAPER_EXPORT_INSTALLATION: path.join(root, 'data/qa/er2/installation.json'), XIAOJIU_CHAT_ENABLED: 'false', OPENAI_API_KEY: '' }); delete process.env.DATABASE_URL;
const load = name => require(path.join(candidate, 'apps/api/dist/apps/api/src', name + '.js')), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let app;
(async () => {
  const { NestFactory } = require('@nestjs/core'), { DomainDatabase } = load('infrastructure/domain-database');
  async function native() { const db = new DomainDatabase(path.join(config.directory, 'study-agent.sqlite3')); await db.open(); try { return await db.read(); } finally { await db.close(); } }
  const before = await native();
  app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
  async function call(method, route, input) { let req = request(app.getHttpServer())[method]('/api' + route).set('Authorization', 'Bearer ' + config.actor.token); if (input) req = req.send(input); const response = await req; assert.equal(response.status, method === 'post' ? 201 : 200, JSON.stringify(response.body.error)); return response.body.data; }
  const result = await call('post', '/library/export-commands', config.input); assert.deepEqual(result, config.result);
  const receipt = await call('get', '/library/export-commands/' + config.input.requestKey); assert.deepEqual(receipt.input, config.input); assert.deepEqual(receipt.result, config.result);
  const view = await call('get', '/library/exports/' + result.exportId); assert.deepEqual(view.slots[0], config.file);
  const response = await request(app.getHttpServer()).get(view.slots[0].downloadUrl).set('Authorization', 'Bearer ' + config.actor.token).buffer(true).parse((response, done) => { const chunks = []; response.on('data', chunk => chunks.push(Buffer.from(chunk))); response.on('end', () => done(null, Buffer.concat(chunks))); });
  assert.equal(response.status, 200); assert.equal(sha(response.body), config.file.publication.sha256);
  const after = await native(); assert.deepEqual(after, before);
  const record = after.state.paperExports.find(row => row.id === result.exportId); assert.equal(record.intent.fingerprint, config.intentFingerprint); assert(record.intent.document.items[0].reference.answerHtml.includes('\\(\\frac'));
  const report = { at: new Date().toISOString(), actualOldToNewColdOpen: true, oldGeneratedPdfReadbackSha256: sha(response.body), oldIntentAndRawUnusedTexUnchanged: true, originalCommandAndResultUnchanged: true, allNativeRowsAndRevisionUnchanged: true, revision: before.revision, source: ['paper-export-document-source.ts', 'paper-export-tex.ts', 'paper-export.service.ts'].map(file => ({ path: 'apps/api/src/modules/library/' + file, sha256: sha(fs.readFileSync(path.join(candidate, 'apps/api/src/modules/library', file))) })), noFormalDataOrHumanLearning: true };
  fs.writeFileSync(path.join(__dirname, 'legacy-upgrade-first.json'), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ actualOldBookDownloadedByNewSource: true, allNativeRowsUnchanged: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await app?.close(); });
