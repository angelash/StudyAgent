import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { ClassroomCodeService } from './classroom-code.service';

@UseGuards(AuthGuard)
@Controller('learning/classroom/sessions/:sessionId/code-drafts/:stepId/:blockId')
export class ClassroomCodeController {
  constructor(private readonly code: ClassroomCodeService) {}
  @Get() get(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('stepId') stepId: string, @Param('blockId') blockId: string) {
    return this.code.get(req.user, sessionId, stepId, blockId);
  }
  @Patch() save(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('stepId') stepId: string, @Param('blockId') blockId: string, @Body() input: unknown) {
    return this.code.save(req.user, sessionId, stepId, blockId, input);
  }
}
