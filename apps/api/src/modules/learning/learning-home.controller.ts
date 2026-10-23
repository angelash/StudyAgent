import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { subjectSchema } from '@study-agent/contracts';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { validate } from '../../common/validation';
import { LearningHomeService } from './learning-home.service';

@UseGuards(AuthGuard)
@Controller('learning')
export class LearningHomeController {
  constructor(private readonly home: LearningHomeService) {}
  @Get('home') get(@Req() req: AuthenticatedRequest, @Query() input: unknown) {
    const query = validate(z.object({ studentId: z.string().min(1).max(180).optional(), subject: subjectSchema.default('math') }).strict(), input);
    return this.home.home(req.user, query.studentId, query.subject);
  }
}
