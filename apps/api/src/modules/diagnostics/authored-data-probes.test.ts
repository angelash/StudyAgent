import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import { buildAuthoredMathProbeFamilies } from './authored-math-probes';
import { buildArithmeticProbeFamilies } from './authored-arithmetic-probes';
import { buildNumberProbeFamilies } from './authored-number-probes';
import { buildSpatialProbeFamilies } from './authored-spatial-probes';
import { buildSecondGradeProbeFamilies } from './authored-second-grade-probes';
import { buildDataProbeFamilies, dataProbeAssets } from './authored-data-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildDataProbeFamilies(), assets = dataProbeAssets();
const tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const numbers = (value: string) => value.match(/\d+/g)!.map(Number);
const entries = (value: unknown): Record<string, string> => Object.fromEntries((value as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const attributes = (tag: string): Record<string, string> => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const byId = (svg: string, id: string) => attributes(svg.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))![0]);
const drawing = (task: Exercise) => assets[task.blocks!.find(row => row.type === 'image')!.url!.split('/').at(-1)!];
const unitVector = (attrs: Record<string, string>) => {
  const x = Number(attrs.x2) - Number(attrs.x1), y = Number(attrs.y2) - Number(attrs.y1), length = Math.hypot(x, y);
  return { x: x / length, y: y / length, length };
};
const categoryRecords = (task: Exercise) => {
  const record = task.blocks![0], category = record.headers!.indexOf('类别'), quantity = record.headers!.indexOf('数量（本）');
  return Object.fromEntries(record.rows!.map(row => [row[category], Number(row[quantity])]));
};
const fullPeriod = (task: Exercise) => task.stem.match(/完整重复节为“([^”]+)”/)![1].split('、');
const expand = (period: string[], count = 150) => Array.from({ length: count }, (_, index) => period[index % period.length]);

describe('second-grade clock, table, period and direction contrasts', () => {
  it('keeps all 4714 prior tasks verbatim and adds 178 semantically distinct observations', () => {
    const priorAuthored = new Set([...buildAuthoredMathProbeFamilies(), ...buildArithmeticProbeFamilies(), ...buildNumberProbeFamilies(),
      ...buildSpatialProbeFamilies(), ...buildSecondGradeProbeFamilies()].flatMap(family => family.exercises.map(task => foundationQuestionId(family.atomId, task))));
    const prior = buildFoundationCurriculum().flatMap(definition => definition.exercises.map(exercise => ({ atomId: definition.atom.id,
      id: foundationQuestionId(definition.atom.id, exercise), exercise }))).filter(row => row.exercise.identityVersion !== 2 || priorAuthored.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(prior).toHaveLength(4714); expect(digest(JSON.stringify(prior))).toBe('ae23ac7faf0d74dae7f7a5830728e2bc9cdcc363a1a7e87f205c4a7e1c7d10e0');
    expect(families).toHaveLength(16); expect(new Set(families.map(row => row.atomId)).size).toBe(4);
    const ids = families.flatMap(family => family.exercises.map(task => foundationQuestionId(family.atomId, task)));
    expect(ids).toHaveLength(178); expect(new Set(ids).size).toBe(178);
    const semantics = families.flatMap(family => family.exercises.map(task => JSON.stringify({ atomId: family.atomId, stem: task.stem,
      blocks: task.blocks, responseShape: task.responseShape })));
    expect(new Set(semantics).size).toBe(178);
  });

  it('reads the actual dial geometry and keeps the hour hand physically consistent with the minute hand', () => {
    const widths = new Set<string>();
    for (const task of tasks('minute-hand-groups')) {
      const svg = drawing(task), minute = unitVector(byId(svg, 'minute')), hour = unitVector(byId(svg, 'hour'));
      expect(minute.length).toBeCloseTo(70, 3); expect(hour.length).toBeCloseTo(47, 3);
      expect([Number(byId(svg, 'minute').x1), Number(byId(svg, 'minute').y1)]).toEqual([140, 140]);
      const labels = [...svg.matchAll(/<text ([^>]+)>(\d+)<\/text>/g)].map(match => {
        const a = attributes(match[1]), x = Number(a.x) - 140, y = Number(a.y) - 140, length = Math.hypot(x, y);
        return { number: Number(match[2]), alignment: (x * minute.x + y * minute.y) / length };
      }).sort((a, b) => b.alignment - a.alignment);
      expect(labels).toHaveLength(12); expect(labels[0].alignment).toBeCloseTo(1, 7);
      // Keep the long hand clear of two-digit glyphs, including its half stroke width.
      expect(88 - minute.length).toBeGreaterThan(17);
      const answer = entries(task.answer), minutes = labels[0].number * 5;
      expect(answer).toEqual({ groups: String(labels[0].number), minutes: String(minutes) });
      const hourDegrees = Math.atan2(hour.x, -hour.y) * 180 / Math.PI;
      expect(hourDegrees).toBeCloseTo(90 + minutes / 2, 2);
      widths.add(`${byId(svg, 'hour')['stroke-width']}/${byId(svg, 'minute')['stroke-width']}`);
      expect(task.blocks![0].alt).toContain(`长针指向数字${labels[0].number}`);
      expect(task.blocks![0].alt).not.toMatch(/\d+分钟/);
    }
    expect(widths.size).toBe(2);
  });

  it('separates dial numbers from minutes and reconstructs both reverse positions and cumulative sweeps', () => {
    const outcomes = new Map<number, Set<boolean>>();
    for (const task of tasks('minute-unit-claim')) {
      const [start, number, claimed] = numbers(task.stem); expect(start).toBe(12); expect(task.answer).toBe(number * 5 === claimed);
      if (!outcomes.has(number)) outcomes.set(number, new Set()); outcomes.get(number)!.add(task.answer as boolean);
    }
    expect(outcomes.size).toBe(11); for (const value of outcomes.values()) expect(value.size).toBe(2);
    for (const task of tasks('minute-reverse-position')) {
      const [, minutes] = numbers(task.stem); let position = 0, counted = 0;
      while (counted < minutes) { position++; counted += 5; }
      expect(task.answer).toBe(position); expect(counted).toBe(minutes); expect(drawing(task)).not.toMatch(/id="(minute|hour)"/);
    }
    for (const task of tasks('minute-composed-sweep')) {
      const totalGroups = task.blocks![0].rows!.reduce((sum, [, count]) => sum + Number(count), 0);
      expect(task.answer).toBe(totalGroups * 5); expect(totalGroups).toBeLessThan(12); expect(task.stem).toContain('不复位');
    }
  });

  it('locates category quantities using actual headers after rows and columns are reordered', () => {
    const quantityColumns = new Set<number>();
    for (const task of tasks('category-record-audit')) {
      const records = categoryRecords(task), [, category, claimed] = task.stem.match(/“(.+)类已登记(\d+)本”/)!;
      expect(task.answer).toBe(records[category] === Number(claimed)); quantityColumns.add(task.blocks![0].headers!.indexOf('数量（本）'));
    }
    expect(quantityColumns).toEqual(new Set([0, 1, 2]));
    for (const task of tasks('table-second-column')) {
      const records = categoryRecords(task), [, first, second] = task.stem.match(/登记(.+)类和(.+)类的数量/)!;
      expect(entries(task.answer)).toEqual({ first: String(records[first]), second: String(records[second]) });
    }
  });

  it('uses both row and class column in the actual two-condition table', () => {
    for (const task of tasks('table-two-condition-lookup')) {
      const [, classroom, category] = task.stem.match(/。(.+班)借了多少本(.+)类图书/)!;
      const table = task.blocks![0], row = table.rows!.find(row => row[0] === category)!, col = table.headers!.indexOf(classroom);
      expect(task.answer).toBe(Number(row[col])); expect(col).toBeGreaterThan(0);
      expect(new Set(table.rows!.map(row => row[col])).size).toBe(3);
    }
  });

  it('never substitutes a hidden count or zero for an unregistered category', () => {
    const states = new Map<string, Set<string>>();
    for (const task of tasks('table-missing-versus-zero')) {
      const category = task.stem.match(/关于(.+)类的数量/)![1], rows = task.blocks![0].rows!, status = rows.find(row => row[0] === category)![1];
      expect(task.answer).toBe(status === '0' ? '已登记为0本' : '未登记，不能确定有几本');
      expect(rows.every(row => row.length === 2)).toBe(true); expect(status).toMatch(/^(0|未登记)$/);
      if (!states.has(category)) states.set(category, new Set()); states.get(category)!.add(status);
    }
    expect(states.size).toBe(3); for (const state of states.values()) expect(state).toEqual(new Set(['0', '未登记']));
  });

  it('expands explicit complete periods to check claims and all intermediate cycle records', () => {
    let divisible = 0, immediatelyAfter = 0;
    for (const task of tasks('period-claim-audit')) {
      const sequence = expand(fullPeriod(task)), [, position, claimed] = task.stem.match(/“第(\d+)个是(.+)”/)!;
      expect(task.answer).toBe(sequence[Number(position) - 1] === claimed);
    }
    for (const task of tasks('periodic-three')) {
      const period = fullPeriod(task), position = Number(task.stem.match(/第(\d+)个落/)![1]), answer = entries(task.answer);
      const chunks = Array.from({ length: 20 }, () => [...period]); let consumed = 0, cycle = 0, slot = 0;
      outer: for (let row = 0; row < chunks.length; row++) for (let col = 0; col < chunks[row].length; col++) {
        consumed++; if (consumed === position) { cycle = row + 1; slot = col + 1; break outer; }
      }
      expect(answer).toEqual({ cycle: String(cycle), slot: String(slot), symbol: chunks[cycle - 1][slot - 1] });
      if (slot === period.length) divisible++; if (slot === 1) immediatelyAfter++;
    }
    expect(divisible).toBeGreaterThanOrEqual(4); expect(immediatelyAfter).toBeGreaterThanOrEqual(4);
  });

  it('simulates new origins and excludes the exact boundary when looking for the next target', () => {
    let boundaryAlreadyTarget = 0, repeatedSymbolOrigin = 0;
    for (const task of tasks('period-new-origin')) {
      const period = fullPeriod(task), start = Number(task.stem.match(/这个节的第(\d+)项/)![1]), day = Number(task.stem.match(/。第(\d+)天用/)![1]);
      const sequence = expand(period).slice(start - 1); expect(task.answer).toBe(sequence[day - 1]);
      if (new Set(period).size < period.length) { repeatedSymbolOrigin++; expect(task.stem).toContain(`第${start}项开始`); }
    }
    for (const task of tasks('period-exclusive-next-target')) {
      const sequence = expand(fullPeriod(task)), boundary = Number(task.stem.match(/只看第(\d+)个之后/)![1]), target = task.stem.match(/第一次出现“([^”]+)”/)![1];
      const matches = sequence.map((symbol, index) => ({ symbol, position: index + 1 })).filter(row => row.position > boundary && row.symbol === target);
      expect(task.answer).toBe(matches[0].position); expect(Number(task.answer)).toBeGreaterThan(boundary);
      if (sequence[boundary - 1] === target) boundaryAlreadyTarget++;
    }
    expect(repeatedSymbolOrigin).toBe(3); expect(boundaryAlreadyTarget).toBeGreaterThan(0);
  });

  it('checks opposite claims, half turns and return routes using fixed direction vectors', () => {
    const vectors: Record<string, [number, number]> = { 东: [1, 0], 西: [-1, 0], 北: [0, -1], 南: [0, 1] };
    const opposite = (a: string, b: string) => vectors[a].every((value, i) => value + vectors[b][i] === 0);
    for (const task of tasks('opposite-claim-audit')) {
      const [, front, back] = task.stem.match(/面向(.)站立。有人说“背后是(.)”/)!; expect(task.answer).toBe(opposite(front, back));
    }
    for (const task of tasks('opposite-compass')) {
      const front = task.stem.match(/原来面向(.)站立/)![1], answer = entries(task.answer);
      expect(opposite(front, answer.before)).toBe(true); expect(opposite(answer.before, answer.after)).toBe(true);
    }
    for (const task of tasks('opposite-return-route')) expect(opposite(task.blocks![0].rows![0][2], String(task.answer))).toBe(true);
  });

  it('derives map return directions from actual north arrows and actual landmark coordinates', () => {
    const actualNorths = new Set<string>(), answersByPlace = new Map<string, Set<string>>();
    const center = (rect: Record<string, string>) => ({ x: Number(rect.x) + Number(rect.width) / 2, y: Number(rect.y) + Number(rect.height) / 2 });
    for (const task of tasks('opposite-oriented-map')) {
      const svg = drawing(task), north = unitVector(byId(svg, 'north')), home = center(byId(svg, 'center'));
      const place = task.stem.match(/^(.+)与广场/)![1];
      const label = [...svg.matchAll(/<text ([^>]+)>([^<]+)<\/text>/g)].find(match => match[2] === place)!;
      const position = attributes(label[1]), route = { x: home.x - Number(position.x), y: home.y - Number(position.y) };
      const actualDirections = [{ name: '北', x: north.x, y: north.y }, { name: '东', x: -north.y, y: north.x },
        { name: '南', x: -north.x, y: -north.y }, { name: '西', x: north.y, y: -north.x }];
      const expected = actualDirections.sort((a, b) => (b.x * route.x + b.y * route.y) - (a.x * route.x + a.y * route.y))[0].name;
      expect(task.answer).toBe(expected); actualNorths.add(`${north.x},${north.y}`);
      if (!answersByPlace.has(place)) answersByPlace.set(place, new Set()); answersByPlace.get(place)!.add(expected);
    }
    expect(actualNorths.size).toBe(4); expect(answersByPlace.size).toBe(4); for (const outcomes of answersByPlace.values()) expect(outcomes.size).toBe(4);
  });

  it('keeps canonical assets self-contained, fully referenced and identical to committed bytes', () => {
    const directory = resolve(__dirname, '../../../../web/public/question-assets/data-probes-v1');
    expect(Object.keys(assets)).toHaveLength(16); expect(new Set(Object.values(assets).map(digest)).size).toBe(16);
    expect(readdirSync(directory).sort()).toEqual(Object.keys(assets).sort());
    const references = new Set(families.flatMap(family => family.exercises.flatMap(task => (task.blocks ?? []).filter(row => row.type === 'image').map(row => row.url!.split('/').at(-1)!))));
    expect([...references].sort()).toEqual(Object.keys(assets).sort());
    for (const [name, body] of Object.entries(assets)) {
      expect(readFileSync(resolve(directory, name), 'utf8')).toBe(body);
      expect(body).not.toMatch(/<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|url\s*\(/i);
    }
  });

  it('scores all correct and legal incorrect responses through the formal answer protocol', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema: QuestionAnswerSchema = { questionId: foundationQuestionId(family.atomId, task), mode: task.mode ?? 'numeric_blank',
        responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) };
      const envelope = (value: unknown) => ({ questionId: schema.questionId, mode: schema.mode, response: schema.mode === 'multi_blank' ? { entries: value } : { value } });
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, envelope(task.answer))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(task.answer)).score, task.stem).toBe(1);
      const wrong = schema.mode === 'single_choice' ? task.options!.filter(option => option !== task.answer) : [schema.mode === 'boolean' ? !task.answer :
        schema.mode === 'multi_blank' ? (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row,
          value: Number.isFinite(Number(row.value)) ? String(Number(row.value) + 1) : 'QA未达标' })) : schema.mode === 'text_blank' ? 'QA未达标' : Number(task.answer) + 1];
      for (const value of wrong) { expect(answerProtocolIssue(schema, envelope(value))).toBeNull(); expect(gradeResponse(schema, task.answer, envelope(value)).score, task.stem).toBe(0); }
      expect(task.analysis!.length).toBeGreaterThan(15);
    }
  });

  it('retains the same four existing families across widgets and intermediate responses', () => {
    const definitions = buildFoundationCurriculum(), retained = ['minute-hand-groups', 'table-second-column', 'periodic-three', 'opposite-compass'];
    for (const family of families.filter(row => retained.includes(row.family))) {
      expect(family.distinction).toMatch(/沿用|保留/);
      expect(definitions.find(row => row.atom.id === family.atomId)!.exercises.some(task => task.family === family.family && task.identityVersion !== 2)).toBe(true);
    }
    expect(families.filter(row => retained.includes(row.family))).toHaveLength(4);
  });

  it('preserves wrong intermediate records alongside a correct final symbol or minute total', () => {
    for (const [name, key] of [['minute-hand-groups', 'groups'], ['periodic-three', 'slot']]) {
      const task = tasks(name)[0], answer = task.answer as Array<{ key: string; value: string }>;
      const schema: QuestionAnswerSchema = { questionId: 'partial-observation', mode: 'multi_blank', responseShape: task.responseShape!, validationRules: {}, gradingConfig: {} };
      const response = answer.map(row => row.key === key ? { ...row, value: String(Number(row.value) + 1) } : { ...row });
      const scored = gradeResponse(schema, answer, response);
      expect(scored.score).toBeCloseTo((answer.length - 1) / answer.length, 8);
      expect(scored.scoreDetails?.filter(row => row.score === 0).map(row => row.key)).toEqual([key]);
      expect(scored.scoreDetails?.find(row => row.key === answer.at(-1)!.key)?.score).toBe(1);
    }
  });

  it('arranges two basic and two genuinely different transfer structures for each point', () => {
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
