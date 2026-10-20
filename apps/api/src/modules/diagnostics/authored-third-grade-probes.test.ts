import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import { buildAuthoredMathProbeFamilies } from './authored-math-probes';
import { buildArithmeticProbeFamilies } from './authored-arithmetic-probes';
import { buildNumberProbeFamilies } from './authored-number-probes';
import { buildSpatialProbeFamilies } from './authored-spatial-probes';
import { buildSecondGradeProbeFamilies } from './authored-second-grade-probes';
import { buildDataProbeFamilies } from './authored-data-probes';
import { buildThirdGradeProbeFamilies } from './authored-third-grade-probes';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildThirdGradeProbeFamilies();
const tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const numbers = (value: string) => value.match(/\d+/g)!.map(Number);
const entries = (value: unknown): Record<string, string> => Object.fromEntries((value as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
const valueOf = (row: string[]) => Number(row[1]) * 100 + Number(row[2]) * 10 + Number(row[3]);
const digits = ['千位', '百位', '十位', '个位'];
const firstDifferent = (a: number, b: number) => digits[[...String(a)].findIndex((digit, index) => digit !== String(b)[index])];
const divideByGrouping = (total: number, size: number) => {
  let quotient = 0, remainder = total;
  while (remainder >= size) { quotient++; remainder -= size; }
  return { quotient, remainder };
};

describe('third-grade place units, grouping and operation contrasts', () => {
  it('keeps all 4892 prior tasks verbatim and adds only 306 genuinely distinct observations', () => {
    const priorAuthored = new Set([...buildAuthoredMathProbeFamilies(), ...buildArithmeticProbeFamilies(), ...buildNumberProbeFamilies(),
      ...buildSpatialProbeFamilies(), ...buildSecondGradeProbeFamilies(), ...buildDataProbeFamilies()]
      .flatMap(family => family.exercises.map(task => foundationQuestionId(family.atomId, task))));
    const prior = buildFoundationCurriculum().flatMap(definition => definition.exercises.map(exercise => ({ atomId: definition.atom.id,
      id: foundationQuestionId(definition.atom.id, exercise), exercise }))).filter(row => row.exercise.identityVersion !== 2 || priorAuthored.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(prior).toHaveLength(4892); expect(createHash('sha256').update(JSON.stringify(prior)).digest('hex')).toBe('0815f7db52b6c9de2aa7b1a3ff886a3f7bba0e984aefd392cdecfdba1fedf36f');
    expect(families).toHaveLength(25); expect(new Set(families.map(row => row.atomId)).size).toBe(6);
    const ids = families.flatMap(family => family.exercises.map(task => foundationQuestionId(family.atomId, task)));
    expect(ids).toHaveLength(306); expect(new Set(ids).size).toBe(306);
    const semantic = (atomId: string, task: typeof families[number]['exercises'][number]) => JSON.stringify({ atomId, stem: task.stem,
      blocks: task.blocks, responseShape: task.responseShape });
    const previousTasks = new Set(prior.map(row => semantic(row.atomId, row.exercise)));
    const additions = families.flatMap(family => family.exercises.map(task => semantic(family.atomId, task)));
    expect(new Set(additions).size).toBe(306); expect(additions.some(value => previousTasks.has(value))).toBe(false);
    expect(tasks('mass-simple')).toHaveLength(6);
  });

  it('compares actual digits from the highest differing place and uses both whole and loose inventory parts', () => {
    const positions = new Set<string>(), chosenSides = new Set<number>();
    for (const task of tasks('large-first-difference-audit')) {
      const [a, b] = numbers(task.stem), claim = task.stem.match(/数位是(.+)”/)![1];
      expect(task.answer).toBe(firstDifferent(a, b) === claim);
    }
    for (const task of tasks('large-compare-symbol')) {
      const [a, b] = numbers(task.stem), actual = entries(task.answer), place = firstDifferent(a, b);
      expect(actual).toEqual({ place, larger: String(Math.max(a, b)) }); positions.add(place); chosenSides.add(a > b ? 0 : 1);
      expect(a).toBeGreaterThanOrEqual(1000); expect(Math.max(a, b)).toBeLessThan(10000);
    }
    expect(positions.size).toBe(4); expect(chosenSides.size).toBe(2);
    for (const task of tasks('large-split-inventory-compare')) {
      const values = task.blocks![0].rows!.map(([, boxes, loose]) => Number(boxes) * 1000 + Number(loose)); expect(task.answer).toBe(Math.max(...values));
    }
  });

  it('applies both inclusive quantity bounds, including exact lower and upper endpoints', () => {
    let atLower = 0, atUpper = 0;
    for (const task of tasks('large-two-bound-eligibility')) {
      const [low, high] = numbers(task.stem), candidates = task.blocks![0].rows!.filter(([, quantity]) => Number(quantity) >= low && Number(quantity) <= high);
      expect(candidates.map(([label]) => label)).toEqual([task.answer]);
      if (Number(candidates[0][1]) === low) atLower++; if (Number(candidates[0][1]) === high) atUpper++;
    }
    expect(atLower).toBe(4); expect(atUpper).toBe(4);
  });

  it('reconstructs continuous carries, all intermediate columns and the three physical packaging units', () => {
    for (const task of tasks('three-digit-carry-conservation')) {
      const [a, b, h, t, u] = numbers(task.stem); expect(task.answer).toBe(a + b === h * 100 + t * 10 + u);
    }
    for (const task of tasks('three-digit-add')) {
      const [a, b] = numbers(task.stem), actual = entries(task.answer), ones = a % 10 + b % 10, carry1 = Math.floor(ones / 10);
      const tens = Math.floor(a / 10) % 10 + Math.floor(b / 10) % 10 + carry1;
      expect(actual).toEqual({ onesSum: String(ones), toTens: String(carry1), tensSum: String(tens), toHundreds: String(Math.floor(tens / 10)), total: String(a + b) });
      expect(carry1).toBe(1); expect(Math.floor(tens / 10)).toBe(1); expect(a + b).toBeLessThan(1000);
    }
    for (const task of tasks('three-digit-packaged-merge')) {
      const total = task.blocks![0].rows!.reduce((sum, row) => sum + valueOf(row), 0), actual = entries(task.answer);
      expect(Number(actual.hundreds) * 100 + Number(actual.tens) * 10 + Number(actual.ones)).toBe(total);
      expect(Number(actual.tens)).toBeLessThan(10); expect(Number(actual.ones)).toBeLessThan(10);
    }
  });

  it('finds the first bad carry calculation while allowing later rows to follow the recorded state', () => {
    const seen = new Set<string>();
    for (const task of tasks('three-digit-first-carry-error')) {
      const rows = task.blocks![0].rows!, valid = rows.map((row, i) => {
        const [left, right] = row[1].split('='), values = numbers(left), result = Number(right);
        if (i > 0) expect(values.at(-1)).toBe(Number(rows[i - 1][3]));
        if (i < 2) { expect(Number(row[2])).toBe(result % 10); expect(Number(row[3])).toBe(Math.floor(result / 10)); }
        return values.reduce((sum, value) => sum + value, 0) === result;
      });
      const first = valid.indexOf(false); expect(task.answer).toBe(rows[first][0]); seen.add(rows[first][0]);
      expect(valid.filter(value => !value)).toHaveLength(1);
    }
    expect(seen.size).toBe(3);
  });

  it('preserves the original quantity through zero-tens borrowing and physical unpacking', () => {
    for (const task of tasks('three-digit-borrow-conservation')) {
      const [a, h, t, u] = numbers(task.stem); expect(task.answer).toBe(a === h * 100 + t * 10 + u);
    }
    const differences = new Set<number>();
    for (const task of tasks('three-digit-subtract')) {
      const [a, b] = numbers(task.stem), actual = entries(task.answer);
      expect(Math.floor(a / 10) % 10).toBe(0); expect(a % 10).toBeLessThan(b % 10);
      expect(Number(actual.hundreds) * 100 + Number(actual.tens) * 10 + Number(actual.ones)).toBe(a);
      expect(Number(actual.total)).toBe(a - b); expect(Number(actual.tens)).toBe(9); differences.add((a - b) % 10);
    }
    expect(differences.size).toBeGreaterThan(3);
    for (const task of tasks('three-digit-packaged-removal')) {
      const [before, removal] = task.blocks![0].rows!.map(valueOf), actual = entries(task.answer);
      expect(Number(actual.hundreds) * 100 + Number(actual.tens) * 10 + Number(actual.ones)).toBe(before - removal);
      for (const key of ['tens', 'ones']) { expect(Number(actual[key])).toBeGreaterThanOrEqual(0); expect(Number(actual[key])).toBeLessThan(10); }
    }
  });

  it('locates the first broken equality in the borrow-state chain using the actual recorded quantities', () => {
    const seen = new Set<string>();
    for (const task of tasks('three-digit-first-borrow-error')) {
      const [a, b] = numbers(task.stem), rows = task.blocks![0].rows!, state = rows.slice(0, 2).map(([, record]) => {
        const [h, t, u] = numbers(record); return h * 100 + t * 10 + u;
      });
      const [left, subtrahend, result] = numbers(rows[2][1]); expect(left).toBe(state[1]); expect(subtrahend).toBe(b);
      const valid = [state[0] === a, state[1] === state[0], left - subtrahend === result];
      const first = valid.indexOf(false); expect(task.answer).toBe(rows[first][0]); seen.add(rows[first][0]);
      expect(valid.filter(value => !value)).toHaveLength(1);
    }
    expect(seen.size).toBe(3);
  });

  it('checks both remainder constraints, repeated subtraction and counts actual complete and partial dot rows', () => {
    let reconstructsButNotFinished = 0, wrongTotal = 0;
    for (const task of tasks('remainder-complete-claim')) {
      const [total, size, quotient, remainder] = numbers(task.stem), rebuilds = quotient * size + remainder === total;
      expect(task.answer).toBe(rebuilds && remainder >= 0 && remainder < size);
      if (rebuilds && remainder >= size) reconstructsButNotFinished++; if (!rebuilds) wrongTotal++;
    }
    expect(reconstructsButNotFinished).toBe(3); expect(wrongTotal).toBe(3);
    for (const task of tasks('remainder-expression')) {
      const [total, size] = numbers(task.stem), actual = entries(task.answer), expected = divideByGrouping(total, size);
      expect(actual).toEqual({ quotient: String(expected.quotient), remainder: String(expected.remainder) });
    }
    for (const task of tasks('remainder-actual-rows')) {
      const size = numbers(task.stem)[0], counts = task.blocks![0].rows!.map(([, dots]) => (dots.match(/●/g) ?? []).length);
      const full = counts.filter(count => count === size), partial = counts.filter(count => count < size);
      expect(partial).toHaveLength(1); expect(entries(task.answer)).toEqual({ fullRows: String(full.length), loose: String(partial[0]) });
    }
  });

  it('changes container decisions when the same grouping conditions require every object to be stored', () => {
    const answers = new Map<string, Set<number>>();
    for (const task of tasks('remainder-completion-constraint')) {
      const [total, size] = numbers(task.stem), grouped = divideByGrouping(total, size), all = task.stem.includes('全部棋子');
      expect(grouped.remainder).toBeGreaterThan(0); expect(task.answer).toBe(grouped.quotient + Number(all));
      const key = `${total}/${size}`; if (!answers.has(key)) answers.set(key, new Set()); answers.get(key)!.add(Number(task.answer));
    }
    expect(answers.size).toBe(6); for (const values of answers.values()) expect(values.size).toBe(2);
  });

  it('checks both multiplicative operators before adding without extending their scope to the outside number', () => {
    const operators = new Set<string>();
    for (const task of tasks('mixed-precedence-record-audit')) {
      const [, a, b, op, c, claim] = task.stem.match(/“(\d+)\+(\d+)([×÷])(\d+)=(\d+)”/)!;
      const correct = Number(a) + (op === '×' ? Number(b) * Number(c) : Number(b) / Number(c));
      expect(task.answer).toBe(correct === Number(claim)); operators.add(op);
    }
    expect(operators.size).toBe(2);
    for (const name of ['product-before-add-start', 'division-before-additive']) for (const task of tasks(name)) {
      const [a, b, c] = numbers(task.stem), first = name.startsWith('product') ? b * c : b / c;
      expect(entries(task.answer)).toEqual({ first: String(first), total: String(a + first) });
    }
  });

  it('keeps once-per-order fees outside repetition and converts loose objects into groups before summing', () => {
    for (const task of tasks('mixed-repeated-price-and-fee')) {
      const [price, fee] = task.blocks![0].rows!, each = Number(price[1]), count = numbers(price[2])[0];
      expect(task.answer).toBe(each * count + Number(fee[1])); expect(fee[2]).toBe('只收一次');
    }
    for (const task of tasks('mixed-group-summary')) {
      const [existing, loose, size] = numbers(task.stem), grouped = divideByGrouping(loose, size);
      expect(grouped.remainder).toBe(0); expect(task.answer).toBe(existing + grouped.quotient);
    }
  });

  it('conserves mass through 1000-rate labels, comparison and normalization of one to three whole kilograms', () => {
    for (const task of tasks('mass-unit-conservation')) {
      const [kg, grams, claimed] = numbers(task.stem); expect(task.answer).toBe(kg * 1000 + grams === claimed);
    }
    for (const task of tasks('mass-simple')) expect(task.answer).toBe(numbers(task.stem)[0] * 1000);
    for (const task of tasks('mass-mixed-label-compare')) {
      const rows = task.blocks![0].rows!, [kg, grams] = numbers(rows[0][1]), other = numbers(rows[1][1])[0];
      expect(task.answer).toBe(kg * 1000 + grams > other ? rows[0][0] : rows[1][0]);
    }
    const exchanges = new Set<number>();
    for (const task of tasks('mass-label-normalization')) {
      const [kg, grams] = numbers(task.stem), actual = entries(task.answer), normalizedKg = Number(actual.kg), normalizedGrams = Number(actual.grams);
      expect(normalizedKg * 1000 + normalizedGrams).toBe(kg * 1000 + grams); expect(normalizedGrams).toBeLessThan(1000);
      expect(normalizedGrams).toBeGreaterThanOrEqual(0); expect(kg * 1000 + grams).toBeLessThan(10000); exchanges.add(normalizedKg - kg);
    }
    expect(exchanges).toEqual(new Set([1, 2, 3]));
  });

  it('validates all standard responses and every legal distractor using the real protocol and grading', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema: QuestionAnswerSchema = { questionId: foundationQuestionId(family.atomId, task), mode: task.mode ?? 'numeric_blank',
        responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) };
      const envelope = (value: unknown) => ({ questionId: schema.questionId, mode: schema.mode, response: schema.mode === 'multi_blank' ? { entries: value } : { value } });
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, envelope(task.answer))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(task.answer)).score, task.stem).toBe(1);
      const wrong = schema.mode === 'single_choice' ? task.options!.filter(option => option !== task.answer) : [schema.mode === 'boolean' ? !task.answer :
        schema.mode === 'multi_blank' ? (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row,
          value: Number.isFinite(Number(row.value)) ? String(Number(row.value) + 1) : 'QA未达标' })) : Number(task.answer) + 1];
      for (const value of wrong) { expect(answerProtocolIssue(schema, envelope(value))).toBeNull(); expect(gradeResponse(schema, task.answer, envelope(value)).score, task.stem).toBe(0); }
      expect(task.analysis!.length).toBeGreaterThan(15);
    }
  });

  it('keeps the six established families and preserves wrong intermediate observations when the final result is right', () => {
    const definitions = buildFoundationCurriculum(), retained = ['large-compare-symbol', 'three-digit-add', 'three-digit-subtract', 'remainder-expression', 'product-before-add-start', 'mass-simple'];
    for (const family of families.filter(row => retained.includes(row.family))) {
      expect(family.distinction).toMatch(/沿用|保留/);
      expect(definitions.find(row => row.atom.id === family.atomId)!.exercises.some(task => task.family === family.family && task.identityVersion !== 2)).toBe(true);
    }
    expect(families.filter(row => retained.includes(row.family))).toHaveLength(6);
    for (const [name, key] of [['large-compare-symbol', 'place'], ['three-digit-add', 'tensSum'], ['three-digit-subtract', 'tens'], ['product-before-add-start', 'first']]) {
      const task = tasks(name)[0], answer = task.answer as Array<{ key: string; value: string }>;
      const schema: QuestionAnswerSchema = { questionId: 'partial-evidence', mode: 'multi_blank', responseShape: task.responseShape!, validationRules: {}, gradingConfig: {} };
      const response = answer.map(row => row.key === key ? { ...row, value: Number.isFinite(Number(row.value)) ? String(Number(row.value) + 1) : 'QA未达标' } : { ...row });
      const scored = gradeResponse(schema, answer, response);
      expect(scored.score).toBeCloseTo((answer.length - 1) / answer.length, 8); expect(scored.scoreDetails?.filter(row => row.score === 0).map(row => row.key)).toEqual([key]);
      expect(scored.scoreDetails?.find(row => row.key === answer.at(-1)!.key)?.score).toBe(1);
    }
  });

  it('fits genuine basic/transfer contrasts within the declared time budget using explicit task estimates', () => {
    for (const definition of buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id))) {
      const spec = verificationBlueprint({ id: 'qa', title: '对照', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id,
        atomId: definition.atom.id, family: task.family, dimension: task.dimension, difficulty: 1, expectedSeconds: task.expectedSeconds ?? 40 } as MeasurementItem; });
      const selection = selectVerificationItems(spec, items, new Set([definition.atom.id]), 'qa', 8, 600);
      expect(selection.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(selection.selected.map(row => row.family)).size).toBe(4);
      expect(selection.verification.groups.every(group => group.selectedFamilies.length === 2)).toBe(true);
      expect(selection.selected.reduce((sum, row) => sum + row.expectedSeconds, 0)).toBeLessThanOrEqual(600);
    }
    for (const task of families.flatMap(row => row.exercises)) {
      expect(task.expectedSeconds).toBeGreaterThanOrEqual(45); expect(task.expectedSeconds).toBeLessThanOrEqual(100);
      if (task.mode === 'multi_blank') expect(task.expectedSeconds).toBeGreaterThanOrEqual((task.answer as unknown[]).length * 15);
    }
  });
});
