import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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
  @Post('students/:id/delete') deleteStudent(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.privacy.delete(req.user, body, id); }
  @Post('account/delete') deleteAccount(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.privacy.delete(req.user, body); }
}
