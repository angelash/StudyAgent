import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { ControlledEditorialService } from './controlled-editorial.service';

/** Deliberately absent from DiagnosticsModule until actual29 delivery and30 activation. */
@UseGuards(AuthGuard)
@Controller('admin/controlled-contrasts')
export class ControlledEditorialController {
  constructor(private readonly editorial: ControlledEditorialService) {}
  @Get('materials/:itemId/preflight')
  preflight(@Req() req: AuthenticatedRequest, @Param('itemId') itemId: string) { return this.editorial.materialPreflight(req.user, itemId); }
  @Get('material-reviews')
  reviews(@Req() req: AuthenticatedRequest, @Query('atomId') atomId: string) { return this.editorial.reviews(req.user, atomId); }
  @Post('material-reviews')
  review(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.editorial.execute(req.user, 'material-approve', input); }
  @Get('protocols')
  protocols(@Req() req: AuthenticatedRequest, @Query('atomId') atomId: string) { return this.editorial.publications(req.user, atomId); }
  @Get('protocols/:logicalId/history')
  history(@Req() req: AuthenticatedRequest, @Param('logicalId') logicalId: string) { return this.editorial.history(req.user, logicalId); }
  @Post('protocols')
  publish(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.editorial.execute(req.user, 'protocol-publish', input); }
  @Post('protocols/withdrawals')
  withdraw(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.editorial.execute(req.user, 'protocol-withdraw', input); }
  @Get('commands/:requestKey')
  receipt(@Req() req: AuthenticatedRequest, @Param('requestKey') requestKey: string) { return this.editorial.commandResult(req.user, requestKey); }
}
