import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantWhiteboardService } from './assistant-whiteboard.service';

@UseGuards(AuthGuard)
@Controller('ai/assistant/sessions/:sessionId/artifacts/whiteboards')
export class AssistantWhiteboardController {
  constructor(private readonly boards: AssistantWhiteboardService) {}
  @Post('preflight')
  @HttpCode(200)
  preflight(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Body() body: unknown) {
    return this.boards.preflight(request.user, sessionId, body);
  }
}
