import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard, AuthenticatedRequest, requestToken } from '../../common/auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setCookie(res: Response, result: { token: string; expiresAt: string }) {
    res.cookie('study_session', result.token, { httpOnly: true, sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production', path: '/api', expires: new Date(result.expiresAt) });
  }

  @Post('register')
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(body, req.ip);
    this.setCookie(res, result);
    return result;
  }

  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body, req.ip);
    this.setCookie(res, result);
    return result;
  }

  @Post('learning-code')
  learningCode(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = this.authService.redeemLearningCode(body, req.ip); this.setCookie(res, result); return result;
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    res.clearCookie('study_session', { path: '/api' });
    return this.authService.logout(requestToken(req));
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return {
      id: req.user.id,
      role: req.user.role,
      displayName: req.user.displayName,
      principal: req.user.principal,
      ...(req.user.role === 'student' ? { principal: '', studentId: req.authSession.studentId } : {}),
    };
  }
}
