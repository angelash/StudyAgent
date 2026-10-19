import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RequestRateMiddleware implements NestMiddleware {
  constructor(private readonly limits: RateLimitService) {}
  async use(req: Request, _res: Response, next: NextFunction) {
    if (['/api/health', '/api/ready'].includes(req.originalUrl.split('?')[0]) || req.method === 'OPTIONS') { next(); return; }
    try {
      await this.limits.assert(`request-ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`, 3000, 60000);
      next();
    } catch (error) { next(error); }
  }
}
