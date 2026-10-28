import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, copyFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
import { newTopicVisualId, topicVisualStage, publishTopicVisual, topicVisualFile, topicVisualDirectory } from './topic-whiteboard-visual-storage';
import { visualDirectory } from './classroom-visual-storage';
import { privacyHash } from '../privacy/privacy-records';
const root = workspaceRoot(), backup = require(resolve(root, 'scripts/operations/backup.cjs'));
const ledger = require(resolve(root, 'scripts/operations/privacy-ledger.cjs'));
const sample = resolve(root, 'resources/teaching-visuals/topic-whiteboard/sociology-intersection-no-heading-3f4d62a9.png');

describe('topic figure original files and native recovery', () => {
  let directory: string | undefined;
  afterEach(() => { vi.unstubAllEnvs(); if (directory) rmSync(directory, { recursive: true, force: true }); directory = undefined; });
  function setup() {
    directory = mkdtempSync(join(tmpdir(), 'study-topic-figure-files-')); const source = join(directory, 'source');
    vi.stubEnv('STUDY_DATA_DIR', source); const id = newTopicVisualId(), stage = topicVisualStage(id, randomUUID()); return { source, id, stage };
  }
  async function publish() {
    const setupValue = setup(), file = join(setupValue.stage, 'actual-provider-sample.png'); copyFileSync(sample, file);
    return { ...setupValue, published: await publishTopicVisual(setupValue.id, file, '匿名存储测试提示；实际供应商提示词另留原件。') };
  }
  it('decodes the actual landscape provider sample without cropping and keeps original and display bytes separately verifiable', async () => {
    const { id, published } = await publish(), row = { id, ...published };
    expect(published).toMatchObject({ width: 1536, height: 1024 }); expect(topicVisualFile(row, 'original').bytes.equals(readFileSync(sample))).toBe(true);
    expect((await sharp(topicVisualFile(row).bytes).metadata()).width).toBe(1536);
    expect(topicVisualFile(row, 'prompt').bytes.toString()).toContain('实际供应商提示词另留原件');
    const display = topicVisualFile(row); writeFileSync(display.path, Buffer.alloc(display.size)); expect(() => topicVisualFile(row)).toThrow('visual_file_changed');
  });
  it('does not cross the legacy classroom namespace and rejects orientation that changes the declared landscape dimensions', async () => {
    const { id, stage } = setup(), file = join(stage, 'rotated.png');
    expect(() => visualDirectory(id)).toThrow('visual_id_invalid'); expect(() => topicVisualDirectory('classroom_visual_' + randomUUID())).toThrow('visual_id_invalid');
    await sharp({ create: { width: 1536, height: 1024, channels: 3, background: 'white' } }).withMetadata({ orientation: 6 }).png().toFile(file);
    await expect(publishTopicVisual(id, file, 'Anonymous fixture')).rejects.toThrow('visual_dimensions_invalid');
  });
  it('backs up all current schema20 image references and cold restores their original byte identities', async () => {
    const { source, id, published } = await publish(), db = new DomainDatabase(join(source, 'study-agent.sqlite3'));
    const bundle = join(directory!, 'bundle'), restored = join(directory!, 'restored'); await db.open();
    try {
      await db.commit(await db.read(), { studioTopicWhiteboardVisuals: [{ id, ownerUserId: 'owner', requestKey: 'original', status: 'ready', ...published }] });
      await backup.createBundle({ dataDir: source, destination: bundle }); const checked = await backup.verifyBundle({ bundle });
      expect(checked.database.schemaVersions.at(-1)).toBe(23); expect(checked.verifiedFiles).toBeGreaterThanOrEqual(3);
      await backup.restoreBundle({ bundle, destination: restored });
      const recovered = new DomainDatabase(join(restored, 'study-agent.sqlite3')); await recovered.open();
      try {
        expect((await recovered.read()).state.studioTopicWhiteboardVisuals[0]).toMatchObject({ id, ...published });
        vi.stubEnv('STUDY_DATA_DIR', restored); const row = { id, ...published };
        expect(topicVisualFile(row, 'original').bytes.equals(readFileSync(sample))).toBe(true); expect(topicVisualFile(row, 'prompt').bytes.toString()).toContain('匿名存储测试');
      } finally { await recovered.close(); }
    } finally { await db.close(); }
  });
  it('applies a newer anonymous account deletion ledger to an old real bundle and physically removes the restored private image directory', async () => {
    const { source, id, published } = await publish(), db = new DomainDatabase(join(source, 'study-agent.sqlite3'));
    const bundle = join(directory!, 'bundle'), restored = join(directory!, 'restored'), ledgerPath = join(directory!, 'latest-ledger.json'); await db.open();
    try {
      await db.commit(await db.read(), { users: [{ id: 'owner', role: 'parent', principal: 'anonymous@local.test' }],
        studioTopicWhiteboardVisuals: [{ id, ownerUserId: 'owner', studentId: null, requestKey: 'original', status: 'ready', ...published }] });
      await backup.createBundle({ dataDir: source, destination: bundle });
      const before = await db.read(); await db.commit(before, { ...before.state, privacyRequests: [{ id: 'synthetic-account-deletion', kind: 'account_delete',
        actorId: 'owner', requestKey: 'controlled-ledger-key', subjectHash: privacyHash({ id: 'owner' }), inputHash: 'a'.repeat(64), completedAt: new Date().toISOString(),
        erasedStudentHashes: [], retainedStudentHashes: [], counts: { records: 0, observations: 0, activities: 0, plans: 0, conversations: 0, accessRecords: 0 } }] });
      await ledger.exportLedger({ dataDir: source, destination: ledgerPath }); await backup.restoreBundle({ bundle, destination: restored, deletionLedger: ledgerPath });
      const recovered = new DomainDatabase(join(restored, 'study-agent.sqlite3')); await recovered.open();
      try { expect((await recovered.read()).state.studioTopicWhiteboardVisuals ?? []).toHaveLength(0); } finally { await recovered.close(); }
      expect(existsSync(join(restored, 'topic-whiteboard-visuals', id))).toBe(false);
      expect((await backup.verifyBundle({ bundle })).verifiedFiles).toBeGreaterThanOrEqual(3);
    } finally { await db.close(); }
  });
});
