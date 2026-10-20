import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-6446-v1.json';
import { buildFactorMultipleProbeFamilies } from './authored-factor-multiple-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildFactorMultipleProbeFamilies(), tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const numbers = (value: string) => [...value.matchAll(/\d+/g)].map(row => Number(row[0]));
const rows = (task: Exercise) => task.blocks!.find(block => block.type === 'table')!.rows!;
const entries = (task: Exercise): Record<string, string> => Object.fromEntries((task.answer as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
const numericEntries = (task: Exercise) => Object.fromEntries(Object.entries(entries(task)).map(([key, value]) => [key, Number(value)]));
// Reconstruction uses bounded product/divisibility searches, not the author's gcd/lcm functions.
const divisors = (value: number) => Array.from({ length: value }, (_, i) => i + 1).filter(d => Number.isInteger(value / d));
const sharedDivisors = (a: number, b: number) => divisors(a).filter(d => Number.isInteger(b / d));
const firstCommonPositive = (a: number, b: number) => Array.from({ length: a * b }, (_, i) => i + 1).find(value => Number.isInteger(value / a) && Number.isInteger(value / b))!;
const classify = (value: number) => { const count = divisors(value).length; return count === 1 ? '既不是质数也不是合数' : count === 2 ? '质数' : '合数'; };
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode ?? 'numeric_blank',
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) });
const wrongValue = (value: string) => Number.isFinite(Number(value)) ? String(Number(value) + 1) : 'QA未达标';

describe('fifth-grade divisibility, classification and extremal constraints', () => {
  it('preserves all 6446 frozen full task objects and IDs and adds 240 distinct tasks in 20 structures', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const previousIds = new Set(baseline.ids), previous = all.filter(row => previousIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previousIds.size).toBe(6446); expect(previous).toHaveLength(6446);
    expect(baseline.sha256).toBe('b5b0452389205355b03adea4f505256ee69b18a7d9cc106715c0cb067f9babeb');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(families).toHaveLength(20); expect(new Set(families.map(row => row.atomId)).size).toBe(5);
    const additions = families.flatMap(row => row.exercises.map(exercise => ({ atomId: row.atomId, id: foundationQuestionId(row.atomId, exercise), exercise })));
    expect(additions).toHaveLength(240); expect(new Set(additions.map(row => row.id)).size).toBe(240);
    const meaning = (row: typeof all[number]) => JSON.stringify([row.atomId, row.exercise.stem, row.exercise.blocks, row.exercise.responseShape]);
    const historicalMeaning = new Set(previous.map(meaning)); expect(new Set(additions.map(meaning)).size).toBe(240);
    for (const row of additions) { expect(previousIds.has(row.id)).toBe(false); expect(historicalMeaning.has(meaning(row)), row.exercise.stem).toBe(false); }
    expect(all).toHaveLength(6686); expect(new Set(all.map(row => row.id)).size).toBe(6686);
  });

  it('checks actual directed factor claims including one and equality with both outcomes', () => {
    const outcomes = new Map<string, Set<boolean>>(); let one = false, equality = false;
    for (const task of tasks('factor-divisibility')) {
      const [divisor, total] = numbers(task.stem); expect(task.answer).toBe(divisors(total).includes(divisor));
      const key = [divisor, total].sort((a, b) => a - b).join(':'); if (!outcomes.has(key)) outcomes.set(key, new Set()); outcomes.get(key)!.add(Boolean(task.answer));
      one ||= divisor === 1; equality ||= divisor === total;
    }
    expect(one && equality).toBe(true); expect(tasks('factor-divisibility').filter(task => task.answer)).toHaveLength(6);
    expect([...outcomes.values()].filter(values => values.size === 2)).toHaveLength(5);
  });
  it('reconstructs complete factor-pair tables, restores each mask and deduplicates square roots', () => {
    const seen = new Set<number>(); let squares = 0;
    for (const task of tasks('factor-paired-enumeration')) {
      const [value] = numbers(task.stem), record = rows(task), expected = divisors(value), answer = numericEntries(task); seen.add(value);
      const reconstructed = record.map(([left, right]) => [Number(left), right === '被遮住' ? answer.partner : Number(right)]);
      expect(reconstructed.every(([left, right]) => left * right === value && left <= right)).toBe(true);
      expect(record.filter(row => row[1] === '被遮住')).toHaveLength(1);
      expect([...new Set(reconstructed.flat())].sort((a, b) => a - b)).toEqual(expected); expect(answer.distinct).toBe(expected.length);
      if (reconstructed.some(([left, right]) => left === right)) { squares++; expect(answer.distinct % 2).toBe(1); }
    }
    expect(seen.has(1) && seen.has(49)).toBe(true); expect(squares).toBeGreaterThan(4);
  });
  it('derives factor eligibility from every actual package quotient and remainder, not from capacity size', () => {
    let zero = 0, nonzero = 0;
    for (const task of tasks('factor-pack-remainder-record')) {
      const [total] = numbers(task.stem), record = rows(task), eligible: string[] = [];
      for (const row of record) {
        const [capacity, quotient, remainder] = row.map(Number); expect(capacity * quotient + remainder).toBe(total);
        expect(remainder).toBeGreaterThanOrEqual(0); expect(remainder).toBeLessThan(capacity);
        if (remainder === 0) { zero++; eligible.push(String(capacity)); } else nonzero++;
      }
      expect(task.options).toEqual(record.map(row => row[0])); expect(task.answer).toEqual(eligible);
      expect(eligible).toContain('1'); expect(eligible).toContain(String(total)); expect(eligible).not.toContain(String(total - 1));
    }
    expect(zero > 0 && nonzero > 0).toBe(true);
  });
  it('enumerates only rectangle widths that satisfy the displayed range, exact area and second-side bound', () => {
    let designatedLongerSide = false;
    for (const task of tasks('factor-integer-rectangle-bound')) {
      const [area, low, high, minimumHeight] = numbers(task.stem), feasible: number[] = [];
      for (let width = low; width <= high; width++) for (let height = minimumHeight; height <= area; height++) if (width * height === area) feasible.push(width);
      expect(feasible.length).toBeGreaterThan(0); expect(numericEntries(task)).toEqual({ widthCount: feasible.length, largestWidth: feasible.at(-1) });
      expect(task.stem).toContain('指定边既可以是较长边，也可以是较短边');
      designatedLongerSide ||= feasible.some(side => side > area / side);
    }
    expect(designatedLongerSide).toBe(true);
  });

  it('checks the actual positive-multiple relation rather than the word order, with zero excluded', () => {
    let zero = false, equal = false; const outcomes = new Set<boolean>();
    for (const task of tasks('multiple-positive-direction-claim')) {
      const [, claimedText, baseText] = task.stem.match(/“(\d+)是(\d+)的正倍数/)!, claimed = Number(claimedText), base = Number(baseText);
      const witnesses = Array.from({ length: Math.max(1, claimed) }, (_, i) => base * (i + 1));
      expect(task.answer).toBe(witnesses.includes(claimed)); outcomes.add(Boolean(task.answer)); zero ||= claimed === 0; equal ||= claimed === base;
    }
    expect(zero && equal).toBe(true); expect(outcomes.size).toBe(2);
    expect(tasks('multiple-positive-direction-claim').filter(task => task.answer)).toHaveLength(6);
  });
  it('restores current and next positive multiples by counted repeated groups starting at one', () => {
    let first = false;
    for (const task of tasks('multiple-generation')) {
      const base = Number(task.stem.match(/把(\d+)依次/)![1]), index = Number(task.stem.match(/第(\d+)个正倍数/)![1]);
      const value = Array.from({ length: index }, () => base).reduce((sum, entry) => sum + entry, 0);
      expect(numericEntries(task)).toEqual({ current: value, next: value + base }); first ||= index === 1;
    }
    expect(first).toBe(true);
  });
  it('uses the nonzero first event and one fewer intervals than event count in actual ledgers', () => {
    for (const task of tasks('multiple-offset-event-ledger')) {
      const first = Number(task.stem.match(/第(\d+)分钟记录/)![1]), interval = Number(task.stem.match(/每隔(\d+)分钟/)![1]);
      const target = Number(task.stem.match(/第(\d+)次响铃相对/)![1]);
      const record = rows(task).map(row => row.map(Number)); expect(record[0]).toEqual([1, first]);
      for (let i = 1; i < record.length; i++) { expect(record[i][0]).toBe(record[i - 1][0] + 1); expect(record[i][1] - record[i - 1][1]).toBe(interval); }
      let minute = first; for (let occurrence = 1; occurrence < target; occurrence++) minute += interval;
      expect(numericEntries(task)).toEqual({ intervals: target - 1, minute }); expect(first).toBeGreaterThan(0);
    }
  });
  it('reconstructs inverse full groups without discarding a nonzero remainder', () => {
    const outcomes = new Set<string>();
    for (const task of tasks('multiple-inverse-whole-groups')) {
      const [per, total] = numbers(task.stem), answer = entries(task); let left = total, groups = 0;
      while (left >= per) { left -= per; groups++; }
      expect(answer).toEqual({ groups: String(groups), remainder: String(left), isMultiple: left === 0 ? '是' : '否' }); outcomes.add(answer.isMultiple);
      expect(groups * per + left).toBe(total);
    }
    expect(outcomes).toEqual(new Set(['是', '否']));
  });

  it('finds actual counterexamples to each false list-wide prime claim', () => {
    const paired = new Map<string, Set<boolean>>();
    for (const task of tasks('prime-rule-counterexample')) {
      const values = rows(task).map(row => Number(row[0]));
      const named = values.filter(value => task.stem.includes('所有奇数') ? value % 2 === 1 : divisors(value).length === 2);
      const truth = named.length > 0 && named.every(value => classify(value) === '质数'); expect(task.answer).toBe(truth);
      if (!truth) expect(named.some(value => classify(value) !== '质数')).toBe(true);
      const key = values.join(','); if (!paired.has(key)) paired.set(key, new Set()); paired.get(key)!.add(truth);
    }
    expect(paired.size).toBe(6); expect([...paired.values()].every(values => values.size === 2)).toBe(true);
  });
  it('counts complete positive divisors before classifying one, two, odd composites and larger primes', () => {
    const seen = new Map<number, string>();
    for (const task of tasks('prime-factor-count')) {
      const [value] = numbers(task.stem), all = divisors(value); expect(entries(task)).toEqual({ divisorCount: String(all.length), kind: classify(value) }); seen.set(value, entries(task).kind);
    }
    expect(seen.get(1)).toBe('既不是质数也不是合数'); expect(seen.get(2)).toBe('质数'); expect(seen.get(49)).toBe('合数'); expect(seen.get(97)).toBe('质数');
  });
  it('enumerates non-single-row rectangles and retains the one-square exception', () => {
    const seen = new Map<number, string>();
    for (const task of tasks('prime-nontrivial-rectangle-existence')) {
      const [area] = numbers(task.stem), arrangements = [];
      for (let width = 2; width <= area; width++) for (let height = 2; height <= area; height++) if (width * height === area) arrangements.push([width, height]);
      expect(entries(task)).toEqual({ rectangle: arrangements.length ? '是' : '否', kind: classify(area) }); seen.set(area, entries(task).kind);
    }
    expect(seen.get(1)).toBe('既不是质数也不是合数'); expect(seen.get(2)).toBe('质数'); expect(seen.get(25)).toBe('合数');
  });
  it('distinguishes a nontrivial composite certificate from insufficient evidence even for actual composites', () => {
    let insufficientComposite = 0, sufficient = 0;
    for (const task of tasks('prime-factorization-certificate')) {
      const [, totalText, aText, bText] = task.stem.match(/“(\d+)=(\d+)×(\d+)”/)!, total = Number(totalText), a = Number(aText), b = Number(bText);
      expect(a * b).toBe(total); const proves = a > 1 && a < total && b > 1 && b < total;
      expect(entries(task)).toEqual({ provesComposite: proves ? '是' : '否', nontrivialFactor: String(proves ? a : 0) });
      if (proves) { sufficient++; expect(classify(total)).toBe('合数'); }
      else if (classify(total) === '合数') { insufficientComposite++; expect(task.analysis).toContain('不能由证据不足推断为质数'); }
    }
    expect(sufficient).toBeGreaterThan(0); expect(insufficientComposite).toBe(2);
  });

  it('requires both common divisibility and greatest value in each candidate claim', () => {
    let commonButNotGreatest = 0, notCommon = 0;
    for (const task of tasks('gcd-common-and-largest-claim')) {
      const [candidate, a, b] = numbers(task.stem), shared = sharedDivisors(a, b);
      expect(task.answer).toBe(shared.includes(candidate) && !shared.some(value => value > candidate));
      if (!task.answer) { if (shared.includes(candidate)) commonButNotGreatest++; else notCommon++; }
    }
    expect(commonButNotGreatest > 0 && notCommon > 0).toBe(true);
  });
  it('intersects complete divisor sets and covers equality, divisibility and coprimality', () => {
    let equal = false, divides = false, coprime = false;
    for (const task of tasks('gcd-numbers')) {
      const [a, b] = numbers(task.stem), shared = sharedDivisors(a, b);
      expect(numericEntries(task)).toEqual({ commonCount: shared.length, greatest: shared.at(-1) });
      equal ||= a === b; divides ||= b / a > 1 && Number.isInteger(b / a); coprime ||= shared.length === 1;
    }
    expect(equal && divides && coprime).toBe(true);
  });
  it('enumerates feasible identical shares and multiplies each item count back to its original inventory', () => {
    for (const task of tasks('gcd-sharing')) {
      const [pens, books] = numbers(task.stem), feasible = sharedDivisors(pens, books), answer = numericEntries(task);
      expect(answer.shares).toBe(feasible.at(-1)); expect(answer.pensEach * answer.shares).toBe(pens); expect(answer.booksEach * answer.shares).toBe(books);
      expect(answer.pensEach > 0 && answer.booksEach > 0).toBe(true); expect(feasible.some(value => value > answer.shares)).toBe(false);
    }
  });
  it('checks every larger square side is infeasible and every area is conserved', () => {
    for (const task of tasks('gcd-largest-square-tiling')) {
      const [width, height] = numbers(task.stem), answer = numericEntries(task);
      const sides = Array.from({ length: Math.min(width, height) }, (_, i) => i + 1).filter(side => Number.isInteger(width / side) && Number.isInteger(height / side));
      expect(answer.side).toBe(sides.at(-1)); expect(answer.pieces * answer.side ** 2).toBe(width * height);
      expect(Number.isInteger(answer.pieces)).toBe(true);
    }
  });

  it('requires common, positive and least together, including products that are not least', () => {
    let zero = false, commonButNotLeast = false, notCommon = false;
    for (const task of tasks('lcm-common-positive-minimum-claim')) {
      const [candidate, a, b] = numbers(task.stem), least = firstCommonPositive(a, b); expect(task.answer).toBe(candidate === least);
      if (!task.answer) { zero ||= candidate === 0; commonButNotLeast ||= candidate > least && Number.isInteger(candidate / a) && Number.isInteger(candidate / b);
        notCommon ||= candidate > 0 && (!Number.isInteger(candidate / a) || !Number.isInteger(candidate / b)); }
    }
    expect(zero && commonButNotLeast && notCommon).toBe(true);
  });
  it('searches the first positive common multiple independently and verifies both multiplicities', () => {
    for (const task of tasks('lcm-numbers')) {
      const [a, b] = numbers(task.stem), answer = numericEntries(task), least = firstCommonPositive(a, b);
      expect(answer.least).toBe(least); expect(answer.copiesA * a).toBe(least); expect(answer.copiesB * b).toBe(least); expect(least).toBeGreaterThan(0);
    }
  });
  it('intersects the two actual event timelines after the shared nonzero starting time', () => {
    for (const task of tasks('lcm-cycle')) {
      const [a, b, first] = numbers(task.stem), aTimes = Array.from({ length: b }, (_, i) => first + a * (i + 1));
      const bTimes = new Set(Array.from({ length: a }, (_, i) => first + b * (i + 1))), next = aTimes.find(time => bTimes.has(time))!;
      expect(numericEntries(task)).toEqual({ elapsed: next - first, minute: next }); expect(next).toBeGreaterThan(first);
    }
  });
  it('checks the least inventory under each alternative packaging rather than mixing capacities or adding them', () => {
    for (const task of tasks('lcm-alternative-whole-pack-inventory')) {
      const [a, b] = numbers(task.stem), answer = numericEntries(task), possible: number[] = [];
      for (let inventory = 1; inventory <= a * b; inventory++) if (Number.isInteger(inventory / a) && Number.isInteger(inventory / b)) possible.push(inventory);
      expect(answer.inventory).toBe(possible[0]); expect(answer.boxesA * a).toBe(answer.inventory); expect(answer.boxesB * b).toBe(answer.inventory);
      expect(task.stem).toContain('不是把两种盒子混装');
    }
  });

  it('keeps equivalent historical classification, calculation and context families under their existing identity', () => {
    const definitions = buildFoundationCurriculum(), previousIds = new Set(baseline.ids);
    const reused = ['factor-divisibility', 'multiple-generation', 'prime-factor-count', 'gcd-numbers', 'gcd-sharing', 'lcm-numbers', 'lcm-cycle'];
    for (const name of reused) {
      const family = families.find(row => row.family === name)!, definition = definitions.find(row => row.atom.id === family.atomId)!;
      expect(definition.exercises.some(task => previousIds.has(foundationQuestionId(family.atomId, task)) && task.family === family.family), name).toBe(true);
    }
    expect(families.filter(row => reused.includes(row.family))).toHaveLength(7);
  });
  it('preserves all three explicit relation release bytes', () => {
    for (const [file, sha256] of [['authored-relations-2026-10-20-v1.json', '874bd9ab4be81e7a6ec562ce81e38732ccff6ea71c50afb95f6deb577a65cd8c'],
      ['authored-atomic-relations-2026-10-20-v1.json', '2e9a0b7c2e8d0f4f68da8fd44fc411516ee9bdbd71f42755b6c5428f12fa115e'],
      ['authored-average-atomic-relations-2026-10-20-v1.json', '6022913120d52a0e03a47e614877564befd01d3b249b9209ddd4d7d88c41bc37']]) {
      expect(createHash('sha256').update(readFileSync(resolve(__dirname, '../../../../../resources/curriculum', file))).digest('hex')).toBe(sha256);
    }
  });
  it('validates every standard and legal zero-score protocol response and every nonempty choice subset', () => {
    const modes = new Set<string>();
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task), wrap = (response: unknown) => ({ questionId: schema.questionId, mode: schema.mode, response }); modes.add(schema.mode);
      let right: unknown, wrong: unknown;
      if (schema.mode === 'multi_blank') {
        right = { entries: task.answer }; wrong = { entries: (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: wrongValue(row.value) })) };
      } else if (schema.mode === 'boolean') { right = { value: task.answer }; wrong = { value: !task.answer }; }
      else {
        const expected = task.answer as string[], options = task.options!; right = { values: expected }; wrong = { values: [options.find(option => !expected.includes(option))!] };
        expect(new Set(options).size).toBe(options.length);
        for (let mask = 1; mask < 2 ** options.length; mask++) {
          const values = options.filter((_, i) => mask & 2 ** i), score = JSON.stringify([...values].sort()) === JSON.stringify([...expected].sort()) ? 1 : 0;
          expect(answerProtocolIssue(schema, wrap({ values }))).toBeNull(); expect(gradeResponse(schema, expected, wrap({ values })).score).toBe(score);
          expect(gradeResponse(schema, expected, wrap({ values: [...values].reverse() })).score).toBe(score);
        }
      }
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, wrap(right)), task.stem).toBeNull();
      expect(answerProtocolIssue(schema, wrap(wrong)), task.stem).toBeNull(); expect(gradeResponse(schema, task.answer, wrap(right)).score).toBe(1);
      expect(gradeResponse(schema, task.answer, wrap(wrong)).score).toBe(0);
    }
    expect(modes).toEqual(new Set(['boolean', 'multi_blank', 'multiple_choice']));
  });
  it('retains partial credit for every other field when one observation is incorrect', () => {
    for (const family of families) for (const task of family.exercises.filter(row => row.mode === 'multi_blank')) {
      const answer = task.answer as Array<{ key: string; value: string }>;
      for (const target of answer) {
        const response = answer.map(row => ({ ...row, value: row.key === target.key ? wrongValue(row.value) : row.value }));
        const result = gradeResponse(schemaFor(family.atomId, task), task.answer, response);
        expect(result.score).toBeCloseTo((answer.length - 1) / answer.length, 10); expect(result.scoreDetails).toHaveLength(answer.length);
        expect(result.scoreDetails?.filter(row => !row.score).map(row => row.key)).toEqual([target.key]);
      }
    }
  });
  it('selects two basic and two transfer structures per point in 600 seconds while preserving all evidence requirements', () => {
    const definitions = buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id)); expect(definitions).toHaveLength(5);
    for (const definition of definitions) {
      const specification = verificationBlueprint({ id: 'qa', title: '对照', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id, atomId: definition.atom.id,
        family: task.family, dimension: task.dimension, difficulty: 1, expectedSeconds: task.expectedSeconds ?? 40 } as MeasurementItem; });
      for (const seed of ['first', 'second', 'third']) {
        const selection = selectVerificationItems(specification, items, new Set([definition.atom.id]), seed, 8, 600);
        expect(selection.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(selection.selected.map(item => item.family)).size).toBe(4);
        expect(selection.verification.groups.every(group => group.selectedFamilies.length === 2)).toBe(true); expect(selection.seconds).toBeLessThanOrEqual(600);
      }
      const current = families.filter(row => row.atomId === definition.atom.id); expect(current).toHaveLength(4); expect(current.filter(row => row.dimension === 'transfer')).toHaveLength(2);
      expect(current.flatMap(row => row.exercises)).toHaveLength(48);
    }
    for (const task of families.flatMap(row => row.exercises)) { expect(task.identityVersion).toBe(2); expect(task.expectedSeconds).toBeGreaterThanOrEqual(70); expect(task.expectedSeconds).toBeLessThanOrEqual(115); }
  });
});
