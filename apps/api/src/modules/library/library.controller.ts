import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, StreamableFile, UseGuards, BadRequestException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import type { Response } from 'express';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { LibraryService } from './library.service';

@UseGuards(AuthGuard)
@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}
  @Get('overview') overview(@Req() req: AuthenticatedRequest) { return this.library.overview(req.user); }
  @Get('facets') facets() { return this.library.facets(); }
  @Get('papers') search(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.library.search(req.user, query); }
  @Get('papers/:id') preview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('answers') answers?: string) {
    return this.library.preview(req.user, id, answers === 'true');
  }
  @Post('papers/:id/publication') publish(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.library.publish(req.user, id, input); }
  @Patch('papers/:id/bookmark') bookmark(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.library.bookmark(req.user, id, input); }
  @Get('media')
  media(@Req() req: AuthenticatedRequest, @Query('paperId') id: string, @Query('url') url: string,
    @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response) {
    if (typeof id !== 'string' || typeof url !== 'string' || url.length > 3000) throw new BadRequestException('资源参数有误');
    const media = this.library.media(req.user, id, url);
    const type = ({ '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' } as Record<string, string>)[extname(media.path).toLowerCase()];
    if (!type) throw new BadRequestException('暂不支持此媒体格式');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', `"${media.sha256}"`);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    let start = 0, end = media.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        if (!match[1]) start = Math.max(0, media.size - Number(match[2]));
        else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      } else { start = -1; }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= media.size) {
        response.status(416).setHeader('Content-Range', `bytes */${media.size}`);
        return new StreamableFile(Buffer.alloc(0), { type });
      }
      response.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${media.size}`);
    }
    return new StreamableFile(createReadStream(media.path, { start, end }), { type, length: end - start + 1, disposition: 'inline' });
  }
}
