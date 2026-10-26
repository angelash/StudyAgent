import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { streamFile } from '../../common/stream-file';
import { TopicWhiteboardVisualService } from './topic-whiteboard-visual.service';

@UseGuards(AuthGuard)
@Controller('learning/studio/topic-whiteboard-visuals')
export class TopicWhiteboardVisualController {
  constructor(private readonly visuals: TopicWhiteboardVisualService) {}
  @Get('capabilities') capabilities() { return this.visuals.capabilities(); }
  @Post('preflight') preflight(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.visuals.preflight(req.user, input, req.authSession); }
  @Post() prepare(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.visuals.prepare(req.user, input, req.authSession); }
  @Get() list(@Req() req: AuthenticatedRequest, @Query() input: unknown) { return this.visuals.list(req.user, input, req.authSession); }
  @Get('requests/:key') original(@Req() req: AuthenticatedRequest, @Param('key') key: string) { return this.visuals.receipt(req.user, null, key, req.authSession); }
  @Get(':id/requests/:key') receipt(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('key') key: string) { return this.visuals.receipt(req.user, id, key, req.authSession); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.visuals.get(req.user, id, req.authSession); }
  @Post(':id/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.visuals.control(req.user, id, 'cancel', input, req.authSession); }
  @Post(':id/retry') retry(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.visuals.control(req.user, id, 'retry', input, req.authSession); }
  @Post(':id/edits') edit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.visuals.prepare(req.user, input, req.authSession, id); }
  @Get(':id/image') image(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    return streamFile(this.visuals.file(req.user, id, req.authSession, 'image'), req.headers.range, response);
  }
  @Get(':id/original') originalImage(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    return streamFile(this.visuals.file(req.user, id, req.authSession, 'original'), req.headers.range, response);
  }
}
