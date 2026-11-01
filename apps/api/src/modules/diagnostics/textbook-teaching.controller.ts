import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { TextbookTeachingService } from './textbook-teaching.service';

@UseGuards(AuthGuard)
@Controller('admin/curriculum/teaching-packages')
export class TextbookTeachingController {
  constructor(private readonly teaching: TextbookTeachingService) {}
  private async cancellable<T>(response: Response, run: (signal: AbortSignal) => Promise<T>) {
    response.setHeader('Cache-Control', 'private, no-store');
    const cancellation = new AbortController(), disconnect = () => cancellation.abort(); response.once('close', disconnect);
    try { return await run(cancellation.signal); } finally { response.off('close', disconnect); }
  }
  @Post('source-preview')
  source(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.cancellable(response, signal => this.teaching.sourcePreview(request, body, signal));
  }
  @Post('preflight')
  preflight(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.cancellable(response, signal => this.teaching.preflight(request, body, signal));
  }
  @Post('commands')
  command(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.cancellable(response, signal => this.teaching.command(request, body, signal));
  }
  @Get('commands/:key')
  result(@Req() request: AuthenticatedRequest, @Param('key') key: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'private, no-store'); return this.teaching.commandResult(request, key);
  }
  @Get('materials')
  materials(@Req() request: AuthenticatedRequest, @Query() query: unknown, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'private, no-store'); return this.teaching.materials(request, query);
  }
  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'private, no-store'); return this.teaching.list(request, query);
  }
  @Get(':id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Query('version') version: string | undefined, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'private, no-store'); return this.teaching.get(request, id, version);
  }
}
