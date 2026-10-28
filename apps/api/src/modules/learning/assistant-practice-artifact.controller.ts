import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantPracticeArtifactService } from './assistant-practice-artifact.service';

@UseGuards(AuthGuard)
@Controller('ai/assistant/sessions/:sessionId/artifacts/practice')
export class AssistantPracticeCandidateController {
  constructor(private readonly practice: AssistantPracticeArtifactService) {}
  @Post('candidates') create(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Body() body: unknown) {
    return this.practice.create(req.user, id, body, req.authSession);
  }
  @Get('candidates') list(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Query() query: unknown) {
    return this.practice.list(req.user, id, query, req.authSession);
  }
  @Get('requests/:key') receipt(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Param('key') key: string) {
    return this.practice.creationReceipt(req.user, id, key, req.authSession);
  }
}
@UseGuards(AuthGuard)
@Controller('learning/assistant-practice/artifacts')
export class AssistantPracticeArtifactController {
  constructor(private readonly practice: AssistantPracticeArtifactService) {}
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.practice.get(req.user, id, req.authSession); }
  @Patch(':id') edit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.practice.edit(req.user, id, body, req.authSession); }
}
