/* Explicit live-provider acceptance on one anonymous original. Never reads a learner's records. */
require('reflect-metadata');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto'), { NestFactory } = require('@nestjs/core'), request = require('supertest');
const root = path.resolve(__dirname, '../..'), mode = process.argv[2];
if (!['generate', 'edit'].includes(mode)) throw Error('Use generate or edit');
const directory = mode === 'generate' ? path.join(root, 'artifacts', 'question-figure-live-' + randomUUID().slice(0, 8)) : path.resolve(process.argv[3] ?? '');
if (!directory.startsWith(path.join(root, 'artifacts', 'question-figure-live-')) || path.dirname(directory) !== path.join(root, 'artifacts')) throw Error('Expected owned anonymous image artifact directory');
fs.mkdirSync(directory, { recursive: true });
Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' });
const localPython = path.join(root, '../StudyAgent/data/runtime/imagegen/Scripts/python.exe');
if (!process.env.STUDY_IMAGE_PYTHON_COMMAND && fs.existsSync(localPython)) process.env.STUDY_IMAGE_PYTHON_COMMAND = localPython;
const load = name => require('../../apps/api/dist/apps/api/src/' + name + '.js');
const receipt = { at: new Date().toISOString(), mode, passed: false, modelId: 'gpt-image-2', contentReview: 'pending',
  scope: 'One anonymous answer-bound real generation or actual original-PNG edit through HTTP, durable worker and installed Xiaojiu image CLI. Not teacher or product-wide acceptance.' };
let app;
(async () => {
  app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
  const store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
  assert((await app.get(load('modules/ai/classroom-image.service').ClassroomImageService).figureCapabilities()).available, 'Installed Xiaojiu image environment unavailable');
  const imageWorker = app.get(load('modules/learning/whiteboard-question-visual-worker.service').WhiteboardQuestionVisualWorkerService);
  let actor, target, parent;
  async function call(method, route, body, authenticated = true) {
    let query = request(app.getHttpServer())[method]('/api' + route); if (authenticated) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body) query = query.send(body); const response = await query;
    assert.equal(response.status, method === 'post' ? 201 : 200, 'Anonymous live HTTP status ' + response.status); return response.body.data;
  }
  const base = '/learning/studio/whiteboard-question-visuals';
  if (mode === 'generate') {
    const principal = 'qfig-live-' + randomUUID() + '@local.test', credential = 'Synthetic-Qfig-' + randomUUID();
    actor = await call('post', '/auth/register', { principal, credential }, false);
    const id = 'question-figure-live-board-' + randomUUID(), at = new Date().toISOString();
    const scenes = [{ id: 'unit', kind: 'concept', title: '同一整体下比较分数', narration: '比较二分之一和三分之一，先确认整体相同。把同样大小的整体平均分成两份或三份，比较每一份的大小。',
      body: '整体相同是本次比较的前提。', bullets: ['先确认整体相同', '再比较每一份大小'], durationMs: 1000 }];
    const board = { id, kind: 'ai-topic-whiteboard', ownerUserId: actor.user.id, sourceDraftId: 'anonymous-live-fixture', studentId: null, subject: null,
      title: '匿名配图验证：比较分数', prompt: '独立匿名教学原件', scenes, fingerprint: createHash('sha256').update(JSON.stringify(scenes)).digest('hex'),
      width: 1280, height: 720, durationMs: 1000, createdAt: at, updatedAt: at,
      origin: { draftId: null, modelId: 'authored-anonymous-fixture', modelName: '匿名人工原件', review: null, teacherReviewStatus: 'pending', formalMeasurementEligible: false } };
    await store.transaction(() => store.append('studioTopicWhiteboards', board));
    const { whiteboardPresentation } = require('../../packages/contracts/dist'), unit = whiteboardPresentation(board).units[0];
    const questions = '/learning/studio/topic-whiteboards/' + board.id + '/questions';
    const context = await call('get', questions + '/context?fingerprint=' + board.fingerprint + '&unitId=' + encodeURIComponent(unit.id));
    const turn = await call('post', questions, { fingerprint: board.fingerprint, unitId: unit.id, contextVersion: context.contextVersion, requestKey: randomUUID(),
      modelId: 'deepseek-v4-flash', intent: 'question', message: '请解释为什么整体相同时二分之一大于三分之一，用提炼要点和对照表说明，不要询问或使用个人信息。',
      bookmark: { progress: 0, audioTime: null, mode: 'text', voice: '', speed: 1 } });
    const start = Date.now(); await app.get(load('modules/learning/whiteboard-question-worker.service').WhiteboardQuestionWorkerService).runNext();
    const answer = await call('get', questions + '/' + turn.id); receipt.answerDurationMs = Date.now() - start;
    assert.equal(answer.status, 'completed', 'Anonymous answer did not publish'); assert.equal(answer.reply.modelId, 'deepseek-v4-flash');
    const source = await call('get', base + '/source?boardKind=topic&boardId=' + board.id + '&turnId=' + turn.id); target = source.target;
    fs.writeFileSync(path.join(directory, 'private-auth.json'), JSON.stringify({ principal, credential, target }), { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'anonymous-answer.json'), JSON.stringify({ original: board, turn: answer }, null, 2) + '\n');
  } else {
    const secret = JSON.parse(fs.readFileSync(path.join(directory, 'private-auth.json'), 'utf8'));
    actor = await call('post', '/auth/login', { principal: secret.principal, credential: secret.credential }, false); target = secret.target;
    const first = JSON.parse(fs.readFileSync(path.join(directory, 'generate-receipt.json'), 'utf8'));
    assert.equal(first.passed, true); parent = await call('get', base + '/' + first.visualId); assert.equal(parent.originalSha256, first.originalSha256);
  }
  const input = { target, purpose: 'comparison', requirements: '在纯白背景上并排展示两个同样大小的长方形，左边平均分成两份并涂其中一份，右边平均分成三份并涂其中一份。中文标签必须包含“整体相同”“二分之一”“三分之一”，两块整体面积严格相同。简洁教学图，不出现个人信息、水印、机构标识或装饰。',
    ...(parent ? { operation: 'edit', parentVisualId: parent.id, changes: '只将右侧三分之一涂色改为柔和橙色，使两种份数更易区分。保留两块同样大小的整体、原始分割、全部中文标签和其余颜色。' } : { operation: 'generate' }) };
  const preflight = await call('post', base + '/preflight', input); assert(preflight.available, 'Installed Xiaojiu image environment unavailable');
  receipt.capabilities = preflight.capabilities; fs.writeFileSync(path.join(directory, mode + '-prompt.txt'), preflight.prompt);
  const command = { ...input, requestKey: randomUUID(), preflightFingerprint: preflight.fingerprint };
  const prepared = await call('post', parent ? base + '/' + parent.id + '/edit' : base, command), start = Date.now();
  assert(await imageWorker.runNext()); receipt.durationMs = Date.now() - start;
  const result = await call('get', base + '/' + prepared.id); receipt.status = result.status; receipt.errorCode = result.task?.errorCode ?? null;
  assert.equal(result.status, 'ready', 'Real image did not publish');
  for (const part of ['image', 'original']) {
    const response = await request(app.getHttpServer()).get('/api' + base + '/' + result.id + '/' + part).set('Authorization', 'Bearer ' + actor.token);
    assert.equal(response.status, 200); assert(response.headers['content-type'].startsWith('image/png')); assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(createHash('sha256').update(response.body).digest('hex'), part === 'image' ? result.sha256 : result.originalSha256);
  }
  await store.requestContext(() => {
    const row = store.find('whiteboardQuestionVisuals', { id: result.id }), { questionVisualFile } = load('modules/learning/whiteboard-question-visual-storage');
    receipt.artifacts = Object.fromEntries(['image', 'original', 'prompt'].map(part => [part, path.relative(root, questionVisualFile(row, part).path).replaceAll('\\', '/')]));
    if (parent) { assert.equal(row.parentOriginal.sha256, parent.originalSha256); receipt.parentOriginalSha256 = row.parentOriginal.sha256; }
  });
  Object.assign(receipt, { passed: true, visualId: result.id, sha256: result.sha256, originalSha256: result.originalSha256, width: result.width, height: result.height });
  fs.writeFileSync(path.join(directory, mode + '-view.json'), JSON.stringify(result, null, 2) + '\n');
})().catch(() => { receipt.errorCode ??= 'anonymous_question_figure_live_check_failed'; process.exitCode = 1; }).finally(async () => {
  await app?.close(); fs.writeFileSync(path.join(directory, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ directory: path.relative(root, directory).replaceAll('\\', '/'), ...receipt }));
});
