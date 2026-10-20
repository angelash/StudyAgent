import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-5678-v1.json';
import { buildFourthGradeNumberProbeFamilies } from './authored-fourth-grade-number-probes';
import { buildRemainderDecimalProbeFamilies } from './authored-remainder-decimal-probes';
import { buildFourthGradeGeometryStatisticsProbeFamilies } from './authored-fourth-grade-geometry-statistics-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { arithmeticValue } from './arithmetic-expression';
import { canonicalFamily } from './family-identity';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildFourthGradeGeometryStatisticsProbeFamilies();
const tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const numbers = (value: string) => [...value.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
const entries = (task: Exercise): Record<string, string> => Object.fromEntries((task.answer as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
const numeric = (task: Exercise): Record<string, number> => Object.fromEntries(Object.entries(entries(task)).map(([key, value]) => [key, Number(value)]));
const rows = (task: Exercise) => task.blocks!.find(block => block.type === 'table')!.rows!;
const directory = resolve(__dirname, '../../../../web/public/question-assets/fourth-grade-geometry-statistics-v1');
const drawing = (task: Exercise) => readFileSync(resolve(directory, task.blocks!.find(block => block.type === 'image')!.url!.split('/').at(-1)!), 'utf8');
const attrs = (tag: string): Record<string, string> => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const tags = (body: string, role: string) => [...body.matchAll(/<(?:rect|line|polygon|text)\s[^>]+>/g)].map(match => attrs(match[0])).filter(row => row['data-role'] === role);
const ray = (row: Record<string, string>) => [Number(row.x2) - Number(row.x1), Number(row.y2) - Number(row.y1)];
const between = (a: number[], b: number[]) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / Math.hypot(...a) / Math.hypot(...b)))) * 180 / Math.PI;
const vertices = (body: string) => tags(body, 'triangle')[0].points.split(' ').map(point => point.split(',').map(Number));
const angles = (points: number[][]) => points.map((point, i) => between(points[(i + 1) % 3].map((x, k) => x - point[k]), points[(i + 2) % 3].map((x, k) => x - point[k])));
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode ?? 'numeric_blank',
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) });
const wrong = (value: string) => Number.isFinite(Number(value)) ? String(Number(value) + 1) : 'QA未达标';

describe('fourth-grade area, angles and statistical conservation contrasts', () => {
  it('preserves the full 6158-task historical set and adds 240 distinct tasks in twenty structures', () => {
    const frozenIds = new Set([...baseline.ids, ...[...buildFourthGradeNumberProbeFamilies(), ...buildRemainderDecimalProbeFamilies()]
      .flatMap(row => row.exercises.map(task => foundationQuestionId(row.atomId, task)))]);
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const previous = all.filter(row => frozenIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(frozenIds.size).toBe(6158); expect(previous).toHaveLength(6158);
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe('3b1ced64222f14e95d15113dd1c60856ad95031a9adc1e6edea7cf74cc7f73c1');
    expect(families).toHaveLength(20); expect(new Set(families.map(row => row.atomId)).size).toBe(5);
    const additions = families.flatMap(row => row.exercises.map(exercise => ({ atomId: row.atomId, id: foundationQuestionId(row.atomId, exercise), exercise })));
    const semantics = (row: typeof all[number]) => JSON.stringify([row.atomId, row.exercise.stem, row.exercise.blocks, row.exercise.responseShape]);
    expect(additions).toHaveLength(240); expect(new Set(additions.map(row => row.id)).size).toBe(240);
    expect(new Set(additions.map(semantics)).size).toBe(240); const oldSemantics = new Set(previous.map(semantics));
    for (const row of additions) { expect(frozenIds.has(row.id)).toBe(false); expect(oldSemantics.has(semantics(row)), row.exercise.stem).toBe(false); }
    expect(new Set(all.map(row => row.id)).size).toBe(all.length);
    for (const atomId of new Set(families.map(row => row.atomId))) expect(additions.filter(row => row.atomId === atomId)).toHaveLength(48);
  });

  it('keeps previous geometry asset bytes and both frozen prerequisite releases unchanged', () => {
    const previous = JSON.parse(readFileSync(resolve(__dirname, '../../../../../doc/evidence/2026-10-20/family-identity-content-audit.json'), 'utf8')).sourceSha256 as Record<string, string>;
    const names = Object.keys(previous).filter(name => name.startsWith('apps/web/public/question-assets/geometry-probes-v1/'));
    expect(names).toHaveLength(38);
    for (const name of names) expect(createHash('sha256').update(readFileSync(resolve(__dirname, '../../../../..', name))).digest('hex')).toBe(previous[name]);
    for (const [name, expected] of [['authored-relations-2026-10-20-v1.json', '874bd9ab4be81e7a6ec562ce81e38732ccff6ea71c50afb95f6deb577a65cd8c'],
      ['authored-atomic-relations-2026-10-20-v1.json', '2e9a0b7c2e8d0f4f68da8fd44fc411516ee9bdbd71f42755b6c5428f12fa115e']]) {
      expect(createHash('sha256').update(readFileSync(resolve(__dirname, '../../../../../resources/curriculum', name))).digest('hex')).toBe(expected);
    }
  });

  it('checks actual rectangle area quantities and units, including both kinds of invalid claim', () => {
    const errors = new Set<string>(), outcomes = new Map<string, Set<boolean>>();
    for (const task of tasks('rectangle-area-boundary-unit-audit')) {
      const [length, width] = numbers(task.stem), [claim, unit] = task.stem.match(/“(\d+)(平方厘米|厘米)”/)!.slice(1);
      const correct = Number(claim) === Array.from({ length: width }, () => Array(length).fill(1)).flat().length && unit === '平方厘米';
      expect(task.answer).toBe(correct); if (!correct) errors.add(unit === '厘米' ? 'linear-unit' : 'boundary-as-coverage');
      const key = `${length}:${width}`; if (!outcomes.has(key)) outcomes.set(key, new Set()); outcomes.get(key)!.add(Boolean(task.answer));
    }
    expect(errors.size).toBe(2); expect([...outcomes.values()].every(values => values.size === 2)).toBe(true);
  });

  it('reconstructs every complete row of unit squares from the rectangle procedure', () => {
    for (const task of tasks('area-direct')) {
      const [a, b, unit] = numbers(task.stem), record = numeric(task), grid = Array.from({ length: b }, () => Array(a).fill(unit * unit));
      expect(unit).toBe(1); expect(record.columns).toBe(grid[0].length); expect(record.rows).toBe(grid.length);
      expect(record.area).toBe(grid.flat().reduce((a, b) => a + b, 0));
    }
  });

  it('rebuilds the given rectangle coverage from the recovered missing edge', () => {
    for (const task of tasks('rectangle-area-recover-edge')) {
      const [area, length] = numbers(task.stem), record = numeric(task);
      expect(record.rows).toBe(record.width); expect(record.width).toBeGreaterThan(0); expect(record.width).toBeLessThan(length);
      expect(Array.from({ length: record.width }, () => Array(length).fill(1)).flat()).toHaveLength(area);
    }
  });

  it('counts both actual boundaries and coverages for equal-perimeter rectangles', () => {
    for (const task of tasks('rectangle-equal-perimeter-area-comparison')) {
      const shapes = rows(task).map(row => row.slice(1).map(Number)), record = numeric(task);
      const perimeters = shapes.map(([length, width]) => [length, width, length, width].reduce((a, b) => a + b, 0));
      const areas = shapes.map(([length, width]) => Array.from({ length: width }, () => Array(length).fill(1)).flat().length);
      expect(perimeters).toEqual([record.perimeter, record.perimeter]); expect(areas).toEqual([record.aArea, record.bArea]);
      expect(areas[1] - areas[0]).toBe(record.difference); expect(record.difference).toBeGreaterThan(0);
    }
  });

  it('pairs true invariance and false edge-length claims for the same unchanged angle opening', () => {
    const outcomes = new Map<string, Set<boolean>>();
    for (const task of tasks('angle-opening-invariance-audit')) {
      const [opening, turn] = numbers(task.stem), trueClaim = task.stem.includes('类别也不变');
      expect(task.stem).toContain('开口保持原样'); expect(task.answer).toBe(trueClaim); expect(turn).toBeGreaterThan(0);
      const key = `${opening}:${turn}`; if (!outcomes.has(key)) outcomes.set(key, new Set()); outcomes.get(key)!.add(Boolean(task.answer));
    }
    expect(outcomes.size).toBe(6); expect([...outcomes.values()].every(values => values.size === 2)).toBe(true);
  });

  it('handles 0, 89, 90, 91 and 180 degree boundaries with strict inequalities', () => {
    const seen = new Map<number, string>();
    for (const task of tasks('angle-threshold')) {
      const [opening] = numbers(task.stem);
      const expected = opening === 0 || opening === 180 ? '不属于锐角、直角或钝角' : opening === 90 ? '直角' : opening <= 89 ? '锐角' : '钝角';
      expect(task.answer).toBe(expected); seen.set(opening, String(task.answer));
    }
    expect([0, 89, 90, 91, 180].every(value => seen.has(value))).toBe(true);
  });

  it('derives rotated diagram openings from actual vectors and an independently verified right-angle reference', () => {
    const counts = new Map<string, number>();
    for (const task of tasks('angle-rotated-visual-reference')) {
      const body = drawing(task), rays = tags(body, 'angle-ray'), reference = tags(body, 'reference-ray');
      expect(rays).toHaveLength(2); expect(reference).toHaveLength(2);
      const actual = between(ray(rays[0]), ray(rays[1])); expect(between(ray(reference[0]), ray(reference[1]))).toBeCloseTo(90, 5);
      const expected = Math.abs(actual - 90) < 0.0001 ? '直角' : actual < 90 ? '锐角' : '钝角';
      expect(task.answer).toBe(expected); expect(actual).toBeCloseTo(Number(task.blocks![0].alt!.match(/开口(\d+)度/)![1]), 4);
      expect(Math.hypot(...ray(rays[0]))).not.toBeCloseTo(Math.hypot(...ray(rays[1])), 3);
      counts.set(expected, (counts.get(expected) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([4, 4, 4]);
  });

  it('restores the other part of a straight angle and classifies that part rather than the given one', () => {
    const classes = new Set<string>();
    for (const task of tasks('angle-straight-split-recovery')) {
      const [whole, given] = numbers(task.stem), record = entries(task), restored = Number(record.degrees);
      expect(whole).toBe(180); expect(given + restored).toBe(whole); expect(restored).toBeGreaterThan(0); expect(restored).toBeLessThan(180);
      expect(record.kind).toBe(restored === 90 ? '直角' : restored < 90 ? '锐角' : '钝角'); classes.add(record.kind);
    }
    expect(classes.size).toBe(3);
  });

  it('rejects zero-angle degeneracy even when the candidate triangle sum equals 180', () => {
    const errors = new Set<string>();
    for (const task of tasks('triangle-positive-angle-sum-audit')) {
      const parts = numbers(task.stem), total = parts.reduce((a, b) => a + b, 0);
      const valid = parts.every(value => value > 0 && value < 180) && total === 180;
      expect(parts).toHaveLength(3); expect(task.answer).toBe(valid);
      if (!valid) errors.add(total === 180 ? 'degenerate' : 'sum');
    }
    expect(errors).toEqual(new Set(['sum', 'degenerate']));
  });

  it('conserves all three positive angles and the intermediate known sum in the direct procedure', () => {
    for (const task of tasks('triangle-third-angle')) {
      const [a, b] = numbers(task.stem), record = numeric(task);
      expect(record.knownSum).toBe(a + b); expect(a + b + record.third).toBe(180); expect(record.third).toBeGreaterThan(0);
    }
  });

  it('checks all actual isosceles vertex angles against the explicit equality and given angle', () => {
    const givenVertices = new Set<string>();
    for (const task of tasks('triangle-explicit-equal-angle-recovery')) {
      const actual = angles(vertices(drawing(task))), record = numeric(task), match = task.stem.match(/已知∠([AC])=(\d+)°/)!;
      expect(task.stem).toContain('明确满足∠A=∠B'); expect(actual[0]).toBeCloseTo(actual[1], 4); expect(actual.reduce((a, b) => a + b, 0)).toBeCloseTo(180, 4);
      expect(actual[match[1] === 'A' ? 0 : 2]).toBeCloseTo(Number(match[2]), 4);
      for (const [i, key] of ['a', 'b', 'c'].entries()) expect(record[key]).toBeCloseTo(actual[i], 4);
      givenVertices.add(match[1]);
    }
    expect(givenVertices).toEqual(new Set(['C', 'A']));
  });

  it('reconstructs adjacent external angles from the real extension direction before using the triangle sum', () => {
    for (const task of tasks('triangle-exterior-adjacent-recovery')) {
      const body = drawing(task), points = vertices(body), actual = angles(points), extension = tags(body, 'extension')[0], record = numeric(task);
      const external = Number(task.stem.match(/∠DAC=(\d+)°/)![1]), knownB = Number(task.stem.match(/∠ABC=(\d+)°/)![1]);
      const [a, b, c] = points, ad = [Number(extension.x1) - a[0], Number(extension.y1) - a[1]], ab = b.map((x, i) => x - a[i]);
      expect(between(ad, ab)).toBeCloseTo(180, 5); expect(Number(extension.x2)).toBeCloseTo(a[0], 5); expect(Number(extension.y2)).toBeCloseTo(a[1], 5);
      expect(between(ad, c.map((x, i) => x - a[i]))).toBeCloseTo(external, 4);
      expect(actual[1]).toBeCloseTo(knownB, 4); expect(record.a + external).toBe(180); expect(record.a).toBeCloseTo(actual[0], 4); expect(record.c).toBeCloseTo(actual[2], 4);
    }
  });

  it('audits redistribution by conserving the actual initial total and number of boxes', () => {
    const outcomes = new Map<string, Set<boolean>>();
    for (const task of tasks('average-redistribution-conservation-audit')) {
      const [a, b, c, claim] = numbers(task.stem); expect(task.answer).toBe(a + b + c === claim * 3);
      expect(new Set([a, b, c]).size).toBe(3); const key = `${a},${b},${c}`;
      if (!outcomes.has(key)) outcomes.set(key, new Set()); outcomes.get(key)!.add(Boolean(task.answer));
    }
    expect(outcomes.size).toBe(6); expect([...outcomes.values()].every(values => values.size === 2)).toBe(true);
  });

  it('includes zero-day records in the actual count before averaging reading totals', () => {
    let zeroRecords = 0;
    for (const task of tasks('average-three-days')) {
      const values = rows(task).map(row => Number(row[1])), record = numeric(task), total = values.reduce((a, b) => a + b, 0);
      expect(record.count).toBe(values.length); expect(record.total).toBe(total); expect(record.mean * record.count).toBe(total);
      zeroRecords += values.filter(value => !value).length; expect(Number.isInteger(record.mean)).toBe(true);
    }
    expect(zeroRecords).toBe(4);
  });

  it('uses the recovered missing datum to rebuild all four contributions constrained by the given average', () => {
    for (const task of tasks('average-missing-datum-recovery')) {
      const [mean, a, b, c] = numbers(task.stem), record = numeric(task);
      expect(a + b + c + record.missing).toBe(record.total); expect(record.total).toBe(mean * 4); expect(record.missing).not.toBe(mean);
    }
  });

  it('expands each weighted group into individual equal contributions and retains the equal-size control', () => {
    let equal = 0, unequal = 0;
    for (const task of tasks('average-group-weighted-merge')) {
      const groups = rows(task).map(row => row.slice(1).map(Number)), values = groups.flatMap(([count, mean]) => Array(count).fill(mean)), record = entries(task);
      const total = values.reduce((a, b) => a + b, 0); expect(Number(record.total)).toBe(total); expect(Number(record.count)).toBe(values.length);
      expect(Number(record.mean) * values.length).toBe(total); const direct = (groups[0][1] + groups[1][1]) / 2;
      expect(record.direct).toBe(direct * values.length === total ? '是' : '否');
      if (groups[0][0] === groups[1][0]) { equal++; expect(Number(record.mean)).toBe(direct); }
      else { unequal++; expect(Number(record.mean)).not.toBe(direct); }
    }
    expect([equal, unequal]).toEqual([4, 8]);
  });

  it('selects the named statistical categories even when an unrelated category has the largest count', () => {
    for (const task of tasks('chart-question-category-selection')) {
      const data = Object.fromEntries(rows(task).map(row => [row[0], Number(row[1])]));
      expect(data.乘车).toBeGreaterThan(data.步行); expect(arithmeticValue(task.answer)).toBe(data.步行 - data.骑车);
      expect(task.answer).toBe(`${data.步行}−${data.骑车}`);
      expect(arithmeticValue(task.options!.find(value => value.includes('+'))!)).toBe(data.步行 + data.骑车);
    }
  });

  it('recovers bar counts from actual tick labels and pixel coordinates with a real zero baseline', () => {
    const steps = new Set<number>(); let zeros = 0, ties = 0;
    for (const task of tasks('chart-scaled-bar-difference')) {
      const body = drawing(task), ticks = [...body.matchAll(/<text\s([^>]*data-role="scale-label"[^>]*)>(\d+)<\/text>/g)].map((match): { value: number; [key: string]: string | number } => ({ ...attrs(match[1]), value: Number(match[2]) }));
      expect(ticks).toHaveLength(13); const origin = ticks.find(tick => tick.value === 0)!, next = ticks.find(tick => tick.value > 0)!;
      const baseline = Number(origin.y) - 5, interval = Number(origin.y) - Number(next.y), unit = next.value;
      expect(tags(body, 'scale-line').some(row => Number(row.y1) === baseline && Number(row.y2) === baseline)).toBe(true);
      for (const tick of ticks) expect((baseline - (Number(tick.y) - 5)) / interval * unit).toBeCloseTo(tick.value, 5);
      const data = Object.fromEntries(tags(body, 'bar').map(bar => {
        const top = Number(bar.y), height = Number(bar.height); expect(top + height).toBeCloseTo(baseline, 5);
        return [bar['data-label'], height / interval * unit];
      }));
      const match = task.stem.match(/读取(.+)和(.+)的人数/)!, record = numeric(task), a = data[match[1]], b = data[match[2]];
      expect(Object.keys(data)).toHaveLength(3); expect(record.first).toBe(a); expect(record.second).toBe(b); expect(record.difference).toBe(a - b);
      for (const [label, value] of Object.entries(data)) expect(task.blocks![0].alt).toContain(`${label}${value}人`);
      expect(body).toContain(`每格 ${unit} 人`); steps.add(unit); if (!b) zeros++; if (a === b) ties++;
    }
    expect(steps).toEqual(new Set([5, 10, 2])); expect(zeros).toBeGreaterThan(0); expect(ties).toBe(3);
  });

  it('solves missing categories using the direction of the actual comparison including zero differences', () => {
    const sides = new Set<string>(); let zeroDifference = 0;
    for (const task of tasks('chart-inverse-category-difference')) {
      const [difference, known] = numbers(task.stem), largerKnown = task.stem.includes('步行有'), restored = Number(task.answer);
      const larger = largerKnown ? known : restored, smaller = largerKnown ? restored : known;
      expect(larger - smaller).toBe(difference); expect(smaller).toBeGreaterThanOrEqual(0);
      sides.add(largerKnown ? 'larger' : 'smaller'); if (!difference) { zeroDifference++; expect(restored).toBe(known); }
    }
    expect(sides.size).toBe(2); expect(zeroDifference).toBe(3);
  });

  it('compares the two actual differences rather than their rising combined totals', () => {
    const outcomes = new Set<string>(); let zero = false;
    for (const task of tasks('chart-difference-over-time')) {
      const [before, after] = rows(task).map(row => row.slice(1).map(Number)), record = entries(task);
      const first = before[0] - before[1], second = after[0] - after[1]; expect(Number(record.before)).toBe(first); expect(Number(record.after)).toBe(second);
      expect(record.change).toBe(first === second ? '不变' : first < second ? '增大' : '缩小');
      expect(after.reduce((a, b) => a + b, 0)).toBeGreaterThan(before.reduce((a, b) => a + b, 0));
      outcomes.add(record.change); if (!first || !second) zero = true;
    }
    expect(outcomes.size).toBe(3); expect(zero).toBe(true);
  });

  it('validates every objective standard, all distractors and a legal zero-score answer', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task), envelope = (value: unknown) => ({ questionId: schema.questionId, mode: schema.mode,
        response: schema.mode === 'multi_blank' ? { entries: value } : { value } });
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, envelope(task.answer))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(task.answer)).score, task.stem).toBe(1);
      const wrongAnswers = schema.mode === 'single_choice' ? task.options!.filter(value => value !== task.answer) : [schema.mode === 'boolean' ? !task.answer :
        schema.mode === 'multi_blank' ? (task.answer as Array<{ key: string; value: string }>).map(entry => ({ ...entry, value: wrong(entry.value) })) : Number(task.answer) + 1];
      for (const value of wrongAnswers) { expect(answerProtocolIssue(schema, envelope(value))).toBeNull(); expect(gradeResponse(schema, task.answer, envelope(value)).score, task.stem).toBe(0); }
      expect(task.analysis!.length).toBeGreaterThan(15);
    }
  });

  it('exposes an error in each intermediate blank separately without calling the blanks independent observations', () => {
    for (const family of families) for (const task of family.exercises.filter(task => task.mode === 'multi_blank')) {
      const standard = task.answer as Array<{ key: string; value: string }>;
      for (const target of standard) {
        const response = standard.map(entry => entry.key === target.key ? { ...entry, value: wrong(entry.value) } : { ...entry });
        const result = gradeResponse(schemaFor(family.atomId, task), task.answer, response);
        expect(result.score).toBeCloseTo((standard.length - 1) / standard.length, 10);
        expect(result.scoreDetails?.filter(row => !row.score).map(row => row.key)).toEqual([target.key]);
      }
    }
  });

  it('retains the four old direct-calculation family identities, including average across dimensions', () => {
    const definitions = buildFoundationCurriculum();
    for (const name of ['area-direct', 'angle-threshold', 'triangle-third-angle', 'average-three-days']) {
      const family = families.find(row => row.family === name)!, original = definitions.find(row => row.atom.id === family.atomId)!.exercises.filter(task => task.family === name && task.identityVersion !== 2);
      expect(family.distinction).toContain('沿用'); expect(original.length).toBeGreaterThan(0);
      expect(new Set([...family.exercises, ...original].map(task => canonicalFamily({ atomId: family.atomId, family: task.family }))).size).toBe(1);
    }
    expect(definitions.find(row => row.atom.id === 'core:math:average')!.exercises.some(task => task.family === 'average-three-days' && task.dimension === 'transfer' && task.identityVersion !== 2)).toBe(true);
    expect(tasks('average-three-days').every(task => task.dimension === 'procedure')).toBe(true);
  });

  it('selects two basic and two transfer structures under the current canonical identities within 600 seconds', () => {
    for (const definition of buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id))) {
      const specification = verificationBlueprint({ id: 'qa', title: '对照', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id, atomId: definition.atom.id,
        dimension: task.dimension, family: task.family, difficulty: 1, expectedSeconds: task.expectedSeconds ?? 40 } as MeasurementItem; });
      for (const seed of ['first', 'second', 'third', 'fourth']) {
        const selection = selectVerificationItems(specification, items, new Set([definition.atom.id]), seed, 8, 600);
        expect(selection.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(selection.selected.map(canonicalFamily)).size).toBe(4);
        expect(selection.verification.groups.every(group => group.selectedFamilies.length === 2)).toBe(true); expect(selection.seconds).toBeLessThanOrEqual(600);
      }
    }
    for (const task of families.flatMap(family => family.exercises)) {
      expect(task.expectedSeconds).toBeGreaterThanOrEqual(60); expect(task.expectedSeconds).toBeLessThanOrEqual(110);
      if (task.mode === 'multi_blank') expect(task.expectedSeconds).toBeGreaterThanOrEqual((task.answer as unknown[]).length * 15);
    }
  });

  it('ships exactly the 48 referenced original finite diagrams with accessible labels and no active content', () => {
    const images = families.flatMap(family => family.exercises.flatMap(task => task.blocks?.filter(block => block.type === 'image') ?? []));
    const referenced = new Set(images.map(block => block.url!.split('/').at(-1)!)); expect(referenced.size).toBe(48);
    expect(readdirSync(directory).sort()).toEqual([...referenced].sort());
    for (const name of referenced) {
      const body = readFileSync(resolve(directory, name), 'utf8'); expect(body).toContain('viewBox="0 0 480 340"');
      expect(body).toContain('<title'); expect(body).toContain('<desc'); expect(body).not.toMatch(/NaN|Infinity|undefined|<script|<foreignObject|href=|url\(|\bon\w+=/i);
      for (const attribute of [...body.matchAll(/\b(?:x|y|x1|x2|y1|y2)="([\d.-]+)"/g)]) {
        expect(Number(attribute[1])).toBeGreaterThanOrEqual(0); expect(Number(attribute[1])).toBeLessThanOrEqual(attribute[0].startsWith('x') ? 480 : 340);
      }
    }
    for (const block of images) expect(block.alt!.length).toBeGreaterThan(20);
  });
});
