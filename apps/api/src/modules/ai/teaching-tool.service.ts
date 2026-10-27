import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import type { TeachingToolPreflight, TeachingToolRunView, TeachingToolRunsPage } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { XiaojiuModelsService } from './xiaojiu-models.service';
import { XiaojiuChatService } from './xiaojiu-chat.service';
import { assertTeachingAnswerJson, prepareTeachingSnapshot } from './teaching-tool-protocol';
import { teachingToolDigest, teachingToolKinds, type TeachingToolRunRecord } from './teaching-tool-record';

const key = z.string().trim().min(8).max(180);
const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('temporary'), title: z.string().min(1).max(180), question: z.unknown() }).strict(),
  z.object({ kind: z.literal('question_bank'), questionId: z.string().min(1).max(180) }).strict(),
]);
const common = { source, modelId: z.string().trim().min(1).max(180).default('auto') };
export const teachingToolDraftSchema = z.discriminatedUnion('purpose', [
  z.object({ ...common, purpose: z.literal('assessment_analysis'), answer: z.unknown() }).strict(),
  z.object({ ...common, purpose: z.literal('hint_draft'), hintLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(),
]);
const creation = z.object({ requestKey: key, fingerprint: z.string().regex(/^[a-f0-9]{64}$/), draft: teachingToolDraftSchema }).strict();
const active = new Set(['queued', 'running', 'retry_wait', 'cancel_requested']);
function hasMedia(value: unknown, depth = 0, budget = { count: 0 }): boolean {
  if (++budget.count > 400 || depth > 8) throw new BadRequestException('完整题目结构超过教研读取预算，请明确选择范围');
  if (Array.isArray(value)) return value.some(item => hasMedia(item, depth + 1, budget));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if ([record.type, record.kind, record.mediaType, record.contentType].some(type => typeof type === 'string' && /^(image|audio|video)(?:\/|$)/i.test(type))) return true;
  return Object.values(record).some(item => hasMedia(item, depth + 1, budget));
}

@Injectable()
export class TeachingToolService {
  constructor(private readonly store: InMemoryStoreService, private readonly models: XiaojiuModelsService, private readonly provider: XiaojiuChatService) {}
  private async commandTransaction<T>(operation: () => T | Promise<T>): Promise<T> {
    // One fresh snapshot lets a concurrent winner's original receipt be read.
    // No supplier calls occur inside these command transactions.
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await this.store.transaction(operation); }
      catch (error) { if (!(error instanceof ConflictException) || attempt === 1) throw error; }
    }
    throw new ConflictException('请重新读取原教研请求');
  }
  assertAdmin(user: InMemoryUserAccount) {
    if (user.role !== 'admin' || !this.store.find('users', { id: user.id, role: 'admin', status: 'active' })) throw new ForbiddenException('该工作区仅供当前有效教研管理员使用');
  }
  private session(user: InMemoryUserAccount, sessionId: string) {
    const session = this.store.find('sessions', { id: sessionId, userId: user.id });
    if (!session || session.revokedAt || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) throw new ForbiddenException('原教研授权会话已不可用');
  }
  private bankQuestion(id: string) {
    const question = this.store.find('questions', { id });
    if (!question || !['draft', 'published'].includes(String(question.status))) throw new NotFoundException('原题目当前不可用于教研读取');
    return question;
  }
  authority(row: TeachingToolRunRecord) {
    const user = this.store.find('users', { id: row.ownerUserId, role: 'admin', status: 'active' });
    if (!user) throw new ForbiddenException('原教研权限已变化');
    this.session(user, row.authorizationSessionId);
    if (row.snapshot.source.kind === 'question_bank') this.bankQuestion(row.snapshot.source.questionId);
  }
  assertFrozen(row: TeachingToolRunRecord) {
    const prepared = prepareTeachingSnapshot(row.snapshot), fingerprint = teachingToolDigest({ protocol: 'teaching-tool-v1', snapshot: prepared.snapshot,
      requestedModelId: row.requestedModelId, modelId: row.modelId });
    if (prepared.context !== row.context || teachingToolDigest([fingerprint, row.ownerUserId]) !== row.inputHash) throw new ConflictException('原教研输入指纹不一致');
  }
  private prepared(user: InMemoryUserAccount, input: unknown) {
    this.assertAdmin(user);
    const draft = validate(teachingToolDraftSchema, input);
    if (draft.purpose === 'assessment_analysis' && !Object.hasOwn(draft, 'answer')) throw new BadRequestException('请明确填写待核对答案，未知可以填写null');
    let question: unknown, origin: unknown;
    if (draft.source.kind === 'temporary') { question = draft.source.question; origin = { kind: 'temporary', title: draft.source.title }; }
    else {
      const original = this.bankQuestion(draft.source.questionId), document = this.store.find('questionDocuments', { questionId: original.id }), schema = this.store.find('questionAnswerSchemas', { questionId: original.id });
      question = { subject: original.subject, stem: original.stem, referenceAnswer: original.answer, referenceAnalysis: original.analysis ?? '',
        ...(document ? { originalDocument: structuredClone(document) } : {}), ...(schema ? { originalAnswerSchema: structuredClone(schema) } : {}),
        ...(hasMedia(document) || original.type === 'oral' ? { mediaNotice: '本次文字分析不读取题目中的图片、音频或视频内容；保留原引用供人工核对，不能据此作完整判定。' } : {}) };
      origin = { kind: 'question_bank', questionId: original.id, fingerprint: teachingToolDigest({ original, document: document ?? null, answerSchema: schema ?? null }) };
    }
    let prepared: ReturnType<typeof prepareTeachingSnapshot>;
    try { prepared = prepareTeachingSnapshot({ purpose: draft.purpose, source: origin, question,
      ...(draft.purpose === 'assessment_analysis' ? { answer: draft.answer } : { hintLevel: draft.hintLevel }) }); }
    catch { throw new BadRequestException('完整教研输入不可用：请核对题干、答案及结构；总量最多18000字符，作答JSON最多8000字符/8层，原文不会被截断。'); }
    if (hasMedia(prepared.snapshot.question.originalDocument) && !prepared.snapshot.question.mediaNotice) {
      prepared = prepareTeachingSnapshot({ ...prepared.snapshot, question: { ...prepared.snapshot.question,
        mediaNotice: '本次文字分析不读取题目媒体内容，原引用保留供人工核对，结果必须保留未知。' } });
    }
    const model = this.models.resolve(draft.modelId);
    const fingerprint = teachingToolDigest({ protocol: 'teaching-tool-v1', snapshot: prepared.snapshot, requestedModelId: draft.modelId, modelId: model.id });
    const view: TeachingToolPreflight = { fingerprint, requestedModelId: draft.modelId, modelId: model.id, modelName: model.label,
      snapshot: prepared.snapshot, contextCharacters: prepared.context.length, advisoryOnly: true, reviewRequired: true };
    return { view, context: prepared.context };
  }
  preflight(user: InMemoryUserAccount, input: unknown) { return this.prepared(user, input).view; }
  private owned(user: InMemoryUserAccount, id: string) {
    this.assertAdmin(user); const row = this.store.find('teachingToolRuns', { id, ownerUserId: user.id });
    if (!row) throw new NotFoundException('教研记录不存在'); return row;
  }
  async view(row: TeachingToolRunRecord, provisional?: TeachingToolRunView['task']): Promise<TeachingToolRunView> {
    const task = provisional ?? await this.store.tasks.get(row.taskId);
    if (row.status === 'completed' && (!row.result || task?.state !== 'succeeded')) throw new ConflictException('教研结果与任务状态暂不可核对，请重新读取原记录');
    const status = row.status === 'completed' && row.result ? 'completed' : task?.state === 'failed' ? 'failed'
      : task?.state === 'cancelled' ? 'cancelled' : task?.state === 'cancel_requested' ? 'cancelling' : row.status;
    return { id: row.id, requestKey: row.requestKey, purpose: row.purpose, requestedModelId: row.requestedModelId, modelId: row.modelId, modelName: row.modelName,
      snapshot: structuredClone(row.snapshot), revision: row.revision, status, result: row.result ? structuredClone(row.result) : null,
      createdAt: row.createdAt, updatedAt: row.updatedAt, advisoryOnly: true, reviewRequired: true,
      task: task ? { state: task.state, generation: task.generation, version: task.version, errorCode: task.errorCode } : null };
  }
  async get(user: InMemoryUserAccount, id: string) { return this.view(this.owned(user, id)); }
  async request(user: InMemoryUserAccount, requestKey: string) {
    this.assertAdmin(user); const row = this.store.find('teachingToolRuns', { ownerUserId: user.id, requestKey: validate(key, requestKey) });
    if (!row) throw new NotFoundException('原教研请求尚未找到'); return this.view(row);
  }
  async list(user: InMemoryUserAccount, input: unknown = {}): Promise<TeachingToolRunsPage> {
    this.assertAdmin(user);
    const c = validate(z.object({ purpose: z.enum(['assessment_analysis', 'hint_draft']).optional(), page: z.coerce.number().int().min(1).max(200).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20), from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }).strict(), input);
    const from = c.from ? Date.parse(c.from) : null, to = c.to ? Date.parse(c.to) : null;
    if (from !== null && to !== null && from > to) throw new BadRequestException('教研记录日期范围不可用');
    const rows = this.store.select('teachingToolRuns', { ownerUserId: user.id, ...(c.purpose ? { purpose: c.purpose } : {}) })
      .filter(row => (from === null || Date.parse(row.createdAt) >= from) && (to === null || Date.parse(row.createdAt) <= to))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
    if (rows.length > 10000) throw new BadRequestException('请按原请求或日期范围读取教研记录');
    return { runs: await Promise.all(rows.slice((c.page - 1) * c.pageSize, c.page * c.pageSize).map(row => this.view(row))), page: c.page, pageSize: c.pageSize, hasMore: rows.length > c.page * c.pageSize };
  }
  async create(user: InMemoryUserAccount, auth: InMemoryAuthSession, input: unknown) {
    const c = validate(creation, input);
    // JSON permits an exponent that the JS parser turns into Infinity. Reject it
    // before JSON.stringify can collapse it to the hash of an explicit null.
    // This pure validation deliberately does not read the catalog or bank source.
    try {
      const draft = c.draft;
      if (draft.purpose === 'assessment_analysis') {
        if (!Object.hasOwn(draft, 'answer')) throw Error('Missing explicit answer');
        assertTeachingAnswerJson(draft.answer);
      }
      if (draft.source.kind === 'temporary') prepareTeachingSnapshot({ purpose: draft.purpose,
        source: { kind: 'temporary', title: draft.source.title }, question: draft.source.question,
        ...(draft.purpose === 'assessment_analysis' ? { answer: draft.answer } : { hintLevel: draft.hintLevel }) });
    } catch { throw new BadRequestException('完整教研输入必须是有限且未超限的JSON；未知请明确填写null，原文不会被截断。'); }
    const commandHash = teachingToolDigest(['create-teaching-tool-v1', c]);
    return this.commandTransaction(async () => {
      this.assertAdmin(user); this.session(user, auth.id);
      const previous = this.store.find('teachingToolRuns', { ownerUserId: user.id, requestKey: c.requestKey });
      if (previous) { if (previous.commandHash !== commandHash) throw new ConflictException('请求键已用于另一份题目、输入或模型'); return this.view(previous); }
      const prepared = this.prepared(user, c.draft), preview = prepared.view;
      if (preview.fingerprint !== c.fingerprint) throw new ConflictException('原题目或模型默认已变化，请核对完整预检后重新请求');
      if (!this.provider.enabled) throw new ServiceUnavailableException('小九AI教研生成当前未启用，原输入与历史仍可保留');
      const now = new Date().toISOString(), id = this.store.nextId('teaching_tool'), inputHash = teachingToolDigest([preview.fingerprint, user.id]);
      const row: TeachingToolRunRecord = { id, requestKey: c.requestKey, ownerUserId: user.id, authorizationSessionId: auth.id, purpose: preview.snapshot.purpose,
        requestedModelId: preview.requestedModelId, modelId: preview.modelId, modelName: preview.modelName, snapshot: preview.snapshot, context: prepared.context,
        taskId: this.store.nextId('task'), commandHash, inputHash, status: 'queued', result: null, revision: 1, createdAt: now, updatedAt: now, commands: [], advisoryOnly: true, reviewRequired: true };
      this.store.append('teachingToolRuns', row);
      await this.store.enqueueTask({ id: row.taskId, kind: row.purpose === 'assessment_analysis' ? teachingToolKinds[0] : teachingToolKinds[1], ownerUserId: user.id,
        requestKey: 'teaching-tool:' + id, payloadHash: inputHash, payload: { runId: id }, maxAttempts: 1, createdAt: now });
      return this.view(row, { state: 'queued', generation: 1, version: 1, errorCode: null });
    });
  }
  async control(user: InMemoryUserAccount, auth: InMemoryAuthSession, id: string, action: 'cancel' | 'retry', input: unknown) {
    const c = validate(z.object({ requestKey: key, generation: z.number().int().positive(), version: z.number().int().positive() }).strict(), input);
    return this.commandTransaction(async () => {
      const row = this.owned(user, id); this.session(user, auth.id);
      if (row.requestKey === c.requestKey) throw new ConflictException('控制操作需要独立请求键');
      const hash = teachingToolDigest([id, action, c]), previous = row.commands.find(command => command.requestKey === c.requestKey);
      if (previous) { if (previous.hash !== hash) throw new ConflictException('控制请求键已用于其他操作'); return this.view(row); }
      const task = await this.store.tasks.get(row.taskId);
      if (!task || task.generation !== c.generation || task.version !== c.version) throw new ConflictException('原任务状态已变化，请重新读取');
      const remember = () => { row.commands.push({ requestKey: c.requestKey, action, hash }); row.revision++; row.updatedAt = new Date().toISOString(); };
      if (row.status === 'completed') { if (action === 'retry') throw new ConflictException('已完成建议保持原文，请明确新建另一份建议'); remember(); return this.view(row); }
      if (action === 'retry') {
        if (!['failed', 'cancelled'].includes(task.state)) throw new ConflictException('请等待原任务失败或取消终态后重试');
        row.authorizationSessionId = auth.id; this.authority(row); row.status = 'queued'; row.result = null;
      } else if (!active.has(task.state)) { remember(); return this.view(row); }
      await this.store.controlTask({ id: task.id, action, expectedVersion: task.version, actorId: user.id });
      remember();
      return this.view(row, { state: action === 'retry' ? 'queued' : ['running', 'cancel_requested'].includes(task.state) ? 'cancel_requested' : 'cancelled',
        generation: task.generation + (action === 'retry' ? 1 : 0), version: task.version + 1, errorCode: null });
    });
  }
}
