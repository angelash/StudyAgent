import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { DomainDatabase } from './domain-database';

const connection = process.env.STUDY_TEST_ASSISTANT_NOTE_STORAGE_POSTGRES_URL;
const original = () => ({ assistantArtifactDrafts: [{ id: 'original-private-note', ownerUserId: 'synthetic-owner', requestKey: 'original-note-request',
  markdown: '|单位|数量|\n|---|---|\n|米|3|\n$a+b$\n```js\nconsole.log("原文");\n```',
  origin: { messages: [{ id: 'original-source', modelId: 'saved-model', content: '完整原回答' }] }, commands: [{ key: 'original-note-request', receipt: { revision: 0 } }] }],
  diagnosticResponses: [{ id: 'retained-formal-first', originalText: '匿名首次回答', score: null }] });

for (const engine of ['sqlite', 'postgres'] as const) describe.skipIf(engine === 'postgres' && !connection)(engine + ' atomic note schema21 to22 migration', () => {
  const directories: string[] = [], schemas: string[] = []; let pool: Pool | undefined;
  beforeAll(async () => { if (engine === 'postgres') { pool = new Pool({ connectionString: connection }); expect((await pool.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa'); } });
  afterAll(async () => {
    if (pool) { for (const schema of schemas) { if (!/^study_qa_note_schema_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe note migration schema'); await pool.query('DROP SCHEMA "' + schema + '" CASCADE'); } await pool.end(); }
    for (const directory of directories) { if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.split(/[\\/]/).at(-1)!.startsWith('study-note-schema-')) throw Error('Unsafe note migration path'); rmSync(directory, { recursive: true, force: true }); }
  });
  async function scope() {
    if (engine === 'postgres') { const schema = 'study_qa_note_schema_' + randomUUID().replace(/-/g, ''); await pool!.query('CREATE SCHEMA "' + schema + '"'); schemas.push(schema); const url = new URL(connection!); url.searchParams.set('options', '-c search_path=' + schema); return url.toString(); }
    const directory = mkdtempSync(join(tmpdir(), 'study-note-schema-')); directories.push(directory); return join(directory, 'study-agent.sqlite3');
  }
  async function raw(url: string, action: (sql: (text: string, values?: unknown[]) => Promise<any[]>) => Promise<void>) {
    if (engine === 'postgres') { const control = new Pool({ connectionString: url }); try { await action(async (text, values) => (await control.query(text, values)).rows); } finally { await control.end(); } }
    else { const control = new DatabaseSync(url); try { await action(async (text, values = []) => control.prepare(text.replace(/\$\d+/g, '?').replace(/::jsonb/g, '')).all(...values as any)); } finally { control.close(); } }
  }
  async function legacy(url: string) {
    const database = new DomainDatabase(url); await database.open(); try { await database.commit(await database.read(), original()); } finally { await database.close(); }
    await raw(url, async sql => { await sql('DROP INDEX assistant_note_creation_request'); await sql('DELETE FROM schema_migrations WHERE version>=22'); await sql("UPDATE study_restore_guard SET state='ready' WHERE id=1"); expect(Number((await sql('SELECT MAX(version) version FROM schema_migrations'))[0].version)).toBe(21); });
  }
  it('cold migrates and reopens exact complete original notes and existing formal evidence', async () => {
    const url = await scope(); await legacy(url);
    for (let index = 0; index < 2; index++) { const database = new DomainDatabase(url); await database.open(); try { expect((await database.read()).state).toEqual(original()); } finally { await database.close(); } }
    await raw(url, async sql => { expect(Number((await sql('SELECT MAX(version) version FROM schema_migrations'))[0].version)).toBe(24); });
  });
  it('keeps both conflicting originals and schema21 intact when the new uniqueness migration fails', async () => {
    const url = await scope(); await legacy(url);
    await raw(url, async sql => {
      await sql('INSERT INTO domain_records(collection,record_id,body,position) VALUES($1,$2,$3::jsonb,$4)', ['assistantArtifactDrafts', 'conflicting-note', JSON.stringify({ ...original().assistantArtifactDrafts[0], id: 'conflicting-note' }), 1]);
      const before = await sql('SELECT * FROM domain_records ORDER BY collection,record_id'), database = new DomainDatabase(url);
      try { await expect(database.open()).rejects.toThrow(); } finally { await database.close(); }
      expect(Number((await sql('SELECT MAX(version) version FROM schema_migrations'))[0].version)).toBe(21); expect(await sql('SELECT * FROM domain_records ORDER BY collection,record_id')).toEqual(before);
    });
  });
  it('scopes creation keys to each owner and atomically rejects duplicate notes plus unrelated partial publication', async () => {
    const database = new DomainDatabase(await scope()); await database.open();
    try {
      const valid = original(); valid.assistantArtifactDrafts.push({ ...valid.assistantArtifactDrafts[0], id: 'other-owner-note', ownerUserId: 'other-synthetic-owner' });
      await database.commit(await database.read(), valid); const before = await database.read();
      await expect(database.commit(before, { ...valid, assistantArtifactDrafts: [...valid.assistantArtifactDrafts, { ...valid.assistantArtifactDrafts[0], id: 'duplicate-note' }], events: [{ eventId: 'must-not-publish' }] })).rejects.toThrow();
      expect(await database.read()).toEqual(before);
    } finally { await database.close(); }
  });
});
