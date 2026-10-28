import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DomainDatabase } from './domain-database';
const backup = require(resolve(__dirname, '../../../../scripts/operations/backup.cjs'));
const connection = process.env.STUDY_TEST_TEACHING_TOOL_POSTGRES_URL;
const original = () => ({ teachingToolRuns: [{ id: 'original', ownerUserId: 'synthetic-admin', requestKey: 'original-key', modelId: 'deepseek-v4-flash',
  snapshot: { question: { stem: '完整原题与公式。', originalDocument: { table: [['3', '18'], ['2', '14']], formula: '\\frac{32}{5}' } }, answer: { steps: ['32/2=16'] } },
  result: { advisoryOnly: true, reviewRequired: true, summary: '仅为未复核建议，不写评分。' }, context: '完整冻结原文', inputHash: 'a'.repeat(64) }],
  diagnosticResponses: [{ id: 'original-first-answer', score: null, originalText: '原首次回答保留。' }], diagnosticPlans: [{ id: 'original-plan', summary: '原指导计划保留。' }] });

for (const engine of ['sqlite', 'postgres'] as const) describe.skipIf(engine === 'postgres' && !connection)(engine + ' teaching schema20 to21 original drafts and atomic owner keys', () => {
  const directories: string[] = [], schemas: string[] = []; let control: Pool | undefined;
  beforeAll(async () => { if (engine === 'postgres') { control = new Pool({ connectionString: connection }); expect((await control.query('SELECT current_database() name')).rows[0].name).toBe('study_agent_qa'); } });
  afterAll(async () => { try { for (const schema of schemas) { if (!/^study_qa_teaching_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe synthetic teaching schema'); await control!.query('DROP SCHEMA "' + schema + '" CASCADE'); } }
    finally { await control?.end(); for (const directory of directories) { if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe synthetic teaching path'); rmSync(directory, { recursive: true, force: true }); } } });
  async function scope() { if (engine === 'postgres') { const schema = 'study_qa_teaching_' + randomUUID().replace(/-/g, ''); await control!.query('CREATE SCHEMA "' + schema + '"'); schemas.push(schema);
    const url = new URL(connection!); url.searchParams.set('options', '-c search_path=' + schema); return url.toString(); }
    const directory = mkdtempSync(join(tmpdir(), 'study-teaching-schema-')); directories.push(directory); return join(directory, 'source', 'study-agent.sqlite3'); }
  async function raw(url: string, action: (sql: (text: string, values?: unknown[]) => Promise<any[]>) => Promise<void>) {
    if (engine === 'postgres') { const pool = new Pool({ connectionString: url }); try { await action(async (text, values) => (await pool.query(text, values)).rows); } finally { await pool.end(); } }
    else { const database = new DatabaseSync(url); try { await action(async (text, values = []) => database.prepare(text.replace(/\$\d+/g, '?').replace(/::jsonb/g, '')).all(...values as any)); } finally { database.close(); } }
  }
  async function legacy(url: string) { const db = new DomainDatabase(url); await db.open(); try { await db.commit(await db.read(), original()); } finally { await db.close(); }
    await raw(url, async sql => { await sql('DROP INDEX teaching_tool_creation_request'); await sql('DROP INDEX assistant_note_creation_request'); await sql('DELETE FROM schema_migrations WHERE version>=21'); expect(Number((await sql('SELECT MAX(version) version FROM schema_migrations'))[0].version)).toBe(20); }); }
  it('migrates a real schema20 store and cold reopens all exact draft, table/formula and formal records', async () => {
    const url = await scope(); await legacy(url);
    for (let index = 0; index < 2; index++) { const db = new DomainDatabase(url); await db.open(); try { expect((await db.read()).state).toEqual(original()); } finally { await db.close(); } }
    await raw(url, async sql => { expect(Number((await sql('SELECT MAX(version) version FROM schema_migrations'))[0].version)).toBe(22); });
  });
  it('rolls a duplicate legacy request back to schema20 with both originals intact', async () => {
    const url = await scope(); await legacy(url);
    await raw(url, async sql => { await sql('INSERT INTO domain_records(collection,record_id,body,position) VALUES($1,$2,$3::jsonb,$4)', ['teachingToolRuns', 'conflict', JSON.stringify({ ...original().teachingToolRuns[0], id: 'conflict' }), 1]);
      const before = await sql('SELECT * FROM domain_records ORDER BY collection,record_id'), database = new DomainDatabase(url);
      try { await expect(database.open()).rejects.toThrow(); } finally { await database.close(); }
      expect(Number((await sql('SELECT MAX(version) version FROM schema_migrations'))[0].version)).toBe(20); expect(await sql('SELECT * FROM domain_records ORDER BY collection,record_id')).toEqual(before); });
  });
  it('scopes the unique request to its owner and rejects duplicate writes atomically', async () => {
    const database = new DomainDatabase(await scope()); await database.open(); try {
      const valid = original(); valid.teachingToolRuns.push({ ...valid.teachingToolRuns[0], id: 'other-owner', ownerUserId: 'other-synthetic-admin' });
      await database.commit(await database.read(), valid); const before = await database.read();
      await expect(database.commit(before, { ...valid, teachingToolRuns: [...valid.teachingToolRuns, { ...valid.teachingToolRuns[0], id: 'duplicate' }], events: [{ eventId: 'must-not-publish' }] })).rejects.toThrow();
      expect(await database.read()).toEqual(before);
    } finally { await database.close(); }
  });
  it.skipIf(engine !== 'sqlite')('backs up and cold restores native current schema22 with complete drafts and original first answers', async () => {
    const file = await scope(), source = resolve(file, '..'), bundle = resolve(source, '../bundle'), destination = resolve(source, '../restored');
    const database = new DomainDatabase(file); await database.open(); try { await database.commit(await database.read(), original()); } finally { await database.close(); }
    await backup.createBundle({ dataDir: source, destination: bundle }); expect((await backup.verifyBundle({ bundle })).database.schemaVersions.at(-1)).toBe(22);
    await backup.restoreBundle({ bundle, destination }); const restored = new DomainDatabase(join(destination, 'study-agent.sqlite3')); await restored.open();
    try { expect((await restored.read()).state).toEqual({ ...original(), events: [expect.objectContaining({ eventName: 'operations.restored', payload: expect.objectContaining({ channel: 'local-cli' }) })] }); }
    finally { await restored.close(); }
  });
});
