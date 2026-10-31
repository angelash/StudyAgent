import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { paperLibraryApplication as application } from './paper-library-app.fixture.spec';
import { reservePaperExportFile } from './paper-export-file-record';
import { preparePaperExportControl, paperExportDocumentBytes, PAPER_EXPORT_TASK_KIND } from './paper-export-record';

const configured = process.env.STUDY_TEST_PAPER_EXPORT_CLEANUP_POSTGRES_URL;
const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
describe('actual native export generation retry with an older live writer on ' + (configured ? 'PostgreSQL' : 'SQLite'), () => {
  it('waits for the old writer despite a new generation, then collects only the old workspace while the current writer remains active', async () => {
    let connectionString: string | undefined;
    if (configured) {
      const url = new URL(configured); if (url.hostname !== '127.0.0.1' || url.port !== '15448' || url.pathname !== '/study_paper_export_cleanup') throw Error('Exclusive generated cleanup cluster required');
      const pool = new Pool({ connectionString: configured, max: 1 }), name = 'gc_generation_' + randomUUID().replaceAll('-', '');
      try { await pool.query('CREATE SCHEMA "' + name + '"'); } finally { await pool.end(); }
      url.searchParams.set('options', '-c search_path=' + name); connectionString = url.toString();
    }
    await application(async h => {
      const actor = await h.register('cleanup-generation-' + randomUUID()), prepared = await h.prepare(actor.user.id), first = await h.store.tasks.claim([PAPER_EXPORT_TASK_KIND], 60000);
      const old = reservePaperExportFile(prepared.record, first, new Date().toISOString()); await h.store.transaction(() => h.store.append('paperExportFiles', old.file), old.fence);
      const coordination = load('infrastructure/studio-file-coordination'), worker = h.app.get(load('modules/library/paper-export-cleanup-worker.service').PaperExportCleanupWorkerService); worker.collectionDelayMs = 1;
      const root = (file: any) => join(h.data, file.workspace);
      const begin = async (file: any) => {
        const release = await coordination.acquireStudioFileLease(h.data, 'paper-export', file.workspace.split('/')[1]);
        try { await coordination.registerPaperExportWriterProtocol(h.data, file.workspace.split('/')[1]); mkdirSync(root(file), { recursive: true }); writeFileSync(join(root(file), 'input.json'), paperExportDocumentBytes(prepared.document)); return release; }
        catch (error) { await release(); throw error; }
      };
      let releaseOld: (() => Promise<void>) | undefined = await begin(old.file), releaseCurrent: (() => Promise<void>) | undefined;
      try {
        await h.store.tasks.fail(first.id, first.leaseToken, 'paper_export_render_failed', false);
        const failed = await h.store.tasks.get(first.id), control = preparePaperExportControl({ actorId: actor.user.id, authorization: prepared.authorization, record: prepared.record, task: failed,
          at: new Date().toISOString(), input: { kind: 'retry', requestKey: randomUUID(), exportId: prepared.record.id, book: 'practice', format: 'pdf', expectedTaskVersion: failed.version, expectedGeneration: failed.generation } });
        await h.store.transaction(async () => { h.store.append('paperExportCommands', control.command); await h.store.controlTask(control.operation); });
        const second = await h.store.tasks.claim([PAPER_EXPORT_TASK_KIND], 60000); expect(second.generation).toBe(first.generation + 1); expect(second.leaseToken).not.toBe(first.leaseToken);
        const current = reservePaperExportFile(prepared.record, second, new Date().toISOString()); await h.store.transaction(() => h.store.append('paperExportFiles', current.file), current.fence); releaseCurrent = await begin(current.file);
        await worker.sweep(); expect(await worker.runNext(false)).toBe(true);
        const oldState = await h.store.requestContext(() => structuredClone(h.store.find('paperExportFiles', { id: old.file.id }))), waiting = await h.store.tasks.get(oldState.cleanupTaskId);
        expect(waiting).toMatchObject({ state: 'retry_wait', attempts: 0, errorCode: 'paper_export_collection_writer_or_reader_active' }); expect(existsSync(join(root(old.file), 'input.json'))).toBe(true);
        await releaseOld!(); releaseOld = undefined;
        const start = Date.now(); let complete = false;
        while (Date.now() - start < 5000) {
          await worker.runNext(false); complete = await h.store.requestContext(() => h.store.find('paperExportFiles', { id: old.file.id }).state === 'deleted'); if (complete) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(complete).toBe(true); expect(existsSync(root(old.file))).toBe(false); expect(readFileSync(join(root(current.file), 'input.json'))).toEqual(paperExportDocumentBytes(prepared.document));
        expect((await h.store.tasks.get(second.id)).leaseToken).toBe(second.leaseToken); const state = (await h.cold()).state;
        expect(state.paperExportFiles.find((file: any) => file.id === current.file.id)).toMatchObject({ state: 'reserved', generation: second.generation, token: second.leaseToken });
        expect(state.privacyRequests ?? []).toHaveLength(0); expect((await coordination.inspectStudioFileLeases(h.data, 'paper-export', current.file.workspace.split('/')[1])).some((lease: any) => lease.status === 'active')).toBe(true);
      } finally { await releaseOld?.(); await releaseCurrent?.(); }
    }, { connectionString });
  }, 120000);
});
