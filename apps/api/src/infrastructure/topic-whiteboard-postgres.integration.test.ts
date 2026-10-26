import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { DomainDatabase } from './domain-database';

const connection = process.env.STUDY_TEST_TOPIC_WHITEBOARD_POSTGRES_URL;
describe.skipIf(!connection)('native PostgreSQL AI whiteboard original identities', () => {
  let control: Pool; const schemas: string[] = [];
  beforeAll(async () => { control = new Pool({ connectionString: connection }); expect((await control.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa'); });
  afterAll(async () => {
    for (const schema of schemas) { if (!/^study_qa_topic_[a-f0-9]{32}$/.test(schema)) throw Error('Unknown isolated topic schema'); await control.query(`DROP SCHEMA "${schema}" CASCADE`); }
    await control.end();
  });
  async function scoped() {
    const schema = 'study_qa_topic_' + randomUUID().replace(/-/g, ''); await control.query(`CREATE SCHEMA "${schema}"`); schemas.push(schema);
    const url = new URL(connection!); url.searchParams.set('options', '-c search_path=' + schema); return { url: url.toString(), schema };
  }
  it('migrates schema17, enforces prepare and publication identities, and retains original records after native reopen', async () => {
    const { url, schema } = await scoped(); let db = new DomainDatabase(url); await db.open();
    try {
      const initial = { studioTopicWhiteboardDrafts: [{ id: 'original', ownerUserId: 'owner', requestKey: 'request', content: { title: '原稿' } }],
        studioTopicWhiteboards: [{ id: 'board', ownerUserId: 'owner', sourceDraftId: 'original', title: '冻结白板' }] };
      await db.commit(await db.read(), initial);
      let before = await db.read(); await expect(db.commit(before, { ...before.state, studioTopicWhiteboardDrafts: [
        ...before.state.studioTopicWhiteboardDrafts, { id: 'another', ownerUserId: 'owner', requestKey: 'request' },
      ] })).rejects.toThrow();
      before = await db.read(); await expect(db.commit(before, { ...before.state, studioTopicWhiteboards: [
        ...before.state.studioTopicWhiteboards, { id: 'other-board', ownerUserId: 'other', sourceDraftId: 'original' },
      ] })).rejects.toThrow();
      await db.close(); db = new DomainDatabase(url); await db.open(); expect((await db.read()).state).toEqual(initial);
      const probe = new Pool({ connectionString: url });
      try { expect(Number((await probe.query('SELECT MAX(version) AS version FROM schema_migrations')).rows[0].version)).toBe(17);
        expect((await probe.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname LIKE $2 ORDER BY indexname', [schema, 'topic_whiteboard_%'])).rows.map(row => row.indexname))
          .toEqual(['topic_whiteboard_prepare_request', 'topic_whiteboard_publication_draft']);
      } finally { await probe.end(); }
    } finally { await db.close(); }
  });
  it('rejects a stale competing confirmation without overwriting the already committed original board', async () => {
    const { url } = await scoped(), first = new DomainDatabase(url), second = new DomainDatabase(url); await first.open(); await second.open();
    try {
      await first.commit(await first.read(), { studioTopicWhiteboardDrafts: [{ id: 'draft', ownerUserId: 'owner', requestKey: 'key', status: 'ready', revision: 2 }], studioTopicWhiteboards: [] });
      const before = await first.read(), stale = await second.read(); const next: Record<string, any[]> = structuredClone(before.state) as Record<string, any[]>;
      next.studioTopicWhiteboardDrafts[0].status = 'confirmed'; next.studioTopicWhiteboardDrafts[0].revision = 3;
      next.studioTopicWhiteboards = [{ id: 'original-board', ownerUserId: 'owner', sourceDraftId: 'draft' }]; await first.commit(before, next);
      const competing: Record<string, any[]> = structuredClone(stale.state) as Record<string, any[]>; competing.studioTopicWhiteboardDrafts[0].status = 'confirmed';
      competing.studioTopicWhiteboards = [{ id: 'competing-board', ownerUserId: 'owner', sourceDraftId: 'draft' }];
      await expect(second.commit(stale, competing)).rejects.toThrow(); expect((await second.read()).state).toEqual(next);
    } finally { await second.close(); await first.close(); }
  });
});
