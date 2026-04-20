import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body()
    body: {
      principal: string;
      credential: string;
    },
  ) {
    return this.authService.login(body);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return {
      id: req.user.id,
      role: req.user.role,
      displayName: req.user.displayName,
      principal: req.user.principal,
    };
  }
}

