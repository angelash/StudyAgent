import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { RateLimitService } from './rate-limit.service';

export function requestIpLimit() {
  const configured = process.env.STUDY_RATE_LIMIT_IP_PER_MINUTE;
  if (configured === undefined) return 3000;
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) throw new Error('STUDY_RATE_LIMIT_IP_PER_MINUTE must be an integer from 1 to 1000000');
  return value;
}

@Injectable()
export class RequestRateMiddleware implements NestMiddleware {
  constructor(private readonly limits: RateLimitService) {}
  async use(req: Request, _res: Response, next: NextFunction) {
    if (['/api/health', '/api/ready'].includes(req.originalUrl.split('?')[0]) || req.method === 'OPTIONS') { next(); return; }
    try {
      await this.limits.assert(`request-ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`, requestIpLimit(), 60000);
      next();
    } catch (error) { next(error); }
  }
}
