import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import { buildAuthoredMathProbeFamilies } from './authored-math-probes';
import { buildArithmeticProbeFamilies } from './authored-arithmetic-probes';
import { buildNumberProbeFamilies } from './authored-number-probes';
import { buildSpatialProbeFamilies } from './authored-spatial-probes';
import { buildSecondGradeProbeFamilies } from './authored-second-grade-probes';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildSecondGradeProbeFamilies();
const tasks = (name: string) => families.find(family => family.family === name)!.exercises;
const numbers = (text: string) => text.match(/\d+/g)!.map(Number);
const entries = (answer: unknown): Record<string, number> => Object.fromEntries((answer as Array<{ key: string; value: string }>).map(row => [row.key, Number(row.value)]));
const dots = (text: string) => (text.match(/●/g) ?? []).length;

describe('second-grade unit, operation and application contrasts', () => {
  it('keeps the complete 4426-task baseline and adds 288 distinct tasks on six points', () => {
    const priorAuthored = new Set([...buildAuthoredMathProbeFamilies(), ...buildArithmeticProbeFamilies(), ...buildNumberProbeFamilies(), ...buildSpatialProbeFamilies()]
      .flatMap(family => family.exercises.map(task => foundationQuestionId(family.atomId, task))));
    const prior = buildFoundationCurriculum().flatMap(definition => definition.exercises.map(exercise => ({ atomId: definition.atom.id,
      id: foundationQuestionId(definition.atom.id, exercise), exercise }))).filter(row => row.exercise.identityVersion !== 2 || priorAuthored.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(prior).toHaveLength(4426); expect(createHash('sha256').update(JSON.stringify(prior)).digest('hex')).toBe('321f2f0eeee1995979db232b24a6d6e29e71c041517dac0b7b3ba7866a02da47');
    expect(families).toHaveLength(24); expect(new Set(families.map(row => row.atomId)).size).toBe(6);
    const ids = families.flatMap(family => family.exercises.map(task => foundationQuestionId(family.atomId, task)));
    expect(ids).toHaveLength(288); expect(new Set(ids).size).toBe(288);
    const semantic = families.flatMap(family => family.exercises.map(task => JSON.stringify({ atomId: family.atomId, stem: task.stem,
      blocks: task.blocks, responseShape: task.responseShape })));
    expect(new Set(semantic).size).toBe(288);
  });

  it('checks the actual sums, both place units, physical packaging and capacity inequalities', () => {
    for (const task of tasks('carry-quantity-conservation')) {
      const [a, b, tens, ones] = numbers(task.stem); expect(task.answer).toBe(a + b === tens * 10 + ones);
    }
    for (const task of tasks('carry-column')) {
      const [a, b] = numbers(task.stem), value = entries(task.answer), units = a % 10 + b % 10;
      expect(value).toEqual({ ones: units, carry: Math.floor(units / 10), tens: Math.floor(a / 10) + Math.floor(b / 10) + Math.floor(units / 10), total: a + b });
      expect(value.carry).toBe(1); expect(a + b).toBeLessThan(100);
    }
    for (const task of tasks('carry-packaged-merge')) {
      const total = task.blocks![0].rows!.reduce((sum, [, packs, loose]) => sum + Number(packs) * 10 + Number(loose), 0), value = entries(task.answer);
      expect(value.bundles * 10 + value.loose).toBe(total); expect(value.loose).toBeLessThan(10);
    }
    for (const task of tasks('carry-capacity-decision')) {
      const [current, waiting, limit] = task.blocks![0].rows!.map(([, amount]) => Number(amount)); expect(task.answer).toBe(current + waiting > limit);
    }
  });

  it('reconstructs subtraction states and preserves the quantity removed from real packaging', () => {
    for (const task of tasks('borrow-value-conservation')) {
      const [original, , , tens, ones] = numbers(task.stem); expect(task.answer).toBe(tens * 10 + ones === original);
    }
    const onesResults = new Set<number>();
    for (const task of tasks('borrow-column')) {
      const [a, b] = numbers(task.stem), value = entries(task.answer);
      expect(a % 10).toBeLessThan(b % 10); expect(value.tensAfterBorrow * 10 + (a % 10 + 10)).toBe(a);
      expect(value.onesDifference).toBe(a % 10 + 10 - b % 10); expect(value.total).toBe(a - b); onesResults.add(value.onesDifference);
    }
    expect(onesResults.size).toBeGreaterThan(3);
    for (const task of tasks('borrow-packaged-removal')) {
      const [before, removed] = task.blocks![0].rows!.map(([, bundles, loose]) => Number(bundles) * 10 + Number(loose)), value = entries(task.answer);
      expect(value.bundles * 10 + value.loose).toBe(before - removed); expect(value.loose).toBeGreaterThanOrEqual(0); expect(value.loose).toBeLessThan(10);
    }
  });

  it('finds the first invalid step independently even when later calculations follow the erroneous state', () => {
    const firstErrors = new Set<string>();
    for (const task of tasks('borrow-first-invalid-step')) {
      const rows = task.blocks![0].rows!, [tens, ones, nextTens, nextOnes] = numbers(rows[0][1]);
      const valid = [tens * 10 + ones === nextTens * 10 + nextOnes && nextTens === tens - 1 && nextOnes === ones + 10,
        ...rows.slice(1).map(([, operation]) => { const [a, b, result] = numbers(operation); return a - b === result; })];
      const first = rows[valid.indexOf(false)][0]; expect(task.answer).toBe(first); firstErrors.add(first);
      if (first === rows[0][0]) expect(valid.slice(1)).toEqual([true, true]);
    }
    expect(firstErrors).toEqual(new Set(['换单位', '减个位', '减十位']));
  });

  it('substitutes candidate factors, restores masked rows and simulates jumps from nonzero origins', () => {
    for (const task of tasks('missing-factor-candidate-check')) {
      const [factor, product, candidate] = numbers(task.stem); expect(task.answer).toBe(factor * candidate === product);
    }
    for (const task of tasks('missing-factor-equation')) {
      const [factor, product] = numbers(task.stem), value = entries(task.answer); expect(factor * value.factor).toBe(product); expect(value.check).toBe(product);
    }
    for (const task of tasks('missing-factor-hidden-array')) {
      const total = Number(task.stem.match(/共有(\d+)个点/)![1]); expect(Number(task.answer) * task.blocks![0].rows!.length).toBe(total);
      expect(task.blocks![0].rows!.every(([, content]) => content === '整行已遮住')).toBe(true);
    }
    for (const task of tasks('missing-factor-equal-jumps')) {
      const [start, length, end] = numbers(task.stem); let position = start, jumps = 0;
      while (position < end && jumps < 100) { position += length; jumps++; }
      expect(position).toBe(end); expect(task.answer).toBe(jumps); expect(start).toBeGreaterThan(0);
    }
  });

  it('checks comparison units from actual dots and changes the reference without changing the target quantity', () => {
    for (const task of tasks('multiple-reference-audit')) {
      const [base, bigger, claim] = numbers(task.stem); expect(task.answer).toBe(base * claim === bigger);
    }
    for (const task of tasks('multiple-groups')) {
      const [bigger, base] = numbers(task.stem), value = entries(task.answer); expect(value.unit).toBe(base); expect(value.unit * value.groups).toBe(bigger);
    }
    for (const task of tasks('multiple-unmarked-strips')) {
      const [upper, lower] = task.blocks![0].rows!.map(([, row]) => dots(row)); expect(Number(task.answer) * upper).toBe(lower);
      expect(task.blocks![0].rows![1][1]).not.toContain('|');
    }
    for (const task of tasks('multiple-changed-reference')) {
      const [a, b, c] = task.blocks![0].rows!.map(([, quantity]) => Number(quantity)), value = entries(task.answer);
      expect(value.toA * a).toBe(c); expect(value.toB * b).toBe(c); expect(value.toA).not.toBe(value.toB);
    }
  });

  it('preserves length units in normalization, measures endpoint differences and combines all four components', () => {
    for (const task of tasks('length-unit-conservation')) {
      const [meters, cm, claimed] = numbers(task.stem); expect(task.answer).toBe(meters * 100 + cm === claimed);
    }
    for (const task of tasks('length-normalized-record')) {
      const [meters, cm] = numbers(task.stem), value = entries(task.answer); expect(value.meters * 100 + value.cm).toBe(meters * 100 + cm); expect(value.cm).toBeLessThan(100);
    }
    for (const task of tasks('length-shifted-ruler-selection')) {
      const meters = Number(task.stem.match(/长(\d+)米/)![1]);
      expect(task.blocks![0].rows!.filter(([, a, b]) => Number(b) - Number(a) === meters * 100).map(([label]) => label)).toEqual([task.answer]);
      expect(task.blocks![0].rows!.every(([, start]) => Number(start) > 0)).toBe(true);
    }
    for (const task of tasks('length-composite-inventory')) {
      const total = task.blocks![0].rows!.reduce((sum, [, meters, cm]) => sum + Number(meters) * 100 + Number(cm), 0); expect(task.answer).toBe(total);
    }
  });

  it('preserves the 60-minute unit, records both normalized parts and compares actual budgets', () => {
    for (const task of tasks('time-unit-conservation')) {
      const [hours, minutes] = numbers(task.stem); expect(task.answer).toBe(hours * 60 === minutes);
    }
    for (const task of tasks('time-normalized-record')) {
      const [hours, minutes] = numbers(task.stem), value = entries(task.answer); expect(value.hours * 60 + value.minutes).toBe(hours * 60 + minutes); expect(value.minutes).toBeLessThan(60);
    }
    for (const task of tasks('time-consecutive-whole-blocks')) {
      expect(task.answer).toBe(task.blocks![0].rows!.reduce((total, [, hours]) => total + Number(hours) * 60, 0)); expect(task.stem).toContain('没有重叠');
    }
    const conditions = new Map<number, Set<boolean>>();
    for (const task of tasks('time-mixed-unit-budget')) {
      const [required, hours] = numbers(task.stem); expect(task.answer).toBe(required <= hours * 60);
      if (!conditions.has(hours)) conditions.set(hours, new Set()); conditions.get(hours)!.add(task.answer as boolean);
    }
    expect(conditions.size).toBe(6); for (const outcomes of conditions.values()) expect(outcomes.size).toBe(2);
  });

  it('validates every response and scores every correct answer and every legal choice distractor', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema: QuestionAnswerSchema = { questionId: foundationQuestionId(family.atomId, task), mode: task.mode ?? 'numeric_blank',
        responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) };
      const envelope = (value: unknown) => ({ questionId: schema.questionId, mode: schema.mode, response: schema.mode === 'multi_blank' ? { entries: value } : { value } });
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, envelope(task.answer))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(task.answer)).score, task.stem).toBe(1);
      const wrong = schema.mode === 'single_choice' ? task.options!.filter(option => option !== task.answer) : [schema.mode === 'boolean' ? !task.answer :
        schema.mode === 'multi_blank' ? (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: String(Number(row.value) + 1) })) : Number(task.answer) + 1];
      for (const value of wrong) { expect(answerProtocolIssue(schema, envelope(value))).toBeNull(); expect(gradeResponse(schema, task.answer, envelope(value)).score, task.stem).toBe(0); }
      expect(task.analysis!.length).toBeGreaterThan(15);
    }
  });

  it('keeps existing relations in the same four families across intermediate recording widgets', () => {
    const definitions = buildFoundationCurriculum(), retained = ['carry-column', 'borrow-column', 'missing-factor-equation', 'multiple-groups'];
    for (const family of families.filter(row => retained.includes(row.family))) {
      expect(family.distinction).toMatch(/沿用|保留/);
      expect(definitions.find(row => row.atom.id === family.atomId)!.exercises.some(task => task.family === family.family && task.identityVersion !== 2)).toBe(true);
    }
    expect(families.filter(row => retained.includes(row.family))).toHaveLength(4);
  });

  it('retains a wrong intermediate observation even when the final answer is correct', () => {
    for (const [family, key] of [['carry-column', 'tens'], ['borrow-column', 'tensAfterBorrow'],
      ['multiple-changed-reference', 'toB'], ['time-normalized-record', 'hours']]) {
      const task = tasks(family)[0], answer = task.answer as Array<{ key: string; value: string }>;
      const schema: QuestionAnswerSchema = { questionId: 'mixed-evidence', mode: 'multi_blank', responseShape: task.responseShape!, validationRules: {}, gradingConfig: {} };
      const submitted = answer.map(row => row.key === key ? { ...row, value: String(Number(row.value) + 1) } : { ...row });
      const graded = gradeResponse(schema, answer, submitted);
      expect(graded.score).toBeCloseTo((answer.length - 1) / answer.length, 8);
      expect(graded.scoreDetails?.filter(row => row.score === 0).map(row => row.key)).toEqual([key]);
      expect(graded.scoreDetails?.find(row => row.key === 'total')?.score ?? 1).toBe(1);
      expect(graded.scoreDetails?.every(row => row.origin === 'protocol')).toBe(true);
    }
  });

  it('arranges four genuinely distinct basic/transfer structures for each point', () => {
    for (const definition of buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id))) {
      const spec = verificationBlueprint({ id: 'qa', title: '对照', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id,
        atomId: definition.atom.id, family: task.family, dimension: task.dimension, difficulty: 1, expectedSeconds: 40 } as MeasurementItem; });
      const selection = selectVerificationItems(spec, items, new Set([definition.atom.id]), 'qa', 8, 600);
      expect(selection.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(selection.selected.map(row => row.family)).size).toBe(4);
      expect(selection.verification.groups.every(group => group.selectedFamilies.length === 2)).toBe(true);
    }
  });
});
