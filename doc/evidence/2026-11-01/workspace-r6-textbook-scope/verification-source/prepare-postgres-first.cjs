const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'data/qa/workspace-paper-math-first-20261101/postgres-start-first.cjs'), 'utf8').replaceAll('15451', '15452').replaceAll('study_paper_tex', 'study_textbook_scope');
fs.writeFileSync(path.join(__dirname, 'postgres-start-first.cjs'), source, { flag: 'wx' });
