const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), source = JSON.parse(fs.readFileSync(path.join(__dirname, 'integration-first.json'))).source.map(row => row.path);
const owned = [...source, 'doc/product/148-current-work-checkpoint-and-remaining-scope.md', 'doc/product/150-integrated-delivery-plan-and-work-ledger.md',
  'doc/product/168-paper-selection-export-native-protocol.md', 'doc/product/170-paper-export-records-and-outbox-relations.md', 'doc/evidence/2026-10-31/workspace-r5-export-records-and-outbox'];
execFileSync('git', ['add', '--', ...owned], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
execFileSync('git', ['diff', '--cached', '--check'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).split('\0').filter(Boolean);
if (staged.some(file => !owned.includes(file) && !file.startsWith('doc/evidence/2026-10-31/workspace-r5-export-records-and-outbox/'))) throw Error('Unexpected staged path');
fs.writeFileSync(path.join(__dirname, 'staging-first.json'), JSON.stringify({ stagedFiles: staged.length, onlyOwnedScope: true, checkExit: 0, files: staged }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ staged: staged.length, ownedOnly: true, diffCheck: 0 }));
