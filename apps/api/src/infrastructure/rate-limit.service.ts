import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InMemoryStoreService } from './in-memory-store.service';

@Injectable()
export class RateLimitService {
  private accepted = 0;
  private rejected = 0;
  constructor(private readonly store: InMemoryStoreService) {}
  private key(value: string) { return createHash('sha256').update(value).digest('hex'); }
  async assert(value: string, limit: number, windowMs: number) {
    const result = await this.store.limits.consume(this.key(value), limit, windowMs);
    if (!result.allowed) {
      this.rejected++;
      throw new HttpException({ message: '尝试次数过多，请稍后重试', retryAfterSeconds: result.retryAfterSeconds }, 429);
    }
    this.accepted++;
  }
  async reset(value: string) { await this.store.limits.reset(this.key(value)); }
  get diagnostics() { return { accepted: this.accepted, rejected: this.rejected, scope: 'current process; enforcement counters shared in database' }; }
}
