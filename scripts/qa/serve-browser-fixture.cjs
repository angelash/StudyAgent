/* Isolated local browser fixture. This entry point is never imported by the product.
 * Only synthetic data and generated credentials are used; no production database or AI key.
 * Browser interactions still execute real controllers, authorization, scoring and persistence.
 */
require('reflect-metadata');
const { resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
process.env.STUDY_DATA_DIR = resolve('data/qa/browser-fixture');
process.env.STUDY_STORAGE = 'sqlite';
process.env.NODE_ENV = 'development';
process.env.CORS_ORIGINS = 'http://localhost:13000,http://127.0.0.1:13000';
process.env.STUDY_PYTHON ??= process.platform === 'win32' ? 'C:\\Python310\\python.exe' : 'python3';
delete process.env.OPENAI_API_KEY;
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const { AuthService } = require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
const { hashToken } = require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
const { CurriculumService } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/curriculum.service.js');
const { DiagnosticsService } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/diagnostics.service.js');
const { GuidanceService } = require('../../apps/api/dist/apps/api/src/modules/diagnostics/guidance.service.js');
const { writeFileSync, mkdirSync } = require('node:fs');
async function main() {
  let fixtureToken, reviewFixture;
  const app = await NestFactory.create(AppModule, { logger: false, cors: { origin: process.env.CORS_ORIGINS.split(','), credentials: true } });
  app.use((req, res, next) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).end();
    if (fixtureToken) req.headers.authorization = `Bearer ${fixtureToken}`;
    next();
  });
  app.setGlobalPrefix('api'); await app.init();
  const store = app.get(InMemoryStoreService), auth = app.get(AuthService);
  await store.transaction(async () => {
    const existing = store.users.find((u) => u.principal === 'qa-browser-fixture');
    const login = existing ? { user: existing, token: randomBytes(32).toString('hex') } :
      await auth.register({ principal: 'qa-browser-fixture', credential: randomBytes(24).toString('hex') });
    fixtureToken = login.token;
    if (existing) store.sessions.push({ id: store.nextId('session'), userId: existing.id, tokenHash: hashToken(fixtureToken), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 12 * 3600000).toISOString(), revokedAt: null });
    store.users.find((user) => user.id === login.user.id).role = 'admin';
    const id = store.nextId('student');
    store.students.push({ id, userId: login.user.id, nickname: '测试小禾', grade: 2, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } });
    store.bindings.push({ id: store.nextId('binding'), parentUserId: login.user.id, studentId: id, relation: 'guardian', status: 'active' });
    const user = store.users.find((u) => u.id === login.user.id);
    const rubricQuestionIds = new Set(store.questionAnswerSchemas.filter((q) => q.gradingConfig?.rubric).map((q) => q.questionId));
    const atom = store.knowledgeAtoms.find((a) => a.subject === 'chinese' && a.grade === 3 &&
      store.measurementItems.filter((m) => m.atomId === a.id && rubricQuestionIds.has(m.questionId)).length >= 2);
    if (!atom) throw new Error('Original rubric fixture is unavailable');
    const childId = store.nextId('student');
    store.students.push({ id: childId, userId: store.nextId('student_user'), nickname: '测试小麦', grade: 3,
      preferredSessionMinutes: 15, defaultVersionMap: { chinese: 'original', math: '', english: '' } });
    store.bindings.push({ id: store.nextId('binding'), parentUserId: user.id, studentId: childId, relation: 'guardian', status: 'active' });
    app.get(CurriculumService).saveScope(user, childId, { subject: 'chinese', grade: 3, term: 'upper', textbookVolumeId: null,
      textbookVersion: '浏览器合成复核范围', learnedAtomIds: [atom.id], currentAtomId: atom.id, minutesPerSession: 15 });
    const diagnostics = app.get(DiagnosticsService), session = diagnostics.start(user, { studentId: childId, subject: 'chinese', maxItems: 2 });
    for (const item of session.items) diagnostics.submit(user, session.id, { itemId: item.id,
      answer: { questionId: item.questionId, mode: 'short_answer', response: { value: '我从文章中的具体线索看到了变化。我还需要把线索和结论之间的联系解释清楚。' } }, elapsedMs: 38000 });
    const report = diagnostics.complete(user, session.id);
    const plan = await app.get(GuidanceService).create(user, childId, { baselineSessionId: session.id, minutesPerDay: 10, useAi: false });
    app.get(GuidanceService).update(user, plan.id, { status: 'active' });
    reviewFixture = { studentId: childId, sessionId: session.id, responseId: report.evidence[0].id, atomId: atom.id };
  });
  await app.listen(14000, '127.0.0.1');
  mkdirSync('data/qa', { recursive: true });
  writeFileSync('data/qa/browser-fixture.json', JSON.stringify({ startedAt: new Date().toISOString(),
    api: 'http://127.0.0.1:14000', fixture: 'synthetic account with pre-authenticated loopback requests; no production authentication bypass',
    knowledgeAtoms: store.knowledgeAtoms.length, originalExercises: store.measurementItems.length, reviewFixture }, null, 2));
  process.stdout.write('Synthetic browser QA API ready: http://127.0.0.1:14000/api/ready\n');
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
