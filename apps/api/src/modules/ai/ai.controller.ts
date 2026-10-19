import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { Question } from '@study-agent/contracts';
import { AiService } from './ai.service';

@UseGuards(AuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('assessment/analyze')
  analyzeAssessment(@Req() req: AuthenticatedRequest, @Body() body: { question: Question; answer: unknown }) {
    if (req.user.role !== 'admin') throw new ForbiddenException('该工具仅供教研使用');
    return this.aiService.analyzeAssessment(body);
  }

  @Post('hints/generate')
  generateHint(@Req() req: AuthenticatedRequest, @Body() body: { question: Question; answerHistoryCount: number }) {
    if (req.user.role !== 'admin') throw new ForbiddenException('请从当前学习任务获取提示');
    return this.aiService.generateHint(body);
  }

  @Post('assistant/sessions')
  openSession(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      userRole: 'student' | 'parent';
      studentId: string | null;
      subject?: 'math' | 'chinese' | 'english' | null;
      pageContext: 'student_home' | 'assessment' | 'mission' | 'review' | 'weekly_report';
      contextRefType?: string | null;
      contextRefId?: string | null;
    },
  ) {
    return this.aiService.openAssistantSession(body, req.user);
  }

  @Post('assistant/sessions/:sessionId/messages')
  chat(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Body() body: { message: string }) {
    this.aiService.assertSessionOwner(sessionId, req.user);
    return this.aiService.chat({
      sessionId,
      message: body.message,
    });
  }

  @Get('assistant/sessions/:sessionId/messages')
  listMessages(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    this.aiService.assertSessionOwner(sessionId, req.user);
    return this.aiService.listMessages(sessionId);
  }
}
