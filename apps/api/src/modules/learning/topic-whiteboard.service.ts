import { AssistantWhiteboardService } from './assistant-whiteboard.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Optional, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
import { freezeTopicWhiteboardFigures } from './topic-whiteboard-figures';
import { topicVisualDescriptorFile } from './topic-whiteboard-visual-storage';
import { assistantWhiteboardCreateSchema, assistantWhiteboardEditSchema, assistantWhiteboardListSchema, type StudioSubject } from '@study-agent/contracts';

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
    private readonly models: XiaojiuModelsService, private readonly chat: XiaojiuChatService, @Optional() private readonly source?: AssistantWhiteboardService) {}
  modelAvailable() { return this.chat.enabled; }

  private record(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) {
    const row = this.store.find('studioTopicWhiteboardDrafts', { id, ownerUserId: user.id });
    if (!row) throw new NotFoundException('白板候选不存在');
    captureTopicWhiteboardAuthorization(this.store, this.students, user, row.prepared.input.audience, session, row.prepared, this.source);
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
  /** Called only by the explicit private source entry; source text is rebuilt inside this transaction. */
  async prepareSource(user: InMemoryUserAccount, sessionId: string, input: unknown, session: InMemoryAuthSession) {
    const command = validate(assistantWhiteboardCreateSchema, input), { requestKey, preflightFingerprint, ...selection } = command;
    const hash = topicWhiteboardDigest({ kind: 'assistant-topic-whiteboard-v1', sessionId, ...command, requestKey: undefined });
    return this.store.transaction(async () => {
      const previous = this.store.find('studioTopicWhiteboardDrafts', { ownerUserId: user.id, requestKey });
      if (previous) {
        if (previous.prepared.version !== 'assistant-topic-whiteboard-v1' || previous.prepared.source.sessionId !== sessionId || previous.requestHash !== hash)
          throw new ConflictException('原创建请求已用于另一份白板或原会话');
        this.record(user, previous.id, session);
        return this.view(previous, undefined, previous.commands.find(item => item.kind === 'prepare' && item.key === requestKey));
      }
      if (!this.source) throw new ForbiddenException('原对话白板需要完整来源授权');
      const prepared = this.source.prepare(user, sessionId, selection);
      if (prepared.source.preflightFingerprint !== preflightFingerprint) throw new ConflictException('完整来源、原范围或模型已变化，请重新预检');
      const authorization = captureTopicWhiteboardAuthorization(this.store, this.students, user, prepared.input.audience, session, prepared, this.source);
      this.source.assertCurrent(user, prepared);
      const now = new Date().toISOString(), row: TopicWhiteboardDraftRecord = { id: this.store.nextId('topic_draft'), ownerUserId: user.id,
        studentId: prepared.source.origin.studentId, subject: prepared.source.origin.subject as StudioSubject | null,
        requestKey, requestHash: hash, prepared, authorization, status: 'queued', revision: 0, generation: 1, taskId: this.store.nextId('task'),
        stage: 'writing', modelName: prepared.modelName, originalContent: null, content: null, originalFingerprint: null, contentFingerprint: null,
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
  private async readableView(user: InMemoryUserAccount, row: TopicWhiteboardDraftRecord, session: InMemoryAuthSession, receipt?: TopicWhiteboardCommand) {
    const view = await this.view(row, undefined, receipt);
    if (row.prepared.version === 'assistant-topic-whiteboard-v1') await this.store.transaction(() => this.record(user, row.id, session));
    return view;
  }
  async get(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) { return this.readableView(user, this.record(user, id, session), session); }
  sourceView(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) {
    const row = this.record(user, id, session);
    if (row.prepared.version !== 'assistant-topic-whiteboard-v1') throw new NotFoundException('该白板没有原对话来源');
    const maps = (content: typeof row.content) => content?.scenes.map((scene, index) => ({ sceneIndex: index,
      ...structuredClone((scene as typeof scene & { sourceMap: unknown }).sourceMap as object) })) ?? [];
    return { protocol: row.prepared.version, draftId: row.id, sourceFingerprint: row.prepared.source.sourceFingerprint,
      origin: structuredClone(row.prepared.source.origin), mappings: { original: maps(row.originalContent), current: maps(row.content) } };
  }
  async sourceReceipt(user: InMemoryUserAccount, sessionId: string, key: string, session: InMemoryAuthSession) {
    if (!this.source) throw new ForbiddenException('原对话白板需要完整来源授权');
    this.source.captureSession(user, sessionId, session);
    const row = this.store.find('studioTopicWhiteboardDrafts', { ownerUserId: user.id, requestKey: key });
    if (!row || row.prepared.version !== 'assistant-topic-whiteboard-v1' || row.prepared.source.sessionId !== sessionId)
      throw new NotFoundException('原白板创建回执不存在');
    this.record(user, row.id, session);
    return this.readableView(user, row, session, row.commands.find(command => command.kind === 'prepare' && command.key === key));
  }
  async sourceList(user: InMemoryUserAccount, sessionId: string, input: unknown, session: InMemoryAuthSession) {
    if (!this.source) throw new ForbiddenException('原对话白板需要完整来源授权');
    this.source.captureSession(user, sessionId, session);
    const query = validate(assistantWhiteboardListSchema, input ?? {});
    let cursor: { ownerId: string; sessionId: string; at: string; id: string } | undefined;
    if (query.cursor) try {
      cursor = z.object({ ownerId: z.literal(user.id), sessionId: z.literal(sessionId), at: z.string().datetime(), id: z.string().min(1).max(180) })
        .strict().parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
    } catch { throw new BadRequestException('原分页位置不属于本人此会话，请重新读取列表'); }
    const rows = this.store.select('studioTopicWhiteboardDrafts', { ownerUserId: user.id })
      .filter(row => row.prepared.version === 'assistant-topic-whiteboard-v1' && row.prepared.source.sessionId === sessionId)
      .filter(row => { try { this.record(user, row.id, session); return true; } catch { return false; } })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .filter(row => !cursor || row.createdAt < cursor.at || row.createdAt === cursor.at && row.id < cursor.id);
    const chosen = rows.slice(0, query.pageSize), views = await Promise.all(chosen.map(row => this.readableView(user, row, session)));
    const items = views.map(({ id, prompt, objective, modelId, modelName, status, stage, revision, contentFingerprint, whiteboardId, createdAt, updatedAt }) =>
      ({ id, prompt, objective, modelId, modelName, status, stage, revision, contentFingerprint, whiteboardId, createdAt, updatedAt }));
    const last = chosen.at(-1);
    return { items, nextCursor: rows.length > query.pageSize && last
      ? Buffer.from(JSON.stringify({ ownerId: user.id, sessionId, at: last.createdAt, id: last.id })).toString('base64url') : null };
  }
  async receipt(user: InMemoryUserAccount, id: string, key: string, session: InMemoryAuthSession) {
    const row = this.record(user, id, session), receipt = row.commands.find(item => item.key === key);
    if (!receipt) throw new NotFoundException('原操作回执不存在'); return this.readableView(user, row, session, receipt);
  }
  async list(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const query = validate(pageSchema, input ?? {}), rows = this.store.select('studioTopicWhiteboardDrafts', { ownerUserId: user.id })
      .filter(row => { try { captureTopicWhiteboardAuthorization(this.store, this.students, user, row.prepared.input.audience, session, row.prepared, this.source); return true; } catch { return false; } })
      .filter(row => !query.search || [row.prepared.input.prompt, row.prepared.input.objective, row.content?.title ?? ''].some(text => text.toLocaleLowerCase().includes(query.search.toLocaleLowerCase())))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { page: query.page, limit: query.limit, total: rows.length,
      items: await Promise.all(rows.slice((query.page - 1) * query.limit, query.page * query.limit).map(row => this.readableView(user, row, session))) };
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
        assertTopicWhiteboardInputCurrent(this.store, this.students, user, row.prepared, this.source);
        if (!this.modelAvailable()) throw new ServiceUnavailableException('小九AI当前未启用');
        row.authorization = captureTopicWhiteboardAuthorization(this.store, this.students, user, row.prepared.input.audience, session, row.prepared, this.source);
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
    return this.store.transaction(async () => {
      const row = this.record(user, id, session);
      const command = validate(row.prepared.version === 'assistant-topic-whiteboard-v1' ? assistantWhiteboardEditSchema : topicWhiteboardEditSchema, input);
      const hash = topicWhiteboardDigest({ ...command, requestKey: undefined }), prior = this.prior(row, command.requestKey, 'edit', hash);
      if (prior) return this.view(row, undefined, prior);
      assertTopicWhiteboardInputCurrent(this.store, this.students, user, row.prepared, this.source);
      if (row.status !== 'ready' || row.revision !== command.expectedRevision || row.contentFingerprint !== command.contentFingerprint || !row.content)
        throw new ConflictException('只能修改当前未确认候选，请先比较最新稿');
      let content; try { content = validateTopicWhiteboardContent(row.prepared, command.content, { allowFigures: true }); }
      catch { throw new BadRequestException('请核对完整要点、旁白、表格及所选目标'); }
      freezeTopicWhiteboardFigures(this.store, row, content);
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
      assertTopicWhiteboardInputCurrent(this.store, this.students, user, row.prepared, this.source);
      if (row.status !== 'ready' || row.stage !== 'completed' || row.revision !== command.expectedRevision || row.contentFingerprint !== command.contentFingerprint)
        throw new ConflictException('请确认当前已完成的原稿版本');
      const task = await this.store.tasks.get(row.taskId);
      if (!task || task.state !== 'succeeded' || task.kind !== topicWhiteboardTaskKind || task.ownerUserId !== user.id || task.payload.draftId !== row.id || task.generation !== row.generation)
        throw new ConflictException('原生成任务尚未完成');
      if ((!row.modelReview || row.modelReview.decision === 'uncertain' || row.modelReview.outputFingerprint !== row.contentFingerprint) && !command.acknowledgeUnreviewedChanges)
        throw new BadRequestException('仍有未核对问题或手工修改，请明确确认候选性质');
      const figures = freezeTopicWhiteboardFigures(this.store, row, row.content!);
      const board = buildTopicWhiteboard(row, this.store.nextId('topic_board'), new Date().toISOString(), figures);
      this.store.append('studioTopicWhiteboards', board); row.whiteboardId = board.id; row.status = 'confirmed';
      return this.view(row, task, this.command(row, user, command.requestKey, 'confirm', hash, { contentFingerprint: row.contentFingerprint!, whiteboardId: board.id }));
    });
  }
  publishedRecord(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession, writing = false): TopicWhiteboardRecord {
    const row = this.store.find('studioTopicWhiteboards', { id });
    if (!row || row.studentId === null && row.ownerUserId !== user.id) throw new NotFoundException('白板不存在');
    const draft = this.store.find('studioTopicWhiteboardDrafts', { id: row.sourceDraftId });
    if (draft?.prepared.version && !['topic-whiteboard-v1', 'assistant-topic-whiteboard-v1'].includes(draft.prepared.version)) throw new NotFoundException('未知的白板来源协议');
    if (row.privateToCreator || row.sourceProtocol === 'assistant-topic-whiteboard-v1' || draft?.prepared.version === 'assistant-topic-whiteboard-v1') {
      if (row.ownerUserId !== user.id || !draft || draft.ownerUserId !== user.id || draft.prepared.version !== 'assistant-topic-whiteboard-v1'
        || !row.privateToCreator || row.sourceProtocol !== draft.prepared.version || draft.whiteboardId !== row.id
        || row.studentId !== draft.studentId || row.subject !== draft.subject) throw new NotFoundException('本人来源白板不存在');
      this.record(user, draft.id, session);
      if (writing) assertTopicWhiteboardInputCurrent(this.store, this.students, user, draft.prepared, this.source);
      return row;
    }
    const audience = row.studentId === null ? { kind: 'adult' as const } : { kind: 'student' as const, studentId: row.studentId, subject: row.subject!, atomIds: [] };
    captureTopicWhiteboardAuthorization(this.store, this.students, user, audience, session); return row;
  }
  publishedAuthorization(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession, writing = false) {
    const row = this.publishedRecord(user, id, session, writing);
    if (row.privateToCreator) {
      const draft = this.record(user, row.sourceDraftId, session);
      return captureTopicWhiteboardAuthorization(this.store, this.students, user, draft.prepared.input.audience, session, draft.prepared, this.source);
    }
    const audience = row.studentId === null ? { kind: 'adult' as const } : { kind: 'student' as const, studentId: row.studentId, subject: row.subject!, atomIds: [] };
    return captureTopicWhiteboardAuthorization(this.store, this.students, user, audience, session);
  }
  getPublished(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) { return publicTopicWhiteboard(this.publishedRecord(user, id, session), user.id); }
  publishedFigure(user: InMemoryUserAccount, id: string, sceneId: string, session: InMemoryAuthSession, part: 'image' | 'original') {
    const board = this.publishedRecord(user, id, session), snapshot = board.figureSnapshots?.find(item => item.sceneId === sceneId);
    if (user.role === 'student' && board.sourceProtocol !== 'assistant-topic-whiteboard-v1') throw new ForbiddenException('请从本人原对话白板查看图片');
    const figure = board.scenes.find(scene => scene.id === sceneId)?.figure;
    if (!snapshot || !figure) throw new NotFoundException('白板图片不存在');
    if (snapshot[part].sha256 !== (part === 'image' ? figure.sha256 : figure.originalSha256)) throw new ConflictException('冻结图片身份不一致');
    try { return topicVisualDescriptorFile(snapshot.visualId, snapshot[part]); }
    catch { throw new ConflictException('冻结图片字节不可用，请保留完整文字稿'); }
  }
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
