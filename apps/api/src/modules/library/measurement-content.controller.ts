import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import type { Response } from 'express';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { MeasurementContentService } from './measurement-content.service';

@Controller('measurement-content')
@UseGuards(AuthGuard)
export class MeasurementContentController {
  constructor(private readonly content: MeasurementContentService) {}
  @Get('candidates') list(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.content.list(req.user, query); }
  @Post('candidates') stage(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.content.stage(req.user, body); }
  @Get('candidates/:id') detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.content.detail(req.user, id); }
  @Post('candidates/:id/draft') save(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.content.save(req.user, id, body); }
  @Post('candidates/:id/reviews') review(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.content.review(req.user, id, body); }
  @Post('candidates/:id/publish') publish(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.content.publish(req.user, id, body); }
  @Post('candidates/:id/withdraw') withdraw(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.content.withdraw(req.user, id, body); }
  @Get('candidates/:id/media/:index')
  media(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('index') index: string,
    @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response) {
    if (!/^\d{1,6}$/.test(index)) throw new BadRequestException('资源索引不正确');
    const media = this.content.media(req.user, id, Number(index));
    const type = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
      '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg' } as Record<string, string>)[extname(media.path).toLowerCase()];
    if (!type) throw new BadRequestException('素材媒体格式尚不支持');
    response.setHeader('Cache-Control', 'private, no-cache');
    response.setHeader('ETag', `"${media.sha256}"`); response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    let start = 0, end = media.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        if (!match[1]) start = Math.max(0, media.size - Number(match[2]));
        else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      } else start = -1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= media.size) {
        response.status(416).setHeader('Content-Range', `bytes */${media.size}`); return new StreamableFile(Buffer.alloc(0), { type });
      }
      response.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${media.size}`);
    }
    return new StreamableFile(createReadStream(media.path, { start, end }), { type, length: end - start + 1, disposition: 'inline' });
  }
}
