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
import { buildUnitProbeFamilies } from './authored-unit-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildUnitProbeFamilies();
const tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const numbers = (value: string) => (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const entries = (value: unknown): Record<string, string> => Object.fromEntries((value as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
const rows = (task: Exercise) => task.blocks!.find(block => block.type === 'table')!.rows!;
const times = (value: string) => [...value.matchAll(/(\d{1,2}):(\d{2})/g)].map(match => Number(match[1]) * 60 + Number(match[2]));
const fraction = (value: string) => { const [a, b] = value.split('/').map(Number); return a / b; };
const count = (value: string, symbol: string) => [...value].filter(character => character === symbol).length;
const repeatedDivision = (total: number, size: number) => {
  let quotient = 0, remainder = total;
  while (remainder >= size) { quotient++; remainder -= size; }
  return { quotient, remainder };
};
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode ?? 'numeric_blank',
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) });

describe('third-grade division, time and fractional unit observations', () => {
  it('preserves every previous task and ID and adds 240 nonduplicate observations in 20 structures', () => {
    const priorIds = new Set([...buildAuthoredMathProbeFamilies(), ...buildArithmeticProbeFamilies(), ...buildNumberProbeFamilies(), ...buildSpatialProbeFamilies(),
      ...buildSecondGradeProbeFamilies(), ...buildDataProbeFamilies(), ...buildThirdGradeProbeFamilies()].flatMap(row => row.exercises.map(task => foundationQuestionId(row.atomId, task))));
    const all = buildFoundationCurriculum().flatMap(definition => definition.exercises.map(exercise => ({ atomId: definition.atom.id,
      id: foundationQuestionId(definition.atom.id, exercise), exercise })));
    const previous = all.filter(row => row.exercise.identityVersion !== 2 || priorIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(5198); expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe('1495887224bc758a6675235ba6f4c678f3a146a4dd7f5ada6cf4c43706e830ed');
    expect(families).toHaveLength(20); expect(new Set(families.map(row => row.atomId)).size).toBe(5);
    const additions = families.flatMap(row => row.exercises.map(exercise => ({ atomId: row.atomId, id: foundationQuestionId(row.atomId, exercise), exercise })));
    expect(additions).toHaveLength(240); expect(new Set(additions.map(row => row.id)).size).toBe(240);
    const semantic = (row: typeof all[number]) => JSON.stringify({ atomId: row.atomId, stem: row.exercise.stem,
      blocks: row.exercise.blocks, responseShape: row.exercise.responseShape });
    const oldSemantic = new Set(previous.map(semantic)); expect(new Set(additions.map(semantic)).size).toBe(240);
    for (const row of additions) expect(oldSemantic.has(semantic(row)), row.exercise.stem).toBe(false);
    expect(new Set(all.map(row => row.id)).size).toBe(all.length);
  });

  it('checks every division regroup claim by rebuilding the undistributed quantity in ones', () => {
    for (const task of tasks('division-regroup-conservation')) {
      const [total, divisor, tens, remaining, ones, claim] = numbers(task.stem);
      expect(tens * 10 + ones).toBe(total); expect(remaining).toBe(repeatedDivision(tens, divisor).remainder);
      const assigned = total - (remaining * 10 + ones); expect(assigned % (10 * divisor)).toBe(0);
      expect(task.answer).toBe(claim === total - assigned);
    }
    expect(new Set(tasks('division-regroup-conservation').map(task => task.answer))).toEqual(new Set([true, false]));
  });

  it('independently distributes tens and ones and checks every recorded division step and quotient', () => {
    for (const task of tasks('division-digits-symbol')) {
      const [total, divisor] = numbers(task.stem), actual = entries(task.answer), high = repeatedDivision(Math.floor(total / 10), divisor);
      const low = repeatedDivision(high.remainder * 10 + total % 10, divisor), complete = repeatedDivision(total, divisor);
      expect(actual).toEqual({ tensEach: String(high.quotient), remainingTens: String(high.remainder), combinedOnes: String(low.quotient * divisor),
        onesEach: String(low.quotient), quotient: String(complete.quotient) });
      expect(high.remainder).toBeGreaterThan(0); expect(low.remainder).toBe(0); expect(low.quotient).toBeLessThan(10);
      expect(high.quotient * 10 + low.quotient).toBe(complete.quotient);
    }
  });

  it('reconstructs packaged quantities and verifies fair distribution and normalized units', () => {
    for (const task of tasks('division-packaged-sharing')) {
      const divisor = Number(task.stem.match(/平均分给(\d+)人/)![1]), record = rows(task);
      const total = Number(record[0][1]) * 10 + Number(record[1][1]), actual = entries(task.answer);
      const share = Number(actual.bundles) * 10 + Number(actual.loose);
      expect(share * divisor).toBe(total); expect(Number(actual.loose)).toBeLessThan(10);
      expect(share).toBe(repeatedDivision(total, divisor).quotient);
    }
  });

  it('finds the first invalid division row even if later rows follow its recorded state correctly', () => {
    const firsts = new Set<string>();
    for (const task of tasks('division-first-regroup-error')) {
      const [total, divisor] = numbers(task.stem), record = rows(task), qTens = Number(record[0][1]), remTens = Number(record[0][2]);
      const combined = Number(record[1][3]), qOnes = Number(record[2][4]);
      const valid = [qTens * divisor + remTens === Math.floor(total / 10) && remTens >= 0 && remTens < divisor,
        combined === remTens * 10 + total % 10, Number(record[2][3]) === combined && qOnes * divisor === combined];
      const first = record[valid.findIndex(value => !value)][0]; expect(task.answer).toBe(first); firsts.add(first);
      expect(valid.filter(value => !value)).toHaveLength(1);
    }
    expect(firsts.size).toBe(3);
  });

  it('checks all elapsed-time claims against actual clock minutes, including both claims on each pair', () => {
    const pairs = new Map<string, Set<boolean>>();
    for (const task of tasks('elapsed-sixty-minute-audit')) {
      const [start, end] = times(task.stem), claim = Number(task.stem.match(/经过(\d+)分钟/)![1]);
      expect(start % 60).toBeGreaterThan(end % 60); expect(task.answer).toBe(end - start === claim);
      const key = `${start}:${end}`, observed = pairs.get(key) ?? new Set<boolean>(); observed.add(task.answer as boolean); pairs.set(key, observed);
    }
    expect(pairs.size).toBe(6); for (const pair of pairs.values()) expect(pair).toEqual(new Set([true, false]));
  });

  it('checks complete forward segments and reverses every arrival without treating clocks as decimal values', () => {
    for (const task of tasks('elapsed-same-day')) {
      const [start, end, boundary] = times(task.stem), actual = entries(task.answer);
      expect(boundary % 60).toBe(0); expect(boundary - start).toBeGreaterThan(0); expect(boundary - start).toBeLessThan(60);
      expect(actual).toEqual({ first: String(boundary - start), later: String(end - boundary), total: String(end - start) });
    }
    expect(tasks('elapsed-same-day').some(task => Number(entries(task.answer).later) > 60)).toBe(true);
    for (const task of tasks('elapsed-reverse-arrival')) {
      const [start] = times(task.stem), duration = Number(task.stem.match(/用了(\d+)分钟/)![1]), actual = entries(task.answer);
      const end = Number(actual.hour) * 60 + Number(actual.minute);
      expect(end - start).toBe(duration); expect(Number(actual.minute)).toBeLessThan(60); expect(end).toBeLessThan(24 * 60);
    }
  });

  it('separately measures the full span and active intervals from the actual uninterrupted timetable', () => {
    for (const task of tasks('elapsed-active-intervals')) {
      const record = rows(task), intervals = record.map(row => [row[0], times(`${row[1]} ${row[2]}`)] as const);
      expect(intervals[0][1][1]).toBe(intervals[1][1][0]); expect(intervals[1][1][1]).toBe(intervals[2][1][0]);
      const span = intervals.at(-1)![1][1] - intervals[0][1][0];
      const active = intervals.filter(([label]) => label === '学习').reduce((sum, [, [start, end]]) => sum + end - start, 0);
      expect(entries(task.answer)).toEqual({ span: String(span), active: String(active) }); expect(span).toBeGreaterThan(active);
    }
  });

  it('counts every actual circle and rejects unequal shares despite the same number of groups and same total', () => {
    const totals: number[] = [];
    for (const task of tasks('fraction-equal-shares-audit')) {
      const counts = rows(task).map(row => count(row[1], '●')), denominator = Number(task.stem.match(/现在分成(\d+)份/)![1]);
      expect(counts).toHaveLength(denominator); expect(counts.every(value => value > 0)).toBe(true);
      expect(task.answer).toBe(new Set(counts).size === 1); totals.push(counts.reduce((a, b) => a + b, 0));
    }
    for (let index = 0; index < totals.length; index += 2) expect(totals[index]).toBe(totals[index + 1]);
  });

  it('uses the whole and equal-unit count for every unit fraction, including a changed whole', () => {
    for (const task of tasks('fraction-unit-number')) {
      const denominator = Number(task.stem.match(/平均分成(\d+)份/)![1]), actual = entries(task.answer);
      expect(Number(actual.denominator)).toBe(denominator); expect(fraction(actual.part) * denominator).toBeCloseTo(1, 12);
    }
    for (const task of tasks('fraction-changing-whole')) {
      const initial = Number(task.stem.match(/原有(\d+)份/)![1]), removed = Number(task.stem.match(/取走(\d+)份/)![1]), actual = entries(task.answer);
      const remaining = initial - removed; expect(Number(actual.shares)).toBe(remaining); expect(fraction(actual.part) * remaining).toBeCloseTo(1, 12);
      expect(fraction(actual.part)).not.toBeCloseTo(1 / initial, 12);
    }
  });

  it('recovers denominators by laying equal segments over the entire measured length', () => {
    for (const task of tasks('fraction-length-unit-recovery')) {
      const record = rows(task), whole = Number(record[0][1]), segment = Number(record[1][1]);
      const division = repeatedDivision(whole, segment), actual = entries(task.answer);
      expect(division.remainder).toBe(0); expect(Number(actual.shares)).toBe(division.quotient);
      expect(fraction(actual.part) * whole).toBeCloseTo(segment, 12); expect(Number(actual.shares)).not.toBe(whole);
    }
  });

  it('checks comparison reasons and all equal-unit fraction comparisons independently of operand order', () => {
    for (const task of tasks('fraction-same-unit-claim')) {
      const fractions = [...task.stem.matchAll(/(\d+)\/(\d+)/g)];
      expect(fractions[0][2]).toBe(fractions[1][2]); expect(fractions[0][1]).not.toBe(fractions[1][1]);
      expect(task.answer).toBe(!task.stem.includes('两个分数一样大'));
    }
    for (const task of tasks('same-denominator-compare')) {
      const fractions = [...task.stem.matchAll(/(\d+)\/(\d+)/g)].slice(0, 2).map(match => [Number(match[1]), Number(match[2])]);
      const actual = entries(task.answer); expect(fractions[0][1]).toBe(fractions[1][1]);
      expect(fraction(actual.unit) * fractions[0][1]).toBeCloseTo(1, 12);
      expect(fraction(actual.larger) * fractions[0][1]).toBeCloseTo(Math.max(fractions[0][0], fractions[1][0]), 12);
    }
  });

  it('compares every actual strip, including ties and either side being larger', () => {
    const results = new Set<string>();
    for (const task of tasks('fraction-covered-strip-compare')) {
      const strips = rows(task).map(row => ({ selected: count(row[1], '■'), empty: count(row[1], '□') }));
      expect(strips[0].selected + strips[0].empty).toBe(strips[1].selected + strips[1].empty);
      const expected = strips[0].selected === strips[1].selected ? '两份一样多' : strips[0].selected > strips[1].selected ? '甲更多' : '乙更多';
      expect(task.answer).toBe(expected); results.add(expected);
    }
    expect(results).toEqual(new Set(['甲更多', '乙更多', '两份一样多']));
  });

  it('requires the whole-size condition to compare actual water amounts and keeps both known directions', () => {
    const results = new Set<string>();
    for (const task of tasks('fraction-whole-boundary')) {
      const matches = [...task.stem.matchAll(/(\d+)\/(\d+)/g)], a = Number(matches[0][1]), b = Number(matches[1][1]);
      const same = task.stem.includes('已知两杯装满时的容量相同');
      const expected = same ? a > b ? '甲杯水更多' : '乙杯水更多' : '现有信息不能确定'; expect(task.answer).toBe(expected); results.add(expected);
      if (!same) {
        // Both actual orderings are possible while the recorded fractions remain fixed.
        expect(a * 100).toBeGreaterThan(b); expect(b * 100).toBeGreaterThan(a);
      }
    }
    expect(results).toEqual(new Set(['甲杯水更多', '乙杯水更多', '现有信息不能确定']));
  });

  it('checks zero-placeholder claims and both component values against hundredth units', () => {
    for (const task of tasks('decimal-zero-placeholder-claim')) {
      const digit = Number(task.stem.match(/^(\d+)个/)![1]), claim = Number(task.stem.match(/记作([\d.]+)/)![1]);
      const units = task.stem.includes('百分之一') ? digit : digit * 10; expect(task.answer).toBe(Math.round(claim * 100) === units);
    }
    for (const task of tasks('decimal-compose-parts')) {
      const [tenths, hundredths] = numbers(task.stem), actual = entries(task.answer);
      expect(Math.round(Number(actual.tenthsValue) * 100)).toBe(tenths * 10);
      expect(Math.round(Number(actual.hundredthsValue) * 100)).toBe(hundredths);
      expect(Math.round(Number(actual.total) * 100)).toBe(tenths * 10 + hundredths);
    }
    expect(tasks('decimal-compose-parts').some(task => entries(task.answer).tenthsValue === '0.00')).toBe(true);
    expect(tasks('decimal-compose-parts').some(task => entries(task.answer).hundredthsValue === '0.00')).toBe(true);
  });

  it('conserves actual mixed lengths and counts all 1200 hundred-grid cells without reading an authored answer', () => {
    for (const task of tasks('decimal-mixed-length-label')) {
      const record = rows(task), dm = numbers(record[0][1])[0], cm = numbers(record[1][1])[0], actual = entries(task.answer);
      expect(Number(actual.meters) * 100).toBeCloseTo(dm * 10 + cm, 10);
      expect(Number(actual.tenths)).toBe(dm); expect(Number(actual.hundredths)).toBe(cm);
    }
    const selectedCounts = new Set<number>();
    for (const task of tasks('decimal-hundred-grid')) {
      const record = rows(task); expect(record).toHaveLength(10);
      for (const row of record) expect(count(row[1], '■') + count(row[1], '□')).toBe(10);
      const selected = record.reduce((sum, row) => sum + count(row[1], '■'), 0), actual = entries(task.answer);
      expect(Number(actual.tenths) * 10 + Number(actual.hundredths)).toBe(selected);
      expect(Number(actual.hundredths)).toBeLessThan(10); expect(Number(actual.value) * 100).toBeCloseTo(selected, 12); selectedCounts.add(selected);
    }
    for (const value of [4, 40, 7, 70, 3, 30, 5, 50]) expect(selectedCounts.has(value)).toBe(true);
  });

  it('validates every real protocol response, every distractor and a legal zero-score response for every new task', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task), envelope = (value: unknown) => ({ questionId: schema.questionId, mode: schema.mode,
        response: schema.mode === 'multi_blank' ? { entries: value } : { value } });
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, envelope(task.answer))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(task.answer)).score, task.stem).toBe(1);
      const wrong = schema.mode === 'single_choice' ? task.options!.filter(value => value !== task.answer) : [schema.mode === 'boolean' ? !task.answer :
        (task.answer as Array<{ key: string; value: string }>).map(entry => ({ ...entry, value: 'QA未达标' }))];
      for (const value of wrong) { expect(answerProtocolIssue(schema, envelope(value))).toBeNull(); expect(gradeResponse(schema, task.answer, envelope(value)).score, task.stem).toBe(0); }
      expect(task.analysis!.length).toBeGreaterThan(15);
    }
  });

  it('preserves established families and exposes wrong intermediate quantities even when the final value is correct', () => {
    const definitions = buildFoundationCurriculum(), retained = ['division-digits-symbol', 'elapsed-same-day', 'fraction-unit-number', 'same-denominator-compare', 'decimal-compose-parts'];
    for (const family of families.filter(row => retained.includes(row.family))) {
      expect(family.distinction).toMatch(/沿用/);
      expect(definitions.find(row => row.atom.id === family.atomId)!.exercises.some(task => task.family === family.family && task.identityVersion !== 2)).toBe(true);
    }
    for (const name of ['division-digits-symbol', 'elapsed-same-day', 'fraction-unit-number', 'decimal-compose-parts', 'decimal-hundred-grid']) {
      const family = families.find(row => row.family === name)!, task = family.exercises[0], standard = task.answer as Array<{ key: string; value: string }>;
      const submitted = standard.map((entry, index) => index === 0 ? { ...entry, value: 'QA未达标' } : { ...entry });
      const scored = gradeResponse(schemaFor(family.atomId, task), standard, submitted);
      expect(scored.score).toBeCloseTo((standard.length - 1) / standard.length, 12);
      expect(scored.scoreDetails?.filter(row => row.score === 0).map(row => row.key)).toEqual([standard[0].key]);
      expect(scored.scoreDetails?.at(-1)?.score).toBe(1);
    }
  });

  it('selects two distinct basic and two distinct transfer families within a genuine time budget', () => {
    for (const definition of buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id))) {
      const spec = verificationBlueprint({ id: 'qa', title: '对照', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id, atomId: definition.atom.id,
        family: task.family, dimension: task.dimension, difficulty: 1, expectedSeconds: task.expectedSeconds ?? 40 } as MeasurementItem; });
      const selection = selectVerificationItems(spec, items, new Set([definition.atom.id]), 'qa', 8, 600);
      expect(selection.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(selection.selected.map(row => row.family)).size).toBe(4);
      expect(selection.verification.groups.every(group => group.selectedFamilies.length === 2)).toBe(true);
      expect(selection.selected.reduce((sum, row) => sum + row.expectedSeconds, 0)).toBeLessThanOrEqual(600);
    }
    for (const task of families.flatMap(row => row.exercises)) {
      expect(task.expectedSeconds).toBeGreaterThanOrEqual(60); expect(task.expectedSeconds).toBeLessThanOrEqual(110);
      if (task.mode === 'multi_blank') expect(task.expectedSeconds).toBeGreaterThanOrEqual((task.answer as unknown[]).length * 15);
    }
  });
});
