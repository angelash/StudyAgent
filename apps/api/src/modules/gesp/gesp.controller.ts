import { Controller, Get, Param, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { GespService } from './gesp.service';

@Controller('gesp')
@UseGuards(AuthGuard)
export class GespController {
  constructor(private readonly gesp: GespService) {}
  @Get('overview') overview(@Req() req: AuthenticatedRequest) { return this.gesp.overview(req.user); }
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
