import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantPracticeLearnerService } from './assistant-practice-learner.service';

@UseGuards(AuthGuard)
@Controller('learning/assistant-practice')
export class AssistantPracticeLearnerController {
  constructor(private readonly learners: AssistantPracticeLearnerService) {}
  @Post('assignments/:id/groups/:atomId/start') start(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('atomId') atomId: string, @Body() body: unknown) {
    return this.learners.start(req.user, id, atomId, body, req.authSession);
  }
  @Get('sessions/:id') view(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.learners.view(req.user, id, req.authSession); }
  @Get('sessions/:id/questions/:qid') render(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('qid') qid: string) { return this.learners.render(req.user, id, qid, req.authSession); }
  @Patch('sessions/:id/questions/:qid/draft') draft(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('qid') qid: string, @Body() body: unknown) { return this.learners.draft(req.user, id, qid, body, req.authSession); }
  @Post('sessions/:id/responses') submit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.learners.submit(req.user, id, body, req.authSession); }
  @Post('sessions/:id/questions/:qid/help') help(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('qid') qid: string, @Body() body: unknown) { return this.learners.help(req.user, id, qid, body, req.authSession); }
  @Post('sessions/:id/complete') complete(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.learners.complete(req.user, id, body, req.authSession); }
}
