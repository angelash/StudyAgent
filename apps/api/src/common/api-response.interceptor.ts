import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import { InMemoryStoreService } from '../infrastructure/in-memory-store.service';

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  constructor(private readonly store: InMemoryStoreService) {}
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ requestId?: string }>();

    return from((async () => {
      const data = await lastValueFrom(next.handle());
      await this.store.commitRequest();
      return {
        data,
        error: null,
        meta: {
          requestId: request.requestId ?? 'unknown',
          timestamp: new Date().toISOString(),
        },
      };
    })());
  }
}
