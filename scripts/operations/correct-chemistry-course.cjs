/* Exact, reviewable local correction; never enumerate and rewrite courses by title. */
const fs = require('node:fs'), path = require('node:path');
require('reflect-metadata');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1];
const courseId = args.includes('--course') ? value('--course') : '', fingerprint = args.includes('--expected-fingerprint') ? value('--expected-fingerprint') : '';
const destination = args.includes('--receipt') ? path.resolve(root, value('--receipt')) : null;
if (!courseId || !/^[a-f0-9]{64}$/.test(fingerprint) || !destination || !destination.startsWith(root + path.sep) || fs.existsSync(destination))
  throw Error('Supply --course, --expected-fingerprint and a new --receipt inside the workspace. Omit --apply to preview.');
process.env.STUDY_WORKER_ENABLED = 'false';
process.env.STUDY_SEED_FOUNDATION = 'false';
const compiled = name => require(path.join(root, 'apps/api/dist/apps/api/src', name + '.js'));
(async () => {
  const app = await require('@nestjs/core').NestFactory.createApplicationContext(compiled('app.module').AppModule, { logger: false });
  try {
    const store = app.get(compiled('infrastructure/in-memory-store.service').InMemoryStoreService);
    if (!store.persistence.durable) throw Error('Correction requires durable storage');
    const result = await compiled('modules/learning/chemistry-course-correction').correctChemistryCourse(store, courseId, fingerprint, args.includes('--apply'));
    const receipt = { at: new Date().toISOString(), ...result };
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(receipt));
  } finally { await app.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
