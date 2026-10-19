import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedRequest, AuthGuard } from '../../common/auth.guard';
import { streamFile } from '../../common/stream-file';
import { StudentMediaService } from './student-media.service';

@Controller('learning/media')
@UseGuards(AuthGuard)
export class StudentMediaController {
  constructor(private readonly media: StudentMediaService) {}
  @Get('capabilities') capabilities() { return this.media.capabilities(); }
  @Post() start(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.media.start(req.user, body); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.media.get(req.user, id); }
  @Put(':id/chunks/:index') chunk(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('index') index: string, @Body() body: unknown) {
    if (!/^\d+$/.test(index)) throw new BadRequestException('附件分块序号不正确'); return this.media.chunk(req.user, id, Number(index), body);
  }
  @Post(':id/complete') complete(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.media.complete(req.user, id); }
  @Post(':id/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.media.cancel(req.user, id); }
  @Get(':id/content') async content(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response) {
    return streamFile(await this.media.content(req.user, id), range, response);
  }
}
