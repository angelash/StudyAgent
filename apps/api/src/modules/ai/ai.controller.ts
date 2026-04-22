import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Question } from '@study-agent/contracts';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('assessment/analyze')
  analyzeAssessment(@Body() body: { question: Question; answer: unknown }) {
    return this.aiService.analyzeAssessment(body);
  }

  @Post('hints/generate')
  generateHint(@Body() body: { question: Question; answerHistoryCount: number }) {
    return this.aiService.generateHint(body);
  }

  @Post('assistant/sessions')
  openSession(
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
    return this.aiService.openAssistantSession(body);
  }

  @Post('assistant/sessions/:sessionId/messages')
  chat(@Param('sessionId') sessionId: string, @Body() body: { message: string }) {
    return this.aiService.chat({
      sessionId,
      message: body.message,
    });
  }

  @Get('assistant/sessions/:sessionId/messages')
  listMessages(@Param('sessionId') sessionId: string) {
    return this.aiService.listMessages(sessionId);
  }
}
