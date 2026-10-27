'use client';
import { z } from 'zod';
import type { TeachingToolDraft, TeachingToolPurpose, TeachingToolSnapshot } from '@study-agent/contracts';
import { topicCopies, topicStorage } from '../../studio/whiteboards/local-copies';

const format = z.enum(['text', 'json']);
export const teachingFormSchema = z.object({ source: z.enum(['temporary', 'question_bank']), bankSubject: z.enum(['math', 'chinese', 'english']),
  questionId: z.string(), title: z.string(), subject: z.string(), stem: z.string(), referenceAnswer: z.string(), referenceFormat: format,
  referenceUnknown: z.boolean(), referenceAnalysis: z.string(), answer: z.string(), answerFormat: format, answerUnknown: z.boolean(),
  originalDocument: z.string(), originalAnswerSchema: z.string(), mediaNotice: z.string().default(''), hintLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]), modelId: z.string() }).strict();
export type TeachingForm = z.infer<typeof teachingFormSchema>;
export type TeachingCreation = { requestKey: string; fingerprint: string; draft: TeachingToolDraft };
export type TeachingCopy = { version: 1; ownerId: string; purpose: TeachingToolPurpose; at: number; form: TeachingForm; pending: TeachingCreation | null };
export const emptyTeachingForm = (): TeachingForm => ({ source: 'temporary', bankSubject: 'math', questionId: '', title: '', subject: '数学', stem: '',
  referenceAnswer: '', referenceFormat: 'text', referenceUnknown: false, referenceAnalysis: '', answer: '', answerFormat: 'text', answerUnknown: false,
  originalDocument: '', originalAnswerSchema: '', mediaNotice: '', hintLevel: 1, modelId: 'auto' });
export function hasTeachingInput(form: TeachingForm) { return Boolean(form.questionId || form.title || form.stem || form.referenceAnswer || form.referenceUnknown || form.referenceAnalysis || form.answer || form.answerUnknown || form.originalDocument || form.originalAnswerSchema || form.mediaNotice); }
function parseTeachingJson(raw: string, label: string): unknown {
  try { return JSON.parse(raw, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw Error(label + '必须是有限JSON，不能把超出范围的数字当作未知；原输入仍保留。');
    return value;
  }); } catch (error) {
    if (error instanceof SyntaxError) throw Error(label + '不是完整JSON，请检查格式；原输入仍保留。');
    throw error;
  }
}
function value(raw: string, mode: 'text' | 'json', unknown: boolean, label: string) {
  if (unknown) return null;
  if (!raw.trim()) throw Error('请填写' + label + '，未知时请明确勾选“暂不清楚”。');
  if (mode === 'text') return raw;
  return parseTeachingJson(raw, label);
}
export function teachingDraft(form: TeachingForm, purpose: TeachingToolPurpose): TeachingToolDraft {
  const document = form.source === 'temporary' && form.originalDocument.trim() ? parseTeachingJson(form.originalDocument, '表格/公式原文') : undefined;
  const schema = form.source === 'temporary' && form.originalAnswerSchema.trim() ? parseTeachingJson(form.originalAnswerSchema, '答案结构') : undefined;
  const source = form.source === 'question_bank' ? { kind: 'question_bank' as const, questionId: form.questionId }
    : { kind: 'temporary' as const, title: form.title, question: { subject: form.subject, stem: form.stem,
      referenceAnswer: value(form.referenceAnswer, form.referenceFormat, form.referenceUnknown, '参考答案'), referenceAnalysis: form.referenceAnalysis,
      ...(document !== undefined ? { originalDocument: document } : {}), ...(schema !== undefined ? { originalAnswerSchema: schema } : {}), ...(form.mediaNotice.trim() ? { mediaNotice: form.mediaNotice } : {}) } };
  return { source, modelId: form.modelId, ...(purpose === 'assessment_analysis' ? { purpose, answer: value(form.answer, form.answerFormat, form.answerUnknown, '待核对作答') } : { purpose, hintLevel: form.hintLevel }) };
}
export function formFromSnapshot(snapshot: TeachingToolSnapshot, modelId: string): TeachingForm {
  const form = emptyTeachingForm(), question = snapshot.question;
  form.modelId = modelId;
  if (['math', 'chinese', 'english'].includes(question.subject)) form.bankSubject = question.subject as TeachingForm['bankSubject'];
  if (snapshot.source.kind === 'question_bank') { form.source = 'question_bank'; form.questionId = snapshot.source.questionId; }
  { form.title = snapshot.source.kind === 'temporary' ? snapshot.source.title : '原题草稿 ' + snapshot.source.questionId; form.subject = question.subject; form.stem = question.stem; form.referenceAnalysis = question.referenceAnalysis;
    form.referenceUnknown = question.referenceAnswer === null; form.referenceFormat = typeof question.referenceAnswer === 'string' ? 'text' : 'json';
    form.referenceAnswer = typeof question.referenceAnswer === 'string' ? question.referenceAnswer : question.referenceAnswer === null ? '' : JSON.stringify(question.referenceAnswer, null, 2);
    form.originalDocument = question.originalDocument === undefined ? '' : JSON.stringify(question.originalDocument, null, 2);
    form.originalAnswerSchema = question.originalAnswerSchema === undefined ? '' : JSON.stringify(question.originalAnswerSchema, null, 2); form.mediaNotice = question.mediaNotice ?? ''; }
  if (snapshot.purpose === 'assessment_analysis') { form.answerUnknown = snapshot.answer === null; form.answerFormat = typeof snapshot.answer === 'string' ? 'text' : 'json';
    form.answer = typeof snapshot.answer === 'string' ? snapshot.answer : snapshot.answer === null ? '' : JSON.stringify(snapshot.answer, null, 2); }
  else form.hintLevel = snapshot.hintLevel;
  return form;
}
const requestKey = z.string().trim().min(8).max(180);
const creation = z.object({ requestKey, fingerprint: z.string().regex(/^[a-f0-9]{64}$/), draft: z.object({ purpose: z.enum(['assessment_analysis', 'hint_draft']) }).passthrough() }).strict();
export const teachingControlSchema = z.object({ runId: z.string().min(1).max(180), action: z.enum(['cancel', 'retry']),
  command: z.object({ requestKey, generation: z.number().int().positive(), version: z.number().int().positive() }).strict() }).strict();
export type TeachingControl = z.infer<typeof teachingControlSchema>;
export const teachingStorage = (owner: string, purpose: TeachingToolPurpose) => topicStorage('studyagent.teaching-tool.form.v1.' + owner + '.' + purpose);
export function decodeTeachingCopy(raw: string, ownerId: string, purpose: TeachingToolPurpose): TeachingCopy | null {
  try { if (raw.length > 2_000_000) return null; const saved = JSON.parse(raw), form = teachingFormSchema.safeParse(saved.form);
    const pending = saved.pending ? creation.safeParse(saved.pending) : null;
    if (saved.version !== 1 || saved.ownerId !== ownerId || saved.purpose !== purpose || !form.success ||
      saved.pending && (!pending?.success || pending.data.draft.purpose !== purpose) || typeof saved.at !== 'number' || !Number.isFinite(saved.at)) return null;
    return { version: 1, ownerId, purpose, at: saved.at, form: form.data, pending: pending?.success ? pending.data as TeachingCreation : null };
  } catch { return null; }
}
export function otherTeachingCopies(storage: ReturnType<typeof teachingStorage>, owner: string, purpose: TeachingToolPurpose) {
  return topicCopies(storage, raw => decodeTeachingCopy(raw, owner, purpose), 2_000_000);
}
export function unknownTeachingCopies(storage: ReturnType<typeof teachingStorage>, recognized: (raw: string) => boolean) {
  return Object.keys(localStorage).filter(key => key === storage.base || key.startsWith(storage.base + '.'))
    .flatMap(key => { const raw = localStorage.getItem(key); return raw && !recognized(raw) ? [{ key, raw }] : []; });
}
export function decodeTeachingControl(raw: string, ownerId: string, runId: string) {
  try { const saved = JSON.parse(raw), parsed = saved.pending ? teachingControlSchema.safeParse(saved.pending) : null;
    if (saved.version !== 1 || saved.ownerId !== ownerId || saved.runId !== runId ||
      saved.pending && (!parsed?.success || parsed.data.runId !== runId)) return null;
    return { pending: parsed?.success ? parsed.data : null };
  } catch { return null; }
}
export function downloadTeaching(value: unknown, filename = 'teaching-draft.json') {
  downloadTeachingText(JSON.stringify(value, null, 2), filename);
}
export function downloadTeachingText(value: string, filename: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' })), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
