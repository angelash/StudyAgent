import { Controller, Get, Headers, Param, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PaperExportService } from './paper-export.service';
@UseGuards(AuthGuard)
@Controller('library/exports')
export class PaperExportArtifactController {
  constructor(private readonly exports: PaperExportService) {}
  @Get(':id/files/:book/:format')
  async file(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Param('book') book: string, @Param('format') format: string,
    @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response) {
    const abort = new AbortController(); response.once('close', () => abort.abort());
    const file = await this.exports.file(request, id, book, format, abort.signal); let owns = true;
    try {
      response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('ETag', '"' + file.sha256 + '"'); response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      let start = 0, end = file.size - 1;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2])) { if (!match[1]) start = Math.max(0, file.size - Number(match[2])); else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); } }
        else start = -1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= file.size) {
          response.status(416).setHeader('Content-Range', 'bytes */' + file.size); return new StreamableFile(Buffer.alloc(0), { type: file.type });
        }
        response.status(206).setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + file.size);
      }
      const stream = file.handle.createReadStream({ start, end, autoClose: true, signal: abort.signal });
      const close = () => stream.destroy(); response.once('close', close); stream.once('close', () => { response.off('close', close); void file.release().catch(() => {}); });
      owns = false; return new StreamableFile(stream, { type: file.type, length: end - start + 1, disposition: file.disposition });
    } finally { if (owns) { await file.handle.close(); await file.release(); } }
  }
}
