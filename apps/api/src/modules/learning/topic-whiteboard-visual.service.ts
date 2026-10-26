import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { topicVisualPreflightSchema, topicVisualGenerateSchema, topicVisualEditSchema, topicVisualControlSchema, topicVisualListSchema,
  type TopicVisualPreflightInput, type TopicVisualView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { StudentsService } from '../students/students.service';
import { ClassroomImageService } from '../ai/classroom-image.service';
import { assertTopicWhiteboardInputCurrent, captureTopicWhiteboardAuthorization } from './topic-whiteboard-access';
import { topicWhiteboardDigest } from './topic-whiteboard-content';
import { freezeTopicVisualContext, topicVisualPrompt } from './topic-whiteboard-visual-context';
import { newTopicVisualId, topicVisualFile } from './topic-whiteboard-visual-storage';
import { topicVisualDraft, topicVisualParent, topicVisualTaskKind } from './topic-whiteboard-visual-access';
import type { TopicVisualCommand, TopicVisualRecord } from './topic-whiteboard-visual-record';

const active = new Set(['queued', 'running', 'retry_wait', 'cancel_requested']);
export function reconcileTopicVisual(row: TopicVisualRecord, task: TaskRow | null | undefined) {
  if (task?.id === row.taskId && ['queued', 'generating', 'cancel_requested'].includes(row.status) && ['failed', 'cancelled'].includes(task.state)) {
    row.status = task.state as 'failed' | 'cancelled'; row.revision++; row.updatedAt = new Date().toISOString();
  }
}
@Injectable()
export class TopicWhiteboardVisualService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly images: ClassroomImageService) {}
  capabilities() { return this.images.figureCapabilities(); }
  private record(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) {
    const row = this.store.find('studioTopicWhiteboardVisuals', { id, ownerUserId: user.id });
    if (!row || row.status === 'deleted') throw new NotFoundException('图片候选不存在');
    topicVisualDraft(this.store, this.students, user, row.draftId, session); return row;
  }
  private context(user: InMemoryUserAccount, input: TopicVisualPreflightInput, session: InMemoryAuthSession) {
    const draft = topicVisualDraft(this.store, this.students, user, input.draftId, session);
    assertTopicWhiteboardInputCurrent(this.store, this.students, user, draft.prepared);
    if (draft.status !== 'ready' || draft.revision !== input.expectedRevision || draft.contentFingerprint !== input.contentFingerprint)
      throw new ConflictException('请先保存并比较当前完整稿，再为这一幕配图');
    let frozen;
    try { frozen = freezeTopicVisualContext(draft, input.sceneIndex); }
    catch { throw new ConflictException('本幕教学内容不可用，请保留原稿并核对当前版本'); }
    const parent = input.operation === 'edit' ? topicVisualParent(this.store, { ownerUserId: user.id, draftId: draft.id,
      sceneIndex: input.sceneIndex, sceneTeachingFingerprint: frozen.sceneTeachingFingerprint }, input.parentVisualId) : null;
    const parentOriginal = parent?.files?.original ?? null;
    const fingerprint = topicWhiteboardDigest({ version: 'topic-figure-preflight-v1', input, frozen, parentOriginal, modelId: 'gpt-image-2', size: '1536x1024' });
    return { draft, frozen, parentOriginal, fingerprint };
  }
  async preflight(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const command = validate(topicVisualPreflightSchema, input), context = this.context(user, command, session), capabilities = await this.capabilities();
    return { valid: true, available: capabilities.available && (command.operation !== 'edit' || capabilities.editAvailable), capabilities,
      fingerprint: context.fingerprint, sceneTeachingFingerprint: context.frozen.sceneTeachingFingerprint, context: context.frozen,
      prompt: topicVisualPrompt(context.frozen, command), contextCharacters: JSON.stringify(context.frozen).length, maxContextCharacters: 18000 };
  }
  async view(row: TopicVisualRecord, taskOverride?: TaskRow, receipt?: TopicVisualCommand): Promise<TopicVisualView> {
    const task = taskOverride ?? await this.store.tasks.get(row.taskId);
    if (task && (task.kind !== topicVisualTaskKind || task.ownerUserId !== row.ownerUserId || task.payload.visualId !== row.id || task.payloadHash !== row.requestHash))
      throw new ConflictException('原图片任务身份不一致');
    const draft = this.store.find('studioTopicWhiteboardDrafts', { id: row.draftId, ownerUserId: row.ownerUserId });
    let currentTeaching = false;
    try { currentTeaching = !!draft && freezeTopicVisualContext(draft, row.sceneIndex).sceneTeachingFingerprint === row.sceneTeachingFingerprint; } catch {}
    const status = row.status === 'ready' ? 'ready' : task?.state === 'failed' ? 'failed' : task?.state === 'cancelled' ? 'cancelled' :
      task?.state === 'cancel_requested' || row.status === 'cancel_requested' ? 'cancelling' : row.status;
    return { id: row.id, draftId: row.draftId, sceneIndex: row.sceneIndex, sceneTeachingFingerprint: row.sceneTeachingFingerprint,
      purpose: row.purpose, requirements: row.requirements, operation: row.operation, parentVisualId: row.parentVisualId, changes: row.changes,
      modelId: row.modelId, revision: row.revision, status, selected: false, currentTeaching, contentReview: 'pending',
      imageUrl: row.status === 'ready' ? '/learning/studio/topic-whiteboard-visuals/' + row.id + '/image' : null,
      sha256: row.files?.image.sha256 ?? null, width: row.width, height: row.height, createdAt: row.createdAt, updatedAt: row.updatedAt,
      task: task ? { state: task.state, version: task.version, generation: task.generation, errorCode: task.errorCode } : null,
      ...(receipt ? { receipt: { key: receipt.key, kind: receipt.kind, commandFingerprint: receipt.hash,
        effectiveRevision: receipt.effectiveRevision, generation: receipt.generation, at: receipt.at } } : {}) };
  }
  async prepare(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession, parentId?: string) {
    const command = parentId === undefined ? validate(topicVisualGenerateSchema, input) : validate(topicVisualEditSchema, input);
    if (command.operation === 'edit' && command.parentVisualId !== parentId) throw new ConflictException('修图原件与原命令不一致');
    const hash = topicWhiteboardDigest({ ...command, requestKey: undefined });
    return this.store.transaction(async () => {
      const previous = this.store.find('studioTopicWhiteboardVisuals', { ownerUserId: user.id, requestKey: command.requestKey });
      if (previous) {
        this.record(user, previous.id, session);
        if (previous.requestHash !== hash) throw new ConflictException('原请求已用于其他图片、幕或需求');
        return this.view(previous, undefined, previous.commands.find(item => item.kind === 'prepare' && item.key === command.requestKey));
      }
      const { preflightFingerprint, requestKey, ...selection } = command, context = this.context(user, selection, session);
      if (preflightFingerprint !== context.fingerprint) throw new ConflictException('原教学内容或图片来源已变化，请重新预检并保留原需求');
      const capabilities = await this.capabilities();
      if (!capabilities.available || selection.operation === 'edit' && !capabilities.editAvailable) throw new ServiceUnavailableException(capabilities.message);
      const now = new Date().toISOString();
      const row: TopicVisualRecord = { id: newTopicVisualId(), ownerUserId: user.id, studentId: context.draft.studentId, subject: context.draft.subject,
        draftId: command.draftId, sceneIndex: command.sceneIndex, sceneTeachingFingerprint: context.frozen.sceneTeachingFingerprint,
        frozenContext: context.frozen, operation: command.operation, parentVisualId: command.operation === 'edit' ? command.parentVisualId : null,
        parentOriginal: context.parentOriginal, purpose: command.purpose, requirements: command.requirements, changes: command.operation === 'edit' ? command.changes : null,
        modelId: 'gpt-image-2', size: '1536x1024', requestKey, requestHash: hash, preflightFingerprint, input: structuredClone(command),
        authorization: captureTopicWhiteboardAuthorization(this.store, this.students, user, context.draft.prepared.input.audience, session),
        promptVersion: 'topic-whiteboard-image-v1', prompt: topicVisualPrompt(context.frozen, selection), taskId: this.store.nextId('task'),
        generation: 1, revision: 0, status: 'queued', files: null, width: null, height: null, commands: [], createdAt: now, updatedAt: now };
      const receipt: TopicVisualCommand = { key: requestKey, kind: 'prepare', hash, effectiveRevision: 0, generation: 1, actorUserId: user.id, at: now };
      row.commands.push(receipt); this.store.append('studioTopicWhiteboardVisuals', row);
      const intent = { id: row.taskId, kind: topicVisualTaskKind, ownerUserId: user.id, requestKey: 'topic-visual:' + row.id,
        payloadHash: hash, payload: { visualId: row.id }, createdAt: now, maxAttempts: 2 };
      await this.store.enqueueTask(intent);
      return this.view(row, { ...intent, state: 'queued', attempts: 0, generation: 1, version: 1, availableAt: Date.now(),
        leaseToken: null, leaseUntil: null, progress: {}, result: null, errorCode: null, updatedAt: now }, receipt);
    });
  }
  async get(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) { return this.view(this.record(user, id, session)); }
  async receipt(user: InMemoryUserAccount, id: string | null, key: string, session: InMemoryAuthSession) {
    const row = id === null ? this.store.find('studioTopicWhiteboardVisuals', { ownerUserId: user.id, requestKey: key }) : this.record(user, id, session);
    if (!row) throw new NotFoundException('原图片操作回执不存在'); this.record(user, row.id, session);
    const receipt = row.commands.find(item => item.key === key && (id !== null || item.kind === 'prepare'));
    if (!receipt) throw new NotFoundException('原图片操作回执不存在'); return this.view(row, undefined, receipt);
  }
  async list(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const query = validate(topicVisualListSchema, input ?? {}); topicVisualDraft(this.store, this.students, user, query.draftId, session);
    const rows = this.store.select('studioTopicWhiteboardVisuals', { ownerUserId: user.id, draftId: query.draftId, sceneIndex: query.sceneIndex })
      .filter(row => row.status !== 'deleted' && (!query.search || [row.requirements, row.changes ?? ''].some(text => text.toLocaleLowerCase().includes(query.search.toLocaleLowerCase()))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { page: query.page, limit: query.limit, total: rows.length, items: await Promise.all(rows.slice((query.page - 1) * query.limit, query.page * query.limit).map(row => this.view(row))) };
  }
  file(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession, part: 'image' | 'original') {
    const row = this.record(user, id, session);
    if (row.status !== 'ready' || !row.files) throw new ConflictException('原图片尚未就绪');
    try { return topicVisualFile(row, part); } catch { throw new ConflictException('原图片字节不可用，请保留文字稿'); }
  }
  async control(user: InMemoryUserAccount, id: string, action: 'cancel' | 'retry', input: unknown, session: InMemoryAuthSession) {
    const command = validate(topicVisualControlSchema, input), hash = topicWhiteboardDigest({ action, ...command, requestKey: undefined });
    return this.store.transaction(async () => {
      const row = this.record(user, id, session), previous = row.commands.find(item => item.key === command.requestKey);
      if (previous) {
        if (previous.kind !== action || previous.hash !== hash) throw new ConflictException('原请求标识已用于不同图片操作');
        return this.view(row, undefined, previous);
      }
      const task = await this.store.tasks.get(row.taskId);
      if (!task || task.kind !== topicVisualTaskKind || task.ownerUserId !== user.id || task.payload.visualId !== row.id || task.payloadHash !== row.requestHash ||
        task.generation !== command.generation || row.generation > task.generation) throw new ConflictException('原图片代次已变化，请先读取原操作');
      const exact = row.revision === command.expectedRevision && task.version === command.taskVersion;
      const progressOnly = action === 'cancel' && command.expectedRevision <= row.revision && command.taskVersion <= task.version && active.has(task.state) &&
        !row.commands.some(item => item.effectiveRevision > command.expectedRevision && ['cancel', 'retry'].includes(item.kind));
      if (!exact && !progressOnly || row.status === 'ready') throw new ConflictException('原图片或控制版本已变化');
      row.generation = task.generation;
      if (action === 'retry') {
        if (!['failed', 'cancelled'].includes(task.state)) throw new ConflictException('原图片任务还未结束');
        const draft = topicVisualDraft(this.store, this.students, user, row.draftId, session);
        assertTopicWhiteboardInputCurrent(this.store, this.students, user, draft.prepared);
        let fingerprint: string | null = null;
        try { fingerprint = freezeTopicVisualContext(draft, row.sceneIndex).sceneTeachingFingerprint; } catch {}
        if (fingerprint !== row.sceneTeachingFingerprint) throw new ConflictException('原教学内容已变化，请另行准备当前配图');
        if (row.operation === 'edit') {
          const parent = topicVisualParent(this.store, row, row.parentVisualId!);
          if (topicWhiteboardDigest(parent.files!.original) !== topicWhiteboardDigest(row.parentOriginal)) throw new ConflictException('原图片字节已变化');
        }
        const capabilities = await this.capabilities();
        if (!capabilities.available || row.operation === 'edit' && !capabilities.editAvailable) throw new ServiceUnavailableException(capabilities.message);
        row.authorization = captureTopicWhiteboardAuthorization(this.store, this.students, user, draft.prepared.input.audience, session);
        row.status = 'queued'; row.generation++;
      } else {
        if (!active.has(task.state) || row.status === 'cancel_requested' || task.state === 'cancel_requested') throw new ConflictException('原任务已结束或正在取消');
        row.status = task.state === 'running' ? 'cancel_requested' : 'cancelled';
      }
      await this.store.controlTask({ id: task.id, action, expectedVersion: task.version, actorId: user.id });
      row.revision++; row.updatedAt = new Date().toISOString();
      const receipt: TopicVisualCommand = { key: command.requestKey, kind: action, hash, effectiveRevision: row.revision,
        generation: row.generation, at: row.updatedAt, actorUserId: user.id }; row.commands.push(receipt);
      return this.view(row, { ...task, state: action === 'retry' ? 'queued' : row.status === 'cancelled' ? 'cancelled' : 'cancel_requested',
        generation: row.generation, version: task.version + 1, errorCode: null } as TaskRow, receipt);
    });
  }
}
