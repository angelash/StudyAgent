import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import { InMemoryStoreService } from './in-memory-store.service';

describe('revision-checked immutable snapshots and request workspaces', () => {
  it('keeps snapshots immutable, isolates public copies and preserves ordered updates and deletions', async () => {
    const db = new DomainDatabase(':memory:'); await db.open();
    try {
      const empty = await db.readImmutable();
      await db.commit(empty, { questions: [{ id: 'a', doc: { text: 'original' } }, { id: 'b' }, { id: 'c' }] });
      const original = await db.readImmutable();
      expect(Object.isFrozen(original.state.questions)).toBe(true);
      expect(Object.isFrozen((original.state.questions[0] as any).doc)).toBe(true);
      for (let index = 0; index < 5; index++) expect(await db.readImmutable()).toBe(original);
      expect(db.diagnostics.snapshotLoads).toBe(1);
      const copy = await db.read(); (copy.state.questions[0] as any).doc.text = 'isolated change';
      expect((original.state.questions[0] as any).doc.text).toBe('original');
      const orderedBaseline = await db.read();
      const after = { ...orderedBaseline.state, questions: [orderedBaseline.state.questions[2], orderedBaseline.state.questions[0]] };
      await db.commit(orderedBaseline, after);
      (after.questions[1] as any).doc.text = 'mutated after commit';
      const result = await db.read();
      expect(result.state.questions.map((q: any) => q.id)).toEqual(['c', 'a']);
      expect((result.state.questions[1] as any).doc.text).toBe('original');
      const baseline = await db.read(), next = structuredClone(baseline.state);
      (next.questions[1] as any).doc.text = 'persisted change';
      await db.commit(baseline, next);
      expect(((await db.read()).state.questions[1] as any).doc.text).toBe('persisted change');
      await db.commit(await db.read(), { questions: [] });
      expect((await db.read()).state.questions).toBeUndefined();
    } finally { await db.close(); }
  });

  it('invalidates a warmed snapshot after another connection revokes access, and rejects stale dependent writes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-cache-revocation-'));
    const first = new DomainDatabase(join(directory, 'domain.sqlite3')), second = new DomainDatabase(join(directory, 'domain.sqlite3'));
    await first.open(); await second.open();
    try {
      await first.commit(await first.read(), { bindings: [{ id: 'access', status: 'active' }], plans: [{ id: 'plan', status: 'active' }] });
      const authorized = await first.readImmutable(); expect(await first.readImmutable()).toBe(authorized);
      await second.commit(await second.read(), { bindings: [{ id: 'access', status: 'inactive' }], plans: [{ id: 'plan', status: 'paused' }] });
      await expect(first.commit(authorized, { ...authorized.state, responses: [{ id: 'unauthorized-output' }] })).rejects.toThrow('数据已更新');
      const latest = await first.readImmutable();
      expect(latest).not.toBe(authorized);
      expect(latest.state.bindings).toEqual([{ id: 'access', status: 'inactive' }]);
      expect(latest.state.plans).toEqual([{ id: 'plan', status: 'paused' }]);
      expect(latest.state.responses).toBeUndefined();
      expect(first.diagnostics.conflicts).toBe(1);
    } finally { await first.close(); await second.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it('never publishes a failed unique write into the warmed cache', async () => {
    const db = new DomainDatabase(':memory:'); await db.open();
    try {
      const original = await db.readImmutable();
      await expect(db.commit(original, { users: [{ id: 'a', principal: 'same' }, { id: 'b', principal: 'same' }] })).rejects.toThrow();
      expect(await db.readImmutable()).toBe(original);
      expect((await db.read()).state.users).toBeUndefined();
    } finally { await db.close(); }
  });

  it('isolates request mutations, failed transactions and two commits without cloning unrelated evidence', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-workspace-'));
    const prior = { NODE_ENV: process.env.NODE_ENV, STUDY_STORAGE: process.env.STUDY_STORAGE, STUDY_DATA_DIR: process.env.STUDY_DATA_DIR };
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory });
    const store = new InMemoryStoreService(); await store.onModuleInit();
    try {
      await store.transaction(() => {
        store.users.push({ id: 'owner', principal: 'owner', role: 'parent', status: 'active', displayName: 'Original' } as any);
        store.diagnosticResponses.push(...Array.from({ length: 1000 }, (_, index) => ({ id: `evidence-${index}` } as any)));
      });
      const before = store.storageDiagnostics!;
      await expect(store.transaction(() => { store.users[0].displayName = 'Must roll back'; throw new Error('failed'); })).rejects.toThrow('failed');
      await store.requestContext(() => expect(store.users[0].displayName).toBe('Original'));
      await store.transaction(async () => {
        store.users[0].displayName = 'First commit'; await store.commitRequest();
        store.users[0].displayName = 'Second commit';
      });
      await store.requestContext(() => expect(store.users[0].displayName).toBe('Second commit'));
      expect(store.storageDiagnostics!.recordsCloned - before.recordsCloned).toBe(4);
      expect(store.storageDiagnostics!.snapshotLoads).toBe(before.snapshotLoads);
    } finally {
      await store.onModuleDestroy();
      for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
