const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'data/qa/workspace-audio-first-20261101/browser-web-fourth.cjs'), 'utf8').replaceAll('web-build-fourth', 'web-build-first').replaceAll('browser-web-fourth', 'browser-web-first');
fs.writeFileSync(path.join(__dirname, 'browser-web-first.cjs'), source, { flag: 'wx' });
