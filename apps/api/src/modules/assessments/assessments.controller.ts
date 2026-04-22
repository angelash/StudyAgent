import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { AssessmentsService } from './assessments.service';

@UseGuards(AuthGuard)
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post('start')
  start(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      studentId: string;
      subject: 'math' | 'chinese' | 'english';
      assessmentType: 'initial' | 'unit' | 'stage' | 'micro' | 'retry';
    },
  ) {
    return this.assessmentsService.start(req.user, body);
  }

  @Post(':sessionId/answers')
  submitAnswer(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      itemId: string;
      answer: unknown;
      elapsedMs: number;
    },
  ) {
    return this.assessmentsService.submitAnswer(req.user, sessionId, body);
  }

  @Post(':sessionId/complete')
  complete(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.assessmentsService.complete(req.user, sessionId);
  }

  @Get(':sessionId/progress')
  progress(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.assessmentsService.getProgress(req.user, sessionId);
  }

  @Get(':sessionId/result')
  result(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.assessmentsService.getResult(req.user, sessionId);
  }
}
