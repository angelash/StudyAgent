import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export type RequestWithContext = Request & {
  requestId?: string;
  user?: unknown;
};

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: Response, next: NextFunction) {
    req.requestId = randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  }
}

