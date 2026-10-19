import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, type DiagnosticHypothesis, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import { buildArithmeticProbeFamilies } from './authored-arithmetic-probes';
import { buildNumberProbeFamilies } from './authored-number-probes';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';
import { arithmeticValue } from './arithmetic-expression';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildNumberProbeFamilies();
const tasks = (name: string) => families.find(family => family.family === name)!.exercises;
const entries = (answer: unknown): Record<string, number> => Object.fromEntries((answer as Array<{ key: string; value: string }>).map(row => [row.key, Number(row.value)]));
const dots = (text: string) => (text.match(/●/g) ?? []).length;
const countBlock = (exercise: { blocks?: Array<{ rows?: string[][] }> }, index = 0) => dots(exercise.blocks![index].rows!.flat().join(' '));
const evaluate = (text: string) => arithmeticValue(text.replaceAll('−', '-'));

describe('quantity, order and unit probes from real representations', () => {
  it('provides 480 distinct tasks on ten points and preserves the last arithmetic batch verbatim', () => {
    expect(families).toHaveLength(40); expect(new Set(families.map(row => row.atomId)).size).toBe(10);
    const ids = families.flatMap(family => family.exercises.map(exercise => foundationQuestionId(family.atomId, exercise)));
    expect(ids).toHaveLength(480); expect(new Set(ids).size).toBe(480);
    const old = buildArithmeticProbeFamilies().flatMap(family => family.exercises.map(exercise => ({ atomId: family.atomId,
      id: foundationQuestionId(family.atomId, exercise), exercise }))).sort((a, b) => a.id.localeCompare(b.id));
    expect(createHash('sha256').update(JSON.stringify(old)).digest('hex')).toBe('4f0b8147252a8ef3771a389fb1f308175a79d37357bdea8db9fd567b3c25b3a2');
  });

  it('detects duplicate enumeration even with a correct ledger length, and counts only actual target objects', () => {
    let deceptive = 0;
    for (const task of tasks('count-enumeration-audit')) {
      const [objects, ledger] = task.blocks![0].rows![0].map(text => text.split('、'));
      const valid = objects.every(id => ledger.filter(value => value === id).length === 1) && ledger.every(id => objects.includes(id));
      expect(task.answer).toBe(valid); if (!valid && objects.length === ledger.length) deceptive++;
    }
    expect(deceptive).toBeGreaterThan(0);
    for (const task of tasks('count-partition-tracking')) expect(task.answer).toBe(countBlock(task));
    for (const task of tasks('count-target-filter')) expect(task.answer).toBe(countBlock(task));
    for (const task of tasks('count-layout-conservation')) expect(task.answer).toBe(countBlock(task, 0) === countBlock(task, 1));
  });

  it('solves ordered numbers, quantity fields and paired displays without relying on generator parameters', () => {
    for (const task of tasks('compare-place-counterexample')) {
      const [a, b, claim] = task.stem.match(/\d+/g)!.map(Number); expect(task.answer).toBe(claim === Math.max(a, b));
    }
    for (const task of tasks('compare-symbol')) {
      const items = task.responseShape!.items as Array<{ id: string; label: string }>, byId = new Map(items.map(item => [item.id, Number(item.label)]));
      const values = (task.answer as string[]).map(id => byId.get(id)!);
      expect(values).toEqual(items.map(item => Number(item.label)).sort((a, b) => task.stem.includes('从大到小') ? b - a : a - b));
      expect(Math.max(...values)).toBeLessThanOrEqual(20);
    }
    for (const task of tasks('compare-select-quantity-field')) expect(task.answer).toBe(Math.max(...task.blocks![0].rows!.map(row => Number(row[1]))));
    for (const task of tasks('compare-one-to-one-matching')) {
      const [upper, lower] = task.blocks![0].rows!.map(row => row.slice(1).filter(cell => cell !== '—').length);
      expect(task.answer).toBe(upper > lower ? '上组' : lower > upper ? '下组' : '两组同样多');
    }
  });

  it('simulates inclusive positions, reversed labels and removal before or after the target', () => {
    for (const task of tasks('ordinal-total-from-sides')) {
      const [front, back] = task.stem.match(/\d+/g)!.map(Number);
      expect(task.answer).toBe([...Array(front).fill('前'), '本人', ...Array(back).fill('后')].length);
    }
    for (const name of ['ordinal-sequence-select', 'ordinal-reversal']) for (const task of tasks(name)) {
      const line = task.blocks![0].rows![0][0].split('　');
      const position = Number(task.stem.match(/第(\d+)个/)![1]); if (task.stem.includes('从右')) line.reverse();
      expect(task.answer).toBe(line[position - 1]);
    }
    for (const task of tasks('ordinal-removal-update')) {
      const [total, position, removed] = task.stem.match(/\d+/g)!.map(Number);
      const line = Array.from({ length: total }, (_, i) => i + 1).filter(id => id !== removed);
      expect(removed).not.toBe(position); expect(task.answer).toBe(line.indexOf(position) + 1);
    }
  });

  it('checks the two unit intervals around each integer including transitions through ten', () => {
    for (const task of tasks('integer-step-continuity')) {
      const numbers = task.stem.match(/\d+/g)!.map(Number); expect(task.answer).toBe(numbers.every((value, i) => i === 0 || value - numbers[i - 1] === 1));
    }
    let crossesTen = false;
    for (const task of tasks('predecessor')) {
      const value = Number(task.stem.match(/写出(\d+)/)![1]), parts = entries(task.answer);
      expect(parts.before + 1).toBe(value); expect(parts.after - 1).toBe(value); if (value === 10) crossesTen = true;
    }
    expect(crossesTen).toBe(true);
    for (const task of tasks('integer-between-boundaries')) {
      const [before, , after] = task.blocks![0].rows![0]; expect(Number(task.answer) - Number(before)).toBe(1); expect(Number(after) - Number(task.answer)).toBe(1);
    }
    for (const task of tasks('successor')) expect(task.answer).toBe(Number(task.stem.match(/刚发出(\d+)号/)![1]) + 1);
  });

  it('checks base-ten units, reverse packaging and the values of moved number cards', () => {
    for (const task of tasks('tensones-unit-audit')) {
      const [tens, ones, claimed] = task.stem.match(/\d+/g)!.map(Number); expect(task.answer).toBe(claimed === tens * 10 + ones);
    }
    for (const task of tasks('tens-compose')) {
      const [tens, ones] = task.blocks![0].rows!.map(row => Number(row[1])), value = entries(task.answer);
      expect(value.tensValue).toBe(tens * 10); expect(value.number).toBe(tens * 10 + ones);
    }
    for (const task of tasks('tensones-reverse-packs')) {
      const loose = Number(task.stem.match(/和(\d+)枚散棋子/)![1]), total = Number(task.stem.match(/一共(\d+)枚/)![1]);
      expect(Number(task.answer) * 10 + loose).toBe(total);
    }
    for (const task of tasks('tensones-card-position')) {
      const [left, right] = [...task.stem.matchAll(/数字卡(\d+)/g)].map(match => Number(match[1])), value = entries(task.answer);
      expect(value.before).toBe(Number(`${left}${right}`)); expect(value.after).toBe(Number(`${right}${left}`));
    }
  });

  it('counts the ten-frame cells, checks exact capacity and rejects all incorrect combined models', () => {
    for (const task of tasks('complement10-conservation')) {
      const filled = Number(task.stem.match(/已有(\d+)颗/)![1]), added = Number(task.stem.match(/补入(\d+)颗/)![1]); expect(task.answer).toBe(filled + added === 10);
    }
    for (const task of tasks('complement-equation')) {
      const [first, second] = [...task.stem.matchAll(/(\d+)\+/g)].map(match => Number(match[1])), value = entries(task.answer);
      expect(first + value.square).toBe(10); expect(second + value.triangle).toBe(10);
    }
    for (const task of tasks('complement10-empty-frame')) {
      const cells = task.blocks![0].rows!.flat(); expect(cells).toHaveLength(10); expect(task.answer).toBe(cells.filter(cell => cell === '空').length);
    }
    for (const task of tasks('complement10-combined-model')) {
      const [, first, second] = task.stem.match(/\d+/g)!.map(Number), remaining = 10 - first - second;
      expect(task.options!.filter(option => evaluate(option) === remaining)).toEqual([task.answer]); expect(remaining).toBeGreaterThan(0);
    }
  });

  it('independently restores unknown parts and initial states rather than adding the whole again', () => {
    for (const task of tasks('unknownadd-part-model')) {
      const [total, known] = task.stem.match(/\d+/g)!.map(Number); expect(task.options!.filter(option => evaluate(option) === total - known)).toEqual([task.answer]);
    }
    for (const task of tasks('unknownadd-candidate-audit')) {
      const [known, total, candidate] = task.stem.match(/\d+/g)!.map(Number); expect(task.answer).toBe(known + candidate === total);
    }
    for (const task of tasks('unknownadd-initial-state')) {
      const [added, after] = task.stem.match(/\d+/g)!.map(Number); expect(Number(task.answer) + added).toBe(after);
    }
    for (const task of tasks('unknownadd-hidden-two-parts')) {
      const total = Number(task.stem.match(/共有(\d+)颗/)![1]); expect(Number(task.answer) + countBlock(task)).toBe(total); expect(Number(task.answer)).toBeGreaterThan(0);
    }
  });

  it('finds unmatched objects, equalization amounts and lengths from nonzero endpoints', () => {
    for (const task of tasks('difference-pairing-remainder')) expect(task.answer).toBe(task.blocks![0].rows!.filter(([, lower]) => lower === '—').length);
    for (const task of tasks('difference-numeric')) {
      const [a, b] = task.stem.match(/\d+/g)!.map(Number), parts = entries(task.answer); expect(parts.more).toBe(a - b); expect(parts.less).toBe(a - b);
    }
    for (const task of tasks('difference-equalization')) {
      const [left, right] = task.stem.match(/\d+/g)!.map(Number); expect(right + Number(task.answer)).toBe(left);
    }
    for (const task of tasks('difference-shifted-endpoints')) {
      const start = Number(task.stem.match(/从刻度(\d+)/)![1]), end = Number(task.stem.match(/到刻度(\d+)/)![1]);
      expect(start + Number(task.answer)).toBe(end); expect(task.answer).not.toBe(end);
    }
  });

  it('replays actual event directions and reconstructs missing earlier states', () => {
    for (const task of tasks('mixed-chain-order-audit')) expect(task.answer).toBe(!task.stem.includes('这个和'));
    for (const task of tasks('addition-subtraction-chain')) {
      const [, a, b, c] = task.stem.match(/计算(\d+)\+(\d+)−(\d+)/)!.map(Number), parts = entries(task.answer);
      expect(parts.middle).toBe(a + b); expect(parts.final).toBe(evaluate(`${a}+${b}-${c}`));
    }
    for (const task of tasks('mixed-inventory-events')) {
      let state = Number(task.stem.match(/原有(\d+)张/)![1]);
      for (const [, event, number] of task.blocks![0].rows!) state += (event === '取出' ? -1 : 1) * Number(number);
      expect(task.answer).toBe(state);
    }
    for (const task of tasks('mixed-inverse-reconstruction')) {
      const [removed, added, final] = task.stem.match(/\d+/g)!.map(Number), parts = entries(task.answer);
      expect(parts.initial - removed).toBe(parts.beforeLast); expect(parts.beforeLast + added).toBe(final); expect(parts.initial).toBeLessThanOrEqual(20);
    }
  });

  it('checks denomination value conservation, comparisons and unknown coin multiplicity', () => {
    for (const task of tasks('money10-conservation-audit')) {
      const [yuan, jiao, claimed] = task.stem.match(/\d+/g)!.map(Number); expect(task.answer).toBe(yuan * 10 + jiao === claimed);
    }
    for (const task of tasks('money10-exchange-record')) {
      const [, yuan, jiao] = task.stem.match(/原有(\d+)张1元和(\d+)枚1角/)!.map(Number), parts = entries(task.answer);
      expect(parts.yuan + 1).toBe(yuan); expect(parts.jiao - 10).toBe(jiao); expect(parts.yuan * 10 + parts.jiao).toBe(yuan * 10 + jiao);
    }
    for (const task of tasks('money10-compare-prices')) {
      const [yuan, jiao, other] = task.stem.match(/\d+/g)!.map(Number); expect(task.answer).toBe(yuan * 10 + jiao > other ? '甲' : '乙');
    }
    for (const task of tasks('money10-missing-coins')) {
      const yuan = Number(task.stem.match(/只有(\d+)张/)![1]), total = Number(task.stem.match(/总价值为(\d+)角/)![1]); expect(yuan * 10 + Number(task.answer)).toBe(total);
    }
  });

  it('scores every correct response, rejects wrong but well-formed input and validates the content protocol', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema: QuestionAnswerSchema = { questionId: foundationQuestionId(family.atomId, task), mode: task.mode ?? 'numeric_blank',
        responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) };
      const envelope = (value: unknown) => ({ questionId: schema.questionId, mode: schema.mode, response: schema.mode === 'sorting' ?
        { values: value } : schema.mode === 'multi_blank' ? { entries: value } : { value } });
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, envelope(task.answer))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(task.answer)).score, task.stem).toBe(1);
      const wrong = schema.mode === 'boolean' ? !task.answer : schema.mode === 'single_choice' ? task.options!.find(option => option !== task.answer) : schema.mode === 'sorting' ?
        [...task.answer as string[]].reverse() : schema.mode === 'multi_blank' ? (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: String(Number(row.value) + 1) })) :
          schema.mode === 'text_blank' ? '不在名单中的标记' : Number(task.answer) + 1;
      expect(answerProtocolIssue(schema, envelope(wrong))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(wrong)).score, task.stem).toBe(0); expect(task.analysis!.length).toBeGreaterThan(15);
    }
  });

  it('arranges two basic and two transfer groups from distinct families for all ten points', () => {
    for (const definition of buildFoundationCurriculum().filter(row => families.some(family => family.atomId === row.atom.id))) {
      const spec = verificationBlueprint({ id: 'qa', title: '核查', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, definition.atom, 'qa');
      const items = definition.exercises.map(task => { const id = foundationQuestionId(definition.atom.id, task); return { id, questionId: id,
        atomId: definition.atom.id, family: task.family, dimension: task.dimension, difficulty: 1, expectedSeconds: 40 } as MeasurementItem; });
      const choice = selectVerificationItems(spec, items, new Set([definition.atom.id]), 'qa', 8, 600);
      expect(choice.verification.fullyCovered, definition.atom.id).toBe(true); expect(new Set(choice.selected.map(row => row.family)).size).toBe(4);
    }
  });

  it('keeps eight previously authored relations in their original families across protocol or context changes', () => {
    const retained = ['compare-symbol', 'ordinal-reversal', 'predecessor', 'successor', 'tens-compose', 'complement-equation', 'difference-numeric', 'addition-subtraction-chain'];
    const definitions = buildFoundationCurriculum();
    for (const family of families.filter(row => retained.includes(row.family))) {
      const old = definitions.find(row => row.atom.id === family.atomId)!.exercises.filter(task => task.identityVersion !== 2);
      expect(old.some(task => task.family === family.family), family.family).toBe(true);
      expect(family.distinction).toMatch(/沿用|保留|保持/);
    }
    expect(families.filter(row => retained.includes(row.family))).toHaveLength(8);
  });
});
