// Explicit real CLI acceptance. Anonymous owned SQLite only; providers are never mocked.
require('reflect-metadata');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto'), { execFileSync } = require('node:child_process');
const { NestFactory } = require('@nestjs/core'), request = require('supertest');
const root = path.resolve(__dirname, '../..'), arg = process.argv.indexOf('--output');
const primarySourceOnly = process.argv.includes('--primary-source-only');
if (arg < 0 || !process.argv[arg + 1]) throw Error('Explicit fresh --output required');
const directory = path.resolve(root, process.argv[arg + 1]);
if (!directory.startsWith(path.join(root, 'data/qa') + path.sep) || fs.existsSync(directory)) throw Error('Fresh owned QA directory required');
const relevant = ['apps/api/src/modules/ai', 'packages/contracts/src', 'scripts/qa/course-teaching-live.cjs'];
if (execFileSync('git', ['status', '--porcelain', '--', ...relevant], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()) throw Error('Commit fixed teaching sources and runner before real samples');
Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: path.join(directory, 'private-runtime'),
  STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false', XIAOJIU_CHAT_ENABLED: 'true', XIAOJIU_CHAT_TIMEOUT_MS: '60000', OPENAI_API_KEY: '', MINIMAX_API_KEY: '' });
const load = name => require(path.join(root, 'apps/api/dist/apps/api/src', name + '.js'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), inputs = {};
function capture(file) { inputs[file] = sha(fs.readFileSync(path.join(root, file))); }
function captureTree(dir) { for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
  const file = dir + '/' + entry.name; if (entry.isDirectory()) captureTree(file); else if (entry.isFile()) capture(file);
} }
for (const dir of ['apps/api/src/modules/ai', 'apps/api/dist', 'packages/contracts/src', 'packages/contracts/dist', 'packages/config/src', 'packages/config/dist']) captureTree(dir);
capture('scripts/qa/course-teaching-live.cjs');
const receipt = { version: 1, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
  startedAt: new Date().toISOString(), passed: false, status: 'running', sourceAndCompiledSha256: inputs, cases: [],
  scope: 'Three anonymous adult lecture, primary unit and material lesson samples through real HTTP, durable worker and default Xiaojiu CLI. Synthetic course records only. No model-output substitution. Does not establish full-model, teacher, child-outcome, audio or pixel acceptance.' };
fs.mkdirSync(directory, { recursive: true });
const save = () => fs.writeFileSync(path.join(directory, 'progress.json'), JSON.stringify(receipt, null, 2) + '\n');
let app, observed;

async function main() {
  save(); app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
  const store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
  const provider = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
  const worker = app.get(load('modules/ai/assistant-turn-worker.service').AssistantTurnWorkerService);
  assert.equal(provider.enabled, true);
  const structured = provider.structured.bind(provider);
  provider.structured = (input, schema, check, custom) => {
    const context = JSON.parse(input.context), teaching = context.course?.teaching ?? context.lecture?.teaching;
    observed.sent = { system: input.system, message: input.message, context, contextCharacters: input.context.length, courseSources: input.courseSources };
    assert.equal(input.courseSources, true); assert(teaching); assert.deepEqual(teaching, observed.expectedTeaching);
    assert.equal(input.context.length, observed.selectedCharacters);
    assert(context.report === null && context.plan === null && context.scope === null && context.currentQuestion === null);
    assert.deepEqual(context.evidenceIds, []); assert(!/PRIVATE_|studentId|ownerUserId|withheldAnswer|scoring/.test(input.context));
    save();
    return structured(input, schema, value => { (observed.originalStructuredOutputs ??= []).push(JSON.parse(JSON.stringify(value))); save(); return check(value); }, custom,
      event => { observed.attempts.push(event); save(); });
  };
  let actor;
  async function call(method, route, body) {
    let q = request(app.getHttpServer())[method]('/api' + route); if (actor) q = q.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined) q = q.send(body);
    const response = await q; assert.equal(response.status, method === 'post' ? 201 : 200, 'Anonymous course HTTP ' + route + ': ' + response.status); return response.body.data;
  }
  actor = await call('post', '/auth/register', { principal: 'course-live-' + randomUUID() + '@local.test', credential: 'Synthetic-Course-' + randomUUID() });
  const student = (await call('post', '/students', { nickname: '匿名课程学习者', grade: 3, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
  const now = new Date().toISOString(), primaryId = 'primary-live-' + randomUUID(), materialId = 'material-live-' + randomUUID();
  const teaching = { reviewStatus: 'approved', explanation: primarySourceOnly ? '比较同一条纸带两部分的长度时，可以先把这条纸带分成大小相等的份，再比较各部分占了几份；每份大小相同，份数多的部分就更长。比较不同纸带时，不能只比较所占份数，还应核对每份的实际长度。' : '比较两个量时，先检查它们是否来自同一个整体，再核对单位。',
    example: { prompt: '比较同一条纸带中两部分的长度。', steps: ['确认同一个整体', '将每份的大小统一'], conclusion: '相同单位下才能直接比较数量。' },
    commonErrors: [{ code: 'unit', observation: '只看数字大小，没有先检查单位。', alternativeExplanations: ['可能没有辨清同一整体。'], verification: '换一条新的纸带，再解释比较条件。' }],
    verification: { understanding: '说明为什么比较前要检查整体和单位。', procedure: '解释一次统一单位的完整步骤。', transfer: '换一个生活情境说明关系。', retention: '间隔一段时间，再用独立新题核对。' } };
  const quote = '比较数量之前，先检查它们是否来自同一个整体，并统一单位。';
  await store.transaction(() => {
    store.append('studioCourses', { id: primaryId, studentId: student.id, subject: 'math', grade: 3, term: 'upper', title: '匿名数量比较课程', description: '匿名验证教学',
      objective: '理解单位一致性', status: 'active', source: 'studyagent_curriculum', scopeVersion: 1, textbookVersion: 'synthetic-v1', focusAtomIds: ['unit'],
      units: [{ id: 'unit-1', title: '同一整体', objective: '比较前核对整体与单位', lessons: [{ id: 'learn:unit', atomId: 'unit', title: '统一单位', objective: '解释比较条件',
        kind: 'learn', state: 'not_started', href: '/PRIVATE_PRACTICE_ROUTE', teaching: { atomVersion: 1, teaching } }] }], materials: [], fingerprint: 'PRIVATE_AUTHORING_HASH', createdAt: now, updatedAt: now });
    store.append('sourceCourses', { id: materialId, ownerUserId: actor.user.id, studentId: null, subject: null, audience: 'adult', targetGoals: [],
      input: { title: 'PRIVATE_INPUT', goal: 'PRIVATE_INPUT', language: 'zh-CN', minutesPerSession: 15, modelId: 'fixture', targetAtomIds: [] },
      sources: [{ key: 'page-one', materialId: 'PRIVATE_UPLOAD', page: 3, title: '匿名比较资料', kind: 'text', text: quote + 'PRIVATE_FULL_TEXT', blocks: [], sha256: 'a'.repeat(64), version: 'source-v1', fingerprint: 'PRIVATE_SOURCE_HASH', structureReviewRequired: false }],
      revision: 1, status: 'active', taskId: null, result: { title: '数量的比较', overview: '理解比较条件', lessons: [{ title: '统一单位', objective: '说明比较条件',
        introduction: '先核对所比较的量来自哪个整体。', concept: quote, notes: ['同一整体', '相同单位'],
        example: { scenario: '比较同一条纸带的两个部分。', steps: ['确认整体不变', '再统一每份的大小'], board: ['核对整体', '统一单位'], conclusion: '单位相同后再比较数量。' },
        misconception: { claim: '只要数字更大，数量就更多。', correction: '应先检查单位是否一致。', board: ['不能只看数字', '解释比较条件'] },
        transfer: '换一条新的纸带，解释比较条件。', summary: '比较数量前先核对整体与单位。', takeaways: ['同一整体', '相同单位'], citations: [{ sourceKey: 'page-one', quote }],
        questions: [0, 1].map(answer => ({ prompt: 'PRIVATE_QUESTION', options: ['A', 'B', 'C', 'D'], answer, explanation: 'PRIVATE_SCORING', hints: ['PRIVATE_HINT', 'PRIVATE_HINT'] })) }] },
      originalResult: null, edits: [], fingerprint: 'PRIVATE_GENERATION_HASH', modelName: 'Synthetic authored material', confirmedAt: now, createdAt: now, updatedAt: now, requests: [],
      versioning: { familyId: materialId, parentCourseId: null, number: 1, state: 'published', events: [] } });
  });
  const collections = ['classroomSessions', 'diagnosticResponses', 'practiceAttempts', 'diagnosticPlans', 'diagnosticHypotheses', 'scoringRevisions', 'masteryEstimates', 'studioCourses', 'sourceCourses'];
  const formal = () => store.requestContext(() => sha(Buffer.from(JSON.stringify(collections.map(n => store.select(n, {}))))));
  receipt.formalBeforeSha256 = await formal();
  for (const mode of primarySourceOnly ? ['primary_unit'] : ['lecture', 'primary_unit', 'material_lesson']) {
    const row = { mode, requestedModelId: 'auto', status: 'running', attempts: [], startedAt: new Date().toISOString() }; receipt.cases.push(row); observed = row; save(); const start = Date.now();
    try {
      assert.equal((await call('get', '/ai/models')).defaultModel, 'deepseek-v4-flash');
      let descriptor, command;
      if (mode === 'lecture') {
        const course = load('modules/learning/classroom-curriculum').classroomCourse();
        descriptor = await call('get', '/ai/assistant/lecture-context?' + new URLSearchParams({ courseId: course.id, lectureId: course.units[0].lectures[0].id }));
        command = { userRole: 'parent', studentId: null, subject: null, pageContext: 'classroom', contextRefType: 'classroom_lecture', contextRefId: descriptor.referenceId, contextItemId: descriptor.lectureId };
      } else {
        descriptor = await call('get', '/ai/assistant/course-context?' + new URLSearchParams({ kind: mode, courseId: mode === 'primary_unit' ? primaryId : materialId, itemId: mode === 'primary_unit' ? 'unit-1' : 'source:' + materialId + ':1' }));
        command = { userRole: 'parent', studentId: descriptor.studentId, subject: descriptor.subject, pageContext: 'course', contextRefType: mode, contextRefId: descriptor.referenceId, contextItemId: descriptor.itemId, contextSelection: descriptor.selection };
      }
      const session = await call('post', '/ai/assistant/sessions', command), base = '/ai/assistant/sessions/' + session.id;
      const frozen = await store.requestContext(() => store.find('assistantSessions', { id: session.id }));
      row.expectedTeaching = JSON.parse(JSON.stringify((frozen.lectureSnapshot ?? frozen.courseSnapshot).teaching));
      row.selectedCharacters = mode === 'lecture' ? JSON.stringify({ lecture: frozen.lectureSnapshot, scope: null, report: null, plan: null,
        memory: null, definitionNotice: null, currentQuestion: null, evidenceIds: [] }).length : descriptor.selectedCharacters;
      const message = primarySourceOnly ? '请逐句解释本课“统一单位”这一段教学：' + teaching.explanation +
        ' 请说明比较同一条纸带和比较不同纸带时，需要核对什么。解释依据的是本次教学来源' + row.expectedTeaching.sources[0].key +
        '，请在输出JSON的sourceKeys数组中填写这个实际来源key，并给一个符合原文条件的匿名例子。不要给学习者作能力评定。' :
        mode === 'lecture' ? '请依据本讲正文解释个人困扰与公共议题的区别，给一个匿名例子和反例。请通过sourceKeys引用实际支持解释的本讲来源，不评定学习者能力。' :
        '请依据所选教学解释为什么比较数量前要核对整体与单位，给一个匿名例子和反例。请通过sourceKeys引用实际支持解释的本课来源，不评定学习者能力。';
      const context = await call('get', base + '/context'), turnCommand = { requestKey: randomUUID(), message, modelId: 'auto', contextVersion: context.contextVersion };
      const created = await call('post', base + '/turns', turnCommand); row.turnId = created.id; row.modelId = created.modelId; assert.equal(created.modelId, 'deepseek-v4-flash');
      assert.equal(await worker.runNext(), true);
      const result = await call('get', base + '/turns/' + created.id), messages = await call('get', base + '/messages/page'); row.taskStatus = result.status; row.errorCode = result.task?.errorCode ?? null;
      fs.writeFileSync(path.join(directory, mode + '.json'), JSON.stringify({ descriptor, session, context, command: turnCommand, result, messages }, null, 2) + '\n', { flag: 'wx' });
      assert.equal(result.status, 'completed'); assert.equal(messages.messages.length, 2);
      const original = messages.messages.find(m => m.sender === 'user'), answer = messages.messages.find(m => m.sender === 'assistant');
      assert.equal(original.content, message); assert.equal(answer.inReplyTo, original.id); assert.equal(answer.id, result.assistantMessageId);
      assert.equal(answer.source, 'xiaojiu'); assert.equal(answer.modelId, 'deepseek-v4-flash'); assert(answer.content.trim()); assert.deepEqual(answer.evidenceIds, []);
      assert(answer.sourceReferences?.length > 0, 'Model did not cite selected teaching');
      row.sourcePreviews = [];
      for (const reference of answer.sourceReferences) {
        assert.equal(reference.courseId, row.expectedTeaching.courseId); assert.equal(reference.contextFingerprint, descriptor.fingerprint);
        assert(row.expectedTeaching.sources.some(s => s.key === reference.key));
        const preview = await call('get', base + '/sources/' + encodeURIComponent(reference.key)); assert.deepEqual(preview.reference, reference); assert.equal(preview.current, true);
        assert(preview.sections.length > 0); row.sourcePreviews.push(preview);
      }
      const starts = row.attempts.filter(e => e.status === 'started').length;
      const replayed = await call('post', base + '/turns', turnCommand); assert.equal(replayed.assistantMessageId, result.assistantMessageId); assert.equal(await worker.runNext(), false);
      assert.equal(row.attempts.filter(e => e.status === 'started').length, starts); row.originalRequestReplayedWithoutNewCli = true; row.status = 'passed';
    } catch (error) { row.status = 'failed'; row.failure = String(error.message).slice(0, 1500); }
    row.elapsedMs = Date.now() - start; row.completedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ mode, status: row.status, taskStatus: row.taskStatus, errorCode: row.errorCode, modelId: row.modelId, elapsedMs: row.elapsedMs, cliStarts: row.attempts.filter(e => e.status === 'started').length }));
  }
  receipt.formalAfterSha256 = await formal(); assert.equal(receipt.formalBeforeSha256, receipt.formalAfterSha256);
  for (const [file, digest] of Object.entries(inputs)) assert.equal(sha(fs.readFileSync(path.join(root, file))), digest, 'Fixed teaching input changed: ' + file);
  receipt.status = 'complete'; receipt.passed = receipt.cases.every(row => row.status === 'passed'); receipt.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); save(); if (!receipt.passed) process.exitCode = 1;
}
main().catch(error => { receipt.status = 'failed'; receipt.failureKind = 'runner-or-integrity-failure'; receipt.failure = String(error.message).slice(0, 1500); save(); console.error('Real teaching samples incomplete; original progress retained.'); process.exitCode = 1; }).finally(async () => { await app?.close(); });
