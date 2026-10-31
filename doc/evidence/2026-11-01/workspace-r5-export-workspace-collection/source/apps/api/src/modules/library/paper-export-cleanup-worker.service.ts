import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { studyDataRoot } from '../../infrastructure/workspace-paths';
import { acquireStudioPurgeFence, inspectStudioFileLeases, pruneDeadStudioFileLeases, revokePaperExportWorkspace, assertPaperExportWriterProtocol, assertNoFileLinks, StudioFileCollectionPending } from '../../infrastructure/studio-file-coordination';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { PAPER_EXPORT_CLEANUP_KIND, PAPER_EXPORT_TASK_KIND, type PaperExportRecord } from './paper-export-record';
import { assertPaperExportFile, collectPaperExportFile, paperExportCleanupPayload, paperExportFileIdentityFingerprint } from './paper-export-file-record';
import { assertPaperExportErasureProofs } from './paper-export-native';
import { inspectPaperExportWorkspace, deletePaperExportWorkspace } from './paper-export-workspace-collection';

const wait = (code: string): never => { throw new StudioFileCollectionPending('paper_export_collection_' + code); };
@Injectable()
export class PaperExportCleanupWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>; private current?: Promise<boolean>; private stopping = false; private sweptAt = 0; private collectionDelayMs = 30000;
  private readonly logger = new Logger(PaperExportCleanupWorkerService.name);
  constructor(private readonly store: InMemoryStoreService) {}
  onApplicationBootstrap() { if (process.env.STUDY_WORKER_ENABLED === 'false' || !this.store.persistence.durable) return;
    this.timer = setInterval(() => void this.runNext().catch(() => this.logger.warn('Paper export collection remains durable')), 2000); this.timer.unref(); }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); await this.current?.catch(() => {}); }
  async runNext(sweep = true) { if (this.current || this.stopping) return false; const work = this.execute(sweep); this.current = work; try { return await work; } finally { this.current = undefined; } }
  async sweep() {
    for (const task of await this.store.tasks.recoverablePaperExportCollections()) await this.store.transaction(() => this.store.controlTask({ id: task.id, action: 'retry', expectedVersion: task.version, actorId: 'system-paper-export' }));
    await this.store.transaction(async () => {
      for (const file of this.store.select('paperExportFiles', { state: 'reserved' })) {
        if (file.cleanupTaskId) continue;
        const record = this.store.find('paperExports', { id: file.exportId }), task = await this.store.tasks.get(file.taskId);
        if (!record || !task || record.slots.some(slot => slot.published?.fileId === file.id)) continue;
        const current = ['queued', 'retry_wait', 'running', 'cancel_requested'].includes(task.state) && task.generation === file.generation &&
          (task.state !== 'running' && task.state !== 'cancel_requested' || task.leaseToken === file.token && task.leaseUntil !== null && task.leaseUntil > Date.now());
        if (current) continue;
        const cleanup = collectPaperExportFile(file, null, new Date().toISOString()); Object.assign(file, cleanup.file); await this.store.enqueueTask(cleanup.task);
      }
    });
  }
  private async execute(sweep: boolean) {
    if (sweep && Date.now() - this.sweptAt > 60000) { await this.sweep(); this.sweptAt = Date.now(); }
    const task = await this.store.tasks.claim([PAPER_EXPORT_CLEANUP_KIND]); if (!task) return false;
    let interrupted = false; const beat = setInterval(() => void this.store.tasks.heartbeat(task.id, task.leaseToken!).then(okay => { if (!okay) interrupted = true; }).catch(() => { interrupted = true; }), 2000); beat.unref();
    try { await this.collect(task, () => interrupted || this.stopping); }
    catch (error) {
      const code = error instanceof StudioFileCollectionPending
        ? error.code === 'material_file_process_active_or_unknown' ? 'paper_export_collection_writer_or_reader_active' : error.code
        : 'paper_export_collection_pending';
      await this.store.tasks.deferPaperExportCollection(task.id, task.leaseToken!, code, this.collectionDelayMs);
    } finally { clearInterval(beat); }
    return true;
  }
  private async collect(task: TaskRow, interrupted: () => boolean) {
    const eligible = async () => {
      if (interrupted()) wait('interrupted');
      const currentTask = await this.store.tasks.get(task.id);
      if (!currentTask || currentTask.state !== 'running' || currentTask.leaseToken !== task.leaseToken || currentTask.generation !== task.generation || currentTask.leaseUntil === null || currentTask.leaseUntil <= Date.now()) wait('lease_changed');
      const file = this.store.find('paperExportFiles', { id: String(task.payload.fileId) }); if (!file) wait('file_unknown');
      assertPaperExportFile(file!);
      if (file!.state !== 'collecting' || file!.cleanupTaskId !== task.id || task.ownerUserId !== 'system-paper-export' ||
          Object.keys(task.payload).sort().join(',') !== 'deletionReceiptId,fileId,identityFingerprint' || task.payload.identityFingerprint !== paperExportFileIdentityFingerprint(file!)) wait('identity_changed');
      const record = this.store.find('paperExports', { id: file!.exportId });
      if (record?.slots.some(slot => slot.published?.fileId === file!.id)) wait('referenced');
      let receiptAt: string | null = null;
      if (!record) {
        const receipt = this.store.find('privacyRequests', { id: file!.deletionReceiptId ?? '' });
        const proof = receipt && assertPaperExportErasureProofs(receipt).find(proof => proof.exportId === file!.exportId && proof.intentFingerprint === file!.intentFingerprint &&
          proof.actorFingerprint === file!.actorFingerprint && proof.studentFingerprint === file!.studentFingerprint && proof.files.some(item => item.id === file!.id && item.identityFingerprint === paperExportFileIdentityFingerprint(file!)));
        if (!receipt || !proof) wait('deletion_proof_required'); receiptAt = receipt!.completedAt;
      } else if (file!.deletionReceiptId) wait('deletion_changed');
      const payload = paperExportCleanupPayload(file!), original = task.payload.deletionReceiptId === null && receiptAt !== null && task.createdAt <= receiptAt;
      if (digest(task.payload) !== digest(payload) && !(original && digest(task.payload) === digest({ ...payload, deletionReceiptId: null }))) wait('identity_changed');
      const render = await this.store.tasks.get(file!.taskId);
      if (!render || render.kind !== PAPER_EXPORT_TASK_KIND || render.payload.exportId !== file!.exportId || render.payload.intentFingerprint !== file!.intentFingerprint ||
          file!.actorFingerprint !== digest({ id: render.ownerUserId }) || !['practice', 'answers'].includes(String(render.payload.book))) wait('origin_changed');
      if (['running', 'cancel_requested'].includes(render!.state) && render!.generation === file!.generation && render!.leaseToken === file!.token && render!.leaseUntil !== null && render!.leaseUntil > Date.now()) wait('writer_active');
      return { file: file!, record, book: render!.payload.book as 'practice' | 'answers' };
    };
    const original = await this.store.transaction(eligible, { id: task.id, token: task.leaseToken!, mode: 'checkpoint', progress: { stage: 'collecting' } });
    const root = studyDataRoot(), key = original.file.workspace.split('/')[1];
    const release = await acquireStudioPurgeFence(root, 'paper-export', key, { generation: original.file.generation, taskId: task.id, token: task.leaseToken! });
    try {
      await pruneDeadStudioFileLeases(root, 'paper-export', key);
      if ((await inspectStudioFileLeases(root, 'paper-export', key)).length) wait('writer_or_reader_active');
      const workspace = resolve(root, original.file.workspace); await assertNoFileLinks(workspace);
      const present = await fs.lstat(workspace).then(() => true, error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; });
      if (present) await assertPaperExportWriterProtocol(root, key);
      await revokePaperExportWorkspace(root, key);
      const guard = async () => { await this.store.requestContext(eligible); if ((await inspectStudioFileLeases(root, 'paper-export', key)).length) wait('writer_or_reader_active'); };
      await guard();
      const inventory = await inspectPaperExportWorkspace({ dataRoot: root, file: original.file, book: original.book, record: original.record });
      await deletePaperExportWorkspace(inventory, guard);
      await this.store.transaction(async () => {
        const current = await eligible(); current.file.state = 'deleted'; current.file.updatedAt = new Date().toISOString();
      }, { id: task.id, token: task.leaseToken!, result: { ...task.payload, filesFinished: true } });
    } finally { await release(); }
  }
}
