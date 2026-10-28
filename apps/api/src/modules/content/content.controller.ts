import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { ContentService } from './content.service';
import { QuestionCoverageService } from './question-coverage.service';

@Controller()
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly questionCoverageService: QuestionCoverageService,
  ) {}

  @Get('textbooks')
  listTextbooks(@Query('subject') subject?: 'math' | 'chinese' | 'english' | 'chemistry') {
    return this.contentService.listTextbooks(subject);
  }

  @Get('textbooks/:volumeId/tree')
  getVolumeTree(@Param('volumeId') volumeId: string) {
    return this.contentService.getVolumeTree(volumeId);
  }

  @Get('knowledge-points')
  listKnowledgePoints(@Query('subject') subject?: 'math' | 'chinese' | 'english' | 'chemistry') {
    return this.contentService.listKnowledgePoints(subject ?? 'math');
  }

  @UseGuards(AuthGuard)
  @Get('questions')
  listQuestions(@Req() req: AuthenticatedRequest, @Query('subject') subject?: 'math' | 'chinese' | 'english' | 'chemistry') {
    const questions = this.contentService.listQuestions(subject ?? 'math');
    if (req.user.role === 'admin') return questions;
    return questions.filter((item) => item.status === 'published').map(({ answer, analysis, ...question }) => question);
  }

  @UseGuards(AuthGuard)
  @Post('admin/textbooks/import')
  importTextbooks(
    @Req() req: AuthenticatedRequest,
    @Body() body: { subject?: 'math' | 'chinese' | 'english' | 'chemistry'; publisherVersion?: string },
  ) {
    return this.contentService.importTextbooks(req.user, body.subject, body.publisherVersion);
  }

  @UseGuards(AuthGuard)
  @Post('admin/knowledge-points')
  createKnowledgePoint(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      subject: 'math' | 'chinese' | 'english' | 'chemistry';
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
  @Patch('admin/knowledge-points/:knowledgePointId')
  updateKnowledgePoint(
    @Req() req: AuthenticatedRequest,
    @Param('knowledgePointId') knowledgePointId: string,
    @Body()
    body: {
      name?: string;
      lessonId?: string | null;
      difficultyLevel?: number;
      status?: 'draft' | 'published';
    },
  ) {
    return this.contentService.updateKnowledgePoint(req.user, knowledgePointId, body);
  }

  @UseGuards(AuthGuard)
  @Post('admin/questions')
  createQuestion(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      subject: 'math' | 'chinese' | 'english' | 'chemistry';
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
  @Patch('admin/questions/:questionId/knowledge-points')
  replaceQuestionKnowledge(
    @Req() req: AuthenticatedRequest,
    @Param('questionId') questionId: string,
    @Body() body: { knowledgePointIds: string[] },
  ) {
    return this.contentService.replaceQuestionKnowledge(req.user, questionId, body.knowledgePointIds);
  }

  @UseGuards(AuthGuard)
  @Post('admin/textbooks/:volumeId/scaffold-questions')
  scaffoldVolumeQuestions(@Req() req: AuthenticatedRequest, @Param('volumeId') volumeId: string) {
    return this.contentService.scaffoldVolumeQuestions(req.user, volumeId);
  }

  @UseGuards(AuthGuard)
  @Get('admin/question-coverage/summary')
  getQuestionCoverageSummary(
    @Req() req: AuthenticatedRequest,
    @Query('subject') subject?: 'math' | 'chinese' | 'english' | 'chemistry',
    @Query('minQuestionsPerKnowledgePoint') minQuestionsPerKnowledgePoint?: string,
  ) {
    return this.questionCoverageService.getCoverageSummary(
      req.user,
      subject,
      minQuestionsPerKnowledgePoint ? Number(minQuestionsPerKnowledgePoint) : 5,
    );
  }

  @UseGuards(AuthGuard)
  @Post('admin/question-coverage/backfill')
  async backfillQuestionCoverage(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      subject?: 'math' | 'chinese' | 'english' | 'chemistry';
      minQuestionsPerKnowledgePoint?: number;
      importTextbookCandidates?: boolean;
      candidateVolumeLimit?: number | null;
      autoCreateDraftsFromCandidates?: boolean;
    },
  ) {
    return this.questionCoverageService.backfillQuestionCoverage(req.user, body);
  }

  @UseGuards(AuthGuard)
  @Patch('admin/questions/:questionId/publish')
  publishQuestion(@Req() req: AuthenticatedRequest, @Param('questionId') questionId: string) {
    return this.contentService.publishQuestion(req.user, questionId);
  }
}
