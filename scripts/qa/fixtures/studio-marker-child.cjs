// Real abrupt-exit fixture. Refuse all paths outside a dedicated temporary QA root.
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const root = path.resolve(process.argv[2]);
const relative = path.relative(os.tmpdir(), root);
if (path.isAbsolute(relative) || !/^study-atomic-marker-[^/\\]+(?:[/\\]|$)/.test(relative)) throw new Error('Unsafe atomic-marker fixture root');
const [kind, key, purpose, stop] = process.argv.slice(3);
const base = path.resolve(__dirname, '../../..', 'apps/api/dist/apps/api/src/infrastructure');
const { studioCoordinationRoot } = require(path.join(base, 'studio-file-paths.js'));
const { publishStudioMarker } = require(path.join(base, 'studio-atomic-marker.js'));
const control = studioCoordinationRoot(root, kind, key), nonce = randomUUID();
const value = { format: purpose === 'lease' ? 'study-file-lease-v1' : purpose === 'purge' ? 'study-file-purge-v1' : 'study-upload-revocation-v1',
  nonce, pid: process.pid, createdAt: new Date().toISOString(), kind, key, id: key, generation: 1, taskId: 'task_' + randomUUID(), token: randomUUID() };
const file = path.join(control, purpose === 'lease' ? 'leases/' + nonce + '.json' : purpose + '.json');
publishStudioMarker(control, file, purpose, value, async phase => {
  if (phase !== stop) return;
  process.stdout.write(JSON.stringify({ phase, file, pid: process.pid }) + '\n');
  await new Promise(() => { setInterval(() => {}, 1000); });
}).then(() => { throw new Error('Atomic-marker stop phase was not reached'); }).catch(error => { console.error(error); process.exitCode = 1; });
