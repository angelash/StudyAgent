const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const qa = __dirname, root = path.resolve(qa, '../../..'), source = path.join(root, 'data/qa/a165');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git(['branch', '--show-current']) !== 'main' || git(['status', '--porcelain'])) throw Error('Committed clean main required before final reader preservation');
const adult = JSON.parse(fs.readFileSync(path.join(root, 'doc/evidence/2026-10-31/workspace-r5-adult-models-and-compatibility/receipt.json')));
const integration = JSON.parse(fs.readFileSync(path.join(root, 'doc/evidence/2026-10-31/workspace-r5-adult-models-and-compatibility/controlled-main-integration.json')));
if (adult.checks.apiFullThird.failed !== 2 || adult.checks.durabilityNormalFourth.passed !== 3 || adult.checks.durabilityNormalFourth.failed ||
  adult.checks.assistantPostgresThird.passed !== 70 || adult.checks.browserThird.passed !== 50 || !integration.sourceReadback) throw Error('Actual classified final delivery evidence required');
for (const row of integration.sourceFiles) if (sha(fs.readFileSync(path.join(root, row.path))) !== row.sha256 || sha(fs.readFileSync(path.join(source, row.path))) !== row.sha256) throw Error('Final31 source differs from committed main');
const compiled = 'apps/api/dist/apps/api/src/infrastructure/domain-database.js', reader = path.join(source, compiled), text = fs.readFileSync(reader, 'utf8');
if (!text.includes('ready-schema31') || text.includes('ready-schema32') || typeof require(reader).DomainDatabase !== 'function') throw Error('Actual final31 compiled reader required');
const dependencies = [...new Set([...Object.keys(require.cache), path.join(source, 'scripts/operations/database-reader-guard.cjs'), path.join(source, 'package-lock.json')])]
  .filter(file => fs.statSync(file).isFile()).map(file => ({ path: path.relative(root, file).replaceAll('\\', '/'), sha256: sha(fs.readFileSync(file)) }));
const files = {}, findings = [], knownDefaults = [];
function add(file) {
  const relative = path.relative(source, file).replaceAll('\\', '/'), bytes = fs.readFileSync(file), value = bytes.toString('utf8');
  if (!/^(?:apps\/api\/dist\/|packages\/(?:contracts|config)\/|scripts\/operations\/database-reader-guard\.cjs$)/.test(relative) || relative.split('/').includes('..')) throw Error('Unexpected baseline path');
  for (const [index, line] of value.split(/\r?\n/).entries()) if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{24,}\b|\bBearer\s+[A-Za-z0-9_.-]{40,}\b|(?:postgres(?:ql)?|mysql):\/\/[^\s:/]+:[^\s@/]+@/i.test(line)) {
    const url = line.match(/(?:postgres(?:ql)?|mysql):\/\/[^\s'"`]+/)?.[0];
    if (url && sha(Buffer.from(url)) === 'c3390ca53f9fef2d568d91228f08cedd8073449e0dfc042ac6623b2f1f4f624a' && relative.includes('config') &&
      fs.readFileSync(path.join(root, 'packages/config/src/index.ts'), 'utf8').includes(url) && fs.readFileSync(path.join(root, '.env.example'), 'utf8').includes(url))
      knownDefaults.push({ path: relative, line: index + 1, matchSha256: sha(Buffer.from(url)), kind: 'Exact tracked local example default, no runtime configuration value' });
    else findings.push({ path: relative, line: index + 1 });
  }
  files[relative] = { sha256: sha(bytes), base64: bytes.toString('base64') };
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name); if (entry.isSymbolicLink()) throw Error('No links in preserved reader');
    if (entry.isDirectory()) walk(file); else if (entry.isFile() && /\.(?:js|json)$/.test(entry.name)) add(file);
  }
}
walk(path.join(source, 'apps/api/dist'));
for (const name of ['contracts', 'config']) { add(path.join(source, 'packages', name, 'package.json')); walk(path.join(source, 'packages', name, 'dist')); }
add(path.join(source, 'scripts/operations/database-reader-guard.cjs'));
fs.writeFileSync(path.join(qa, 'reader31-credential-scan-first.json'), JSON.stringify({ files: Object.keys(files).length, findings, knownDefaults }, null, 2) + '\n', { flag: 'wx' });
if (findings.length) throw Error('Review private patterns before preserving reader');
const manifest = { protocol: 'study-domain-reader31-baseline-v1', schemaVersion: 31, sourceRevision: git(['rev-parse', 'HEAD']), nodeVersion: process.version,
  files, externalDependencies: dependencies.filter(row => row.path.startsWith('node_modules/')) };
const gzip = zlib.gzipSync(Buffer.from(JSON.stringify(manifest)), { level: 9 }), directory = path.join(root, 'resources/compatibility');
const archive = path.join(directory, 'domain-reader-schema31-v1.json.gz'); fs.writeFileSync(archive, gzip, { flag: 'wx' });
const decoded = JSON.parse(zlib.gunzipSync(fs.readFileSync(archive)));
for (const [name, file] of Object.entries(decoded.files)) if (sha(Buffer.from(file.base64, 'base64')) !== file.sha256) throw Error('Reader archive readback failed: ' + name);
const receipt = { protocol: manifest.protocol, schemaVersion: 31, sourceRevision: manifest.sourceRevision, gzipSha256: sha(gzip), fileCount: Object.keys(files).length,
  externalDependencyCount: manifest.externalDependencies.length, readerSha256: files[compiled].sha256,
  source: 'Actual final isolated a165 API third compile, exact committed source after paper31 and adult models. No database, environment, runtime credentials or logs.',
  validation: `Full API ${adult.checks.apiFullThird.passed}/2/${adult.checks.apiFullThird.skipped}; exact identical-input two-file environmental differential3/0 and seed-disabled1/2. Production browser50/0 zero retries; assistant SQLite69/0/1 and PG-config70/0/0. Original failures retained, not a single all-green broad API run. Reader restoration execution is a separate gate.` };
fs.writeFileSync(path.join(directory, 'domain-reader-schema31-v1.receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(qa, 'reader31-preserved-first.json'), JSON.stringify({ ...receipt, at: new Date().toISOString(), dependencies, knownDefaults, scope: 'Load-only reader preservation before any native32 registration; no database boot or formal application change.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(receipt));
