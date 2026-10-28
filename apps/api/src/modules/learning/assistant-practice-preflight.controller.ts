import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantPracticePreflightService } from './assistant-practice-preflight.service';

@UseGuards(AuthGuard)
@Controller('ai/assistant/sessions/:sessionId/artifacts/practice')
export class AssistantPracticePreflightController {
  constructor(private readonly practice: AssistantPracticePreflightService) {}
  @Post('preflight') @HttpCode(200)
  preflight(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Body() body: unknown) {
    return this.practice.preflight(req.user, id, body);
  }
}
