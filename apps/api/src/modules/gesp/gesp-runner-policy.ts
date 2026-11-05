/**
 * Untrusted student C++ runs only where an operator explicitly enabled it.
 * STUDY_GESP_CODE_RUNNER=enabled|disabled; production defaults to disabled until the
 * runner is on an isolated host with a hardened sandbox.
 */
export function gespCodeRunnerEnabled(env: NodeJS.ProcessEnv = process.env) {
  const setting = env.STUDY_GESP_CODE_RUNNER?.trim().toLowerCase();
  if (setting === 'enabled') return true;
  if (setting === 'disabled') return false;
  return env.NODE_ENV !== 'production';
}

const runnerEnvironmentNames = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'windir', 'ComSpec', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'HOME', 'LANG', 'LC_ALL', 'STUDY_GESP_WSL_DISTRO'];

/** The runner gets only what it needs to start WSL/Linux tools, never API secrets. */
export function gespRunnerEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(runnerEnvironmentNames.filter(name => env[name] !== undefined).map(name => [name, env[name]]));
}
