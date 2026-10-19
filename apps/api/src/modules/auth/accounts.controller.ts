import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { AuthService } from './auth.service';
@UseGuards(AuthGuard)
@Controller('admin/accounts')
export class AccountsController {
  constructor(private readonly auth: AuthService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.auth.listAccounts(req.user, query); }
  @Patch(':id') update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.auth.updateAccount(req.user, id, body); }
}
