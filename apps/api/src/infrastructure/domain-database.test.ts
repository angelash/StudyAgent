import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';

describe('durable domain transactions', () => {
  it('preserves order and records after reopening and rejects stale writes without data loss', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-store-'));
    const location = join(directory, 'domain.sqlite3');
    const first = new DomainDatabase(location);
    await first.open();
    try {
      const empty = await first.read();
      await first.commit(empty, { users: [{ id: 'z', principal: 'owner' }, { id: 'a', principal: 'other' }],
        events: [{ eventId: 'e1', eventName: 'created' }] });
      const second = new DomainDatabase(location);
      await second.open();
      try {
        const old = await second.read();
        expect(old.state.users.map((item: any) => item.id)).toEqual(['z', 'a']);
        await first.commit(await first.read(), { ...old.state, users: [{ id: 'z', principal: 'updated' }, { id: 'a', principal: 'other' }] });
        await expect(second.commit(old, { ...old.state, users: [] })).rejects.toThrow('数据已更新');
        expect((await second.read()).state.users).toHaveLength(2);
        const current = await second.read();
        await second.commit(current, { ...current.state, users: [...current.state.users].reverse() });
      } finally { await second.close(); }
    } finally { await first.close(); }
    const reopened = new DomainDatabase(location);
    await reopened.open();
    try {
      const state = (await reopened.read()).state;
      expect(state.users.map((item: any) => item.id)).toEqual(['a', 'z']);
      expect(state.events).toHaveLength(1);
    } finally { await reopened.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it('rolls back the entire write when a unique constraint fails', async () => {
    const database = new DomainDatabase(':memory:');
    await database.open();
    try {
      const before = await database.read();
      await expect(database.commit(before, { users: [{ id: 'u1', principal: 'same' }, { id: 'u2', principal: 'same' }],
        events: [{ eventId: 'never-committed' }] })).rejects.toThrow();
      expect(await database.read()).toEqual(before);
    } finally { await database.close(); }
  });

  it('enforces learning identity and pending-progress uniqueness with atomic rollback', async () => {
    const database = new DomainDatabase(':memory:'); await database.open();
    try {
      const pairs = [
        { collection: 'studentLearningAccess', a: { studentId: 's', userId: 'u1' }, b: { studentId: 's', userId: 'u2' } },
        { collection: 'studentLearningAccess', a: { studentId: 's1', userId: 'u' }, b: { studentId: 's2', userId: 'u' } },
        { collection: 'studentLearningCodes', a: { tokenHash: 'hash' }, b: { tokenHash: 'hash' } },
        { collection: 'studentLearningCodes', a: { studentId: 's', createdBy: 'p', requestKey: 'key' }, b: { studentId: 's', createdBy: 'p', requestKey: 'key' } },
        { collection: 'studentAccessRevisions', a: { studentId: 's', version: 1 }, b: { studentId: 's', version: 1 } },
        { collection: 'studentAccessRevisions', a: { studentId: 's', actorId: 'p', requestKey: 'key' }, b: { studentId: 's', actorId: 'p', requestKey: 'key' } },
        { collection: 'studentProgressProposals', a: { studentId: 's', proposedBy: 'u', requestKey: 'key' }, b: { studentId: 's', proposedBy: 'u', requestKey: 'key' } },
        { collection: 'studentProgressProposals', a: { studentId: 's', scope: { subject: 'math' }, status: 'pending' }, b: { studentId: 's', scope: { subject: 'math' }, status: 'pending' } },
      ];
      for (const { collection, a, b } of pairs) {
        const before = await database.read();
        await expect(database.commit(before, { [collection]: [{ id: 'a', ...a }, { id: 'b', ...b }], events: [{ eventId: 'rollback' }] })).rejects.toThrow();
        expect(await database.read()).toEqual(before);
      }
      await database.commit(await database.read(), { studentProgressProposals: [
        { id: 'old', studentId: 's', scope: { subject: 'math' }, status: 'superseded' },
        { id: 'new', studentId: 's', scope: { subject: 'math' }, status: 'pending' },
        { id: 'other', studentId: 's', scope: { subject: 'english' }, status: 'pending' },
      ] });
      expect((await database.read()).state.studentProgressProposals).toHaveLength(3);
    } finally { await database.close(); }
  });
});
