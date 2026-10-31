import { ConflictException } from '@nestjs/common';
import { constants, type BigIntStats } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { assertNoFileLinks } from '../../infrastructure/studio-file-coordination';

const same = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
/** Hash the complete bytes through one handle. The caller takes ownership of
 * that same handle for the HTTP stream and closes it on every nonstream path. */
export async function openVerifiedLibraryMedia(expected: { path: string; size: number; sha256: string }, signal?: AbortSignal) {
  let handle;
  try {
    if (!Number.isSafeInteger(expected.size) || expected.size < 1 || !/^[a-f0-9]{64}$/.test(expected.sha256) || signal?.aborted) throw Error('invalid_media_identity');
    await assertNoFileLinks(expected.path); handle = await fs.open(expected.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size !== BigInt(expected.size)) throw Error('media_identity_changed');
    await assertNoFileLinks(expected.path); const originalPath = await fs.lstat(expected.path, { bigint: true });
    if (!originalPath.isFile() || !same(before, originalPath)) throw Error('media_path_changed');
    if (signal?.aborted) throw Error('media_read_aborted');
    const hash = createHash('sha256'), stream = handle.createReadStream({ autoClose: false, start: 0, end: expected.size - 1, signal }); let bytes = 0, streamFailure: Error | null = null;
    // A pre-aborted ReadStream can emit before its async iterator installs a
    // listener. Observe it immediately; the iterator still rejects the read.
    stream.on('error', error => { streamFailure = error; });
    for await (const chunk of stream) {
      bytes += chunk.length; if (bytes > expected.size) throw Error('media_size_changed'); hash.update(chunk);
    }
    if (streamFailure) throw streamFailure;
    await assertNoFileLinks(expected.path); const after = await handle.stat({ bigint: true }), currentPath = await fs.lstat(expected.path, { bigint: true });
    if (signal?.aborted || !currentPath.isFile() || bytes !== expected.size || hash.digest('hex') !== expected.sha256 || !same(before, after) || !same(before, currentPath)) throw Error('media_bytes_changed');
    return { ...expected, handle };
  } catch {
    await handle?.close();
    throw new ConflictException({ code: 'paper_media_integrity_changed', message: '原始资源的完整字节或文件身份无法核对，请先恢复原资料后重试。' });
  }
}
