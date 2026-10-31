const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../..'), prior = path.join(root, 'data/qa/workspace-curriculum-inventory-first-20261101');
const specifications = [
  ['postgres-start-first.cjs', [['15452', '15453'], ['study_textbook_scope', 'study_textbook_sources']]],
  ['postgres-first.cjs', [['15452', '15453'], ['study_textbook_scope', 'study_textbook_sources'], ['STUDY_TEST_TEXTBOOK_SCOPE_POSTGRES_URL', 'STUDY_TEST_TEXTBOOK_SOURCE_POSTGRES_URL'], ['textbook-scope-inventory.integration.test.ts', 'textbook-lesson-source.integration.test.ts']]],
  ['web-build-second.cjs', [['p181', 'p182'], ['curriculum181-second', 'source182-first'], ['16182', '16183'], ['13182', '13183'], ['second', 'first'], ["'apps/web/lib/classroom-audio.ts'", "'apps/web/lib/classroom-audio.ts', 'apps/web/app/admin/curriculum/lesson-source-panel.tsx', 'apps/web/app/admin/curriculum/lesson-source-panel.css'"]]],
  ['browser-web-second.cjs', [['second', 'first']]],
];
for (const [file, changes] of specifications) {
  let text = fs.readFileSync(path.join(prior, file), 'utf8'); for (const [before, after] of changes) { if (!text.includes(before)) throw Error('Expected helper context missing'); text = text.replaceAll(before, after); }
  fs.writeFileSync(path.join(__dirname, file.replace('second', 'first')), text, { flag: 'wx' });
}
console.log(JSON.stringify({ generatedHelpers: specifications.length, pgPort: 15453, apiPort: 16183, webPort: 13183 }));
