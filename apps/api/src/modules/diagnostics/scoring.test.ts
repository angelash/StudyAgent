import { describe, expect, it } from 'vitest';
import { QuestionAnswerSchema } from '@study-agent/contracts';
import { gradeResponse, numericValue } from './scoring';

const schema = (mode: QuestionAnswerSchema['mode'], gradingConfig = {}): QuestionAnswerSchema => ({ questionId: 'q', mode,
  responseShape: {}, validationRules: {}, gradingConfig });
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
});
