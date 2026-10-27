// Explicit real-provider acceptance: synthetic questions, owned temporary DB and no learner records.
require('reflect-metadata');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto'), { execFileSync } = require('node:child_process');
const { NestFactory } = require('@nestjs/core'), request = require('supertest');
const root = path.resolve(__dirname, '../..'), args = process.argv.slice(2), output = args.indexOf('--output');
if (output < 0 || !args[output + 1]) throw Error('An explicit new --output directory is required');
const directory = path.resolve(root, args[output + 1]);
if (!directory.startsWith(path.join(root, 'data/qa') + path.sep) || fs.existsSync(directory)) throw Error('Fresh isolated QA directory required');
const relevant = ['apps/api/src/modules/ai', 'packages/contracts/src/ai-teaching-tools.ts', 'scripts/qa/teaching-tools-live.cjs'];
if (execFileSync('git', ['status', '--porcelain', '--', ...relevant], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()) throw Error('Commit the fixed teaching source and runner first');
Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: path.join(directory, 'private-runtime'), STUDY_WORKER_ENABLED: 'false',
  STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true', OPENAI_API_KEY: '', MINIMAX_API_KEY: '', XIAOJIU_CHAT_TIMEOUT_MS: '60000' });
const load = name => require(path.join(root, 'apps/api/dist/apps/api/src', name + '.js'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), inputs = {};
for (const name of ['ai.controller', 'ai.service', 'teaching-tool.controller', 'teaching-tool.service', 'teaching-tool-compatibility.service', 'teaching-tool-worker.service', 'teaching-tool-protocol', 'teaching-tool-record', 'xiaojiu-chat.service', 'xiaojiu-models.service', 'xiaojiu-text-transport', 'codex-command'])
  for (const file of ['apps/api/src/modules/ai/' + name + '.ts', 'apps/api/dist/apps/api/src/modules/ai/' + name + '.js']) inputs[file] = sha(fs.readFileSync(path.join(root, file)));
for (const file of ['scripts/qa/teaching-tools-live.cjs', 'packages/contracts/src/ai-teaching-tools.ts', 'packages/contracts/dist/index.js', 'packages/config/src/index.ts', 'packages/config/dist/index.js']) inputs[file] = sha(fs.readFileSync(path.join(root, file)));
const receipt = { version: 1, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), startedAt: new Date().toISOString(),
  passed: false, status: 'running', cliAttemptTimeoutMs: 60000, sourceAndCompiledSha256: inputs, cases: [],
  scope: 'Four anonymous teaching samples through actual HTTP, durable worker and configured Xiaojiu CLI: default DS and explicit GPT-6.1 Sol, both purposes. No fixtures, formal scoring, teacher-quality, visual, stability-rate or physical upstream model identity claim.' };
fs.mkdirSync(directory, { recursive: true });
function save() { fs.writeFileSync(path.join(directory, 'progress.json'), JSON.stringify(receipt, null, 2) + '\n'); }
let app, observed;
(async () => {
  save(); app = await NestFactory.create(load('app.module').AppModule, { logger: false });
  require('../../apps/api/dist/apps/api/src/common/http-body.js').configureJsonBody(app); app.setGlobalPrefix('api'); await app.init();
  const store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService), provider = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
  assert.equal(provider.enabled, true); const structured = provider.structured.bind(provider);
  provider.structured = (input, schema, check, custom) => structured(input, schema, check, custom, event => { observed.attempts.push(event); save(); });
  const worker = app.get(load('modules/ai/teaching-tool-worker.service').TeachingToolWorkerService);
  let actor;
  async function call(method, route, body, authenticated = true) {
    let query = request(app.getHttpServer())[method]('/api' + route); if (authenticated) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body); const response = await query;
    assert.equal(response.status, method === 'post' ? 201 : 200, 'Anonymous teaching HTTP status ' + response.status); return response.body.data;
  }
  actor = await call('post', '/auth/register', { principal: 'teaching-live-' + randomUUID() + '@local.test', credential: 'Synthetic-Teaching-' + randomUUID() }, false);
  await store.transaction(() => { store.find('users', { id: actor.user.id }).role = 'admin'; });
  const catalog = await call('get', '/ai/models'); assert.equal(catalog.defaultModel, 'deepseek-v4-flash');
  assert(catalog.models.some(model => model.id === 'gpt-6.1-sol'));
  const collections = ['diagnosticResponses', 'practiceAttempts', 'diagnosticPlans', 'diagnosticHypotheses', 'scoringRevisions'];
  await store.transaction(() => { for (const name of collections) store.append(name, { id: 'anonymous-teaching-sentinel-' + name, marker: 'Original formal records preserved', score: null }); });
  const formal = async () => store.requestContext(() => sha(Buffer.from(JSON.stringify(collections.map(name => store.select(name, {}))))));
  receipt.formalBeforeSha256 = await formal();
  for (const modelId of ['auto', 'gpt-6.1-sol']) for (const purpose of ['assessment_analysis', 'hint_draft']) {
    const row = { requestedModelId: modelId, purpose, status: 'running', attempts: [], startedAt: new Date().toISOString() }; receipt.cases.push(row); observed = row; save();
    const started = Date.now(), draft = { purpose, modelId, source: { kind: 'temporary', title: '匿名平均对象教研样本 ' + purpose,
      question: { subject: '数学', stem: '甲组三人总分18分，乙组两人总分14分。五人一起的平均分是多少？', referenceAnswer: '6.4分', referenceAnalysis: '总分18+14=32分，总人数3+2=5人，所以32÷5=6.4分。' } },
      ...(purpose === 'assessment_analysis' ? { answer: '18+14=32；32÷2=16分。因为有两个组，所以除以2。' } : { hintLevel: 1 }) };
    try {
      const preflight = await call('post', '/ai/teaching-tools/preflight', draft), command = { requestKey: randomUUID(), fingerprint: preflight.fingerprint, draft };
      assert.equal(preflight.modelId, modelId === 'auto' ? 'deepseek-v4-flash' : modelId);
      const created = await call('post', '/ai/teaching-tools/runs', command); row.runId = created.id; row.modelId = created.modelId;
      assert.equal(await worker.runNext(), true); const result = await call('get', '/ai/teaching-tools/runs/' + created.id);
      fs.writeFileSync(path.join(directory, row.modelId + '-' + purpose + '.json'), JSON.stringify({ preflight, command, result }, null, 2) + '\n', { flag: 'wx' });
      row.taskStatus = result.status; row.errorCode = result.task?.errorCode ?? null;
      assert.equal(result.status, 'completed'); assert.equal(result.modelId, preflight.modelId); assert.equal(result.reviewRequired, true); assert.equal(result.advisoryOnly, true);
      if (purpose === 'assessment_analysis') { assert.equal(result.result.analysis.judgement, 'incorrect'); assert(result.result.analysis.observations.length); assert(result.result.analysis.verificationSteps.length); }
      else { assert.equal(result.result.hint.suggestedLevel, 1); assert(!result.result.hint.hint.includes('6.4'), 'Anonymous hint disclosed the literal final answer'); }
      const recovered = await call('get', '/ai/teaching-tools/requests/' + command.requestKey); assert.equal(recovered.id, created.id);
      assert.deepEqual(recovered.result, result.result); assert.equal(await worker.runNext(), false); row.status = 'passed';
    } catch { row.status = 'failed'; }
    row.elapsedMs = Date.now() - started; row.completedAt = new Date().toISOString(); save(); console.log(JSON.stringify({ modelId: row.modelId, purpose, status: row.status, elapsedMs: row.elapsedMs, cliStarts: row.attempts.filter(item => item.status === 'started').length }));
  }
  receipt.formalAfterSha256 = await formal(); assert.equal(receipt.formalBeforeSha256, receipt.formalAfterSha256);
  for (const [file, digest] of Object.entries(inputs)) assert.equal(sha(fs.readFileSync(path.join(root, file))), digest, 'Fixed teaching input changed');
  receipt.status = 'complete'; receipt.passed = receipt.cases.every(row => row.status === 'passed'); receipt.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); save();
  if (!receipt.passed) process.exitCode = 1;
})().catch(() => { receipt.status = 'failed'; receipt.failureKind = 'runner-or-integrity-failure'; save(); console.error('Live teaching acceptance did not complete; original progress retained.'); process.exitCode = 1; })
  .finally(async () => { if (app) await app.close(); });
