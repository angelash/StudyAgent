// The archived old-reader fixtures were captured on Windows, so their dependency lists include the prebuilt sharp
// binary for that platform (node_modules/@img/sharp-win32-x64/...). On another OS npm installs a different platform
// package and that path does not exist. The reader code under test is platform independent; only these native entries
// are allowed to be absent, and only when the platform package itself is not installed. Every other file must match.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const nativeSharp = /^node_modules\/@img\/sharp-(?:libvips-)?(?:win32|darwin|linux|linuxmusl)-[a-z0-9]+\//;

export function pinnedDependencyApplies(workspace: string, path: string) {
  const match = nativeSharp.exec(path);
  if (!match) return true;
  return existsSync(join(workspace, match[0]));
}
