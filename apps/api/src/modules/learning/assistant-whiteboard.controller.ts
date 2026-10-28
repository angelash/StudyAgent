import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantWhiteboardService } from './assistant-whiteboard.service';
import { TopicWhiteboardService } from './topic-whiteboard.service';

@UseGuards(AuthGuard)
@Controller('ai/assistant/sessions/:sessionId/artifacts/whiteboards')
export class AssistantWhiteboardController {
  constructor(private readonly boards: AssistantWhiteboardService, private readonly drafts: TopicWhiteboardService) {}
  @Post('preflight')
  @HttpCode(200)
  preflight(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Body() body: unknown) {
    return this.boards.preflight(request.user, sessionId, body);
  }
  @Post()
  prepare(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Body() body: unknown) {
    return this.drafts.prepareSource(request.user, sessionId, body, request.authSession);
  }
  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Query() query: unknown) {
    return this.drafts.sourceList(request.user, sessionId, query, request.authSession);
  }
  @Get('requests/:key')
  receipt(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('key') key: string) {
    return this.drafts.sourceReceipt(request.user, sessionId, key, request.authSession);
  }
}
