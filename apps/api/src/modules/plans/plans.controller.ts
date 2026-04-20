import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { PlansService } from './plans.service';

@UseGuards(AuthGuard)
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get('weekly')
  getWeeklyPlan(
    @Req() req: AuthenticatedRequest,
    @Query('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english',
    @Query('weekStartDate') weekStartDate?: string,
  ) {
    return this.plansService.getWeeklyPlan(req.user, studentId, subject ?? 'math', weekStartDate);
  }

  @Post('weekly/generate')
  generateWeeklyPlan(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      studentId: string;
      subject?: 'math' | 'chinese' | 'english';
      weekStartDate?: string;
      availableMinutesPerDay?: number;
    },
  ) {
    return this.plansService.generateWeeklyPlan(req.user, {
      studentId: body.studentId,
      subject: body.subject ?? 'math',
      weekStartDate: body.weekStartDate,
      availableMinutesPerDay: body.availableMinutesPerDay,
    });
  }
}
