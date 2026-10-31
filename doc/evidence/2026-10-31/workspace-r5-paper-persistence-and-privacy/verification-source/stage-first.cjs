const fs = require('node:fs'), path = require('node:path'), { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'), evidence = 'doc/evidence/2026-10-31/workspace-r5-paper-persistence-and-privacy';
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'integration-first.json'))).source.map(row => row.path);
const owned = [...source, ...['148-current-work-checkpoint-and-remaining-scope.md', '150-integrated-delivery-plan-and-work-ledger.md',
  '168-paper-selection-export-native-protocol.md', '170-paper-export-records-and-outbox-relations.md', '171-paper-library-persistence-privacy-and-native-recovery.md'].map(name => 'doc/product/' + name), evidence];
const docs = spawnSync(process.execPath, [path.join(root, 'scripts/qa/verify-doc-links.cjs')], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 120000 });
fs.writeFileSync(path.join(__dirname, 'docs-first.log'), docs.stdout + docs.stderr, { flag: 'wx' });
if (docs.status !== 0) throw Error('Documentation links failed');
execFileSync('git', ['add', '--', ...owned], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
execFileSync('git', ['diff', '--cached', '--check'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).split('\0').filter(Boolean);
if (staged.some(file => !owned.includes(file) && !file.startsWith(evidence + '/'))) throw Error('Unexpected staged path');
fs.writeFileSync(path.join(__dirname, 'staging-first.json'), JSON.stringify({ stagedFiles: staged.length, onlyOwnedScope: true, checkExit: 0, documentation: JSON.parse(docs.stdout), files: staged }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ staged: staged.length, ownedOnly: true, diffCheck: 0, documentation: JSON.parse(docs.stdout) }));
