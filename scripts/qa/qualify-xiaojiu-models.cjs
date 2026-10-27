// Current application path, anonymous text only. Each invocation owns a new, immutable output directory.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), outputIndex = args.indexOf('--output'), modelIndex = args.indexOf('--model');
if (args.includes('--help')) {
  console.log('node --env-file=.env scripts/qa/qualify-xiaojiu-models.cjs --output <new-directory> [--model <id>]'); process.exit(0);
}
if (outputIndex < 0 || !args[outputIndex + 1]) throw Error('An explicit new --output directory is required');
const destination = path.resolve(root, args[outputIndex + 1]);
if (!destination.startsWith(root + path.sep)) throw Error('Output must stay inside this worktree');
if (fs.existsSync(destination)) throw Error('Original qualification directory already exists; choose a new one');
const requestedModel = modelIndex < 0 ? null : args[modelIndex + 1];
if (modelIndex >= 0 && !requestedModel) throw Error('--model requires an exact catalog ID');
const parallel = Number(process.env.MODEL_QUALIFICATION_CONCURRENCY ?? 2);
if (!Number.isInteger(parallel) || parallel < 1 || parallel > 3) throw Error('Concurrency must be 1, 2 or 3');
// This small-call budget is explicit in every receipt. Do not change the real application's configuration.
process.env.XIAOJIU_CHAT_TIMEOUT_MS = '60000';
const modelDeadlineMs = 135000;
require('reflect-metadata');
const load = module => require(path.join(root, 'apps/api/dist/apps/api/src', module + '.js'));
const { XiaojiuModelsService } = load('modules/ai/xiaojiu-models.service');
const { XiaojiuChatService } = load('modules/ai/xiaojiu-chat.service');
const models = new XiaojiuModelsService(), provider = new XiaojiuChatService(models);
if (!provider.enabled) throw Error('The current application Xiaojiu connection is disabled');
const catalog = models.catalog();
const selected = requestedModel ? [models.resolve(requestedModel)] : catalog.models;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceFiles = ['xiaojiu-models.service', 'xiaojiu-chat.service', 'xiaojiu-text-transport', 'codex-command'];
const inputs = {};
for (const name of sourceFiles) for (const file of ['apps/api/src/modules/ai/' + name + '.ts', 'apps/api/dist/apps/api/src/modules/ai/' + name + '.js'])
  inputs[file] = sha(fs.readFileSync(path.join(root, file)));
for (const file of ['apps/api/src/common/terminate-child-process.ts', 'apps/api/dist/apps/api/src/common/terminate-child-process.js'])
  inputs[file] = sha(fs.readFileSync(path.join(root, file)));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (execFileSync('git', ['status', '--porcelain', '--', 'apps/api/src/modules/ai', 'apps/api/src/common/terminate-child-process.ts', 'scripts/qa/qualify-xiaojiu-models.cjs'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim())
  throw Error('Commit the qualified source and runner before the real attempt');
fs.mkdirSync(destination, { recursive: true });
const catalogBytes = Buffer.from(JSON.stringify(catalog, null, 2) + '\n');
fs.writeFileSync(path.join(destination, 'catalog.json'), catalogBytes, { flag: 'wx' });
const receipt = { version: 1, revision, startedAt: new Date().toISOString(), status: 'running', passed: false,
  scope: 'Anonymous text and structured JSON through the actual application XiaojiuChatService and original configured CLI provider. Attempts count actual application CLI starts, not internal CLI HTTP retries. No visual, teaching-quality, stability-rate or physical upstream model identity claim.',
  selection: requestedModel ? 'one-explicit-model' : 'complete-current-application-catalog',
  defaultModel: catalog.defaultModel, catalogSha256: sha(catalogBytes), modelCount: selected.length,
  concurrency: parallel, cliAttemptTimeoutMs: 60000, perModelDeadlineMs: modelDeadlineMs, sourceAndCompiledSha256: inputs,
  models: selected.map(model => ({ id: model.id, label: model.label, declaredInputModalities: model.inputModalities,
    visualVerified: false, status: 'pending', attempts: [] })) };
const active = new Set(); let interrupted = false;
function save() { fs.writeFileSync(path.join(destination, 'progress.json'), JSON.stringify(receipt, null, 2) + '\n'); }
function interrupt() { interrupted = true; for (const controller of active) controller.abort(); }
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
const schema = { type: 'object', properties: { startToken: { type: 'string' }, endToken: { type: 'string' },
  sum: { type: 'integer' }, evidenceIds: { type: 'array', items: { type: 'string' } } },
  required: ['startToken', 'endToken', 'sum', 'evidenceIds'], additionalProperties: false };
async function probe(row) {
  const nonce = crypto.randomBytes(8).toString('hex'), begin = 'BEGIN_' + nonce, end = 'END_' + nonce;
  const evidence = 'anonymous-' + nonce;
  const context = JSON.stringify({ startToken: begin, evidence: { id: evidence, left: 17, right: 25 }, endToken: end });
  const controller = new AbortController(); active.add(controller);
  const deadline = setTimeout(() => controller.abort(), modelDeadlineMs); deadline.unref();
  row.startedAt = new Date().toISOString(); row.status = 'running'; save();
  const started = Date.now();
  try {
    const value = await provider.structured({ modelId: row.id, signal: controller.signal,
      system: '这是匿名文字通路检查。只依据学习证据返回完整JSON，不调用工具。', context, history: [],
      message: '复制startToken和endToken；sum为left与right之和；evidenceIds仅包含这份证据的id。' }, schema, value => {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          Object.keys(value).sort().join(',') !== 'endToken,evidenceIds,startToken,sum' ||
          value.startToken !== begin || value.endToken !== end || value.sum !== 42 ||
          !Array.isArray(value.evidenceIds) || value.evidenceIds.length !== 1 || value.evidenceIds[0] !== evidence)
        throw Error('Anonymous structure or complete-context semantics did not match');
      return value;
    }, true, event => { row.attempts.push(event); save(); });
    row.status = 'passed'; row.responseSha256 = sha(Buffer.from(JSON.stringify(value)));
    // Anonymous challenge and checked output are reviewable; provider credentials and raw errors never enter artifacts.
    const file = row.id.replace(/[^A-Za-z0-9._-]/g, '_') + '-' + sha(Buffer.from(row.id)).slice(0, 10) + '.json';
    const bytes = Buffer.from(JSON.stringify({ modelId: row.id, context, output: value }, null, 2) + '\n');
    fs.writeFileSync(path.join(destination, file), bytes, { flag: 'wx' }); row.artifact = file; row.artifactSha256 = sha(bytes);
  } catch {
    row.status = 'failed';
    row.failureKind = interrupted ? 'run-interrupted' : controller.signal.aborted ? 'deadline' :
      row.attempts.at(-1)?.status === 'succeeded' ? 'artifact-write-failure' : row.attempts.at(-1)?.failureKind ?? 'application-preflight';
  } finally {
    clearTimeout(deadline); active.delete(controller); row.elapsedMs = Date.now() - started;
    row.completedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ modelId: row.id, status: row.status, attempts: row.attempts.filter(a => a.status === 'started').length,
      elapsedMs: row.elapsedMs, ...(row.failureKind ? { failureKind: row.failureKind } : {}) }));
  }
}
async function main() {
  save(); let next = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, selected.length) }, async () => {
    while (!interrupted && next < receipt.models.length) await probe(receipt.models[next++]);
  }));
  for (const [file, digest] of Object.entries(inputs)) if (sha(fs.readFileSync(path.join(root, file))) !== digest)
    throw Error('Fixed model source or compiled input changed during qualification');
  receipt.status = interrupted ? 'interrupted' : 'complete'; receipt.completedAt = new Date().toISOString();
  receipt.passedCount = receipt.models.filter(model => model.status === 'passed').length;
  receipt.failedCount = receipt.models.filter(model => model.status === 'failed').length;
  receipt.unmeasuredCount = receipt.models.filter(model => model.status === 'pending').length;
  receipt.firstAttemptPassedCount = receipt.models.filter(model => model.status === 'passed' && model.attempts.filter(a => a.status === 'started').length === 1).length;
  receipt.passed = !interrupted && receipt.passedCount === selected.length;
  for (const row of receipt.models.filter(model => model.status !== 'pending')) {
    const starts = row.attempts.filter(a => a.status === 'started').length;
    if ((!starts && row.failureKind !== 'application-preflight') || starts > 2 || row.attempts.filter(a => a.status !== 'started').length !== starts)
      throw Error('An original CLI attempt was not accounted for');
  }
  fs.writeFileSync(path.join(destination, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  save(); console.log(JSON.stringify({ status: receipt.status, passed: receipt.passed, passedCount: receipt.passedCount,
    failedCount: receipt.failedCount, firstAttemptPassedCount: receipt.firstAttemptPassedCount }));
  if (!receipt.passed) process.exitCode = 1;
}
main().catch(() => { interrupt(); receipt.status = 'failed'; receipt.passed = false; receipt.failureKind = 'runner-or-integrity-failure';
  save(); console.error('Qualification runner or fixed-input integrity failed; original progress retained.'); process.exitCode = 1;
}).finally(() => { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); });
