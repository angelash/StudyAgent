import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { AiService } from './ai.service';
import { TeachingToolCompatibilityService } from './teaching-tool-compatibility.service';
import type { AssistantSession, AssistantTeachingSelection } from '@study-agent/contracts';

@UseGuards(AuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService, private readonly teaching: TeachingToolCompatibilityService) {}

  @Get('models')
  models() { return this.aiService.modelCatalog(); }

  @Post('assessment/analyze')
  async analyzeAssessment(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    if (req.user.role !== 'admin') throw new ForbiddenException('该工具仅供教研使用');
    const result = await this.teaching.submit(req.user, req.authSession, 'assessment_analysis', body);
    response.status(result.httpStatus); return result.data;
  }

  @Post('hints/generate')
  async generateHint(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    if (req.user.role !== 'admin') throw new ForbiddenException('请从当前学习任务获取提示');
    const result = await this.teaching.submit(req.user, req.authSession, 'hint_draft', body);
    response.status(result.httpStatus); return result.data;
  }

  @Get('assistant/lecture-context')
  lectureContext(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.aiService.lectureDescriptor(req.user, query);
  }

  @Get('assistant/course-context')
  courseContext(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.aiService.courseDescriptor(req.user, query);
  }

  @Get('assistant/sessions/:sessionId/sources/:sourceKey')
  sourcePreview(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('sourceKey') sourceKey: string) {
    return this.aiService.sourcePreview(req.user, sessionId, sourceKey);
  }

  @Post('assistant/sessions')
  openSession(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      userRole: 'student' | 'parent';
      studentId: string | null;
      subject?: 'math' | 'chinese' | 'english' | 'chemistry' | null;
      pageContext: AssistantSession['pageContext'];
      contextRefType?: string | null;
      contextRefId?: string | null;
      contextItemId?: string | null;
      contextSelection?: AssistantTeachingSelection;
    },
  ) {
    return this.aiService.openDurableAssistantSession(body, req.user, req.authSession);
  }

  @Post('assistant/sessions/:sessionId/messages')
  async chat(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) response: Response,
    @Param('sessionId') sessionId: string,
    @Body() body: { message: string; requestKey?: string; modelId?: string },
  ) {
    this.aiService.assertSessionOwner(sessionId, req.user, false);
    const controller = new AbortController();
    const abort = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', abort);
    try { return await this.aiService.chat({ sessionId, message: body.message, modelId: body.modelId,
      requestKey: body.requestKey, signal: controller.signal, authSession:req.authSession }); }
    finally { response.off('close', abort); }
  }

  @Get('assistant/sessions/:sessionId/messages')
  listMessages(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    this.aiService.assertSessionOwner(sessionId, req.user, false);
    return this.aiService.listMessages(sessionId);
  }
}
