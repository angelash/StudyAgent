import { AssistantWhiteboardService } from './assistant-whiteboard.service';
import { ConflictException, Injectable, Optional, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { StudentsService } from '../students/students.service';
import { ClassroomImageService } from '../ai/classroom-image.service';
import { topicVisualAuthority, topicVisualParent, topicVisualTaskKind, topicVisualPurgeKind } from './topic-whiteboard-visual-access';
import { topicVisualStage, publishTopicVisual, topicVisualFile, removeTopicVisualStage, topicVisualDirectories, pruneTopicVisualStages, topicVisualIdPattern } from './topic-whiteboard-visual-storage';
import { collectTopicVisualFiles } from './topic-whiteboard-visual-retention';
import { reconcileTopicVisual } from './topic-whiteboard-visual.service';
import type { TopicVisualRecord } from './topic-whiteboard-visual-record';

@Injectable()
export class TopicWhiteboardVisualWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>; private current?: Promise<boolean>; private abort?: AbortController; private stopping = false;
  private sweptAt = 0; private readonly logger = new Logger(TopicWhiteboardVisualWorkerService.name);
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly images: ClassroomImageService, @Optional() private readonly source?: AssistantWhiteboardService) {}
  onApplicationBootstrap() {
    if (process.env.STUDY_WORKER_ENABLED === 'false' || !this.store.persistence.durable) return;
    this.timer = setInterval(() => void this.runNext().catch(() => this.logger.warn('Topic figure task retained')), 1500); this.timer.unref();
  }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); this.abort?.abort(); await this.current?.catch(() => {}); }
  async runNext(): Promise<boolean> {
    if (this.stopping || this.current) return false; const pending = this.execute(); this.current = pending;
    try { return await pending; } finally { if (this.current === pending) this.current = undefined; }
  }
  private async settle() {
    await this.store.transaction(async () => {
      for (const row of ['queued', 'generating', 'cancel_requested'].flatMap(status => this.store.select('studioTopicWhiteboardVisuals', { status })).slice(0, 100)) {
        const task = await this.store.tasks.get(row.taskId);
        if (task?.kind === topicVisualTaskKind && task.ownerUserId === row.ownerUserId && task.payload.visualId === row.id && task.payloadHash === row.requestHash)
          reconcileTopicVisual(row, task);
      }
    });
    if (Date.now() - this.sweptAt > 60000) {
      await this.store.transaction(async () => {
        for (const id of topicVisualDirectories(3600000)) {
          const row = this.store.find('studioTopicWhiteboardVisuals', { id }), task = row ? await this.store.tasks.get(row.taskId) : null;
          pruneTopicVisualStages(id, task?.leaseToken ?? null);
          if (!task || !['queued', 'running', 'retry_wait', 'cancel_requested'].includes(task.state)) collectTopicVisualFiles(this.store, id);
        }
      }); this.sweptAt = Date.now();
    }
  }
  private row(task: TaskRow, signal: AbortSignal) {
    if (signal.aborted) throw Error('topic_figure_cancelled');
    const row = this.store.find('studioTopicWhiteboardVisuals', { id: String(task.payload.visualId), ownerUserId: task.ownerUserId, taskId: task.id });
    if (!row || row.requestHash !== task.payloadHash || row.generation !== task.generation || !['queued', 'generating'].includes(row.status))
      throw Error('topic_figure_no_longer_available');
    topicVisualAuthority(this.store, this.students, row, this.source); return row;
  }
  private async persist(task: TaskRow, signal: AbortSignal, change: (row: TopicVisualRecord) => void, complete = false) {
    for (let attempt = 0; attempt < 4; attempt++) try {
      return await this.store.transaction(() => {
        const row = this.row(task, signal); change(row); row.revision++; row.updatedAt = new Date().toISOString(); return structuredClone(row);
      }, complete ? { id: task.id, token: task.leaseToken!, result: { visualId: task.payload.visualId } } :
        { id: task.id, token: task.leaseToken!, mode: 'checkpoint', progress: { stage: 'topic-figure' } });
    } catch (error) { if (attempt === 3 || !(error instanceof ConflictException) || !error.message.includes('数据已更新')) throw error; }
    throw Error('topic_figure_checkpoint_failed');
  }
  private async execute() {
    await this.settle(); const task = await this.store.tasks.claim([topicVisualTaskKind, topicVisualPurgeKind]); if (!task) return false;
    const abort = new AbortController(); this.abort = abort; let stage: string | undefined;
    const id = String(task.payload.visualId ?? '');
    const heartbeat = setInterval(() => void this.store.tasks.heartbeat(task.id, task.leaseToken!).then(async valid => {
      if (!valid) { abort.abort(); return; }
      if (task.kind === topicVisualTaskKind) await this.store.requestContext(() => this.row(task, abort.signal));
    }).catch(() => abort.abort()), 2000); heartbeat.unref();
    try {
      if (task.kind === topicVisualPurgeKind) {
        const ids = task.payload.ids;
        if (!Array.isArray(ids) || ids.length > 100000 || ids.some(id => typeof id !== 'string' || !topicVisualIdPattern.test(id))) throw Error('topic_figure_cleanup_invalid');
        for (const visualId of ids as string[]) {
          if (abort.signal.aborted) throw Error('topic_figure_cancelled');
          await this.store.transaction(() => {
            const row = this.store.find('studioTopicWhiteboardVisuals', { id: visualId });
            if (!row || row.status === 'deleted') { pruneTopicVisualStages(visualId, null, 0); collectTopicVisualFiles(this.store, visualId); }
          }, { id: task.id, token: task.leaseToken!, mode: 'checkpoint', progress: { stage: 'collecting' } });
        }
        await this.store.transaction(() => {}, { id: task.id, token: task.leaseToken! }); return true;
      }
      const snapshot = await this.persist(task, abort.signal, row => { row.status = 'generating'; });
      stage = topicVisualStage(id, task.leaseToken!);
      const source = snapshot.operation === 'edit' ? await this.store.requestContext(() => {
        this.row(task, abort.signal); return topicVisualFile(topicVisualParent(this.store, snapshot, snapshot.parentVisualId!), 'original').path;
      }) : null;
      const generated = source ? await this.images.edit(snapshot.prompt, stage, source, abort.signal, { size: '1536x1024' }) :
        await this.images.generate(snapshot.prompt, stage, abort.signal, { size: '1536x1024' });
      // Recheck the actual lease and teaching before decoding/publishing, and again in the atomic domain commit.
      await this.persist(task, abort.signal, () => {});
      const published = await publishTopicVisual(id, generated.output, snapshot.prompt);
      await this.persist(task, abort.signal, row => { Object.assign(row, published, { status: 'ready' }); }, true);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const allowed = ['skill_missing', 'python_unavailable', 'environment_unavailable', 'image_timeout', 'image_auth_unavailable', 'image_provider_failed',
        'image_output_missing', 'image_edit_unavailable', 'image_edit_source_unavailable', 'image_process_stop_unconfirmed', 'topic_figure_context_changed',
        'topic_figure_source_changed', 'topic_figure_no_longer_available', 'topic_figure_cleanup_invalid', 'visual_dimensions_invalid', 'visual_output_invalid'];
      const code = this.stopping ? 'worker_stopped' : abort.signal.aborted ? 'topic_figure_cancelled' : allowed.includes(message) ? message : 'topic_figure_generation_failed';
      await this.store.tasks.fail(task.id, task.leaseToken!, code, this.stopping).catch(() => {});
      await this.settle().catch(() => {}); this.logger.warn('Topic figure did not complete: ' + task.id); return true;
    } finally {
      clearInterval(heartbeat); this.abort = undefined;
      if (stage) { try { removeTopicVisualStage(id, stage); } catch { this.logger.warn('Topic figure staging retained for collection'); } }
      if (task.kind === topicVisualTaskKind) await this.store.transaction(async () => {
        const current = await this.store.tasks.get(task.id);
        if (current && !['queued', 'running', 'retry_wait', 'cancel_requested'].includes(current.state)) collectTopicVisualFiles(this.store, id);
      }).catch(() => {});
    }
  }
}
