import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { TeachingToolService } from './teaching-tool.service';

@UseGuards(AuthGuard)
@Controller('ai/teaching-tools')
export class TeachingToolController {
  constructor(private readonly tools: TeachingToolService) {}
  @Post('preflight') preflight(@Req() request: AuthenticatedRequest, @Body() body: unknown) { return this.tools.preflight(request.user, body); }
  @Post('runs') create(@Req() request: AuthenticatedRequest, @Body() body: unknown) { return this.tools.create(request.user, request.authSession, body); }
  @Get('runs') list(@Req() request: AuthenticatedRequest, @Query() query: unknown) { return this.tools.list(request.user, query); }
  @Get('requests/:requestKey') original(@Req() request: AuthenticatedRequest, @Param('requestKey') key: string) { return this.tools.request(request.user, key); }
  @Get('runs/:id') get(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.tools.get(request.user, id); }
  @Post('runs/:id/cancel') cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.tools.control(request.user, request.authSession, id, 'cancel', body); }
  @Post('runs/:id/retry') retry(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.tools.control(request.user, request.authSession, id, 'retry', body); }
}
