// Uses real authored questions in an owned temporary store; never invents production families to pass coverage.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-verification-runtime-'));
const output = path.resolve(process.argv[2] ?? 'data/qa/verification-groups-runtime.json');
const driver = process.argv[3] ?? 'sqlite';
const verifyContentUpgrade = process.argv[4] === 'content-upgrade';
const pointFilter = process.argv[5];
if (!['sqlite', 'postgres'].includes(driver)) throw new Error('Expected sqlite or postgres');
Object.assign(process.env, { NODE_ENV: 'production', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory, STUDY_WORKER_ENABLED: 'false' });
delete process.env.OPENAI_API_KEY;
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const { buildAllAuthoredProbeFamilies } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/authored-probes.js');
const { buildFoundationCurriculum, foundationQuestionId } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/foundation-curriculum.js');
if (pointFilter && (!verifyContentUpgrade || !buildAllAuthoredProbeFamilies().some(family => family.atomId === pointFilter))) throw new Error('The optional smoke-test filter must name an existing authored point in content-upgrade mode');
const { gradeResponse } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/scoring.js');
const { FAMILY_IDENTITY_VERSION } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/family-identity.js');
const { verifyFamilyIdentityUpgrade } = require('./verification-family-identity.cjs');
const { answerInputConfiguration } = require('@study-agent/contracts');
const files = ['packages/contracts/src/diagnostics.ts', 'apps/api/src/modules/diagnostics/assessment-blueprint.ts',
  'apps/api/src/common/auth.guard.ts',
  'apps/api/src/modules/diagnostics/family-identity.ts', 'resources/curriculum/authored-family-identities-v1.json',
  'apps/api/src/modules/diagnostics/measurement.ts', 'apps/api/src/modules/diagnostics/adaptive-routing.ts',
  'apps/api/src/modules/diagnostics/guidance.service.ts', 'apps/api/src/modules/diagnostics/curriculum.service.ts',
  'apps/api/src/modules/diagnostics/diagnostics.controller.ts', 'apps/api/src/infrastructure/in-memory-store.service.ts',
  'apps/api/src/modules/learning/learning.service.ts', 'apps/api/src/modules/learning/notebook.service.ts',
  'scripts/qa/verification-family-identity.cjs', 'apps/web/components/report-analysis-update.tsx', 'apps/web/components/guidance-manager.tsx',
  'apps/api/src/modules/diagnostics/verification-blueprint.ts', 'apps/api/src/modules/diagnostics/diagnosis.ts',
  'apps/api/src/modules/diagnostics/diagnostics.service.ts', 'apps/web/app/student/assessment/studio.tsx',
  'apps/web/components/assessment-blueprint.tsx', 'apps/web/components/verification-observations.tsx', 'apps/web/components/verification-observations.css',
  'apps/api/src/modules/diagnostics/authored-probes.ts', 'apps/api/src/modules/diagnostics/authored-english-foundation-probes.ts',
  'apps/api/src/modules/diagnostics/authored-english-lexical-probes.ts', 'resources/curriculum/authored-task-baseline-6830-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade1-probes.ts', 'resources/curriculum/authored-task-baseline-6974-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-oral-grade1-probes.ts', 'resources/curriculum/authored-task-baseline-7550-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade2-probes.ts', 'resources/curriculum/authored-task-baseline-7598-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade3-probes.ts', 'resources/curriculum/authored-task-baseline-8222-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade4-probes.ts', 'resources/curriculum/authored-task-baseline-8846-v1.json',
  'apps/api/src/modules/diagnostics/authored-chinese-grade5-probes.ts', 'apps/api/src/modules/diagnostics/authored-chinese-grade6-probes.ts',
  'resources/curriculum/authored-task-baseline-9470-v1.json',
  'apps/api/src/modules/diagnostics/authored-english-grade1-grade2-probes.ts',
  'apps/api/src/modules/diagnostics/authored-english-grade1-grade2-probes.test.ts',
  'apps/api/src/modules/diagnostics/authored-english-grade3-grade6-probes.ts',
  'apps/api/src/modules/diagnostics/authored-english-grade3-grade6-probes.test.ts',
  'resources/curriculum/authored-task-baseline-10718-v1.json',
  'resources/curriculum/authored-task-baseline-14174-v1.json',
  'apps/api/src/modules/diagnostics/authored-math-grade5-grade6-probes.ts',
  'apps/api/src/modules/diagnostics/authored-math-grade5-grade6-probes.test.ts',
  'resources/curriculum/authored-task-baseline-15758-v1.json',
  'packages/contracts/src/gesp.ts', 'apps/api/src/modules/gesp/gesp.service.ts', 'apps/api/src/modules/gesp/gesp.controller.ts',
  'apps/api/src/modules/gesp/isolated-runner.test.ts', 'apps/api/src/modules/gesp/gesp-student.integration.test.ts',
  'scripts/gesp/run_submission.cjs', 'scripts/qa/verify-gesp-runner.cjs', 'resources/gesp/student-curriculum-v1.json',
  'apps/web/app/parent/gesp/page.tsx', 'apps/web/app/student/gesp/page.tsx',
  'resources/curriculum/authored-task-baseline-6686-v1.json',
  'apps/api/src/modules/diagnostics/authored-math-probes.ts', 'apps/api/src/modules/diagnostics/foundation-curriculum.ts',
  'apps/api/src/modules/diagnostics/original-core-curriculum.ts', 'apps/api/src/modules/diagnostics/structured-curriculum.ts',
  'apps/api/src/modules/diagnostics/scoring.ts',
  'apps/api/src/modules/diagnostics/authored-arithmetic-probes.ts',
  'apps/api/src/modules/diagnostics/authored-number-probes.ts',
  'apps/api/src/modules/diagnostics/authored-spatial-probes.ts',
  'apps/api/src/modules/diagnostics/authored-second-grade-probes.ts',
  'apps/api/src/modules/diagnostics/authored-data-probes.ts',
  'apps/api/src/modules/diagnostics/authored-third-grade-probes.ts',
  'apps/api/src/modules/diagnostics/authored-unit-probes.ts',
  'apps/api/src/modules/diagnostics/authored-fourth-grade-number-probes.ts',
  'apps/api/src/modules/diagnostics/authored-remainder-decimal-probes.ts',
  'apps/api/src/modules/diagnostics/authored-fourth-grade-geometry-statistics-probes.ts',
  'apps/api/src/modules/diagnostics/authored-average-atomic.ts', 'resources/curriculum/authored-average-atomic-relations-2026-10-20-v1.json',
  'apps/api/src/modules/diagnostics/authored-factor-multiple-probes.ts', 'resources/curriculum/authored-task-baseline-6446-v1.json',
  'resources/curriculum/authored-task-baseline-6398-v1.json',
  'resources/curriculum/fourth-grade-geometry-statistics-v1.json', 'scripts/content/build-fourth-grade-geometry-statistics.cjs',
  ...fs.readdirSync(path.join(root, 'apps/web/public/question-assets/fourth-grade-geometry-statistics-v1')).sort().map(name => 'apps/web/public/question-assets/fourth-grade-geometry-statistics-v1/' + name),
  'apps/api/src/modules/diagnostics/authored-geometry-probes.ts', 'resources/curriculum/geometry-probes-v1.json',
  'scripts/content/build-geometry-probes.cjs',
  ...fs.readdirSync(path.join(root, 'apps/web/public/question-assets/geometry-probes-v1')).sort().map(name => 'apps/web/public/question-assets/geometry-probes-v1/' + name),
  'apps/api/src/modules/diagnostics/authored-atomic-curriculum.ts', 'apps/api/src/modules/diagnostics/component-observations.ts',
  'apps/api/src/modules/diagnostics/authored-relation-release.ts',
  'resources/curriculum/authored-relations-2026-10-20-v1.json',
  'resources/curriculum/authored-atomic-relations-2026-10-20-v1.json',
  'apps/api/src/modules/diagnostics/foundation-seed.service.ts', 'apps/api/src/modules/question-workspace/question-workspace.service.ts', 'apps/api/src/modules/reviews/reviews.service.ts',
  'apps/api/src/modules/student-media/student-media.service.ts', 'apps/api/src/modules/student-media/media-normalization.ts',
  'scripts/qa/verify-verification-groups.cjs'];
const evidence = { at: new Date().toISOString(), driver, passed: false,
  familyIdentityVersion: FAMILY_IDENTITY_VERSION,
  pointFilter: pointFilter ?? null,
  scope: 'Synthetic family accounts, real authored questions, formal administrator bootstrap, production-mode HTTP, concurrent requests and restarts. Selected original points cover basic/transfer contrasts in their actual subject and grade; not complete curriculum, oral/listening, browser or standardized measurement acceptance.',
  sourceSha256: Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) };
let app, store, base, adminPool, qaDatabase;
const tokens = {};
async function start() {
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  store = app.get(InMemoryStoreService); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
}
async function stop() { await app?.close(); app = undefined; }
async function raw(method, route, body, actor = 'parent') {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json',
    ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(body !== undefined ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) } : {}) });
  const result = await response.json(); return { status: response.status, data: result.data, error: result.error?.message };
}
async function call(method, route, body, actor = 'parent', expected = method === 'POST' ? 201 : 200) {
  const result = await raw(method, route, body, actor);
  if (result.status !== expected && /\/diagnostics\/sessions\/[^/]+\/responses$/.test(route)) {
    const sessionId = route.split('/')[3];
    // Only this script's owned synthetic session is inspected; no real family's answers or credentials enter QA output.
    evidence.responseFailure = await store.transaction(() => {
      const session = store.find('diagnosticSessions', { id: sessionId }), mapping = session?.itemSnapshots.find(row => row.id === body.itemId);
      const question = session?.questionSnapshots.find(row => row.id === mapping?.questionId);
      return structuredClone({ sessionId, itemId: body.itemId, atomId: mapping?.atomId, family: mapping?.family,
        questionId: question?.id, stem: question?.stem, mode: question?.answerSchema.mode, options: question?.answerSchema.options,
        submitted: body.answer, expected: question?.answer, status: result.status, error: result.error });
    });
  }
  assert.equal(result.status, expected, `${method} ${route}: ${result.error ?? ''}`); return result.data;
}
async function snapshotAnswer(id, questionId) {
  return store.transaction(() => store.find('diagnosticSessions', { id }).questionSnapshots.find(row => row.id === questionId).answer);
}
function legalWrongAnswer(schema, expected) {
  const mode = schema.mode, config = answerInputConfiguration(schema);
  const wrongValue = value => Number.isFinite(Number(value)) ? String(Number(value) + 1) : 'QA未达标';
  let answer;
  if (mode === 'boolean') answer = gradeResponse(schema, expected, true).score === 1 ? false : true;
  else if (mode === 'single_choice') answer = schema.options.find(option => option.value !== expected)?.value;
  else if (mode === 'hotspot') answer = config.targets.find(target => target.id !== expected)?.id;
  else if (mode === 'multiple_choice') {
    const outside = schema.options.find(option => !expected.includes(option.value));
    answer = [outside?.value ?? expected[0]];
  } else if (mode === 'multi_blank') answer = expected.map(entry => ({ ...entry, value: wrongValue(entry.value) }));
  else if (mode === 'sorting') answer = [...expected].reverse();
  else if (mode === 'matching') answer = { pairs: expected.pairs.map(pair => ({ ...pair,
    right: config.right[(config.right.findIndex(option => option.id === pair.right) + 1) % config.right.length].id })) };
  else if (mode === 'table_fill') answer = { cells: Object.fromEntries(Object.entries(expected.cells).map(([key, value]) => [key, wrongValue(value)])) };
  else if (mode === 'drag_drop') answer = { placements: Object.fromEntries(Object.entries(expected.placements).map(([key, value]) =>
    [key, config.groups.find(group => group.id !== value)?.id])) };
  else if (mode === 'text_blank') answer = 'QA未达标';
  else if (mode === 'formula_blank') answer = '-999999';
  else if (mode === 'numeric_blank') answer = -999999;
  else throw new Error(`This deterministic QA fixture requires a dedicated manual-review journey for ${mode}`);
  assert.equal(gradeResponse(schema, expected, answer).score, 0, `QA wrong response must be legal and actually score zero: ${schema.questionId} / ${mode}`);
  return answer;
}
async function wrongAnswer(id, item) {
  const snapshot = await store.transaction(() => structuredClone(store.find('diagnosticSessions', { id }).questionSnapshots.find(row => row.id === item.questionId)));
  return legalWrongAnswer(snapshot.answerSchema, snapshot.answer);
}
const manualModes = new Set(['short_answer', 'stepwise', 'geometry_draw', 'image_upload', 'audio_record']);
async function pointAnswer(id, item, actor, correct) {
  const snapshot = await store.transaction(() => structuredClone(store.find('diagnosticSessions', { id }).questionSnapshots.find(row => row.id === item.questionId)));
  const schema = snapshot.answerSchema;
  if (!manualModes.has(schema.mode)) return { answer: correct ? snapshot.answer : legalWrongAnswer(schema, snapshot.answer), manual: false };
  const description = correct ? (typeof snapshot.answer === 'object' ? snapshot.answer.description ?? String(snapshot.answer) : String(snapshot.answer)) : '合成未达标作答：没有说明本题要求的行列覆盖关系。';
  let response;
  if (schema.mode === 'short_answer') response = { value: description };
  else if (schema.mode === 'stepwise') response = { steps: correct ? snapshot.answer.map(String) : [description] };
  else if (schema.mode === 'geometry_draw') response = { strokes: [], description };
  else if (schema.mode === 'audio_record') {
    const ffmpeg = process.env.STUDY_FFMPEG ?? 'ffmpeg';
    const encoded = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${correct ? 520 : 280}:duration=${correct ? 0.8 : 0.5}`,
      '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'], { windowsHide: true, timeout: 10000, maxBuffer: 12 * 1024 * 1024 });
    assert.equal(encoded.status, 0, 'Real WAV fixture generation'); assert(Buffer.isBuffer(encoded.stdout) && encoded.stdout.length > 1000);
    const upload = await call('POST', '/learning/media', { kind: 'diagnostic', sessionId: id, itemId: item.id,
      name: '合成口头作答.wav', mediaType: 'audio/wav', size: encoded.stdout.length, requestKey: randomUUID() }, actor);
    for (let index = 0; index < Math.ceil(encoded.stdout.length / upload.chunkSize); index++) await call('PUT', `/learning/media/${upload.id}/chunks/${index}`,
      encoded.stdout.subarray(index * upload.chunkSize, (index + 1) * upload.chunkSize), actor);
    const ready = await call('POST', `/learning/media/${upload.id}/complete`, {}, actor); assert.equal(ready.status, 'ready');
    assert.equal(ready.storedType, 'audio/wav'); assert(ready.durationMs >= 400 && ready.durationMs <= 1000);
    response = { mediaIds: [ready.id], description };
  }
  else if (schema.mode === 'image_upload') {
    const dimensions = snapshot.stem.match(/长(\d+)格、宽(\d+)格/); assert(dimensions, 'An image answer needs an explicit original drawing fixture');
    const columns = correct ? Number(dimensions[1]) : 1, rows = correct ? Number(dimensions[2]) : 1, cells = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) cells.push(`<rect x="${20 + col * 24}" y="${20 + row * 24}" width="24" height="24" fill="white" stroke="black"/>`);
    const diagram = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><rect width="420" height="220" fill="white"/>${cells.join('')}<text x="20" y="190" font-family="sans-serif" font-size="15">${correct ? `${columns} x ${rows} = ${columns * rows} square units` : 'Incomplete: one square only'}</text></svg>`;
    const bytes = await require('sharp')(Buffer.from(diagram)).png().toBuffer();
    const upload = await call('POST', '/learning/media', { kind: 'diagnostic', sessionId: id, itemId: item.id,
      name: '合成面积作答.png', mediaType: 'image/png', size: bytes.length, requestKey: randomUUID() }, actor);
    for (let index = 0; index < Math.ceil(bytes.length / upload.chunkSize); index++) await call('PUT', `/learning/media/${upload.id}/chunks/${index}`,
      bytes.subarray(index * upload.chunkSize, (index + 1) * upload.chunkSize), actor);
    const ready = await call('POST', `/learning/media/${upload.id}/complete`, {}, actor); assert.equal(ready.status, 'ready');
    response = { mediaIds: [ready.id], description };
  } else throw new Error('Audio needs its dedicated recording and rubric journey');
  return { answer: { questionId: item.questionId, mode: schema.mode, response }, manual: true, mode: schema.mode };
}
async function completePointSession(session, actor, correct) {
  const pending = [];
  for (const item of session.items) {
    const fixture = await pointAnswer(session.id, item, actor, correct);
    const submitted = await call('POST', sessionRoute(session.id) + '/responses', { itemId: item.id, answer: fixture.answer, elapsedMs: 1000 }, actor);
    if (fixture.manual) { assert.equal(submitted.status, 'pending_review'); pending.push({ id: submitted.responseId, mode: fixture.mode }); }
  }
  await call('POST', sessionRoute(session.id) + '/complete', {}, actor);
  const before = await call('GET', sessionRoute(session.id) + '/report', undefined, actor);
  for (const row of pending) {
    const original = before.evidence.find(item => item.id === row.id); assert.equal(original.score, null); assert.equal(original.status, 'pending_review');
    const detail = await call('GET', `/admin/reviews/diagnostic/${encodeURIComponent(row.id)}`, undefined, 'admin');
    assert(detail.canScore && detail.rubric?.length, 'The original frozen rubric must support every manual fixture');
    await call('POST', `/admin/reviews/diagnostic/${encodeURIComponent(row.id)}`, { expectedVersion: detail.reviewVersion, requestKey: randomUUID(),
      reason: '合成面积表示按冻结量规逐项核对，用于验证上传、待评分与复核链，不代表真人教师审核。',
      ratings: detail.rubric.map((_, criterionIndex) => ({ criterionIndex, score: correct ? 1 : 0,
        observation: correct ? '合成图示或说明完整对应题目中的行列与面积。' : '合成作答只有一个单位格或没有完整关系，未满足该项要求。' })) }, 'admin');
  }
  const report = pending.length ? await call('GET', sessionRoute(session.id) + '/report', undefined, actor) : before;
  if (pending.length) {
    const history = await call('GET', sessionRoute(session.id) + '/report-history', undefined, actor); assert.deepEqual(history.find(row => row.version === before.version), before);
    for (const row of pending) {
      assert.equal(report.evidence.find(item => item.id === row.id).score, correct ? 1 : 0);
      const original = await store.transaction(() => structuredClone(store.find('diagnosticResponses', { id: row.id })));
      assert.equal(original.status, 'pending_review'); assert.equal(original.score, null);
      (evidence.manualReviewJourneys ??= []).push({ mode: row.mode, intendedRubricScore: correct ? 1 : 0, frozenRubricUsed: true,
        submittedPendingBeforeScoring: true, originalFirstResponseAndReportPreserved: true, source: 'owned synthetic deterministic fixture, not a human teacher or real student' });
    }
  }
  return report;
}
async function originalImageFixture(studentId, actor, correct) {
  // In this owned temporary QA store, make only existing original image mappings eligible for selection.
  // Restore every mapping immediately after freezing the session. Never add families or alter learner scope.
  const mappings = await store.transaction(() => structuredClone(store.select('measurementItems', { atomId: 'core:math:rectanglecover' })));
  let session;
  try {
    await store.transaction(() => {
      for (const mapping of store.select('measurementItems', { atomId: 'core:math:rectanglecover' })) {
        if (store.find('questionAnswerSchemas', { questionId: mapping.questionId })?.mode !== 'image_upload') mapping.reviewStatus = 'draft';
      }
    });
    session = await call('POST', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline', targetAtomIds: ['core:math:rectanglecover'], includePrerequisites: false, maxItems: 2 }, actor);
  } finally {
    await store.transaction(() => { for (const mapping of mappings) Object.assign(store.find('measurementItems', { id: mapping.id }), structuredClone(mapping)); });
    assert.deepEqual(await store.transaction(() => structuredClone(store.select('measurementItems', { atomId: 'core:math:rectanglecover' }))), mappings);
  }
  const modes = await store.transaction(() => store.find('diagnosticSessions', { id: session.id }).questionSnapshots.map(row => row.answerSchema.mode));
  assert(modes.length && modes.every(mode => mode === 'image_upload'));
  const report = await completePointSession(session, actor, correct); assert.equal(report.pendingReviewCount, 0);
  (evidence.forcedImageFixtures ??= []).push({ intendedRubricScore: correct ? 1 : 0, originalImageTasks: modes.length,
    originalEligibilityRestored: true, originalFamilyUnchanged: true, learnerScopeUnchanged: true, noPrematureMastery: report.estimates.every(row => row.status !== 'secure') });
}
async function contentUpgrade() {
  const authoredFamilies = buildAllAuthoredProbeFamilies();
  const additions = authoredFamilies.flatMap(family => family.exercises.map(exercise => ({
    atomId: family.atomId, id: foundationQuestionId(family.atomId, exercise), analysis: exercise.analysis })));
  const newIds = additions.map(row => row.id), newIdSet = new Set(newIds), originalIds = buildFoundationCurriculum().flatMap(definition => definition.exercises.map(exercise =>
    foundationQuestionId(definition.atom.id, exercise))).filter(id => !newIdSet.has(id));
  const chunks = (values, size = 5000) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
  const collections = ['questions', 'questionDocuments', 'questionAnswerSchemas', 'questionSources', 'measurementItems'];
  await store.transaction(() => {
    for (const collection of collections) for (const ids of chunks(newIds)) store.remove(collection, { [collection === 'questions' ? 'id' : 'questionId']: ids });
    // This owned synthetic fixture represents genuine preexisting edits, not an edit to a real user's store.
    const id = originalIds[0]; store.find('questions', { id }).analysis = 'QA既有编辑，升级不得改写';
    store.find('questionSources', { questionId: id }).notes = 'QA既有来源说明';
    store.find('measurementItems', { questionId: id }).reviewStatus = 'draft';
  });
  const fingerprint = () => store.transaction(() => Object.fromEntries(collections.map(collection => {
    const rows = store.select(collection, { [collection === 'questions' ? 'id' : 'questionId']: originalIds }).map(row => ({ ...row }))
      .sort((a, b) => String(a.id ?? a.questionId).localeCompare(String(b.id ?? b.questionId)));
    // JSONB object key order is not part of content identity.
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
      Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value;
    return [collection, { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex') }];
  })));
  const before = await fingerprint(); assert.equal(before.questions.count, 3435);
  await stop(); await start();
  assert.deepEqual(await fingerprint(), before);
  await store.transaction(() => {
    for (const ids of chunks(newIds)) {
      assert.equal(store.select('questions', { id: ids }).length, ids.length);
      assert.equal(store.select('measurementItems', { questionId: ids }).length, ids.length);
    }
    for (const addition of additions) assert.equal(store.find('questions', { id: addition.id }).analysis, addition.analysis);
  });
  await stop(); await start(); assert.deepEqual(await fingerprint(), before);
  evidence.contentUpgrade = { originalCollections: before, additions: additions.length, families: authoredFamilies.length, existingEditsAndDraftMappingPreserved: true,
    newQuestionAndMappingAddedExactlyOnce: true, taskSpecificAnalysisRetained: true, restarts: 2 };
}
const previewRoute = id => `/diagnostics/blueprints/${encodeURIComponent(id)}`;
const sessionRoute = id => `/diagnostics/sessions/${id}`;
async function main() {
  if (driver === 'postgres') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'data/qa/postgres/credentials.json'), 'utf8'));
    if (config.purpose !== 'StudyAgent isolated QA cluster' || config.port !== 15439 || config.appUser !== 'study_agent_app') throw new Error('Expected owned QA cluster');
    adminPool = new Pool({ host: '127.0.0.1', port: config.port, database: 'postgres', user: config.adminUser, password: config.adminPassword });
    qaDatabase = 'study_verification_' + randomUUID().replaceAll('-', ''); await adminPool.query(`CREATE DATABASE ${qaDatabase}`);
    const setup = new Pool({ host: '127.0.0.1', port: config.port, database: qaDatabase, user: config.adminUser, password: config.adminPassword });
    try { await setup.query('GRANT ALL ON SCHEMA public TO study_agent_app'); } finally { await setup.end(); }
    const url = new URL(`postgresql://127.0.0.1:${config.port}/${qaDatabase}`); url.username = config.appUser; url.password = config.appPassword;
    process.env.DATABASE_URL = url.toString(); process.env.STUDY_STORAGE = 'postgres';
  }
  const credential = randomBytes(24).toString('hex');
  const boot = spawnSync(process.execPath, [path.join(root, 'apps/api/dist/apps/api/src/cli.js'), 'create-admin', 'qa-verification'],
    { cwd: root, env: { ...process.env, STUDY_ADMIN_PASSWORD: credential }, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(boot.status, 0, 'Formal administrator bootstrap');
  await start();
  if (verifyContentUpgrade) await contentUpgrade();
  evidence.responseFixtures = await store.transaction(() => {
    const manual = ['short_answer', 'stepwise', 'geometry_draw', 'image_upload', 'audio_record'], counts = {};
    let explicitDurationTasks = 0, explicitGradingTasks = 0, caseSensitiveTasks = 0;
    for (const { atom, exercises } of buildFoundationCurriculum()) for (const task of exercises) {
      const id = foundationQuestionId(atom.id, task), schema = store.find('questionAnswerSchemas', { questionId: id });
      const question = store.find('questions', { id });
      if (task.expectedSeconds) {
        assert.equal(store.find('measurementItems', { id: `measurement:${id}` }).expectedSeconds, task.expectedSeconds);
        explicitDurationTasks++;
      }
      if (manual.includes(schema.mode)) continue;
      assert.equal(gradeResponse(schema, question.answer, question.answer).score, 1, `Persisted standard answer: ${id}`);
      if (task.gradingConfig) {
        assert.equal(schema.gradingConfig.caseSensitive, task.gradingConfig.caseSensitive, `Persisted case requirement: ${id}`);
        explicitGradingTasks++;
        if (task.gradingConfig.caseSensitive) {
          assert.equal(schema.mode, 'multi_blank');
          const changedCase = question.answer.map(entry => ({ ...entry, value: String(entry.value).toLowerCase() }));
          assert.notDeepEqual(changedCase, question.answer, `The fixture must actually change letter case: ${id}`);
          assert(gradeResponse(schema, question.answer, changedCase).score < 1, `Required uppercase cannot receive full credit as lowercase: ${id}`);
          caseSensitiveTasks++;
        } else {
          const changedCase = question.answer.map(entry => ({ ...entry, value: String(entry.value).toLowerCase() }));
          assert.equal(gradeResponse(schema, question.answer, changedCase).score, 1, `Greeting case alone must not invalidate communication: ${id}`);
        }
      }
      legalWrongAnswer(schema, question.answer); counts[schema.mode] = (counts[schema.mode] ?? 0) + 1;
    }
    return { scope: 'Every persisted objective original task; manual and media answers require their separate review journeys.',
      modes: counts, correctStandardsAndLegalZeroScoreFixturesChecked: true, explicitDurationTasks, durationEstimatesAreNotFieldCalibration: true,
      explicitGradingTasks, caseSensitiveTasks, caseRequirementsPersistedAndExercised: true };
  });
  tokens.admin = (await call('POST', '/auth/login', { principal: 'qa-verification', credential }, 'anonymous')).token;
  for (const actor of ['parent', 'outsider']) tokens[actor] = (await call('POST', '/auth/register', {
    principal: `qa-verification-${actor}`, credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
  const studentId = (await call('POST', '/students', { nickname: '合成对照运行', grade: 3, preferredSessionMinutes: 15,
    defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile.id;
  const access = await call('POST', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '合成家庭核对受限学生自己的评测证据' });
  const code = await call('POST', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: randomUUID() });
  tokens.learner = (await call('POST', '/auth/learning-code', { code: code.code }, 'anonymous')).token;
  if (verifyContentUpgrade) {
    evidence.pointJourneys = [];
    const pointDefinitions = new Map(buildFoundationCurriculum().map(definition => [definition.atom.id, definition.atom]));
    for (const selectedAtomId of [...new Set(buildAllAuthoredProbeFamilies().map(family => family.atomId))].filter(id => !pointFilter || id === pointFilter)) {
      // At most 12 children per synthetic guardian cohort; do not exhaust one parent's write quota by managing the whole curriculum.
      // Every guardian and learner uses the formal identity flow. Production quotas remain active.
      const cohort = Math.floor(evidence.pointJourneys.length / 12), pointParent = `point-parent-${cohort}`;
      if (!tokens[pointParent]) tokens[pointParent] = (await call('POST', '/auth/register', {
        principal: `qa-verification-${pointParent}`, credential: randomBytes(24).toString('hex') }, 'anonymous')).token;
      const { grade, subject } = pointDefinitions.get(selectedAtomId), pointStudentId = (await call('POST', '/students', {
        nickname: '合成知识点核查', grade, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '', [subject]: 'original' } }, pointParent)).profile.id;
      const pointAccess = await call('POST', `/students/${pointStudentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '逐点核查独立学生身份与正式限流' }, pointParent);
      const pointCode = await call('POST', `/students/${pointStudentId}/learning-access/codes`, { expectedVersion: pointAccess.version, requestKey: randomUUID() }, pointParent);
      const actor = `point-${evidence.pointJourneys.length}`;
      tokens[actor] = (await call('POST', '/auth/learning-code', { code: pointCode.code }, 'anonymous')).token;
      await call('PUT', `/students/${pointStudentId}/learning-scope`, { subject, grade, term: 'upper', textbookVolumeId: null,
        textbookVersion: '原创能力路径', learnedAtomIds: [selectedAtomId], currentAtomId: selectedAtomId, minutesPerSession: 15 }, pointParent);
      if (selectedAtomId === 'core:math:rectanglecover') {
        await originalImageFixture(pointStudentId, actor, false); await originalImageFixture(pointStudentId, actor, true);
      }
      const baseline = await call('POST', '/diagnostics/sessions', { studentId: pointStudentId, subject, intent: 'baseline',
        targetAtomIds: [selectedAtomId], includePrerequisites: false, maxItems: 8 }, actor);
      const source = await completePointSession(baseline, actor, false);
      const hypothesis = source.hypotheses.find(row => row.atomId === selectedAtomId && row.cause === 'representation_gap'); assert(hypothesis);
      const preview = await call('POST', '/diagnostics/blueprints', { studentId: pointStudentId, subject, intent: 'verification', hypothesisId: hypothesis.id,
        includePrerequisites: true, maxItems: 8, requestKey: randomUUID() }, actor);
      assert.equal(preview.blueprint.verification.fullyCovered, true); assert.equal(preview.itemCount, 4);
      assert.equal(preview.blueprint.familyIdentityVersion, FAMILY_IDENTITY_VERSION);
      assert.equal(preview.blueprint.verification.familyIdentityVersion, FAMILY_IDENTITY_VERSION);
      const session = await call('POST', previewRoute(preview.id) + '/start', {}, actor);
      const result = await completePointSession(session, actor, true);
      assert.equal(result.verification.independentObservationsComplete, true);
      assert.equal(result.familyIdentityVersion, FAMILY_IDENTITY_VERSION);
      assert.equal(result.verification.distinctFamilyRequirementsMet, true);
      assert(result.verification.groups.every(group => group.independentFamilies === 2 && group.passedFamilies === 2));
      assert.notEqual(result.estimates.find(row => row.atomId === selectedAtomId).status, 'secure');
      evidence.pointJourneys.push({ atomId: selectedAtomId, subject, grade, formalGuardianCohort: cohort, formalIndependentLearner: true, productionQuotasActive: true, frozenContrasts: 4, basicFamilies: 2, transferFamilies: 2,
        independentObservationsComplete: true, noPrematureSecureMastery: true });
    }
  }
  if (verifyContentUpgrade && (!pointFilter || pointFilter === 'core:math:rectanglecover')) {
    assert.equal(evidence.forcedImageFixtures.length, 2);
    assert(evidence.forcedImageFixtures.every(row => row.noPrematureMastery));
    assert(evidence.manualReviewJourneys.some(row => row.mode === 'image_upload' && row.intendedRubricScore === 0));
    assert(evidence.manualReviewJourneys.some(row => row.mode === 'image_upload' && row.intendedRubricScore === 1));
  }
  const atomId = 'foundation:math:multiplydigits';
  await call('PUT', `/students/${studentId}/learning-scope`, { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: null,
    textbookVersion: '原创能力路径', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 });
  const baseline = await call('POST', '/diagnostics/sessions', { studentId, subject: 'math', intent: 'baseline',
    targetAtomIds: [atomId], includePrerequisites: true, maxItems: 12 });
  for (const item of baseline.items) await call('POST', sessionRoute(baseline.id) + '/responses', {
    itemId: item.id, answer: await wrongAnswer(baseline.id, item), elapsedMs: 1000 });
  const baselineReport = await call('POST', sessionRoute(baseline.id) + '/complete', {});
  const rootCause = baselineReport.hypotheses.find(row => row.atomId === atomId && row.cause === 'prerequisite_gap');
  const transferCause = baselineReport.hypotheses.find(row => row.atomId === atomId && row.cause === 'representation_gap');
  assert(rootCause && transferCause);
  const command = { studentId, subject: 'math', intent: 'verification', hypothesisId: transferCause.id, includePrerequisites: true,
    maxItems: 12, requestKey: randomUUID() };
  const preview = await call('POST', '/diagnostics/blueprints', command, 'learner');
  assert.equal(preview.blueprint.verification.groups.length, 2); assert(preview.canStart);
  assert.equal(preview.blueprint.verification.fullyCovered, true, 'Authored structures must genuinely cover both observations');
  assert.equal(preview.itemCount, 4); assert(preview.blueprint.verification.groups.every(row => !row.gap && row.selectedFamilies.length === 2));
  assert(!JSON.stringify(preview).includes('gradingConfig'));
  const rootPreview = await call('POST', '/diagnostics/blueprints', { ...command, hypothesisId: rootCause.id, requestKey: randomUUID() });
  const prerequisites = await store.transaction(() => store.find('knowledgeAtoms', { id: atomId }).prerequisiteIds);
  assert.deepEqual(new Set(rootPreview.blueprint.verification.groups.map(row => row.atomId)), new Set([atomId, ...prerequisites]));
  assert.deepEqual(rootPreview.blueprint.targetAtomIds, [atomId]);
  await call('GET', previewRoute(preview.id), undefined, 'outsider', 404);
  await call('POST', '/diagnostics/blueprints', { ...command, intent: 'baseline', requestKey: randomUUID() }, 'parent', 400);
  await stop(); await start();
  assert.deepEqual(await call('GET', previewRoute(preview.id), undefined, 'learner'), preview);
  const concurrent = await Promise.all([raw('POST', previewRoute(preview.id) + '/start', {}, 'learner'), raw('POST', previewRoute(preview.id) + '/start', {}, 'learner')]);
  assert(concurrent.every(row => [201, 409].includes(row.status))); assert(concurrent.some(row => row.status === 201));
  let session = await call('POST', previewRoute(preview.id) + '/start', {}, 'learner');
  assert.deepEqual(session.blueprint, preview.blueprint); assert.equal(session.items.length, preview.itemCount);
  const firstQuestion = await store.transaction(() => structuredClone(store.find('diagnosticSessions', { id: session.id }).questionSnapshots.find(row => row.id === session.items[0].questionId)));
  const draft = { questionId: firstQuestion.id, mode: firstQuestion.answerSchema.mode, response: firstQuestion.answerSchema.mode === 'multi_blank' ?
    { entries: firstQuestion.answer } : { value: firstQuestion.answerSchema.mode === 'numeric_blank' ? '12' : firstQuestion.answer } };
  await call('PATCH', sessionRoute(session.id) + `/items/${session.items[0].id}/draft`, { answer: draft }, 'learner');
  session = await call('POST', sessionRoute(session.id) + '/state', { action: 'pause', expectedRevision: session.revision,
    requestKey: randomUUID(), reason: '核对冻结观察组与草稿重启恢复' }, 'learner');
  await stop(); await start();
  const restored = await call('GET', sessionRoute(session.id), undefined, 'learner');
  assert.equal(restored.status, 'paused'); assert.deepEqual(restored.blueprint, preview.blueprint);
  assert.deepEqual((await call('GET', sessionRoute(session.id) + `/items/${session.items[0].id}`, undefined, 'learner')).draft, draft);
  session = await call('POST', sessionRoute(session.id) + '/state', { action: 'resume', expectedRevision: restored.revision,
    requestKey: randomUUID(), reason: '继续核对独立与受提示的实际观察' }, 'learner');
  const baseItem = session.items.find(row => row.dimension !== 'transfer'), transferItem = session.items.find(row => row.dimension === 'transfer');
  assert(baseItem && transferItem);
  await call('POST', sessionRoute(session.id) + `/items/${baseItem.id}/hint`, {}, 'learner');
  for (const item of session.items) await call('POST', sessionRoute(session.id) + '/responses', {
    itemId: item.id, answer: await snapshotAnswer(session.id, item.questionId), elapsedMs: 1000 }, 'learner');
  await call('POST', sessionRoute(session.id) + '/complete', {}, 'learner');
  const firstReport = await call('GET', sessionRoute(session.id) + '/report', undefined, 'learner');
  assert.equal(firstReport.verification.independentObservationsComplete, false);
  assert.equal(firstReport.verification.groups.reduce((n, row) => n + row.assistedOrExposed, 0), 1);
  const transferEvidence = firstReport.evidence.find(row => row.itemId === transferItem.id);
  await call('POST', `/admin/diagnostic-responses/${encodeURIComponent(transferEvidence.id)}/review`, { score: 0,
    reason: '合成运行修订一次评分，核对报告版本与独立观察归类', requestKey: randomUUID(), expectedVersion: 0 }, 'admin');
  const latestReport = await call('GET', sessionRoute(session.id) + '/report', undefined, 'learner');
  assert.equal(latestReport.version, 2); assert.equal(latestReport.verification.groups[1].belowStandardFamilies, 1);
  assert.deepEqual(latestReport.verification.blueprint, preview.blueprint.verification);
  const history = await call('GET', sessionRoute(session.id) + '/report-history', undefined, 'learner'); assert.deepEqual(history.at(-1), firstReport);
  await call('POST', previewRoute(rootPreview.id) + '/start', {}, 'parent', 409);
  const identityUpgrade = await verifyFamilyIdentityUpgrade({ call, getStore: () => store, getApp: () => app, tokens });
  await stop(); await start();
  assert.deepEqual(await call('GET', sessionRoute(session.id) + '/report', undefined, 'learner'), latestReport);
  assert.deepEqual(await call('GET', sessionRoute(session.id) + '/report-history', undefined, 'learner'), history);
  assert.equal((await call('POST', previewRoute(preview.id) + '/start', {}, 'learner')).id, session.id);
  evidence.familyIdentityUpgrade = { ...identityUpgrade.receipt, ...await identityUpgrade.verifyAfterRestart() };
  evidence.result = { previewItemCount: preview.itemCount, requiredObservationGroups: preview.blueprint.verification.groups.length,
    observationCoverage: preview.blueprint.verification.groups.map(row => ({ dimensions: row.dimensions, availableFamilies: row.availableFamilies, selectedFamilies: row.selectedFamilies.length, gap: row.gap })),
    targetAndAllDirectPrerequisitesCompared: true, learnerAuthorization: true, outsiderBlocked: true,
    concurrentStartStatuses: concurrent.map(row => row.status), frozenGroupsAndPauseSurviveRestart: true,
    hintedAnswerExcludedFromIndependentObservations: true, revisionUpdatesActualObservations: true, oldReportAndOriginalBlueprintFrozen: true,
    staleBasisPreviewRejected: true, completedPreviewReceiptReplayed: true, restarts: verifyContentUpgrade ? 5 : 3 };
  evidence.passed = true;
}
main().catch(error => { evidence.error = error.message; process.exitCode = 1; }).finally(async () => {
  await stop();
  if (adminPool) {
    try { if (qaDatabase && /^study_verification_[a-f0-9]{32}$/.test(qaDatabase)) {
      await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [qaDatabase]); await adminPool.query(`DROP DATABASE IF EXISTS ${qaDatabase}`);
    } } finally { await adminPool.end(); }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, driver, result: evidence.result, error: evidence.error }));
  const target = path.resolve(directory);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('study-verification-runtime-')) throw new Error('Unexpected temporary cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});
