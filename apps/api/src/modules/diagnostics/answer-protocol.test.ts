import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, QuestionAnswerSchema } from '@study-agent/contracts';
import { gradeResponse } from './scoring';
import { arithmeticValue } from './arithmetic-expression';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';

const choice = (id: string) => ({ id, label: id });
const make = (mode: QuestionAnswerSchema['mode'], responseShape = {}): QuestionAnswerSchema => ({ questionId: 'q', mode, responseShape, validationRules: {}, gradingConfig: {} });
const envelope = (schema: QuestionAnswerSchema, response: unknown) => ({ questionId: schema.questionId, mode: schema.mode, response });

describe('structured answer golden protocols', () => {
  it('checks a complete permutation, preserves choice case and rejects duplicates or forged ids', () => {
    const sorting = make('sorting', { items: ['A', 'B', 'C'].map(choice) });
    expect(gradeResponse(sorting, ['A', 'B', 'C'], ['A', 'B', 'C']).score).toBe(1);
    expect(gradeResponse(sorting, ['A', 'B', 'C'], ['C', 'A', 'B']).score).toBe(0);
    for (const values of [['A', 'A', 'C'], ['A', 'B'], ['A', 'B', 'c'], ['A', 'B', 'forged']]) expect(() => gradeResponse(sorting, ['A', 'B', 'C'], values)).toThrow();
    expect(answerProtocolIssue(sorting, envelope(sorting, { values: ['B'] }), true)).toBeNull();
    const select = { ...make('multiple_choice'), options: ['A', 'a', 'C'].map(value => ({ id: value, label: value, value })) };
    expect(gradeResponse(select, ['A', 'C'], ['C', 'A']).score).toBe(1);
    expect(gradeResponse(select, ['A', 'C'], ['a', 'C']).score).toBe(0);
    expect(() => gradeResponse(select, ['A', 'C'], ['A', 'A', 'C'])).toThrow();
  });
  it('pairs by stable ids independent of submitted order and enforces one-to-one matching', () => {
    const schema = make('matching', { left: ['l1', 'l2'].map(choice), right: ['r1', 'r2'].map(choice) });
    const correct = [{ left: 'l1', right: 'r2' }, { left: 'l2', right: 'r1' }];
    expect(gradeResponse(schema, { pairs: correct }, { pairs: [...correct].reverse() }).score).toBe(1);
    expect(gradeResponse(schema, correct, { pairs: [{ left: 'l1', right: 'r1' }, { left: 'l2', right: 'r2' }] }).score).toBe(0);
    for (const pairs of [[correct[0], correct[0]], [{ left: 'l1', right: 'r1' }, { left: 'l2', right: 'r1' }], [null], [{ left: 'x', right: 'r1' }]]) expect(() => gradeResponse(schema, correct, { pairs })).toThrow();
  });
  it('awards cell and classification partial credit without collapsing precise category ids', () => {
    const table = make('table_fill', { rows: ['a', 'b'].map(choice), columns: [choice('n')] });
    expect(gradeResponse(table, { cells: { 'a:n': '1/2', 'b:n': 6 } }, { cells: { 'b:n': '5', 'a:n': '0.5' } }).score).toBe(0.5);
    expect(() => gradeResponse(table, { cells: { 'a:n': '1', 'b:n': '6' } }, { cells: { 'x:n': '1' } })).toThrow();
    for (const expected of [{ cells: null }, { cells: [] }, { cells: { 'a:n': '1' } }]) expect(gradeResponse(table, expected, { cells: { 'a:n': '1', 'b:n': '6' } }).status).toBe('pending_review');
    const classify = make('drag_drop', { items: ['p', 'q', 'r'].map(choice), groups: ['A', 'a'].map(choice) });
    expect(gradeResponse(classify, { placements: { p: 'A', q: 'a', r: 'A' } }, { placements: { p: 'A', q: 'A', r: 'A' } }).score).toBeCloseTo(2 / 3);
    expect(() => gradeResponse(classify, { placements: { p: 'A', q: 'a', r: 'A' } }, { placements: { p: 'unknown' } })).toThrow();
  });
  it('keeps blank labels non-authoritative and safely routes malformed or incomplete answer keys to review', () => {
    const schema = make('multi_blank', { entries: [{ key: 'a' }, { key: 'b' }] });
    const input = { entries: [{ key: 'b', value: '0.5', label: 'untrusted' }, { key: 'a', value: '' }] };
    expect(gradeResponse(schema, [{ key: 'a', value: 6 }, { key: 'b', value: '1/2' }], input).score).toBe(0.5);
    for (const expected of [[null], [{ key: 'a', value: 6 }], { entries: null }]) expect(gradeResponse(schema, expected, input).status).toBe('pending_review');
    for (const entries of [[null], [{ key: '__proto__', value: 'x' }], [{ key: 'a', value: '1' }, { key: 'a', value: '2' }]]) expect(() => gradeResponse(schema, [], { entries })).toThrow();
  });
  it('checks hotspot configuration and never infers a drawing score from a nonempty answer', () => {
    const schema = make('hotspot', { imageUrl: '/question-assets/example.svg', targets: [{ id: 'top', label: '上方', x: 0, y: 0, width: 1, height: 0.5 }] });
    expect(gradeResponse(schema, 'top', envelope(schema, { value: 'top' })).score).toBe(1);
    expect(answerInputConfiguration({ ...schema, responseShape: { ...schema.responseShape, targets: [{ id: 'a', label: 'x', x: 0.9, y: 0, width: 0.2, height: 1 }] } }).supported).toBe(false);
    for (const imageUrl of ['javascript:alert(1)', '//example.com/a', '/\\example.com/a']) expect(answerInputConfiguration({ ...schema, responseShape: { ...schema.responseShape, imageUrl } }).supported).toBe(false);
    const drawing = make('geometry_draw');
    expect(gradeResponse(drawing, {}, { strokes: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }], description: '' }).status).toBe('pending_review');
    expect(gradeResponse(drawing, {}, { strokes: [], description: '每行4格，一共3行。' }).score).toBeNull();
    for (const response of [{ strokes: [], description: '' }, { strokes: [null] }, { strokes: [{ points: [{ x: 2, y: 0 }] }] },
      { strokes: [{ points: Array.from({ length: 1025 }, () => ({ x: 0, y: 0 })) }] }]) expect(() => gradeResponse(drawing, {}, response)).toThrow();
    expect(answerProtocolIssue(drawing, envelope(drawing, { strokes: [], description: '' }), true)).toBeNull();
  });
  it('bounds drafts, rejects mismatched envelopes and distinguishes unimplemented media from text inputs', () => {
    const schema = make('stepwise');
    expect(gradeResponse(schema, [], ['先确定已知量', '再列式']).status).toBe('pending_review');
    expect(answerProtocolIssue(schema, { ...envelope(schema, { steps: [''] }), questionId: 'another' }, true)).not.toBeNull();
    expect(answerProtocolIssue(schema, envelope(schema, { steps: ['x'.repeat(90001)] }), true)).not.toBeNull();
    for (const mode of ['matching', 'sorting', 'table_fill', 'hotspot', 'multi_blank', 'image_upload', 'audio_record'] as const) expect(answerInputConfiguration(make(mode)).supported).toBe(false);
    expect(gradeResponse(make('text_blank'), envelope(make('text_blank'), { value: 'hello' }), 'HELLO').score).toBe(1);
  });
});

describe('bounded arithmetic equivalence', () => {
  it('compares ordinary, fraction, LaTeX and superscript forms with correct precedence', () => {
    for (const [source, expected] of [['1/2+1/4', 0.75], ['2+3×4', 14], ['(2+3)÷2', 2.5], ['-2^2', -4], ['2^-2', 0.25], ['2²', 4],
      ['2^3^2', 512], ['\\frac{1}{2}+\\dfrac{1}{4}', 0.75], ['\\tfrac{3}{4}\\times 2', 1.5]] as const) expect(arithmeticValue(source), source).toBe(expected);
    expect(gradeResponse(make('formula_blank'), '\\frac{3}{4}', '1/2+1/4').score).toBe(1);
    expect(gradeResponse(make('formula_blank'), '4', '2²').score).toBe(1);
    expect(gradeResponse(make('formula_blank'), '22', '2²').score).toBe(0);
  });
  it('rejects code, variables, invalid fractions, excessive recursion and numeric overflow', () => {
    for (const value of ['process.exit()', 'globalThis.x=1', 'constructor.constructor("return 1")()', 'x+x', '1/0', '\\frac{1}{0}', 'NaN', '2^13',
      '2^0.5', '2(3)', '('.repeat(31) + '1' + ')'.repeat(31), '1+'.repeat(160) + '1', '9007199254740992', {}, null]) expect(arithmeticValue(value), String(value)).toBeNull();
  });
});

describe('original structured course delivery', () => {
  it('publishes usable configuration and independently checkable keys for every supported mode', () => {
    const modes = new Set<string>();
    for (const { atom, exercises } of buildFoundationCurriculum()) for (const exercise of exercises) {
      const mode = exercise.mode ?? (atom.subject === 'math' ? 'numeric_blank' : 'text_blank'); modes.add(mode);
      const schema: QuestionAnswerSchema = { ...make(mode, exercise.responseShape ?? {}), questionId: foundationQuestionId(atom.id, exercise),
        options: exercise.options?.map(value => ({ id: value, value, label: value })) };
      expect(answerInputConfiguration(schema).supported, schema.questionId).toBe(true);
      if (!exercise.rubric) expect(gradeResponse(schema, exercise.answer, exercise.answer).score, schema.questionId).toBe(1);
    }
    expect(modes.size).toBe(17);
  });
});
