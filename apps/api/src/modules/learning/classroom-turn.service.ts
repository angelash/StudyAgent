import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ClassroomTurnView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount, type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { sessionPresentation } from './classroom-presentation';
import { visualSession } from './classroom-visual.service';
import type { ClassroomTurnRecord } from './classroom-turn-record';

export const classroomTurnKind = 'classroom.turn.reply';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export const turnDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const key = z.string().min(8).max(180);
const commandSchema = z.object({ requestKey: key, message: z.string().trim().min(1).max(2000), modelId: z.string().min(1).max(180),
  intent: z.enum(['question', 'example', 'simplify', 'prerequisite', 'compare']), questionId: z.string().min(1).max(200).optional(),
  contentFingerprint: z.string().min(1).max(100), stepId: z.string().min(1).max(180), sentenceCursor: z.number().int().min(0),
  presentationVersion: z.enum(['legacy-v1', 'speech-v2']), unitId: z.string().min(1).max(100) }).strict();

/** Revalidated from a fresh transaction before a worker publishes, including the original grant. */
export function turnAuthority(store: InMemoryStoreService, students: StudentsService, turn: ClassroomTurnRecord) {
  const user = store.find('users', { id: turn.ownerUserId, status: 'active', role: turn.authorization.role });
  if (!user) throw new ForbiddenException('课堂授权已变化');
  const session = visualSession(store, students, user, turn.sessionId), auth = turn.authorization;
  if (session.studentId !== turn.studentId || session.contentFingerprint !== turn.position.contentFingerprint ||
    turnDigest(session.lesson) !== turn.lessonHash || sessionPresentation(session).version !== turn.position.presentationVersion ||
    !sessionPresentation(session).tracks[turn.position.stepId]?.units.some(unit => unit.id === turn.position.unitId && unit.text === turn.position.sentenceText))
    throw new ConflictException('课堂内容已变化');
  if (auth.bindingId && !store.find('bindings', { id: auth.bindingId, studentId: turn.studentId, parentUserId: auth.guardianId ?? user.id, status: 'active' }))
    throw new ForbiddenException('原监护授权已撤回');
  if (user.role === 'student') {
    const guardian = store.find('users', { id: auth.guardianId, status: 'active' });
    if (!guardian || !['parent', 'admin'].includes(guardian.role) ||
      !store.find('studentLearningAccess', { id: auth.accessId, studentId: turn.studentId, userId: user.id, status: 'enabled', version: auth.accessVersion }))
      throw new ForbiddenException('原学习授权已变化');
  }
  return session;
}

@Injectable()
export class ClassroomTurnService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly models: XiaojiuModelsService) {}

  private record(user: InMemoryUserAccount, sessionId: string, id: string) {
    visualSession(this.store, this.students, user, sessionId);
    const turn = this.store.find('classroomTurns', { id, sessionId, ownerUserId: user.id });
    if (!turn) throw new NotFoundException('插问记录不存在');
    return turn;
  }
  async view(turn: ClassroomTurnRecord, provisional?: ClassroomTurnView['task']): Promise<ClassroomTurnView> {
    const task = provisional ?? await this.store.tasks.get(turn.taskId);
    const status = turn.status === 'completed' ? 'completed' : task?.state === 'failed' ? 'failed' : task?.state === 'cancelled' ? 'cancelled' : task?.state === 'cancel_requested' ? 'cancelling' : turn.status;
    const { id, sessionId, requestKey, message, intent, modelId, modelName, questionId, position, revision, createdAt, updatedAt, userMessageId, assistantMessageId } = turn;
    return { id, sessionId, requestKey, message, intent, modelId, modelName, ...(questionId ? { questionId } : {}), position: structuredClone(position),
      revision, createdAt, updatedAt, userMessageId, assistantMessageId, status,
      task: task ? { state: task.state, version: task.version, generation: task.generation, errorCode: task.errorCode } : null };
  }
  async list(user: InMemoryUserAccount, sessionId: string) {
    visualSession(this.store, this.students, user, sessionId);
    return Promise.all(this.store.select('classroomTurns', { sessionId, ownerUserId: user.id }).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(row => this.view(row)));
  }
  async get(user: InMemoryUserAccount, sessionId: string, id: string) { return this.view(this.record(user, sessionId, id)); }

  async create(user: InMemoryUserAccount, sessionId: string, input: unknown, authSession: InMemoryAuthSession) {
    const command = validate(commandSchema, input), session = visualSession(this.store, this.students, user, sessionId);
    const hash = turnDigest([sessionId, command.message, command.modelId, command.intent, command.questionId ?? null,
      command.contentFingerprint, command.stepId, command.sentenceCursor, command.presentationVersion, command.unitId]);
    const previous = this.store.find('classroomTurns', { ownerUserId: user.id, requestKey: command.requestKey });
    if (previous) {
      if (previous.sessionId !== sessionId || previous.inputHash !== hash) throw new ConflictException('请求标识已用于另一插问');
      return this.view(previous); // Before message quota, position checks and model resolution.
    }
    if (session.requests.some(request => request.key === command.requestKey)) throw new ConflictException('请求标识已用于其他课堂操作');
    if (session.messages.length >= 100) throw new BadRequestException('本节对话已达到上限，请开始新的微课');
    for (const turn of this.store.select('classroomTurns', { sessionId })) {
      const task = await this.store.tasks.get(turn.taskId);
      if (task && ['queued', 'running', 'retry_wait', 'cancel_requested'].includes(task.state)) throw new ConflictException('请先完成或取消当前插问');
    }
    const step = session.lesson.steps[session.cursor], presentation = sessionPresentation(session), unit = presentation.tracks[step.id].units[session.sentenceCursor ?? 0];
    if (session.contentFingerprint !== command.contentFingerprint || session.revealed <= session.cursor || step.id !== command.stepId ||
      command.sentenceCursor !== (session.sentenceCursor ?? 0) || presentation.version !== command.presentationVersion || unit?.id !== command.unitId)
      throw new ConflictException('讲解位置已变化，请读取当前课堂后重新发送');
    const question = command.questionId ? session.lesson.questions.find(question => question.id === command.questionId) : undefined;
    if (command.questionId && !question) throw new BadRequestException('课堂题目不存在');
    const authorization: ClassroomTurnRecord['authorization'] = { role: user.role };
    if (session.studentId && user.role === 'parent') {
      const binding = this.store.find('bindings', { studentId: session.studentId, parentUserId: user.id, status: 'active' });
      if (!binding) throw new ForbiddenException();
      authorization.bindingId = binding.id;
    }
    if (user.role === 'student') {
      const access = this.store.find('studentLearningAccess', { studentId: session.studentId, userId: user.id, status: 'enabled', version: authSession.accessVersion });
      const guardian = this.store.find('users', { id: authSession.guardianId, status: 'active' });
      if (!access || !guardian || !['parent', 'admin'].includes(guardian.role)) throw new ForbiddenException();
      Object.assign(authorization, { guardianId: guardian.id, accessId: access.id, accessVersion: access.version });
      if (guardian.role !== 'admin') {
        const binding = this.store.find('bindings', { studentId: session.studentId, parentUserId: guardian.id, status: 'active' });
        if (!binding) throw new ForbiddenException();
        authorization.bindingId = binding.id;
      }
    }
    const model = this.models.resolve(command.modelId), now = new Date().toISOString();
    // No answer keys, future nodes, unspoken current lines or hint text in model evidence.
    const teaching = session.lesson.steps.slice(0, session.cursor + 1).map((item, index) => ({ title: item.title,
      narration: presentation.tracks[item.id].units.slice(0, index === session.cursor ? command.sentenceCursor + 1 : undefined).map(unit => unit.text).join(' ') }));
    const turn: ClassroomTurnRecord = { id: this.store.nextId('classroom_turn'), sessionId, ownerUserId: user.id, studentId: session.studentId,
      requestKey: command.requestKey, inputHash: hash, message: command.message, intent: command.intent, modelId: model.id, modelName: model.label,
      ...(question ? { questionId: question.id } : {}), taskId: this.store.nextId('task'), lessonHash: turnDigest(session.lesson), authorization,
      position: { contentFingerprint: command.contentFingerprint, stepId: step.id, stepTitle: step.title, cursor: session.cursor,
        sentenceCursor: command.sentenceCursor, presentationVersion: command.presentationVersion, unitId: unit.id, sentenceText: unit.text },
      context: JSON.stringify({ title: session.lesson.title, objective: session.lesson.objective, teaching, intent: command.intent,
        ...(question ? { practiceQuestion: { id: question.id, prompt: question.prompt, options: question.options, table: question.table, diagram: question.diagram }, submitted: session.answers.some(answer => answer.questionId === question.id) } : {}) }),
      history: session.messages.slice(-10).map(({ role, content }) => ({ role, content })), status: 'queued', revision: 0, createdAt: now, updatedAt: now };
    if (question) { session.hintedQuestionIds = [...new Set([...(session.hintedQuestionIds ?? []), question.id])]; session.revision++; session.updatedAt = now; }
    this.store.append('classroomTurns', turn);
    await this.store.enqueueTask({ id: turn.taskId, kind: classroomTurnKind, ownerUserId: user.id, requestKey: 'classroom-turn:' + turn.id,
      payloadHash: hash, payload: { turnId: turn.id }, maxAttempts: 2, createdAt: now });
    return this.view(turn, { state: 'queued', generation: 1, version: 1, errorCode: null });
  }
  async control(user: InMemoryUserAccount, sessionId: string, id: string, action: 'cancel' | 'retry', input: unknown) {
    const command = validate(z.object({ generation: z.number().int().min(1), version: z.number().int().min(1) }).strict(), input);
    const turn = this.record(user, sessionId, id), task = await this.store.tasks.get(turn.taskId);
    if (!task || task.generation !== command.generation) throw new ConflictException('插问已更新，请读取最新状态');
    if (turn.status === 'completed' || action === 'cancel' && task.state === 'cancelled') return this.view(turn);
    if (action === 'retry') {
      if (task.version !== command.version || !['cancelled', 'failed'].includes(task.state)) throw new ConflictException('请读取失败或取消状态后重试');
      turnAuthority(this.store, this.students, turn);
      for (const other of this.store.select('classroomTurns', { sessionId })) {
        if (other.id === id) continue;
        const active = await this.store.tasks.get(other.taskId);
        if (active && ['queued', 'running', 'retry_wait', 'cancel_requested'].includes(active.state)) throw new ConflictException('当前已有另一插问');
      }
      turn.status = 'queued'; turn.revision++; turn.updatedAt = new Date().toISOString();
    } else if (!['queued', 'running', 'retry_wait', 'cancel_requested'].includes(task.state)) return this.view(turn);
    await this.store.controlTask({ id: task.id, action, expectedVersion: task.version, actorId: user.id });
    return this.view(turn, { state: action === 'retry' ? 'queued' : ['running', 'cancel_requested'].includes(task.state) ? 'cancel_requested' : 'cancelled',
      version: task.version + 1, generation: task.generation + (action === 'retry' ? 1 : 0), errorCode: null });
  }
}
