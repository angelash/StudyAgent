import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-5678-v1.json';
import { buildFourthGradeNumberProbeFamilies } from './authored-fourth-grade-number-probes';
import { buildRemainderDecimalProbeFamilies } from './authored-remainder-decimal-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { arithmeticValue } from './arithmetic-expression';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildRemainderDecimalProbeFamilies();
const tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const numbers = (value: string) => [...value.matchAll(/\d+(?:\.\d+)?/g)].map(match => match[0]);
const integers = (value: string) => numbers(value).map(Number);
const cents = (value: string) => { const [whole, fraction = ''] = value.split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2, '0')); };
const entries = (task: Exercise): Record<string, string> => Object.fromEntries((task.answer as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
const numericEntries = (task: Exercise): Record<string, number> => Object.fromEntries(Object.entries(entries(task)).map(([key, value]) => [key, Number(value)]));
const rows = (task: Exercise) => task.blocks!.find(block => block.type === 'table')!.rows!;
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode ?? 'numeric_blank',
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) });
const wrongValue = (value: unknown) => Number.isFinite(Number(value)) ? String(Number(value) + 1) : 'QA未达标';

describe('remainder bounds, parenthesis scope and decimal unit contrasts', () => {
  it('preserves the complete 5966-task historical snapshot and adds 192 unique tasks in 16 structures', () => {
    const frozenIds = new Set([...baseline.ids, ...buildFourthGradeNumberProbeFamilies().flatMap(row => row.exercises.map(task => foundationQuestionId(row.atomId, task)))]);
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const previous = all.filter(row => frozenIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(frozenIds.size).toBe(5966); expect(previous).toHaveLength(5966);
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe('ca9e5c6297a798a9b517ae59947cbc7ed89d5491fcddc2bddeda74dbbc594184');
    const additions = families.flatMap(row => row.exercises.map(exercise => ({ atomId: row.atomId, id: foundationQuestionId(row.atomId, exercise), exercise })));
    expect(families).toHaveLength(16); expect(new Set(families.map(row => row.atomId)).size).toBe(4);
    expect(additions).toHaveLength(192); expect(new Set(additions.map(row => row.id)).size).toBe(192);
    const semantic = (row: typeof all[number]) => JSON.stringify([row.atomId, row.exercise.stem, row.exercise.blocks, row.exercise.responseShape]);
    const oldSemantics = new Set(previous.map(semantic)); expect(new Set(additions.map(semantic)).size).toBe(192);
    for (const row of additions) { expect(frozenIds.has(row.id)).toBe(false); expect(oldSemantics.has(semantic(row)), row.exercise.stem).toBe(false); }
    expect(new Set(all.map(row => row.id)).size).toBe(all.length);
    for (const atomId of new Set(families.map(row => row.atomId))) expect(additions.filter(row => row.atomId === atomId)).toHaveLength(48);
  });
  it('rejects an oversized remainder even when the multiplication-back equality is correct', () => {
    const outcomes = new Map<string, Set<boolean>>(); let zeroRemainder = false, remainderEqualsDivisor = false;
    for (const task of tasks('remainder-bound-and-conservation-audit')) {
      const [total, divisor, quotient, remainder] = integers(task.stem);
      expect(quotient * divisor + remainder).toBe(total);
      expect(task.answer).toBe(quotient === Math.floor(total / divisor) && remainder === total % divisor);
      const key = `${total}/${divisor}`; if (!outcomes.has(key)) outcomes.set(key, new Set()); outcomes.get(key)!.add(task.answer as boolean);
      if (!remainder) { zeroRemainder = true; expect(task.answer).toBe(true); }
      if (remainder === divisor) { remainderEqualsDivisor = true; expect(task.answer).toBe(false); }
    }
    expect(outcomes.size).toBe(6); expect([...outcomes.values()].every(values => values.size === 2)).toBe(true);
    expect(zeroRemainder && remainderEqualsDivisor).toBe(true);
  });
  it('reconstructs full groups and residual quantity including zero quotient and the two remainder boundaries', () => {
    const edges = new Set<string>();
    for (const task of tasks('remainder-symbol')) {
      const [total, divisor] = integers(task.stem), answer = numericEntries(task);
      expect(answer).toEqual({ fullGroups: Math.floor(total / divisor), allocated: total - total % divisor, remainder: total % divisor });
      expect(answer.allocated + answer.remainder).toBe(total);
      if (!answer.fullGroups) edges.add('zero-quotient'); if (!answer.remainder) edges.add('zero-remainder');
      if (answer.remainder === divisor - 1) edges.add('max-remainder');
    }
    expect(edges).toEqual(new Set(['zero-quotient', 'zero-remainder', 'max-remainder']));
  });
  it('chooses the minimal sufficient transport capacity rather than treating residual people as vehicles', () => {
    let exact = 0, residual = 0, fewerThanOneFullVehicle = 0;
    for (const task of tasks('remainder-capacity-ceiling')) {
      const [people, capacity] = integers(task.stem), answer = numericEntries(task);
      expect(answer.fullVehicles).toBe(Math.floor(people / capacity)); expect(answer.neededVehicles * capacity).toBeGreaterThanOrEqual(people);
      expect((answer.neededVehicles - 1) * capacity).toBeLessThan(people); expect(answer.emptySeats + people).toBe(answer.neededVehicles * capacity);
      if (people % capacity) { residual++; expect(answer.neededVehicles).toBe(answer.fullVehicles + 1); }
      else { exact++; expect(answer.neededVehicles).toBe(answer.fullVehicles); expect(answer.emptySeats).toBe(0); }
      if (people < capacity) { fewerThanOneFullVehicle++; expect(answer.neededVehicles).toBe(1); }
    }
    expect(exact && residual && fewerThanOneFullVehicle).toBeGreaterThan(0);
  });
  it('recovers the unique packaging divisor from actual inventory, full packages and residual units', () => {
    for (const task of tasks('remainder-inverse-package-size')) {
      const [total, packages, loose] = rows(task).map(row => Number(row[1]));
      const candidates = Array.from({ length: total }, (_, index) => index + 1).filter(size => size * packages + loose === total && loose < size);
      expect(candidates).toEqual([task.answer]); expect(Number(task.answer)).toBeGreaterThan(loose);
    }
  });
  it('checks the actual parenthesized expression and both result claims without negative-number cues', () => {
    const outcomes = new Map<string, Set<boolean>>();
    for (const task of tasks('bracket-whole-operation-audit')) {
      const expression = task.stem.match(/计算(.+)，有人/)![1], claim = integers(task.stem).at(-1)!;
      expect(task.answer).toBe(arithmeticValue(expression) === claim); expect(claim).toBeGreaterThanOrEqual(0);
      if (!outcomes.has(expression)) outcomes.set(expression, new Set()); outcomes.get(expression)!.add(task.answer as boolean);
    }
    expect(outcomes.size).toBe(6); expect([...outcomes.values()].every(values => values.size === 2)).toBe(true);
  });
  it('retains the bracketed intermediate quantity before the outer multiplication for both addition and subtraction', () => {
    const operations = new Set<string>();
    for (const task of tasks('bracket-left')) {
      const expression = task.stem.match(/计算(.+)，先/)![1], inside = expression.match(/^\((.+)\)/)![1], answer = numericEntries(task);
      expect(answer).toEqual({ inside: arithmeticValue(inside), whole: arithmeticValue(expression) });
      expect(answer.inside).toBeGreaterThanOrEqual(0); operations.add(inside.includes('+') ? '+' : '-');
    }
    expect(operations.size).toBe(2);
  });
  it('checks every discount-model option against the stated scope, with per-copy and once-per-order policies', () => {
    const scopes = new Set<string>(), positions = new Set<number>();
    for (const task of tasks('bracket-discount-scope-model')) {
      const [price, copies, discount] = integers(task.stem), each = task.stem.includes('每一份'), actualCost = price * copies - discount * (each ? copies : 1);
      const valid = task.options!.filter(option => arithmeticValue(option) === actualCost);
      expect(valid).toEqual([task.answer]); expect(task.options!.every(option => arithmeticValue(option)! >= 0)).toBe(true);
      scopes.add(each ? 'per-copy' : 'per-order'); positions.add(task.options!.indexOf(String(task.answer)));
    }
    expect(scopes.size).toBe(2); expect(positions).toEqual(new Set([0, 1, 2]));
  });
  it('recovers per-box original quantity from total remaining and repeated removals', () => {
    for (const task of tasks('bracket-inverse-per-box-removal')) {
      const [boxes, removedPerBox, totalRemaining] = rows(task).map(row => Number(row[1])), answer = numericEntries(task);
      expect(answer.remainingPerBox * boxes).toBe(totalRemaining);
      expect((answer.originalPerBox - removedPerBox) * boxes).toBe(totalRemaining);
      expect(answer.originalPerBox).toBe(answer.remainingPerBox + removedPerBox);
    }
  });
  it('expands the displayed decimal digits into integer hundredths to audit trailing-zero equality', () => {
    const outcomes = new Map<string, Set<boolean>>();
    for (const task of tasks('decimal-trailing-zero-equality-audit')) {
      const [left, right] = numbers(task.stem); expect(task.answer).toBe(cents(left) === cents(right));
      if (!outcomes.has(left)) outcomes.set(left, new Set()); outcomes.get(left)!.add(task.answer as boolean);
    }
    expect(outcomes.size).toBe(6); expect([...outcomes.values()].every(values => values.size === 2)).toBe(true);
    expect([...outcomes.keys()].some(value => value.startsWith('0.'))).toBe(true);
  });
  it('compares actual hundredth units with equality and changes in the integer part included', () => {
    const relations = new Set<string>(); let zero = false, integerCrossing = false;
    for (const task of tasks('decimal-place-compare')) {
      const [left, right] = numbers(task.stem), a = cents(left), b = cents(right), answer = entries(task);
      expect(Number(answer.leftHundredths)).toBe(a); expect(Number(answer.rightHundredths)).toBe(b);
      expect(answer.relation).toBe(a < b ? '<' : a > b ? '>' : '='); relations.add(answer.relation);
      if (!a && !b) zero = true; if (Math.floor(a / 100) !== Math.floor(b / 100)) integerCrossing = true;
    }
    expect(relations).toEqual(new Set(['<', '=', '>'])); expect(zero && integerCrossing).toBe(true);
  });
  it('normalizes actual meter and centimeter labels before judging every length option', () => {
    const outcomes = new Map<string, number>();
    for (const task of tasks('decimal-comparison-mixed-length-labels')) {
      const [aLabel, bLabel] = rows(task).map(row => row[1]), a = cents(aLabel.replace('米', '')), b = Number(bLabel.replace('厘米', ''));
      const expected = a > b ? '甲较长' : a < b ? '乙较长' : '两者等长'; expect(task.answer).toBe(expected);
      expect(task.options!.slice().sort()).toEqual(['甲较长', '乙较长', '两者等长'].sort()); outcomes.set(expected, (outcomes.get(expected) ?? 0) + 1);
    }
    expect([...outcomes.values()]).toEqual([4, 4, 4]);
  });
  it('enumerates all ten possible digits for strict-between constraints and excludes both endpoints', () => {
    let uniqueCandidate = false; const maxima = new Set<number>();
    for (const task of tasks('decimal-strict-between-digit-range')) {
      const match = task.stem.match(/(\d+\.\d+)<(\d+\.\d)□<(\d+\.\d+)/)!;
      const [left, prefix, right] = match.slice(1), allowed = Array.from({ length: 10 }, (_, digit) => digit).filter(digit => cents(left) < cents(`${prefix}${digit}`) && cents(`${prefix}${digit}`) < cents(right));
      const answer = numericEntries(task); expect(allowed.length).toBeGreaterThan(0);
      expect(answer).toEqual({ minimumDigit: allowed[0], maximumDigit: allowed.at(-1) });
      expect(cents(`${prefix}${answer.minimumDigit}`)).toBeGreaterThan(cents(left)); expect(cents(`${prefix}${answer.maximumDigit}`)).toBeLessThan(cents(right));
      uniqueCandidate ||= allowed.length === 1; maxima.add(answer.maximumDigit);
    }
    expect(uniqueCandidate).toBe(true); expect(maxima.size).toBeGreaterThan(3);
  });
  it('rejects right-edge alignment differences using exact integer hundredths rather than floating-point subtraction', () => {
    const outcomes = new Map<string, Set<boolean>>();
    for (const task of tasks('decimal-subtract-alignment-audit')) {
      const [left, right, claimed] = numbers(task.stem); expect(task.answer).toBe(cents(left) - cents(right) === cents(claimed));
      expect(cents(claimed)).toBeGreaterThanOrEqual(0); expect(left.split('.')[1]).toHaveLength(1); expect(right.split('.')[1]).toHaveLength(2);
      const key = `${left}-${right}`; if (!outcomes.has(key)) outcomes.set(key, new Set()); outcomes.get(key)!.add(task.answer as boolean);
    }
    expect(outcomes.size).toBe(6); expect([...outcomes.values()].every(values => values.size === 2)).toBe(true);
  });
  it('retains aligned units, zero difference and borrowing across empty decimal places', () => {
    let zeroDifference = false, borrowedAcrossZero = false; const decimalLengths = new Set<number>();
    for (const task of tasks('decimal-subtract-symbol')) {
      const [left, right] = numbers(task.stem), a = cents(left), b = cents(right), answer = entries(task);
      expect(Number(answer.minuendHundredths)).toBe(a); expect(Number(answer.subtrahendHundredths)).toBe(b);
      expect(Number(answer.differenceHundredths)).toBe(a - b); expect(cents(answer.difference)).toBe(a - b);
      expect(cents(answer.difference) + b).toBe(a); expect(a - b).toBeGreaterThanOrEqual(0);
      if (a === b) zeroDifference = true; if (a % 100 < b % 100 && Math.floor(a / 10) % 10 === 0) borrowedAcrossZero = true;
      decimalLengths.add((left.split('.')[1] ?? '').length); decimalLengths.add((right.split('.')[1] ?? '').length);
    }
    expect(zeroDifference && borrowedAcrossZero).toBe(true); expect(decimalLengths).toEqual(new Set([0, 1, 2]));
  });
  it('rebuilds mixed-unit inventory and target independently, retaining zero stock and zero shortage', () => {
    const zeroParts = new Set<string>();
    for (const task of tasks('decimal-subtract-mixed-length-shortfall')) {
      const [targetLabel, stockLabel] = rows(task).map(row => row[1]), target = cents(targetLabel.replace('米', ''));
      const [meters, centimeters] = integers(stockLabel), stock = meters * 100 + centimeters, answer = entries(task), shortfall = Math.max(0, target - stock);
      expect(Number(answer.targetCentimeters)).toBe(target); expect(Number(answer.stockCentimeters)).toBe(stock);
      expect(Number(answer.shortfallCentimeters)).toBe(shortfall); expect(cents(answer.shortfallMeters)).toBe(shortfall);
      if (!meters) zeroParts.add('meters'); if (!centimeters) zeroParts.add('centimeters'); if (!shortfall) zeroParts.add('shortfall'); if (!stock) zeroParts.add('stock');
    }
    expect(zeroParts).toEqual(new Set(['meters', 'centimeters', 'shortfall', 'stock']));
  });
  it('audits every balance by adding recorded remainder and the sole expenditure back to the original amount', () => {
    const outcomes = new Map<string, Set<boolean>>(); let zeroBalance = false;
    for (const task of tasks('decimal-subtract-balance-conservation')) {
      const [before, spent, recorded] = rows(task).map(row => cents(row[1])); expect(task.answer).toBe(spent + recorded === before);
      const key = `${before}-${spent}`; if (!outcomes.has(key)) outcomes.set(key, new Set()); outcomes.get(key)!.add(task.answer as boolean);
      if (!recorded) { zeroBalance = true; expect(task.answer).toBe(true); }
    }
    expect(outcomes.size).toBe(6); expect([...outcomes.values()].every(values => values.size === 2)).toBe(true); expect(zeroBalance).toBe(true);
  });
  it('retains all four established calculation families instead of counting intermediate fields as new structures', () => {
    const definitions = buildFoundationCurriculum(), oldIds = new Set(baseline.ids);
    for (const family of families.filter(row => ['remainder-symbol', 'bracket-left', 'decimal-place-compare', 'decimal-subtract-symbol'].includes(row.family))) {
      expect(definitions.find(row => row.atom.id === family.atomId)!.exercises.some(task => oldIds.has(foundationQuestionId(family.atomId, task)) && task.family === family.family)).toBe(true);
      expect(family.dimension).toBe('procedure'); expect(family.distinction).toContain('沿用');
    }
  });
  it('validates every standard answer and distractor under the actual protocol, including symbolic comparison fields', () => {
    const modes = new Set<string>();
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task), envelope = (value: unknown) => ({ questionId: schema.questionId, mode: schema.mode,
        response: schema.mode === 'multi_blank' ? { entries: value } : { value } }); modes.add(schema.mode);
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, envelope(task.answer))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(task.answer)).score, task.stem).toBe(1);
      const wrong = schema.mode === 'single_choice' ? task.options!.filter(value => value !== task.answer) : [schema.mode === 'boolean' ? !task.answer :
        schema.mode === 'multi_blank' ? (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: wrongValue(row.value) })) : Number(task.answer) + 1];
      if (task.options) expect(new Set(task.options).size).toBe(task.options.length);
      for (const value of wrong) { expect(answerProtocolIssue(schema, envelope(value))).toBeNull(); expect(gradeResponse(schema, task.answer, envelope(value)).score, task.stem).toBe(0); }
      expect(task.analysis!.length).toBeGreaterThan(15);
    }
    expect(modes).toEqual(new Set(['boolean', 'multi_blank', 'numeric_blank', 'single_choice']));
  });
  it('preserves credit and an explicit error at every intermediate field even when the final field is correct', () => {
    for (const family of families) for (const task of family.exercises.filter(row => row.mode === 'multi_blank')) {
      const answer = task.answer as Array<{ key: string; value: string }>;
      for (let changed = 0; changed < answer.length; changed++) {
        const submitted = answer.map((row, index) => ({ ...row, value: index === changed ? wrongValue(row.value) : row.value }));
        const result = gradeResponse(schemaFor(family.atomId, task), task.answer, submitted);
        expect(result.score).toBeCloseTo((answer.length - 1) / answer.length, 10);
        expect(result.scoreDetails?.filter(row => !row.score).map(row => row.key)).toEqual([answer[changed].key]);
        if (changed < answer.length - 1) expect(result.scoreDetails!.at(-1)!.score).toBe(1);
      }
    }
  });
  it('fits two basic and two transfer families into the unchanged 600-second verification budget', () => {
    const definitions = buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id));
    expect(definitions).toHaveLength(4);
    for (const definition of definitions) {
      const specification = verificationBlueprint({ id: 'qa', title: '对照', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id, atomId: definition.atom.id,
        dimension: task.dimension, family: task.family, difficulty: 1, expectedSeconds: task.expectedSeconds ?? 40 } as MeasurementItem; });
      for (const seed of ['first', 'second', 'third']) {
        const selection = selectVerificationItems(specification, items, new Set([definition.atom.id]), seed, 8, 600);
        expect(selection.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(selection.selected.map(item => item.family)).size).toBe(4);
        expect(selection.verification.groups.every(group => group.selectedFamilies.length === 2)).toBe(true); expect(selection.seconds).toBeLessThanOrEqual(600);
      }
      expect(families.filter(row => row.atomId === definition.atom.id && row.dimension === 'transfer')).toHaveLength(2);
    }
    for (const task of families.flatMap(row => row.exercises)) {
      expect(task.expectedSeconds).toBeGreaterThanOrEqual(75); expect(task.expectedSeconds).toBeLessThanOrEqual(110); expect(task.identityVersion).toBe(2);
      if (task.mode === 'multi_blank') expect(task.expectedSeconds).toBeGreaterThanOrEqual((task.answer as unknown[]).length * 15);
    }
  });
});
