#!/usr/bin/env node
// Executes one untrusted C++ submission in isolated WSL/Linux namespaces.
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LIMITS = Object.freeze({ sourceBytes: 64 * 1024, tests: 40, inputBytes: 4 * 1024, outputBytes: 64 * 1024,
  compileSeconds: 12, runSeconds: 2, cpuSeconds: 3, virtualMemoryKb: 256 * 1024, compileMemoryKb: 512 * 1024,
  compileFileBytesKb: 32 * 1024, processes: 32, fileBytesKb: 1024, openFiles: 64 });
const WINDOWS = process.platform === 'win32';
const hash = value => createHash('sha256').update(value).digest('hex');
const runtime = (env, args, options = {}) => WINDOWS
  ? spawnSync('wsl.exe', ['-d', env.distribution, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30_000, ...options })
  : spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 30_000, ...options });
const runtimePath = (windowsPath) => {
  if (!WINDOWS) return windowsPath;
  const matched = /^([A-Za-z]):\\(.*)$/.exec(windowsPath);
  if (!matched) throw new Error('Unable to map temporary directory into WSL');
  return `/mnt/${matched[1].toLowerCase()}/${matched[2].replaceAll('\\', '/')}`;
};
const copyToRuntime = (env, source, destination) => WINDOWS
  ? runtime(env, ['cp', source, destination])
  : (() => { try { fs.copyFileSync(source, destination); fs.chmodSync(destination, 0o600); return { status: 0, stdout: '', stderr: '' }; }
    catch (error) { return { status: 1, stdout: '', stderr: error.message }; } })();
const removeRuntime = (env, target) => runtime(env, WINDOWS ? ['rm', '-rf', target] : ['rm', '-rf', target]);
const safeOutput = value => String(value ?? '').slice(0, LIMITS.outputBytes);
function settings(overrides = {}) {
  const env = { distribution: process.env.STUDY_GESP_WSL_DISTRO || 'Ubuntu', compileTimeoutMs: 25_000, cleanup: true, ...overrides };
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(env.distribution)) throw new Error('Invalid WSL distribution name');
  return env;
}
function preflight(env) {
  const probe = runtime(env, ['bash', '-lc', 'command -v g++ >/dev/null && command -v timeout >/dev/null && command -v unshare >/dev/null && g++ --version | head -1']);
  if (probe.status !== 0 || !probe.stdout.trim()) throw new Error('GESP isolated runner prerequisites are unavailable');
  return probe.stdout.trim();
}
function isolatedBash(env, payloadPath, command, timeout) {
  if (!/^\/tmp\/study-gesp-(?:case-)?[A-Za-z0-9]+$/.test(payloadPath)) throw new Error('Invalid isolated payload path');
  const script = [
    'set -eu',
    'mkdir -p /dev/shm/study-agent-gesp-work',
    'mount --make-rprivate /',
    `mount --bind '${payloadPath}' /dev/shm/study-agent-gesp-work`,
    'mount -t tmpfs tmpfs /mnt',
    'mount -t tmpfs tmpfs /home',
    'mount -t tmpfs tmpfs /root',
    'mount -t tmpfs tmpfs /tmp',
    'mount -t tmpfs tmpfs /var/tmp',
    `trap 'code=$?; cd /; umount /dev/shm/study-agent-gesp-work 2>/dev/null || true; rmdir /dev/shm/study-agent-gesp-work 2>/dev/null || true; exit $code' EXIT`,
    'cd /dev/shm/study-agent-gesp-work',
    command,
  ].join('\n');
  const args = ['unshare', '--user', '--map-root-user', '--mount', '--pid', '--fork', '--net', '--uts', '--ipc', 'bash', '-s'];
  return WINDOWS ? spawnSync('wsl.exe', ['-d', env.distribution, ...args], { input: script, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: LIMITS.outputBytes * 4 })
    : spawnSync(args[0], args.slice(1), { input: script, encoding: 'utf8', timeout, maxBuffer: LIMITS.outputBytes * 4 });
}
function runSubmission(raw, overrides = {}) {
  const env = settings(overrides), source = typeof raw?.source === 'string' ? raw.source : '', tests = Array.isArray(raw?.tests) ? raw.tests : [];
  if (!source.trim()) throw new Error('Source is required'); if (Buffer.byteLength(source) > LIMITS.sourceBytes) throw new Error('Source exceeds limit');
  if (!tests.length || tests.length > LIMITS.tests) throw new Error('Between one and forty tests are required');
  for (const test of tests) if (typeof test.input !== 'string' || typeof test.expected !== 'string' || Buffer.byteLength(test.input) > LIMITS.inputBytes ||
    Buffer.byteLength(test.expected) > LIMITS.outputBytes) throw new Error('Invalid test case or boundary');
  const toolchain = preflight(env), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-gesp-run-')), receipt = {
    format: 'gesp-isolated-run-v2', sourceSha256: hash(source), testsSha256: hash(JSON.stringify(tests)), toolchain,
    host: WINDOWS ? `wsl:${env.distribution}` : 'linux-native', limits: LIMITS,
    compile: { passed: false }, tests: [], passed: false };
  let wslTemporary;
  try {
    fs.writeFileSync(path.join(directory, 'program.cpp'), source, { mode: 0o600 });
    const mapped = runtimePath(directory), made = runtime(env, ['mktemp', '-d', '/tmp/study-gesp-XXXXXX']);
    if (made.status !== 0 || !/^\/tmp\/study-gesp-[A-Za-z0-9]+$/.test(made.stdout.trim())) throw new Error('Unable to create runner directory');
    wslTemporary = made.stdout.trim();
    const copied = copyToRuntime(env, `${mapped}/program.cpp`, `${wslTemporary}/program.cpp`); if (copied.status !== 0) throw new Error('Unable to stage source');
    const compile = isolatedBash(env, wslTemporary,
      `ulimit -t ${LIMITS.compileSeconds}; ulimit -v ${LIMITS.compileMemoryKb}; ulimit -f ${LIMITS.compileFileBytesKb}; ulimit -n ${LIMITS.openFiles}; ulimit -u ${LIMITS.processes}; ` +
      `set +e; timeout --kill-after=1 ${LIMITS.compileSeconds}s g++ -std=c++17 -O2 -pipe -Wall -Wextra -static -fmax-errors=20 -o program program.cpp 2>compile.stderr >compile.stdout; exit $?`, env.compileTimeoutMs);
    const compileStdout = runtime(env, ['cat', `${wslTemporary}/compile.stdout`]).stdout, compileStderr = runtime(env, ['cat', `${wslTemporary}/compile.stderr`]).stdout;
    receipt.compile = { passed: compile.status === 0, exitCode: Number.isInteger(compile.status) ? compile.status : null,
      stdout: safeOutput(compileStdout), stderr: safeOutput(compileStderr || compile.stderr), harnessExitCode: compile.status,
      timedOut: compile.error?.code === 'ETIMEDOUT' };
    if (!receipt.compile.passed) return receipt;
    const saved = `${wslTemporary}/program.saved`; const save = runtime(env, ['cp', `${wslTemporary}/program`, saved]); if (save.status !== 0) throw new Error('Unable to preserve binary');
    runtime(env, ['rm', '-f', `${wslTemporary}/program.cpp`, `${wslTemporary}/program`, `${wslTemporary}/compile.stdout`, `${wslTemporary}/compile.stderr`]);
    for (const [index, test] of tests.entries()) {
      const caseDir = fs.mkdtempSync(path.join(directory, `case-${index}-`)), caseMapped = runtimePath(caseDir);
      fs.writeFileSync(path.join(caseDir, 'input.txt'), test.input, { mode: 0o600 });
      const caseMade = runtime(env, ['mktemp', '-d', '/tmp/study-gesp-case-XXXXXX']), caseWsl = caseMade.stdout.trim();
      runtime(env, ['cp', saved, `${caseWsl}/program`]); copyToRuntime(env, `${caseMapped}/input.txt`, `${caseWsl}/input.txt`); runtime(env, ['chmod', '500', `${caseWsl}/program`]);
      const started = Date.now(), run = isolatedBash(env, caseWsl,
        `ulimit -t ${LIMITS.cpuSeconds}; ulimit -v ${LIMITS.virtualMemoryKb}; ulimit -f ${LIMITS.fileBytesKb}; ulimit -n ${LIMITS.openFiles}; ulimit -u ${LIMITS.processes}; ` +
        `set +e; timeout --kill-after=1 ${LIMITS.runSeconds}s ./program <input.txt >stdout.txt 2>stderr.txt; exit $?`, (LIMITS.runSeconds + 3) * 1000);
      const runStatus = Number.isInteger(run.status) ? run.status : null, stdout = safeOutput(runtime(env, ['cat', `${caseWsl}/stdout.txt`]).stdout);
      const stderr = safeOutput(runtime(env, ['cat', `${caseWsl}/stderr.txt`]).stdout), normalized = stdout.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
      const expected = test.expected.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
      const durationMs = Date.now() - started, timedOut = runStatus === 124 || (runStatus === null && durationMs >= LIMITS.runSeconds * 1000);
      receipt.tests.push({ index, passed: run.status === 0 && runStatus === 0 && normalized === expected,
        status: run.error?.code === 'ETIMEDOUT' ? 'harness_timeout' : timedOut ? 'timeout' : run.status !== 0 ? 'runtime_error' :
          runStatus !== 0 ? 'runtime_error' : normalized !== expected ? 'wrong_output' : 'passed',
        exitCode: Number.isInteger(runStatus) ? runStatus : null, durationMs, stdout, stderr,
        harnessStderr: safeOutput(run.stderr) });
      fs.rmSync(caseDir, { recursive: true, force: true }); removeRuntime(env, caseWsl);
    }
    receipt.passed = receipt.compile.passed && receipt.tests.length === tests.length && receipt.tests.every(test => test.passed);
    return receipt;
  } finally {
    if (env.cleanup) { fs.rmSync(directory, { recursive: true, force: true }); if (wslTemporary && /^\/tmp\/study-gesp-[A-Za-z0-9]+$/.test(wslTemporary)) removeRuntime(env, wslTemporary); }
  }
}
if (require.main === module) {
  const chunks = []; process.stdin.on('data', chunk => chunks.push(chunk)); process.stdin.on('end', () => {
    try { const receipt = runSubmission(JSON.parse(Buffer.concat(chunks).toString('utf8')), { cleanup: process.env.STUDY_GESP_KEEP_TEMP !== 'true' }); process.stdout.write(JSON.stringify(receipt, null, 2) + '\n'); if (!receipt.passed) process.exitCode = 1; }
    catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
  });
}
module.exports = { LIMITS, isolatedBash, preflight, runSubmission };
