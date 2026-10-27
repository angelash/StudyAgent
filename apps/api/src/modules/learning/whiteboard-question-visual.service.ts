import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { questionVisualPreflightSchema, questionVisualGenerateSchema, questionVisualEditSchema, questionVisualControlSchema, questionVisualAdoptSchema,
  questionVisualIdSchema, questionTeachingVersionIdSchema, type QuestionVisualPreflightInput, type QuestionVisualTarget, type QuestionVisualView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount, type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { StudentsService } from '../students/students.service';
import { ClassroomImageService } from '../ai/classroom-image.service';
import { TopicWhiteboardService } from './topic-whiteboard.service';
import { topicWhiteboardDigest } from './topic-whiteboard-content';
import { questionVisualSource, questionVisualOriginal, questionVisualParent, questionVisualTaskKind } from './whiteboard-question-visual-access';
import { questionVisualPrompt } from './whiteboard-question-visual-context';
import { newQuestionVisualId, questionVisualFile, questionVisualDescriptorFile } from './whiteboard-question-visual-storage';
import { adoptQuestionFigure, buildQuestionTeachingVersion, questionTeachingVersions } from './whiteboard-question-teaching-versions';
import type { QuestionVisualRecord } from './whiteboard-question-visual-record';

const sourceSchema = z.object({ boardKind: z.enum(['guidance', 'topic']), boardId: z.string().min(1).max(180), turnId: z.string().min(1).max(180) }).strict();
const listSchema = sourceSchema.extend({ page: z.coerce.number().int().min(1).max(1000000).default(1), limit: z.coerce.number().int().min(1).max(24).default(12) });
const active = new Set(['queued', 'running', 'retry_wait', 'cancel_requested']);
export function reconcileQuestionVisual(row: QuestionVisualRecord, task: TaskRow | null | undefined) {
  if (task?.id === row.taskId && ['queued', 'generating', 'cancel_requested'].includes(row.status) && ['failed', 'cancelled'].includes(task.state)) {
    row.status = task.state as 'failed' | 'cancelled'; row.revision++; row.updatedAt = new Date().toISOString();
  }
}
@Injectable()
export class WhiteboardQuestionVisualService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly topics: TopicWhiteboardService,
    private readonly images: ClassroomImageService) {}
  capabilities() { return this.images.figureCapabilities(); }
  source(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const query = validate(sourceSchema, input), context = questionVisualSource(this.store, this.students, this.topics, user, query.boardKind, query.boardId, query.turnId, session);
    return { target: context.frozen.target, teachingFingerprint: context.frozen.teachingFingerprint, versions: questionTeachingVersions(context.turn) };
  }
  private record(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) {
    id = validate(questionVisualIdSchema, id); const row = this.store.find('whiteboardQuestionVisuals', { id, ownerUserId: user.id });
    if (!row || row.status === 'deleted') throw new NotFoundException('原回答配图不存在');
    questionVisualOriginal(this.store, this.students, this.topics, user, row.target, session); return row;
  }
  private context(user: InMemoryUserAccount, command: QuestionVisualPreflightInput, session: InMemoryAuthSession) {
    const source = questionVisualOriginal(this.store, this.students, this.topics, user, command.target, session);
    const parent = command.operation === 'edit' ? questionVisualParent(this.store, { ownerUserId: user.id, target: source.frozen.target }, command.parentVisualId) : null;
    const parentOriginal = parent?.files?.original ?? null;
    const fingerprint = topicWhiteboardDigest({ version: 'question-figure-preflight-v1', command, context: source.frozen, parentOriginal, modelId: 'gpt-image-2', size: '1536x1024' });
    return { ...source, parentOriginal, fingerprint };
  }
  async preflight(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const command = validate(questionVisualPreflightSchema, input), context = this.context(user, command, session), capabilities = await this.capabilities();
    const current = await this.store.transaction(() => this.context(user, command, session));
    if (current.fingerprint !== context.fingerprint || topicWhiteboardDigest(current.authorization) !== topicWhiteboardDigest(context.authorization))
      throw new ConflictException('原配图范围或授权已变化，请重新预检');
    return { available: capabilities.available && (command.operation !== 'edit' || capabilities.editAvailable), capabilities, fingerprint: context.fingerprint,
      teachingFingerprint: context.frozen.teachingFingerprint, context: context.frozen.teaching, prompt: questionVisualPrompt(context.frozen, command),
      contextCharacters: JSON.stringify(context.frozen).length, maxContextCharacters: 18000 };
  }
  async view(row: QuestionVisualRecord, taskOverride?: TaskRow, receipt?: QuestionVisualRecord['commands'][number]): Promise<QuestionVisualView> {
    const task = taskOverride ?? await this.store.tasks.get(row.taskId);
    if (task && (task.kind !== questionVisualTaskKind || task.ownerUserId !== row.ownerUserId || task.payload.visualId !== row.id || task.payloadHash !== row.requestHash))
      throw new ConflictException('原配图任务身份不一致');
    const turn = this.store.find('whiteboardQuestionTurns', { id: row.target.turnId, ownerUserId: row.ownerUserId }), versions = turn?.teachingVersions ?? [];
    const selected = versions.some(version => version.id === turn?.currentTeachingVersionId && version.figure.visualId === row.id);
    const status = row.status === 'ready' ? 'ready' : task?.state === 'failed' ? 'failed' : task?.state === 'cancelled' ? 'cancelled' : task?.state === 'cancel_requested' ? 'cancelling' : row.status === 'cancel_requested' ? 'cancelling' : row.status;
    return { id: row.id, target: structuredClone(row.target), teachingFingerprint: row.teachingFingerprint, purpose: row.purpose, requirements: row.requirements,
      operation: row.operation, parentVisualId: row.parentVisualId, changes: row.changes, modelId: row.modelId, revision: row.revision, status, selected,
      currentTeaching: true, contentReview: 'pending', imageUrl: row.status === 'ready' ? '/learning/studio/whiteboard-question-visuals/' + row.id + '/image' : null,
      sha256: row.files?.image.sha256 ?? null, originalSha256: row.files?.original.sha256 ?? null, width: row.width, height: row.height, createdAt: row.createdAt, updatedAt: row.updatedAt,
      task: task ? { state: task.state, version: task.version, generation: task.generation, errorCode: task.errorCode } : null,
      ...(receipt ? { receipt: { key: receipt.key, kind: receipt.kind, commandFingerprint: receipt.hash, effectiveRevision: receipt.effectiveRevision, generation: receipt.generation, at: receipt.at } } : {}) };
  }
  async prepare(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession, parentId?: string) {
    const command = parentId === undefined ? validate(questionVisualGenerateSchema, input) : validate(questionVisualEditSchema, input);
    if (command.operation === 'edit' && command.parentVisualId !== parentId) throw new ConflictException('修图原件与原命令不一致');
    const hash = topicWhiteboardDigest({ ...command, requestKey: undefined });
    return this.store.transaction(async () => {
      const previous = this.store.find('whiteboardQuestionVisuals', { ownerUserId: user.id, requestKey: command.requestKey });
      if (previous) { this.record(user, previous.id, session); if (previous.requestHash !== hash) throw new ConflictException('原请求键已用于其他回答配图'); return this.view(previous, undefined, previous.commands.find(item => item.key === command.requestKey && item.kind === 'prepare')); }
      const { requestKey, preflightFingerprint, ...selection } = command, context = this.context(user, selection, session);
      if (preflightFingerprint !== context.fingerprint) throw new ConflictException('完整回答或原PNG已变化，请重新预检');
      const capabilities = await this.capabilities(); if (!capabilities.available || command.operation === 'edit' && !capabilities.editAvailable) throw new ServiceUnavailableException(capabilities.message);
      const at = new Date().toISOString(), row: QuestionVisualRecord = { id: newQuestionVisualId(), ownerUserId: user.id, studentId: context.turn.studentId,
        target: structuredClone(context.frozen.target), frozenContext: structuredClone(context.frozen), teachingFingerprint: context.frozen.teachingFingerprint,
        input: structuredClone(command), purpose: command.purpose, requirements: command.requirements, operation: command.operation,
        changes: command.operation === 'edit' ? command.changes : null, parentVisualId: command.operation === 'edit' ? command.parentVisualId : null,
        parentOriginal: context.parentOriginal, authorization: context.authorization, modelId: 'gpt-image-2', size: '1536x1024', promptVersion: 'whiteboard-question-image-v1',
        prompt: questionVisualPrompt(context.frozen, selection), requestKey, requestHash: hash, preflightFingerprint, taskId: this.store.nextId('task'), generation: 1,
        revision: 0, status: 'queued', files: null, width: null, height: null, commands: [{ key: requestKey, kind: 'prepare', hash, effectiveRevision: 0, generation: 1, at, actorUserId: user.id }], createdAt: at, updatedAt: at };
      this.store.append('whiteboardQuestionVisuals', row);
      const intent = { id: row.taskId, kind: questionVisualTaskKind, ownerUserId: user.id, requestKey: 'question-visual:' + row.id, payloadHash: hash,
        payload: { visualId: row.id }, createdAt: at, maxAttempts: 2 }; await this.store.enqueueTask(intent);
      return this.view(row, { ...intent, state: 'queued', attempts: 0, generation: 1, version: 1, availableAt: Date.now(), leaseToken: null, leaseUntil: null,
        progress: {}, result: null, errorCode: null, updatedAt: at }, row.commands[0]);
    });
  }
  async get(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) { return this.view(this.record(user, id, session)); }
  async receipt(user: InMemoryUserAccount, key: string, session: InMemoryAuthSession, id?: string) {
    key = validate(z.string().min(8).max(180), key); const row = id === undefined ? this.store.find('whiteboardQuestionVisuals', { ownerUserId: user.id, requestKey: key }) : this.record(user, id, session);
    if (!row) throw new NotFoundException('原配图请求未找到'); this.record(user, row.id, session);
    const receipt = row.commands.find(item => item.key === key && (id !== undefined || item.kind === 'prepare'));
    if (!receipt) throw new NotFoundException('原配图操作回执未找到'); return this.view(row, undefined, receipt);
  }
  async list(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const query = validate(listSchema, input), target = this.source(user, { boardKind: query.boardKind, boardId: query.boardId, turnId: query.turnId }, session).target;
    const rows = this.store.select('whiteboardQuestionVisuals', { ownerUserId: user.id }).filter(row => row.status !== 'deleted' && topicWhiteboardDigest(row.target) === topicWhiteboardDigest(target))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { page: query.page, limit: query.limit, total: rows.length, items: await Promise.all(rows.slice((query.page - 1) * query.limit, query.page * query.limit).map(row => this.view(row))) };
  }
  file(user: InMemoryUserAccount, id: string, part: 'image' | 'original', session: InMemoryAuthSession) {
    const row = this.record(user, id, session); if (row.status !== 'ready' || !row.files) throw new ConflictException('原配图尚未就绪');
    try { return questionVisualFile(row, part); } catch { throw new ConflictException('原图片字节缺失或变化，请保留要求并核对原件'); }
  }
  async adopt(user: InMemoryUserAccount, input: unknown, session: InMemoryAuthSession) {
    const command = validate(questionVisualAdoptSchema, input);
    return this.store.transaction(() => {
      const context = questionVisualOriginal(this.store, this.students, this.topics, user, command.target, session), visual = this.record(user, command.visualId, session);
      this.file(user, visual.id, 'original', session); this.file(user, visual.id, 'image', session);
      const adopted = adoptQuestionFigure(context.turn, visual, command, new Date().toISOString());
      return { versionId: adopted.version.id, replayed: adopted.replayed, board: buildQuestionTeachingVersion(context.turn, context.current.board, adopted.version.id), versions: questionTeachingVersions(context.turn) };
    });
  }
  teaching(user: InMemoryUserAccount, target: Pick<QuestionVisualTarget, 'boardKind' | 'boardId' | 'turnId'>, versionId: string, session: InMemoryAuthSession) {
    versionId = validate(questionTeachingVersionIdSchema, versionId); const context = questionVisualSource(this.store, this.students, this.topics, user, target.boardKind, target.boardId, target.turnId, session);
    return { ...context, board: buildQuestionTeachingVersion(context.turn, context.current.board, versionId) };
  }
  versionFile(user: InMemoryUserAccount, target: Pick<QuestionVisualTarget, 'boardKind' | 'boardId' | 'turnId'>, versionId: string, part: 'image' | 'original', session: InMemoryAuthSession) {
    const context = this.teaching(user, target, versionId, session), version = context.turn.teachingVersions?.find(version => version.id === versionId);
    if (!version) throw new NotFoundException('这个教学版本没有采用图片');
    try { return questionVisualDescriptorFile(version.figure.visualId, version.figure[part]); } catch { throw new ConflictException('原教学版本的图片字节缺失或变化'); }
  }
  async control(user: InMemoryUserAccount, id: string, action: 'cancel' | 'retry', input: unknown, session: InMemoryAuthSession) {
    const command = validate(questionVisualControlSchema, input), hash = topicWhiteboardDigest({ action, ...command, requestKey: undefined });
    return this.store.transaction(async () => {
      const row = this.record(user, id, session), previous = row.commands.find(item => item.key === command.requestKey);
      if (previous) { if (previous.kind !== action || previous.hash !== hash) throw new ConflictException('原配图命令已用于不同操作'); return this.view(row, undefined, previous); }
      const task = await this.store.tasks.get(row.taskId);
      if (!task || task.kind !== questionVisualTaskKind || task.ownerUserId !== user.id || task.payload.visualId !== row.id || task.payloadHash !== row.requestHash ||
        task.generation !== command.generation || row.generation > task.generation) throw new ConflictException('原配图任务身份或代次已变化');
      const exact = row.revision === command.expectedRevision && task.version === command.taskVersion;
      const progressOnly = action === 'cancel' && command.expectedRevision <= row.revision && command.taskVersion <= task.version && active.has(task.state) &&
        !row.commands.some(item => item.effectiveRevision > command.expectedRevision && ['cancel', 'retry'].includes(item.kind));
      if (!exact && !progressOnly || row.status === 'ready') throw new ConflictException('原配图或控制版本已变化');
      row.generation = task.generation;
      if (action === 'retry') {
        if (!['failed', 'cancelled'].includes(task.state)) throw new ConflictException('原配图任务还未结束');
        const context = questionVisualOriginal(this.store, this.students, this.topics, user, row.target, session);
        if (context.frozen.teachingFingerprint !== row.teachingFingerprint) throw new ConflictException('原完整回答已变化');
        if (row.operation === 'edit') { const parent = questionVisualParent(this.store, row, row.parentVisualId!); if (topicWhiteboardDigest(parent.files!.original) !== topicWhiteboardDigest(row.parentOriginal)) throw new ConflictException('原修图PNG已变化'); }
        const capabilities = await this.capabilities(); if (!capabilities.available || row.operation === 'edit' && !capabilities.editAvailable) throw new ServiceUnavailableException(capabilities.message);
        row.authorization = context.authorization; row.status = 'queued'; row.generation++;
      } else { if (!active.has(task.state) || row.status === 'cancel_requested') throw new ConflictException('原配图已结束或正在取消'); row.status = task.state === 'running' ? 'cancel_requested' : 'cancelled'; }
      await this.store.controlTask({ id: task.id, action, expectedVersion: task.version, actorId: user.id }); row.revision++; row.updatedAt = new Date().toISOString();
      const receipt = { key: command.requestKey, kind: action, hash, effectiveRevision: row.revision, generation: row.generation, actorUserId: user.id, at: row.updatedAt }; row.commands.push(receipt);
      return this.view(row, { ...task, state: action === 'retry' ? 'queued' : row.status === 'cancelled' ? 'cancelled' : 'cancel_requested', generation: row.generation, version: task.version + 1, errorCode: null }, receipt);
    });
  }
}
