import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { ContentService } from './content.service';

@Controller()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('textbooks')
  listTextbooks() {
    return this.contentService.listTextbooks();
  }

  @Get('textbooks/:volumeId/tree')
  getVolumeTree(@Param('volumeId') volumeId: string) {
    return this.contentService.getVolumeTree(volumeId);
  }

  @Get('knowledge-points')
  listKnowledgePoints(@Query('subject') subject?: 'math' | 'chinese' | 'english') {
    return this.contentService.listKnowledgePoints(subject ?? 'math');
  }

  @Get('questions')
  listQuestions(@Query('subject') subject?: 'math' | 'chinese' | 'english') {
    return this.contentService.listQuestions(subject ?? 'math');
  }

  @UseGuards(AuthGuard)
  @Post('admin/textbooks/import')
  importTextbooks(
    @Req() req: AuthenticatedRequest,
    @Body() body: { publisherVersion?: string },
  ) {
    return this.contentService.importMathTextbooks(req.user, body.publisherVersion);
  }

  @UseGuards(AuthGuard)
  @Post('admin/knowledge-points')
  createKnowledgePoint(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      subject: 'math' | 'chinese' | 'english';
      name: string;
      parentId: string | null;
      gradeBand: string;
      difficultyLevel: number;
      lessonId: string | null;
      status?: 'draft' | 'published';
    },
  ) {
    return this.contentService.createKnowledgePoint(req.user, body);
  }

  @UseGuards(AuthGuard)
  @Post('admin/questions')
  createQuestion(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      subject: 'math' | 'chinese' | 'english';
      type: 'objective' | 'subjective' | 'stepwise' | 'oral';
      stem: string;
      answer: unknown;
      analysis: string;
      difficultyLevel: number;
      knowledgePointIds?: string[];
      status?: 'draft' | 'published';
    },
  ) {
    return this.contentService.createQuestion(req.user, body);
  }

  @UseGuards(AuthGuard)
  @Post('admin/questions/:questionId/knowledge-points')
  mapQuestionKnowledge(
    @Req() req: AuthenticatedRequest,
    @Param('questionId') questionId: string,
    @Body() body: { knowledgePointIds: string[] },
  ) {
    return this.contentService.mapQuestionKnowledge(req.user, questionId, body.knowledgePointIds);
  }

  @UseGuards(AuthGuard)
  @Patch('admin/questions/:questionId/publish')
  publishQuestion(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string) {
    return this.contentService.publishQuestion(req.user, questionId);
  }
}
