import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { TopicWhiteboardService } from './topic-whiteboard.service';
import { TopicWhiteboardNarrationService } from './topic-whiteboard-narration.service';

@UseGuards(AuthGuard)
@Controller('learning/studio/topic-whiteboards')
export class TopicWhiteboardController {
  constructor(private readonly boards: TopicWhiteboardService, private readonly narration: TopicWhiteboardNarrationService) {}
  @Post('preflight') preflight(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.boards.preflight(req.user, input, req.authSession); }
  @Post('drafts') prepare(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.boards.prepare(req.user, input, req.authSession); }
  @Get('drafts') drafts(@Req() req: AuthenticatedRequest, @Query() input: unknown) { return this.boards.list(req.user, input, req.authSession); }
  @Get('drafts/:id') draft(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.boards.get(req.user, id, req.authSession); }
  @Get('drafts/:id/requests/:key') receipt(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('key') key: string) { return this.boards.receipt(req.user, id, key, req.authSession); }
  @Get('drafts/:id/history') history(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() input: unknown) { return this.boards.history(req.user, id, input, req.authSession); }
  @Post('drafts/:id/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.boards.control(req.user, id, 'cancel', input, req.authSession); }
  @Post('drafts/:id/retry') retry(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.boards.control(req.user, id, 'retry', input, req.authSession); }
  @Patch('drafts/:id/content') edit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.boards.edit(req.user, id, input, req.authSession); }
  @Post('drafts/:id/confirm') confirm(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.boards.confirm(req.user, id, input, req.authSession); }
  @Get() list(@Req() req: AuthenticatedRequest, @Query() input: unknown) { return this.boards.listPublished(req.user, input, req.authSession); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.boards.getPublished(req.user, id, req.authSession); }
  @Post(':id/narration/:sceneId') async speak(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('sceneId') sceneId: string,
    @Body() input: unknown, @Res({ passthrough: true }) response: Response) {
    const controller = new AbortController(), disconnect = () => { if (!req.res?.writableEnded) controller.abort(); };
    req.res?.once('close', disconnect);
    let result: Awaited<ReturnType<TopicWhiteboardNarrationService['synthesize']>>;
    try { result = await this.narration.synthesize(req.user, id, sceneId, input, req.authSession, controller.signal); }
    finally { req.res?.off('close', disconnect); }
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Access-Control-Expose-Headers', 'X-Whiteboard-Presentation, X-Whiteboard-Fingerprint, X-Whiteboard-Unit');
    response.setHeader('X-Whiteboard-Presentation', result.identity.version);
    response.setHeader('X-Whiteboard-Fingerprint', result.identity.fingerprint);
    response.setHeader('X-Whiteboard-Unit', result.identity.unitId); return result.file;
  }
}
