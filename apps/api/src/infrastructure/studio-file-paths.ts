import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type FileKind = 'source' | 'upload' | 'project-upload' | 'project-asset';
export const studioFileUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export async function assertNoFileLinks(input: string) {
  let cursor = resolve(input);
  for (;;) {
    try {
      if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('studio_file_link_refused');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

export function studioCoordinationRoot(root: string, kind: FileKind, key: string) {
  const scopes={source:{directory:'studio-materials',prefix:''},upload:{directory:'studio-uploads',prefix:'studio_upload_'},'project-upload':{directory:'project-uploads',prefix:'project_upload_'},'project-asset':{directory:'project-assets',prefix:'project_asset_'}};
  const scope=scopes[kind];if(!scope||(kind==='source'?!/^[a-f0-9]{64}$/.test(key):!key.startsWith(scope.prefix)||!studioFileUuid.test(key.slice(scope.prefix.length))))throw new Error('invalid_studio_file_identity');
  return resolve(root,scope.directory,'control',key);
}
