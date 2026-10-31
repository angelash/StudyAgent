import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { studyDataRoot } from '../../infrastructure/workspace-paths';
import { assertNoFileLinks, withStudioFileLease } from '../../infrastructure/studio-file-coordination';
import { writeImmutableBytes } from '../../infrastructure/immutable-files';
import { retentionDigest as digest } from '../diagnostics/retention-anchor';
import { PaperExportService } from './paper-export.service';
import { PaperExportRuntimeService } from './paper-export-runtime.service';
import { paperExportDocumentBytes, assertPaperExportSourceMap, PAPER_EXPORT_TASK_KIND } from './paper-export-record';
import { reservePaperExportFile, recordPaperExportRendered, publishPaperExportFile, collectPaperExportFile, type PaperExportFileRecord } from './paper-export-file-record';
import { openVerifiedLibraryMedia } from './verified-library-media';

@Injectable()
export class PaperExportRenderWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>; private current?: Promise<boolean>; private stopping = false; private abort?: AbortController;
  private readonly logger = new Logger(PaperExportRenderWorkerService.name);
  constructor(private readonly store: InMemoryStoreService, private readonly exports: PaperExportService, private readonly runtime: PaperExportRuntimeService) {}
  onApplicationBootstrap() { if (process.env.STUDY_WORKER_ENABLED === 'false' || !this.store.persistence.durable) return;
    this.timer = setInterval(() => void this.runNext().catch(() => this.logger.warn('Paper export remains durable')), 1500); this.timer.unref(); }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); this.abort?.abort(); await this.current?.catch(() => {}); }
  async runNext() { if (this.current || this.stopping) return false; const work = this.execute(); this.current = work; try { return await work; } finally { this.current = undefined; } }
  private async execute() {
    const task = await this.store.tasks.claim([PAPER_EXPORT_TASK_KIND], 30000); if (!task) return false;
    const abort = new AbortController(); this.abort = abort;
    const beat = setInterval(() => void this.store.tasks.heartbeat(task.id, task.leaseToken!).then(async okay => {
      if (!okay) abort.abort(); else await this.store.requestContext(() => this.exports.work(task));
    }).catch(() => abort.abort()), 2000); beat.unref();
    try { await this.process(task, abort.signal); }
    catch (error) {
      const message = error instanceof Error ? error.message : '', code = abort.signal.aborted ? 'paper_export_cancelled' : /^paper_export_[a-z0-9_]{1,80}$/.test(message) ? message : 'paper_export_source_changed';
      await this.store.tasks.fail(task.id, task.leaseToken!, code, this.stopping).catch(() => {});
      await this.store.transaction(async () => {
        for (const file of this.store.select('paperExportFiles', { taskId: task.id, generation: task.generation, token: task.leaseToken! })) {
          const record = this.store.find('paperExports', { id: file.exportId });
          if (!file.cleanupTaskId && !record?.slots.some(slot => slot.published?.fileId === file.id)) {
            const cleanup = collectPaperExportFile(file, null, new Date().toISOString()); Object.assign(file, cleanup.file); await this.store.enqueueTask(cleanup.task);
          }
        }
      }).catch(() => {});
      this.logger.warn('Paper export ' + task.id + ': ' + code);
    } finally { clearInterval(beat); this.abort = undefined; }
    return true;
  }
  private async process(initial: TaskRow, signal: AbortSignal) {
    const fresh = async () => {
      if (signal.aborted || this.stopping) throw Error('paper_export_cancelled');
      const task = await this.store.tasks.get(initial.id);
      if (!task || task.state !== 'running' || task.leaseToken !== initial.leaseToken || task.generation !== initial.generation || !task.leaseUntil || task.leaseUntil <= Date.now()) throw Error('paper_export_cancelled');
      return { task, ...this.exports.work(task) };
    };
    const reserved = await this.store.requestContext(async () => { const work = await fresh(); return reservePaperExportFile(work.record, work.task, new Date().toISOString()); });
    await this.store.transaction(async () => { await fresh(); this.store.append('paperExportFiles', reserved.file); }, reserved.fence);
    const root = studyDataRoot(), workspace = resolve(root, reserved.file.workspace), identity = digest({ taskId: initial.id, generation: initial.generation, token: initial.leaseToken! });
    const check = () => this.store.requestContext(async () => {
      const work = await fresh(), file = this.store.find('paperExportFiles', { id: reserved.file.id, state: 'reserved' });
      if (!file || file.workspace !== reserved.file.workspace || file.token !== initial.leaseToken || file.generation !== initial.generation) throw Error('paper_export_source_changed');
      return work;
    });
    await withStudioFileLease(root, 'paper-export', identity, async () => {
      await check(); await assertNoFileLinks(workspace); await fs.mkdir(workspace);
      const built = await this.store.requestContext(() => this.exports.workerDocument(initial));
      const write = async (name: string, bytes: Buffer) => { await check(); const path = resolve(workspace, name); await assertNoFileLinks(path); await writeImmutableBytes(path, bytes); await assertNoFileLinks(path); };
      await write('input.json', paperExportDocumentBytes(built.document));
      for (const [name, bytes] of built.mediaBytes) await write(name, bytes);
      const work = await check(), slot = work.record.slots.find(slot => slot.taskId === initial.id)!;
      const result = await this.runtime.render(workspace, work.record.intent, slot.book, signal);
      for (const output of result.files) {
        await check(); assertPaperExportSourceMap(work.record.intent.document, output.sourceMap, output.pageCount);
        const checked = await openVerifiedLibraryMedia({ path: resolve(workspace, output.path), size: output.bytes, sha256: output.sha256 }, signal); await checked.handle.close();
      }
      const selected = result.files.find(file => file.format === slot.format)!;
      const output = { book: selected.book, format: selected.format, sha256: selected.sha256, bytes: selected.bytes, pageCount: selected.pageCount, sourceMapHash: digest(selected.sourceMap) };
      const rendered = await this.store.requestContext(async () => {
        const latest = await fresh(), file = this.store.find('paperExportFiles', { id: reserved.file.id }); if (!file) throw Error('paper_export_source_changed');
        return recordPaperExportRendered(latest.record, file, latest.task, output, selected.sourceMap, new Date().toISOString());
      });
      await this.store.transaction(async () => {
        await fresh(); const file = this.store.find('paperExportFiles', { id: reserved.file.id, state: 'reserved' });
        if (!file || file.output) throw Error('paper_export_source_changed'); Object.assign(file, rendered.file);
      }, rendered.fence);
      const published = await this.store.requestContext(async () => {
        const latest = await fresh(), file = this.store.find('paperExportFiles', { id: reserved.file.id }); if (!file) throw Error('paper_export_source_changed');
        return publishPaperExportFile(latest.record, file, latest.task, selected.sourceMap, new Date().toISOString());
      });
      await this.store.transaction(async () => {
        const latest = await fresh(), file = this.store.find('paperExportFiles', { id: reserved.file.id, state: 'reserved' }); if (!file) throw Error('paper_export_source_changed');
        const currentSlot = latest.record.slots.find(slot => slot.taskId === initial.id)!;
        if (currentSlot.published) throw Error('paper_export_source_changed');
        currentSlot.published = published.record.slots.find(slot => slot.taskId === initial.id)!.published; Object.assign(file, published.file);
      }, published.fence);
    });
  }
}
