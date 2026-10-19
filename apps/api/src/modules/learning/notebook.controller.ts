import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { NotebookService } from './notebook.service';
@UseGuards(AuthGuard)
@Controller('learning/students/:studentId/notebook')
export class NotebookController {
  constructor(private readonly notebook: NotebookService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Query() query: unknown) { return this.notebook.list(req.user, id, query); }
  @Get(':kind/:responseId') detail(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('kind') kind: string, @Param('responseId') responseId: string) { return this.notebook.detail(req.user, id, kind, responseId); }
  @Post(':kind/:responseId/organize') organize(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('kind') kind: string, @Param('responseId') responseId: string, @Body() body: unknown) { return this.notebook.organize(req.user, id, kind, responseId, body); }
  @Post(':kind/:responseId/redo') redo(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('kind') kind: string, @Param('responseId') responseId: string, @Body() body: unknown) { return this.notebook.redo(req.user, id, kind, responseId, body); }
  @Post(':kind/:responseId/verification') verification(@Req() req: AuthenticatedRequest, @Param('studentId') id: string, @Param('kind') kind: string, @Param('responseId') responseId: string, @Body() body: unknown) { return this.notebook.verification(req.user, id, kind, responseId, body); }
}
