import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { RuntimeMetricsService } from '../infrastructure/runtime-metrics.service';
import { performance } from 'node:perf_hooks';

export type RequestWithContext = Request & {
  requestId?: string;
  user?: unknown;
};

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly metrics: RuntimeMetricsService) {}
  use(req: RequestWithContext, res: Response, next: NextFunction) {
    const started = performance.now(); let finished = false;
    this.metrics.begin();
    const record = (aborted: boolean) => {
      if (finished) return; finished = true;
      this.metrics.finish(req.method, req.route?.path, aborted ? 499 : res.statusCode, performance.now() - started);
    };
    res.once('finish', () => record(false)); res.once('close', () => record(!res.writableFinished));
    req.requestId = randomUUID();
    res.setHeader('x-request-id', req.requestId);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('cache-control', 'no-store');
    const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000').split(',');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && !allowed.includes(req.headers.origin)) {
      return next(new ForbiddenException('请求来源未获授权'));
    }
    next();
  }
}
