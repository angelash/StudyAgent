import { existsSync, readdirSync } from 'node:fs';
import { delimiter, isAbsolute, resolve } from 'node:path';

type Invocation = { command: string; shell: boolean };

function windowsCandidates(command: string) {
  const candidates: string[] = [];
  if (isAbsolute(command)) candidates.push(command);
  const appData = process.env.APPDATA;
  if (appData && command === 'codex') {
    const vendor = resolve(appData, 'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor');
    if (existsSync(vendor)) {
      for (const platform of readdirSync(vendor)) {
        const executable = resolve(vendor, platform, 'bin/codex.exe');
        if (existsSync(executable)) candidates.push(executable);
      }
    }
  }
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    if (!command.includes('.')) candidates.push(resolve(directory, command + '.exe'));
    candidates.push(resolve(directory, command));
  }
  return candidates;
}

export function resolveCodexInvocation(command: string): Invocation {
  if (process.platform !== 'win32') return { command, shell: false };
  const executable = windowsCandidates(command).find(candidate => /\.exe$/i.test(candidate) && existsSync(candidate));
  if (executable) return { command: executable, shell: false };
  return { command, shell: true };
}
