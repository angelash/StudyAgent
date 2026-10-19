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
delete process.env.OPENAI_API_KEY;
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../apps/api/dist/apps/api/src/app.module.js');
const { InMemoryStoreService } = require('../../apps/api/dist/apps/api/src/infrastructure/in-memory-store.service.js');
const { AuthService } = require('../../apps/api/dist/apps/api/src/modules/auth/auth.service.js');
const { writeFileSync, mkdirSync } = require('node:fs');
async function main() {
  let fixtureToken;
  const app = await NestFactory.create(AppModule, { logger: false, cors: { origin: process.env.CORS_ORIGINS.split(','), credentials: true } });
  app.use((req, res, next) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).end();
    if (fixtureToken) req.headers.authorization = `Bearer ${fixtureToken}`;
    next();
  });
  app.setGlobalPrefix('api'); await app.init();
  const store = app.get(InMemoryStoreService), auth = app.get(AuthService);
  await store.transaction(async () => {
    const login = await auth.register({ principal: `qa-${Date.now()}`, credential: randomBytes(24).toString('hex') });
    fixtureToken = login.token;
    store.users.find((user) => user.id === login.user.id).role = 'admin';
    const id = store.nextId('student');
    store.students.push({ id, userId: login.user.id, nickname: '测试小禾', grade: 2, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } });
    store.bindings.push({ id: store.nextId('binding'), parentUserId: login.user.id, studentId: id, relation: 'guardian', status: 'active' });
  });
  await app.listen(14000, '127.0.0.1');
  mkdirSync('data/qa', { recursive: true });
  writeFileSync('data/qa/browser-fixture.json', JSON.stringify({ startedAt: new Date().toISOString(),
    api: 'http://127.0.0.1:14000', fixture: 'synthetic account with pre-authenticated loopback requests; no production authentication bypass',
    knowledgeAtoms: store.knowledgeAtoms.length, originalExercises: store.measurementItems.length }, null, 2));
  process.stdout.write('Synthetic browser QA API ready: http://127.0.0.1:14000/api/ready\n');
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
