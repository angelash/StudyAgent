import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DomainDatabase } from './domain-database';

async function old17(location: string) {
  const current = new DomainDatabase(location); await current.open();
  const original = { paperPracticeSessions: [{ id: 'original', ownerUserId: 'owner', studentId: 'child', requestKey: 'start-key', version: 4,
    items: [{ id: 'q1', firstAnswer: { text: '第一次回答保留', disposition: 'answered' }, corrections: [{ id: 'c1', text: '订正也保留' }] }] }],
    paperPracticeCommands: [{ id: 'command', sessionId: 'original', ownerUserId: 'owner', requestKey: 'submit-key', appliedVersion: 4 }] };
  await current.commit(await current.read(), original); const before = await current.read(); await current.close();
  const raw = new DatabaseSync(location); raw.exec('DROP INDEX paper_practice_creation_request; DROP INDEX paper_practice_command_request; DROP INDEX whiteboard_question_request; DROP INDEX IF EXISTS teaching_tool_creation_request;DELETE FROM schema_migrations WHERE version>=18'); raw.close();
  return before;
}
function cleanup(directory: string) { if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe migration test directory'); rmSync(directory, { recursive: true, force: true }); }

describe('paper practice schema18 migrations and durable replay constraints', () => {
  it('upgrades a real schema17 store without changing original answers, correction history or replay receipts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-paper-migration-')), location = join(directory, 'store.sqlite3');
    try {
      const before = await old17(location), migrated = new DomainDatabase(location); await migrated.open();
      try { expect(await migrated.read()).toEqual(before); } finally { await migrated.close(); }
      const raw = new DatabaseSync(location);
      try { expect((raw.prepare('SELECT MAX(version) version FROM schema_migrations').get() as any).version).toBe(22); expect(raw.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'paper_practice_%'").all()).toHaveLength(2); } finally { raw.close(); }
    } finally { cleanup(directory); }
  });
  it('rolls back a duplicate-key legacy migration atomically and retains both conflicting source records for explicit repair', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-paper-migration-conflict-')), location = join(directory, 'store.sqlite3');
    try {
      await old17(location); const raw = new DatabaseSync(location);
      const original = raw.prepare("SELECT body FROM domain_records WHERE collection='paperPracticeSessions' AND record_id='original'").get() as any;
      raw.prepare('INSERT INTO domain_records VALUES(?,?,?,?)').run('paperPracticeSessions', 'duplicate', JSON.stringify({ ...JSON.parse(original.body), id: 'duplicate' }), 1);
      const before = raw.prepare('SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,record_id').all(); raw.close();
      const invalid = new DomainDatabase(location); await expect(invalid.open()).rejects.toThrow();
      const after = new DatabaseSync(location);
      try { expect((after.prepare('SELECT MAX(version) version FROM schema_migrations').get() as any).version).toBe(17); expect(after.prepare('SELECT collection,record_id,body,position FROM domain_records ORDER BY collection,record_id').all()).toEqual(before); } finally { after.close(); }
    } finally { cleanup(directory); }
  });
  it('scopes command replay keys to session and actor, while rejecting duplicates without committing unrelated changes', async () => {
    const database = new DomainDatabase(':memory:'); await database.open();
    try {
      const valid = { paperPracticeCommands: [{ id: 'a', sessionId: 'one', ownerUserId: 'actor', requestKey: 'key' }, { id: 'b', sessionId: 'two', ownerUserId: 'actor', requestKey: 'key' }, { id: 'c', sessionId: 'one', ownerUserId: 'other', requestKey: 'key' }] };
      await database.commit(await database.read(), valid); const before = await database.read();
      await expect(database.commit(before, { ...valid, paperPracticeCommands: [...valid.paperPracticeCommands, { ...valid.paperPracticeCommands[0], id: 'duplicate' }], events: [{ eventId: 'should-not-exist' }] })).rejects.toThrow();
      expect(await database.read()).toEqual(before);
    } finally { await database.close(); }
  });
});
