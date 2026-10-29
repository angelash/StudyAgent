import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantPracticeAssignmentService } from './assistant-practice-assignment.service';

@UseGuards(AuthGuard)
@Controller('learning/assistant-practice')
export class AssistantPracticeAssignmentController {
  constructor(private readonly assignments: AssistantPracticeAssignmentService) {}
  @Post('artifacts/:id/assignments') assign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.assignments.assign(req.user, id, body, req.authSession);
  }
  @Get('assignments') list(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.assignments.list(req.user, query, req.authSession); }
  @Get('assignments/:id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.assignments.get(req.user, id, req.authSession); }
}
