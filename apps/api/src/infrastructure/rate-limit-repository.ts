import type { DatabaseSync } from 'node:sqlite';
import type { Pool } from 'pg';
import { TaskRepository } from './task-repository';

/** Short-lived security counters, independent of learning transactions and their rollbacks. */
export class RateLimitRepository {
  private nextPrune = 0;
  constructor(private readonly tasks: TaskRepository, private readonly sqlite?: DatabaseSync, private readonly postgres?: Pool, private readonly now = () => Date.now()) {}

  async consume(key: string, limit: number, windowMs: number) {
    if (!/^[a-f0-9]{64}$/.test(key) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100000 || !Number.isSafeInteger(windowMs) || windowMs < 100 || windowMs > 86400000) throw new Error('Invalid security rate policy');
    const run = async () => {
      const now = this.now();
      if (now >= this.nextPrune) {
        if (this.sqlite) this.sqlite.prepare('DELETE FROM request_rate_limits WHERE expires_at<=?').run(now);
        else await this.postgres!.query('DELETE FROM request_rate_limits WHERE expires_at<=$1', [now]);
        this.nextPrune = now + 60000;
      }
      let row: { used: number; expires_at: number | string };
      if (this.sqlite) row = this.sqlite.prepare(`INSERT INTO request_rate_limits(bucket_key,used,expires_at) VALUES(?,1,?)
        ON CONFLICT(bucket_key) DO UPDATE SET used=CASE WHEN expires_at<=? THEN 1 ELSE MIN(used+1,?) END,
        expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING used,expires_at`).get(key, now + windowMs, now, limit + 1, now, now + windowMs) as any;
      else row = (await this.postgres!.query(`INSERT INTO request_rate_limits(bucket_key,used,expires_at) VALUES($1,1,$2)
        ON CONFLICT(bucket_key) DO UPDATE SET used=CASE WHEN request_rate_limits.expires_at<=$3 THEN 1 ELSE LEAST(request_rate_limits.used+1,$4) END,
        expires_at=CASE WHEN request_rate_limits.expires_at<=$3 THEN $2 ELSE request_rate_limits.expires_at END RETURNING used,expires_at`, [key, now + windowMs, now, limit + 1])).rows[0];
      return { allowed: Number(row.used) <= limit, remaining: Math.max(0, limit - Number(row.used)), retryAfterSeconds: Math.max(1, Math.ceil((Number(row.expires_at) - now) / 1000)) };
    };
    return this.sqlite ? this.tasks.serial(run) : run();
  }

  async reset(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid security rate key');
    if (this.sqlite) await this.tasks.serial(async () => { this.sqlite!.prepare('DELETE FROM request_rate_limits WHERE bucket_key=?').run(key); });
    else await this.postgres!.query('DELETE FROM request_rate_limits WHERE bucket_key=$1', [key]);
  }
}
