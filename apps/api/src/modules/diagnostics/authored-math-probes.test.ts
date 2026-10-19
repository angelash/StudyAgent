import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DiagnosticHypothesis, KnowledgeAtom, MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import { buildAuthoredMathProbeFamilies } from './authored-math-probes';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { arithmeticValue } from './arithmetic-expression';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildAuthoredMathProbeFamilies(), all = families.flatMap(family => family.exercises.map(exercise => ({ ...family, exercise })));
const values = (answer: unknown) => Object.fromEntries((answer as Array<{ key: string; value: string }>).map(entry => [entry.key, Number(entry.value)]));
const forFamily = (family: string) => families.find(row => row.family === family)!.exercises;
const options = (id: string) => forFamily(id).map(exercise => ({ exercise, numbers: exercise.stem.match(/\d+/g)!.map(Number) }));

describe('authored math task structures and independently checked responses', () => {
  it('adds sixteen described task structures and twelve distinct questions per structure', () => {
    expect(families).toHaveLength(16); expect(all).toHaveLength(192);
    expect(new Set(families.map(row => row.atomId)).size).toBe(4);
    const ids = new Set<string>();
    for (const family of families) {
      expect(family.behavior.trim()).not.toBe(''); expect(family.structure).toContain('→'); expect(family.distinction.trim()).not.toBe('');
      expect(family.exercises).toHaveLength(12);
      for (const exercise of family.exercises) {
        const id = foundationQuestionId(family.atomId, exercise); expect(ids.has(id), exercise.stem).toBe(false); ids.add(id);
        expect(exercise.analysis!.length).toBeGreaterThan(15); expect(exercise.dimension).toBe(family.dimension); expect(exercise.family).toBe(family.family);
      }
    }
  });

  it('preserves every original question, answer, family, dimension and interaction', () => {
    const added = new Set(all.map(row => foundationQuestionId(row.atomId, row.exercise)));
    const original = buildFoundationCurriculum().flatMap(definition => definition.exercises.map(exercise => ({ atomId: definition.atom.id,
      id: foundationQuestionId(definition.atom.id, exercise), exercise }))).filter(row => !added.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(original).toHaveLength(3435);
    // Frozen from the ce2dccc candidate before adding probes; this detects silent historical edits.
    expect(createHash('sha256').update(JSON.stringify(original)).digest('hex')).toBe('73b575389c4d309d4a6876337fd583b2e17b3c621d8aa6223393efc4e37efdb9');
  });

  it('distinguishes new documents and options with the same prompt and key without changing legacy IDs', () => {
    const exercise = forFamily('borrow-decision-loose-pieces')[0], id = foundationQuestionId('atom', exercise);
    const changed = structuredClone(exercise); changed.blocks![0].rows![1][1] = '9根';
    expect(foundationQuestionId('atom', changed)).not.toBe(id);
    expect(foundationQuestionId('atom', { ...exercise, options: [...exercise.options!, '暂不能判断'] })).not.toBe(id);
    expect(foundationQuestionId('atom', { ...exercise, analysis: '仅完善讲解，不改变作答任务' })).toBe(id);
    const legacy = { ...exercise, identityVersion: undefined };
    expect(foundationQuestionId('atom', legacy)).toBe(foundationQuestionId('atom', { ...legacy, blocks: changed.blocks }));
  });

  it('checks place-value conservation, inverse stock records and digit-position tracking', () => {
    for (const { exercise, numbers: [bundles, size, loose] } of options('placevalue-regroup-units')) expect(exercise.answer).toBe(bundles * size + loose);
    for (const { exercise, numbers: [tens, ones, stated] } of options('placevalue-conservation-check')) expect(exercise.answer).toBe(tens * 10 + ones === stated);
    for (const exercise of forFamily('placevalue-inventory-inverse')) {
      const total = Number(exercise.stem.match(/共有(\d+)张/)![1]), loose = Number(exercise.blocks![0].rows![1][1]);
      expect(exercise.answer).toBe((total - loose) / 10);
    }
    for (const { exercise, numbers: [, , first, second, card] } of options('placevalue-permutation-tracking')) {
      expect(String(first)[0]).toBe(String(card)); expect(String(second)[1]).toBe(String(card));
      expect(exercise.answer).toBe(`从${card * 10}变成${card}`);
    }
  });

  it('checks borrowing constraints against exhaustive digit possibilities and physical inventories', () => {
    for (const exercise of forFamily('borrow-decision-construct-condition')) {
      const sub = Number(exercise.stem.match(/−(\d+)/)![1]), valid = Array.from({ length: 10 }, (_, digit) => digit).filter(digit => digit < sub % 10);
      expect(exercise.answer).toBe(Math.max(...valid)); expect(valid).not.toHaveLength(0);
    }
    for (const exercise of forFamily('borrow-decision-loose-pieces')) {
      const need = Number(exercise.stem.match(/拿出(\d+)根/)![1]), loose = Number(exercise.blocks![0].rows![1][1].replace('根', ''));
      expect(exercise.answer).toBe(need > loose ? '必须拆一捆' : '不用拆捆');
    }
    for (const exercise of forFamily('borrow-decision-rule-audit')) {
      const [, a, b, c, d] = exercise.stem.match(/比较(\d+)−(\d+)与(\d+)−(\d+)/)!.map(Number);
      expect(a > b && c > d).toBe(true); expect(a % 10 < b % 10).toBe(true); expect(c % 10 >= d % 10).toBe(true);
    }
    for (const exercise of forFamily('borrow-decision-work-check')) {
      const [, a, b] = exercise.stem.match(/看(\d+)−(\d+)/)!.map(Number);
      expect(Math.floor(a / 10) > Math.floor(b / 10)).toBe(true); expect(a % 10 < b % 10).toBe(true);
      expect(exercise.answer).toContain(`比较${a % 10}和${b % 10}`);
    }
  });

  it('checks both exchange positions, inverse changes and the value of every equivalent expression', () => {
    for (const exercise of forFamily('borrow-exchange-balanced-parts')) {
      const [tens, ones] = exercise.stem.match(/\d+/g)!.map(Number), result = values(exercise.answer);
      expect(result.tens * 10 + result.ones).toBe(tens * 10 + ones); expect(result.tens).toBe(tens - 1); expect(result.ones).toBe(ones + 10);
    }
    for (const exercise of forFamily('borrow-exchange-reverse-representation')) {
      const [, tensText, onesText] = exercise.stem.match(/换后为(\d+)个十和(\d+)个一/)!, tens = Number(tensText), ones = Number(onesText), result = values(exercise.answer);
      expect(result.tens * 10 + result.ones).toBe(tens * 10 + ones); expect(result.ones).toBeLessThan(10); expect(result.tens).toBe(tens + 1);
    }
    for (const exercise of forFamily('borrow-exchange-conservation-audit')) {
      const [tens, ones] = exercise.stem.match(/\d+/g)!.map(Number);
      const conserving = exercise.options!.filter(option => { const [t, u] = option.match(/\d+/g)!.map(Number); return t * 10 + u === tens * 10 + ones; });
      expect(conserving).toEqual([exercise.answer]);
    }
    for (const exercise of forFamily('borrow-exchange-subtraction-equivalence')) {
      const [, a, b] = exercise.stem.match(/计算(\d+)−(\d+)/)!.map(Number);
      expect(exercise.options!.filter(option => arithmeticValue(option.replaceAll('−', '-')) === a - b)).toEqual([exercise.answer]);
    }
  });

  it('checks multiplication partials, spatial totals and rejects each incomplete quantity model', () => {
    for (const exercise of forFamily('multiply-digits-tens-contribution')) {
      const [, a, b] = exercise.stem.match(/把(\d+)×(\d+)/)!.map(Number); expect(exercise.answer).toBe((a - a % 10) * b);
    }
    for (const exercise of forFamily('multiply-digits-linked-partial-products')) {
      const [, a, b] = exercise.stem.match(/计算(\d+)×(\d+)/)!.map(Number), result = values(exercise.answer);
      expect(result.total).toBe(a * b); expect(result.tensProduct + result.onesProduct).toBe(result.total);
      expect(result.tensProduct % 10).toBe(0); expect(result.onesProduct).toBe(a % 10 * b);
    }
    for (const exercise of forFamily('multiply-digits-split-array')) {
      const cells = exercise.blocks![0].rows!, total = cells.reduce((sum, [, width, rows]) => sum + Number(width) * Number(rows), 0);
      expect(exercise.answer).toBe(total);
    }
    for (const exercise of forFamily('multiply-digits-group-model-selection')) {
      const [bags, perBag, loose, groups] = exercise.stem.match(/\d+/g)!.map(Number), total = (bags * perBag + loose) * groups;
      expect(exercise.options!.filter(option => arithmeticValue(option) === total)).toEqual([exercise.answer]);
    }
  });

  it('uses complete supported protocols and rejects plausible wrong responses', () => {
    for (const { atomId, exercise } of all) {
      const schema: QuestionAnswerSchema = { questionId: foundationQuestionId(atomId, exercise), mode: exercise.mode ?? 'numeric_blank',
        responseShape: exercise.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: exercise.options?.map(value => ({ id: value, label: value, value })) };
      expect(answerInputConfiguration(schema).supported).toBe(true);
      expect(gradeResponse(schema, exercise.answer, exercise.answer).score, exercise.stem).toBe(1);
      const wrong = schema.mode === 'single_choice' ? exercise.options!.find(option => option !== exercise.answer)! : schema.mode === 'boolean' ? !exercise.answer :
        schema.mode === 'multi_blank' ? (exercise.answer as Array<{ key: string; value: string }>).map(entry => ({ ...entry, value: String(Number(entry.value) + 1) })) : Number(exercise.answer) + 1;
      expect(gradeResponse(schema, exercise.answer, wrong).score, exercise.stem).toBe(0);
    }
  });

  it('genuinely fills the four required basic/transfer observations using published task families', () => {
    for (const definition of buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id))) {
      const spec = verificationBlueprint({ id: 'qa', title: '对照核查', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis,
        definition.atom as KnowledgeAtom, 'qa');
      const rows = definition.exercises.map(exercise => { const id = foundationQuestionId(definition.atom.id, exercise); return {
        id, questionId: id, atomId: definition.atom.id, dimension: exercise.dimension, family: exercise.family,
        difficulty: 1, expectedSeconds: 40 } as MeasurementItem; });
      const result = selectVerificationItems(spec, rows, new Set([definition.atom.id]), 'qa', 8, 600);
      expect(result.verification.fullyCovered, definition.atom.id).toBe(true); expect(result.selected).toHaveLength(4);
      expect(new Set(result.selected.map(row => row.family)).size).toBe(4);
    }
  });
});
