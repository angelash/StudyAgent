import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { DomainDatabase } from './domain-database';

const connection = process.env.STUDY_TEST_WHITEBOARD_QUESTION_POSTGRES_URL;
const original = () => ({ whiteboardQuestionTurns: [{ id: 'original-question', ownerUserId: 'owner', requestKey: 'original-request', boardKind: 'topic', boardId: 'original-board',
  position: { sentenceText: '保留完整条件。', bookmark: { progress: .4, audioTime: .7, camera: { zoom: 1.5, x: 20, y: 60, follow: false } } },
  reply: { text: '先确认完整条件。', board: { title: '条件', points: ['先确认条件'], formulas: [{ label: '完整式', latex: 'a+'.repeat(600) + 'z', meaning: '末项保留' }] },
    speech: { version: 'speech-v2', sourceSha256: 'a'.repeat(64), units: [{ id: 'original-sentence', start: 0, end: 8, text: '先确认完整条件。' }] } } }],
  diagnosticResponses: [{ id: 'first-answer', originalText: '原首次作答不变。' }] });

describe.skipIf(!connection)('native PostgreSQL original whiteboard questions and schema19', () => {
  let control: Pool; const schemas: string[] = [];
  beforeAll(async () => { control = new Pool({ connectionString: connection }); expect((await control.query('SELECT current_database() AS name')).rows[0].name).toBe('study_agent_qa'); });
  afterAll(async () => {
    try { for (const schema of schemas) { if (!/^study_qa_question_[a-f0-9]{32}$/.test(schema)) throw Error('Unknown question QA schema'); await control.query('DROP SCHEMA "' + schema + '" CASCADE'); } }
    finally { await control?.end(); }
  });
  async function scoped() {
    const schema = 'study_qa_question_' + randomUUID().replace(/-/g, ''); await control.query('CREATE SCHEMA "' + schema + '"'); schemas.push(schema);
    const target = new URL(connection!); target.searchParams.set('options', '-c search_path=' + schema); return { schema, url: target.toString() };
  }
  async function legacy(url: string) {
    const db = new DomainDatabase(url); await db.open(); try { await db.commit(await db.read(), original()); } finally { await db.close(); }
    const raw = new Pool({ connectionString: url }); try { await raw.query('DROP INDEX whiteboard_question_request'); await raw.query('DROP INDEX IF EXISTS question_visual_prepare_request'); await raw.query('DROP INDEX IF EXISTS teaching_tool_creation_request'); await raw.query('DELETE FROM schema_migrations WHERE version>=19'); } finally { await raw.end(); }
  }
  it('migrates actual schema18 and cold reopens the complete answer, long formula, speech, camera and first diagnostic response', async () => {
    const { schema, url } = await scoped(); await legacy(url);
    for (let reopen = 0; reopen < 2; reopen++) { const db = new DomainDatabase(url); await db.open(); try { expect((await db.read()).state).toEqual(original()); } finally { await db.close(); } }
    const raw = new Pool({ connectionString: url }); try {
      expect(Number((await raw.query('SELECT MAX(version) AS version FROM schema_migrations')).rows[0].version)).toBe(22);
      expect((await raw.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname=$2', [schema, 'whiteboard_question_request'])).rowCount).toBe(1);
    } finally { await raw.end(); }
  });
  it('rolls back a legacy owner/request conflict without discarding either answer or recording schema19', async () => {
    const { url } = await scoped(); await legacy(url); const raw = new Pool({ connectionString: url });
    try {
      await raw.query('INSERT INTO domain_records(collection,record_id,body,position) VALUES($1,$2,$3::jsonb,$4)',
        ['whiteboardQuestionTurns', 'duplicate-question', JSON.stringify({ ...original().whiteboardQuestionTurns[0], id: 'duplicate-question' }), 1]);
      const before = (await raw.query('SELECT * FROM domain_records ORDER BY collection,record_id')).rows, failed = new DomainDatabase(url);
      try { await expect(failed.open()).rejects.toThrow(); } finally { await failed.close(); }
      expect(Number((await raw.query('SELECT MAX(version) AS version FROM schema_migrations')).rows[0].version)).toBe(18);
      expect((await raw.query('SELECT * FROM domain_records ORDER BY collection,record_id')).rows).toEqual(before);
    } finally { await raw.end(); }
  });
  it('keeps the committed answer against duplicate requests and a stale competing publication', async () => {
    const { url } = await scoped(), first = new DomainDatabase(url), second = new DomainDatabase(url); await first.open(); await second.open();
    try {
      await first.commit(await first.read(), original()); const before = await first.read(), stale = await second.read();
      await expect(first.commit(before, { ...before.state, whiteboardQuestionTurns: [...original().whiteboardQuestionTurns, { ...original().whiteboardQuestionTurns[0], id: 'duplicate' }] })).rejects.toThrow();
      expect(await first.read()).toEqual(before);
      const updated = structuredClone(before.state); (updated.whiteboardQuestionTurns[0] as { reply: { text: string } }).reply.text = '确切代次已发布。'; await first.commit(before, updated);
      const competing = structuredClone(stale.state); (competing.whiteboardQuestionTurns[0] as { reply: { text: string } }).reply.text = '迟到代次不得覆盖。';
      await expect(second.commit(stale, competing)).rejects.toThrow(); expect((await second.read()).state).toEqual(updated);
    } finally { await second.close(); await first.close(); }
  });
});
