import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TeachingToolDraft, TeachingToolPurpose, TeachingToolRunView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { TeachingToolService } from './teaching-tool.service';
import { prepareTeachingSnapshot } from './teaching-tool-protocol';
import { teachingToolDigest } from './teaching-tool-record';

const question = z.object({ id: z.string().trim().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
  stem: z.string().min(1).max(6000), answer: z.unknown(), analysis: z.string().max(6000).default(''), type: z.string().max(100).optional() });
const common = { question, modelId: z.string().trim().min(1).max(180).default('auto'), requestKey: z.string().trim().min(8).max(180).optional() };
const analysis = z.object({ ...common, answer: z.unknown() }).strict();
const hint = z.object({ ...common, answerHistoryCount: z.number().int().min(0).max(10000).default(0), hintLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }).strict();

/** A wire adapter only. Generation always runs through the durable teaching worker. */
@Injectable()
export class TeachingToolCompatibilityService {
  constructor(private readonly store: InMemoryStoreService, private readonly tools: TeachingToolService) {}
  async submit(user: InMemoryUserAccount, session: InMemoryAuthSession, purpose: TeachingToolPurpose, input: unknown) {
    this.tools.assertAdmin(user);
    const c = purpose === 'assessment_analysis' ? validate(analysis, input) : validate(hint, input);
    const title = '旧接口输入的临时题', temporaryQuestion = { subject: c.question.subject, stem: c.question.stem,
      referenceAnswer: c.question.answer, referenceAnalysis: c.question.analysis,
      ...(c.question.type === 'oral' ? { mediaNotice: '本次文字教研不读取音频，请人工核对原音频内容。' } : {}) };
    const usage = purpose === 'assessment_analysis' ? { purpose, answer: (c as z.infer<typeof analysis>).answer }
      : { purpose, hintLevel: (c as z.infer<typeof hint>).hintLevel ?? ((c as z.infer<typeof hint>).answerHistoryCount > 1 ? 2 as const : 1 as const) };
    try {
      if (!Object.hasOwn(c.question, 'answer') || purpose === 'assessment_analysis' && !Object.hasOwn(c, 'answer')) throw Error('Explicit answers required');
      prepareTeachingSnapshot({ ...usage, source: { kind: 'temporary', title }, question: temporaryQuestion });
    } catch { throw new BadRequestException('请保留完整有限JSON题干、参考答案与作答；未知请明确填写null，原文不会被截断。'); }
    const requestKey = c.requestKey ?? randomUUID();
    let previous: TeachingToolRunView | null = null;
    if (c.requestKey) {
      try { previous = await this.tools.request(user, requestKey); }
      catch (error) { if (!(error instanceof NotFoundException)) throw error; }
    }
    const bank = previous ? previous.snapshot.source.kind === 'question_bank' : Boolean(this.store.find('questions', { id: c.question.id }));
    const draft = { ...usage, modelId: c.modelId, source: bank ? { kind: 'question_bank', questionId: c.question.id }
      : { kind: 'temporary', title, question: temporaryQuestion } } as TeachingToolDraft;
    if (previous) {
      const original = { ...('answer' in previous.snapshot ? { purpose: previous.purpose, answer: previous.snapshot.answer }
        : { purpose: previous.purpose, hintLevel: previous.snapshot.hintLevel }), modelId: previous.requestedModelId,
        source: previous.snapshot.source.kind === 'question_bank' ? { kind: 'question_bank', questionId: previous.snapshot.source.questionId }
          : { kind: 'temporary', title: previous.snapshot.source.title, question: previous.snapshot.question } };
      if (teachingToolDigest(draft) !== teachingToolDigest(original)) throw new ConflictException('原请求已用于另一题目、输入、用途或模型');
      return this.project(previous);
    }
    const preflight = this.tools.preflight(user, draft);
    return this.project(await this.tools.create(user, session, { requestKey, fingerprint: preflight.fingerprint, draft }));
  }
  private project(run: TeachingToolRunView) {
    const pending = ['queued', 'running', 'validating', 'cancelling'].includes(run.status);
    const metadata = { runId: run.id, requestKey: run.requestKey, runPath: '/api/ai/teaching-tools/runs/' + encodeURIComponent(run.id),
      status: run.status, modelId: run.modelId, modelName: run.modelName, source: 'xiaojiu' as const,
      reviewRequired: true as const, advisoryOnly: true as const, errorCode: run.task?.errorCode ?? null };
    if (run.purpose === 'assessment_analysis') {
      const result = run.result?.purpose === 'assessment_analysis' ? run.result.analysis : null;
      return { httpStatus: pending ? 202 : result ? 201 : 200, data: { ...metadata, summary: result?.summary ?? null,
        structuredResult: result ? { judgement: result.judgement, correct: result.judgement === 'uncertain' ? null : result.judgement === 'correct',
          observations: result.observations, uncertainties: result.uncertainties, verificationSteps: result.verificationSteps } : null,
        confidenceLevel: result?.confidenceLevel ?? null } };
    }
    const result = run.result?.purpose === 'hint_draft' ? run.result : null;
    return { httpStatus: pending ? 202 : result ? 201 : 200, data: { ...metadata, hint: result?.hint.hint ?? null,
      focus: result?.hint.focus ?? null, suggestedLevel: result?.hint.suggestedLevel ?? null, reviewAdvice: result?.hint.reviewAdvice ?? null,
      warnings: result?.warnings ?? [] } };
  }
}
