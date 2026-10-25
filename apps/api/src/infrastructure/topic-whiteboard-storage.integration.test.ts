import { describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { accountRecords, anonymizeSharedAttribution, portableRecords, studentRecords } from '../modules/privacy/privacy-records';
const backup = require(resolve(__dirname, '../../../../scripts/operations/backup.cjs'));

describe('AI topic whiteboard schema and private original records', () => {
  it('upgrades a real schema15 database while retaining original legacy whiteboards and adds the two intended constraints', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-topic-migrate-')), location = join(directory, 'study-agent.sqlite3');
    let db: DomainDatabase | undefined;
    try {
      db = new DomainDatabase(location); await db.open();
      const legacy = { id: 'old-whiteboard', studentId: 'child', fingerprint: 'unchanged-original', scenes: [{ id: 'old-scene', narration: '原稿完整保留。' }] };
      await db.commit(await db.read(), { studioWhiteboards: [legacy] }); await db.close(); db = undefined;
      const old = new DatabaseSync(location); old.exec('DROP INDEX topic_whiteboard_prepare_request;DROP INDEX topic_whiteboard_publication_draft;DELETE FROM schema_migrations WHERE version=16;'); old.close();
      db = new DomainDatabase(location); await db.open(); expect((await db.read()).state.studioWhiteboards).toEqual([legacy]);
      const probe = new DatabaseSync(location, { readOnly: true });
      try { expect(probe.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 16 });
        expect(probe.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'topic_whiteboard_%' ORDER BY name").all().map((row: any) => row.name))
          .toEqual(['topic_whiteboard_prepare_request', 'topic_whiteboard_publication_draft']);
      } finally { probe.close(); }
    } finally { await db?.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  it('prevents duplicate original prepare commands and duplicate confirmation products without losing the prior records', async () => {
    const db = new DomainDatabase(':memory:'); await db.open();
    try {
      const initial = { studioTopicWhiteboardDrafts: [{ id: 'draft-a', ownerUserId: 'owner', requestKey: 'same-original-key' }],
        studioTopicWhiteboards: [{ id: 'board-a', ownerUserId: 'owner', sourceDraftId: 'draft-a' }] };
      await db.commit(await db.read(), initial);
      const before = await db.read(); await expect(db.commit(before, { ...before.state,
        studioTopicWhiteboardDrafts: [...before.state.studioTopicWhiteboardDrafts, { id: 'draft-b', ownerUserId: 'owner', requestKey: 'same-original-key' }] })).rejects.toThrow('UNIQUE');
      const next = await db.read(); await expect(db.commit(next, { ...next.state,
        studioTopicWhiteboards: [...next.state.studioTopicWhiteboards, { id: 'board-b', ownerUserId: 'other', sourceDraftId: 'draft-a' }] })).rejects.toThrow('UNIQUE');
      expect((await db.read()).state).toEqual(initial);
    } finally { await db.close(); }
  });
  it('separates private drafts, shared child boards and private adult boards in deletion and portable exports', () => {
    const makeDraft = (ownerUserId: string, studentId: string | null) => ({ id: 'draft-' + ownerUserId, ownerUserId, studentId,
      authorization: { sessionTokenHash: 'PRIVATE AUTH', guardianId: 'first' }, commands: [{ actorUserId: ownerUserId }], taskId: 'private-task',
      prepared: { context: 'PRIVATE FROZEN CONTEXT', input: { prompt: '本人主题 ' + ownerUserId, objective: '核对条件' }, modelId: 'deepseek-v4-flash' }, content: { title: '保留本人完整稿' } });
    const store: any = { students: [{ id: 'child', userId: 'learner' }], users: [{ id: 'learner', role: 'student' }],
      studioTopicWhiteboardDrafts: [makeDraft('first', 'child'), makeDraft('second', 'child'), makeDraft('adult', null)],
      studioTopicWhiteboards: [{ id: 'shared', ownerUserId: 'first', studentId: 'child', sourceDraftId: 'draft-first', title: '共同孩子的原白板', origin: { draftId: 'draft-first', modelId: 'deepseek-v4-flash' } },
        { id: 'private-adult', ownerUserId: 'first', studentId: null, sourceDraftId: 'another-draft', title: '本人成人白板' }] };
    const child = studentRecords(store, 'child'); expect(child.studioTopicWhiteboardDrafts.map(row => row.id)).toEqual(['draft-first', 'draft-second']);
    const exported = portableRecords(child, 'second'); expect(exported.studioTopicWhiteboardDrafts.map((row: any) => row.id)).toEqual(['draft-second']);
    expect(exported.studioTopicWhiteboards.map((row: any) => row.id)).toEqual(['shared']);
    expect((exported.studioTopicWhiteboards[0] as any).origin.draftId).toBeNull();
    expect((portableRecords(child, 'first').studioTopicWhiteboards[0] as any).origin.draftId).toBe('draft-first');
    for (const secret of ['PRIVATE AUTH', 'PRIVATE FROZEN CONTEXT', 'private-task', 'draft-first']) expect(JSON.stringify(exported)).not.toContain(secret);
    const closing = accountRecords(store, 'first', 'first@local.test');
    expect(closing.studioTopicWhiteboardDrafts.map(row => row.id)).toEqual(['draft-first']);
    expect(closing.studioTopicWhiteboards.map(row => row.id)).toEqual(['private-adult']);
    anonymizeSharedAttribution(store, ['child'], 'first'); expect(store.studioTopicWhiteboards[0].ownerUserId).toBe('deleted-account:shared');
    expect(store.studioTopicWhiteboardDrafts[1].authorization.guardianId).toBe('deleted-account');
  });
  it('backs up, verifies and cold restores actual schema16 original topic records without modifying them', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-topic-backup-')), source = join(directory, 'source'), bundle = join(directory, 'bundle'), restored = join(directory, 'restored');
    const db = new DomainDatabase(join(source, 'study-agent.sqlite3')); await db.open();
    try {
      const initial = { studioTopicWhiteboardDrafts: [{ id: 'draft', ownerUserId: 'owner', requestKey: 'original', prepared: { input: { prompt: '完整原主题' } } }],
        studioTopicWhiteboards: [{ id: 'board', ownerUserId: 'owner', sourceDraftId: 'draft', studentId: null, title: '完整原稿' }] };
      await db.commit(await db.read(), initial); await backup.createBundle({ dataDir: source, destination: bundle });
      const verified = await backup.verifyBundle({ bundle }); expect(verified.database.schemaVersions.at(-1)).toBe(16);
      await backup.restoreBundle({ bundle, destination: restored }); const recovered = new DomainDatabase(join(restored, 'study-agent.sqlite3')); await recovered.open();
      try { const state = (await recovered.read()).state; expect(state.studioTopicWhiteboardDrafts).toEqual(initial.studioTopicWhiteboardDrafts); expect(state.studioTopicWhiteboards).toEqual(initial.studioTopicWhiteboards); expect(state.events).toEqual([expect.objectContaining({ eventName: 'operations.restored' })]); } finally { await recovered.close(); }
    } finally { await db.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
