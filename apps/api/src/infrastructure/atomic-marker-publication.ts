import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { assertNoFileLinks, studioFileUuid } from './studio-file-paths';

export type AtomicMarkerPhase = 'created' | 'written' | 'synced' | 'published' | 'cleaned';
export type AtomicMarkerPhaseHook = (phase: AtomicMarkerPhase) => Promise<void>;
export type AtomicMarkerValue = Record<string, unknown> & { nonce: string; pid: number };

export async function releaseOwnAtomicMarker(file: string, value: Record<string, unknown>) {
  await assertNoFileLinks(file);
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size > 4096) throw new Error('invalid_atomic_marker');
    const current = JSON.parse(await fs.readFile(file, 'utf8'));
    if (current.nonce !== value.nonce || current.pid !== value.pid || current.format !== value.format) throw new Error('atomic_marker_changed');
    await fs.unlink(file);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

/** Publish one complete inode exclusively. Protocol-specific readers own the purpose/name rules. */
export async function publishAtomicMarker(input: { directory: string; file: string; purpose: string; value: AtomicMarkerValue; persistent?: boolean; afterPhase?: AtomicMarkerPhaseHook }) {
  const { directory, file, purpose, value, afterPhase } = input;
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(purpose) || !studioFileUuid.test(value.nonce) || value.pid !== process.pid) throw new Error('invalid_atomic_marker_producer');
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > 4096) throw new Error('invalid_atomic_marker');
  const staging = resolve(directory, 'staging', `${purpose}-${value.pid}-${value.nonce}.pending`);
  await assertNoFileLinks(staging); await assertNoFileLinks(file);
  await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await fs.mkdir(dirname(staging), { recursive: true, mode: 0o700 });
  await assertNoFileLinks(staging); await assertNoFileLinks(file);
  let owned = false, published = false;
  try {
    const handle = await fs.open(staging, 'wx', 0o600); owned = true;
    try {
      await afterPhase?.('created'); await handle.writeFile(bytes); await afterPhase?.('written'); await handle.sync();
    } finally { await handle.close(); }
    await afterPhase?.('synced'); await assertNoFileLinks(file);
    await fs.link(staging, file); published = true; await afterPhase?.('published');
    await fs.unlink(staging); owned = false; await afterPhase?.('cleaned');
  } catch (error) {
    try { if (published && !input.persistent) await releaseOwnAtomicMarker(file, value); }
    finally {
      if (owned) { await assertNoFileLinks(staging); await fs.unlink(staging).catch(cleanup => { if (cleanup.code !== 'ENOENT') throw cleanup; }); }
    }
    throw error;
  }
}
