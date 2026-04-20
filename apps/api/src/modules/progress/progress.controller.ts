import { Controller, ForbiddenException, Get, Query, Req, UseGuards, Param } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { ProgressService } from './progress.service';

@UseGuards(AuthGuard)
@Controller()
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('progress/mastery-heatmap')
  getMasteryHeatmap(
    @Req() req: AuthenticatedRequest,
    @Query('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english',
  ) {
    return this.progressService.getMasteryHeatmap(req.user, studentId, subject ?? 'math');
  }

  @Get('reports/weekly')
  getWeeklyReport(
    @Req() req: AuthenticatedRequest,
    @Query('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english',
    @Query('weekStartDate') weekStartDate?: string,
  ) {
    return this.progressService.getWeeklyReport(req.user, studentId, subject ?? 'math', weekStartDate);
  }

  @Get('parents/:parentId/alerts')
  getParentAlerts(
    @Req() req: AuthenticatedRequest,
    @Param('parentId') parentId: string,
    @Query('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english',
  ) {
    if (req.user.id !== parentId && req.user.role !== 'admin') {
      throw new ForbiddenException('Cannot read another parent alerts');
    }

    return this.progressService.getParentAlerts(req.user, parentId, studentId, subject ?? 'math');
  }

  @Get('admin/analytics/overview')
  getAnalyticsOverview(@Req() req: AuthenticatedRequest) {
    return this.progressService.getAnalyticsOverview(req.user);
  }
}
