import { Controller, ForbiddenException, Get, Query, Req, UseGuards, Param } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { ProgressService } from './progress.service';

@UseGuards(AuthGuard)
@Controller()
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('admin/history/students/:studentId/knowledge-map')
  getStudentKnowledgeMap(
    @Req() req: AuthenticatedRequest,
    @Param('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english' | 'chemistry',
  ) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return { historical: true, notice: '原型课程结构与历史统计，仅供内容迁移核对。', data: this.progressService.getStudentKnowledgeMap(req.user, studentId, subject ?? 'math') };
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
