/* Keep the local product available when a service is alive but no longer serving. */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const webUrl = process.env.STUDYAGENT_WEB_URL || 'http://127.0.0.1:3000/';
const apiUrl = process.env.STUDYAGENT_API_URL || 'http://127.0.0.1:4000/api/ready';
const intervalMs = Number(process.env.STUDYAGENT_HEALTH_INTERVAL_MS || 30000);
const failureLimit = Number(process.env.STUDYAGENT_HEALTH_FAILURE_LIMIT || 3);
const requestTimeoutMs = 10000;
let apiFailures = 0;
let webFailures = 0;
let stopping = false;

function log(message) {
  process.stdout.write(`${new Date().toISOString()} ${message}\n`);
}

async function probe(url, kind) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (kind === 'api') {
    const body = await response.json();
    const status = body?.data?.status ?? body?.status;
    if (status !== 'ready') throw new Error('API readiness payload is not ready');
  }
  return response.status;
}

function restartApp(name) {
  const result = process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `& pm2 restart '${name}' --update-env`], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30000,
    })
    : spawnSync('pm2', ['restart', name, '--update-env'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  });
  if (result.status !== 0) {
    const detail = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join(' ').trim();
    throw new Error(`Unable to restart ${name}: ${detail || `exit ${result.status}`}`);
  }
  log(`restarted ${name} after repeated health failures`);
}

async function checkOnce() {
  try {
    const status = await probe(apiUrl, 'api');
    apiFailures = 0;
    log(`API healthy: HTTP ${status}`);
  } catch (error) {
    apiFailures += 1;
    log(`API health failure ${apiFailures}/${failureLimit}: ${error.message}`);
    if (apiFailures >= failureLimit) {
      restartApp('study-agent-api');
      apiFailures = 0;
    }
  }

  try {
    const status = await probe(webUrl, 'web');
    webFailures = 0;
    log(`Web healthy: HTTP ${status}`);
  } catch (error) {
    webFailures += 1;
    log(`Web health failure ${webFailures}/${failureLimit}: ${error.message}`);
    if (webFailures >= failureLimit) {
      restartApp('study-agent-web');
      webFailures = 0;
    }
  }
}

async function main() {
  log(`watching API ${apiUrl} and Web ${webUrl}`);
  while (!stopping) {
    await checkOnce().catch(error => log(`health loop error: ${error.message}`));
    if (!stopping) await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

function stop(signal) {
  stopping = true;
  log(`received ${signal}; stopping health watcher`);
  process.exit(0);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

void main();
