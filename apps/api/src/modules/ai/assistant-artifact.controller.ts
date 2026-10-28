import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantArtifactService } from './assistant-artifact.service';

@UseGuards(AuthGuard)
@Controller('ai/assistant/sessions/:sessionId/artifacts')
export class AssistantArtifactController {
  constructor(private readonly artifacts: AssistantArtifactService) {}

  @Post('preflight')
  @HttpCode(200)
  preflight(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Body() body: unknown) {
    return this.artifacts.preflight(request.user, sessionId, body);
  }
}
