const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib'), { execFileSync } = require('node:child_process');
const qa = __dirname, root = path.resolve(qa, '../../..'), previous = path.join(root, 'data/qa/a165'), target = path.join(root, 'data/qa/p166');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (head !== 'a790ce7a91fd49f34b208c3eb20a6cf05f54646d' || execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() || fs.existsSync(target)) throw Error('Exact clean committed main and fresh bounded export source required');
const old = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data/qa/workspace-adult-models-first-20261031/source-preparation-first.json.gz'))));
const final = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'doc/evidence/2026-10-31/workspace-r5-adult-models-and-compatibility/final-compiled-runtime.json.gz'))));
const compiled = new Map(final.files.map(row => [row.path, row]));
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 }).split('\0').filter(Boolean));
const selected = new Set([...old.inputs.map(row => row.path), ...tracked.values()].filter(file =>
  /^(?:apps\/|packages\/|resources\/|scripts\/|tests\/e2e\/)/.test(file) || ['package.json', 'package-lock.json', 'tsconfig.base.json', 'playwright.config.ts',
    'doc/evidence/2026-10-20/family-identity-content-audit.json', 'doc/evidence/2026-10-31/workspace-r5-adult-model-preparation/before-content.json.gz'].includes(file)));
for (const file of compiled.keys()) selected.add(file);
const inputs = [];
for (const file of [...selected].sort()) {
  if (file.includes('..') || /(^|\/)(?:\.env(?:\..*)?|credentials\.json|node_modules|\.next[^/]*)(?:\/|$)/.test(file)) throw Error('Private/generated path in source selection');
  const frozen = compiled.get(file), from = tracked.has(file) ? path.join(root, file) : path.join(previous, file);
  const bytes = frozen ? Buffer.from(frozen.utf8) : fs.readFileSync(from);
  if (frozen && (sha(bytes) !== frozen.sha256 || sha(fs.readFileSync(path.join(previous, file))) !== frozen.sha256)) throw Error('Actual frozen compilation changed');
  const destination = path.join(target, file); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
  assertReadback(destination, bytes); inputs.push({ path: file, origin: frozen ? 'exact-final165-compilation' : tracked.has(file) ? 'actual-current-main' : 'unchanged-previous-auxiliary', bytes: bytes.length, sha256: sha(bytes) });
}
function assertReadback(file, bytes) { if (sha(fs.readFileSync(file)) !== sha(bytes)) throw Error('Independent source copy failed: ' + file); }
const shared = fs.realpathSync(path.join(previous, 'node_modules')), deps = path.join(target, 'node_modules'), links = [];
fs.mkdirSync(deps, { recursive: true });
for (const entry of fs.readdirSync(shared, { withFileTypes: true })) {
  if (entry.name === '@study-agent' || entry.name.startsWith('.') && entry.name !== '.bin') continue;
  const from = path.join(shared, entry.name); if (!fs.statSync(from).isDirectory()) continue;
  const link = path.join(deps, entry.name); fs.symlinkSync(from, link, 'junction'); links.push({ path: path.relative(root, link).replaceAll('\\', '/'), target: from });
}
fs.mkdirSync(path.join(deps, '@study-agent'), { recursive: true });
for (const name of ['contracts', 'config']) {
  const from = path.join(target, 'packages', name), link = path.join(deps, '@study-agent', name); fs.symlinkSync(from, link, 'junction');
  links.push({ path: path.relative(root, link).replaceAll('\\', '/'), target: from });
}
const packageRequires = require('node:module').createRequire(path.join(target, 'package.json'));
for (const name of ['contracts', 'config']) if (!packageRequires.resolve('@study-agent/' + name).startsWith(path.join(target, 'packages', name) + path.sep)) throw Error('Isolated workspace package resolves to another source tree');
const result = { at: new Date().toISOString(), baseMain: head, source: 'data/qa/p166', scope: 'Source-only main-directory export implementation environment. Actual current main source and exact final165 compiled31 baseline. No runtime data, env or formal output copied. Each workspace package points to its own copied package, other dependency links stay shared and must not be recursively deleted.',
  files: inputs.length, bytes: inputs.reduce((sum, row) => sum + row.bytes, 0), inputs, dependencyLinks: links, schema: 31, schema32Registered: false,
  applicationExportImplemented: false, noFormalDataOrRuntimeChanged: true };
fs.writeFileSync(path.join(qa, 'export166-source-preparation-first.json.gz'), zlib.gzipSync(JSON.stringify(result)), { flag: 'wx' });
console.log(JSON.stringify({ source: result.source, files: result.files, bytes: result.bytes, dependencyLinks: links.length, workspacePackagesResolveLocally: true, schema: 31, schema32Registered: false }));
