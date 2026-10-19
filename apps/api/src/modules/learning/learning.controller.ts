import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { subjectSchema } from '@study-agent/contracts';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { validate } from '../../common/validation';
import { LearningService } from './learning.service';
@UseGuards(AuthGuard)
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}
  @Get('students') students(@Req() req: AuthenticatedRequest) { return this.learning.studentProfiles(req.user); }
  @Get('overview') overview(@Req() req: AuthenticatedRequest) { return this.learning.overview(req.user); }
  @Get('students/:id/today') today(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('subject') subject?: string) {
    return this.learning.today(req.user, id, validate(subjectSchema, subject ?? 'math'));
  }
  @Get('students/:id/mistakes') mistakes(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('subject') subject?: string) {
    return this.learning.mistakes(req.user, id, validate(subjectSchema, subject ?? 'math'));
  }
  @Post('plans/:id/actions/:action/start') start(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('action') action: string) { return this.learning.start(req.user, id, action); }
  @Get('practice/:id') view(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.learning.view(req.user, id); }
  @Get('practice/:id/questions/:question') render(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('question') question: string) { return this.learning.render(req.user, id, question); }
  @Post('practice/:id/responses') submit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.learning.submit(req.user, id, input); }
  @Patch('practice/:id/questions/:question/draft') draft(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('question') question: string, @Body() input: unknown) { return this.learning.draft(req.user, id, question, input); }
  @Post('practice/:id/questions/:question/hint') hint(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('question') question: string) { return this.learning.hint(req.user, id, question); }
  @Post('practice/:id/complete') complete(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.learning.complete(req.user, id); }
}
