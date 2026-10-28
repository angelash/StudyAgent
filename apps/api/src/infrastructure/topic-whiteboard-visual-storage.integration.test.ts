import { describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('topic figure durable original request identities', () => {
  it('upgrades an actual schema16 file without changing its original whiteboard or manuscript', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-topic-figure-migrate-')), file = join(directory, 'original.sqlite3');
    const legacy = { studioTopicWhiteboardDrafts: [{ id: 'draft', ownerUserId: 'owner', requestKey: 'key', content: { title: '完整原稿' } }],
      studioTopicWhiteboards: [{ id: 'board', sourceDraftId: 'draft', title: '完整冻结白板' }] };
    let db: DomainDatabase | undefined;
    try {
      db = new DomainDatabase(file); await db.open(); await db.commit(await db.read(), legacy); await db.close(); db = undefined;
      const old = new DatabaseSync(file); old.exec('DROP INDEX topic_visual_prepare_request;DROP INDEX paper_practice_creation_request;DROP INDEX paper_practice_command_request;DROP INDEX IF EXISTS teaching_tool_creation_request;DELETE FROM schema_migrations WHERE version>=17;'); old.exec("DROP INDEX IF EXISTS assistant_note_creation_request;UPDATE study_restore_guard SET state='ready' WHERE id=1;"); old.close();
      db = new DomainDatabase(file); await db.open(); expect((await db.read()).state).toEqual(legacy); await db.close(); db = undefined;
      const verified = new DatabaseSync(file, { readOnly: true }); try { expect(verified.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version).toBe(24); } finally { verified.close(); }
    } finally { await db?.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  it('rejects reuse of one owner original key for a different draft and retains the original record atomically', async () => {
    const db = new DomainDatabase(':memory:'); await db.open();
    try {
      await db.commit(await db.read(), { studioTopicWhiteboardVisuals: [{ id: 'original', ownerUserId: 'owner', requestKey: 'same-key', draftId: 'first' }] });
      let state = await db.read(); await expect(db.commit(state, { studioTopicWhiteboardVisuals: [...state.state.studioTopicWhiteboardVisuals,
        { id: 'changed', ownerUserId: 'owner', requestKey: 'same-key', draftId: 'second' }] })).rejects.toThrow('UNIQUE');
      state = await db.read(); expect(state.state.studioTopicWhiteboardVisuals).toHaveLength(1);
      await db.commit(state, { studioTopicWhiteboardVisuals: [...state.state.studioTopicWhiteboardVisuals,
        { id: 'other-owner', ownerUserId: 'another', requestKey: 'same-key', draftId: 'another' }] });
      expect((await db.read()).state.studioTopicWhiteboardVisuals).toHaveLength(2);
    } finally { await db.close(); }
  });
  it('stops migration17 on duplicate legacy keys without deleting their original rows or recording a successful upgrade', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-topic-figure-duplicates-')), file = join(directory, 'original.sqlite3'); let db: DomainDatabase | undefined;
    try {
      db = new DomainDatabase(file); await db.open(); await db.close(); db = undefined;
      const old = new DatabaseSync(file); old.exec('DROP INDEX topic_visual_prepare_request;DROP INDEX paper_practice_creation_request;DROP INDEX paper_practice_command_request;DROP INDEX IF EXISTS teaching_tool_creation_request;DELETE FROM schema_migrations WHERE version>=17;'); old.exec("DROP INDEX IF EXISTS assistant_note_creation_request;UPDATE study_restore_guard SET state='ready' WHERE id=1;");
      const insert = old.prepare('INSERT INTO domain_records(collection,record_id,body,position) VALUES(?,?,?,?)');
      for (const [position, id] of ['first', 'second'].entries()) insert.run('studioTopicWhiteboardVisuals', id, JSON.stringify({ id, ownerUserId: 'owner', requestKey: 'duplicate' }), position);
      old.close(); db = new DomainDatabase(file); await expect(db.open()).rejects.toThrow('UNIQUE'); await db.close(); db = undefined;
      const verified = new DatabaseSync(file, { readOnly: true }); try {
        expect(verified.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version).toBe(16);
        expect(verified.prepare("SELECT COUNT(*) AS n FROM domain_records WHERE collection='studioTopicWhiteboardVisuals'").get()?.n).toBe(2);
      } finally { verified.close(); }
    } finally { await db?.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
