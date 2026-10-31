const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'data/qa/workspace-audio-first-20261101/web-build-fourth.cjs'), 'utf8').replaceAll('data/qa/p179', 'data/qa/p181').replaceAll('.next-audio179-fourth', '.next-curriculum181-first').replaceAll('web-build-fourth', 'web-build-first').replaceAll('16179', '16181').replaceAll('13179', '13181');
fs.writeFileSync(path.join(__dirname, 'web-build-first.cjs'), source, { flag: 'wx' });
