import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import { buildSpatialProbeFamilies, spatialProbeAssets } from './authored-spatial-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildSpatialProbeFamilies(), assets = spatialProbeAssets();
const tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const assetName = (task: Exercise) => task.blocks![0].url!.split('/').at(-1)!;
const drawing = (task: Exercise) => assets[assetName(task)];
type Point = [number, number];
const attrs = (tag: string): Record<string, string> => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const tagById = (body: string, id: string) => body.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0];
const vertices = (body: string): Point[] => {
  const tag = tagById(body, 'outline')!;
  return tag.startsWith('<circle') ? [] : attrs(tag).points.split(' ').map(pair => pair.split(',').map(Number) as Point);
};
const vector = (a: Point, b: Point): Point => [b[0] - a[0], b[1] - a[1]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const equal = (a: number, b: number) => Math.abs(a - b) < 0.001;
const geometry = (polygon: Point[]) => {
  const edges = polygon.map((a, i) => vector(a, polygon[(i + 1) % polygon.length])), lengths = edges.map(edge => dot(edge, edge));
  return { sides: polygon.length, equilateral: lengths.every(length => equal(length, lengths[0])),
    right: edges.length > 0 && edges.every((edge, i) => equal(dot(edge, edges[(i + 1) % edges.length]), 0)) };
};
const shape = (polygon: Point[]) => {
  if (!polygon.length) return '圆'; if (polygon.length === 3) return '三角形';
  const facts = geometry(polygon); return facts.right ? facts.equilateral ? '正方形' : '长方形' : '其他四边形';
};
const linePoints = (tag: string): [Point, Point] => {
  const row = attrs(tag); return [[Number(row.x1), Number(row.y1)], [Number(row.x2), Number(row.y2)]];
};
const area = (polygon: Point[]) => Math.abs(polygon.reduce((sum, point, i) => sum + cross(point, polygon[(i + 1) % polygon.length]), 0) / 2);
// Independent half-plane clipping uses only the actual SVG polygon and cut endpoints.
const clip = (polygon: Point[], a: Point, b: Point, side: number): Point[] => {
  const distance = (point: Point) => cross(vector(a, b), vector(a, point)) * side, result: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = distance(p), dq = distance(q);
    if (dp >= -0.00001) result.push(p);
    if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
      const ratio = dp / (dp - dq); result.push([p[0] + (q[0] - p[0]) * ratio, p[1] + (q[1] - p[1]) * ratio]);
    }
  }
  return result.filter((point, i) => !equal(Math.hypot(...vector(point, result[(i + 1) % result.length])), 0));
};
const hand = (body: string, id: string) => {
  const tag = tagById(body, `${id}-hand`); if (!tag) return null;
  const [a, b] = linePoints(tag), v = vector(a, b), position = (Math.round(Math.atan2(v[0], -v[1]) * 6 / Math.PI) + 12) % 12 || 12;
  expect(a).toEqual([130, 130]); return { position, length: Math.hypot(...v), width: Number(attrs(tag)['stroke-width']) };
};
const parts = (answer: unknown) => Object.fromEntries((answer as Array<{ key: string; value: string }>).map(row => [row.key, Number(row.value)]));

describe('spatial and whole-hour tasks checked against their actual teaching assets', () => {
  it('preserves all 4347 prior tasks verbatim and adds only 79 semantically distinct tasks', () => {
    const prior = buildFoundationCurriculum().flatMap(definition => definition.exercises.map(exercise => ({ atomId: definition.atom.id,
      id: foundationQuestionId(definition.atom.id, exercise), exercise }))).filter(row => !row.exercise.blocks?.some(block => block.url?.includes('/spatial-probes-v1/')))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(prior).toHaveLength(4347); expect(digest(JSON.stringify(prior))).toBe('d1b97a9bd02a4d01485e53c70a94bc373fb187932f5de206ea373c6ad218e13b');
    expect(families).toHaveLength(12); expect(new Set(families.map(row => row.atomId)).size).toBe(3);
    const all = families.flatMap(row => row.exercises.map(exercise => ({ atomId: row.atomId, exercise })));
    expect(all).toHaveLength(79); expect(new Set(all.map(row => foundationQuestionId(row.atomId, row.exercise))).size).toBe(79);
    // Replacing asset URLs by bytes catches renamed copies used to inflate task identity.
    const semantic = all.map(({ atomId, exercise }) => JSON.stringify({ atomId, stem: exercise.stem, mode: exercise.mode,
      responseShape: exercise.responseShape, blocks: exercise.blocks?.map(block => ({ type: block.type, content: digest(assets[block.url!.split('/').at(-1)!]) })) }));
    expect(new Set(semantic).size).toBe(79);
  });

  it('balances correct and incorrect name claims for every shape without inventing new families', () => {
    for (const family of families.filter(row => ['plane-properties', 'solid-properties'].includes(row.family))) {
      const groups = new Map<string, boolean[]>();
      for (const task of family.exercises) {
        const key = family.family === 'plane-properties' ? assetName(task) : task.stem.match(/观察(.)卡/)![1];
        if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(task.answer as boolean);
        const actual = family.family === 'plane-properties' ? shape(vertices(drawing(task))) : ({ 甲: '正方体', 乙: '圆柱', 丙: '球' }[key]);
        expect(task.answer).toBe(task.stem.includes(`“${actual}”`));
      }
      for (const answers of groups.values()) expect(answers.sort()).toEqual([false, true]);
      const old = buildFoundationCurriculum().find(row => row.atom.id === family.atomId)!.exercises.filter(row => row.identityVersion !== 2);
      expect(old.some(row => row.family === family.family)).toBe(true);
    }
    expect(buildFoundationCurriculum().find(row => row.atom.id === 'core:math:wholehour')!.exercises
      .some(row => row.identityVersion !== 2 && row.family === 'wholehour-pointers')).toBe(true);
  });

  it('counts the real polygon boundary and checks right-angle and equal-side conditions', () => {
    for (const task of tasks('plane-boundary-count')) {
      const polygon = vertices(drawing(task)); expect(parts(task.answer)).toEqual({ sides: polygon.length, corners: polygon.length });
      expect(task.blocks![0].alt).not.toMatch(/\d+条|\d+个/);
    }
    for (const task of tasks('plane-property-insufficiency')) {
      const facts = geometry(vertices(drawing(task))), isSquare = facts.sides === 4 && facts.right && facts.equilateral;
      const premise = task.stem.includes('四条边一样长') ? facts.sides === 4 && facts.equilateral : task.stem.includes('四个直角') ? facts.sides === 4 && facts.right : facts.sides === 4;
      expect(task.answer).toBe(premise && !isSquare);
    }
    expect(shape(vertices(assets['constraint-0.svg']))).toBe('其他四边形');
    expect(geometry(vertices(assets['constraint-0.svg'])).equilateral).toBe(true);
  });

  it('physically clips every cut polygon and checks both resulting pieces and area conservation', () => {
    for (const task of tasks('plane-cut-pieces')) {
      const body = drawing(task), original = vertices(body), [a, b] = linePoints(tagById(body, 'cut')!);
      const pieces = [clip(original, a, b, 1), clip(original, a, b, -1)];
      expect(pieces.every(piece => area(piece) > 0)).toBe(true);
      expect(area(pieces[0]) + area(pieces[1])).toBeCloseTo(area(original), 5);
      const names = pieces.map(shape); expect(new Set(names).size).toBe(1);
      expect(task.answer).toBe(`两块都是${names[0]}`); expect(task.options!.filter(option => option === `两块都是${names[0]}`)).toHaveLength(1);
    }
  });

  it('checks whole surfaces, flat-contact applicability and both functional conditions for each model', () => {
    const facts = [{ flat: 6, curved: 0, contact: '正方形', rolls: false }, { flat: 2, curved: 1, contact: '圆', rolls: true },
      { flat: 0, curved: 1, contact: null, rolls: true }], labels = ['甲', '乙', '丙'];
    expect(assets['solids-0.svg'].match(/>甲<|>乙<|>丙</g)).toEqual(['>甲<', '>乙<', '>丙<']);
    for (const task of tasks('solid-surface-observations')) {
      const index = labels.indexOf(task.stem.match(/把(.)卡/)![1]); expect(parts(task.answer)).toEqual({ flat: facts[index].flat, curved: facts[index].curved });
    }
    for (const task of tasks('solid-contact-trace')) {
      const index = labels.indexOf(task.stem.match(/选(.)卡/)![1]); expect(task.answer).toBe(facts[index].contact ?? '这个模型没有平底面，不能按这个要求印');
      expect(facts[index].flat > 0).toBe(facts[index].contact !== null);
    }
    for (const task of tasks('solid-functional-constraint')) {
      const candidates = facts.map((fact, i) => ({ fact, label: labels[i] })).filter(({ fact }) =>
        task.stem.includes('所有表面都是平面') ? fact.curved === 0 && fact.flat > 0 : task.stem.includes('没有任何平底面') ? fact.rolls && fact.flat === 0 : fact.rolls && fact.flat > 0);
      expect(candidates.map(row => row.label)).toEqual([task.answer]);
    }
  });

  it('reads the actual clock endpoints, keeps hand length invariant and varies thickness in both directions', () => {
    const widths = new Set<boolean>();
    for (const task of tasks('wholehour-pointers')) {
      const body = drawing(task), hour = hand(body, 'hour')!, minute = hand(body, 'minute')!;
      expect(hour.length).toBeCloseTo(45, 4); expect(minute.length).toBeCloseTo(72, 4); expect(minute.position).toBe(12); expect(task.answer).toBe(hour.position);
      widths.add(hour.width > minute.width);
    }
    expect([...widths].sort()).toEqual([false, true]);
    for (const task of tasks('wholehour-identify-hands')) expect(task.answer).toBe(task.stem.includes('表示小时') ? '短针' : '长针');
  });

  it('retains one genuinely unknown-hour task without exposing a hidden hour in the figure or alt text', () => {
    let unknown = 0;
    for (const task of tasks('wholehour-missing-hand-evidence')) {
      const body = drawing(task), hour = hand(body, 'hour'), minute = hand(body, 'minute');
      expect(Boolean(hour)).not.toBe(Boolean(minute));
      if (hour) { expect(task.answer).toBe(`${hour.position}时整`); expect(task.blocks![0].alt).not.toContain('长针指12'); }
      else { unknown++; expect(minute!.position).toBe(12); expect(task.answer).toBe('还不能确定是几时整'); expect(task.blocks![0].alt).not.toMatch(/短针指\d/); }
    }
    expect(unknown).toBe(1);
  });

  it('executes every proposed repair and finds exactly one action that sets both required hands correctly', () => {
    const targets = new Set<string>();
    for (const task of tasks('wholehour-model-repair')) {
      const body = drawing(task), hour = hand(body, 'hour')!.position, minute = hand(body, 'minute')!.position;
      const target = Number(task.stem.match(/拨成(\d+)时整/)![1]);
      const valid = task.options!.filter(option => {
        const match = option.match(/只把(长|短)针拨到(\d+)/); if (!match) return false;
        return (match[1] === '长' ? hour === target && Number(match[2]) === 12 : minute === 12 && Number(match[2]) === target);
      });
      expect(valid).toEqual([task.answer]); expect(Number(hour !== target) + Number(minute !== 12)).toBe(1);
      targets.add(String(task.answer).includes('长针拨') ? 'minute' : 'hour');
      expect(task.stem).toContain('练习盘'); expect(task.stem).not.toMatch(/经过|分钟后|上午|晚上/);
    }
    expect(targets.size).toBe(2);
  });

  it('keeps all twelve dial labels visible and places the occlusion notice outside the clock', () => {
    for (const [name, body] of Object.entries(assets).filter(([name]) => name.startsWith('clock-'))) {
      const labels = [...body.matchAll(/<text\b[^>]*>(\d+)<\/text>/g)].map(match => Number(match[1]));
      expect(labels, name).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
      if (!name.startsWith('clock-hidden-')) continue;
      const dial = attrs(body.match(/<circle\b[^>]*>/)![0]), notice = attrs(body.match(/<rect\b[^>]*fill="#f3e3c8"[^>]*>/)![0]);
      expect(Number(notice.y), name).toBeGreaterThan(Number(dial.cy) + Number(dial.r));
      expect(Number(notice.y) + Number(notice.height)).toBeLessThanOrEqual(Number(attrs(body.match(/<svg\b[^>]*>/)![0]).height));
    }
  });

  it('supports every protocol, scores correct answers and rejects every well-formed distractor', () => {
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

  it('covers basic and transfer contrasts while reporting honest gaps after genuinely new material is exhausted', () => {
    for (const definition of buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id))) {
      const spec = verificationBlueprint({ id: 'qa', title: '对照', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id,
        atomId: definition.atom.id, family: task.family, dimension: task.dimension, difficulty: 1, expectedSeconds: 40 } as MeasurementItem; });
      const selection = selectVerificationItems(spec, items, new Set([definition.atom.id]), 'qa', 8, 600);
      expect(selection.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(selection.selected.map(row => row.family)).size).toBe(4);
      const scarce = items.filter(row => row.family !== families.find(family => family.atomId === definition.atom.id && family.dimension === 'procedure')!.family);
      expect(selectVerificationItems(spec, scarce, new Set([definition.atom.id]), 'qa', 8, 600).verification.fullyCovered, definition.atom.id).toBe(false);
    }
  });

  it('ships only canonical self-contained assets whose bytes exactly match the generator', () => {
    expect(Object.keys(assets)).toHaveLength(43); expect(new Set(Object.values(assets).map(digest)).size).toBe(43);
    const directory = resolve(__dirname, '../../../../web/public/question-assets/spatial-probes-v1');
    expect(readdirSync(directory).sort()).toEqual(Object.keys(assets).sort());
    const references = new Set(families.flatMap(family => family.exercises.map(assetName)));
    expect([...references].sort()).toEqual(Object.keys(assets).sort());
    for (const [name, body] of Object.entries(assets)) {
      expect(body).not.toMatch(/<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|url\s*\(/i);
      expect(body).not.toMatch(/NaN|Infinity|undefined/); expect(readFileSync(resolve(directory, name), 'utf8'), name).toBe(body);
    }
  });
});
