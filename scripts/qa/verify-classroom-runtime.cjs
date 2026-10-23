// Real provider acceptance against an owned, temporary classroom database.
// Secrets, authorization headers and full model replies are never included in the receipt.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-classroom-runtime-'));
Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
  STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true' });
const target = path.resolve(process.argv[2] || path.join(root, 'data/qa/classroom-runtime.json'));
const audioTarget = path.join(path.dirname(target), path.basename(target) === 'classroom-runtime.json'
  ? 'classroom-narration-sample.wav' : path.basename(target, '.json') + '-narration.wav');
const evidence = { at: new Date().toISOString(), scope: 'Owned synthetic account, temporary SQLite database, real Xiaojiu model and configured speech provider; not original HyperKnow audio or human listening comparison',
  checks: {}, passed: false };
let app;
async function main() {
  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(path.join(root, 'apps/api/dist/apps/api/src/app.module.js'));
  app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()) + '/api'; let token;
  async function call(method, route, body) {
    const response = await fetch(base + route, { method, signal: AbortSignal.timeout(220000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error('HTTP ' + response.status + ': ' + (payload.error?.message || 'request failed'));
    return payload.data;
  }
  const registration = await call('POST', '/auth/register', { principal: 'classroom-runtime-' + randomUUID() + '@local.test', credential: randomUUID() }); token = registration.token;
  const session = await call('POST', '/learning/classroom/sessions', { lessonId: 'soc-1-1-1' });
  const { InMemoryStoreService } = require(path.join(root, 'apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js'));
  const store = app.get(InMemoryStoreService);
  const counts = () => store.requestContext(() => ['diagnosticResponses', 'diagnosticPlans', 'scoringRevisions'].map(name => store.inspect(name).length));
  const baselineCounts = await counts();
  evidence.checks.realSessionOpened = session.lesson.steps.length === 8;
  const revealed = await call('PATCH', '/learning/classroom/sessions/' + session.id, { expectedRevision: 0, cursor: 1, revealed: 2 });
  const speechResponse = await fetch(base + '/learning/classroom/sessions/' + session.id + '/narration/' + encodeURIComponent(session.lesson.steps[0].id), {
    method: 'POST', signal: AbortSignal.timeout(90000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ sentenceIndex: 0 }) });
  if (!speechResponse.ok) throw new Error('Speech HTTP ' + speechResponse.status);
  const audio = Buffer.from(await speechResponse.arrayBuffer());
  if (!speechResponse.headers.get('content-type')?.startsWith('audio/') || audio.length < 1000) throw new Error('Invalid speech payload');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(audioTarget, audio);
  const probe = spawnSync(process.env.STUDY_FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', audioTarget], { encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0) throw new Error('ffprobe could not decode generated narration');
  evidence.checks.speech = { provider: revealed.speech.provider, sentenceIndex: 0, contentType: speechResponse.headers.get('content-type'), bytes: audio.length,
    sha256: createHash('sha256').update(audio).digest('hex'), decoded: JSON.parse(probe.stdout), artifact: path.basename(audioTarget) };
  const reply = await call('POST', '/learning/classroom/sessions/' + session.id + '/messages', {
    message: '我容易把社会结构和个人选择当成非此即彼。请用一个匿名例子提示我如何同时分析二者，不替我回答练习。',
    modelId: 'deepseek-v4-flash', requestKey: randomUUID() });
  const last = reply.messages.at(-1);
  evidence.checks.realModelChat = { modelName: last?.modelName, replyCharacters: last?.content?.length,
    pairedMessages: reply.messages.length, persistedCursor: reply.cursor, persistedRevealed: reply.revealed,
    board: { titleCharacters: last?.board?.title?.length, points: last?.board?.points?.length,
      page: last?.board?.page, diagram: last?.board?.diagram?.kind ?? null },
    answerKeysHidden: !('answerKeys' in reply), diagnosticEvidenceUnchanged: JSON.stringify(await counts()) === JSON.stringify(baselineCounts) };
  if (last?.role !== 'assistant' || !last.modelName || last.content.length < 20 || reply.cursor !== 1) throw new Error('Model response or lesson resume was invalid');
  if (!last.board?.title || !last.board.points?.length || last.board.page !== 0) throw new Error('Structured teaching board was missing');
  const reloaded = await call('GET', '/learning/classroom/sessions/' + session.id);
  evidence.checks.chatReloaded = reloaded.messages.at(-1)?.id === last.id;
  evidence.checks.boardReloaded = JSON.stringify(reloaded.messages.at(-1)?.board) === JSON.stringify(last.board);
  evidence.passed = evidence.checks.chatReloaded && evidence.checks.boardReloaded;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await app?.close(); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(evidence, null, 2) + '\n');
  fs.rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify(evidence, null, 2));
});
