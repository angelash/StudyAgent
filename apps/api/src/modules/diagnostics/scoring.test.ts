import { describe, expect, it } from 'vitest';
import { QuestionAnswerSchema } from '@study-agent/contracts';
import { gradeResponse, numericValue } from './scoring';

const schema = (mode: QuestionAnswerSchema['mode'], gradingConfig = {}): QuestionAnswerSchema => ({ questionId: 'q', mode,
  options: ['A', 'B', 'C'].map(value => ({ id: value, value, label: value })),
  responseShape: mode === 'sorting' ? { items: [{ id: 'A', label: '甲' }, { id: 'C', label: '丙' }] } :
    mode === 'multi_blank' ? { entries: [{ key: 'a' }, { key: 'b' }] } : {}, validationRules: {}, gradingConfig });
describe('versioned deterministic scoring', () => {
  it('rejects blank or coercible non-numbers and recognizes finite equivalent fractions', () => {
    for (const input of ['', ' ', null, [], true, {}, '1/0', 'Infinity']) expect(numericValue(input)).toBeNull();
    expect(gradeResponse(schema('numeric_blank'), '1/2', '0.5').correct).toBe(true);
    expect(gradeResponse(schema('numeric_blank'), '0', 0).correct).toBe(true);
    expect(() => gradeResponse(schema('numeric_blank'), '0', '')).toThrow();
    expect(gradeResponse(schema('numeric_blank', { absoluteTolerance: 0.01 }), 3.14, 3.145).correct).toBe(true);
  });
  it('scores multi-select as unordered, ordering as ordered and blanks by stable key', () => {
    expect(gradeResponse(schema('multiple_choice'), ['A', 'C'], ['C', 'A']).score).toBe(1);
    expect(gradeResponse(schema('sorting'), ['A', 'C'], ['C', 'A']).score).toBe(0);
    expect(gradeResponse(schema('multi_blank'), [{ key: 'a', value: '6' }, { key: 'b', value: '1/2' }],
      [{ key: 'b', value: '0.5', label: '不同标签' }, { key: 'a', value: '5' }]).score).toBe(0.5);
  });
  it('keeps subjective work pending instead of inventing a score and never executes formula text', () => {
    expect(gradeResponse(schema('short_answer'), '参考答案', '我的解释').status).toBe('pending_review');
    expect(gradeResponse(schema('formula_blank'), '2', 'process.exit()').score).toBe(0);
    expect(() => gradeResponse(schema('numeric_blank'), '2', { mode: 'short_answer', response: { value: '2' } })).toThrow();
  });
  it('freezes per-position observations under the same normalization used for the score', () => {
    const current = { ...schema('multi_blank'), responseShape: { entries: [{ key: 'a', label: '合并后的数量' }, { key: 'b', label: '每份数量' }] } };
    const grade = gradeResponse(current, [{ key: 'a', value: '1/2' }, { key: 'b', value: '8' }], [{ key: 'b', value: '4' }, { key: 'a', value: '0.5' }]);
    expect(grade.score).toBe(0.5); expect(grade.scoreDetails).toEqual([
      { key: 'a', label: '合并后的数量', score: 1, origin: 'protocol' }, { key: 'b', label: '每份数量', score: 0, origin: 'protocol' },
    ]);
    expect(gradeResponse(schema('numeric_blank'), 8, 4).scoreDetails).toBeUndefined();
  });
});
