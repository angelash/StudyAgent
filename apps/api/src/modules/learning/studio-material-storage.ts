import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function studioMaterialRoot() {
  return process.env.STUDY_DATA_DIR ??
    resolve(process.cwd().replace(/\\/g, '/').endsWith('/apps/api') ? '../..' : '.', 'data');
}

export function studioMaterialFile(sha256: string) {
  return resolve(studioMaterialRoot(), 'studio-materials', sha256 + '.pdf');
}

export function studioMaterialCache(sha256: string) {
  return resolve(studioMaterialRoot(), 'studio-materials', 'processed', sha256);
}

export async function persistStudioMaterial(sha256: string, bytes: Buffer) {
  const path = studioMaterialFile(sha256);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const existing = await readFile(path);
  if (createHash('sha256').update(existing).digest('hex') !== sha256) {
    throw new Error('stored_material_checksum_mismatch');
  }
  return path;
}
