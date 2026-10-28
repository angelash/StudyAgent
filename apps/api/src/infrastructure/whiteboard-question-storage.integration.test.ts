import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DomainDatabase } from './domain-database';
const backup = require(resolve(__dirname, '../../../../scripts/operations/backup.cjs'));

const original = () => ({ whiteboardQuestionTurns: [{ id: 'turn-original', ownerUserId: 'owner', requestKey: 'original-key', boardKind: 'topic',
  boardId: 'board', studentId: null, modelId: 'deepseek-v4-flash', message: '完整匿名原问题。',
  position: { unitId: 'original-sentence', sentenceText: '原句完整保留。', bookmark: { progress: 0.4, audioTime: 0.7, speed: 1.25 } },
  reply: { text: '原回答完整保留。', anchors: [{ id: 'original-anchor', label: '原句' }] } }],
  diagnosticResponses: [{ id: 'first-answer', originalText: '首次作答不被插问覆盖。' }] });
async function old18(location: string) {
  const db = new DomainDatabase(location); await db.open(); await db.commit(await db.read(), original()); const before = await db.read(); await db.close();
  const raw = new DatabaseSync(location); raw.exec('DROP INDEX whiteboard_question_request; DROP INDEX IF EXISTS question_visual_prepare_request; DROP INDEX IF EXISTS teaching_tool_creation_request;DELETE FROM schema_migrations WHERE version>=19'); raw.exec("DROP INDEX IF EXISTS assistant_note_creation_request;UPDATE study_restore_guard SET state='ready' WHERE id=1;"); raw.close(); return before;
}
describe('native schema19 whiteboard question durability', () => {
  it('migrates a real schema18 file, preserving the full original question, bookmark, answer and first diagnostic response', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-question-migration-')), location = join(directory, 'store.sqlite3');
    try {
      const before = await old18(location), db = new DomainDatabase(location); await db.open();
      try { expect(await db.read()).toEqual(before); } finally { await db.close(); }
      const raw = new DatabaseSync(location, { readOnly: true });
      try {
        expect(raw.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version).toBe(23);
        expect(raw.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='whiteboard_question_request'").get()).toBeDefined();
      } finally { raw.close(); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('rejects duplicate legacy owner/request keys atomically, retaining both original records and schema18', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-question-conflict-')), location = join(directory, 'store.sqlite3');
    try {
      await old18(location); const raw = new DatabaseSync(location);
      const row = raw.prepare("SELECT body FROM domain_records WHERE collection='whiteboardQuestionTurns'").get() as { body: string };
      raw.prepare('INSERT INTO domain_records VALUES(?,?,?,?)').run('whiteboardQuestionTurns', 'duplicate', JSON.stringify({ ...JSON.parse(row.body), id: 'duplicate' }), 1);
      const before = raw.prepare('SELECT * FROM domain_records ORDER BY collection,record_id').all(); raw.close();
      const db = new DomainDatabase(location); await expect(db.open()).rejects.toThrow();
      const after = new DatabaseSync(location, { readOnly: true });
      try { expect(after.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version).toBe(18); expect(after.prepare('SELECT * FROM domain_records ORDER BY collection,record_id').all()).toEqual(before); }
      finally { after.close(); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('backs up current schema23 and cold restores exact question data without replacing the first diagnostic answer', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-question-backup-')), source = join(directory, 'source'), bundle = join(directory, 'bundle'), restored = join(directory, 'restored');
    const db = new DomainDatabase(join(source, 'study-agent.sqlite3')); await db.open();
    try {
      const initial = original(); await db.commit(await db.read(), initial); await backup.createBundle({ dataDir: source, destination: bundle });
      expect((await backup.verifyBundle({ bundle })).database.schemaVersions.at(-1)).toBe(23);
      await backup.restoreBundle({ bundle, destination: restored }); const recovered = new DomainDatabase(join(restored, 'study-agent.sqlite3')); await recovered.open();
      try { const state = (await recovered.read()).state; expect(state.whiteboardQuestionTurns).toEqual(initial.whiteboardQuestionTurns); expect(state.diagnosticResponses).toEqual(initial.diagnosticResponses); }
      finally { await recovered.close(); }
    } finally { await db.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
