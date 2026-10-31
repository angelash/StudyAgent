import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PaperExportService } from './paper-export.service';
@UseGuards(AuthGuard)
@Controller('library')
export class PaperExportController {
  constructor(private readonly exports: PaperExportService) {}
  @Post('export-preflight') preflight(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.exports.preflight(req, input); }
  @Post('export-commands') command(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.exports.command(req, input); }
  @Get('export-commands/:key') commandResult(@Req() req: AuthenticatedRequest, @Param('key') key: string) { return this.exports.commandResult(req, key); }
  @Get('exports') list(@Req() req: AuthenticatedRequest, @Query() input: unknown) { return this.exports.list(req, input); }
  @Get('exports/:id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.exports.get(req, id); }
}
