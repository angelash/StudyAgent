import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { evidenceKindSchema } from '@study-agent/contracts';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { validate } from '../../common/validation';
import { ReviewsService } from './reviews.service';

@UseGuards(AuthGuard)
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}
  @Get('admin/reviews')
  queue(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.reviews.queue(req.user, query); }
  @Get('admin/reviews/:kind/:responseId')
  detail(@Req() req: AuthenticatedRequest, @Param('kind') kind: string, @Param('responseId') id: string) {
    return this.reviews.detail(req.user, validate(evidenceKindSchema, kind), id);
  }
  @Post('admin/reviews/:kind/:responseId')
  review(@Req() req: AuthenticatedRequest, @Param('kind') kind: string, @Param('responseId') id: string, @Body() body: unknown) {
    return this.reviews.review(req.user, validate(evidenceKindSchema, kind), id, body);
  }
  @Post('learning/feedback')
  feedback(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.reviews.feedback(req.user, body); }
  @Get('learning/feedback')
  feedbackList(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.reviews.listFeedback(req.user, query); }
  @Get('admin/evidence-feedback')
  feedbackQueue(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.reviews.listFeedback(req.user, query, true); }
  @Patch('admin/evidence-feedback/:feedbackId')
  resolveFeedback(@Req() req: AuthenticatedRequest, @Param('feedbackId') id: string, @Body() body: unknown) { return this.reviews.resolveFeedback(req.user, id, body); }
}
