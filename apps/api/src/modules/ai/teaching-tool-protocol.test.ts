import { describe, expect, it } from 'vitest';
import { prepareTeachingSnapshot, teachingEvidence, teachingAnalysisJsonSchema, teachingHintJsonSchema,
  validateTeachingAnalysis, validateTeachingHint, teachingHintWarnings } from './teaching-tool-protocol';
const input = (purpose: 'assessment_analysis' | 'hint_draft' = 'assessment_analysis') => ({ purpose,
  source: { kind: 'temporary', title: '匿名平均数教学草稿' }, question: { subject: '数学', stem: '  两组各有三人与两人，总分分别18与14。求五人的平均分。\n',
    referenceAnswer: '6.4', referenceAnalysis: '合计总分32，分母应是五人。' }, ...(purpose === 'assessment_analysis' ? { answer: { steps: ['18+14=32', '32/2=16'], result: 16 } } : { hintLevel: 1 }) });
const analysis = () => ({ summary: '这份作答先正确合计，再按组数相除。', judgement: 'incorrect',
  observations: [{ source: 'submitted_answer', quote: '32/2=16', observation: '这里把两组当作需要平均的人数。' }],
  uncertainties: ['尚不能从本次作答确定是否理解每个平均单位。'], verificationSteps: ['请用五个记号表示人数，再说明分母代表什么。'],
  confidenceLevel: 'medium', reviewRequired: true, advisoryOnly: true });
describe('complete admin teaching protocol; no model, storage or scoring execution', () => {
  it('keeps complete whitespace and structured work, with a canonical fingerprint for equivalent key orders', () => {
    const original = input(), copy = structuredClone(original), first = prepareTeachingSnapshot(original), second = prepareTeachingSnapshot({ ...original, answer: { result: 16, steps: ['18+14=32', '32/2=16'] } });
    expect(first.snapshot).toEqual(copy); expect(original).toEqual(copy); expect(first.context).toContain('五人的平均分。\\n');
    expect(first.fingerprint).toBe(second.fingerprint); expect(teachingEvidence(first.snapshot).submitted_answer).toContain('32/2=16');
    expect(prepareTeachingSnapshot({ ...original, answer: 32 }).fingerprint).not.toBe(first.fingerprint);
  });
  it('rejects absent answers while preserving deliberately unknown null values', () => {
    const missing: Record<string, unknown> = { ...input() }; delete missing.answer; expect(() => prepareTeachingSnapshot(missing)).toThrow();
    const original = input(), { referenceAnswer, ...question } = original.question; expect(() => prepareTeachingSnapshot({ ...original, question })).toThrow();
    expect(prepareTeachingSnapshot({ ...original, question: { ...original.question, referenceAnswer: null }, answer: null }).snapshot).toMatchObject({ answer: null });
  });
  it('rejects oversized complete inputs, invalid JSON, cycles and deeply nested answers without truncation', () => {
    for (const answer of [Infinity, undefined, BigInt(2), new Date(), 'x'.repeat(8001)]) expect(() => prepareTeachingSnapshot({ ...input(), answer })).toThrow();
    const cycle: any = {}; cycle.self = cycle; expect(() => prepareTeachingSnapshot({ ...input(), answer: cycle })).toThrow();
    expect(() => prepareTeachingSnapshot({ ...input(), answer: Array.from({ length: 101 }, () => 1) })).toThrow();
    expect(() => prepareTeachingSnapshot({ ...input(), question: { subject: '数学', stem: '题'.repeat(6000), referenceAnswer: '答'.repeat(7000), referenceAnalysis: '析'.repeat(6000) } })).toThrow(/18000/);
    expect(() => prepareTeachingSnapshot({ ...input(), answer: JSON.parse('{"__proto__":{"polluted":true}}') })).toThrow();
  });
  it('binds a bank reference to its explicit fingerprint and rejects credentials or unknown request fields', () => {
    const first = prepareTeachingSnapshot({ ...input(), source: { kind: 'question_bank', questionId: 'anonymous-q', fingerprint: 'a'.repeat(64) } });
    expect(prepareTeachingSnapshot({ ...first.snapshot, source: { kind: 'question_bank', questionId: 'anonymous-q', fingerprint: 'b'.repeat(64) } }).fingerprint).not.toBe(first.fingerprint);
    expect(() => prepareTeachingSnapshot({ ...input(), apiKey: 'synthetic-untrusted-field' })).toThrow();
    expect(() => prepareTeachingSnapshot({ ...input(), source: { kind: 'question_bank', questionId: 'anonymous-q', fingerprint: 'unbound' } })).toThrow();
  });
  it('accepts an advisory explanation only with exact input quotes and preserves uncertainty', () => {
    const snapshot = prepareTeachingSnapshot(input()).snapshot; expect(validateTeachingAnalysis(analysis(), snapshot)).toEqual(analysis());
    for (const wrong of [{ ...analysis(), score: 0 }, { ...analysis(), reviewRequired: false }, { ...analysis(), advisoryOnly: false },
      { ...analysis(), observations: [{ source: 'submitted_answer', quote: '学生已经自述不会平均数', observation: '伪引用。' }] },
      { ...analysis(), judgement: 'uncertain', uncertainties: [] }, { ...analysis(), judgement: 'uncertain', confidenceLevel: 'high' }]) expect(() => validateTeachingAnalysis(wrong, snapshot)).toThrow();
    expect(() => validateTeachingAnalysis({ ...analysis(), summary: '根因已确定，这个错误已经证明根因。' }, snapshot)).toThrow(/根因/);
  });
  it('rejects incomplete or wrong-purpose results instead of manufacturing a score or confidence', () => {
    const snapshot = prepareTeachingSnapshot(input()).snapshot;
    for (const value of [{}, { summary: '不完整。', correct: true }, { ...analysis(), summary: '   ' }, { ...analysis(), observations: [] }, { ...analysis(), verificationSteps: [] }]) expect(() => validateTeachingAnalysis(value, snapshot)).toThrow();
    expect(() => validateTeachingAnalysis(analysis(), prepareTeachingSnapshot(input('hint_draft')).snapshot)).toThrow(/用途/);
    expect(teachingAnalysisJsonSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(teachingHintJsonSchema).toMatchObject({ type: 'object', additionalProperties: false });
  });
  it('keeps the chosen help level and treats literal answer checks as warnings on an unreviewed admin draft', () => {
    const snapshot = prepareTeachingSnapshot(input('hint_draft')).snapshot, draft = { hint: '先画五个表示人数的记号，再解释你要平均的对象。', focus: '核对分母代表的对象。', suggestedLevel: 1, reviewAdvice: '先人工检查是否直接透露答案。', reviewRequired: true, advisoryOnly: true } as const;
    expect(validateTeachingHint(draft, snapshot)).toEqual(draft); expect(teachingHintWarnings(snapshot, draft)).toEqual([]);
    expect(teachingHintWarnings(snapshot, { ...draft, hint: '答案是6.4。' })).toEqual(['possible_answer_disclosure']);
    expect(() => validateTeachingHint({ ...draft, suggestedLevel: 2 }, snapshot)).toThrow(/层级/);
    expect(() => validateTeachingHint(draft, prepareTeachingSnapshot(input()).snapshot)).toThrow(/用途/);
    expect(teachingEvidence(snapshot)).not.toHaveProperty('submitted_answer');
  });
  it('retains complete table/formula documents and accepts only their exact original formula values or serialized quotes', () => {
    const original = { ...input(), question: { ...input().question,
      originalDocument: { version: 3, blocks: [{ type: 'table', headers: ['人数', '总分'], rows: [['3', '18'], ['2', '14']] }, { type: 'formula', text: '\\frac{32}{5}=6.4' }] },
      originalAnswerSchema: { mode: 'numeric_blank', gradingConfig: { tolerance: 0 } } } };
    const prepared = prepareTeachingSnapshot(original); expect(prepared.snapshot.question.originalDocument).toEqual(original.question.originalDocument);
    expect(prepared.context).toContain('\\\\frac{32}{5}=6.4');
    expect(validateTeachingAnalysis({ ...analysis(), observations: [{ source: 'question_document', quote: '\\frac{32}{5}=6.4', observation: '原式明确以五人为分母。' }] }, prepared.snapshot).observations).toHaveLength(1);
    expect(() => validateTeachingAnalysis({ ...analysis(), observations: [{ source: 'question_document', quote: '\\frac{32}{2}=16', observation: '伪造原式。' }] }, prepared.snapshot)).toThrow(/原文/);
    expect(prepareTeachingSnapshot({ ...original, question: { ...original.question, originalDocument: { ...original.question.originalDocument, version: 4 } } }).fingerprint).not.toBe(prepared.fingerprint);
  });
  it('keeps unresolved media explicitly unknown and never calls its URL a verified visual observation', () => {
    const snapshot = prepareTeachingSnapshot({ ...input(), question: { ...input().question,
      originalDocument: { blocks: [{ type: 'image', src: '/anonymous-question-image.png' }] }, mediaNotice: '本次文字分析未读取图片内容，需要人工核对。' } }).snapshot;
    expect(() => validateTeachingAnalysis(analysis(), snapshot)).toThrow(/媒体/);
    expect(validateTeachingAnalysis({ ...analysis(), judgement: 'uncertain', uncertainties: ['图片内容未解析，不能核对完整题意。'], confidenceLevel: 'low' }, snapshot).judgement).toBe('uncertain');
    expect(() => validateTeachingAnalysis({ ...analysis(), judgement: 'uncertain', confidenceLevel: 'low', observations: [{ source: 'question_document', quote: '图中有五个人', observation: '假称已看到图片。' }] }, snapshot)).toThrow(/原文/);
  });
});
