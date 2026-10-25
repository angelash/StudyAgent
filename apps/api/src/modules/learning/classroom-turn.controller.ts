import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { ClassroomTurnService } from './classroom-turn.service';

@UseGuards(AuthGuard)
@Controller('learning/classroom/sessions/:sessionId/turns')
export class ClassroomTurnController {
  constructor(private readonly turns: ClassroomTurnService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) { return this.turns.list(req.user, sessionId); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('id') id: string) { return this.turns.get(req.user, sessionId, id); }
  @Post() create(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Body() input: unknown) { return this.turns.create(req.user, sessionId, input, req.authSession); }
  @Post(':id/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(req.user, sessionId, id, 'cancel', input); }
  @Post(':id/retry') retry(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(req.user, sessionId, id, 'retry', input); }
}
