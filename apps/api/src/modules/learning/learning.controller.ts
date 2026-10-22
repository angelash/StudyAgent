import { Body, Controller, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { subjectSchema } from '@study-agent/contracts';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { validate } from '../../common/validation';
import { LearningService } from './learning.service';
import { StudioIntegrationService } from './studio-integration.service';
@UseGuards(AuthGuard)
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService, private readonly integrations: StudioIntegrationService) {}
  @Get('students') students(@Req() req: AuthenticatedRequest) { return this.learning.studentProfiles(req.user); }
  @Get('students/:id/memory') memory(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('subject') subject?: string) {
    return this.learning.memory(req.user, id, validate(subjectSchema, subject ?? 'math'));
  }
  @Get('overview') overview(@Req() req: AuthenticatedRequest) { return this.learning.overview(req.user); }
  @Get('studio/overview') studioOverview(@Req() req: AuthenticatedRequest, @Query('studentId') studentId?: string,
    @Query('subject') subject?: string) {
    return this.learning.studioOverview(req.user, studentId, validate(subjectSchema, subject ?? 'math'));
  }
  @Post('studio/courses/preview') studioCoursePreview(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.learning.previewStudioCourse(req.user, input);
  }
  @Post('studio/courses') studioCourseCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.learning.createStudioCourse(req.user, input);
  }
  @Post('studio/courses/:courseId/lessons/:lessonId/start') studioLessonStart(@Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string, @Param('lessonId') lessonId: string, @Body() input: unknown) {
    return this.learning.startStudioLesson(req.user, courseId, lessonId, input);
  }
  @Post('studio/whiteboards/preview') studioWhiteboardPreview(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.learning.previewStudioWhiteboard(req.user, input);
  }
  @Post('studio/whiteboards') studioWhiteboardCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.learning.createStudioWhiteboard(req.user, input);
  }
  @Post('studio/materials/pdf') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  studioPdfUpload(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: { studentId?: string; subject?: string; requestKey?: string }) { return this.learning.uploadStudioPdf(req.user, file, input); }
  @Get('studio/materials/:id/pages/:page') studioPdfPage(@Req() req: AuthenticatedRequest, @Param('id') id: string,
    @Param('page') page: string) { return this.learning.studioPdfPageImage(req.user, id, Number(page)); }
  @Get('studio/materials/:id/original') studioPdfOriginal(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.learning.studioPdfOriginal(req.user, id);
  }
  @Post('studio/materials/:id/structure/review') studioPdfStructureReview(@Req() req: AuthenticatedRequest,
    @Param('id') id: string, @Body() input: unknown) {
    return this.learning.reviewStudioPdfStructure(req.user, id, input);
  }
  @Post('studio/materials/:id/process/retry') studioPdfProcessRetry(@Req() req: AuthenticatedRequest,
    @Param('id') id: string, @Body() input: unknown) {
    return this.learning.retryStudioPdfProcessing(req.user, id, input);
  }
  @Post('studio/materials/:id/whiteboard/preview') studioPdfWhiteboardPreview(@Req() req: AuthenticatedRequest,
    @Param('id') id: string, @Body() input: { atomId?: string }) { return this.learning.previewStudioPdfWhiteboard(req.user, { ...input, materialId: id }); }
  @Post('studio/materials/:id/whiteboard') studioPdfWhiteboardCreate(@Req() req: AuthenticatedRequest,
    @Param('id') id: string, @Body() input: { atomId?: string; fingerprint: string; requestKey: string }) {
    return this.learning.createStudioPdfWhiteboard(req.user, { ...input, materialId: id });
  }
  @Post('studio/study-packs/preview') studioLearningPackPreview(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.learning.previewStudioLearningPack(req.user, input);
  }
  @Post('studio/study-packs') studioLearningPackCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.learning.createStudioLearningPack(req.user, input);
  }
  @Post('studio/whiteboards/:id/narration/:sceneId') studioWhiteboardNarration(@Req() req: AuthenticatedRequest,
    @Param('id') id: string, @Param('sceneId') sceneId: string, @Body() input: unknown) {
    return this.learning.studioWhiteboardNarration(req.user, id, sceneId, input);
  }
  @Post('studio/integrations') studioIntegrationConnect(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.integrations.connect(req.user, input);
  }
  @Post('studio/integrations/:id/sync') studioIntegrationSync(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.sync(req.user, id);
  }
  @Post('studio/integrations/:id/disconnect') studioIntegrationDisconnect(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.disconnect(req.user, id);
  }
  @Post('studio/calendar/events') studioCalendarEventCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.integrations.createStudyEvent(req.user, input);
  }
  @Post('studio/calendar/events/:id/remove') studioCalendarEventRemove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.removeStudyEvent(req.user, id);
  }
  @Post('studio/study-plans/preview') studioStudyPlanPreview(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.learning.previewStudioStudyPlan(req.user, input);
  }
  @Post('studio/study-plans') studioStudyPlanCreate(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    return this.learning.createStudioStudyPlan(req.user, input);
  }
  @Post('studio/study-plans/:planId/sessions/:sessionId') studioStudyPlanSession(@Req() req: AuthenticatedRequest,
    @Param('planId') planId: string, @Param('sessionId') sessionId: string, @Body() input: unknown) {
    return this.learning.updateStudioPlanSession(req.user, planId, sessionId, input);
  }
  @Get('studio/calendar/export') studioCalendarExport(@Req() req: AuthenticatedRequest, @Query('studentId') studentId: string,
    @Query('subject') subject?: string) {
    return { filename: 'studyagent-calendar.ics', content: this.integrations.exportCalendar(req.user, studentId, validate(subjectSchema, subject ?? 'math')) };
  }
  @Get('students/:id/today') today(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('subject') subject?: string) {
    return this.learning.today(req.user, id, validate(subjectSchema, subject ?? 'math'));
  }
  @Get('students/:id/mistakes') mistakes(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('subject') subject?: string) {
    return this.learning.mistakes(req.user, id, validate(subjectSchema, subject ?? 'math'));
  }
  @Post('plans/:id/actions/:action/start') start(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('action') action: string) { return this.learning.start(req.user, id, action); }
  @Get('practice/:id') view(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.learning.view(req.user, id); }
  @Get('practice/:id/questions/:question') render(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('question') question: string) { return this.learning.render(req.user, id, question); }
  @Post('practice/:id/responses') submit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.learning.submit(req.user, id, input); }
  @Patch('practice/:id/questions/:question/draft') draft(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('question') question: string, @Body() input: unknown) { return this.learning.draft(req.user, id, question, input); }
  @Post('practice/:id/questions/:question/hint') hint(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('question') question: string) { return this.learning.hint(req.user, id, question); }
  @Post('practice/:id/complete') complete(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.learning.complete(req.user, id); }
}
