import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync, symlinkSync, lstatSync } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openVerifiedLibraryMedia } from './verified-library-media';

describe('actual verified media handle bytes and lifecycle', () => {
  const qa = resolve(process.cwd(), '../../data/qa/media-handle-tests'); mkdirSync(qa, { recursive: true });
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  let handles: FileHandle[] = [];
  function fixture(size = 8192) {
    const root = mkdtempSync(join(qa, 'handle-')), path = join(root, 'original.png'), bytes = Buffer.alloc(size, 71); writeFileSync(path, bytes);
    return { root, path, bytes, expected: { path, size: bytes.length, sha256: sha(bytes) } };
  }
  function capture(after?: (handle: FileHandle) => void) {
    const original = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await original(...args); handles.push(handle); after?.(handle); return handle;
    });
  }
  afterEach(async () => { vi.restoreAllMocks(); for (const handle of handles) if (handle.fd !== -1) await handle.close(); handles = []; });
  it('reads a real suffix from the same fully hashed handle and closes after streaming', async () => {
    const f = fixture(); capture(); const file = await openVerifiedLibraryMedia(f.expected), chunks: Buffer[] = [];
    for await (const chunk of file.handle.createReadStream({ start: 8176, end: 8191, autoClose: true })) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(f.bytes.subarray(8176)); expect(handles).toHaveLength(1); expect(file.handle.fd).toBe(-1);
  });
  it('keeps the original verified bytes when the path is replaced before the later HTTP range read', async () => {
    const f = fixture(); capture(); const file = await openVerifiedLibraryMedia(f.expected);
    renameSync(f.path, join(f.root, 'original-retained.png')); writeFileSync(f.path, Buffer.alloc(f.bytes.length, 88));
    expect(sha(readFileSync(f.path))).not.toBe(f.expected.sha256); const chunks: Buffer[] = [];
    for await (const chunk of file.handle.createReadStream({ start: 7, end: 24, autoClose: true })) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(f.bytes.subarray(7, 25)); expect(handles).toHaveLength(1); expect(file.handle.fd).toBe(-1);
  });
  it('rejects a same-size different complete file even when metadata still claims the old digest', async () => {
    const f = fixture(); writeFileSync(f.path, Buffer.alloc(f.bytes.length, 88)); capture();
    await expect(openVerifiedLibraryMedia(f.expected)).rejects.toThrow('完整字节'); expect(handles).toHaveLength(1); expect(handles[0].fd).toBe(-1);
  });
  it('rejects an actual path replacement during hashing and closes the original handle', async () => {
    const f = fixture(2 * 1024 * 1024); let replaced = false;
    capture(handle => { const original = handle.createReadStream.bind(handle); vi.spyOn(handle, 'createReadStream').mockImplementation(options => {
      const stream = original(options); stream.once('data', () => { if (!replaced) { replaced = true; renameSync(f.path, join(f.root, 'retained.png')); writeFileSync(f.path, Buffer.alloc(f.bytes.length, 88)); } }); return stream;
    }); });
    await expect(openVerifiedLibraryMedia(f.expected)).rejects.toThrow('完整字节'); expect(replaced).toBe(true); expect(handles[0].fd).toBe(-1);
  });
  it('aborts a real in-progress hash and closes its handle before returning the error', async () => {
    const f = fixture(2 * 1024 * 1024), cancellation = new AbortController();
    capture(handle => { const original = handle.createReadStream.bind(handle); vi.spyOn(handle, 'createReadStream').mockImplementation(options => {
      const stream = original(options); stream.once('data', () => cancellation.abort()); return stream;
    }); });
    await expect(openVerifiedLibraryMedia(f.expected, cancellation.signal)).rejects.toThrow('完整字节'); expect(cancellation.signal.aborted).toBe(true); expect(handles[0].fd).toBe(-1);
  });
  it('rejects cancellation after the actual file open and closes without creating an unobserved aborted stream', async () => {
    const f = fixture(), cancellation = new AbortController(); capture(() => cancellation.abort());
    await expect(openVerifiedLibraryMedia(f.expected, cancellation.signal)).rejects.toThrow('完整字节');
    await new Promise<void>(done => setImmediate(done)); expect(handles).toHaveLength(1); expect(handles[0].fd).toBe(-1); expect(readFileSync(f.path)).toEqual(f.bytes);
  });
  it('observes an abort delivered during actual stream construction and rejects while preserving the original bytes', async () => {
    const f = fixture(), cancellation = new AbortController(); capture(handle => { const original = handle.createReadStream.bind(handle);
      vi.spyOn(handle, 'createReadStream').mockImplementation(options => { cancellation.abort(); return original(options); });
    });
    await expect(openVerifiedLibraryMedia(f.expected, cancellation.signal)).rejects.toThrow('完整字节');
    await new Promise<void>(done => setImmediate(done)); expect(handles).toHaveLength(1); expect(handles[0].fd).toBe(-1); expect(readFileSync(f.path)).toEqual(f.bytes);
  });
  it('refuses a real junction without opening its target or altering either generated file', async () => {
    const f = fixture(), link = join(f.root, 'link'), target = join(f.root, 'generated-target'); mkdirSync(target); writeFileSync(join(target, 'original.png'), f.bytes); symlinkSync(target, link, 'junction'); capture();
    await expect(openVerifiedLibraryMedia({ ...f.expected, path: join(link, 'original.png') })).rejects.toThrow('完整字节');
    expect(handles).toHaveLength(0); expect(lstatSync(link).isSymbolicLink()).toBe(true); expect(readFileSync(f.path)).toEqual(f.bytes); expect(readFileSync(join(target, 'original.png'))).toEqual(f.bytes);
  });
});
