const fs = require('node:fs'), path = require('node:path');
let source = fs.readFileSync(path.join(__dirname, 'visual-third.py'), 'utf8');
if (!source.includes("word[4].startswith('PREBLOCK')") || !source.includes("word[4].startswith('POSTBLOCK')")) throw Error('Expected original coordinate probe');
source = source.replaceAll('v180t3', 'v180t4').replaceAll('ct180t3', 'ct180t4').replaceAll('visual-third.json', 'visual-fourth.json').replace("word[4].startswith('PREBLOCK')", "'PREBLOCK' in word[4]").replace("word[4].startswith('POSTBLOCK')", "'POSTBLOCK' in word[4]");
fs.writeFileSync(path.join(__dirname, 'visual-fourth.py'), source, { flag: 'wx' });
fs.writeFileSync(path.join(__dirname, 'visual-third-failure.json'), JSON.stringify({ kind: 'coordinate-probe', error: 'StopIteration', reason: 'PDF word extraction joins ORIGINALTWO and PREBLOCK around the fullwidth colon. Match the unique contained marker; retain actual separate-line and left-edge assertions.', applicationOrProductFileChanged: false, originalVisualRunKept: 'data/qa/v180t3' }, null, 2) + '\n', { flag: 'wx' });
