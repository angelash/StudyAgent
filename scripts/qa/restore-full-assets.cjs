// Queues one isolated recovery of the known synthetic QA backup. Originals stay untouched.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { spawn } = require('node:child_process');
const { restoreBundle, files: { noLinks } } = require('../operations/backup.cjs');
if (process.argv.length !== 5) throw new Error('Usage: restore-full-assets <bundle> <fresh destination> <evidence directory>');
const bundle = noLinks(process.argv[2]), destination = noLinks(process.argv[3]), evidenceDirectory = path.resolve(process.argv[4]);
const stateFile = path.resolve('data/qa/full-assets-recovery-status.json');
const state = { startedAt: new Date().toISOString(), scope: 'Full assets and an older synthetic QA business snapshot; not a backup of current real family data', bundle, destination, phase: 'waiting_for_verified_backup', passed: false };
const save = () => { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2) + '\n'); };
async function main() {
  if (fs.existsSync(destination)) throw new Error('Recovery destination already exists');
  if (destination === bundle || destination.startsWith(bundle + path.sep) || bundle.startsWith(destination + path.sep)) throw new Error('Overlapping backup and recovery');
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'study-agent-backup-v1' || !manifest.assetsIncluded || manifest.assetCount < 396118) throw new Error('Expected the complete QA asset backup');
  const db = new DatabaseSync(path.join(bundle, 'database/study-agent.sqlite3'), { readOnly: true });
  try {
    const users = db.prepare("SELECT body FROM domain_records WHERE collection='users'").all().map(row => JSON.parse(row.body));
    if (!users.length || !users.every(user => /^qa-/.test(user.principal) || user.role === 'student' && user.principal === `@learner/${user.id}`)) throw new Error('The source is not the known synthetic QA snapshot');
  } finally { db.close(); }
  fs.mkdirSync(path.dirname(destination), { recursive: true }); noLinks(path.dirname(destination));
  const disk = fs.statfsSync(path.dirname(destination)), required = manifest.files.reduce((sum, file) => sum + file.size, 0);
  if (disk.bavail * disk.bsize < required * 1.1 + 1024 ** 3) throw new Error('Insufficient recovery volume capacity');
  state.backupId = manifest.id; state.expectedAssets = manifest.assetCount; state.requiredBytes = required; save();
  const deadline = Date.now() + 4 * 3600000;
  while (fs.existsSync(path.join(bundle, '.study-backup-incomplete'))) {
    if (Date.now() > deadline) throw new Error('Backup verification did not finish within the recovery wait window');
    await new Promise(resolve => setTimeout(resolve, 15000));
    save();
  }
  if (JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8')).id !== manifest.id) throw new Error('Backup identity changed');
  state.phase = 'verifying_and_restoring'; save(); console.log('Verified backup is available; starting full isolated recovery');
  const receipt = await restoreBundle({ bundle, destination });
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, 'full-assets-restore-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  state.phase = 'independent_asset_hash_verification'; save();
  await new Promise((resolve, reject) => {
    const executable = process.env.STUDY_PYTHON ?? (process.platform === 'win32' ? 'C:\\Python310\\python.exe' : 'python3');
    const child = spawn(executable, ['-X', 'utf8', path.join(__dirname, 'verify-restored-assets.py'), bundle, destination, path.join(evidenceDirectory, 'full-assets-independent-verification.json')], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Independent asset verification failed')));
  });
  state.phase = 'complete'; state.passed = true; state.completedAt = new Date().toISOString(); save(); console.log('Full isolated recovery and independent asset hashes passed');
}
main().catch(error => { state.phase = 'failed'; state.error = error.message; save(); console.error(error.message); process.exitCode = 1; });
