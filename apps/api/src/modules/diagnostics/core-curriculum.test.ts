import { describe, expect, it } from 'vitest';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';
import { assertAcyclic } from './curriculum.service';
import { numericValue } from './scoring';

describe('original curriculum content integrity', () => {
  const definitions = buildFoundationCurriculum();
  const byId = new Map(definitions.map(d => [d.atom.id, d]));
  it('has inspectable atomic tasks across all 18 subject/grade cells without future prerequisites', () => {
    expect(() => assertAcyclic(definitions.map(d => d.atom))).not.toThrow();
    expect(new Set(definitions.map(d => d.atom.id)).size).toBe(definitions.length);
    for (const subject of ['math', 'chinese', 'english']) for (let grade = 1; grade <= 6; grade++) {
      const cell = definitions.filter(d => d.atom.subject === subject && d.atom.grade === grade);
      expect(cell.length, `${subject}/${grade}`).toBeGreaterThanOrEqual(10);
      expect(cell.every(d => d.exercises.length > 0)).toBe(true);
      for (const d of cell) for (const pre of d.atom.prerequisiteIds) expect(byId.get(pre)!.atom.grade).toBeLessThanOrEqual(grade);
    }
  });
  it('keeps objective options unambiguous, numbers finite and subjective criteria explicit', () => {
    const allIds = new Set<string>();
    for (const { atom, exercises } of definitions) for (const exercise of exercises) {
      const id = foundationQuestionId(atom.id, exercise);
      expect(allIds.has(id), id).toBe(false); allIds.add(id);
      if (exercise.mode === 'single_choice') {
        expect(exercise.options!.length).toBeGreaterThanOrEqual(2);
        expect(new Set(exercise.options).size).toBe(exercise.options!.length);
        expect(exercise.options!.filter(o => o === exercise.answer)).toHaveLength(1);
      }
      if ((exercise.mode ?? (atom.subject === 'math' ? 'numeric_blank' : 'text_blank')) === 'numeric_blank') {
        expect(numericValue(exercise.answer), id).not.toBeNull();
      }
      if (['short_answer', 'geometry_draw', 'stepwise', 'image_upload', 'audio_record'].includes(exercise.mode ?? '')) {
        expect(exercise.rubric!.length).toBeGreaterThanOrEqual(3);
        expect(exercise.rubric!.reduce((n, c) => n + c.weight, 0)).toBeCloseTo(1);
      }
    }
  });
  it('matches independently calculated golden responses for arithmetic, geometry and semantics', () => {
    const first = (id: string) => byId.get(id)!.exercises[0];
    expect(first('core:math:borrow100').stem).toBe('40-13=?');
    expect(first('core:math:borrow100').answer).toBe(27);
    expect(first('core:math:average').answer).toBe(13); // (10+12+17)/3
    expect(first('core:math:circlearea').answer).toBe(12.56); // radius 2
    expect(numericValue(first('core:math:fractiondivide').answer)).toBe(0.75); // 1/4 divided by 1/3
    expect(first('core:math:cuboidsurface').answer).toBe(52); // 4×3×2, six faces
    expect(first('core:chinese:reference-chain').answer).toBe('小雨');
    expect(first('core:chinese:counterevidence').answer).toContain('金属船');
    expect(first('core:english:did-base').answer).toBe('go');
    expect(first('core:english:inference-text').answer).toBe('He expects rain.');
  });
  it('attaches only schema-bounded fraction visuals to authored teaching', () => {
    const equivalence = byId.get('foundation:math:fractionequivalence')!.atom.teaching!.visual;
    const addition = byId.get('core:math:fractionadd')!.atom.teaching!.visual;
    const subtraction = byId.get('core:math:fractionsubtract')!.atom.teaching!.visual;
    expect(equivalence).toMatchObject({ kind: 'fraction_bars', operator: '=', commonDenominator: 12,
      result: { numerator: 9, denominator: 12 } });
    expect(addition).toMatchObject({ kind: 'fraction_bars', operator: '+', commonDenominator: 12,
      terms: [{ numerator: 2, denominator: 3 }, { numerator: 1, denominator: 4 }], result: { numerator: 11, denominator: 12 } });
    expect(subtraction).toMatchObject({ kind: 'fraction_bars', operator: '-', commonDenominator: 12,
      result: { numerator: 7, denominator: 12 } });
    expect(byId.get('core:math:count')!.atom.teaching!.visual).toBeUndefined();
  });
});
