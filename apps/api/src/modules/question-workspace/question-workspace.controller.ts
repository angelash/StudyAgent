import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { QuestionAnswerMode, QuestionAttachment, QuestionBlock, QuestionImportType, Subject } from '@study-agent/contracts';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { QuestionWorkspaceService } from './question-workspace.service';
import { QuestionImportService } from './question-import.service';

@Controller()
export class QuestionWorkspaceController {
  constructor(
    private readonly questionWorkspaceService: QuestionWorkspaceService,
    private readonly questionImportService: QuestionImportService,
  ) {}

  @UseGuards(AuthGuard)
  @Get('admin/question-import-jobs')
  listImportJobs(@Req() req: AuthenticatedRequest) {
    return this.questionImportService.listJobs(req.user);
  }

  @UseGuards(AuthGuard)
  @Post('admin/question-import-jobs')
  createImportJob(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      importType: QuestionImportType;
      subject: Subject;
      sourcePathOrUrl: string;
      sourcePolicy: {
        sourceType: 'internal_authoring' | 'internal_textbook' | 'open_content' | 'public_reference' | 'partner';
        licenseClass: 'A_INTERNAL' | 'B_OPEN' | 'C_PUBLIC_REFERENCE_ONLY' | 'D_COMMERCIAL_PARTNER';
        licenseName?: string | null;
      };
    },
  ) {
    return this.questionImportService.createJob(req.user, {
      importType: body.importType,
      subject: body.subject,
      sourcePathOrUrl: body.sourcePathOrUrl,
      sourcePolicy: {
        sourceType: body.sourcePolicy.sourceType,
        licenseClass: body.sourcePolicy.licenseClass,
        licenseName: body.sourcePolicy.licenseName ?? null,
      },
    });
  }

  @UseGuards(AuthGuard)
  @Get('admin/question-import-jobs/:jobId')
  getImportJob(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
    return this.questionImportService.getJob(req.user, jobId);
  }

  @UseGuards(AuthGuard)
  @Get('admin/question-import-jobs/:jobId/records')
  listImportRecords(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
    return this.questionImportService.listRecords(req.user, jobId);
  }

  @UseGuards(AuthGuard)
  @Post('admin/question-import-records/:recordId/review')
  reviewImportRecord(
    @Req() req: AuthenticatedRequest,
    @Param('recordId') recordId: string,
    @Body()
    body: {
      decision: 'approved' | 'rejected';
      comment?: string | null;
      knowledgePointIds?: string[];
      createDraft?: boolean;
    },
  ) {
    return this.questionImportService.reviewRecord(req.user, recordId, body);
  }

  @UseGuards(AuthGuard)
  @Post('admin/question-import-records/:recordId/ai-structure')
  structureImportRecord(@Req() req: AuthenticatedRequest, @Param('recordId') recordId: string) {
    return this.questionImportService.structureRecordWithAi(req.user, recordId);
  }

  @UseGuards(AuthGuard)
  @Post('admin/questions/:questionId/document')
  upsertDocument(
    @Req() req: AuthenticatedRequest,
    @Param('questionId') questionId: string,
    @Body()
    body: {
      locale?: 'zh-CN';
      blocks: QuestionBlock[];
      attachments?: QuestionAttachment[];
      layoutMode?: 'default' | 'reading_split' | 'multi_part' | 'canvas_assist';
      accessibilityConfig?: Record<string, unknown>;
    },
  ) {
    return this.questionWorkspaceService.upsertDocument(req.user, questionId, {
      locale: body.locale ?? 'zh-CN',
      blocks: body.blocks,
      attachments: body.attachments ?? [],
      layoutMode: body.layoutMode ?? 'default',
      accessibilityConfig: body.accessibilityConfig ?? {},
    });
  }

  @UseGuards(AuthGuard)
  @Post('admin/questions/:questionId/answer-schema')
  upsertAnswerSchema(
    @Req() req: AuthenticatedRequest,
    @Param('questionId') questionId: string,
    @Body()
    body: {
      mode: QuestionAnswerMode;
      responseShape: Record<string, unknown>;
      validationRules: Record<string, unknown>;
      gradingConfig: Record<string, unknown>;
      options?: Array<{ id: string; label: string; value: string; content?: string | null }>;
      placeholder?: string | null;
    },
  ) {
    return this.questionWorkspaceService.upsertAnswerSchema(req.user, questionId, body);
  }

  @UseGuards(AuthGuard)
  @Post('admin/questions/:questionId/source')
  upsertSource(
    @Req() req: AuthenticatedRequest,
    @Param('questionId') questionId: string,
    @Body()
    body: {
      sourceType: 'internal_authoring' | 'internal_textbook' | 'open_content' | 'public_reference' | 'partner';
      sourceName: string;
      sourcePathOrUrl: string;
      licenseClass: 'A_INTERNAL' | 'B_OPEN' | 'C_PUBLIC_REFERENCE_ONLY' | 'D_COMMERCIAL_PARTNER';
      licenseName: string | null;
      importJobId: string | null;
      reviewStatus: 'pending' | 'approved' | 'rejected';
      notes: string | null;
    },
  ) {
    return this.questionWorkspaceService.upsertSource(req.user, questionId, body);
  }

  @Get('questions/:questionId/render')
  getRenderPayload(@Param('questionId') questionId: string) {
    return this.questionWorkspaceService.buildRenderPayload(questionId);
  }

  @Post('questions/:questionId/answers/validate')
  validateAnswer(@Param('questionId') questionId: string, @Body() body: { answer: unknown }) {
    return this.questionWorkspaceService.validateAnswer(questionId, body.answer);
  }
}
