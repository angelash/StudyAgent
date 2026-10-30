import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { ControlledDiagnosticsService } from './controlled-diagnostics.service';

/** Not registered until30 and all existing diagnostic disclosure paths are ready. */
@UseGuards(AuthGuard)
@Controller('diagnostics')
export class ControlledDiagnosticsController {
  constructor(private readonly controlled: ControlledDiagnosticsService) {}
  @Get('students/:studentId/controlled-contrasts')
  available(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Query('subject') subject: string, @Query('atomId') atomId: string) { return this.controlled.available(req.user, studentId, subject, atomId); }
  @Get('students/:studentId/controlled-preview-requests/:requestKey')
  creationResult(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Param('requestKey') requestKey: string) { return this.controlled.creationResult(req.user, studentId, requestKey); }
  @Get('controlled-contrasts/previews/:id/start-requests/:requestKey')
  startResult(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('requestKey') requestKey: string) { return this.controlled.startResult(req.user, id, requestKey); }
  @Post('controlled-contrasts/previews')
  preview(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.controlled.preview(req.user, input); }
  @Get('controlled-contrasts/previews/:id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.controlled.get(req.user, id); }
  @Get('students/:studentId/controlled-previews')
  list(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Query('subject') subject: string) { return this.controlled.list(req.user, studentId, subject); }
  @Post('controlled-contrasts/previews/:id/start')
  start(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.controlled.start(req.user, id, input); }
}
