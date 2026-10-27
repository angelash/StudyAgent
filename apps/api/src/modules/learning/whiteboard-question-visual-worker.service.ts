import { ConflictException, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { StudentsService } from '../students/students.service';
import { ClassroomImageService } from '../ai/classroom-image.service';
import { TopicWhiteboardService } from './topic-whiteboard.service';
import { questionVisualAuthority, questionVisualParent, questionVisualTaskKind, questionVisualPurgeKind } from './whiteboard-question-visual-access';
import { questionVisualStage, publishQuestionVisual, questionVisualFile, removeQuestionVisualStage, questionVisualDirectories, pruneQuestionVisualStages,
  questionVisualIdPattern } from './whiteboard-question-visual-storage';
import { collectQuestionVisualFiles } from './whiteboard-question-visual-retention';
import { reconcileQuestionVisual } from './whiteboard-question-visual.service';
import type { QuestionVisualRecord } from './whiteboard-question-visual-record';

@Injectable()
export class WhiteboardQuestionVisualWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>; private current?: Promise<boolean>; private abort?: AbortController; private stopping = false;
  private sweptAt = 0; private readonly logger = new Logger(WhiteboardQuestionVisualWorkerService.name);
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly topics: TopicWhiteboardService,
    private readonly images: ClassroomImageService) {}
  onApplicationBootstrap() {
    if (process.env.STUDY_WORKER_ENABLED === 'false' || !this.store.persistence.durable) return;
    this.timer = setInterval(() => void this.runNext().catch(() => this.logger.warn('Question figure task retained')), 1500); this.timer.unref();
  }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); this.abort?.abort(); await this.current?.catch(() => {}); }
  async runNext(): Promise<boolean> {
    if (this.stopping || this.current) return false; const pending = this.execute(); this.current = pending;
    try { return await pending; } finally { if (this.current === pending) this.current = undefined; }
  }
  private async settle() {
    await this.store.transaction(async () => {
      for (const row of ['queued', 'generating', 'cancel_requested'].flatMap(status => this.store.select('whiteboardQuestionVisuals', { status })).slice(0, 100)) {
        const task = await this.store.tasks.get(row.taskId);
        if (task?.kind === questionVisualTaskKind && task.ownerUserId === row.ownerUserId && task.payload.visualId === row.id && task.payloadHash === row.requestHash) reconcileQuestionVisual(row, task);
      }
    });
    if (Date.now() - this.sweptAt > 60000) {
      await this.store.transaction(async () => {
        for (const id of questionVisualDirectories(3600000)) {
          const row = this.store.find('whiteboardQuestionVisuals', { id }), task = row ? await this.store.tasks.get(row.taskId) : null;
          pruneQuestionVisualStages(id, task?.leaseToken ?? null);
          if (!task || !['queued', 'running', 'retry_wait', 'cancel_requested'].includes(task.state)) collectQuestionVisualFiles(this.store, id);
        }
      }); this.sweptAt = Date.now();
    }
  }
  private row(task: TaskRow, signal: AbortSignal) {
    if (signal.aborted) throw Error('question_figure_cancelled');
    const row = this.store.find('whiteboardQuestionVisuals', { id: String(task.payload.visualId), ownerUserId: task.ownerUserId, taskId: task.id });
    if (!row || row.requestHash !== task.payloadHash || row.generation !== task.generation || !['queued', 'generating'].includes(row.status)) throw Error('question_figure_no_longer_available');
    questionVisualAuthority(this.store, this.students, this.topics, row); return row;
  }
  private async persist(task: TaskRow, signal: AbortSignal, change: (row: QuestionVisualRecord) => void, complete = false) {
    for (let attempt = 0; attempt < 4; attempt++) try {
      return await this.store.transaction(() => { const row = this.row(task, signal); change(row); row.revision++; row.updatedAt = new Date().toISOString(); return structuredClone(row); },
        complete ? { id: task.id, token: task.leaseToken!, result: { visualId: task.payload.visualId } } :
          { id: task.id, token: task.leaseToken!, mode: 'checkpoint', progress: { stage: 'question-figure' } });
    } catch (error) { if (attempt === 3 || !(error instanceof ConflictException) || !error.message.includes('数据已更新')) throw error; }
    throw Error('question_figure_checkpoint_failed');
  }
  private async execute() {
    await this.settle(); const task = await this.store.tasks.claim([questionVisualTaskKind, questionVisualPurgeKind]); if (!task) return false;
    const abort = new AbortController(); this.abort = abort; let stage: string | undefined; const id = String(task.payload.visualId ?? '');
    const heartbeat = setInterval(() => void this.store.tasks.heartbeat(task.id, task.leaseToken!).then(async valid => {
      if (!valid) { abort.abort(); return; } if (task.kind === questionVisualTaskKind) await this.store.requestContext(() => this.row(task, abort.signal));
    }).catch(() => abort.abort()), 2000); heartbeat.unref();
    try {
      if (task.kind === questionVisualPurgeKind) {
        const ids = task.payload.ids;
        if (!Array.isArray(ids) || ids.length > 100000 || ids.some(id => typeof id !== 'string' || !questionVisualIdPattern.test(id))) throw Error('question_figure_cleanup_invalid');
        for (const visualId of ids as string[]) {
          if (abort.signal.aborted) throw Error('question_figure_cancelled');
          await this.store.transaction(() => { const row = this.store.find('whiteboardQuestionVisuals', { id: visualId });
            if (!row || row.status === 'deleted') { pruneQuestionVisualStages(visualId, null, 0); collectQuestionVisualFiles(this.store, visualId); }
          }, { id: task.id, token: task.leaseToken!, mode: 'checkpoint', progress: { stage: 'collecting' } });
        }
        await this.store.transaction(() => {}, { id: task.id, token: task.leaseToken! }); return true;
      }
      const snapshot = await this.persist(task, abort.signal, row => { row.status = 'generating'; }); stage = questionVisualStage(id, task.leaseToken!);
      const source = snapshot.operation === 'edit' ? await this.store.requestContext(() => {
        this.row(task, abort.signal); return questionVisualFile(questionVisualParent(this.store, snapshot, snapshot.parentVisualId!), 'original').path;
      }) : null;
      const generated = source ? await this.images.edit(snapshot.prompt, stage, source, abort.signal, { size: '1536x1024' }) :
        await this.images.generate(snapshot.prompt, stage, abort.signal, { size: '1536x1024' });
      await this.persist(task, abort.signal, () => {}); const published = await publishQuestionVisual(id, generated.output, snapshot.prompt);
      await this.persist(task, abort.signal, row => { Object.assign(row, published, { status: 'ready' }); }, true); return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '', allowed = ['skill_missing', 'python_unavailable', 'environment_unavailable', 'image_timeout', 'image_auth_unavailable',
        'image_provider_failed', 'image_output_missing', 'image_edit_unavailable', 'image_edit_source_unavailable', 'image_process_stop_unconfirmed', 'question_figure_no_longer_available',
        'question_figure_cleanup_invalid', 'visual_dimensions_invalid', 'visual_output_invalid'];
      const code = this.stopping ? 'worker_stopped' : abort.signal.aborted ? 'question_figure_cancelled' : allowed.includes(message) ? message : 'question_figure_generation_failed';
      await this.store.tasks.fail(task.id, task.leaseToken!, code, this.stopping).catch(() => {}); await this.settle().catch(() => {});
      this.logger.warn('Question figure did not complete: ' + task.id); return true;
    } finally {
      clearInterval(heartbeat); this.abort = undefined;
      if (stage) { try { removeQuestionVisualStage(id, stage); } catch { this.logger.warn('Question figure staging retained for collection'); } }
      if (task.kind === questionVisualTaskKind) await this.store.transaction(async () => {
        const current = await this.store.tasks.get(task.id); if (current && !['queued', 'running', 'retry_wait', 'cancel_requested'].includes(current.state)) collectQuestionVisualFiles(this.store, id);
      }).catch(() => {});
    }
  }
}
