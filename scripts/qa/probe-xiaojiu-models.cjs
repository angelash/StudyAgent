const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { homedir, tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const readline = require('node:readline');

const root = resolve(__dirname, '../..');
const evidencePath = join(root, 'doc/evidence/2026-10-22/xiaojiu-model-catalog-runtime.json');
const timeoutMs = Number(process.env.MODEL_PROBE_TIMEOUT_MS ?? 60_000);
const concurrency = Math.max(1, Math.min(4, Number(process.env.MODEL_PROBE_CONCURRENCY ?? 3)));
const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
const configPath = join(codexHome, 'config.toml');

function compatibleCatalog(source) {
  const catalog = JSON.parse(readFileSync(source, 'utf8'));
  for (const model of Array.isArray(catalog.models) ? catalog.models : []) {
    if (!Object.prototype.hasOwnProperty.call(model, 'supports_reasoning_summaries'))
      model.supports_reasoning_summaries = false;
    if (!Object.prototype.hasOwnProperty.call(model, 'supports_parallel_tool_calls'))
      model.supports_parallel_tool_calls = false;
  }
  return catalog;
}

function executable() {
  const configured = process.env.CODEX_COMMAND ?? 'codex';
  if (process.platform !== 'win32') return { command: configured, shell: false };
  if (configured.toLowerCase().endsWith('.exe') && existsSync(configured))
    return { command: configured, shell: false };
  const vendor = join(process.env.APPDATA ?? '', 'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor');
  if (existsSync(vendor)) for (const platform of readdirSync(vendor)) {
    const candidate = join(vendor, platform, 'bin/codex.exe');
    if (existsSync(candidate)) return { command: candidate, shell: false };
  }
  return { command: configured, shell: true };
}

function runModel(model, configOverride) {
  return new Promise((done) => {
    const started = Date.now(), invocation = executable();
    const args = ['exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--skip-git-repo-check',
      '--color', 'never', '-C', root, '-m', model.slug];
    if (configOverride) args.push('-c', configOverride);
    args.push('-');
    const child = spawn(invocation.command, args, { cwd: root, env: process.env, windowsHide: true,
      shell: invocation.shell, stdio: ['pipe', 'pipe', 'pipe'] });
    let reply = '', error = '';
    const timer = setTimeout(() => {
      error = 'timeout';
      child.kill();
    }, timeoutMs);
    child.stdin.end('只回复五个大写字母 READY，不要解释，不要调用工具。');
    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on('line', line => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'item.completed' && event.item?.type === 'agent_message' &&
            typeof event.item.text === 'string') reply = event.item.text.trim();
        if ((event.type === 'error' || event.type === 'turn.failed') && !error)
          error = String(event.error?.message ?? event.message ?? 'model error').slice(0, 500);
      } catch { /* Ignore non-JSON CLI output. */ }
    });
    const stderr = readline.createInterface({ input: child.stderr });
    stderr.on('line', line => { if (!error && line.trim()) error = line.trim().slice(0, 500); });
    child.once('error', caught => {
      clearTimeout(timer); error = caught.message;
    });
    child.once('close', code => {
      clearTimeout(timer); stdout.close(); stderr.close();
      const passed = code === 0 && /READY/i.test(reply);
      done({
        slug: model.slug,
        displayName: model.display_name,
        description: model.description ?? '',
        supportedInApi: model.supported_in_api === true,
        passed,
        latencyMs: Date.now() - started,
        responseSha256: reply ? createHash('sha256').update(reply).digest('hex') : null,
        ...(passed ? {} : { error: error || 'CLI did not return READY', exitCode: code }),
      });
    });
  });
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'study-model-catalog-'));
  const catalogPath = join(directory, 'model-catalog.json');
  try {
    if (!existsSync(configPath)) throw new Error('CODEX_HOME config.toml is unavailable');
    const config = readFileSync(configPath, 'utf8');
    const match = config.match(/^\s*model_catalog_json\s*=\s*"([^"]+)"\s*$/m);
    if (!match?.[1] || !existsSync(match[1])) throw new Error('model_catalog_json is unavailable');
    const catalog = compatibleCatalog(match[1]);
    writeFileSync(catalogPath, JSON.stringify(catalog));
    const configOverride = 'model_catalog_json="' + catalogPath.replace(/\\/g, '/') + '"';
    const models = (catalog.models ?? []).filter(model => model.supported_in_api !== false);
    if (!models.some(model => model.slug === 'claude-sonnet-5')) models.push({
      slug: 'claude-sonnet-5', display_name: 'Claude Sonnet 5',
      description: 'Anthropic Claude Sonnet 5', supported_in_api: true, input_modalities: ['text', 'image'],
    });
    const queue = [...models], results = [];
    async function consume() {
      while (queue.length) results.push(await runModel(queue.shift(), configOverride));
    }
    await Promise.all(Array.from({ length: concurrency }, () => consume()));
    results.sort((a, b) => models.findIndex(model => model.slug === a.slug) - models.findIndex(model => model.slug === b.slug));
    const value = {
      at: new Date().toISOString(),
      catalogSha256: createHash('sha256').update(readFileSync(match[1])).digest('hex'),
      modelCount: models.length,
      concurrency,
      allPassed: results.every(result => result.passed),
      passed: results.filter(result => result.passed).length,
      failed: results.filter(result => !result.passed).length,
      models: results,
      completedAt: new Date().toISOString(),
    };
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, JSON.stringify(value, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ modelCount: value.modelCount, passed: value.passed,
      failed: value.failed, allPassed: value.allPassed }) + '\n');
    if (!value.allPassed) process.exitCode = 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => {
  const value = { at: new Date().toISOString(), allPassed: false,
    error: error instanceof Error ? error.message : String(error) };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(value, null, 2) + '\n');
  console.error(value.error);
  process.exitCode = 1;
});
