import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Subject, subjectSchema } from '@study-agent/contracts';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { streamFile } from '../../common/stream-file';
import { validate } from '../../common/validation';
import { CurriculumService } from './curriculum.service';
import { DiagnosticsService } from './diagnostics.service';
import { GuidanceService } from './guidance.service';
import { z } from 'zod';
import { CurriculumPackageService } from './curriculum-package.service';

const parseSubject = (value?: string): Subject => validate(subjectSchema, value ?? 'math');

@UseGuards(AuthGuard)
@Controller()
export class DiagnosticsController {
  constructor(private readonly curriculum: CurriculumService, private readonly diagnostics: DiagnosticsService,
    private readonly guidance: GuidanceService, private readonly packages: CurriculumPackageService) {}

  @Get('admin/curriculum/package')
  exportPackage(@Req() req: AuthenticatedRequest, @Query('subject') subject?: string) { return this.packages.export(req.user, subject ? parseSubject(subject) : undefined); }
  @Post('admin/curriculum/packages/preview')
  previewPackage(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.packages.preview(req.user, body); }
  @Post('admin/curriculum/packages/apply')
  applyPackage(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.packages.apply(req.user, body); }

  @Get('diagnostics/curriculum')
  curriculumList(@Query('subject') subject?: string, @Query('grade') grade?: string, @Query('term') term?: string) {
    return this.curriculum.list(parseSubject(subject), grade ? Number(grade) : undefined, term);
  }
  @Get('diagnostics/textbooks')
  textbooks(@Query('subject') subject?: string, @Query('grade') grade?: string, @Query('term') term?: string) {
    return this.curriculum.textbooks.list(parseSubject(subject), validate(z.number().int().min(1).max(6), Number(grade)),
      validate(z.enum(['upper', 'lower']), term));
  }
  @Get('diagnostics/textbooks/:bookId')
  textbook(@Param('bookId') id: string) { return this.curriculum.textbooks.detail(id); }
  @Get('admin/curriculum/overview')
  coverage(@Req() req: AuthenticatedRequest, @Query('subject') subject?: string, @Query('grade') grade?: string) {
    return this.curriculum.overview(req.user, subject ? parseSubject(subject) : undefined, grade ? Number(grade) : undefined);
  }
  @Get('admin/curriculum/atoms/:atomId/items')
  atomItems(@Req() req: AuthenticatedRequest, @Param('atomId') id: string) { return this.curriculum.itemsForAtom(req.user, id); }
  @Get('admin/curriculum/revisions/:entityId')
  revisions(@Req() req: AuthenticatedRequest, @Param('entityId') id: string) { return this.curriculum.revisions(req.user, id); }
  @Get('admin/curriculum/textbooks/:bookId')
  textbookForEditor(@Req() req: AuthenticatedRequest, @Param('bookId') id: string) {
    this.curriculum.assertEditor(req.user); return this.curriculum.textbooks.detail(id, true);
  }
  @Get('admin/curriculum/textbooks/:bookId/document')
  async textbookDocument(@Req() req: AuthenticatedRequest, @Param('bookId') id: string, @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) response: Response) {
    this.curriculum.assertEditor(req.user);
    const document = await this.curriculum.textbooks.document(id);
    return streamFile({ ...document, mediaType: 'application/pdf' }, range, response);
  }
  @Post('admin/curriculum/textbook-mappings')
  saveTextbookMapping(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.curriculum.saveTextbookMapping(req.user, body); }
  @Get('admin/curriculum/textbook-mapping-worklist')
  textbookMappingWorklist(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.curriculum.textbookMappingWorklist(req.user, query); }
  @Post('admin/knowledge-atoms')
  saveAtom(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.curriculum.upsertAtom(req.user, body); }
  @Post('admin/measurement-items')
  saveMapping(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.curriculum.upsertMapping(req.user, body); }
  @Get('students/:studentId/learning-scope')
  scope(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query('subject') subject?: string) {
    return this.curriculum.getScope(req.user, id, parseSubject(subject));
  }
  @Put('students/:studentId/learning-scope')
  saveScope(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Body() body: unknown) {
    return this.curriculum.saveScope(req.user, id, body);
  }
  @Get('students/:studentId/progress-proposals')
  progressProposals(@Req() req: AuthenticatedRequest, @Param('studentId') id: string) { return this.curriculum.progressProposals(req.user, id); }
  @Post('students/:studentId/progress-proposals')
  proposeProgress(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Body() body: unknown) { return this.curriculum.proposeScope(req.user, id, body); }
  @Post('students/:studentId/progress-proposals/:proposalId/decision')
  decideProgress(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('proposalId') proposalId: string, @Body() body: unknown) {
    return this.curriculum.decideProgress(req.user, id, proposalId, body);
  }
  @Post('diagnostics/sessions')
  start(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.diagnostics.start(req.user, body); }
  @Post('diagnostics/blueprints')
  previewBlueprint(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.diagnostics.previewBlueprint(req.user, body); }
  @Get('diagnostics/blueprints/:blueprintId')
  blueprint(@Req() req: AuthenticatedRequest, @Param('blueprintId') id: string) { return this.diagnostics.getBlueprint(req.user, id); }
  @Post('diagnostics/blueprints/:blueprintId/start')
  startBlueprint(@Req() req: AuthenticatedRequest, @Param('blueprintId') id: string) { return this.diagnostics.startBlueprint(req.user, id); }
  @Post('diagnostics/sessions/:sessionId/state')
  changeState(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Body() body: unknown) { return this.diagnostics.changeState(req.user, id, body); }
  @Get('diagnostics/sessions')
  list(@Req() req: AuthenticatedRequest, @Query('studentId') id: string, @Query('subject') subject?: string) {
    return this.diagnostics.listSessions(req.user, id, parseSubject(subject));
  }
  @Get('diagnostics/sessions/:sessionId')
  session(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string) { return this.diagnostics.sessionView(req.user, id); }
  @Get('diagnostics/students/:studentId/evidence/:responseId')
  evidence(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Param('responseId') responseId: string) {
    return this.diagnostics.evidenceView(req.user, studentId, responseId);
  }
  @Get('diagnostics/sessions/:sessionId/items/:itemId')
  render(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Param('itemId') item: string) { return this.diagnostics.renderItem(req.user, id, item); }
  @Post('diagnostics/sessions/:sessionId/responses')
  respond(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Body() body: unknown) { return this.diagnostics.submit(req.user, id, body); }
  @Patch('diagnostics/sessions/:sessionId/items/:itemId/draft')
  draft(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Param('itemId') item: string, @Body() body: unknown) {
    return this.diagnostics.saveDraft(req.user, id, item, body);
  }
  @Post('diagnostics/sessions/:sessionId/items/:itemId/hint')
  hint(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Param('itemId') item: string) { return this.diagnostics.hint(req.user, id, item); }
  @Post('diagnostics/sessions/:sessionId/complete')
  complete(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string) { return this.diagnostics.complete(req.user, id); }
  @Get('diagnostics/sessions/:sessionId/report')
  report(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string) { return this.diagnostics.report(req.user, id); }
  @Get('diagnostics/sessions/:sessionId/analysis-status')
  analysisStatus(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string) { return this.diagnostics.analysisStatus(req.user, id); }
  @Post('diagnostics/sessions/:sessionId/reanalyze')
  reanalyze(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Body() body: unknown) { return this.diagnostics.reanalyzeReport(req.user, id, body); }
  @Get('diagnostics/students/:studentId/profile')
  profile(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query('subject') subject?: string) { return this.diagnostics.profile(req.user, id, parseSubject(subject)); }
  @Post('diagnostics/students/:studentId/plans')
  plan(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Body() body: unknown) { return this.guidance.create(req.user, id, body); }
  @Get('diagnostics/students/:studentId/plans')
  plans(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query('subject') subject?: string) { return this.guidance.list(req.user, id, parseSubject(subject)); }
  @Get('diagnostics/students/:studentId/plan-requests/:requestKey')
  planCreationResult(@Req() req: AuthenticatedRequest, @Param('studentId') id:string, @Param('requestKey') requestKey:string) { return this.guidance.creationResult(req.user,id,requestKey); }
  @Patch('diagnostics/plans/:planId')
  updatePlan(@Req() req: AuthenticatedRequest, @Param('planId') id: string, @Body() body: unknown) { return this.guidance.update(req.user, id, body); }
  @Get('diagnostics/plans/:planId')
  getPlan(@Req() req: AuthenticatedRequest, @Param('planId') id: string) { return this.guidance.get(req.user, id); }
  @Get('diagnostics/plans/:planId/history')
  planHistory(@Req() req: AuthenticatedRequest, @Param('planId') id: string) { return this.guidance.history(req.user, id); }
  @Get('diagnostics/plans/:planId/reviews')
  planReviews(@Req() req: AuthenticatedRequest, @Param('planId') id: string) { return this.guidance.planReviews(req.user, id); }
  @Post('diagnostics/plans/:planId/adjust')
  adjustPlan(@Req() req: AuthenticatedRequest, @Param('planId') id: string, @Body() body: unknown) { return this.guidance.adjust(req.user, id, body); }
  @Get('diagnostics/students/:studentId/reviews')
  reviews(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query('subject') subject?: string) { return this.guidance.reviews(req.user, id, parseSubject(subject)); }
  @Post('diagnostics/reviews/:reviewId/start')
  review(@Req() req: AuthenticatedRequest, @Param('reviewId') id: string) { return this.guidance.startReview(req.user, id); }
  @Post('diagnostics/reviews/:reviewId/reschedule')
  reschedule(@Req() req: AuthenticatedRequest, @Param('reviewId') id: string, @Body() body: unknown) { return this.guidance.reschedule(req.user, id, body); }
  @Get('diagnostics/plans/:planId/retrospective')
  retrospective(@Req() req: AuthenticatedRequest, @Param('planId') id: string) { return this.guidance.retrospective(req.user, id); }
  @Post('diagnostics/plans/:planId/retrospective/acknowledge')
  acknowledgeRetrospective(@Req() req: AuthenticatedRequest, @Param('planId') id: string, @Body() body: unknown) { return this.guidance.acknowledgeRetrospective(req.user, id, body); }
  @Post('admin/diagnostic-responses/:responseId/review')
  reviewScore(@Req() req: AuthenticatedRequest, @Param('responseId') id: string, @Body() body: unknown) { return this.diagnostics.reviewScore(req.user, id, body); }
  @Get('diagnostics/sessions/:sessionId/report-history')
  reportHistory(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string) { return this.diagnostics.reportHistory(req.user, id); }
}
