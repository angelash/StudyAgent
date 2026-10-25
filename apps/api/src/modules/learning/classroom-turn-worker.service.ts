import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { freezeSpeechTrack } from './classroom-presentation';
import { classroomTurnKind, turnAuthority } from './classroom-turn.service';

const teachingModes = {
  question: '回答当前疑问，先明确困惑，再给一个可验证的小步骤。',
  example: '换一个具体例子，清楚说明条件与结论，不改变当前教学目标。',
  simplify: '用更简单的语言解释，保留必要的准确术语，不牺牲概念准确性。',
  prerequisite: '梳理需要的基础。未提供已审核先修资料时明确说这是讲解建议，不声称已经测出根因。',
  compare: '按相同维度比较两种表达或情境，交代共同点、差别与适用条件。',
};

@Injectable()
export class ClassroomTurnWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private current?: Promise<boolean>;
  private abort?: AbortController;
  private stopping = false;
  private readonly logger = new Logger(ClassroomTurnWorkerService.name);
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly chat: XiaojiuChatService) {}
  onApplicationBootstrap() {
    if (process.env.STUDY_WORKER_ENABLED === 'false' || !this.store.persistence.durable) return;
    this.timer = setInterval(() => void this.runNext().catch(() => this.logger.warn('Classroom turn retained')), 1000);
    this.timer.unref();
  }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); this.abort?.abort(); await this.current?.catch(() => {}); }
  async runNext() {
    if (this.stopping || this.current) return false;
    const pending = this.execute(); this.current = pending;
    try { return await pending; } finally { this.current = undefined; }
  }
  private async execute() {
    const task = await this.store.tasks.claim([classroomTurnKind]);
    if (!task) return false;
    const id = String(task.payload.turnId ?? ''), abort = new AbortController(); this.abort = abort;
    const fence = { id: task.id, token: task.leaseToken! };
    const heartbeat = setInterval(() => void this.store.tasks.heartbeat(task.id, task.leaseToken!).then(async valid => {
      if (!valid) return abort.abort();
      await this.store.requestContext(() => {
        const turn = this.store.find('classroomTurns', { id, taskId: task.id });
        if (!turn) throw new Error('turn_unavailable');
        turnAuthority(this.store, this.students, turn);
      });
    }).catch(() => abort.abort()), 2000);
    heartbeat.unref();
    try {
      const snapshot = await this.store.transaction(() => {
        const turn = this.store.find('classroomTurns', { id, taskId: task.id, ownerUserId: task.ownerUserId });
        if (!turn || turn.status === 'completed' || turn.inputHash !== task.payloadHash) throw new Error('turn_unavailable');
        turnAuthority(this.store, this.students, turn);
        turn.status = 'running'; turn.revision++; turn.updatedAt = new Date().toISOString();
        return structuredClone(turn);
      }, { ...fence, mode: 'checkpoint', progress: { stage: 'replying' } });
      const response = await this.chat.reply({ modelId: snapshot.modelId, signal: abort.signal, classroomBoard: true,
        system: '你是课堂陪伴老师。仅根据提供的已展示讲解解释概念。' + teachingModes[snapshot.intent] +
          '不替学生选择选项，不泄露或推断标准答案。题目只用于引导思路。不声称已掌握、已发现深层问题或已完成测量。板书提炼要点。不要HTML、脚本或工具调用。',
        context: snapshot.context, history: snapshot.history, message: snapshot.message });
      if (abort.signal.aborted) throw new Error('turn_stopped');
      await this.store.transaction(() => {
        const turn = this.store.find('classroomTurns', { id, taskId: task.id, ownerUserId: task.ownerUserId });
        if (!turn || turn.status !== 'running' || turn.inputHash !== snapshot.inputHash) throw new Error('turn_unavailable');
        const session = turnAuthority(this.store, this.students, turn), now = new Date().toISOString();
        if (session.messages.length >= 100) throw new Error('turn_message_limit');
        const userMessageId = this.store.nextId('classroom_message'), assistantMessageId = this.store.nextId('classroom_message');
        session.messages.push({ id: userMessageId, role: 'user', content: turn.message, at: now },
          { id: assistantMessageId, role: 'assistant', content: response.reply, modelName: response.modelName, at: now,
            speech: freezeSpeechTrack(response.reply), ...(response.board ? { board: { ...response.board, page: Math.floor(turn.position.cursor / 3) } } : {}) });
        session.requests.push({ key: turn.requestKey, hash: turn.inputHash, kind: 'turn', messageId: assistantMessageId });
        session.revision++; session.updatedAt = now;
        Object.assign(turn, { status: 'completed', userMessageId, assistantMessageId, revision: turn.revision + 1, updatedAt: now });
      }, { ...fence, result: { turnId: id } });
    } catch {
      // Provider failure needs an explicit retry. Shutdown/expired lease may be recovered by the durable queue.
      await this.store.tasks.fail(task.id, task.leaseToken!, abort.signal.aborted ? 'classroom_turn_stopped' : 'classroom_turn_failed', this.stopping).catch(() => {});
    } finally { clearInterval(heartbeat); if (this.abort === abort) this.abort = undefined; }
    return true;
  }
}
