import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { ChemistryService } from './chemistry.service';

@Controller('chemistry')
@UseGuards(AuthGuard)
export class ChemistryController {
  constructor(private readonly chemistry: ChemistryService) {}
  @Get('catalog') catalog(@Req() req: AuthenticatedRequest, @Query('studentId') studentId?: string) { return this.chemistry.catalog(req.user, studentId); }
  @Post('enroll') enroll(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.chemistry.enroll(req.user, body); }
  @Post('checkpoints/start') start(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.chemistry.start(req.user, body); }
}
