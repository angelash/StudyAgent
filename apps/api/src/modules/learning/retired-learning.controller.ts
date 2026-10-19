import { All, Controller, GoneException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';

// Stale prototype clients cannot create unscoped evidence or overwrite first answers.
@UseGuards(AuthGuard)
@Controller()
export class RetiredLearningController {
  @All(['assessments/*path', 'missions/*path', 'plans/weekly', 'plans/weekly/generate',
    'progress/mastery-heatmap', 'reports/weekly', 'parents/:parentId/alerts', 'students/:studentId/knowledge-map'])
  retired() {
    throw new GoneException({ code: 'learning_flow_replaced', message: '学习流程已升级，请先确认学习范围，再进入知识诊断与今日学习。',
      assessment: '/student/assessment', practice: '/student/today', family: '/parent/dashboard' });
  }
}
