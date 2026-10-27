import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { isWhiteboardSpeed, WHITEBOARD_QUESTION_INTENTS, type WhiteboardQuestionBoardKind, type WhiteboardQuestionTurnView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { TopicWhiteboardService } from './topic-whiteboard.service';
import { topicWhiteboardDigest } from './topic-whiteboard-content';
import { buildWhiteboardQuestionContext } from './whiteboard-question-context';
import { readWhiteboardQuestionOriginal, whiteboardQuestionAuthority } from './whiteboard-question-access';
import { whiteboardQuestionTaskKind, type WhiteboardQuestionRecord } from './whiteboard-question-record';
import { buildQuestionWhiteboard, whiteboardAnswerFingerprint } from './whiteboard-question-teaching';

const key = z.string().trim().min(8).max(180), fingerprint = z.string().regex(/^[a-f0-9]{64}$/), unitId = z.string().min(1).max(2000);
const contextSchema = z.object({ fingerprint, unitId }).strict();
const commandSchema = contextSchema.extend({ requestKey: key, contextVersion: fingerprint, message: z.string().trim().min(1).max(3000),
  modelId: z.string().trim().min(1).max(180), intent: z.enum(WHITEBOARD_QUESTION_INTENTS),
  bookmark: z.object({ progress: z.number().finite().min(0).max(1), audioTime: z.number().finite().min(0).max(86400).nullable(),
    mode: z.enum(['text', 'cloud']), voice: z.string().max(180), speed: z.number().refine(isWhiteboardSpeed, '不支持的白板语速'),
    camera: z.object({ zoom: z.number().finite().min(.5).max(2), x: z.number().finite().min(-1000000).max(1000000),
      y: z.number().finite().min(-1000000).max(1000000), follow: z.boolean() }).strict().optional() }).strict()
    .default({ progress: 0, audioTime: null, mode: 'text', voice: '', speed: 1 }) }).strict();
const activeStates = ['queued', 'running', 'retry_wait', 'cancel_requested'];

@Injectable()
export class WhiteboardQuestionService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly topics: TopicWhiteboardService, private readonly models: XiaojiuModelsService) {}

  private original(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, id: string, session: InMemoryAuthSession) {
    try { return readWhiteboardQuestionOriginal(this.store, this.students, this.topics, user, kind, id, session); }
    catch (error) { if (error instanceof ForbiddenException || error instanceof NotFoundException) throw new NotFoundException('白板不存在或当前不可访问'); throw error; }
  }
  context(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, id: string, input: unknown, session: InMemoryAuthSession) {
    const command = validate(contextSchema, input), original = this.original(user, kind, id, session);
    return buildWhiteboardQuestionContext(original.board, kind, command.unitId, command.fingerprint).view;
  }
  private rows(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string) {
    return this.store.select('whiteboardQuestionTurns', { ownerUserId: user.id, boardKind: kind, boardId })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  private record(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, id: string, session: InMemoryAuthSession) {
    this.original(user, kind, boardId, session);
    const turn = this.store.find('whiteboardQuestionTurns', { id, ownerUserId: user.id, boardKind: kind, boardId });
    if (!turn) throw new NotFoundException('原插问不存在');
    return turn;
  }
  async view(turn: WhiteboardQuestionRecord, provisional?: WhiteboardQuestionTurnView['task']): Promise<WhiteboardQuestionTurnView> {
    const task = provisional ?? await this.store.tasks.get(turn.taskId), status = turn.status === 'completed' ? 'completed' :
      task?.state === 'failed' ? 'failed' : task?.state === 'cancelled' ? 'cancelled' : task?.state === 'cancel_requested' ? 'cancelling' : turn.status;
    const { id, boardKind, boardId, requestKey, message, intent, modelId, modelName, position, revision, createdAt, updatedAt, reply } = turn;
    return { id, boardKind, boardId, requestKey, message, intent, modelId, modelName, position: structuredClone(position), revision, createdAt, updatedAt,
      reply: reply ? { ...structuredClone(reply), fingerprint: whiteboardAnswerFingerprint(reply) } : null, status,
      task: task ? { state: task.state, generation: task.generation, version: task.version, errorCode: task.errorCode } : null };
  }
  async list(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, id: string, input: unknown, session: InMemoryAuthSession) {
    const query = validate(z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(30).default(10) }).strict(), input);
    this.original(user, kind, id, session); const rows = this.rows(user, kind, id), start = (query.page - 1) * query.pageSize;
    return { turns: await Promise.all(rows.slice(start, start + query.pageSize).map(row => this.view(row))), page: query.page, pageSize: query.pageSize, hasMore: start + query.pageSize < rows.length, total: rows.length };
  }
  async get(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, id: string, session: InMemoryAuthSession) {
    return this.view(this.record(user, kind, boardId, id, session));
  }
  async receipt(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, requestKey: string, session: InMemoryAuthSession) {
    requestKey = validate(key, requestKey); this.original(user, kind, boardId, session);
    const turn = this.store.find('whiteboardQuestionTurns', { ownerUserId: user.id, boardKind: kind, boardId, requestKey });
    if (!turn) throw new NotFoundException('尚未找到这条原插问请求'); return this.view(turn);
  }
  answerContext(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, id: string, session: InMemoryAuthSession) {
    const original = this.original(user, kind, boardId, session);
    const turn = this.store.find('whiteboardQuestionTurns', { id, ownerUserId: user.id, boardKind: kind, boardId });
    if (!turn) throw new NotFoundException('原补充讲解不存在');
    if (turn.definitionHash !== original.definitionHash) throw new ConflictException('原稿版本已变化，这条回答保留为历史文字，请基于当前原稿重新提问');
    return { board: buildQuestionWhiteboard(turn, original.board), definitionHash: original.definitionHash, authorityHash: original.authorityHash };
  }
  board(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, id: string, session: InMemoryAuthSession) {
    return this.answerContext(user, kind, boardId, id, session).board;
  }
  async notes(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, session: InMemoryAuthSession) {
    const original = this.original(user, kind, boardId, session), rows = this.rows(user, kind, boardId);
    const turns = await Promise.all(rows.map(async row => ({ ...await this.view(row), originalStatus: row.definitionHash === original.definitionHash ? 'current' as const : 'archived' as const })));
    return { format: 'studyagent-whiteboard-notes-v1' as const, exportedAt: new Date().toISOString(), ownerId: user.id,
      boardKind: kind, boardId, definitionHash: original.definitionHash, original: structuredClone(original.board), turns,
      notices: ['原讲解与AI补充分别保留。AI补充未经教师审核，不构成首答、评分或掌握证据。', '包含当前原件下全部已保存提问；未发送输入请另存完整提问副本。'] };
  }
  notesIdentity(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, session: InMemoryAuthSession) {
    const original = this.original(user, kind, boardId, session);
    return { ownerId: user.id, boardKind: kind, boardId, fingerprint: original.board.fingerprint, definitionHash: original.definitionHash };
  }
  private async assertNoActive(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, except?: string) {
    for (const row of this.rows(user, kind, boardId)) {
      if (row.id === except) continue;
      const task = await this.store.tasks.get(row.taskId);
      if (task && activeStates.includes(task.state)) throw new ConflictException('请先完成或取消当前白板插问');
    }
  }
  async create(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, input: unknown, session: InMemoryAuthSession) {
    const command = validate(commandSchema, input), original = this.original(user, kind, boardId, session);
    const inputHash = topicWhiteboardDigest({ boardKind: kind, boardId, ...command, requestKey: undefined });
    const previous = this.store.find('whiteboardQuestionTurns', { ownerUserId: user.id, requestKey: command.requestKey });
    if (previous) {
      if (previous.boardKind !== kind || previous.boardId !== boardId || previous.inputHash !== inputHash) throw new ConflictException('原请求键已用于不同的白板插问');
      return this.view(previous);
    }
    const prepared = buildWhiteboardQuestionContext(original.board, kind, command.unitId, command.fingerprint);
    if (prepared.contextVersion !== command.contextVersion) throw new ConflictException('原稿上下文已变化，请核对当前原句再发送');
    const rows = this.rows(user, kind, boardId);
    if (rows.length >= 200) throw new BadRequestException('这份白板已保留200条插问，请在历史中继续回顾或换一份白板');
    await this.assertNoActive(user, kind, boardId);
    const model = this.models.resolve(command.modelId), history: WhiteboardQuestionRecord['history'] = []; let characters = 0;
    for (const row of rows.filter(row => row.status === 'completed' && row.reply && row.definitionHash === original.definitionHash &&
      row.position.fingerprint === command.fingerprint).slice(-5).reverse()) {
      const notes = row.reply!.board, answer = row.reply!.text + (notes ? '\n[已发布的AI补充板书，非测量证据]\n' + JSON.stringify({
        title: notes.title, points: notes.points, table: notes.table ?? null, formulas: notes.formulas ?? [], diagram: notes.diagram ?? null,
      }) : '');
      const size = row.message.length + answer.length; if (characters + size > 12000) break;
      characters += size; history.unshift({ role: 'user', content: row.message }, { role: 'assistant', content: answer });
    }
    const now = new Date().toISOString(), turn: WhiteboardQuestionRecord = {
      id: this.store.nextId('whiteboard_question'), boardKind: kind, boardId, ownerUserId: user.id, studentId: original.board.studentId,
      requestKey: command.requestKey, inputHash, message: command.message, intent: command.intent, modelId: model.id, modelName: model.label,
      taskId: this.store.nextId('task'), definitionHash: original.definitionHash,
      authorization: { role: user.role, sessionTokenHash: session.tokenHash, authorityHash: original.authorityHash },
      prepared: { contextJson: prepared.contextJson, contentHash: prepared.contentHash, view: prepared.view },
      position: { ...prepared.view.position, bookmark: structuredClone(command.bookmark) }, history, reply: null,
      status: 'queued', revision: 0, createdAt: now, updatedAt: now,
      commands: [{ key: command.requestKey, kind: 'create', hash: inputHash, generation: 1, at: now }],
    };
    this.store.append('whiteboardQuestionTurns', turn);
    await this.store.enqueueTask({ id: turn.taskId, kind: whiteboardQuestionTaskKind, ownerUserId: user.id,
      requestKey: 'whiteboard-question:' + turn.id, payloadHash: inputHash, payload: { turnId: turn.id }, maxAttempts: 2, createdAt: now });
    return this.view(turn, { state: 'queued', generation: 1, version: 1, errorCode: null });
  }
  async control(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, id: string, action: 'cancel' | 'retry', input: unknown, session: InMemoryAuthSession) {
    const command = validate(z.object({ requestKey: key, generation: z.number().int().min(1), version: z.number().int().min(1) }).strict(), input);
    const turn = this.record(user, kind, boardId, id, session), hash = topicWhiteboardDigest({ id, action, generation: command.generation, version: command.version });
    const previous = turn.commands.find(row => row.key === command.requestKey);
    if (previous) { if (previous.kind !== action || previous.hash !== hash) throw new ConflictException('原控制键已用于不同操作'); return this.view(turn); }
    if (turn.commands.length >= 100) throw new BadRequestException('原插问控制记录已达到上限，请保留历史并重新提问');
    const task = await this.store.tasks.get(turn.taskId);
    if (!task || task.generation !== command.generation) throw new ConflictException('原插问已更新，请读取最新状态');
    const remember = () => { turn.commands.push({ key: command.requestKey, kind: action, hash, generation: command.generation, at: new Date().toISOString() }); turn.revision++; turn.updatedAt = new Date().toISOString(); };
    if (turn.status === 'completed' || action === 'cancel' && !activeStates.includes(task.state)) { remember(); return this.view(turn); }
    if (task.version !== command.version) throw new ConflictException('原任务状态已变化，请先读取');
    if (action === 'retry') {
      if (!['failed', 'cancelled'].includes(task.state)) throw new ConflictException('请读取失败或取消状态后重试');
      whiteboardQuestionAuthority(this.store, this.students, this.topics, turn); this.models.resolve(turn.modelId);
      await this.assertNoActive(user, kind, boardId, id); turn.status = 'queued';
    }
    await this.store.controlTask({ id: task.id, action, expectedVersion: task.version, actorId: user.id }); remember();
    return this.view(turn, { state: action === 'retry' ? 'queued' : ['running', 'cancel_requested'].includes(task.state) ? 'cancel_requested' : 'cancelled',
      generation: task.generation + (action === 'retry' ? 1 : 0), version: task.version + 1, errorCode: null });
  }
}
