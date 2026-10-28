import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { DomainDatabase } from './domain-database';

const connection = process.env.STUDY_TEST_TOPIC_VISUAL_POSTGRES_URL;
describe.skipIf(!connection)('native PostgreSQL topic figure identities', () => {
  let pool: Pool; const schemas: string[] = [];
  beforeAll(async () => { pool = new Pool({ connectionString: connection }); expect((await pool.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa'); });
  afterAll(async () => {
    for (const schema of schemas) { if (!/^study_qa_topic_visual_[a-f0-9]{32}$/.test(schema)) throw Error('Unknown topic figure QA schema'); await pool.query('DROP SCHEMA "' + schema + '" CASCADE'); }
    await pool.end();
  });
  async function scoped() {
    const schema = 'study_qa_topic_visual_' + randomUUID().replace(/-/g, ''); await pool.query('CREATE SCHEMA "' + schema + '"'); schemas.push(schema);
    const url = new URL(connection!); url.searchParams.set('options', '-c search_path=' + schema); return { url: url.toString(), schema };
  }
  it('opens current schema23 and retains exact original figure requests through a native reopen', async () => {
    const { url, schema } = await scoped(), initial = { studioTopicWhiteboardVisuals: [{ id: 'original', ownerUserId: 'owner', requestKey: 'key',
      frozenContext: { scene: { narration: '保留完整原讲述与条件。' } }, operation: 'generate' }] };
    let db = new DomainDatabase(url); await db.open();
    try { await db.commit(await db.read(), initial); await db.close(); db = new DomainDatabase(url); await db.open();
      expect((await db.read()).state).toEqual(initial);
      expect((await pool.query('SELECT MAX(version) AS version FROM "' + schema + '".schema_migrations')).rows[0].version).toBe(24);
      const state = await db.read(); await expect(db.commit(state, { studioTopicWhiteboardVisuals: [...state.state.studioTopicWhiteboardVisuals,
        { id: 'changed', ownerUserId: 'owner', requestKey: 'key', operation: 'edit' }] })).rejects.toThrow('duplicate');
      expect((await db.read()).state).toEqual(initial);
    } finally { await db.close(); }
  });
  it('retains the winning original when a second actual connection writes from a stale snapshot', async () => {
    const { url } = await scoped(), first = new DomainDatabase(url), second = new DomainDatabase(url); await first.open(); await second.open();
    try {
      const winner = await first.read(), stale = await second.read();
      await first.commit(winner, { studioTopicWhiteboardVisuals: [{ id: 'winner', ownerUserId: 'owner', requestKey: 'key' }] });
      await expect(second.commit(stale, { studioTopicWhiteboardVisuals: [{ id: 'loser', ownerUserId: 'owner', requestKey: 'key' }] })).rejects.toThrow();
      expect((await second.read()).state.studioTopicWhiteboardVisuals).toEqual([{ id: 'winner', ownerUserId: 'owner', requestKey: 'key' }]);
    } finally { await second.close(); await first.close(); }
  });
});
