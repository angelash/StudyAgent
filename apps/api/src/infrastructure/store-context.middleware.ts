import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { InMemoryStoreService } from './in-memory-store.service';

@Injectable()
export class StoreContextMiddleware implements NestMiddleware {
  constructor(private readonly store: InMemoryStoreService) {}
  async use(_req: Request, _res: Response, next: NextFunction) {
    if (_req.originalUrl.split('?')[0] === '/api/health') { next(); return; }
    try { await this.store.requestContext(() => next()); } catch (error) { next(error); }
  }
}
