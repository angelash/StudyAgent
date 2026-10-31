import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PaperSelectionService } from './paper-selection.service';

@UseGuards(AuthGuard)
@Controller('library')
export class PaperSelectionController {
  constructor(private readonly selection: PaperSelectionService) {}
  @Get('selection-lists') list(@Req() req: AuthenticatedRequest, @Query() input: unknown) { return this.selection.list(req, input); }
  @Get('selection-lists/:id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.selection.get(req, id); }
  @Post('selection-commands') command(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.selection.command(req, input); }
  @Get('selection-commands/:key') commandResult(@Req() req: AuthenticatedRequest, @Param('key') key: string) { return this.selection.commandResult(req, key); }
  @Get('papers/:id/metadata') metadata(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.selection.metadata(req, id); }
  @Post('source-reads') read(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.selection.read(req, input); }
  @Get('source-reads/:key') readResult(@Req() req: AuthenticatedRequest, @Param('key') key: string) { return this.selection.readResult(req, key); }
}
