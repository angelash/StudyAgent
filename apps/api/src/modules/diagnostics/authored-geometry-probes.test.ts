import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import { buildGeometryProbeFamilies } from './authored-geometry-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-5678-v1.json';

const families = buildGeometryProbeFamilies();
const tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const numbers = (value: string) => [...value.matchAll(/\d+/g)].map(match => Number(match[0]));
const entries = (answer: unknown): Record<string, number> => Object.fromEntries((answer as Array<{ key: string; value: string }>).map(row => [row.key, Number(row.value)]));
const directory = resolve(__dirname, '../../../../web/public/question-assets/geometry-probes-v1');
const drawing = (task: Exercise) => readFileSync(resolve(directory, task.blocks!.find(block => block.type === 'image')!.url!.split('/').at(-1)!), 'utf8');
const attrs = (tag: string): Record<string, string> => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const elements = (body: string, role: string) => [...body.matchAll(/<(?:rect|line)\s[^>]+\/?>/g)].map(match => attrs(match[0])).filter(row => row['data-role'] === role);
const length = (line: Record<string, string>) => Math.hypot(Number(line.x2) - Number(line.x1), Number(line.y2) - Number(line.y1));
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const grid = (body: string) => {
  const cells = elements(body, 'unit-cell'), boundary = elements(body, 'boundary-unit');
  expect(cells.length).toBeGreaterThan(0);
  const columns = new Set(cells.map(cell => cell.x)).size, rows = new Set(cells.map(cell => cell.y)).size, unit = Number(cells[0].width);
  expect(cells).toHaveLength(columns * rows); expect(new Set(cells.map(cell => `${cell.x},${cell.y}`)).size).toBe(cells.length);
  const left = Math.min(...cells.map(cell => Number(cell.x))), top = Math.min(...cells.map(cell => Number(cell.y)));
  for (const cell of cells) {
    expect(Number(cell.width)).toBeCloseTo(unit, 4); expect(Number(cell.height)).toBeCloseTo(unit, 4);
    expect((Number(cell.x) - left) / unit).toBeCloseTo(Math.round((Number(cell.x) - left) / unit), 4);
    expect((Number(cell.y) - top) / unit).toBeCloseTo(Math.round((Number(cell.y) - top) / unit), 4);
    expect(cell.fill === '#ffffff').toBe(cell['data-covered'] === 'false');
  }
  expect(boundary).toHaveLength(2 * (columns + rows));
  for (const edge of boundary) {
    expect(length(edge)).toBeCloseTo(unit, 4);
    const horizontal = edge.y1 === edge.y2;
    const coordinate = Number(horizontal ? edge.y1 : edge.x1), low = horizontal ? top : left, high = low + (horizontal ? rows : columns) * unit;
    expect(Math.min(Math.abs(coordinate - low), Math.abs(coordinate - high))).toBeLessThan(0.0002);
  }
  return { cells, columns, rows, boundary, unit };
};
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode ?? 'numeric_blank',
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) });
const squareCentimeters: Record<string, number> = { 平方厘米: 1, 平方分米: 100, 平方米: 10000 };
const area = (value: string) => sum([...value.matchAll(/(\d+)(平方米|平方分米|平方厘米)/g)].map(match => Number(match[1]) * squareCentimeters[match[2]]));

describe('third-grade boundary, coverage and square-unit observations', () => {
  it('keeps every one of the 5486 historical task objects and IDs and adds 192 distinct tasks in 16 structures', () => {
    const additions = families.flatMap(row => row.exercises.map(exercise => ({ atomId: row.atomId, id: foundationQuestionId(row.atomId, exercise), exercise })));
    const ids = new Set(additions.map(row => row.id));
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const frozenIds = new Set(baseline.ids);
    const previous = all.filter(row => frozenIds.has(row.id) && !ids.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(5486); expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe('d54f6a6804cfa393d49e51ac4117acb6f84b5cb671af994b36fec209e176dfe3');
    expect(families).toHaveLength(16); expect(new Set(families.map(row => row.atomId)).size).toBe(4);
    expect(additions).toHaveLength(192); expect(ids.size).toBe(192); expect(all.filter(row => frozenIds.has(row.id))).toHaveLength(5678);
    const semantic = (row: typeof all[number]) => JSON.stringify([row.atomId, row.exercise.stem, row.exercise.blocks, row.exercise.responseShape]);
    const oldSemantics = new Set(previous.map(semantic)); expect(new Set(additions.map(semantic)).size).toBe(192);
    for (const row of additions) expect(oldSemantics.has(semantic(row)), row.exercise.stem).toBe(false);
    expect(new Set(all.map(row => row.id)).size).toBe(all.length);
  });

  it('keeps both frozen relationship releases byte-for-byte unchanged', () => {
    for (const [name, expected] of [['authored-relations-2026-10-20-v1.json', '874bd9ab4be81e7a6ec562ce81e38732ccff6ea71c50afb95f6deb577a65cd8c'],
      ['authored-atomic-relations-2026-10-20-v1.json', '2e9a0b7c2e8d0f4f68da8fd44fc411516ee9bdbd71f42755b6c5428f12fa115e']]) {
      expect(createHash('sha256').update(readFileSync(resolve(__dirname, '../../../../../resources/curriculum', name))).digest('hex')).toBe(expected);
    }
  });

  it('counts all four rectangle boundary segments and rejects half-boundary and internal coverage models', () => {
    for (const task of tasks('perimeter-closed-boundary-audit')) {
      const [a, b] = numbers(task.stem), model = String(task.answer);
      expect(numbers(model)).toEqual([a, b, a, b]); expect(model).toContain('厘米'); expect(model).not.toContain('平方');
      expect(task.options!.some(option => option.includes('平方厘米'))).toBe(true);
      expect(task.options!.some(option => numbers(option).length === 2 && option.includes('+'))).toBe(true);
    }
  });

  it('independently reconstructs both pairs of opposite edges and the full rectangle boundary', () => {
    for (const task of tasks('perimeter-formula')) {
      const [a, b] = numbers(task.stem), recorded = entries(task.answer), walk = [a, b, a, b];
      expect(recorded).toEqual({ longPair: sum([walk[0], walk[2]]), shortPair: sum([walk[1], walk[3]]), perimeter: sum(walk) });
    }
  });

  it('checks recovered rectangle width by walking the reconstructed boundary back to the given total', () => {
    for (const task of tasks('perimeter-recover-width')) {
      const [total, a] = numbers(task.stem), recorded = entries(task.answer);
      expect(sum([a, recorded.width, a, recorded.width])).toBe(total); expect(recorded.halfPerimeter).toBe(a + recorded.width);
      expect(recorded.width).toBeGreaterThan(0); expect(recorded.width).toBeLessThan(a);
    }
  });

  it('uses actual SVG fence lengths, the physical gate gap and visible unit labels while excluding the interior path', () => {
    for (const task of tasks('perimeter-gate-and-interior-path')) {
      const body = drawing(task), fence = elements(body, 'fence'), gate = elements(body, 'gate'), interior = elements(body, 'interior-path');
      expect(fence).toHaveLength(5); expect(gate).toHaveLength(1); expect(interior).toHaveLength(1);
      const a = Number(body.match(/长 (\d+) 米/)![1]), b = Number(body.match(/>(\d+)米<\//)![1]), g = Number(body.match(/门 (\d+) 米/)![1]);
      const scale = length(fence[0]) / a, recorded = entries(task.answer);
      expect(length(fence[1]) / scale).toBeCloseTo(b, 5); expect(length(fence[2]) / scale).toBeCloseTo(b, 5);
      expect(length(gate[0]) / scale).toBeCloseTo(g, 5);
      const complete = sum([...fence, ...gate].map(length)) / scale, required = sum(fence.map(length)) / scale;
      expect(recorded.completeBoundary).toBeCloseTo(complete, 5); expect(recorded.fence).toBeCloseTo(required, 5);
      expect(recorded.completeBoundary - recorded.fence).toBe(g);
      const bottom = Number(gate[0].y1), top = Number(fence[0].y1), left = Number(fence[0].x1), right = Number(fence[0].x2);
      expect(Number(interior[0].x1)).toBeGreaterThan(left); expect(Number(interior[0].x2)).toBeLessThan(right);
      expect(Number(interior[0].y1)).toBeGreaterThan(top); expect(Number(interior[0].y1)).toBeLessThan(bottom);
      expect(required + length(interior[0]) / scale).toBeGreaterThan(recorded.fence);
      expect(task.blocks![0].alt).toContain(`${g}米`);
    }
  });

  it('keeps correct and square-of-side claims paired for every square edge length', () => {
    const counts = new Map<number, Set<boolean>>();
    for (const task of tasks('square-four-edge-claim')) {
      const [side, claimed] = numbers(task.stem), walked = sum(Array(4).fill(side));
      expect(task.answer).toBe(walked === claimed); if (!counts.has(side)) counts.set(side, new Set()); counts.get(side)!.add(Boolean(task.answer));
      if (!task.answer) expect(claimed).toBe(side * side);
    }
    expect(counts.size).toBe(6); for (const values of counts.values()) expect(values).toEqual(new Set([true, false]));
  });

  it('records two edges and the entire four-edge square separately', () => {
    for (const task of tasks('square-perimeter')) {
      const side = numbers(task.stem)[0], recorded = entries(task.answer);
      expect(recorded.twoEdges).toBe(sum([side, side])); expect(recorded.perimeter).toBe(sum([side, side, side, side]));
    }
  });

  it('counts actual external unit segments of all twelve square drawings and excludes interior grid lines', () => {
    let cellCount = 0;
    for (const task of tasks('square-grid-external-boundary')) {
      const actual = grid(drawing(task)), recorded = entries(task.answer); cellCount += actual.cells.length;
      expect(actual.columns).toBe(actual.rows); expect(recorded.oneEdge).toBe(actual.columns);
      expect(recorded.perimeter).toBeCloseTo(sum(actual.boundary.map(length)) / actual.unit, 4);
      expect(task.blocks![0].alt).toContain(`横向${actual.columns}格`);
    }
    expect(cellCount).toBe(818);
  });

  it('rebuilds all independent equal square frames from the recorded edge length and checks total material conservation', () => {
    for (const task of tasks('square-ribbon-frames-inverse')) {
      const [total, frames] = numbers(task.stem), recorded = entries(task.answer);
      expect(sum(Array(4).fill(recorded.edge))).toBe(recorded.framePerimeter);
      expect(sum(Array(frames).fill(recorded.framePerimeter))).toBe(total); expect(frames).toBeGreaterThan(1);
      expect(task.stem).toContain('不共用边'); expect(task.stem).toContain('没有损耗');
    }
  });

  it('counts every actually displayed unit square for the rectangle coverage claims', () => {
    const truth = new Set<boolean>();
    for (const task of tasks('area-unit-squares-claim')) {
      const record = task.blocks![0].rows!, counts = record.map(row => [...row[1]].filter(character => character === '□').length);
      expect(new Set(counts).size).toBe(1); expect(counts[0]).toBeGreaterThan(0);
      const claim = numbers(task.stem).at(-1)!; expect(task.answer).toBe(sum(counts) === claim); truth.add(Boolean(task.answer));
    }
    expect(truth).toEqual(new Set([true, false]));
  });

  it('reconstructs the area procedure as complete rows of actual unit squares', () => {
    for (const task of tasks('rectangle-cover')) {
      const [a, b] = numbers(task.stem), recorded = entries(task.answer), unitRows = Array.from({ length: b }, () => Array(a).fill(1));
      expect(recorded.perRow).toBe(unitRows[0].length); expect(recorded.rows).toBe(unitRows.length);
      expect(recorded.area).toBe(unitRows.flat().length);
    }
  });

  it('counts filled and unfilled SVG cells separately and preserves the complete rectangular footprint', () => {
    let all = 0, uncovered = 0;
    for (const task of tasks('area-scattered-coverage-gaps')) {
      const actual = grid(drawing(task)), empty = actual.cells.filter(cell => cell.fill === '#ffffff'), recorded = entries(task.answer);
      expect(recorded.completeArea).toBe(actual.cells.length); expect(recorded.missingTiles).toBe(empty.length);
      expect(actual.cells.length - empty.length + recorded.missingTiles).toBe(recorded.completeArea);
      expect(new Set(empty.map(cell => cell.y)).size).toBeGreaterThan(1);
      expect(task.blocks![0].alt).toContain(`${actual.columns}列${actual.rows}行`);
      all += actual.cells.length; uncovered += empty.length;
    }
    expect(all).toBe(312); expect(uncovered).toBe(42);
  });

  it('uses the recovered width to lay every given tile into equal rows without remainder', () => {
    for (const task of tasks('area-recover-tiled-width')) {
      const [total, unit, perRow] = numbers(task.stem), width = Number(task.answer);
      expect(unit).toBe(1); expect(Number.isInteger(width)).toBe(true); expect(width).toBeLessThan(perRow);
      expect(Array.from({ length: width }, () => Array(perRow).fill(1)).flat()).toHaveLength(total);
    }
  });

  it('counts both directions in each physical area-unit grid before evaluating all twelve conversion claims', () => {
    for (const task of tasks('area-two-dimensional-unit-claim')) {
      const actual = grid(drawing(task)); expect(actual.columns).toBe(10); expect(actual.rows).toBe(10); expect(actual.cells).toHaveLength(100);
      const [, , large, claim] = numbers(task.stem); expect(task.answer).toBe(Array.from({ length: large }, () => actual.cells).flat().length === claim);
    }
  });

  it('conserves mixed area quantities including zero large and zero small components', () => {
    const zeros = new Set<string>();
    for (const task of tasks('area-mixed-unit-record')) {
      const match = task.stem.match(/(\d+)(平方米|平方分米)另(\d+)(平方分米|平方厘米)/)!;
      const a = Number(match[1]), b = Number(match[3]), recorded = entries(task.answer), smallUnit = squareCentimeters[match[4]];
      expect(recorded.largePart * smallUnit).toBe(a * squareCentimeters[match[2]]);
      expect(recorded.total * smallUnit).toBe(a * squareCentimeters[match[2]] + b * smallUnit);
      if (!a) zeros.add('large'); if (!b) zeros.add('small');
    }
    expect(zeros).toEqual(new Set(['large', 'small']));
  });

  it('compares actual areas after unit normalization and retains equality as well as both strict orderings', () => {
    const outcomes = new Map<string, number>();
    for (const task of tasks('area-different-label-comparison')) {
      const record = task.blocks![0].rows!, a = area(record[0][1]), b = area(record[1][1]);
      const expected = a > b ? '甲的面积较大' : a < b ? '乙的面积较大' : '两者面积相等';
      expect(task.answer).toBe(expected); outcomes.set(expected, (outcomes.get(expected) ?? 0) + 1);
    }
    expect([...outcomes.values()]).toEqual([4, 4, 4]);
  });

  it('reconstructs all original coverage targets from the available stock and shortfall in one consistent unit', () => {
    for (const task of tasks('area-covering-stock-shortfall')) {
      const labels = [...task.stem.matchAll(/(\d+)(平方米|平方分米|平方厘米)/g)], target = area(labels[0][0]), stock = area(labels[1][0]);
      const smallUnit = area(labels[2][0]), recorded = entries(task.answer);
      expect(recorded.requiredSmall * smallUnit).toBe(target); expect(stock + recorded.shortfall * smallUnit).toBe(target);
      expect(recorded.shortfall).toBeGreaterThan(0);
    }
  });

  it('validates every protocol standard, every distractor and a legal zero-score response', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task), envelope = (value: unknown) => ({ questionId: schema.questionId, mode: schema.mode,
        response: schema.mode === 'multi_blank' ? { entries: value } : { value } });
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, envelope(task.answer))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(task.answer)).score, task.stem).toBe(1);
      const wrong = schema.mode === 'single_choice' ? task.options!.filter(value => value !== task.answer) : [schema.mode === 'boolean' ? !task.answer :
        schema.mode === 'multi_blank' ? (task.answer as Array<{ key: string; value: string }>).map(entry => ({ ...entry, value: String(Number(entry.value) + 1) })) : Number(task.answer) + 1];
      for (const value of wrong) { expect(answerProtocolIssue(schema, envelope(value))).toBeNull(); expect(gradeResponse(schema, task.answer, envelope(value)).score, task.stem).toBe(0); }
      expect(task.analysis!.length).toBeGreaterThan(15);
    }
  });

  it('retains established calculation families and exposes intermediate mistakes even when the final answer is correct', () => {
    const definitions = buildFoundationCurriculum();
    for (const name of ['perimeter-formula', 'square-perimeter', 'rectangle-cover']) {
      const family = families.find(row => row.family === name)!; expect(family.distinction).toContain('沿用');
      expect(definitions.find(row => row.atom.id === family.atomId)!.exercises.some(task => task.family === name && task.identityVersion !== 2)).toBe(true);
    }
    for (const family of families.filter(row => row.exercises[0].mode === 'multi_blank')) {
      const task = family.exercises[0], answer = task.answer as Array<{ key: string; value: string }>;
      const response = answer.map((entry, index) => index ? { ...entry } : { ...entry, value: String(Number(entry.value) + 1) });
      const result = gradeResponse(schemaFor(family.atomId, task), answer, response);
      expect(result.score).toBeCloseTo((answer.length - 1) / answer.length, 10);
      expect(result.scoreDetails?.filter(row => !row.score).map(row => row.key)).toEqual([answer[0].key]);
      expect(result.scoreDetails?.at(-1)?.score).toBe(1);
    }
  });

  it('provides four different contrast families within 600 seconds and keeps authored time estimates explicit', () => {
    for (const definition of buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id))) {
      const specification = verificationBlueprint({ id: 'qa', title: '对照', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id, atomId: definition.atom.id,
        dimension: task.dimension, family: task.family, difficulty: 1, expectedSeconds: task.expectedSeconds ?? 40 } as MeasurementItem; });
      for (const seed of ['first', 'second', 'third']) {
        const selection = selectVerificationItems(specification, items, new Set([definition.atom.id]), seed, 8, 600);
        expect(selection.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(selection.selected.map(item => item.family)).size).toBe(4);
        expect(selection.verification.groups.every(group => group.selectedFamilies.length === 2)).toBe(true); expect(selection.seconds).toBeLessThanOrEqual(600);
      }
    }
    for (const task of families.flatMap(family => family.exercises)) {
      expect(task.expectedSeconds).toBeGreaterThanOrEqual(60); expect(task.expectedSeconds).toBeLessThanOrEqual(100);
      if (task.mode === 'multi_blank') expect(task.expectedSeconds).toBeGreaterThanOrEqual((task.answer as unknown[]).length * 15);
    }
  });

  it('ships exactly the referenced finite original graphics with accessible labels and no external or active content', () => {
    const imageBlocks = families.flatMap(family => family.exercises.flatMap(task => task.blocks?.filter(block => block.type === 'image') ?? []));
    const referenced = new Set(imageBlocks.map(block => block.url!.split('/').at(-1)!)); expect(referenced.size).toBe(38);
    expect(readdirSync(directory).sort()).toEqual([...referenced].sort());
    for (const name of referenced) {
      const body = readFileSync(resolve(directory, name), 'utf8'); expect(body).toContain('viewBox="0 0 420 300"');
      expect(body).toContain('<title'); expect(body).toContain('<desc'); expect(body).not.toMatch(/NaN|Infinity|undefined|<script|<foreignObject|href=|url\(|\bon\w+=/i);
    }
    for (const block of imageBlocks) expect(block.alt!.length).toBeGreaterThan(20);
  });
});
