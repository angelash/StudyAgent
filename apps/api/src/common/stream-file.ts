import { StreamableFile } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';

export function streamFile(media: { path: string; mediaType: string; size: number; sha256: string; release?:()=>Promise<void>; disposition?:string }, range: string | undefined, response: Response) {
  response.setHeader('ETag', `"${media.sha256}"`); response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  let start = 0, end = media.size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) start = -1;
    else if (!match[1]) { const length = Number(match[2]); start = length > 0 && Number.isSafeInteger(length) ? Math.max(0, media.size - length) : -1; }
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= media.size) {
      response.status(416).setHeader('Content-Range', `bytes */${media.size}`); void media.release?.().catch(()=>{}); return new StreamableFile(Buffer.alloc(0), { type: media.mediaType });
    }
    response.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${media.size}`);
  }
  const stream=createReadStream(media.path,{start,end});
  if(media.release){let released=false;const release=()=>{if(released)return;released=true;response.off('close',disconnect);void media.release!().catch(()=>{});};const disconnect=()=>{stream.destroy();};stream.once('close',release);stream.once('error',release);response.once('close',disconnect);}
  if(response.destroyed||response.writableEnded)stream.destroy();
  return new StreamableFile(stream, { type: media.mediaType, length: end - start + 1, disposition: media.disposition??'inline' });
}
