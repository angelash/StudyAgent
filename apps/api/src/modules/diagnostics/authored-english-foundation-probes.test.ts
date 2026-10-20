import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-6686-v1.json';
import { buildEnglishFoundationProbeFamilies } from './authored-english-foundation-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { buildAllAuthoredProbeFamilies } from './authored-probes';
import { buildAllAuthoredMathProbeFamilies } from './authored-math-probes';
import { knowledgeMaterialCoverage } from './verification-materials';
import { gradeResponse } from './scoring';

const families = buildEnglishFoundationProbeFamilies(), tasks = (family: string) => families.find(row => row.family === family)!.exercises;
const record = (task: Exercise) => task.blocks!.find(block => block.type === 'table')!.rows!;
const entries = (task: Exercise): Record<string, string> => Object.fromEntries((task.answer as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
const schemaFor = (id: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(id, task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {},
  options: task.options?.map(value => ({ id: value, label: value, value })) });
// Semantics read independently from the actual Chinese event, allowing Hello as a valid general greeting.
const suitable = (scene: string, reply: string) => {
  if (/道别|离开/.test(scene)) return reply === 'Goodbye!';
  if (/晚安|睡觉/.test(scene)) return reply === 'Good night!';
  if (reply === 'Hello!') return /见面/.test(scene);
  if (/早上/.test(scene)) return reply === 'Good morning!';
  if (/下午/.test(scene)) return reply === 'Good afternoon!';
  if (/晚上/.test(scene)) return reply === 'Good evening!';
  return false;
};

describe('English foundation written task contrasts with independently reconstructed responses', () => {
  it('preserves all 6686 full historical task objects and IDs while adding 144 unique tasks in twelve described groups', () => {
    const definitions = buildFoundationCurriculum(), all = definitions.flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const ids = new Set(baseline.ids), previous = all.filter(row => ids.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(6686); expect(baseline.sha256).toBe('e390a1a5e5bb4978db738c3312e73fe3d88390a3b1bda5ba24c62f7925e11d35');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(7598); expect(new Set(all.map(row => row.id)).size).toBe(7598);
    expect(families).toHaveLength(12); expect(new Set(families.map(row => row.atomId)).size).toBe(3);
    for (const family of families) {
      expect(family.exercises).toHaveLength(12); expect(family.structure).toContain('→'); expect(family.distinction.length).toBeGreaterThan(15);
      expect(family.exercises.every(task => !ids.has(foundationQuestionId(family.atomId, task)))).toBe(true);
    }
  });
  it('retains six historical basic identities and appends English after the complete unchanged math registry', () => {
    const basic = families.filter(row => row.dimension !== 'transfer').map(row => row.family).sort();
    expect(basic).toEqual(['alphabet-next', 'alphabet-previous', 'greeting-response', 'greeting-time', 'lower-to-upper', 'upper-to-lower']);
    expect(buildAllAuthoredProbeFamilies().filter(row => row.atomId.includes(':math:'))).toEqual(buildAllAuthoredMathProbeFamilies());
    expect(families.filter(row => row.dimension === 'transfer')).toHaveLength(6);
  });
  it('reconstructs each same-letter claim and includes both outcomes', () => {
    let correct = 0;
    for (const task of tasks('upper-to-lower')) {
      const [, upper, lower] = task.stem.match(/字母卡“([A-Z])”与“([a-z])”/)!;
      const expected = upper.charCodeAt(0) + 32 === lower.charCodeAt(0); expect(task.answer).toBe(expected); correct += Number(expected);
    }
    expect(correct).toBe(6);
  });
  it('checks actual requested letters and rejects lowercase production when uppercase was required', () => {
    for (const task of tasks('lower-to-upper')) {
      const lower = task.stem.match(/依次是“([^”]+)”/)![1].split('、'), answer = entries(task), schema = schemaFor('core:english:lettercase', task);
      expect(Object.values(answer)).toEqual(lower.map(value => String.fromCharCode(value.charCodeAt(0) - 32)));
      const unchanged = (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: row.value.toLowerCase() }));
      expect(gradeResponse(schema, task.answer, unchanged).score).toBe(0);
    }
  });
  it('compares both code positions, rejecting changed letters and reversed positions', () => {
    for (const task of tasks('case-code-position-check')) {
      const code = task.stem.match(/代码是“([^”]+)”/)![1], expected = task.options!.filter(option => [...option].every((letter, i) => letter.toLowerCase() === code[i].toLowerCase()));
      expect(task.answer).toEqual(expected); expect(expected).toHaveLength(2);
      expect(record(task)[0]).toEqual([code, code[0], code[1]]);
    }
  });
  it('enumerates finite card stock without reusing a card and includes absent and insufficient letters', () => {
    for (const task of tasks('case-finite-card-stock')) {
      const stock = record(task).map(row => row[1].toLowerCase()), count = (values: string[], value: string) => values.filter(letter => letter === value).length;
      const expected = task.options!.filter(option => [...option.toLowerCase()].every(letter => count([...option.toLowerCase()], letter) <= count(stock, letter)));
      expect(task.answer).toEqual(expected); expect(expected).toHaveLength(2); expect(stock).toHaveLength(3);
    }
  });
  it('checks next-letter claims independently and forbids wrapping from Z to A', () => {
    let end = 0;
    for (const task of tasks('alphabet-next')) {
      const match = task.stem.match(/“([A-Z])后面紧邻的是([A-Z])”/);
      if (match) expect(task.answer).toBe(match[1] !== 'Z' && match[1].charCodeAt(0) + 1 === match[2].charCodeAt(0));
      else { expect(task.stem).toContain('Z后面没有相邻字母'); expect(task.answer).toBe(true); end++; }
    }
    expect(end).toBe(1); expect(tasks('alphabet-next').some(task => task.stem.includes('Z后面紧邻的是A') && task.answer === false)).toBe(true);
  });
  it('reconstructs both neighbors and uses the stated endpoint sentinel', () => {
    const seen = new Set<string>();
    for (const task of tasks('alphabet-previous')) {
      const letter = task.stem.match(/填写字母([A-Z])前面/)![1], code = letter.charCodeAt(0); seen.add(letter);
      expect(entries(task)).toEqual({ previous: code > 65 ? String.fromCharCode(code - 1) : '无', next: code < 90 ? String.fromCharCode(code + 1) : '无' });
    }
    expect(seen.has('A') && seen.has('Z')).toBe(true);
  });
  it('searches every allowed one-card move and finds exactly one repair', () => {
    for (const task of tasks('alphabet-one-card-repair')) {
      const cards = task.stem.match(/从左到右是“([^”]+)”/)![1].split('、'), front = task.stem.includes('移到队首');
      const valid = cards.filter((card, index) => {
        const rest = cards.filter((_, i) => i !== index), result = front ? [card, ...rest] : [...rest, card];
        return result.every((value, i) => !i || result[i - 1].charCodeAt(0) + 1 === value.charCodeAt(0));
      });
      expect(valid).toEqual([task.answer]); expect(new Set(task.options)).toEqual(new Set(cards));
    }
  });
  it('searches all 26 possible starts through the displayed route and rejects out-of-range paths', () => {
    for (const task of tasks('alphabet-hidden-route')) {
      const end = task.stem.match(/停在([A-Z])/)![1], moves = record(task).map(row => {
        const [, direction, steps] = row[1].match(/向(后|前)移动(\d+)个字母/)!; return Number(steps) * (direction === '后' ? 1 : -1);
      });
      const possible = Array.from({ length: 26 }, (_, n) => n + 65).map(start => {
        const trace = [start]; for (const move of moves) trace.push(trace.at(-1)! + move); return trace;
      }).filter(trace => trace.every(code => code >= 65 && code <= 90) && trace.at(-1) === end.charCodeAt(0));
      expect(possible).toHaveLength(1); expect(entries(task)).toEqual({ start: String.fromCharCode(possible[0][0]), afterTwo: String.fromCharCode(possible[0][2]) });
    }
  });
  it('checks the actual offered greeting without marking a general Hello as wrong at a meeting', () => {
    let positives = 0;
    for (const task of tasks('greeting-time')) {
      const [, scene, offered] = task.stem.match(/情境是“([^”]+)”。使用“([^”]+)”/)!;
      const expected = suitable(scene, offered); expect(task.answer).toBe(expected); positives += Number(expected);
    }
    expect(positives).toBe(6); expect(suitable('晚上见面，开口问候', 'Hello!')).toBe(true);
  });
  it('derives complete reply pairs from actual scene and reply labels', () => {
    for (const task of tasks('greeting-response')) {
      const schema = schemaFor('core:english:greeting', task), config = answerInputConfiguration(schema);
      const pairs = config.left.map(scene => {
        const matching = config.right.filter(reply => suitable(scene.label, reply.label)); expect(matching).toHaveLength(1);
        return { left: scene.id, right: matching[0].id };
      });
      expect(gradeResponse(schema, task.answer, { pairs: [...pairs].reverse() }).score).toBe(1);
      for (let shift = 1; shift < pairs.length; shift++) expect(gradeResponse(schema, task.answer, { pairs: pairs.map((pair, i) => ({ ...pair, right: pairs[(i + shift) % pairs.length].right })) }).score).toBe(0);
    }
  });
  it('locates exactly one dialogue error and exactly one suitable supplied replacement', () => {
    for (const task of tasks('greeting-dialogue-repair')) {
      const wrongRows = record(task).filter(row => !suitable(row[1], row[2])); expect(wrongRows).toHaveLength(1);
      const options = task.stem.match(/再从“([^”]+)”/)![1].split(' / '), valid = options.filter(reply => suitable(wrongRows[0][1], reply));
      expect(valid).toHaveLength(1); expect(entries(task)).toEqual({ row: wrongRows[0][0], reply: valid[0] });
      const lower = (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: row.value.toLowerCase() }));
      expect(gradeResponse(schemaFor('core:english:greeting', task), task.answer, lower).score).toBe(1);
    }
    expect(new Set(tasks('greeting-dialogue-repair').map(task => JSON.stringify(task.blocks))).size).toBe(12);
  });
  it('uses the current event and supplies exactly one appropriate reply instead of competing valid greetings', () => {
    for (const task of tasks('greeting-updated-event')) {
      const rows = record(task); expect(rows[0][1]).not.toBe(rows[1][1]);
      const valid = task.options!.filter(reply => suitable(rows[1][1], reply)); expect(valid).toEqual([task.answer]);
    }
    expect(new Set(tasks('greeting-updated-event').map(task => JSON.stringify(task.blocks))).size).toBe(12);
  });
  it('checks every nonempty multiple-choice subset and reverse answer order', () => {
    for (const family of families) for (const task of family.exercises.filter(task => task.mode === 'multiple_choice')) {
      const schema = schemaFor(family.atomId, task), expected = new Set(task.answer as string[]);
      for (let mask = 1; mask < 2 ** task.options!.length; mask++) {
        const answer = task.options!.filter((_, i) => mask & (1 << i)), correct = answer.length === expected.size && answer.every(value => expected.has(value));
        expect(gradeResponse(schema, task.answer, answer).score).toBe(correct ? 1 : 0);
      }
      expect(gradeResponse(schema, task.answer, [...expected].reverse()).score).toBe(1);
    }
  });
  it('checks every supplied standard and each multi-blank partial score with valid wrong entries', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task); expect(answerInputConfiguration(schema).supported, task.stem).toBe(true);
      expect(gradeResponse(schema, task.answer, task.answer).score, task.stem).toBe(1);
      if (task.mode === 'multi_blank') {
        const expected = task.answer as Array<{ key: string; value: string }>;
        for (let index = 0; index < expected.length; index++) {
          const answer = expected.map((row, i) => ({ ...row, value: i === index ? 'QA未达标' : row.value }));
          expect(gradeResponse(schema, task.answer, answer).score).toBeCloseTo((expected.length - 1) / expected.length);
        }
      }
    }
  });
  it('includes explicit grading requirements in new task identity while preserving unconfigured historical identities', () => {
    const task = tasks('lower-to-upper')[0];
    expect(foundationQuestionId('core:english:lettercase', task)).not.toBe(foundationQuestionId('core:english:lettercase', { ...task, gradingConfig: { caseSensitive: false } }));
    const legacy = { ...task, identityVersion: undefined }; expect(foundationQuestionId('core:english:lettercase', legacy)).toBe(foundationQuestionId('core:english:lettercase', { ...legacy, gradingConfig: { caseSensitive: false } }));
  });
  it('assembles all three actual target-only four-structure examples within budget using only written protocols', () => {
    for (const id of new Set(families.map(row => row.atomId))) {
      const atom = buildFoundationCurriculum().find(row => row.atom.id === id)!.atom;
      const candidates = families.filter(row => row.atomId === id).flatMap(row => row.exercises.map((task, n): MeasurementItem => ({
        id: `${row.family}:${n}`, atomId: id, family: row.family, dimension: row.dimension, questionId: foundationQuestionId(id, task), questionVersion: 1,
        expectedSeconds: task.expectedSeconds!, difficulty: 1, probeRole: 'anchor', mappingWeight: 1, observationCode: 'response_mismatch', reviewStatus: 'approved', version: 1 })));
      const coverage = knowledgeMaterialCoverage(atom, candidates); expect(coverage.ready).toBe(true); expect(coverage.sample.items).toBe(4);
      expect(coverage.sample.expectedSeconds).toBeLessThanOrEqual(600); expect(atom.subject).toBe('english'); expect(atom.grade).toBe(1);
    }
    expect(families.every(row => row.exercises.every(task => !['audio_record', 'image_upload', 'short_answer'].includes(task.mode!)))).toBe(true);
  });
});
