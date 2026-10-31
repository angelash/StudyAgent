import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { PrivacyReceipt } from '@study-agent/contracts';
import { TaskRepository, type TaskIntent, type TaskFence, type TaskOperation } from '../../infrastructure/task-repository';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { at, fixture, sourceMap } from './paper-export-fixture.spec';
import { PAPER_EXPORT_TASK_KIND, preparePaperExportControl } from './paper-export-record';
import { assertPaperExportNativeRows } from './paper-export-native';
import { assertPaperExportFile, collectPaperExportFile, paperExportErasureProof, paperExportFileIdentityFingerprint,
  paperExportFileProgress, publishPaperExportFile, recordPaperExportRendered, reservePaperExportFile, type PaperExportFileRecord } from './paper-export-file-record';

const qa = resolve(process.cwd(), '../../data/qa/paper-export-record-tests'); mkdirSync(qa, { recursive: true });
type Row = ReturnType<typeof fixture>['rows'][number];
async function harness(student = false, multi = false) {
  const value = fixture(student, !multi), directory = mkdtempSync(join(qa, 'native-')), db = new DatabaseSync(join(directory, 'queue.sqlite3'));
  let epoch = Date.parse(at), closed = false; const queue = new TaskRepository(db, undefined, () => epoch); await queue.open();
  // Explicit QA protocol table: this is not a registered DomainDatabase schema.
  db.exec('CREATE TABLE qa_export_records(collection TEXT,record_id TEXT,body TEXT,position INTEGER,PRIMARY KEY(collection,record_id))');
  const rows = (): Row[] => (db.prepare('SELECT collection,record_id,body FROM qa_export_records ORDER BY position').all() as any[]).map(row => ({ ...row, body: JSON.parse(row.body) }));
  const tasks = () => db.prepare('SELECT * FROM durable_tasks').all();
  const history = () => db.prepare('SELECT * FROM durable_task_history').all();
  const verify = (saved = rows(), taskValues = tasks(), historyValues = history()) => assertPaperExportNativeRows(saved, taskValues, historyValues);
  async function commit(saved: Row[], options: { enqueue?: TaskIntent[]; fence?: TaskFence; operations?: TaskOperation[]; verify?: boolean } = {}) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM qa_export_records');
      for (const [position, row] of saved.entries()) db.prepare('INSERT INTO qa_export_records VALUES(?,?,?,?)').run(row.collection, row.body.id ?? row.body.eventId, JSON.stringify(row.body), position);
      if (options.enqueue) await queue.insert(options.enqueue);
      if (options.operations) await queue.applyOperations(options.operations);
      if (options.fence) await queue.applyFence(options.fence);
      if (options.verify !== false) verify(); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  await commit(value.rows, { enqueue: value.tasks });
  return { ...value, db, queue, directory, rows, tasks, history, verify, commit, now: () => new Date(epoch).toISOString(), advance: (ms = 1000) => { epoch += ms; }, close: () => { if (!closed) { db.close(); closed = true; } } };
}
function replace(rows: Row[], collection: string, body: any) {
  const filtered = rows.filter(row => row.collection !== collection || row.body.id !== body.id); filtered.push({ collection, body }); return filtered;
}
async function reserve(h: Awaited<ReturnType<typeof harness>>) {
  const task = (await h.queue.claim([PAPER_EXPORT_TASK_KIND]))!, reserved = reservePaperExportFile(h.record, task, h.now());
  await h.commit([...h.rows(), { collection: 'paperExportFiles', body: reserved.file }], { fence: reserved.fence });
  return { file: reserved.file, task: (await h.queue.get(task.id))! };
}
async function rendered(h: Awaited<ReturnType<typeof harness>>) {
  const reserved = await reserve(h), map = sourceMap(h.document), output = { book: 'practice' as const, format: 'pdf' as const, sha256: digest('synthetic-output'), bytes: 200,
    pageCount: 2, sourceMapHash: digest(map) };
  const rendered = recordPaperExportRendered(h.record, reserved.file, reserved.task, output, map, h.now());
  await h.commit(replace(h.rows(), 'paperExportFiles', rendered.file), { fence: rendered.fence });
  return { file: rendered.file, task: (await h.queue.get(reserved.task.id))!, map };
}
async function control(h: Awaited<ReturnType<typeof harness>>, action: 'cancel' | 'retry', key: string) {
  const task = (await h.queue.get(h.tasks()[0].id as string))!;
  const prepared = preparePaperExportControl({ actorId: h.actorId, authorization: h.auth, record: h.record, task, at: h.now(),
    input: { kind: action, requestKey: key, exportId: h.record.id, book: 'practice', format: 'pdf', expectedTaskVersion: task.version, expectedGeneration: task.generation } });
  await h.commit([...h.rows(), { collection: 'paperExportCommands', body: prepared.command }], { operations: [prepared.operation] }); return prepared;
}
function deletion(h: Awaited<ReturnType<typeof harness>>, files: PaperExportFileRecord[]): PrivacyReceipt {
  return { id: 'privacy-delete-one', kind: 'account_delete', actorId: h.actorId, subjectHash: digest({ id: h.actorId }), requestKey: 'actual-delete-key', inputHash: digest('confirmed-delete'),
    completedAt: h.now(), counts: { records: 4, observations: 0, activities: 0, plans: 0, conversations: 0, accessRecords: 0 }, erasedStudentHashes: [], retainedStudentHashes: [],
    erasedPaperExports: [paperExportErasureProof(h.record, files)] };
}

describe('real SQLite outbox, exact controls, file checkpoints and native relations before schema registration', () => {
  it('reads actual SQL tasks and checkpoints, then publishes once through the real completion fence', async () => {
    const h = await harness(); try {
      const ready = await rendered(h), published = publishPaperExportFile(h.record, ready.file, ready.task, ready.map, h.now());
      await h.commit(replace(replace(h.rows(), 'paperExports', published.record), 'paperExportFiles', published.file), { fence: published.fence });
      expect((await h.queue.get(ready.task.id))?.state).toBe('succeeded'); expect(h.history().filter(event => event.action === 'checkpoint')).toHaveLength(2);
      expect(h.rows().find(row => row.collection === 'paperExportCommands')!.body).toEqual(h.command); expect(() => h.verify()).not.toThrow();
      await expect(h.commit(h.rows(), { fence: published.fence })).rejects.toThrow('未发布');
      await expect(h.queue.retry(ready.task.id, (await h.queue.get(ready.task.id))!.version, h.actorId)).rejects.toThrow('准确');
    } finally { h.close(); }
  });
  it('does not expose one successful slot as another book or format succeeding', async () => {
    const h = await harness(false, true); try {
      const ready = await rendered(h), published = publishPaperExportFile(h.record, ready.file, ready.task, ready.map, h.now());
      await h.commit(replace(replace(h.rows(), 'paperExports', published.record), 'paperExportFiles', published.file), { fence: published.fence });
      const row = h.rows().find(row => row.collection === 'paperExports')!.body;
      expect(row.slots.filter((slot: any) => slot.published)).toHaveLength(1); expect(h.tasks().filter(task => task.state === 'queued')).toHaveLength(3); h.verify();
    } finally { h.close(); }
  });
  it('reopens the exact SQL originals, queue and checkpoint history without reconstructing missing rows', async () => {
    const h = await harness(); try {
      await reserve(h); const before = { rows: h.rows(), tasks: h.tasks(), history: h.history() }; h.close();
      const db = new DatabaseSync(join(h.directory, 'queue.sqlite3'));
      try {
        const saved = (db.prepare('SELECT collection,record_id,body FROM qa_export_records ORDER BY position').all() as any[]).map(row => ({ ...row, body: JSON.parse(row.body) }));
        const tasks = db.prepare('SELECT * FROM durable_tasks').all(), history = db.prepare('SELECT * FROM durable_task_history').all();
        expect({ rows: saved, tasks, history }).toEqual(before); expect(() => assertPaperExportNativeRows(saved, tasks, history)).not.toThrow();
        expect(() => assertPaperExportNativeRows(saved.filter(row => row.collection !== 'paperExportCommands'), tasks, history)).toThrow('integrity');
      } finally { db.close(); }
    } finally { h.close(); }
  });
  it('requires the actual successful queue audit and current registered progress', async () => {
    const h = await harness(); try {
      const ready = await rendered(h), changedTasks = h.tasks() as any[];
      changedTasks[0].progress = JSON.stringify({ stage: 'fabricated' }); expect(() => h.verify(h.rows(), changedTasks)).toThrow('integrity');
      const published = publishPaperExportFile(h.record, ready.file, ready.task, ready.map, h.now());
      await h.commit(replace(replace(h.rows(), 'paperExports', published.record), 'paperExportFiles', published.file), { fence: published.fence });
      expect(() => h.verify(h.rows(), h.tasks(), h.history().filter(event => event.action !== 'succeeded'))).toThrow('integrity');
    } finally { h.close(); }
  });
  it('rolls the original command and SQL queue control back together on native conflict', async () => {
    const h = await harness(); try {
      const task = (await h.queue.get(h.tasks()[0].id as string))!, command = preparePaperExportControl({ actorId: h.actorId, authorization: h.auth, record: h.record, task, at: h.now(),
        input: { kind: 'cancel', requestKey: 'cancel-conflict', exportId: h.record.id, book: 'practice', format: 'pdf', expectedTaskVersion: task.version, expectedGeneration: task.generation } });
      command.command.resultHash = digest('wrong');
      await expect(h.commit([...h.rows(), { collection: 'paperExportCommands', body: command.command }], { operations: [command.operation] })).rejects.toThrow('integrity');
      expect((await h.queue.get(task.id))?.state).toBe('queued'); expect(h.history().some(event => event.action === 'cancel_requested')).toBe(false); h.verify();
    } finally { h.close(); }
  });
  it('lets cancellation win over a stale worker publication without changing the original receipt', async () => {
    const h = await harness(); try {
      const ready = await rendered(h); h.advance(); const cancelled = await control(h, 'cancel', 'cancel-running');
      expect(cancelled.command.result).toMatchObject({ previousVersion: ready.task.version, generation: 1 });
      const late = publishPaperExportFile(h.record, ready.file, ready.task, ready.map, h.now());
      await expect(h.commit(replace(replace(h.rows(), 'paperExports', late.record), 'paperExportFiles', late.file), { fence: late.fence })).rejects.toThrow('未发布');
      expect((await h.queue.get(ready.task.id))?.state).toBe('cancel_requested'); expect(h.rows().find(row => row.collection === 'paperExportFiles')!.body.state).toBe('reserved'); h.verify();
    } finally { h.close(); }
  });
  it('retries the same frozen intent with a real new generation, token and workspace', async () => {
    const h = await harness(); try {
      const first = await reserve(h); await h.queue.fail(first.task.id, first.task.leaseToken!, 'synthetic_failure', false); h.advance();
      const retried = await control(h, 'retry', 'retry-original'); expect(retried.command.result).toMatchObject({ generation: 2 });
      const secondTask = (await h.queue.claim([PAPER_EXPORT_TASK_KIND]))!, second = reservePaperExportFile(h.record, secondTask, h.now());
      await h.commit([...h.rows(), { collection: 'paperExportFiles', body: second.file }], { fence: second.fence });
      expect(second.file.workspace).not.toBe(first.file.workspace); expect(second.file.token).not.toBe(first.file.token);
      expect(h.rows().find(row => row.collection === 'paperExports')!.body.intent).toEqual(h.record.intent); h.verify();
    } finally { h.close(); }
  });
  it('retains distinct workspaces for an expired-lease reclaim within the same generation', async () => {
    const h = await harness(); try {
      const first = await reserve(h); h.advance(31000); const secondTask = (await h.queue.claim([PAPER_EXPORT_TASK_KIND]))!;
      const second = reservePaperExportFile(h.record, secondTask, h.now()); await h.commit([...h.rows(), { collection: 'paperExportFiles', body: second.file }], { fence: second.fence });
      expect(secondTask.generation).toBe(1); expect(second.file.id).not.toBe(first.file.id);
      await expect(h.commit(h.rows(), { fence: { id: first.task.id, token: first.task.leaseToken!, mode: 'checkpoint', progress: paperExportFileProgress(first.file, 'reserved') } })).rejects.toThrow('检查点'); h.verify();
    } finally { h.close(); }
  });
  it('rejects queue control outside the exact export command and wrong-generation operations', async () => {
    const h = await harness(); try {
      const task = (await h.queue.get(h.tasks()[0].id as string))!;
      await expect(h.queue.cancel(task.id, task.version, h.actorId)).rejects.toThrow('准确');
      const prepared = preparePaperExportControl({ actorId: h.actorId, authorization: h.auth, record: h.record, task, at: h.now(), input: {
        kind: 'cancel', requestKey: 'wrong-generation', exportId: h.record.id, book: 'practice', format: 'pdf', expectedTaskVersion: task.version, expectedGeneration: 1 } });
      prepared.operation.paperExportControl!.expectedGeneration = 2;
      await expect(h.commit([...h.rows(), { collection: 'paperExportCommands', body: prepared.command }], { operations: [prepared.operation] })).rejects.toThrow('准确'); h.verify();
      prepared.operation.paperExportControl!.expectedGeneration = 1; prepared.operation.actorId = 'learner';
      await expect(h.commit([...h.rows(), { collection: 'paperExportCommands', body: prepared.command }], { operations: [prepared.operation] })).rejects.toThrow('准确'); h.verify();
    } finally { h.close(); }
  });
  it('supports terminal cancellation confirmations with their own exact original command', async () => {
    const h = await harness(); try { await control(h, 'cancel', 'cancel-queued'); h.advance(); await control(h, 'cancel', 'cancel-confirmed');
      expect(h.history().filter(event => event.action === 'cancel_confirmed')).toHaveLength(1); h.verify();
    } finally { h.close(); }
  });
  it.each(['missing', 'answers', 'position', 'original', 'actor'] as const)('rejects incomplete student export exposure: %s', async field => {
    const h = await harness(true); try {
      const saved = h.rows(), exposure = saved.find(row => row.collection === 'paperSourceExposures' && row.body.input.kind === 'export')!;
      if (field === 'missing') saved.splice(saved.indexOf(exposure), 1);
      if (field === 'answers') { exposure.body.input.answers = true; exposure.body.result.answers = true; }
      if (field === 'position') exposure.body.result.sources[0].position++;
      if (field === 'original') exposure.body.input.origin.id = 'foreign-command';
      if (field === 'actor') exposure.body.actorId = 'parent';
      exposure.body.requestHash = digest({ actorId: exposure.body.actorId, studentId: exposure.body.studentId, input: exposure.body.input }); exposure.body.resultHash = digest(exposure.body.result);
      expect(() => h.verify(saved)).toThrow('integrity');
    } finally { h.close(); }
  });
  it.each(['command', 'slot', 'payload', 'owner', 'generation', 'task', 'history'] as const)('rejects broken bidirectional %s relations after public hashes are recomputed', async field => {
    const h = await harness(); try {
      const saved = h.rows(), tasks = h.tasks() as any[], history = h.history() as any[];
      if (field === 'command') saved.splice(saved.findIndex(row => row.collection === 'paperExportCommands'), 1);
      if (field === 'slot') saved.find(row => row.collection === 'paperExports')!.body.slots[0].format = 'docx';
      if (field === 'payload') { tasks[0].payload = JSON.stringify({ ...JSON.parse(tasks[0].payload), intentFingerprint: digest('foreign') }); tasks[0].payload_hash = digest(JSON.parse(tasks[0].payload)); }
      if (field === 'owner') tasks[0].owner_id = 'learner';
      if (field === 'generation') tasks[0].generation = 2;
      if (field === 'task') tasks.pop();
      if (field === 'history') history.pop();
      expect(() => h.verify(saved, tasks, history)).toThrow('integrity');
    } finally { h.close(); }
  });
  it.each(['workspace', 'token', 'output', 'checkpoint', 'identity'] as const)('rejects unregistered or changed file %s', async field => {
    const h = await harness(); try {
      const first = await reserve(h), saved = h.rows(), file = saved.find(row => row.collection === 'paperExportFiles')!.body, history = h.history() as any[];
      if (field === 'workspace') file.workspace = 'paper-exports/' + digest('another');
      if (field === 'token') file.token = '00000000-0000-4000-8000-000000000000';
      if (field === 'output') file.output = { book: 'practice', format: 'pdf', sha256: digest('late-output'), bytes: 20, pageCount: 2, sourceMapHash: digest('map') };
      if (field === 'checkpoint') history.splice(history.findIndex(event => event.action === 'checkpoint'), 1);
      if (field === 'identity') { file.actorFingerprint = digest({ id: 'learner' }); const checkpoint = history.find(event => event.action === 'checkpoint'); const detail = JSON.parse(checkpoint.detail);
        detail.progress.identityFingerprint = paperExportFileIdentityFingerprint(file); checkpoint.detail = JSON.stringify(detail); }
      expect(() => h.verify(saved, h.tasks(), history)).toThrow('integrity'); expect(first.file.output).toBeNull();
    } finally { h.close(); }
  });
  it('recognizes generation changes made by the actual restoration fence, with the real restoration audit', async () => {
    const h = await harness(); try {
      await reserve(h); h.advance(); h.db.exec('CREATE TABLE domain_records(collection TEXT,record_id TEXT,body TEXT,position INTEGER); CREATE TABLE store_meta(id INTEGER,revision INTEGER); INSERT INTO store_meta VALUES(1,1)');
      const { fenceRestoredState } = require(resolve(process.cwd(), '../../scripts/operations/restore-state.cjs'));
      await fenceRestoredState(async (sql: string, args: any[] = []) => h.db.prepare(sql).all(...args), 'synthetic-backup', 1);
      const events = (h.db.prepare('SELECT collection,record_id,body FROM domain_records').all() as any[]).map(row => ({ ...row, body: JSON.parse(row.body) }));
      await h.commit([...h.rows(), ...events]);
      expect(h.tasks()[0].generation).toBe(2); h.verify();
      expect(() => h.verify(h.rows(), h.tasks(), h.history().filter(event => event.action !== 'restored'))).toThrow('integrity');
      expect(() => h.verify(h.rows().filter(row => row.collection !== 'events'))).toThrow('integrity');
    } finally { h.close(); }
  });
  it('keeps only exact cleanup identities after a real receipt removes the private author records', async () => {
    const h = await harness(); try {
      const first = await reserve(h); h.advance(); await control(h, 'cancel', 'cancel-for-delete');
      await h.queue.fail(first.task.id, first.task.leaseToken!, 'cancelled', false); h.advance();
      const receipt = deletion(h, [first.file]), collected = collectPaperExportFile(first.file, receipt.id, h.now());
      const saved = h.rows().filter(row => !['paperExports', 'paperExportCommands', 'paperSelectionLists', 'paperSelectionCommands', 'paperExportFiles'].includes(row.collection) && !(row.collection === 'users' && row.body.id === h.actorId));
      saved.push({ collection: 'privacyRequests', body: receipt }, { collection: 'paperExportFiles', body: collected.file });
      await h.commit(saved, { enqueue: [collected.task] }); h.verify();
      expect(JSON.stringify(h.rows())).not.toContain('原文'); expect(JSON.stringify(h.rows())).not.toContain('promptHtml');
      const cleanup = (await h.queue.claim(['library.paper-export.cleanup']))!, deleted = { ...collected.file, state: 'deleted', updatedAt: h.now() };
      await h.commit(replace(h.rows(), 'paperExportFiles', deleted), { fence: { id: cleanup.id, token: cleanup.leaseToken!, result: { ...collected.task.payload, filesFinished: true } } }); h.verify();
    } finally { h.close(); }
  });
  it.each(['missing', 'scope', 'fingerprint', 'file', 'task', 'future', 'private'] as const)('rejects a fabricated deletion proof: %s', async field => {
    const h = await harness(); try {
      const first = await reserve(h); h.advance(); await control(h, 'cancel', 'cancel-before-delete'); await h.queue.fail(first.task.id, first.task.leaseToken!, 'cancelled', false); h.advance();
      const receipt = deletion(h, [first.file]), collected = collectPaperExportFile(first.file, receipt.id, h.now());
      const saved = h.rows().filter(row => !['paperExports', 'paperExportCommands', 'paperSelectionLists', 'paperSelectionCommands', 'paperExportFiles'].includes(row.collection));
      saved.push({ collection: 'privacyRequests', body: receipt }, { collection: 'paperExportFiles', body: collected.file });
      await h.commit(saved, { enqueue: [collected.task] }); const changed = h.rows(), proof = changed.find(row => row.collection === 'privacyRequests')!.body;
      if (field === 'missing') delete proof.erasedPaperExports;
      if (field === 'scope') proof.subjectHash = digest({ id: 'other' });
      if (field === 'fingerprint') proof.erasedPaperExports[0].intentFingerprint = digest('foreign');
      if (field === 'file') proof.erasedPaperExports[0].files = [];
      if (field === 'task') proof.erasedPaperExports[0].tasks[0].payloadHash = digest('foreign');
      if (field === 'future') proof.completedAt = '2026-10-31T02:00:00.000Z';
      if (field === 'private') proof.erasedPaperExports[0].title = '不允许保留正文';
      expect(() => h.verify(changed)).toThrow('integrity');
    } finally { h.close(); }
  });
  it('preserves exact deletion proofs through the latest independent ledger and rejects malformed proofs', async () => {
    const h = await harness(); try {
      const first = await reserve(h), receipt = deletion(h, [first.file]);
      const { makeLedger, readLedger } = require(resolve(process.cwd(), '../../scripts/operations/privacy-ledger.cjs'));
      const ledger = makeLedger([receipt]); writeFileSync(join(h.directory, 'latest-ledger.json'), JSON.stringify(ledger));
      expect(readLedger(join(h.directory, 'latest-ledger.json')).entries[0].erasedPaperExports).toEqual(receipt.erasedPaperExports);
      const privateProof = structuredClone(receipt) as any; privateProof.erasedPaperExports[0].sourceUrl = 'private'; expect(() => makeLedger([privateProof])).toThrow('erasure');
      const duplicated = structuredClone(receipt); duplicated.erasedPaperExports!.push(duplicated.erasedPaperExports![0]); expect(() => makeLedger([duplicated])).toThrow('erasure');
      const childKept = structuredClone(receipt); childKept.subjectHash = digest({ id: 'guardian' }); childKept.actorId = 'guardian'; childKept.retainedStudentHashes = [digest({ id: 'child' })];
      childKept.erasedPaperExports![0].studentFingerprint = digest({ id: 'child' }); expect(() => makeLedger([childKept])).toThrow('erasure');
    } finally { h.close(); }
  });
});
