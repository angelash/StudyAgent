import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import { requestIpLimit } from './request-rate.middleware';

describe('request IP quota configuration', () => {
  const previous = process.env.STUDY_RATE_LIMIT_IP_PER_MINUTE;
  afterEach(() => {
    if (previous === undefined) delete process.env.STUDY_RATE_LIMIT_IP_PER_MINUTE;
    else process.env.STUDY_RATE_LIMIT_IP_PER_MINUTE = previous;
  });
  it('keeps the production default and accepts an explicit bounded QA value', () => {
    delete process.env.STUDY_RATE_LIMIT_IP_PER_MINUTE; expect(requestIpLimit()).toBe(3000);
    process.env.STUDY_RATE_LIMIT_IP_PER_MINUTE = '100000'; expect(requestIpLimit()).toBe(100000);
  });
  it('rejects malformed, unsafe and out-of-range values', () => {
    for (const value of ['0', '-1', '1.5', 'NaN', '1000001']) {
      process.env.STUDY_RATE_LIMIT_IP_PER_MINUTE = value; expect(() => requestIpLimit()).toThrow('integer from 1 to 1000000');
    }
  });
});

describe('shared durable security rate limits', () => {
  it('admits exactly the quota across connections, survives reopening and expires without changing learning revisions', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-quota-')), location = join(directory, 'domain.sqlite3');
    let now = 1000;
    const first = new DomainDatabase(location, () => now), second = new DomainDatabase(location, () => now);
    await first.open(); await second.open();
    const key = createHash('sha256').update('synthetic security scope').digest('hex');
    try {
      const before = await first.read();
      const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).limits.consume(key, 7, 1000)));
      expect(results.filter(row => row.allowed)).toHaveLength(7);
      expect(await first.read()).toEqual(before);
      await first.close();
      const reopened = new DomainDatabase(location, () => now); await reopened.open();
      try {
        expect((await reopened.limits.consume(key, 7, 1000)).allowed).toBe(false);
        now = 2000; expect((await reopened.limits.consume(key, 7, 1000))).toMatchObject({ allowed: true, remaining: 6 });
        await reopened.limits.reset(key);
        expect((await second.limits.consume(key, 7, 1000)).remaining).toBe(6);
      } finally { await reopened.close(); }
    } finally { await first.close(); await second.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
