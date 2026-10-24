import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type FileKind = 'source' | 'upload';
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
  if (kind === 'source' ? !/^[a-f0-9]{64}$/.test(key) : !key.startsWith('studio_upload_') || !studioFileUuid.test(key.slice('studio_upload_'.length))) {
    throw new Error('invalid_studio_file_identity');
  }
  return resolve(root, kind === 'source' ? 'studio-materials' : 'studio-uploads', 'control', key);
}
