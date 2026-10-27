import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Private protocol foundation. It grants no question access and never writes assessment evidence. */
const completeText = (max: number) => z.string().max(max).refine(value => value.trim().length > 0, '请保留完整非空文字');
const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('temporary'), title: completeText(180) }).strict(),
  z.object({ kind: z.literal('question_bank'), questionId: completeText(180), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
const questionSchema = z.object({ subject: completeText(100), stem: completeText(6000), referenceAnswer: z.unknown(), referenceAnalysis: z.string().max(6000) }).strict();
const common = { source: sourceSchema, question: questionSchema };
const snapshotSchema = z.discriminatedUnion('purpose', [
  z.object({ ...common, purpose: z.literal('assessment_analysis'), answer: z.unknown() }).strict(),
  z.object({ ...common, purpose: z.literal('hint_draft'), hintLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(),
]);
export type TeachingToolSnapshot = z.infer<typeof snapshotSchema>;
export type TeachingEvidenceKey = 'question' | 'reference_answer' | 'reference_analysis' | 'submitted_answer';
const evidenceKeySchema = z.enum(['question', 'reference_answer', 'reference_analysis', 'submitted_answer']);
const observationSchema = z.object({ source: evidenceKeySchema, quote: completeText(1000), observation: completeText(1500) }).strict();
export const teachingAnalysisSchema = z.object({ summary: completeText(2000),
  judgement: z.enum(['correct', 'incorrect', 'uncertain']), observations: z.array(observationSchema).min(1).max(8),
  uncertainties: z.array(completeText(1000)).max(8), verificationSteps: z.array(completeText(1000)).min(1).max(5),
  confidenceLevel: z.enum(['low', 'medium', 'high']), reviewRequired: z.literal(true), advisoryOnly: z.literal(true),
}).strict();
export const teachingHintSchema = z.object({ hint: completeText(2000), focus: completeText(1000),
  suggestedLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]), reviewAdvice: completeText(1000),
  reviewRequired: z.literal(true), advisoryOnly: z.literal(true),
}).strict();
export const teachingAnalysisJsonSchema = z.toJSONSchema(teachingAnalysisSchema);
export const teachingHintJsonSchema = z.toJSONSchema(teachingHintSchema);
export type TeachingAnalysisSuggestion = z.infer<typeof teachingAnalysisSchema>;
export type TeachingHintSuggestion = z.infer<typeof teachingHintSchema>;

function canonical(value: unknown, depth = 0, budget = { members: 0 }): unknown {
  if (++budget.members > 400 || depth > 8) throw Error('完整作答结构超过读取预算');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 100) throw Error('完整作答数组超过读取预算');
    return value.map(item => canonical(item, depth + 1, budget));
  }
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (!key || key.length > 180 || ['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('作答属性不可用');
      result[key] = canonical((value as Record<string, unknown>)[key], depth + 1, budget);
    }
    return result;
  }
  throw Error('作答必须是完整、有限的JSON值');
}
function answerText(value: unknown) {
  const result = canonical(value), text = typeof result === 'string' ? result : JSON.stringify(result);
  if (text.length > 8000) throw Error('完整作答超过8000字符，请明确缩小范围；原文不会被截断');
  return text;
}
export function prepareTeachingSnapshot(input: unknown): { snapshot: TeachingToolSnapshot; context: string; fingerprint: string } {
  const parsed = snapshotSchema.parse(input);
  if (!Object.hasOwn(parsed.question, 'referenceAnswer') || parsed.purpose === 'assessment_analysis' && !Object.hasOwn(parsed, 'answer'))
    throw Error('请明确提供参考答案与本次待核对作答；未知可以明确填写null');
  answerText(parsed.question.referenceAnswer);
  if (parsed.purpose === 'assessment_analysis') answerText(parsed.answer);
  const context = JSON.stringify(canonical(parsed));
  if (context.length > 18000) throw Error('完整教研输入超过18000字符，请明确缩小范围；原文不会被截断');
  return { snapshot: structuredClone(parsed), context, fingerprint: createHash('sha256').update(context).digest('hex') };
}
export function teachingEvidence(snapshot: TeachingToolSnapshot): Partial<Record<TeachingEvidenceKey, string>> {
  const { snapshot: input } = prepareTeachingSnapshot(snapshot);
  return { question: input.question.stem, reference_answer: answerText(input.question.referenceAnswer), reference_analysis: input.question.referenceAnalysis,
    ...(input.purpose === 'assessment_analysis' ? { submitted_answer: answerText(input.answer) } : {}) };
}
export function validateTeachingAnalysis(value: unknown, snapshot: TeachingToolSnapshot): TeachingAnalysisSuggestion {
  if (snapshot.purpose !== 'assessment_analysis') throw Error('这份结果不属于答案分析用途');
  const result = teachingAnalysisSchema.parse(value), evidence = teachingEvidence(snapshot);
  for (const row of result.observations) if (!evidence[row.source]?.includes(row.quote)) throw Error('教研观察只能引用本次完整输入中的原文');
  if (result.judgement === 'uncertain' && (!result.uncertainties.length || result.confidenceLevel === 'high')) throw Error('不确定判断必须保留未知与待验证条件');
  if (/(根因已确定|已证明根因|已经确诊|智力低下|孩子就是懒惰)/u.test(JSON.stringify(result))) throw Error('教研建议不能确诊或确定人格、智力及深层根因');
  return result;
}
export function validateTeachingHint(value: unknown, snapshot: TeachingToolSnapshot): TeachingHintSuggestion {
  if (snapshot.purpose !== 'hint_draft') throw Error('这份结果不属于提示草稿用途');
  prepareTeachingSnapshot(snapshot);
  const result = teachingHintSchema.parse(value);
  if (result.suggestedLevel !== snapshot.hintLevel) throw Error('提示草稿必须保持明确选择的帮助层级');
  return result;
}
/** A literal-overlap warning for an admin draft, never a guarantee that a hint is safe for a learner. */
export function teachingHintWarnings(snapshot: TeachingToolSnapshot, result: TeachingHintSuggestion): Array<'possible_answer_disclosure'> {
  validateTeachingHint(result, snapshot);
  const answer = answerText(snapshot.question.referenceAnswer).trim(), text = result.hint;
  if (!answer || answer === 'null') return [];
  if (answer.length >= 2 && text.includes(answer)) return ['possible_answer_disclosure'];
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?:答案|结果|选择|answer|equals)[^。\\n]{0,12}' + escaped, 'iu').test(text) ? ['possible_answer_disclosure'] : [];
}
