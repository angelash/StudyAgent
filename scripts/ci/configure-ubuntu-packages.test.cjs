const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { configureUbuntuPackages } = require('./configure-ubuntu-packages.cjs');

function fixture(run) {
  const prefix = path.join(os.tmpdir(), 'study-agent-apt-'), root = fs.mkdtempSync(prefix);
  fs.mkdirSync(path.join(root, 'sources.list.d')); fs.mkdirSync(path.join(root, 'apt.conf.d'));
  try { run(root, path.join(root, 'sources.list.d/ubuntu.sources')); }
  finally {
    const resolved = fs.realpathSync(root);
    assert(resolved.startsWith(prefix) && path.resolve(resolved) === path.resolve(root), 'Cleanup must remain in its exact temporary fixture');
    fs.rmSync(resolved, { recursive: true });
  }
}
const ubuntu = uris => '# preserve the original runner comment\nTypes: deb\nURIs: ' + uris + '\nSuites: noble noble-updates noble-backports\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';

test('actual file-backed runner mirrors become official HTTPS sources with suites, signatures and third-party bytes intact', () => fixture((root, file) => {
  const thirdParty = '\nTypes: deb\nURIs: https://packages.example.test/ubuntu\nSuites: stable\nSigned-By: /usr/share/keyrings/example.gpg\n';
  fs.writeFileSync(file, ubuntu('mirror+file:/etc/apt/apt-mirrors.txt') + '\nTypes: deb\nURIs: mirror+file:/etc/apt/apt-mirrors-security.txt\nSuites: noble-security\nComponents: main\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' + thirdParty);
  configureUbuntuPackages(root); const result = fs.readFileSync(file, 'utf8');
  assert(result.includes(ubuntu('https://archive.ubuntu.com/ubuntu')));
  assert(result.includes('URIs: https://security.ubuntu.com/ubuntu\nSuites: noble-security'));
  assert(result.endsWith(thirdParty)); assert(!result.includes('mirror+file:'));
  assert.equal(fs.readFileSync(path.join(root, 'apt.conf.d/99study-agent-ci'), 'utf8'), fs.readFileSync(path.resolve(__dirname, '../../.github/apt-ci.conf'), 'utf8'));
}));

test('direct Azure, URI continuation and classic sources preserve package policies and are byte-idempotent', () => fixture((root, file) => {
  fs.writeFileSync(file, ubuntu('http://azure.archive.ubuntu.com/ubuntu/') + '\nTypes: deb\nURIs: https://archive.ubuntu.com/ubuntu\n https://security.ubuntu.com/ubuntu\nSuites: noble-security\n');
  const list = path.join(root, 'sources.list'), comment = '# deb http://azure.archive.ubuntu.com/ubuntu preserved comment\n';
  fs.writeFileSync(list, comment + 'deb [arch=amd64 signed-by=/key.gpg] https://azure.archive.ubuntu.com/ubuntu noble universe\n');
  configureUbuntuPackages(root); const sources = fs.readFileSync(file), classic = fs.readFileSync(list);
  assert(classic.toString().startsWith(comment)); assert(classic.toString().includes('deb [arch=amd64 signed-by=/key.gpg] https://archive.ubuntu.com/ubuntu noble universe'));
  const repeated = configureUbuntuPackages(root);
  assert(fs.readFileSync(file).equals(sources)); assert(fs.readFileSync(list).equals(classic));
  assert.equal(repeated.sources.reduce((sum, row) => sum + row.changedUris, 0), 0);
}));

test('an unknown active mirror fails before changing any source or installing configuration', () => fixture((root, file) => {
  const original = ubuntu('http://azure.archive.ubuntu.com/ubuntu'); fs.writeFileSync(file, original);
  fs.writeFileSync(path.join(root, 'sources.list'), 'deb mirror+file:/etc/apt/unrecognized.txt noble main\n');
  assert.throws(() => configureUbuntuPackages(root), /Unknown active Ubuntu mirror/);
  assert.equal(fs.readFileSync(file, 'utf8'), original); assert(!fs.existsSync(path.join(root, 'apt.conf.d/99study-agent-ci')));
}));

test('a dangling configuration link is refused before any source write', t => fixture((root, file) => {
  const original = ubuntu('http://azure.archive.ubuntu.com/ubuntu'); fs.writeFileSync(file, original);
  const target = path.join(root, 'must-not-be-created');
  try { fs.symlinkSync(target, path.join(root, 'apt.conf.d/99study-agent-ci')); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('Windows account cannot create synthetic symlinks; required on Linux CI'); return; } throw error; }
  assert.throws(() => configureUbuntuPackages(root), /Expected regular APT file/);
  assert.equal(fs.readFileSync(file, 'utf8'), original); assert(!fs.existsSync(target));
}));
