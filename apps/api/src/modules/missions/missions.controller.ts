import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { MissionsService } from './missions.service';

@UseGuards(AuthGuard)
@Controller('missions')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get('today')
  getTodayMission(
    @Req() req: AuthenticatedRequest,
    @Query('studentId') studentId: string,
    @Query('subject') subject?: 'math' | 'chinese' | 'english',
  ) {
    return this.missionsService.getTodayMission(req.user, studentId, subject ?? 'math');
  }

  @Post(':missionId/start')
  startMission(@Req() req: AuthenticatedRequest, @Param('missionId') missionId: string) {
    return this.missionsService.startMission(req.user, missionId);
  }

  @Post(':missionId/answers')
  submitAnswer(
    @Req() req: AuthenticatedRequest,
    @Param('missionId') missionId: string,
    @Body()
    body: {
      itemId: string;
      answer: unknown;
      elapsedMs: number;
      usedHintLevel?: number;
    },
  ) {
    return this.missionsService.submitAnswer(req.user, missionId, body);
  }

  @Post(':missionId/hints')
  requestHint(
    @Req() req: AuthenticatedRequest,
    @Param('missionId') missionId: string,
    @Body() body: { itemId: string },
  ) {
    return this.missionsService.requestHint(req.user, missionId, body.itemId);
  }

  @Post(':missionId/complete')
  completeMission(@Req() req: AuthenticatedRequest, @Param('missionId') missionId: string) {
    return this.missionsService.completeMission(req.user, missionId);
  }
}
