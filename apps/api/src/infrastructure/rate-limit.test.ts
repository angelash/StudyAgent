import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';

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
