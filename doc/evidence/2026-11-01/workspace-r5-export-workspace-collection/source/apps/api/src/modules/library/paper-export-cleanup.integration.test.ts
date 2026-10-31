import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, symlinkSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { paperLibraryApplication as application, paperLibraryCredential as credential } from './paper-library-app.fixture.spec';
import { reservePaperExportFile } from './paper-export-file-record';
import { paperExportDocumentBytes, PAPER_EXPORT_TASK_KIND } from './paper-export-record';

const configured = process.env.STUDY_TEST_PAPER_EXPORT_CLEANUP_POSTGRES_URL;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
const options = () => {
  if (configured) { const url = new URL(configured); if (url.hostname !== '127.0.0.1' || url.port !== '15448' || url.pathname !== '/study_paper_export_cleanup') throw Error('Owned generated cleanup PostgreSQL database required'); }
  return { connectionString: configured };
};
async function scope<T>(fn: (h: any) => Promise<T>, wholeDatabase = false) {
  const scopedOptions = options();
  if (configured) {
    const pool = new Pool({ connectionString: configured, max: 1 }), name = 'cleanup_' + randomUUID().replaceAll('-', '');
    try { await pool.query((wholeDatabase ? 'CREATE DATABASE "' : 'CREATE SCHEMA "') + name + '"'); } finally { await pool.end(); }
    const url = new URL(configured); if (wholeDatabase) url.pathname = '/' + name; else url.searchParams.set('options', '-c search_path=' + name); scopedOptions.connectionString = url.toString();
  }
  return application(async h => {
    const worker = h.app.get(load('modules/library/paper-export-cleanup-worker.service').PaperExportCleanupWorkerService); worker.collectionDelayMs = 1;
    const workspacePath = (file: any) => join(h.data, file.workspace);
    const deletion = async (actor: any) => { const preview = await h.api(actor.token, 'get', '/privacy/account/deletion-preview'); return h.api(actor.token, 'post', '/privacy/account/delete', { credential, requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint }); };
    const file = (id: string) => h.store.requestContext(() => structuredClone(h.store.find('paperExportFiles', { id })));
    const settle = async (id: string) => {
      const start = Date.now(); while (Date.now() - start < 5000) { await worker.runNext(false); const current = await file(id); if (current?.state === 'deleted') return current; await new Promise(resolve => setTimeout(resolve, 10)); }
      throw Error('Actual cleanup task did not finish; durable reason retained');
    };
    return fn({ ...h, worker, deletion, file, settle, workspacePath });
  }, scopedOptions);
}
describe('actual registered export workspace cleanup and private native receipts on ' + (configured ? 'PostgreSQL' : 'SQLite'), () => {
  it('physically removes actual published bytes only after real author deletion and commits the exact native completion', async () => scope(async h => {
    const actor = await h.register('cleanup-author-' + randomUUID()), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared), original = h.workspacePath(published.file);
    const receipt = await h.deletion(actor); expect(existsSync(join(original, 'input.json'))).toBe(true);
    const current = await h.settle(published.file.id); expect(current.deletionReceiptId).toBe(receipt.id); expect(existsSync(original)).toBe(false);
    const task = await h.store.tasks.get(current.cleanupTaskId); expect(task.state).toBe('succeeded'); expect(task.result).toEqual({ ...task.payload, filesFinished: true });
    const state = (await h.cold()).state; expect(state.paperExports ?? []).toHaveLength(0); expect(state.paperExportFiles[0].state).toBe('deleted'); expect(JSON.stringify(state)).not.toContain('QORIGINAL7');
    const marker = join(h.data, 'paper-exports/control', current.workspace.split('/')[1], 'revoked.json'); expect(JSON.parse(readFileSync(marker, 'utf8')).format).toBe('study-export-workspace-revocation-v1');
    await expect(load('infrastructure/studio-file-coordination').acquireStudioFileLease(h.data, 'paper-export', current.workspace.split('/')[1])).rejects.toThrow('已回收');
  }), 90000);
  it('keeps every published reference and its bytes when no actual deletion or abandoned attempt authorizes collection', async () => scope(async h => {
    const actor = await h.register('cleanup-retained-' + randomUUID()), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared), path = join(h.workspacePath(published.file), 'artifacts-practice/practice.pdf'), before = sha(readFileSync(path));
    await h.worker.sweep(); expect(await h.worker.runNext(false)).toBe(false); expect(sha(readFileSync(path))).toBe(before); expect((await h.file(published.file.id)).state).toBe('available');
  }), 90000);
  it('defers for a real open reader handle and file lease, then collects after the reader releases both', async () => scope(async h => {
    const actor = await h.register('cleanup-reader-' + randomUUID()), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared), root = h.workspacePath(published.file), path = join(root, 'artifacts-practice/practice.pdf');
    const coordination = load('infrastructure/studio-file-coordination'), release = await coordination.acquireStudioFileLease(h.data, 'paper-export', published.file.workspace.split('/')[1]), handle = await fs.open(path, 'r');
    try {
      await h.deletion(actor); expect(await h.worker.runNext(false)).toBe(true); const file = await h.file(published.file.id), task = await h.store.tasks.get(file.cleanupTaskId);
      expect(task).toMatchObject({ state: 'retry_wait', attempts: 0, errorCode: 'paper_export_collection_writer_or_reader_active' }); expect(existsSync(join(root, 'input.json'))).toBe(true); expect(sha(await handle.readFile())).toBe(published.file.output.sha256);
    } finally { await handle.close(); await release(); }
    await h.settle(published.file.id); expect(existsSync(root)).toBe(false);
  }), 90000);
  it('retains an actual unknown file and all original bytes, cold-reads the waiting state, and resumes after that generated sentinel is explicitly removed', async () => scope(async h => {
    const actor = await h.register('cleanup-unknown-' + randomUUID()), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared), root = h.workspacePath(published.file), unknown = join(root, 'unknown-preserve.txt'), pdf = join(root, 'artifacts-practice/practice.pdf'), before = sha(readFileSync(pdf));
    writeFileSync(unknown, 'Generated unknown sentinel, exact bytes preserved'); await h.deletion(actor); await h.worker.runNext(false);
    const current = await h.file(published.file.id), task = await h.store.tasks.get(current.cleanupTaskId); expect(task.state).toBe('retry_wait');
    expect(readFileSync(unknown, 'utf8')).toBe('Generated unknown sentinel, exact bytes preserved'); expect(sha(readFileSync(pdf))).toBe(before); expect(existsSync(join(root, 'input.json'))).toBe(true);
    expect((await h.cold()).state.paperExportFiles[0].state).toBe('collecting');
    unlinkSync(unknown); await h.settle(published.file.id); expect(existsSync(root)).toBe(false);
  }), 90000);
  it('refuses an actual junction in a registered workspace and preserves the generated external target', async () => scope(async h => {
    const actor = await h.register('cleanup-junction-' + randomUUID()), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared), root = h.workspacePath(published.file), target = join(h.directory, 'kept-junction-target');
    mkdirSync(target); writeFileSync(join(target, 'sentinel.txt'), 'Generated target must survive'); symlinkSync(target, join(root, 'untrusted-link'), 'junction');
    await h.deletion(actor); await h.worker.runNext(false); const file = await h.file(published.file.id); expect(file.state).toBe('collecting'); expect((await h.store.tasks.get(file.cleanupTaskId)).state).toBe('retry_wait');
    expect(readFileSync(join(target, 'sentinel.txt'), 'utf8')).toBe('Generated target must survive'); expect(existsSync(join(root, 'input.json'))).toBe(true);
  }), 90000);
  it('sweeps an actual failed reserved attempt and collects its known workspace without a fake privacy receipt', async () => scope(async h => {
    const actor = await h.register('cleanup-failed-' + randomUUID()), prepared = await h.prepare(actor.user.id), task = await h.store.tasks.claim([PAPER_EXPORT_TASK_KIND]);
    const reserved = reservePaperExportFile(prepared.record, task, new Date().toISOString()); await h.store.transaction(() => h.store.append('paperExportFiles', reserved.file), reserved.fence);
    await load('infrastructure/studio-file-coordination').registerPaperExportWriterProtocol(h.data, reserved.file.workspace.split('/')[1]);
    const root = h.workspacePath(reserved.file); mkdirSync(root, { recursive: true }); writeFileSync(join(root, 'input.json'), paperExportDocumentBytes(prepared.document)); writeFileSync(join(root, 'supervisor-practice.log'), 'Generated failed-attempt log');
    await h.store.tasks.fail(task.id, task.leaseToken, 'paper_export_render_failed', false); await h.worker.sweep(); const waiting = await h.file(reserved.file.id); expect(waiting.deletionReceiptId).toBeNull();
    await h.settle(reserved.file.id); expect(existsSync(root)).toBe(false); const state = (await h.cold()).state; expect(state.privacyRequests ?? []).toHaveLength(0); expect(state.paperExports).toHaveLength(1);
  }), 90000);
  it('recovers an actual cancelled maintenance task through the native retry while preserving its exact file identity', async () => scope(async h => {
    const actor = await h.register('cleanup-retry-' + randomUUID()), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared); await h.deletion(actor);
    const original = await h.file(published.file.id), task = await h.store.tasks.get(original.cleanupTaskId);
    await h.store.tasks.cancel(task.id, task.version, 'system-paper-export'); expect((await h.store.tasks.get(task.id)).state).toBe('cancelled');
    await h.worker.sweep(); const retry = await h.store.tasks.get(task.id); expect(retry.generation).toBe(task.generation + 1);
    const current = await h.settle(original.id); expect(current.id).toBe(original.id); expect(current.generation).toBe(original.generation); expect(existsSync(h.workspacePath(original))).toBe(false); await h.cold();
  }), 90000);
  it('keeps a real legacy workspace without dual-writer proof instead of inferring that an old supervisor stopped', async () => scope(async h => {
    const actor = await h.register('cleanup-legacy-' + randomUUID()), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared), root = h.workspacePath(published.file);
    unlinkSync(join(h.data, 'paper-exports/control', published.file.workspace.split('/')[1], 'writer-protocol.json'));
    const before = sha(readFileSync(join(root, 'artifacts-practice/practice.pdf'))); await h.deletion(actor); await h.worker.runNext(false);
    const file = await h.file(published.file.id), task = await h.store.tasks.get(file.cleanupTaskId); expect(task).toMatchObject({ state: 'retry_wait', attempts: 0, errorCode: 'paper_export_collection_writer_protocol_unknown' });
    expect(sha(readFileSync(join(root, 'artifacts-practice/practice.pdf')))).toBe(before); expect(existsSync(join(root, 'input.json'))).toBe(true); await h.cold();
  }), 90000);
  it('finishes a reserved attempt that never created a workspace and permanently fences late acquisition', async () => scope(async h => {
    const actor = await h.register('cleanup-absent-' + randomUUID()), prepared = await h.prepare(actor.user.id), task = await h.store.tasks.claim([PAPER_EXPORT_TASK_KIND]);
    const reserved = reservePaperExportFile(prepared.record, task, new Date().toISOString()); await h.store.transaction(() => h.store.append('paperExportFiles', reserved.file), reserved.fence);
    await h.store.tasks.fail(task.id, task.leaseToken, 'paper_export_render_failed', false); await h.worker.sweep(); await h.settle(reserved.file.id);
    expect(existsSync(h.workspacePath(reserved.file))).toBe(false);
    await expect(load('infrastructure/studio-file-coordination').acquireStudioFileLease(h.data, 'paper-export', reserved.file.workspace.split('/')[1])).rejects.toThrow('已回收'); await h.cold();
  }), 90000);
  it('preserves published learner files for a remaining guardian and physically collects only after final student deletion', async () => scope(async h => {
    const first = await h.register('cleanup-first-' + randomUUID()), second = await h.register('cleanup-second-' + randomUUID());
    const child = (await h.api(first.token, 'post', '/students', { nickname: '合成共同监护回收档案', grade: 3, preferredSessionMinutes: 10, defaultVersionMap: { math: 'original', chinese: '', english: '' } })).profile;
    const invitation = await h.api(first.token, 'post', `/students/${child.id}/invitations`, { recipientPrincipal: second.user.principal });
    await h.api(second.token, 'post', `/parents/${second.user.id}/bindings`, { studentId: child.id, inviteToken: invitation.token });
    await h.api(first.token, 'post', `/students/${child.id}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '共同监护下真实文件保留与回收验证' });
    const access = await h.store.requestContext(() => h.store.find('studentLearningAccess', { studentId: child.id }));
    const prepared = await h.prepare(access.userId, child.id, first.user.id), published = await h.publish(prepared), root = h.workspacePath(published.file), path = join(root, 'artifacts-practice/practice.pdf'), original = sha(readFileSync(path));
    const before = (await h.cold()).state.paperSourceExposures; await h.deletion(first); await h.worker.sweep(); expect(await h.worker.runNext(false)).toBe(false);
    expect((await h.file(published.file.id)).state).toBe('available'); expect(sha(readFileSync(path))).toBe(original); expect((await h.cold()).state.paperSourceExposures).toEqual(before);
    const preview = await h.api(second.token, 'get', `/privacy/students/${child.id}/deletion-preview`), receipt = await h.api(second.token, 'post', `/privacy/students/${child.id}/delete`, { credential, requestKey: randomUUID(), confirmation: preview.confirmation, fingerprint: preview.fingerprint });
    const file = await h.settle(published.file.id); expect(file.deletionReceiptId).toBe(receipt.id); expect(existsSync(root)).toBe(false); expect((await h.cold()).state.paperSourceExposures ?? []).toHaveLength(0);
  }), 90000);
  it('collects an expired same-generation token while preserving the current actual attempt and its writer lease', async () => scope(async h => {
    const actor = await h.register('cleanup-expired-' + randomUUID()), prepared = await h.prepare(actor.user.id), first = await h.store.tasks.claim([PAPER_EXPORT_TASK_KIND], 80);
    const old = reservePaperExportFile(prepared.record, first, new Date().toISOString()); await h.store.transaction(() => h.store.append('paperExportFiles', old.file), old.fence);
    const coordination = load('infrastructure/studio-file-coordination');
    const make = async (file: any) => { await coordination.registerPaperExportWriterProtocol(h.data, file.workspace.split('/')[1]); const root = h.workspacePath(file); mkdirSync(root, { recursive: true }); writeFileSync(join(root, 'input.json'), paperExportDocumentBytes(prepared.document)); };
    await make(old.file); await new Promise(resolve => setTimeout(resolve, Math.max(1, first.leaseUntil - Date.now() + 5)));
    const second = await h.store.tasks.claim([PAPER_EXPORT_TASK_KIND], 60000); expect(second.id).toBe(first.id); expect(second.generation).toBe(first.generation); expect(second.leaseToken).not.toBe(first.leaseToken);
    const current = reservePaperExportFile(prepared.record, second, new Date().toISOString()); await h.store.transaction(() => h.store.append('paperExportFiles', current.file), current.fence); await make(current.file);
    const releaseCurrent = await coordination.acquireStudioFileLease(h.data, 'paper-export', current.file.workspace.split('/')[1]);
    try {
      await h.worker.sweep(); await h.settle(old.file.id); expect(existsSync(h.workspacePath(old.file))).toBe(false); expect(readFileSync(join(h.workspacePath(current.file), 'input.json'))).toEqual(paperExportDocumentBytes(prepared.document));
      expect((await h.file(current.file.id)).state).toBe('reserved'); expect((await h.store.tasks.get(second.id)).leaseToken).toBe(second.leaseToken); await h.cold();
    } finally { await releaseCurrent(); }
  }), 90000);
  it('restores an older real native backup with the latest deletion ledger after live collection, preserving permanent revocation', async () => scope(async h => {
    const actor = await h.register('cleanup-native-' + randomUUID()), prepared = await h.prepare(actor.user.id), published = await h.publish(prepared), root = h.workspacePath(published.file);
    const native = configured ? require(resolve(process.cwd(), '../../scripts/operations/postgres-backup.cjs')) : require(resolve(process.cwd(), '../../scripts/operations/backup.cjs'));
    const bundle = join(h.directory, 'before-live-collection'), pgBin = process.env.STUDY_TEST_PAPER_EXPORT_CLEANUP_PG_BIN;
    if (configured) await native.createPostgresBundle({ connectionString: h.connectionString, pgBin, dataDir: h.data, destination: bundle });
    else await native.createBundle({ dataDir: h.data, destination: bundle });
    const receipt = await h.deletion(actor); await h.settle(published.file.id); expect(existsSync(root)).toBe(false);
    const ledger = join(h.directory, 'latest-actual-deletions.json'); await require(resolve(process.cwd(), '../../scripts/operations/privacy-ledger.cjs')).exportLedger({ ...(configured ? { connectionString: h.connectionString } : { dataDir: h.data }), destination: ledger });
    const destination = join(h.directory, 'native-restored'), target = configured ? new URL(configured) : null;
    if (target) {
      const name = 'cleanup_restore_' + randomUUID().replaceAll('-', ''), pool = new Pool({ connectionString: configured, max: 1 });
      try { await pool.query('CREATE DATABASE "' + name + '"'); } finally { await pool.end(); } target.pathname = '/' + name;
    }
    const restored = configured ? await native.restorePostgresBundle({ bundle, destination, connectionString: target!.toString(), pgBin, deletionLedger: ledger }) : await native.restoreBundle({ bundle, destination, deletionLedger: ledger });
    expect(restored.paperExportFilesDeleted).toBe(2); expect(restored.paperExportFilesRetained).toBe(0);
    const { DomainDatabase } = await import('../../infrastructure/domain-database'), cold = new DomainDatabase(target?.toString() ?? join(destination, 'study-agent.sqlite3')); await cold.open();
    try { const state = (await cold.read()).state; expect(state.paperExports ?? []).toHaveLength(0); expect(state.paperExportFiles[0]).toMatchObject({ state: 'deleted', deletionReceiptId: receipt.id }); expect(JSON.stringify(state)).not.toContain('QORIGINAL7'); } finally { await cold.close(); }
    expect(existsSync(join(destination, published.file.workspace, 'input.json'))).toBe(false);
    await expect(load('infrastructure/studio-file-coordination').acquireStudioFileLease(destination, 'paper-export', published.file.workspace.split('/')[1])).rejects.toThrow('已回收');
    expect(existsSync(root)).toBe(false);
  }, true), 300000);
});
