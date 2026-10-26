import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PaperPracticeService } from './paper-practice.service';

@UseGuards(AuthGuard)
@Controller('library/practice')
export class PaperPracticeController {
  constructor(private readonly practice: PaperPracticeService) {}
  @Get('reviews') reviews(@Req() req: AuthenticatedRequest, @Query() input: unknown) { return this.practice.reviews(req.user, input); }
  @Get('reviews/calendar') calendar(@Req() req: AuthenticatedRequest, @Query() input: unknown) { return this.practice.reviewCalendar(req.user, input); }
  @Get('reviews/calendar/export') exportCalendar(@Req() req: AuthenticatedRequest, @Query() input: unknown) { return this.practice.exportReviewCalendar(req.user, input); }
  @Post('preview') preview(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.practice.preview(req.user, input); }
  @Post('sessions') create(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.practice.create(req.user, input); }
  @Get('requests/:requestKey') creationResult(@Req() req: AuthenticatedRequest, @Param('requestKey') key: string) { return this.practice.creationResult(req.user, key); }
  @Get('sessions') list(@Req() req: AuthenticatedRequest, @Query() input: unknown) { return this.practice.list(req.user, input); }
  @Get('sessions/:sessionId') get(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string) { return this.practice.get(req.user, id); }
  @Get('sessions/:sessionId/items/:itemId') item(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Param('itemId') item: string) { return this.practice.item(req.user, id, item); }
  @Get('sessions/:sessionId/commands/:requestKey') commandResult(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Param('requestKey') key: string) { return this.practice.commandResult(req.user, id, key); }
  @Post('sessions/:sessionId/commands') command(@Req() req: AuthenticatedRequest, @Param('sessionId') id: string, @Body() input: unknown) { return this.practice.command(req.user, id, input); }
}
