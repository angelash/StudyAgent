import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { assertNoFileLinks, studioFileUuid } from './studio-file-paths';

export type StudioMarkerPurpose = 'lease' | 'purge' | 'revoked';
export type StudioMarkerPhase = 'created' | 'written' | 'synced' | 'published' | 'cleaned';
export type StudioMarkerPhaseHook = (phase: StudioMarkerPhase) => Promise<void>;

/** Shared with Python and the independent read-only audit; do not infer a PID from JSON fragments. */
export function parseStudioMarkerStagingName(name: string) {
  const match = /^(lease|purge|revoked)-([1-9]\d*)-([a-f0-9-]+)\.pending$/.exec(name);
  if (!match || !studioFileUuid.test(match[3])) return null;
  const pid = Number(match[2]);
  return Number.isSafeInteger(pid) ? { purpose: match[1] as StudioMarkerPurpose, pid, nonce: match[3] } : null;
}

export async function releaseOwnStudioMarker(file: string, value: Record<string, unknown>) {
  await assertNoFileLinks(file);
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size > 4096) throw new Error('invalid_studio_file_marker');
    const current = JSON.parse(await fs.readFile(file, 'utf8'));
    if (current.nonce !== value.nonce || current.pid !== value.pid || current.format !== value.format) {
      throw new Error('studio_file_marker_changed');
    }
    await fs.unlink(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Same-volume link() publishes a complete inode exclusively. No rename-overwrite or copy fallback. */
export async function publishStudioMarker(control: string, file: string, purpose: StudioMarkerPurpose,
  value: Record<string, unknown> & { nonce: string; pid: number }, afterPhase?: StudioMarkerPhaseHook) {
  if (!studioFileUuid.test(value.nonce) || value.pid !== process.pid) throw new Error('invalid_studio_marker_producer');
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > 4096) throw new Error('invalid_studio_file_marker');
  const staging = resolve(control, 'staging', `${purpose}-${value.pid}-${value.nonce}.pending`);
  await assertNoFileLinks(staging);
  await assertNoFileLinks(file);
  await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await fs.mkdir(dirname(staging), { recursive: true, mode: 0o700 });
  await assertNoFileLinks(staging);
  await assertNoFileLinks(file);
  let owned = false, published = false;
  try {
    const handle = await fs.open(staging, 'wx', 0o600);
    owned = true;
    try {
      await afterPhase?.('created');
      await handle.writeFile(bytes);
      await afterPhase?.('written');
      await handle.sync();
    } finally { await handle.close(); }
    await afterPhase?.('synced');
    await assertNoFileLinks(file);
    await fs.link(staging, file);
    published = true;
    await afterPhase?.('published');
    await fs.unlink(staging);
    owned = false;
    await afterPhase?.('cleaned');
  } catch (error) {
    // The caller never received this ephemeral fence. A revocation, however, is irreversible.
    try {
      if (published && purpose !== 'revoked') await releaseOwnStudioMarker(file, value);
    } finally {
      if (owned) {
        await assertNoFileLinks(staging);
        await fs.unlink(staging).catch(cleanup => { if (cleanup.code !== 'ENOENT') throw cleanup; });
      }
    }
    throw error;
  }
}
