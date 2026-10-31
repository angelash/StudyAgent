import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { preparedLibrary, libraryInitialState, actualDocx } from './paper-library-fixture.spec';
import { preparePaperSelectionChange } from './paper-selection-record';
import { paperLibraryApplication, paperLibraryCredential } from './paper-library-app.fixture.spec';

const configured = process.env.STUDY_TEST_PAPER_LIBRARY_POSTGRES_URL;
(configured ? describe : describe.skip)('actual PostgreSQL native paper-library transactions and full privacy restore', () => {
  let admin: Pool; const own = (kind: string) => 'study_paper_' + kind + '_' + randomUUID().replaceAll('-', '');
  function pool() {
    const url = new URL(configured!); if (url.hostname !== '127.0.0.1' || url.port !== '15443' || url.pathname !== '/study_paper_persistence') throw Error('Exclusive paper PostgreSQL fixture required');
    return admin ??= new Pool({ connectionString: configured!, max: 2 });
  }
  async function schema() {
    const name = own('schema'); await pool().query('CREATE SCHEMA "' + name + '"'); const url = new URL(configured!); url.searchParams.set('options', '-c search_path=' + name);
    const db = new DomainDatabase(url.toString()); await db.open(); const prepared = preparedLibrary('parent', { actorRole: 'parent', actorVersion: 0, learningAccess: null });
    await db.commit(await db.read(), libraryInitialState(prepared), { enqueue: prepared.tasks }); return { db, url: url.toString(), prepared };
  }
  async function database(kind: string) { const name = own(kind); await pool().query('CREATE DATABASE "' + name + '"'); const url = new URL(configured!); url.pathname = '/' + name; url.searchParams.delete('options'); return url.toString(); }
  afterAll(async () => { await admin?.end(); });
  it('cold-reopens exact JSONB originals and rejects a second instance trying to overwrite the first revision', async () => {
    const h = await schema(), other = new DomainDatabase(h.url); await other.open();
    try {
      const first = await h.db.read(), stale = await other.read(); expect(stale).toEqual(first);
      const command = preparePaperSelectionChange({ actorId: h.prepared.actorId, authorization: h.prepared.authorization,
        input: { kind: 'revise', requestKey: 'pg-revise-original', listId: h.prepared.selection.list.id, expectedRevision: 1, expectedFingerprint: h.prepared.selection.command.result.fingerprint,
          title: '清空后的原清单', items: [] }, at: new Date().toISOString(), previous: h.prepared.selection.list, resolved: [] });
      const state = structuredClone(first.state); state.paperSelectionLists = [command.list]; state.paperSelectionCommands = [...state.paperSelectionCommands, command.command];
      await h.db.commit(first, state); await expect(other.commit(stale, state)).rejects.toThrow();
      const saved = await other.read(); expect((saved.state.paperSelectionLists[0] as any).revision).toBe(2); expect((saved.state.paperExports[0] as any).intent.listRevision).toBe(1);
      const cold = new DomainDatabase(h.url); await cold.open(); try { expect(await cold.read()).toEqual(saved); } finally { await cold.close(); }
    } finally { await other.close(); await h.db.close(); }
  });
  it('rolls task control and original command back together when the second instance supplies a stale domain snapshot', async () => {
    const h = await schema(), other = new DomainDatabase(h.url); await other.open();
    try {
      const stale = await other.read(), latest = await h.db.read(), state = structuredClone(latest.state); (state.users[0] as any).displayName = '另一实例已保存';
      await h.db.commit(latest, state); const task = (await other.tasks.get(h.prepared.tasks[0].id))!;
      const { preparePaperExportControl } = await import('./paper-export-record');
      const prepared = preparePaperExportControl({ actorId: h.prepared.actorId, authorization: h.prepared.authorization, record: h.prepared.record, task, at: new Date().toISOString(),
        input: { kind: 'cancel', requestKey: 'pg-stale-cancel', exportId: h.prepared.record.id, book: 'practice', format: 'pdf', expectedTaskVersion: task.version, expectedGeneration: task.generation } });
      const next = structuredClone(stale.state); next.paperExportCommands.push(prepared.command);
      await expect(other.commit(stale, next, { taskOperations: [prepared.operation] })).rejects.toThrow();
      expect((await other.tasks.get(task.id))?.state).toBe('queued'); expect((await other.read()).state.paperExportCommands).toHaveLength(1);
    } finally { await other.close(); await h.db.close(); }
  });
  it('uses actual privacy HTTP receipts with pg_dump/pg_restore and real file deletion in a fresh database', async () => {
    const source = await database('native'), target = await database('recovered'), keepDatabase = await database('retained'), pgBin = process.env.STUDY_TEST_PAPER_LIBRARY_PG_BIN;
    await paperLibraryApplication(async h => {
      const actor = await h.register('pg-native-paper-owner'), prepared = await h.prepare(actor.user.id, null, null, 'pg-docx-original', 'docx'), published = await h.publish(prepared);
      const { createPostgresBundle, restorePostgresBundle, verifyPostgresBundle } = require(resolve(process.cwd(), '../../scripts/operations/postgres-backup.cjs')),
        { exportLedger } = require(resolve(process.cwd(), '../../scripts/operations/privacy-ledger.cjs'));
      const bundle = join(h.directory, 'native-pg-bundle'); await createPostgresBundle({ connectionString: source, pgBin, dataDir: h.data, destination: bundle });
      const verified = await verifyPostgresBundle({ bundle, pgBin }); expect(verified.manifest.references.filter((row: any) => row.path.startsWith('data/paper-exports/'))).toHaveLength(2);
      const keepTarget = join(h.directory, 'native-pg-retained'), kept = await restorePostgresBundle({ bundle, destination: keepTarget, connectionString: keepDatabase, pgBin });
      expect(kept.paperExportFilesRetained).toBe(2); expect(readFileSync(join(keepTarget, published.file.workspace, 'artifacts-practice/practice.docx')).length).toBe(actualDocx.bytes);
      const keepDb = new DomainDatabase(keepDatabase); await keepDb.open(); try { expect(((await keepDb.read()).state.paperExports[0] as any).intent).toEqual(prepared.record.intent); } finally { await keepDb.close(); }
      const preview = await h.api(actor.token, 'get', '/privacy/account/deletion-preview'), receipt = await h.api(actor.token, 'post', '/privacy/account/delete', {
        credential: paperLibraryCredential, requestKey: 'pg-native-delete-original', confirmation: preview.confirmation, fingerprint: preview.fingerprint });
      expect(receipt.erasedPaperExports).toHaveLength(1);
      const ledger = join(h.directory, 'latest-pg-deletion-ledger.json'); await exportLedger({ connectionString: source, destination: ledger });
      const recovered = join(h.directory, 'native-pg-recovered'), result = await restorePostgresBundle({ bundle, destination: recovered, connectionString: target, pgBin, deletionLedger: ledger });
      expect(result.paperExportFilesDeleted).toBe(2); const db = new DomainDatabase(target); await db.open();
      try {
        const state = (await db.read()).state as Record<string, any[]>; expect(state.paperExports ?? []).toHaveLength(0);
        expect(state.paperExportFiles[0]).toMatchObject({ state: 'deleted', deletionReceiptId: receipt.id }); expect(JSON.stringify(state)).not.toContain('QORIGINAL7');
      } finally { await db.close(); }
      expect(readFileSync(join(h.data, published.file.workspace, 'artifacts-practice/practice.docx')).length).toBe(actualDocx.bytes);
    }, { connectionString: source });
  }, 300000);
});
