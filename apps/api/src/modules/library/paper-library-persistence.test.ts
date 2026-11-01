import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { PrivacyReceipt } from '@study-agent/contracts';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { actualPdf, libraryDatabase, sample } from './paper-library-fixture.spec';
import { paperExportDocumentBytes, PAPER_EXPORT_TASK_KIND, preparePaperExportControl } from './paper-export-record';
import { reservePaperExportFile, recordPaperExportRendered, publishPaperExportFile, collectPaperExportFile } from './paper-export-file-record';
import { preparePaperLibraryErasure } from './paper-export-privacy';
import { assertPaperLibraryPersisted } from './paper-export-persistence';
const { SCHEMA_VERSION: CURRENT_SCHEMA_VERSION, READY_STATE: CURRENT_READY_STATE } = require(join(__dirname, '../../../../../scripts/operations/database-reader-guard.cjs'));

async function reserve(h: Awaited<ReturnType<typeof libraryDatabase>>) {
  const task = (await h.db.tasks.claim([PAPER_EXPORT_TASK_KIND], 120000))!, prepared = reservePaperExportFile(h.record, task, new Date().toISOString()), state = await h.state();
  state.paperExportFiles = [...state.paperExportFiles ?? [], prepared.file]; await h.db.commit(await h.db.read(), state, { fence: prepared.fence });
  return { task: (await h.db.tasks.get(task.id))!, file: prepared.file };
}
async function render(h: Awaited<ReturnType<typeof libraryDatabase>>) {
  const first = await reserve(h), workspace = join(h.directory, first.file.workspace); mkdirSync(join(workspace, 'artifacts-practice'), { recursive: true });
  writeFileSync(join(workspace, 'input.json'), paperExportDocumentBytes(h.document)); copyFileSync(join(sample, 'final/practice.pdf'), join(workspace, 'artifacts-practice/practice.pdf'));
  const output = { book: 'practice' as const, format: 'pdf' as const, sha256: actualPdf.sha256, bytes: actualPdf.bytes, pageCount: actualPdf.pageCount, sourceMapHash: digest(actualPdf.sourceMap) };
  const rendered = recordPaperExportRendered(h.record, first.file, first.task, output, actualPdf.sourceMap, new Date().toISOString()), state = await h.state();
  state.paperExportFiles = state.paperExportFiles.map(file => file.id === rendered.file.id ? rendered.file : file);
  await h.db.commit(await h.db.read(), state, { fence: rendered.fence }); return { task: (await h.db.tasks.get(first.task.id))!, file: rendered.file };
}
async function publish(h: Awaited<ReturnType<typeof libraryDatabase>>) {
  const rendered = await render(h), publication = publishPaperExportFile(h.record, rendered.file, rendered.task, actualPdf.sourceMap, new Date().toISOString()), state = await h.state();
  state.paperExports = state.paperExports.map(row => row.id === publication.record.id ? publication.record : row); state.paperExportFiles = state.paperExportFiles.map(row => row.id === publication.file.id ? publication.file : row);
  await h.db.commit(await h.db.read(), state, { fence: publication.fence }); return publication;
}
function deletion(h: Awaited<ReturnType<typeof libraryDatabase>>, student = false): PrivacyReceipt {
  return { id: 'deletion-real-sql', actorId: 'parent', kind: student ? 'student_delete' : 'account_delete', subjectHash: digest({ id: student ? 'child' : 'parent' }), requestKey: 'delete-fixture-original', inputHash: digest('confirmed-fixture'),
    completedAt: new Date().toISOString(), counts: { records: 5, observations: 0, activities: 0, plans: 0, conversations: 0, accessRecords: 0 }, erasedStudentHashes: student ? [digest({ id: 'child' })] : [], retainedStudentHashes: [] };
}

describe('registered SQLite paper-library transactions, real files and deletion fences', () => {
  it('persists all original rows in the current schema and cold-reopens without rewriting them', async () => {
    const h = await libraryDatabase(true); try {
      const before = await h.db.read(); await h.close(); const db = new DomainDatabase(h.location); await db.open();
      try { expect(await db.read()).toEqual(before); } finally { await db.close(); }
      const raw = new DatabaseSync(h.location, { readOnly: true }); try {
        expect(raw.prepare('SELECT MAX(version) version FROM schema_migrations').get()!.version).toBe(CURRENT_SCHEMA_VERSION);
        expect(raw.prepare('SELECT state FROM study_restore_guard WHERE id=1').get()!.state).toBe(CURRENT_READY_STATE);
      } finally { raw.close(); }
    } finally { await h.close(); }
  });
  it('publishes a verified existing real PDF through the durable domain/queue completion transaction', async () => {
    const h = await libraryDatabase(); try {
      const result = await publish(h); expect((await h.db.tasks.get(h.tasks[0].id))?.state).toBe('succeeded');
      expect(readFileSync(join(h.directory, result.file.workspace, 'artifacts-practice/practice.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
      const before = await h.db.read(); await h.close(); const db = new DomainDatabase(h.location); await db.open(); try { expect(await db.read()).toEqual(before); } finally { await db.close(); }
    } finally { await h.close(); }
  });
  it.each(['actor', 'publication', 'access', 'diagnostic'] as const)('rejects a late new IO checkpoint after current %s changed and rolls the task checkpoint back', async field => {
    const h = await libraryDatabase(field === 'access' || field === 'diagnostic'); try {
      const first = await reserve(h), state = await h.state();
      if (field === 'actor') { const actor = state.users.find(row => row.id === h.actorId); actor.status = 'disabled'; actor.version++; }
      if (field === 'publication') state.paperPublications[0].status = 'withdrawn';
      if (field === 'access') state.studentLearningAccess[0].status = 'disabled';
      if (field === 'diagnostic') state.diagnosticSessions = [{ id: 'new-active-diagnostic', studentId: 'child', status: 'in_progress' }];
      await h.db.commit(await h.db.read(), state);
      const output = { book: 'practice' as const, format: 'pdf' as const, sha256: actualPdf.sha256, bytes: actualPdf.bytes, pageCount: 1, sourceMapHash: digest(actualPdf.sourceMap) },
        prepared = recordPaperExportRendered(h.record, first.file, first.task, output, actualPdf.sourceMap, new Date().toISOString()), next = await h.state(); next.paperExportFiles = [prepared.file];
      await expect(h.db.commit(await h.db.read(), next, { fence: prepared.fence })).rejects.toThrow('write_integrity');
      expect((await h.db.tasks.get(first.task.id))?.progress).toMatchObject({ stage: 'reserved' });
    } finally { await h.close(); }
  });
  it('cancels and retries with original commands in the same persistent transaction', async () => {
    const h = await libraryDatabase(); try {
      for (const [index, kind] of (['cancel', 'retry'] as const).entries()) {
        const task = (await h.db.tasks.get(h.tasks[0].id))!, prepared = preparePaperExportControl({ actorId: h.actorId, authorization: h.authorization, record: h.record, task, at: new Date().toISOString(),
          input: { kind, requestKey: 'actual-control-' + index, exportId: h.record.id, book: 'practice', format: 'pdf', expectedTaskVersion: task.version, expectedGeneration: task.generation } }), state = await h.state();
        state.paperExportCommands.push(prepared.command); await h.db.commit(await h.db.read(), state, { taskOperations: [prepared.operation] });
      }
      expect(await h.db.tasks.get(h.tasks[0].id)).toMatchObject({ state: 'queued', generation: 2 });
      const state = await h.state(); state.paperExportCommands[0].input.title = '静默重写'; await expect(h.db.commit(await h.db.read(), state)).rejects.toThrow('write_integrity');
    } finally { await h.close(); }
  });
  it('rolls a real completion fence back when the author is disabled after rendering', async () => {
    const h = await libraryDatabase(); try {
      const rendered = await render(h), closed = await h.state(); closed.users.find(row => row.id === h.actorId).status = 'disabled'; closed.users.find(row => row.id === h.actorId).version++;
      await h.db.commit(await h.db.read(), closed);
      const result = publishPaperExportFile(h.record, rendered.file, rendered.task, actualPdf.sourceMap, new Date().toISOString()), state = await h.state();
      state.paperExports = [result.record]; state.paperExportFiles = [result.file];
      await expect(h.db.commit(await h.db.read(), state, { fence: result.fence })).rejects.toThrow('write_integrity');
      expect(await h.db.tasks.get(h.tasks[0].id)).toMatchObject({ state: 'running', result: null }); expect((await h.state()).paperExports[0].slots[0].published).toBeNull();
    } finally { await h.close(); }
  });
  it('restores a queued frozen intent as cancelled and requires a real explicit retry generation', async () => {
    const h = await libraryDatabase(); try {
      const { createBundle, restoreBundle } = require(require('node:path').resolve(process.cwd(), '../../scripts/operations/backup.cjs'));
      const { dirname, basename } = require('node:path'), bundle = join(dirname(h.directory), basename(h.directory) + '-queued-backup'), recovered = join(dirname(h.directory), basename(h.directory) + '-queued-recovered');
      await createBundle({ dataDir: h.directory, destination: bundle });
      await restoreBundle({ bundle, destination: recovered }); const db = new DomainDatabase(join(recovered, 'study-agent.sqlite3')); await db.open();
      try {
        const task = (await db.tasks.get(h.tasks[0].id))!; expect(task).toMatchObject({ state: 'cancelled', generation: 1, errorCode: 'restored_paper_export_fence' });
        expect(((await db.read()).state.paperExports[0] as any).intent).toEqual(h.record.intent);
        const prepared = preparePaperExportControl({ actorId: h.actorId, authorization: h.authorization, record: h.record, task, at: new Date().toISOString(), input: {
          kind: 'retry', requestKey: 'retry-restored-original', exportId: h.record.id, book: 'practice', format: 'pdf', expectedTaskVersion: task.version, expectedGeneration: task.generation } });
        const before = await db.read(), state = structuredClone(before.state); state.paperExportCommands.push(prepared.command);
        await db.commit(before, state, { taskOperations: [prepared.operation] }); expect(await db.tasks.get(task.id)).toMatchObject({ state: 'queued', generation: 2 });
      } finally { await db.close(); }
    } finally { await h.close(); }
  });
  it('erases private rows, binds actual registered files and cancels a running task atomically', async () => {
    const h = await libraryDatabase(); try {
      const first = await reserve(h), state = await h.state(), receipt = deletion(h), result = preparePaperLibraryErasure(state, state.paperExports, receipt, 'live');
      state.paperExportFiles = result.files; state.privacyRequests = [receipt]; for (const name of ['paperExports', 'paperExportCommands', 'paperSelectionLists', 'paperSelectionCommands']) state[name] = [];
      state.users = state.users.filter(row => row.id !== h.actorId); await h.db.commit(await h.db.read(), state, { enqueue: result.enqueue });
      expect((await h.db.tasks.get(first.task.id))?.state).toBe('cancel_requested'); expect((await h.state()).paperExportFiles[0].deletionReceiptId).toBe(receipt.id);
      const before = await h.db.read(); await h.close(); const db = new DomainDatabase(h.location); await db.open(); try { expect(await db.read()).toEqual(before); } finally { await db.close(); }
    } finally { await h.close(); }
  });
  it('keeps an earlier cleanup task when deletion occurs after cleanup already started or completed', async () => {
    const h = await libraryDatabase(); try {
      const first = await reserve(h); await h.db.tasks.fail(first.task.id, first.task.leaseToken!, 'fixture_failure', false);
      const scheduled = collectPaperExportFile(first.file, null, new Date().toISOString()), state = await h.state(); state.paperExportFiles = [scheduled.file];
      await h.db.commit(await h.db.read(), state, { enqueue: [scheduled.task] });
      const cleanup = (await h.db.tasks.claim(['library.paper-export.cleanup']))!, deleted = await h.state(); deleted.paperExportFiles[0].state = 'deleted'; deleted.paperExportFiles[0].updatedAt = new Date().toISOString();
      await h.db.commit(await h.db.read(), deleted, { fence: { id: cleanup.id, token: cleanup.leaseToken!, result: { ...scheduled.task.payload, filesFinished: true } } });
      const receipt = deletion(h), current = await h.state(), result = preparePaperLibraryErasure(current, current.paperExports, receipt, 'live');
      current.paperExportFiles = result.files; current.privacyRequests = [receipt]; for (const name of ['paperExports', 'paperExportCommands', 'paperSelectionLists', 'paperSelectionCommands']) current[name] = [];
      expect(result.enqueue).toHaveLength(0); await h.db.commit(await h.db.read(), current);
      expect((await h.state()).paperExportFiles[0]).toMatchObject({ state: 'deleted', cleanupTaskId: cleanup.id, deletionReceiptId: receipt.id });
    } finally { await h.close(); }
  });
  it('refuses to erase student exposure facts through another guardian account receipt', async () => {
    const h = await libraryDatabase(true); try {
      const state = await h.state(), receipt = deletion(h); receipt.retainedStudentHashes = [digest({ id: 'child' })]; state.privacyRequests = [receipt]; state.paperSourceExposures = [];
      await expect(h.db.commit(await h.db.read(), state)).rejects.toThrow('write_integrity');
    } finally { await h.close(); }
  });
  it('rejects private record deletion without a real scope receipt and preserves the original state', async () => {
    const h = await libraryDatabase(); try {
      const before = await h.db.read(), state = await h.state(); for (const name of ['paperSelectionLists', 'paperSelectionCommands', 'paperExports', 'paperExportCommands']) state[name] = [];
      await expect(h.db.commit(before, state)).rejects.toThrow(); expect(await h.db.read()).toEqual(before);
    } finally { await h.close(); }
  });
});
