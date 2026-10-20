import { Body, Controller, Get, Param, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { GespService } from './gesp.service';

@Controller('gesp')
@UseGuards(AuthGuard)
export class GespController {
  constructor(private readonly gesp: GespService) {}
  @Get('overview') overview(@Req() req: AuthenticatedRequest) { return this.gesp.overview(req.user); }
  @Put('students/:studentId/scope') setScope(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string, @Body() body: unknown) {
    return this.gesp.setStudentScope(req.user, studentId, body);
  }
  @Get('students/:studentId/workspace') workspace(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string) {
    return this.gesp.studentWorkspace(req.user, studentId);
  }
  @Post('code-submissions') submitCode(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.gesp.submitCode(req.user, body); }
  @Post('probe-submissions') submitProbe(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.gesp.submitProbe(req.user, body); }
  @Get('atoms') atoms(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.gesp.atoms(req.user, query); }
  @Get('questions') search(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.gesp.search(req.user, query); }
  @Get('questions/:id') detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.gesp.detail(req.user, id); }
  @Get('documents/:sha256') document(@Req() req: AuthenticatedRequest, @Param('sha256') sha256: string, @Res({ passthrough: true }) response: Response) {
    const document = this.gesp.document(req.user, sha256);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.setHeader('ETag', `"${sha256}"`);
    return new StreamableFile(createReadStream(document.path), { type: 'application/pdf', length: document.size, disposition: 'inline' });
  }
}
