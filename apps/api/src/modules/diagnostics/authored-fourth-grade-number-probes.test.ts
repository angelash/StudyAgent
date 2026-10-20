import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-5678-v1.json';
import { buildFourthGradeNumberProbeFamilies } from './authored-fourth-grade-number-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { arithmeticValue } from './arithmetic-expression';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildFourthGradeNumberProbeFamilies();
const tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const numbers = (value: string) => [...value.matchAll(/\d+/g)].map(match => Number(match[0]));
const entries = (task: Exercise): Record<string, number> => Object.fromEntries((task.answer as Array<{ key: string; value: string }>).map(row => [row.key, Number(row.value)]));
const rows = (task: Exercise) => task.blocks!.find(block => block.type === 'table')!.rows!;
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode ?? 'numeric_blank',
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) });
const roundByDistance = (value: number) => {
  const below = value - value % 1000, above = below + 1000;
  return above - value <= value - below ? above : below;
};

describe('fourth-grade number classes, approximation and operation contrasts', () => {
  it('preserves all 5678 frozen task objects and IDs while adding 288 unique original tasks in 24 structures', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const frozenIds = new Set(baseline.ids), previous = all.filter(row => frozenIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(frozenIds.size).toBe(5678); expect(previous).toHaveLength(5678);
    expect(baseline.sha256).toBe('707c3cf993c19e957e9b4773904c0666551f3aa6136d8e039c6bb8ad1edd25cf');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(families).toHaveLength(24); expect(new Set(families.map(row => row.atomId)).size).toBe(6);
    const additions = families.flatMap(row => row.exercises.map(exercise => ({ atomId: row.atomId, id: foundationQuestionId(row.atomId, exercise), exercise })));
    expect(additions).toHaveLength(288); expect(new Set(additions.map(row => row.id)).size).toBe(288);
    const semantic = (row: typeof all[number]) => JSON.stringify([row.atomId, row.exercise.stem, row.exercise.blocks, row.exercise.responseShape]);
    const oldSemantics = new Set(previous.map(semantic)); expect(new Set(additions.map(semantic)).size).toBe(288);
    for (const row of additions) { expect(frozenIds.has(row.id)).toBe(false); expect(oldSemantics.has(semantic(row)), row.exercise.stem).toBe(false); }
    expect(new Set(all.map(row => row.id)).size).toBe(all.length);
    for (const atomId of new Set(families.map(row => row.atomId))) expect(additions.filter(row => row.atomId === atomId)).toHaveLength(48);
  });

  it('checks number-class claims by expanding actual counting units and pairs both claims for each composition', () => {
    const paired = new Map<string, Set<boolean>>();
    for (const task of tasks('number-class-zero-place-audit')) {
      const [wan, ones, written] = numbers(task.stem), digits = `${wan}${String(ones).padStart(4, '0')}`;
      expect(task.answer).toBe(Number(digits) === written);
      const key = `${wan}:${ones}`; if (!paired.has(key)) paired.set(key, new Set()); paired.get(key)!.add(task.answer as boolean);
      expect(wan).toBeGreaterThan(0); expect(ones).toBeLessThan(1000);
    }
    expect(paired.size).toBe(6); expect([...paired.values()].every(values => values.size === 2)).toBe(true);
  });
  it('composes complete numbers from the displayed unit table with all four individual-class positions intact', () => {
    const individualClasses = [];
    for (const task of tasks('number-class-compose')) {
      const [wan, individual] = rows(task).map(row => numbers(row[1])[0]); individualClasses.push(individual);
      const wholeDigits = `${wan}${String(individual).padStart(4, '0')}`;
      expect(entries(task)).toEqual({ wanValue: wan * 10 ** 4, whole: Number(wholeDigits) });
      expect(individual).toBeGreaterThanOrEqual(0); expect(individual).toBeLessThan(10000);
    }
    expect(individualClasses).toContain(0); expect(individualClasses.some(value => value > 0 && value < 10)).toBe(true);
    expect(individualClasses.some(value => value >= 1000)).toBe(true);
  });
  it('recovers full boxes from the actual exact inventory and excluded loose cards', () => {
    for (const task of tasks('number-class-inventory-boxes-inverse')) {
      const [perBox, total, loose] = numbers(task.stem), boxes = Number(task.answer);
      expect(boxes * perBox + loose).toBe(total); expect(loose).toBeGreaterThanOrEqual(0); expect(loose).toBeLessThan(perBox);
      expect(boxes).toBe(Math.trunc(total / perBox));
    }
  });
  it('reconstructs masked classes using the declared unit and retains a legitimately zero individual class', () => {
    const units = new Set<string>(); let zeroIndividual = false;
    for (const task of tasks('number-class-masked-ledger-recovery')) {
      const [total] = numbers(task.stem), record = rows(task), hidden = record.find(row => row[2] === '被遮住')!; units.add(hidden[1]);
      const totalFromRows = record.reduce((sum, row) => sum + Number(row[2] === '被遮住' ? task.answer : row[2]) * (row[1] === '万' ? 10000 : 1), 0);
      expect(totalFromRows).toBe(total);
      if (hidden[1] === '一') { expect(task.answer).toBe(total % 10000); zeroIndividual ||= task.answer === 0; }
      else expect(task.answer).toBe(Math.floor(total / 10000));
    }
    expect(units).toEqual(new Set(['万', '一'])); expect(zeroIndividual).toBe(true);
  });

  it('checks rounding claims by distances rather than reading the final digit or truncating', () => {
    const observed = new Map<number, Set<boolean>>();
    for (const task of tasks('round-thousand-midpoint-claim')) {
      const [exact, claim] = numbers(task.stem); expect(task.answer).toBe(roundByDistance(exact) === claim);
      if (!observed.has(exact)) observed.set(exact, new Set()); observed.get(exact)!.add(task.answer as boolean);
    }
    expect([...observed.values()].every(values => values.size === 2)).toBe(true);
    expect(observed.has(4499) && observed.has(4500) && observed.has(9500) && observed.has(9999)).toBe(true);
  });
  it('records rounding distances including exact thousands and carries across ten thousand', () => {
    let ties = 0, exactThousands = 0, crossing = 0;
    for (const task of tasks('round-thousand')) {
      const [value] = numbers(task.stem), answer = entries(task), lower = value - value % 1000;
      expect(answer).toEqual({ lower, distanceDown: value - lower, distanceUp: lower + 1000 - value, rounded: roundByDistance(value) });
      expect(answer.distanceDown + answer.distanceUp).toBe(1000);
      if (answer.distanceDown === answer.distanceUp) { ties++; expect(answer.rounded).toBe(lower + 1000); }
      if (value % 1000 === 0) { exactThousands++; expect(answer.rounded).toBe(value); }
      if (value < 10000 && answer.rounded === 10000) crossing++;
    }
    expect(ties).toBeGreaterThan(0); expect(exactThousands).toBeGreaterThan(0); expect(crossing).toBeGreaterThan(0);
  });
  it('enumerates inverse rounding intervals and rejects both neighboring integers, including zero', () => {
    let atZero = false;
    for (const task of tasks('round-thousand-inverse-integer-range')) {
      const [target] = numbers(task.stem), answer = entries(task), candidates = [];
      for (let exact = Math.max(0, target - 1000); exact <= target + 1000; exact++) if (roundByDistance(exact) === target) candidates.push(exact);
      expect(answer).toEqual({ minimum: candidates[0], maximum: candidates.at(-1) });
      expect(candidates).toHaveLength(target ? 1000 : 500);
      if (answer.minimum > 0) expect(roundByDistance(answer.minimum - 1)).not.toBe(target);
      expect(roundByDistance(answer.maximum + 1)).not.toBe(target);
      if (!target) { atZero = true; expect(answer.minimum).toBe(0); }
    }
    expect(atZero).toBe(true);
  });
  it('uses exact stock to measure shortages and leftovers even when approximate comparisons point the other way', () => {
    let misleadingEnough = 0, misleadingShortage = 0, equal = 0;
    for (const task of tasks('round-thousand-exact-stock-decision')) {
      const [stock, approx, need] = rows(task).map(row => Number(row[1])), answer = entries(task);
      expect(approx).toBe(roundByDistance(stock)); expect(answer.shortfall * answer.remaining).toBe(0);
      expect(stock + answer.shortfall).toBe(need + answer.remaining);
      expect(answer.shortfall).toBeGreaterThanOrEqual(0); expect(answer.remaining).toBeGreaterThanOrEqual(0);
      if (approx >= need && stock < need) misleadingEnough++;
      if (approx < need && stock >= need) misleadingShortage++;
      if (need === stock) { equal++; expect(answer).toEqual({ shortfall: 0, remaining: 0 }); }
    }
    expect(misleadingEnough).toBeGreaterThan(0); expect(misleadingShortage).toBeGreaterThan(0); expect(equal).toBeGreaterThan(0);
  });

  for (const [prefix, direct, digits] of [['multiply-two', 'multiply-two-symbol', 2], ['multiply-large', 'multiply-large-column', 3]] as const) {
    it(`rechecks ${digits}-digit multiplicand tens-unit claims using repeated addition of actual tens groups`, () => {
      const groups = new Map<string, Set<boolean>>();
      for (const task of tasks(`${prefix}-tens-part-unit-audit`)) {
        const [a, multiplier, tensDigit, statedTens, claim] = numbers(task.stem);
        expect(String(a)).toHaveLength(digits); expect(tensDigit).toBe(statedTens); expect(tensDigit).toBe(Math.floor(multiplier / 10));
        const quantity = Array.from({ length: statedTens * 10 }, () => a).reduce((sum, value) => sum + value, 0);
        expect(task.answer).toBe(quantity === claim);
        const key = `${a},${multiplier}`; if (!groups.has(key)) groups.set(key, new Set()); groups.get(key)!.add(task.answer as boolean);
      }
      expect(groups.size).toBe(6); expect([...groups.values()].every(values => values.size === 2)).toBe(true);
    });
    it(`independently recomputes both ${digits}-digit partial products, retaining zero parts and internal zeros`, () => {
      let zeroPart = 0, internalOrFinalZero = 0;
      for (const task of tasks(direct)) {
        const [a, multiplier] = numbers(task.stem), answer = entries(task), units = multiplier % 10, tensValue = multiplier - units;
        expect(answer).toEqual({ onesProduct: a * units, tensProduct: a * tensValue, total: a * multiplier });
        expect(answer.onesProduct + answer.tensProduct).toBe(answer.total);
        if (!units) { zeroPart++; expect(answer.onesProduct).toBe(0); }
        if (String(a).includes('0')) internalOrFinalZero++;
      }
      expect(zeroPart).toBeGreaterThan(0); expect(internalOrFinalZero).toBeGreaterThan(0);
    });
  }
  it('evaluates every seating-model option against the actual two-zone coverage, with the answer in varied positions', () => {
    const positions = new Set<number>();
    for (const task of tasks('multiply-two-split-seating')) {
      const [left, right, rowCount] = rows(task).map(row => Number(row[1])), totalSeats = (left + right) * rowCount;
      const valid = task.options!.filter(option => arithmeticValue(option) === totalSeats);
      expect(valid).toEqual([task.answer]); positions.add(task.options!.indexOf(String(task.answer)));
      expect(left + right).toBeGreaterThanOrEqual(10); expect(left + right).toBeLessThan(100);
    }
    expect(positions).toEqual(new Set([0, 1, 2]));
  });
  it('recovers missing row coverage without returning all rows or all seats', () => {
    for (const task of tasks('multiply-two-restore-row-count')) {
      const [perRow, knownRows, totalSeats] = numbers(task.stem), answer = entries(task);
      expect(perRow * knownRows + answer.missingSeats).toBe(totalSeats);
      expect(answer.missingRows * perRow).toBe(answer.missingSeats);
      expect(answer.missingRows).toBeGreaterThan(0); expect(answer.missingSeats).toBeLessThan(totalSeats);
    }
  });
  it('recovers the omitted second shipment from displayed box units and combined piece count', () => {
    for (const task of tasks('multiply-large-batch-missing')) {
      const [perBox, firstBoxes, allPieces] = rows(task).map(row => Number(row[1])), answer = entries(task);
      expect(answer.secondPieces + perBox * firstBoxes).toBe(allPieces);
      expect(answer.secondBoxes * perBox).toBe(answer.secondPieces);
      expect(answer.secondBoxes).toBeGreaterThan(0); expect(answer.secondPieces).toBeLessThan(allPieces);
    }
  });
  it('reconciles actual piece quantities even when the combined number of boxes is identical', () => {
    const truth = new Set<boolean>(); let sameBoxesDifferentPieces = 0;
    for (const task of tasks('multiply-large-ledger-reconciliation')) {
      const [a, b, c] = rows(task).map(row => ({ pieces: Number(row[1]), boxes: Number(row[2]) }));
      const samePieces = a.pieces * a.boxes === b.pieces * b.boxes + c.pieces * c.boxes;
      expect(task.answer).toBe(samePieces); truth.add(task.answer as boolean);
      expect(b.boxes + c.boxes).toBe(a.boxes); if (!samePieces) sameBoxesDifferentPieces++;
    }
    expect(truth.size).toBe(2); expect(sameBoxesDifferentPieces).toBe(6);
  });

  it('covers excessive, insufficient and exact trial quotients through actual multiplication back', () => {
    const outcomes = new Set<number>();
    for (const task of tasks('divide-two-trial-total-audit')) {
      const [total, perBox, trial] = numbers(task.stem), difference = trial * perBox - total;
      outcomes.add(Math.sign(difference)); expect(task.answer).toBe(difference === 0); expect(total % perBox).toBe(0);
    }
    expect(outcomes).toEqual(new Set([-1, 0, 1]));
  });
  it('reconstructs long division groups and unallocated quantity including an explicitly zero quotient unit', () => {
    let zeroUnits = 0;
    for (const task of tasks('divide-two-symbol')) {
      const [total, divisor] = numbers(task.stem), answer = entries(task);
      expect(answer.quotient * divisor).toBe(total); expect(answer.tensGroups % 10).toBe(0);
      expect(answer.tensGroups * divisor).toBe(answer.grouped);
      expect(answer.grouped + answer.unallocated).toBe(total); expect(answer.unallocated).toBeLessThan(divisor * 10);
      expect(answer.onesGroups * divisor).toBe(answer.unallocated); expect(answer.tensGroups + answer.onesGroups).toBe(answer.quotient);
      if (!answer.unallocated) { zeroUnits++; expect(answer.onesGroups).toBe(0); }
    }
    expect(zeroUnits).toBeGreaterThan(0);
  });
  it('rejects the forged multiplication-back row even though its written product equals the exact total', () => {
    const answerRows = new Set<string>();
    for (const task of tasks('divide-two-trial-ledger-selection')) {
      const [total, divisor] = numbers(task.stem), ledger = rows(task);
      const valid = ledger.filter(row => Number(row[1]) * divisor === Number(row[2]) && Number(row[2]) === total).map(row => row[0]);
      expect(valid).toEqual([task.answer]); expect(task.options!.slice().sort()).toEqual(ledger.map(row => row[0]).sort());
      const forged = ledger.filter(row => Number(row[1]) * divisor !== Number(row[2]) && Number(row[2]) === total);
      expect(forged).toHaveLength(1); expect(forged[0][0]).not.toBe(task.answer); answerRows.add(String(task.answer));
    }
    expect(answerRows).toEqual(new Set(['甲', '乙', '丙']));
  });
  it('subtracts already packed books before determining additional full boxes', () => {
    for (const task of tasks('divide-two-stock-additional-boxes')) {
      const [total, perBox, packedBoxes] = numbers(task.stem), answer = entries(task);
      expect(answer.unpackedBooks + perBox * packedBoxes).toBe(total);
      expect(answer.additionalBoxes * perBox).toBe(answer.unpackedBooks);
      expect(answer.additionalBoxes).toBeLessThan(total / perBox); expect(total % perBox).toBe(0);
    }
  });

  it('independently evaluates both sides of each distribution claim and includes both outcomes for the same factors', () => {
    const outcomes = new Map<string, Set<boolean>>();
    for (const task of tasks('distribute-equality-audit')) {
      const expression = task.stem.match(/等式(.+)。这条/)![1], [left, right] = expression.split('=');
      expect(task.answer).toBe(arithmeticValue(left) === arithmeticValue(right));
      if (!outcomes.has(left)) outcomes.set(left, new Set()); outcomes.get(left)!.add(task.answer as boolean);
    }
    expect(outcomes.size).toBe(6); expect([...outcomes.values()].every(values => values.size === 2)).toBe(true);
  });
  it('records both actual distributed products including the zero second part', () => {
    let zeroPart = false;
    for (const task of tasks('distribute-linked-products')) {
      const [factor, first, second] = numbers(task.stem), answer = entries(task);
      expect(answer).toEqual({ firstProduct: factor * first, secondProduct: factor * second, total: factor * (first + second) });
      expect(answer.firstProduct + answer.secondProduct).toBe(answer.total); if (!second) zeroPart = true;
    }
    expect(zeroPart).toBe(true);
  });
  it('recovers the shared headcount from both fee lines and keeps per-person cost distinct from totals', () => {
    for (const task of tasks('distribute-recover-common-count')) {
      const [material, tools] = rows(task).map(row => ({ unit: Number(row[1]), subtotal: Number(row[2]) })), answer = entries(task);
      expect(material.subtotal / material.unit).toBe(answer.commonCount); expect(tools.subtotal / tools.unit).toBe(answer.commonCount);
      expect(answer.perPerson).toBe(material.unit + tools.unit);
      expect(answer.commonCount * answer.perPerson).toBe(material.subtotal + tools.subtotal);
    }
  });
  it('requires a truly shared amount before combining the two material counts into identical portions', () => {
    const truth = new Set<boolean>();
    for (const task of tasks('distribute-shared-quantity-condition')) {
      const [combinedCount, proposedUnit] = numbers(task.stem), [a, b] = rows(task).map(row => ({ unit: Number(row[1]), count: Number(row[2]) }));
      expect(combinedCount).toBe(a.count + b.count); expect(proposedUnit).toBe(a.unit);
      expect(task.answer).toBe(a.unit === b.unit && a.unit * a.count + b.unit * b.count === proposedUnit * combinedCount);
      truth.add(task.answer as boolean);
    }
    expect(truth.size).toBe(2);
  });

  it('keeps direct multiplication, division, composition and rounding in their original families', () => {
    const definitions = buildFoundationCurriculum(), frozenIds = new Set(baseline.ids);
    for (const family of families.filter(row => ['multiply-two-symbol', 'multiply-large-column', 'divide-two-symbol', 'number-class-compose', 'round-thousand'].includes(row.family))) {
      const previous = definitions.find(row => row.atom.id === family.atomId)!.exercises.filter(task => frozenIds.has(foundationQuestionId(family.atomId, task)));
      expect(previous.some(task => task.family === family.family), family.family).toBe(true);
      expect(family.dimension).toBe('procedure');
    }
  });
  it('validates every objective answer and all choice distractors, with legal independently zero-scoring responses', () => {
    const modes = new Set<string>();
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task), config = answerInputConfiguration(schema); modes.add(schema.mode);
      const wrap = (response: unknown) => ({ questionId: schema.questionId, mode: schema.mode, response });
      let right: unknown, wrong: unknown;
      if (schema.mode === 'multi_blank') {
        right = { entries: task.answer };
        wrong = { entries: (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: String(Number(row.value) + 1) })) };
        expect((schema.responseShape.entries as Array<{ key: string }>).map(row => row.key)).toEqual((task.answer as Array<{ key: string }>).map(row => row.key));
      } else if (schema.mode === 'boolean') { right = { value: task.answer }; wrong = { value: !task.answer }; }
      else if (schema.mode === 'single_choice') {
        right = { value: task.answer }; wrong = { value: task.options!.find(option => option !== task.answer) };
        expect(new Set(task.options).size).toBe(task.options!.length);
        for (const option of task.options!) expect(gradeResponse(schema, task.answer, wrap({ value: option })).score).toBe(option === task.answer ? 1 : 0);
      } else { right = { value: task.answer }; wrong = { value: Number(task.answer) + 1 }; }
      expect(config.supported).toBe(true);
      expect(answerProtocolIssue(schema, wrap(right)), task.stem).toBeNull(); expect(answerProtocolIssue(schema, wrap(wrong)), task.stem).toBeNull();
      expect(gradeResponse(schema, task.answer, wrap(right)).score, task.stem).toBe(1);
      expect(gradeResponse(schema, task.answer, wrap(wrong)).score, task.stem).toBe(0);
    }
    expect(modes).toEqual(new Set(['boolean', 'multi_blank', 'numeric_blank', 'single_choice']));
  });
  it('retains each intermediate error and all other credit even when the final field is correct', () => {
    for (const family of families) for (const task of family.exercises.filter(row => row.mode === 'multi_blank')) {
      const answer = task.answer as Array<{ key: string; value: string }>;
      for (let changed = 0; changed < answer.length; changed++) {
        const response = answer.map((row, index) => ({ ...row, value: index === changed ? String(Number(row.value) + 1) : row.value }));
        const result = gradeResponse(schemaFor(family.atomId, task), task.answer, response);
        expect(result.score).toBeCloseTo((answer.length - 1) / answer.length, 10);
        expect(result.scoreDetails?.filter(row => !row.score).map(row => row.key)).toEqual([answer[changed].key]);
        expect(result.scoreDetails?.length).toBe(answer.length);
        if (changed < answer.length - 1) expect(result.scoreDetails!.at(-1)!.score).toBe(1);
      }
    }
  });
  it('provides two basic and two transfer families within 600 seconds without changing evidence requirements', () => {
    const definitions = buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id));
    expect(definitions).toHaveLength(6);
    for (const definition of definitions) {
      const specification = verificationBlueprint({ id: 'qa', title: '对照', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id, atomId: definition.atom.id,
        dimension: task.dimension, family: task.family, difficulty: 1, expectedSeconds: task.expectedSeconds ?? 40 } as MeasurementItem; });
      for (const seed of ['first', 'second', 'third']) {
        const selection = selectVerificationItems(specification, items, new Set([definition.atom.id]), seed, 8, 600);
        expect(selection.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(selection.selected.map(item => item.family)).size).toBe(4);
        expect(selection.verification.groups.every(group => group.selectedFamilies.length === 2)).toBe(true); expect(selection.seconds).toBeLessThanOrEqual(600);
      }
      const authored = families.filter(row => row.atomId === definition.atom.id);
      expect(authored.filter(row => row.dimension === 'transfer')).toHaveLength(2);
    }
    for (const task of families.flatMap(row => row.exercises)) {
      expect(task.expectedSeconds).toBeGreaterThanOrEqual(75); expect(task.expectedSeconds).toBeLessThanOrEqual(120);
      expect(task.identityVersion).toBe(2);
      if (task.mode === 'multi_blank') expect(task.expectedSeconds).toBeGreaterThanOrEqual((task.answer as unknown[]).length * 15);
    }
  });
});
