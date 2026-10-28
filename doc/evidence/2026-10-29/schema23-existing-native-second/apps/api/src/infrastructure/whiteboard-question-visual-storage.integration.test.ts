import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainDatabase } from './domain-database';

const connection = process.env.STUDY_TEST_QUESTION_VISUAL_POSTGRES_URL;
const initial = () => ({ whiteboardQuestionVisuals: [{ id: 'original-image', ownerUserId: 'owner', requestKey: 'original-image-request',
  target: { turnId: 'original-turn', replyFingerprint: 'a'.repeat(64) }, prompt: '完整原句、条件、公式和修图要求均保留。',
  frozenContext: { narration: '单位必须相同。', formula: 'a+'.repeat(700) + 'z' } }],
  whiteboardQuestionTurns: [{ id: 'original-turn', ownerUserId: 'owner', requestKey: 'original-question-request', reply: { text: '已发布回答不能被图片覆盖。' },
    teachingVersions: [{ id: 'original-version', figure: { original: { sha256: 'b'.repeat(64) } } }], currentTeachingVersionId: 'original-version' }],
  diagnosticResponses: [{ id: 'first-answer', originalText: '原首次回答不变。' }] });

for (const engine of ['sqlite', 'postgres'] as const) describe.skipIf(engine === 'postgres' && !connection)(engine + ' native question-image schema19 to schema20', () => {
  let control: Pool | undefined;
  const directories: string[] = [], schemas: string[] = [];
  beforeAll(async () => {
    if (engine === 'postgres') {
      control = new Pool({ connectionString: connection });
      expect((await control.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa');
    }
  });
  afterAll(async () => {
    try {
      for (const schema of schemas) {
        if (!/^study_qa_question_image_[a-f0-9]{32}$/.test(schema)) throw Error('Unknown question-image QA schema');
        await control!.query('DROP SCHEMA "' + schema + '" CASCADE');
      }
    } finally {
      await control?.end();
      for (const directory of directories) rmSync(directory, { recursive: true, force: true });
    }
  });
  async function scope() {
    let url: string;
    if (engine === 'postgres') {
      const schema = 'study_qa_question_image_' + randomUUID().replace(/-/g, '');
      await control!.query('CREATE SCHEMA "' + schema + '"'); schemas.push(schema);
      const target = new URL(connection!); target.searchParams.set('options', '-c search_path=' + schema); url = target.toString();
    } else {
      const directory = mkdtempSync(join(tmpdir(), 'study-question-image-schema-')); directories.push(directory); url = join(directory, 'store.sqlite3');
    }
    return url;
  }
  async function raw(url: string, action: (sql: (text: string, values?: unknown[]) => Promise<any[]>) => Promise<void>) {
    if (engine === 'postgres') {
      const pool = new Pool({ connectionString: url });
      try { await action(async (text, values) => (await pool.query(text, values)).rows); } finally { await pool.end(); }
    } else {
      const db = new DatabaseSync(url);
      try { await action(async (text, values = []) => db.prepare(text.replace(/\$\d+/g, '?').replace(/::jsonb/g, '')).all(...values as any)); }
      finally { db.close(); }
    }
  }
  async function legacy(url: string) {
    const db = new DomainDatabase(url); await db.open();
    try { await db.commit(await db.read(), initial()); } finally { await db.close(); }
    await raw(url, async sql => { await sql('DROP INDEX question_visual_prepare_request'); await sql('DROP INDEX teaching_tool_creation_request'); await sql('DELETE FROM schema_migrations WHERE version>=20'); await sql('DROP INDEX IF EXISTS assistant_note_creation_request'); await sql("UPDATE study_restore_guard SET state='ready' WHERE id=1"); });
  }
  it('migrates and cold reopens actual schema19 without rewriting original questions, version snapshots, long prompts or first answers', async () => {
    const url = await scope(); await legacy(url);
    for (let count = 0; count < 2; count++) {
      const db = new DomainDatabase(url); await db.open();
      try { expect((await db.read()).state).toEqual(initial()); } finally { await db.close(); }
    }
    await raw(url, async sql => { expect(Number((await sql('SELECT MAX(version) AS version FROM schema_migrations'))[0].version)).toBe(23); });
  });
  it('rolls back duplicate legacy owner/request keys atomically, retaining both records and schema19', async () => {
    const url = await scope(); await legacy(url);
    await raw(url, async sql => {
      await sql('INSERT INTO domain_records(collection,record_id,body,position) VALUES($1,$2,$3::jsonb,$4)',
        ['whiteboardQuestionVisuals', 'conflict-image', JSON.stringify({ ...initial().whiteboardQuestionVisuals[0], id: 'conflict-image' }), 1]);
      const before = await sql('SELECT * FROM domain_records ORDER BY collection,record_id'), db = new DomainDatabase(url);
      try { await expect(db.open()).rejects.toThrow(); } finally { await db.close(); }
      expect(Number((await sql('SELECT MAX(version) AS version FROM schema_migrations'))[0].version)).toBe(19);
      expect(await sql('SELECT * FROM domain_records ORDER BY collection,record_id')).toEqual(before);
    });
  });
  it('rejects duplicate current requests and stale competing publications without replacing the committed original', async () => {
    const url = await scope(), first = new DomainDatabase(url), second = new DomainDatabase(url); await first.open(); await second.open();
    try {
      await first.commit(await first.read(), initial()); const before = await first.read(), stale = await second.read();
      await expect(first.commit(before, { ...before.state, whiteboardQuestionVisuals: [...initial().whiteboardQuestionVisuals,
        { ...initial().whiteboardQuestionVisuals[0], id: 'duplicate-image' }] })).rejects.toThrow();
      expect(await first.read()).toEqual(before);
      const winner = structuredClone(initial()); winner.whiteboardQuestionVisuals[0].prompt = '明确提交的新完整要求。'; await first.commit(before, winner);
      const loser = initial(); loser.whiteboardQuestionVisuals[0].prompt = '迟到的旧标签不得覆盖。';
      await expect(second.commit(stale, loser)).rejects.toThrow(); expect((await second.read()).state).toEqual(winner);
    } finally { await second.close(); await first.close(); }
  });
});
