import { describe, expect, it } from 'vitest';
import { mkdtemp, open, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { EventEmitter, once } from 'node:events';
import { createHash } from 'node:crypto';
import { streamVerifiedFile } from './stream-verified-file';

describe('verified descriptor HTTP ownership', () => {
  const original = Buffer.from('original bytes 0123456789'), changed = Buffer.from('replaced bytes 0123456789');
  async function fixture() {
    const qa = resolve(process.cwd(), '../../data/qa'); mkdirSync(qa, { recursive: true }); const root = await mkdtemp(join(qa, 'verified-source-stream-')), path = join(root, 'original.pdf');
    await writeFile(path, original); const handle = await open(path, 'r');
    const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, code: 200, headers: {} as Record<string, unknown>,
      setHeader(key: string, value: unknown) { this.headers[key] = value; return this; }, status(code: number) { this.code = code; return this; } });
    return { root, path, media: { handle, size: original.length, sha256: createHash('sha256').update(original).digest('hex'), mediaType: 'application/pdf' }, response };
  }
  it.each([undefined, 'bytes=2-7', 'bytes=-4', 'bytes=20-'])('streams the original descriptor after its path is replaced: %s', async range => {
    const { root, path, media, response } = await fixture(); await rename(path, join(root, 'kept-original.pdf')); await writeFile(path, changed);
    const result = await streamVerifiedFile(media, range, response as any), chunks: Buffer[] = [], closed = once(result.getStream(), 'close');
    for await (const chunk of result.getStream()) chunks.push(chunk); await closed;
    const expected = range === 'bytes=2-7' ? original.subarray(2, 8) : range === 'bytes=-4' ? original.subarray(-4) : range === 'bytes=20-' ? original.subarray(20) : original;
    expect(Buffer.concat(chunks)).toEqual(expected); expect(response.code).toBe(range ? 206 : 200);
    expect(response.headers.ETag).toBe('"' + media.sha256 + '"'); expect(response.headers['Cache-Control']).toBe('private, no-store'); expect(media.handle.fd).toBe(-1);
  });
  it.each(['bytes=', 'bytes=1-0', 'bytes=9999-', 'bytes=-0', 'bytes=0-1,4-5'])('closes the descriptor before returning an invalid range: %s', async range => {
    const { media, response } = await fixture(); await streamVerifiedFile(media, range, response as any);
    expect(response.code).toBe(416); expect(media.handle.fd).toBe(-1); expect(response.headers['Content-Range']).toBe(`bytes */${original.length}`);
  });
  it('closes a stream disconnected before the response is consumed', async () => {
    const { media, response } = await fixture(), result = await streamVerifiedFile(media, undefined, response as any), closed = once(result.getStream(), 'close');
    response.emit('close'); await closed; expect(media.handle.fd).toBe(-1); expect(response.listenerCount('close')).toBe(0);
  });
  it('handles a pre-aborted stream without an unobserved native error', async () => {
    const { media, response } = await fixture(), controller = new AbortController(); controller.abort();
    const result = await streamVerifiedFile(media, undefined, response as any, controller.signal);
    await new Promise<void>(resolve => result.getStream().once('close', resolve)); expect(media.handle.fd).toBe(-1);
  });
});
