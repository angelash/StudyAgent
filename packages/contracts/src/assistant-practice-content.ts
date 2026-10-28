import { z } from 'zod';
import { assistantWhiteboardSourceMapSchema } from './assistant-whiteboard';
import { assistantPracticePreflightSchema } from './assistant-practice';
import { knowledgeAtomSchema, learningScopeInputSchema } from './diagnostics';

export const ASSISTANT_PRACTICE_CONTENT_PROTOCOL = 'assistant-teaching-practice-content-v1' as const;
export const ASSISTANT_PRACTICE_SOURCE_BUDGET = 18000;
export const ASSISTANT_PRACTICE_CONTENT_BUDGET = 22000;
const id = z.string().trim().min(1).max(180);
const text = (max: number) => z.string().trim().min(3).max(max);
const option = z.object({ id, label: z.string().trim().min(1).max(600) }).strict();
const unique = (values: string[]) => new Set(values).size === values.length;
export const normalizeAssistantPracticeOption = (label: string) => label.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

export const assistantPracticeQuestionSchema = z.object({
  id, kind: z.enum(['classification', 'open_response']), prompt: text(5000), reasonPrompt: text(1000),
  options: z.array(option).max(6), referenceOptionId: id.nullable(), referenceExplanation: text(4000),
  applicableConditions: z.array(text(600)).min(1).max(6), reasoningCriteria: z.array(text(600)).min(1).max(6),
  hints: z.array(text(1200)).min(1).max(3),
  contrast: z.object({ prompt: text(2500), referenceExplanation: text(2500) }).strict(),
  targetAtomIds: z.array(id).max(1), sourceMap: assistantWhiteboardSourceMapSchema,
}).strict().superRefine((value, context) => {
  if (!unique(value.options.map(item => item.id)) || !unique(value.options.map(item => normalizeAssistantPracticeOption(item.label))))
    context.addIssue({ code: 'custom', path: ['options'], message: '选项ID和规范化后的文字均不能重复' });
  if (value.kind === 'classification' && (value.options.length < 2 || !value.options.some(item => item.id === value.referenceOptionId)))
    context.addIssue({ code: 'custom', path: ['referenceOptionId'], message: '分类题至少两个选项，参考选项必须属于本题' });
  if (value.kind === 'open_response' && (value.options.length || value.referenceOptionId !== null))
    context.addIssue({ code: 'custom', path: ['options'], message: '开放表达不包含分类选项或参考选项' });
});
export const assistantPracticeContentSchema = z.object({
  protocol: z.literal(ASSISTANT_PRACTICE_CONTENT_PROTOCOL), title: text(160), objective: text(1000),
  questions: z.array(assistantPracticeQuestionSchema).min(2).max(6),
}).strict().superRefine((value, context) => {
  if (!unique(value.questions.map(item => item.id))) context.addIssue({ code: 'custom', path: ['questions'], message: '题目ID不能重复' });
  if (JSON.stringify(value).length > ASSISTANT_PRACTICE_CONTENT_BUDGET)
    context.addIssue({ code: 'custom', message: '完整练习正文超过22000字符，请完整调整；没有截断' });
});
export type AssistantPracticeContent = z.infer<typeof assistantPracticeContentSchema>;
export type AssistantPracticeQuestion = z.infer<typeof assistantPracticeQuestionSchema>;
export const assistantPracticeContentReviewSchema = z.object({
  decision: z.enum(['pass', 'revised', 'uncertain']), issues: z.array(text(600)).max(12),
  revisedContent: assistantPracticeContentSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.decision === 'pass' && (value.issues.length || value.revisedContent !== null))
    context.addIssue({ code: 'custom', message: '通过需无问题且无修改' });
  if (value.decision === 'revised' && (!value.issues.length || value.revisedContent === null))
    context.addIssue({ code: 'custom', message: '修订需具体问题及完整正文' });
  if (value.decision === 'uncertain' && (!value.issues.length || value.revisedContent !== null))
    context.addIssue({ code: 'custom', message: '不确定需列出问题并保留原稿' });
});

export const assistantPracticeContentInputSchema = assistantPracticePreflightSchema.extend({ modelId: id.optional() }).strict();
export type AssistantPracticeContentInput = z.infer<typeof assistantPracticeContentInputSchema>;
const target = knowledgeAtomSchema.pick({ name: true, objective: true, subject: true, grade: true, term: true }).extend({
  atomId: id, definitionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const assistantPracticeTargetScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('adult') }).strict(),
  z.object({ kind: z.literal('student'), studentId: id, subject: z.enum(['math', 'chinese', 'english', 'chemistry']),
    scopeGrade: learningScopeInputSchema.shape.grade, scopeTerm: learningScopeInputSchema.shape.term, scopeVersion: z.number().int().min(1),
    profileGrade: z.number().int().min(1).max(12), scopeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    targets: z.array(target).min(1).max(3),
  }).strict(),
]);
export type AssistantPracticeTargetScope = z.infer<typeof assistantPracticeTargetScopeSchema>;

/** Explicit allowlist: no source, reference answers, hints or model review are learner-visible here. */
export type AssistantPracticeLearnerProjection = Pick<AssistantPracticeContent, 'protocol' | 'title' | 'objective'> & {
  questions: Array<Pick<AssistantPracticeQuestion, 'id' | 'kind' | 'prompt' | 'options' | 'reasonPrompt'>>;
};
