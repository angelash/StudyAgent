import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

type TarEntry = { name: string; size: number; bytes?: Buffer; path?: string };
/** POSIX ustar with generated ASCII names. Individual media entries are bounded far below the 8 GiB field limit. */
export function tarArchive(entries: TarEntry[], at: string) {
  const mtime = Math.max(0, Math.floor(Date.parse(at) / 1000));
  async function* generate() {
    for (const entry of entries) {
      if (!/^[a-zA-Z0-9_.\/-]+$/.test(entry.name) || entry.name.length > 99 || entry.name.startsWith('/') || entry.name.split('/').some(part => !part || part === '.' || part === '..') ||
        !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 0o77777777777) throw new Error('invalid_archive_entry');
      const header = Buffer.alloc(512);
      const field = (offset: number, length: number, value: number) => header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
      header.write(entry.name, 0, 100, 'ascii'); field(100, 8, 0o600); field(108, 8, 0); field(116, 8, 0); field(124, 12, entry.size); field(136, 12, mtime);
      header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii');
      header.write(header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
      yield header;
      let written = 0;
      if (entry.bytes) { written = entry.bytes.length; yield entry.bytes; }
      else if (entry.path) { for await (const chunk of createReadStream(entry.path)) { written += chunk.length; if (written > entry.size) throw new Error('archive_source_changed'); yield chunk; } }
      if (written !== entry.size) throw new Error('archive_source_changed');
      if (written % 512) yield Buffer.alloc(512 - written % 512);
    }
    yield Buffer.alloc(1024);
  }
  return Readable.from(generate());
}
