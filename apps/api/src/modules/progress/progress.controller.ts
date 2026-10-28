import { Controller, ForbiddenException, Get, Query, Req, UseGuards, Param } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { ProgressService } from './progress.service';

@UseGuards(AuthGuard)
@Controller()
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('admin/history/mastery-heatmap')
  getMasteryHeatmap(
    @Req() req: AuthenticatedRequest,
    @Query('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english' | 'chemistry',
  ) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return { historical: true, notice: '原型历史统计，仅供迁移核对，不是当前能力评价。', data: this.progressService.getMasteryHeatmap(req.user, studentId, subject ?? 'math') };
  }

  @Get('admin/history/students/:studentId/knowledge-map')
  getStudentKnowledgeMap(
    @Req() req: AuthenticatedRequest,
    @Param('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english' | 'chemistry',
  ) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return { historical: true, notice: '原型课程结构与历史统计，仅供内容迁移核对。', data: this.progressService.getStudentKnowledgeMap(req.user, studentId, subject ?? 'math') };
  }

  @Get('admin/history/reports/weekly')
  getWeeklyReport(
    @Req() req: AuthenticatedRequest,
    @Query('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english' | 'chemistry',
    @Query('weekStartDate') weekStartDate?: string,
  ) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return { historical: true, notice: '历史正确率周报，不代表当前实际能力。', data: this.progressService.getWeeklyReport(req.user, studentId, subject ?? 'math', weekStartDate) };
  }

  @Get('admin/history/parents/:parentId/alerts')
  getParentAlerts(
    @Req() req: AuthenticatedRequest,
    @Param('parentId') parentId: string,
    @Query('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english' | 'chemistry',
  ) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Cannot read another parent alerts');
    }

    return this.progressService.getParentAlerts(req.user, parentId, studentId, subject ?? 'math');
  }

  @Get('admin/analytics/overview')
  getAnalyticsOverview(@Req() req: AuthenticatedRequest) {
    return this.progressService.getAnalyticsOverview(req.user);
  }

  @Get('admin/analytics/ai-quality')
  getAiQualityOverview(@Req() req: AuthenticatedRequest) {
    return this.progressService.getAiQualityOverview(req.user);
  }
}
