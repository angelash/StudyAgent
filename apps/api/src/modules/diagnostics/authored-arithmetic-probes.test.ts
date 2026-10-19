import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DiagnosticHypothesis, MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import { buildArithmeticProbeFamilies } from './authored-arithmetic-probes';
import { buildAuthoredMathProbeFamilies } from './authored-math-probes';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';
import { arithmeticValue } from './arithmetic-expression';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildArithmeticProbeFamilies();
const exercises = (name: string) => families.find(family => family.family === name)!.exercises;
const entries = (input: unknown): Record<string, number> => Object.fromEntries((input as Array<{ key: string; value: string }>).map(row => [row.key, Number(row.value)]));
const numberDots = (input: string) => (input.match(/●/g) ?? []).length;

describe('original arithmetic relations and representation probes', () => {
  it('adds 240 distinct tasks across five points while retaining the prior 192 tasks verbatim', () => {
    expect(families).toHaveLength(20); expect(new Set(families.map(family => family.atomId)).size).toBe(5);
    const ids = families.flatMap(family => family.exercises.map(exercise => foundationQuestionId(family.atomId, exercise)));
    expect(ids).toHaveLength(240); expect(new Set(ids).size).toBe(240);
    const previous = buildAuthoredMathProbeFamilies().flatMap(family => family.exercises.map(exercise => ({ atomId: family.atomId,
      id: foundationQuestionId(family.atomId, exercise), exercise }))).sort((a, b) => a.id.localeCompare(b.id));
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe('0beb91823030cd66f010f02e354d533044a98fd85cc47386ee2a7d62c201bcca');
  });

  it('independently checks partition equations, hidden quantities, conservation and every model distractor', () => {
    for (const exercise of exercises('part-whole-symbol')) {
      const [, part, total] = exercise.stem.match(/(\d+)\+□=(\d+)/)!.map(Number);
      expect(Number(exercise.answer) + part).toBe(total); expect(total).toBeLessThanOrEqual(10);
    }
    for (const exercise of exercises('part-whole-conservation-audit')) {
      const [total, left, right] = exercise.stem.match(/\d+/g)!.map(Number); expect(exercise.answer).toBe(left + right === total);
    }
    for (const exercise of exercises('part-whole-occluded-collection')) {
      const total = Number(exercise.stem.match(/共有(\d+)/)![1]), shown = numberDots(exercise.blocks![0].rows![0][1]);
      expect(exercise.answer).toBe(total - shown); expect(Number(exercise.answer)).toBeGreaterThan(0);
    }
    for (const exercise of exercises('part-whole-model-selection')) {
      const [total, part] = exercise.stem.match(/\d+/g)!.map(Number);
      expect(exercise.options!.filter(option => arithmeticValue(option.replaceAll('−', '-')) === total - part)).toEqual([exercise.answer]);
    }
  });

  it('checks make-ten quantity allocation and number-line or table addition without leaving the 20 range', () => {
    for (const exercise of exercises('addition-make-ten-steps')) {
      const [, a, b] = exercise.stem.match(/计算(\d+)\+(\d+)/)!.map(Number), value = entries(exercise.answer);
      expect(a + value.need).toBe(10); expect(value.need + value.left).toBe(b); expect(value.total).toBe(a + b); expect(value.total).toBeLessThanOrEqual(20);
    }
    for (const exercise of exercises('addition-regrouping-audit')) {
      const [, a, b] = exercise.stem.match(/算(\d+)\+(\d+)/)!.map(Number), rest = Number(exercise.stem.match(/还剩(\d+)/)![1]);
      expect(exercise.answer).toBe(rest + 10 === a + b);
    }
    for (const exercise of exercises('addition-disjoint-inventory')) expect(exercise.answer).toBe(exercise.blocks![0].rows!.reduce((sum, [, count]) => sum + Number(count), 0));
    for (const exercise of exercises('addition-number-line-motion')) {
      const [, a, b] = exercise.stem.match(/走(\d+)格，再向右走(\d+)格/)!.map(Number); expect(exercise.answer).toBe(a + b); expect(a + b).toBeLessThanOrEqual(20);
    }
  });

  it('checks inverse subtraction, cumulative subtraction steps and ignores record identifiers', () => {
    for (const exercise of exercises('subtraction-inverse-check')) {
      const [total, removed, remaining] = exercise.stem.match(/\d+/g)!.map(Number); expect(exercise.answer).toBe(removed + remaining === total);
    }
    for (const exercise of exercises('subtraction-via-ten-steps')) {
      const [, total, removed] = exercise.stem.match(/计算(\d+)−(\d+)/)!.map(Number), value = entries(exercise.answer);
      expect(total - value.first).toBe(10); expect(value.first + value.then).toBe(removed); expect(value.remaining).toBe(total - removed);
    }
    for (const exercise of exercises('subtraction-number-line-backward')) {
      const start = Number(exercise.stem.match(/数线的(\d+)/)![1]), back = Number(exercise.stem.match(/左退(\d+)/)![1]); expect(exercise.answer).toBe(start - back);
    }
    for (const exercise of exercises('subtraction-stock-record')) {
      const [serial, stock, issued] = exercise.blocks![0].rows![0].map(Number); expect(serial).toBeGreaterThan(stock); expect(exercise.answer).toBe(stock - issued);
    }
  });

  it('distinguishes factor roles and independently counts array symbols and repeated jumps', () => {
    for (const exercise of exercises('equal-groups-factor-roles')) {
      const [groups, each] = exercise.stem.match(/\d+/g)!.map(Number); expect(entries(exercise.answer)).toEqual({ groups, each }); expect(groups).not.toBe(each);
    }
    for (const exercise of exercises('equal-groups-equality-audit')) {
      const sum = exercise.stem.match(/把([\d+]+)改写/)![1], numbers = sum.split('+').map(Number), total = numbers.reduce((a, b) => a + b, 0);
      expect(exercise.answer).toBe(`${numbers.length}×${numbers[0]}`);
      expect(exercise.options!.filter(option => arithmeticValue(option) === total)).toEqual([exercise.answer]);
    }
    for (const exercise of exercises('equal-groups-spatial-array')) expect(exercise.answer).toBe(exercise.blocks![0].rows!.reduce((sum, [dots]) => sum + numberDots(dots), 0));
    for (const exercise of exercises('equal-groups-equal-jumps')) {
      const [, stride, jumps] = exercise.stem.match(/右跳(\d+)格，连续跳(\d+)次/)!.map(Number); expect(exercise.answer).toBe(stride * jumps);
    }
  });

  it('checks sharing by conservation and connects equal rounds, intervals and lengths', () => {
    for (const exercise of exercises('division-share-conservation')) {
      const [total, people, each] = exercise.stem.match(/\d+/g)!.map(Number); expect(exercise.answer).toBe(people * each === total);
    }
    for (const exercise of exercises('division-dealing-rounds')) {
      const [total, people] = exercise.stem.match(/\d+/g)!.map(Number), value = entries(exercise.answer);
      expect(value.rounds * people).toBe(total); expect(value.each).toBe(value.rounds);
    }
    for (const exercise of exercises('division-equal-intervals')) {
      const jumps = Number(exercise.stem.match(/用(\d+)次/)![1]), end = Number(exercise.stem.match(/正好到(\d+)/)![1]); expect(Number(exercise.answer) * jumps).toBe(end);
    }
    for (const exercise of exercises('division-cut-equal-lengths')) {
      const total = Number(exercise.stem.match(/纸带长(\d+)/)![1]), pieces = Number(exercise.stem.match(/分成(\d+)段/)![1]); expect(Number(exercise.answer) * pieces).toBe(total);
    }
  });

  it('scores all declared correct responses and rejects valid but wrong responses through the actual protocol', () => {
    for (const family of families) for (const exercise of family.exercises) {
      const schema: QuestionAnswerSchema = { questionId: foundationQuestionId(family.atomId, exercise), mode: exercise.mode ?? 'numeric_blank',
        responseShape: exercise.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: exercise.options?.map(value => ({ id: value, label: value, value })) };
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(gradeResponse(schema, exercise.answer, exercise.answer).score, exercise.stem).toBe(1);
      const wrong = schema.mode === 'single_choice' ? exercise.options!.find(option => option !== exercise.answer) : schema.mode === 'boolean' ? !exercise.answer :
        schema.mode === 'multi_blank' ? (exercise.answer as Array<{ key: string; value: string }>).map(entry => ({ ...entry, value: String(Number(entry.value) + 1) })) : Number(exercise.answer) + 1;
      expect(gradeResponse(schema, exercise.answer, wrong).score, exercise.stem).toBe(0);
    }
  });

  it('provides two basic and two transfer contrasts per point from actual authored families', () => {
    for (const definition of buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id))) {
      const spec = verificationBlueprint({ id: 'qa', title: '核查', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(exercise => { const id = foundationQuestionId(definition.atom.id, exercise); return { id, questionId: id,
        atomId: definition.atom.id, family: exercise.family, dimension: exercise.dimension, difficulty: 1, expectedSeconds: 40 } as MeasurementItem; });
      const choice = selectVerificationItems(spec, items, new Set([definition.atom.id]), 'qa', 8, 600);
      expect(choice.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(choice.selected.map(row => row.family)).size).toBe(4);
    }
  });

  it('retains the symbolic partition family across the old understanding and new equation interaction', () => {
    const definition = buildFoundationCurriculum().find(row => row.atom.id === 'foundation:math:decompose10')!;
    const symbolic = definition.exercises.filter(exercise => exercise.family === 'part-whole-symbol');
    expect(symbolic.some(exercise => exercise.identityVersion !== 2 && exercise.dimension === 'understanding')).toBe(true);
    expect(symbolic.some(exercise => exercise.identityVersion === 2 && exercise.dimension === 'procedure')).toBe(true);
    expect(new Set(symbolic.map(exercise => exercise.family)).size).toBe(1);
  });
});
