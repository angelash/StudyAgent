import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { topicWhiteboardInputSchema, topicWhiteboardCreateSchema, topicWhiteboardControlSchema, topicWhiteboardEditSchema,
  topicWhiteboardConfirmSchema, type TopicWhiteboardDraftView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { StudentsService } from '../students/students.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { assertTopicWhiteboardInputCurrent, captureTopicWhiteboardAuthorization, prepareTopicWhiteboard } from './topic-whiteboard-access';
import { topicWhiteboardDigest, topicWhiteboardTaskKind, validateTopicWhiteboardContent } from './topic-whiteboard-content';
import { buildTopicWhiteboard, publicTopicWhiteboard } from './topic-whiteboard-projection';
import type { TopicWhiteboardCommand, TopicWhiteboardDraftRecord, TopicWhiteboardRecord } from './topic-whiteboard-record';

const active = new Set(['queued', 'running', 'retry_wait', 'cancel_requested']);
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20), search: z.string().trim().max(120).default('') }).strict();
export function reconcileTopicWhiteboard(row: TopicWhiteboardDraftRecord, task: TaskRow | null | undefined) {
  if (task?.id === row.taskId && ['queued', 'generating', 'cancel_requested'].includes(row.status) && ['failed', 'cancelled'].includes(task.state)) {
    row.status = task.state as 'failed' | 'cancelled'; row.revision++; row.updatedAt = new Date().toISOString();
  }
}

@Injectable()
export class TopicWhiteboardService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly models: XiaojiuModelsService, private readonly chat: XiaojiuChatService) {}
  modelAvailable() { return this.chat.enabled; }

  private record(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) {
    const row = this.store.find('studioTopicWhiteboardDrafts', { id, ownerUserId: user.id });
    if (!row) throw new NotFoundException('白板候选不存在');
    captureTopicWhiteboardAuthorization(this.store, this.students, user, row.prepared.input.audience, session);
    return row;
  }
  async view(row: TopicWhiteboardDraftRecord, taskOverride?: TaskRow, receipt?: TopicWhiteboardCommand): Promise<TopicWhiteboardDraftView> {
    const task = taskOverride ?? await this.store.tasks.get(row.taskId);
    if (task && (task.kind !== topicWhiteboardTaskKind || task.ownerUserId !== row.ownerUserId || task.payload.draftId !== row.id || task.payloadHash !== row.requestHash))
      throw new ConflictException('原生成任务身份不一致');
    const status = ['ready', 'confirmed'].includes(row.status) ? row.status : task?.state === 'failed' ? 'failed' : task?.state === 'cancelled' ? 'cancelled' :
      task?.state === 'cancel_requested' || row.status === 'cancel_requested' ? 'cancelling' : row.status;
    return { id: row.id, audience: structuredClone(row.prepared.input.audience), studentId: row.studentId, subject: row.subject,
      prompt: row.prepared.input.prompt, objective: row.prepared.input.objective, modelId: row.prepared.modelId,
      modelName: row.modelName ?? row.prepared.modelName, status: status as TopicWhiteboardDraftView['status'], stage: row.stage,
      revision: row.revision, generation: task?.generation ?? row.generation, task: task ? { id: task.id, version: task.version, state: task.state, errorCode: task.errorCode } : null,
      originalContent: structuredClone(row.originalContent), content: structuredClone(row.content), contentFingerprint: row.contentFingerprint,
      review: row.modelReview ? { ...structuredClone(row.modelReview), current: row.modelReview.outputFingerprint === row.contentFingerprint } : null,
      whiteboardId: row.whiteboardId, teacherReviewStatus: 'pending', formalMeasurementEligible: false, createdAt: row.createdAt, updatedAt: row.updatedAt,
      ...(receipt ? { receipt: { key: receipt.key, kind: receipt.kind, effectiveRevision: receipt.effectiveRevision, generation: receipt.generation,
        at: receipt.at, commandFingerprint: receipt.hash, ...(receipt.contentFingerprint ? { contentFingerprint: receipt.contentFingerprint } : {}),
        ...(receipt.whiteboardId ? { whiteboardId: receipt.whiteboardId } : {}) } } : {}) };
  }
  preflight(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const command = validate(topicWhiteboardInputSchema, input), model = this.models.resolve(command.modelId);
    captureTopicWhiteboardAuthorization(this.store, this.students, user, command.audience, session);
    const prepared = prepareTopicWhiteboard(this.store, this.students, user, command, model);
    return { valid: true, available: this.modelAvailable(), fingerprint: prepared.fingerprint, modelId: model.id, modelName: model.label,
      grade: prepared.grade, targets: prepared.targets.map(({ id, name, objective }) => ({ id, name, objective })),
      contextCharacters: prepared.context.length, maxContextCharacters: 18000 };
  }
  async prepare(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const command = validate(topicWhiteboardCreateSchema, input), hash = topicWhiteboardDigest({ ...command, requestKey: undefined });
    return this.store.transaction(async () => {
      const previous = this.store.find('studioTopicWhiteboardDrafts', { ownerUserId: user.id, requestKey: command.requestKey });
      if (previous) {
        this.record(user, previous.id, session);
        if (previous.requestHash !== hash) throw new ConflictException('原请求已用于其他主题、范围或模型');
        return this.view(previous, undefined, previous.commands.find(item => item.kind === 'prepare' && item.key === command.requestKey));
      }
      const { preflightFingerprint, requestKey, ...selection } = command, model = this.models.resolve(selection.modelId);
      const authorization = captureTopicWhiteboardAuthorization(this.store, this.students, user, selection.audience, session);
      const prepared = prepareTopicWhiteboard(this.store, this.students, user, selection, model);
      if (prepared.fingerprint !== preflightFingerprint) throw new ConflictException('预检范围或模型已变化，请重新预检并保留原主题');
      if (!this.modelAvailable()) throw new ServiceUnavailableException('小九AI当前未启用，请先连接模型');
      const now = new Date().toISOString(), audience = prepared.input.audience;
      const row: TopicWhiteboardDraftRecord = { id: this.store.nextId('topic_draft'), ownerUserId: user.id,
        studentId: audience.kind === 'student' ? audience.studentId : null, subject: audience.kind === 'student' ? audience.subject : null,
        requestKey, requestHash: hash, prepared, authorization, status: 'queued', revision: 0, generation: 1, taskId: this.store.nextId('task'),
        stage: 'writing', modelName: model.label, originalContent: null, content: null, originalFingerprint: null, contentFingerprint: null,
        modelReview: null, contentVersion: 0, history: [], commands: [], whiteboardId: null, createdAt: now, updatedAt: now };
      const receipt: TopicWhiteboardCommand = { key: requestKey, kind: 'prepare', hash, effectiveRevision: 0, actorUserId: user.id, at: now, generation: 1 };
      row.commands.push(receipt); this.store.append('studioTopicWhiteboardDrafts', row);
      const intent = { id: row.taskId, kind: topicWhiteboardTaskKind, ownerUserId: user.id, requestKey: 'topic-whiteboard:' + row.id,
        payloadHash: hash, payload: { draftId: row.id }, createdAt: now, maxAttempts: 2 };
      await this.store.enqueueTask(intent);
      return this.view(row, { ...intent, state: 'queued', attempts: 0, generation: 1, version: 1, availableAt: Date.now(),
        leaseToken: null, leaseUntil: null, progress: {}, result: null, errorCode: null, updatedAt: now }, receipt);
    });
  }
  async get(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) { return this.view(this.record(user, id, session)); }
  async receipt(user: InMemoryUserAccount, id: string, key: string, session: InMemoryAuthSession) {
    const row = this.record(user, id, session), receipt = row.commands.find(item => item.key === key);
    if (!receipt) throw new NotFoundException('原操作回执不存在'); return this.view(row, undefined, receipt);
  }
  async list(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const query = validate(pageSchema, input ?? {}), rows = this.store.select('studioTopicWhiteboardDrafts', { ownerUserId: user.id })
      .filter(row => { try { captureTopicWhiteboardAuthorization(this.store, this.students, user, row.prepared.input.audience, session); return true; } catch { return false; } })
      .filter(row => !query.search || [row.prepared.input.prompt, row.prepared.input.objective, row.content?.title ?? ''].some(text => text.toLocaleLowerCase().includes(query.search.toLocaleLowerCase())))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { page: query.page, limit: query.limit, total: rows.length,
      items: await Promise.all(rows.slice((query.page - 1) * query.limit, query.page * query.limit).map(row => this.view(row))) };
  }
  private prior(row: TopicWhiteboardDraftRecord, key: string, kind: TopicWhiteboardCommand['kind'], hash: string) {
    const receipt = row.commands.find(item => item.key === key);
    if (receipt && (receipt.kind !== kind || receipt.hash !== hash)) throw new ConflictException('原请求标识已用于不同操作');
    return receipt;
  }
  private command(row: TopicWhiteboardDraftRecord, user: InMemoryUserAccount, key: string, kind: TopicWhiteboardCommand['kind'], hash: string,
    detail: Partial<Pick<TopicWhiteboardCommand, 'contentFingerprint' | 'whiteboardId'>> = {}) {
    row.revision++; row.updatedAt = new Date().toISOString();
    const receipt = { key, kind, hash, effectiveRevision: row.revision, actorUserId: user.id, at: row.updatedAt, generation: row.generation, ...detail };
    row.commands.push(receipt); return receipt;
  }
  async control(user: InMemoryUserAccount, id: string, action: 'cancel' | 'retry', input: unknown, session: InMemoryAuthSession) {
    const command = validate(topicWhiteboardControlSchema, input), hash = topicWhiteboardDigest({ action, ...command, requestKey: undefined });
    return this.store.transaction(async () => {
      const row = this.record(user, id, session), prior = this.prior(row, command.requestKey, action, hash);
      if (prior) return this.view(row, undefined, prior);
      const task = await this.store.tasks.get(row.taskId);
      if (!task || task.kind !== topicWhiteboardTaskKind || task.ownerUserId !== user.id || task.payload.draftId !== row.id || task.payloadHash !== row.requestHash ||
        task.generation !== command.generation || row.generation > task.generation) throw new ConflictException('原生成代次已变化，请先读取原操作');
      const exact = row.revision === command.expectedRevision && task.version === command.taskVersion;
      const progressOnly = action === 'cancel' && command.expectedRevision <= row.revision && command.taskVersion <= task.version && active.has(task.state) &&
        !row.commands.some(item => item.effectiveRevision > command.expectedRevision && ['cancel', 'retry'].includes(item.kind));
      if (!exact && !progressOnly) throw new ConflictException('原候选或控制版本已变化');
      if (['ready', 'confirmed'].includes(row.status)) throw new ConflictException('候选已完成，请在审阅流程处理');
      // Native recovery advances the durable task and revokes its old login. Only
      // an explicit current control may adopt that generation; workers stay strict.
      row.generation = task.generation;
      if (action === 'retry') {
        if (!['failed', 'cancelled'].includes(task.state)) throw new ConflictException('原生成任务还未结束');
        assertTopicWhiteboardInputCurrent(this.store, this.students, user, row.prepared);
        if (!this.modelAvailable()) throw new ServiceUnavailableException('小九AI当前未启用');
        row.authorization = captureTopicWhiteboardAuthorization(this.store, this.students, user, row.prepared.input.audience, session);
        row.status = 'queued'; row.generation++;
      } else {
        if (!active.has(task.state) || row.status === 'cancel_requested' || task.state === 'cancel_requested') throw new ConflictException('原任务已结束或正在取消');
        row.status = task.state === 'running' ? 'cancel_requested' : 'cancelled';
      }
      await this.store.controlTask({ id: task.id, action, expectedVersion: task.version, actorId: user.id });
      const receipt = this.command(row, user, command.requestKey, action, hash);
      const provisional = { ...task, state: action === 'retry' ? 'queued' : row.status === 'cancelled' ? 'cancelled' : 'cancel_requested',
        generation: row.generation, version: task.version + 1, errorCode: null } as TaskRow;
      return this.view(row, provisional, receipt);
    });
  }
  async edit(user: InMemoryUserAccount, id: string, input: unknown, session: InMemoryAuthSession) {
    const command = validate(topicWhiteboardEditSchema, input), hash = topicWhiteboardDigest({ ...command, requestKey: undefined });
    return this.store.transaction(async () => {
      const row = this.record(user, id, session), prior = this.prior(row, command.requestKey, 'edit', hash);
      if (prior) return this.view(row, undefined, prior);
      assertTopicWhiteboardInputCurrent(this.store, this.students, user, row.prepared);
      if (row.status !== 'ready' || row.revision !== command.expectedRevision || row.contentFingerprint !== command.contentFingerprint || !row.content)
        throw new ConflictException('只能修改当前未确认候选，请先比较最新稿');
      let content; try { content = validateTopicWhiteboardContent(row.prepared, command.content); }
      catch { throw new BadRequestException('请核对完整要点、旁白、表格及所选目标'); }
      const fingerprint = topicWhiteboardDigest(content);
      if (fingerprint !== row.contentFingerprint) {
        row.history.push({ version: row.contentVersion, content: structuredClone(row.content), fingerprint: row.contentFingerprint,
          at: row.updatedAt, actorId: row.contentVersion > 1 ? [...row.commands].reverse().find(item => item.kind === 'edit')?.actorUserId ?? null : null });
        row.content = structuredClone(content); row.contentFingerprint = fingerprint; row.contentVersion++;
      }
      return this.view(row, undefined, this.command(row, user, command.requestKey, 'edit', hash, { contentFingerprint: fingerprint }));
    });
  }
  async history(user: InMemoryUserAccount, id: string, input: unknown, session: InMemoryAuthSession) {
    const row = this.record(user, id, session), query = validate(pageSchema.omit({ search: true }), input ?? {});
    const rows = [...row.history].sort((a, b) => b.version - a.version);
    return { page: query.page, limit: query.limit, total: rows.length, currentContentVersion: row.contentVersion,
      items: structuredClone(rows.slice((query.page - 1) * query.limit, query.page * query.limit)) };
  }
  async confirm(user: InMemoryUserAccount, id: string, input: unknown, session: InMemoryAuthSession) {
    const command = validate(topicWhiteboardConfirmSchema, input), hash = topicWhiteboardDigest({ ...command, requestKey: undefined });
    return this.store.transaction(async () => {
      const row = this.record(user, id, session), prior = this.prior(row, command.requestKey, 'confirm', hash);
      if (prior) return this.view(row, undefined, prior);
      assertTopicWhiteboardInputCurrent(this.store, this.students, user, row.prepared);
      if (row.status !== 'ready' || row.stage !== 'completed' || row.revision !== command.expectedRevision || row.contentFingerprint !== command.contentFingerprint)
        throw new ConflictException('请确认当前已完成的原稿版本');
      const task = await this.store.tasks.get(row.taskId);
      if (!task || task.state !== 'succeeded' || task.kind !== topicWhiteboardTaskKind || task.ownerUserId !== user.id || task.payload.draftId !== row.id || task.generation !== row.generation)
        throw new ConflictException('原生成任务尚未完成');
      if ((!row.modelReview || row.modelReview.decision === 'uncertain' || row.modelReview.outputFingerprint !== row.contentFingerprint) && !command.acknowledgeUnreviewedChanges)
        throw new BadRequestException('仍有未核对问题或手工修改，请明确确认候选性质');
      const board = buildTopicWhiteboard(row, this.store.nextId('topic_board'), new Date().toISOString());
      this.store.append('studioTopicWhiteboards', board); row.whiteboardId = board.id; row.status = 'confirmed';
      return this.view(row, task, this.command(row, user, command.requestKey, 'confirm', hash, { contentFingerprint: row.contentFingerprint!, whiteboardId: board.id }));
    });
  }
  publishedRecord(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession): TopicWhiteboardRecord {
    const row = this.store.find('studioTopicWhiteboards', { id });
    if (!row || row.studentId === null && row.ownerUserId !== user.id) throw new NotFoundException('白板不存在');
    const audience = row.studentId === null ? { kind: 'adult' as const } : { kind: 'student' as const, studentId: row.studentId, subject: row.subject!, atomIds: [] };
    captureTopicWhiteboardAuthorization(this.store, this.students, user, audience, session); return row;
  }
  getPublished(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) { return publicTopicWhiteboard(this.publishedRecord(user, id, session), user.id); }
  listPublished(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const query = validate(pageSchema, input ?? {});
    const rows = this.store.inspect('studioTopicWhiteboards').filter(row => {
      try { this.publishedRecord(user, row.id, session); return !query.search || row.title.toLocaleLowerCase().includes(query.search.toLocaleLowerCase()); }
      catch { return false; }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { page: query.page, limit: query.limit, total: rows.length,
      items: rows.slice((query.page - 1) * query.limit, query.page * query.limit).map(row => publicTopicWhiteboard(row, user.id)) };
  }
}
