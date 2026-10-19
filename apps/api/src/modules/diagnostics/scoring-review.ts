import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { QuestionAnswerSchema, ScoringRevision, scoringReviewInputSchema } from '@study-agent/contracts';
import { validate } from '../../common/validation';

const rubricSchema = z.array(z.object({ criterion: z.string().min(1).max(2000), weight: z.number().positive().max(1) })).min(1).max(100);
export function frozenRubric(schema: QuestionAnswerSchema) {
  const raw = (schema.gradingConfig as Record<string, unknown> | undefined)?.rubric;
  if (raw === undefined) return null;
  const parsed = rubricSchema.safeParse(raw);
  if (!parsed.success || Math.abs(parsed.data.reduce((total, c) => total + c.weight, 0) - 1) > 0.000001) {
    throw new BadRequestException('冻结题目的量规无效，请先提交内容异常反馈，不可改用总分绕过量规');
  }
  return parsed.data;
}

export function prepareScoringReview(input: unknown, schema: QuestionAnswerSchema, previous: ScoringRevision[]) {
  const command = validate(scoringReviewInputSchema, input);
  const canonical = { ...command, ratings: command.ratings?.slice().sort((a, b) => a.criterionIndex - b.criterionIndex) };
  const requestHash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  const priorRequest = previous.find((item) => item.requestKey === command.requestKey);
  if (priorRequest) {
    if (priorRequest.requestHash !== requestHash) throw new ConflictException('此请求标识已用于另一份复核内容');
    return { existing: priorRequest };
  }
  const version = Math.max(0, ...previous.map((item) => item.version));
  if (command.expectedVersion !== version) throw new ConflictException('复核结果已被更新，请重新打开后核对最新版本');
  const rubric = frozenRubric(schema);
  let score: number;
  if (rubric) {
    if (command.score !== undefined || !command.ratings || command.ratings.length !== rubric.length ||
      new Set(command.ratings.map((r) => r.criterionIndex)).size !== rubric.length ||
      command.ratings.some((r) => r.criterionIndex >= rubric.length)) {
      throw new BadRequestException('请逐项记录全部量规的表现与依据，总分由服务端按权重计算');
    }
    score = Math.round(command.ratings.reduce((sum, r) => sum + r.score * rubric[r.criterionIndex].weight, 0) * 1e6) / 1e6;
  } else {
    if (command.score === undefined || command.ratings !== undefined) throw new BadRequestException('此历史题目没有分项量规，请提供复核得分和具体依据');
    score = command.score;
  }
  return { data: { score, reason: command.reason, ratings: canonical.ratings, rubricSnapshot: rubric ?? undefined,
    requestKey: command.requestKey, requestHash, version: version + 1 } };
}
