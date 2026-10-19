import { Body, Controller, Get, Param, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedRequest, AuthGuard } from '../../common/auth.guard';
import { PrivacyService } from './privacy.service';

@Controller('privacy')
@UseGuards(AuthGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}
  @Get('overview') overview(@Req() req: AuthenticatedRequest) { return this.privacy.overview(req.user); }
  @Get('account/deletion-preview') accountPreview(@Req() req: AuthenticatedRequest) { return this.privacy.preview(req.user); }
  @Get('students/:id/deletion-preview') studentPreview(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.privacy.preview(req.user, id); }
  @Post('account/export') accountExport(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.privacy.export(req.user, body); }
  @Post('students/:id/export') studentExport(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.privacy.export(req.user, body, id); }
  @Post('account/export-archive') accountArchive(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response) { return this.archive(req, body, response); }
  @Post('students/:id/export-archive') studentArchive(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Res({ passthrough: true }) response: Response) { return this.archive(req, body, response, id); }
  @Post('account/prepare-archive') prepareAccountArchive(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.privacy.prepareArchive(req.user, req.authSession.id, body); }
  @Post('students/:id/prepare-archive') prepareStudentArchive(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.privacy.prepareArchive(req.user, req.authSession.id, body, id); }
  @Get('archives/:id') async downloadArchive(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    return this.archiveResponse(await this.privacy.downloadArchive(req.user, req.authSession.id, id), response);
  }
  @Post('students/:id/delete') deleteStudent(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.privacy.delete(req.user, body, id); }
  @Post('account/delete') deleteAccount(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.privacy.delete(req.user, body); }
  private async archive(req: AuthenticatedRequest, body: unknown, response: Response, studentId?: string) {
    const data = await this.privacy.exportArchive(req.user, body, studentId);
    return this.archiveResponse(data, response);
  }
  private archiveResponse(data: Awaited<ReturnType<PrivacyService['exportArchive']>>, response: Response) {
    response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(data.stream, { type: 'application/x-tar', disposition: `attachment; filename="${data.receiptId}.tar"` });
  }
}
