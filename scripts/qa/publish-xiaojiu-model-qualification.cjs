// Explicit local transformation only. No model call or server endpoint writes a qualification receipt.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), args = process.argv.slice(2), at = args.indexOf('--output');
if (args.includes('--help')) { console.log('node --env-file=.env scripts/qa/publish-xiaojiu-model-qualification.cjs <owned-complete-run-directory> --output <new-public-json>'); process.exit(0); }
if (!args[0] || at < 1 || !args[at + 1]) throw Error('An original completed run and explicit new --output file are required');
const directory = path.resolve(root, args[0]), destination = path.resolve(root, args[at + 1]);
for (const file of [directory, destination]) if (!file.startsWith(root + path.sep)) throw Error('Qualification paths must stay in this worktree');
if (fs.existsSync(destination)) throw Error('Public output already exists; preserve it and choose a new version');
if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw Error('An owned real run directory is required');
const source = path.join(directory, 'receipt.json');
if (!fs.lstatSync(source).isFile() || fs.lstatSync(source).isSymbolicLink() || fs.statSync(source).size > 1024 * 1024) throw Error('Invalid original qualification receipt');
const bytes = fs.readFileSync(source), original = JSON.parse(bytes.toString('utf8'));
if (original.synthetic === true || original.testOnly === true) throw Error('Synthetic provider fixtures cannot become a published model check');
require('reflect-metadata');
const load = name => require(path.join(root, 'apps/api/dist/apps/api/src/modules/ai', name + '.js'));
const { publicModelQualification, projectModelQualification, modelCatalogFingerprint, modelConnectionFingerprint } = load('xiaojiu-model-qualification');
const { XiaojiuModelsService, codexHomeDirectory } = load('xiaojiu-models.service');
const { textProviderConfiguration } = load('xiaojiu-text-transport');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const catalog = new XiaojiuModelsService().catalog(), connection = textProviderConfiguration();
const fingerprint = modelConnectionFingerprint({ provider: connection.provider, upstream: connection.upstream, profile: codexHomeDirectory() });
if (original.binding?.catalogFingerprint !== modelCatalogFingerprint(catalog) || original.binding?.connectionFingerprint !== fingerprint)
  throw Error('The original full directory or connection differs; run a new complete qualification');
const requiredInputs = ['xiaojiu-models.service', 'xiaojiu-chat.service', 'xiaojiu-text-transport', 'codex-command', 'xiaojiu-model-qualification', 'ai.service']
  .flatMap(name => ['apps/api/src/modules/ai/' + name + '.ts', 'apps/api/dist/apps/api/src/modules/ai/' + name + '.js'])
  .concat(['apps/api/src/common/terminate-child-process.ts', 'apps/api/dist/apps/api/src/common/terminate-child-process.js',
    'packages/config/src/index.ts', 'packages/config/dist/index.js', 'packages/contracts/src/ai-models.ts', 'packages/contracts/dist/index.js',
    'scripts/qa/qualify-xiaojiu-models.cjs', 'scripts/qa/publish-xiaojiu-model-qualification.cjs']);
if (!original.sourceAndCompiledSha256 || Object.keys(original.sourceAndCompiledSha256).sort().join('\n') !== requiredInputs.sort().join('\n'))
  throw Error('The original complete fixed inputs are missing or from another qualification version');
const originalCatalogFile = path.join(directory, 'catalog.json');
if (!fs.lstatSync(originalCatalogFile).isFile() || fs.lstatSync(originalCatalogFile).isSymbolicLink() || fs.statSync(originalCatalogFile).size > 1024 * 1024)
  throw Error('Original full model catalog missing');
const originalCatalog = fs.readFileSync(originalCatalogFile);
if (hash(originalCatalog) !== original.catalogSha256 || modelCatalogFingerprint(JSON.parse(originalCatalog.toString('utf8'))) !== original.binding.catalogFingerprint)
  throw Error('Original directory snapshot differs');
for (const [file, digest] of Object.entries(original.sourceAndCompiledSha256)) {
  const target = path.resolve(root, file); if (!target.startsWith(root + path.sep) || hash(fs.readFileSync(target)) !== digest) throw Error('Original fixed input differs');
}
for (const row of original.models ?? []) if (row.status === 'passed') {
  if (typeof row.artifact !== 'string' || !/^[A-Za-z0-9._-]+\.json$/.test(row.artifact)) throw Error('Original anonymous artifact missing');
  const artifactPath = path.join(directory, row.artifact);
  if (!fs.lstatSync(artifactPath).isFile() || fs.lstatSync(artifactPath).isSymbolicLink() || fs.statSync(artifactPath).size > 1024 * 1024) throw Error('Invalid anonymous artifact');
  const artifact = fs.readFileSync(artifactPath);
  if (hash(artifact) !== row.artifactSha256) throw Error('Original anonymous artifact differs');
  const value = JSON.parse(artifact.toString('utf8')), context = JSON.parse(value.context), output = value.output;
  const keys = Object.keys(output).sort().join(','), nonce = typeof context.startToken === 'string' && context.startToken.match(/^BEGIN_([a-f0-9]{16})$/)?.[1];
  if (!nonce || context.endToken !== 'END_' + nonce || context.evidence.id !== 'anonymous-' + nonce || context.evidence.left !== 17 || context.evidence.right !== 25 ||
      keys !== 'endToken,evidenceIds,modelId,modelName,startToken,sum' || value.modelId !== row.id || output.modelId !== row.id || output.startToken !== context.startToken || output.endToken !== context.endToken ||
      output.sum !== context.evidence.left + context.evidence.right || JSON.stringify(output.evidenceIds) !== JSON.stringify([context.evidence.id]))
    throw Error('Original anonymous complete-context semantics differ');
}
const receipt = publicModelQualification(original, hash(bytes)), projected = projectModelQualification(catalog, { receipt, connectionFingerprint: fingerprint });
if (projected.textCheck?.reason || projected.textCheck?.unknown || projected.models.some(model => model.textCheck?.historical))
  throw Error('The full public projection is invalid, changed or historical');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ published: true, modelCount: receipt.models.length, passed: projected.textCheck.passed,
  failed: projected.textCheck.failed, allModelsPassed: projected.textCheck.allModelsPassed, receiptFingerprint: receipt.receiptFingerprint,
  scope: 'Completed anonymous text JSON checks only. Failed models retained; no visual, stability or physical model identity claim.' }));
