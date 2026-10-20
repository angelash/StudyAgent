import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-6830-v1.json';
import { buildEnglishLexicalProbeFamilies } from './authored-english-lexical-probes';
import { buildAllAuthoredProbeFamilies } from './authored-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { knowledgeMaterialCoverage } from './verification-materials';
import { gradeResponse } from './scoring';

const families = buildEnglishLexicalProbeFamilies(), tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const rows = (task: Exercise) => task.blocks!.find(block => block.type === 'table')!.rows!;
const entries = (task: Exercise): Record<string, string> => Object.fromEntries((task.answer as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
// Independent semantic references; expected answers are reconstructed from the actual displayed records.
const colorMeaning: Record<string, string> = { red: '红色', yellow: '黄色', blue: '蓝色', green: '绿色' };
const colorWord = (meaning: string) => Object.keys(colorMeaning).find(word => colorMeaning[word] === meaning)!;
const numberValue: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const numberWord = (count: number) => Object.keys(numberValue).find(word => numberValue[word] === count)!;
const plural: Record<string, string> = { cat: 'cats', dog: 'dogs', book: 'books', pen: 'pens', map: 'maps', cup: 'cups' };
const form = (noun: string, count: number) => count === 1 ? noun : plural[noun];
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {},
  options: task.options?.map(value => ({ id: value, label: value, value })) });

describe('English lexical written contrasts reconstructed from actual object, stock and noun records', () => {
  it('preserves every historical task object and ID and appends exactly 144 unique new tasks', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const previousIds = new Set(baseline.ids), previous = all.filter(row => previousIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(6830); expect(baseline.sha256).toBe('3391222dcdd2d36468923ebd4ce9c2ac4bb0b2673973674ff1e10970ddc557ce');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(7550); expect(new Set(all.map(row => row.id)).size).toBe(7550);
    const targetAtoms = new Set(families.map(row => row.atomId));
    expect(all.filter(row => !previousIds.has(row.id) && targetAtoms.has(row.atomId))).toHaveLength(144);
  });
  it('keeps six historical basic identities and describes twelve groups without treating input changes as new structures', () => {
    expect(families).toHaveLength(12); expect(new Set(families.map(row => row.atomId)).size).toBe(3);
    expect(families.filter(row => row.dimension !== 'transfer').map(row => row.family).sort()).toEqual([
      'color-context', 'color-meaning', 'number-word-produce', 'number-word-read', 'plural-number', 'plural-phrase']);
    for (const family of families) {
      expect(family.exercises).toHaveLength(12); expect(family.structure).toContain('→'); expect(family.distinction.length).toBeGreaterThan(15);
    }
    expect(buildAllAuthoredProbeFamilies().filter(row => families.some(current => current.atomId === row.atomId))).toEqual(families);
  });
  it('derives the color choice solely from the explicit description and offers one correct word', () => {
    for (const task of tasks('color-context')) {
      const meaning = task.stem.match(/是(红色|黄色|蓝色|绿色)的/)![1];
      expect(task.options!.filter(word => colorMeaning[word] === meaning)).toEqual([task.answer]);
    }
  });
  it('reconstructs complete matching from actual color and meaning labels instead of displayed positions', () => {
    for (const task of tasks('color-meaning')) {
      const schema = schemaFor('core:english:color', task), config = answerInputConfiguration(schema);
      const pairs = config.left.map(word => {
        const options = config.right.filter(meaning => colorMeaning[word.label] === meaning.label); expect(options).toHaveLength(1);
        return { left: word.id, right: options[0].id };
      });
      expect(gradeResponse(schema, task.answer, { pairs: [...pairs].reverse() }).score).toBe(1);
      for (let shift = 1; shift < pairs.length; shift++) expect(gradeResponse(schema, task.answer, {
        pairs: pairs.map((pair, i) => ({ ...pair, right: pairs[(i + shift) % pairs.length].right })) }).score).toBe(0);
    }
  });
  it('locates the sole conflicting color label and reconstructs its supplied replacement', () => {
    for (const task of tasks('color-record-repair')) {
      const conflicts = rows(task).filter(row => colorMeaning[row[3]] !== row[2]); expect(conflicts).toHaveLength(1);
      expect(entries(task)).toEqual({ row: conflicts[0][0], word: colorWord(conflicts[0][2]) });
      expect(task.stem).toContain('red / blue / green / yellow');
    }
    expect(new Set(tasks('color-record-repair').map(task => JSON.stringify(task.blocks))).size).toBe(12);
  });
  it('folds all actual color events by object and rejects the final other-object shortcut', () => {
    let lastIsOther = 0;
    for (const task of tasks('color-object-update')) {
      const target = task.stem.match(/现在只问“([^”]+)”/)![1], current = new Map<string, string>(), changes: string[] = [];
      for (const row of rows(task)) { current.set(row[1], row[2]); if (row[1] === target) changes.push(row[2]); }
      expect(new Set(changes).size).toBe(3); expect(task.answer).toBe(colorWord(current.get(target)!));
      expect(task.options!.filter(word => colorMeaning[word] === current.get(target))).toEqual([task.answer]);
      if (rows(task).at(-1)![1] !== target) { expect(colorWord(rows(task).at(-1)![2])).not.toBe(task.answer); lastIsOther++; }
    }
    expect(lastIsOther).toBe(6);
  });
  it('checks written number claims against independent meanings and spans all ten values', () => {
    const seen = new Set<number>(); let correct = 0;
    for (const task of tasks('number-word-read')) {
      const word = task.stem.match(/记录写着“([a-z]+)”/)![1], claimed = Number(task.stem.match(/记成(\d+)个/)![1]);
      const value = numberValue[word]; expect(value).toBeDefined(); seen.add(value);
      expect(task.answer).toBe(value === claimed); correct += Number(task.answer);
    }
    expect(seen.size).toBe(10); expect(correct).toBe(6);
  });
  it('produces each number word from the actual displayed digit record', () => {
    const seen = new Set<number>();
    for (const task of tasks('number-word-produce')) {
      const expected = Object.fromEntries(rows(task).map((row, i) => { const count = Number(row[2]); seen.add(count); return [`record${i}`, numberWord(count)]; }));
      expect(entries(task)).toEqual(expected);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('counts the actual inventory symbols before checking every offered quantity label', () => {
    for (const task of tasks('numberword-inventory-check')) {
      const expected = rows(task).filter(row => (row[1].match(/●/g) ?? []).length === numberValue[row[2]]).map(row => row[0]);
      expect(new Set(task.answer as string[])).toEqual(new Set(expected)); expect(expected.length).toBeGreaterThan(1);
      expect(expected.length).toBeLessThan(4); expect(rows(task).every(row => !/\d/.test(row[1]))).toBe(true);
    }
  });
  it('decodes and executes the actual stock events while keeping every state between one and ten', () => {
    for (const task of tasks('numberword-stock-events')) {
      const records = rows(task), initial = numberValue[records[0][2]], trace = [initial];
      for (const record of records.slice(1)) {
        expect(['移入', '移出']).toContain(record[1]);
        trace.push(trace.at(-1)! + (record[1] === '移入' ? 1 : -1) * numberValue[record[2]]);
      }
      expect(trace.every(count => count >= 1 && count <= 10)).toBe(true);
      expect(entries(task)).toEqual({ afterIn: numberWord(trace[1]), final: numberWord(trace[2]) });
    }
  });
  it('judges noun labels from the given single form and actual quantity with both singular and plural counterexamples', () => {
    const outcomes = new Set<string>();
    for (const task of tasks('plural-number')) {
      const noun = task.stem.match(/^([a-z]+)是/)![1], count = Number(task.stem.match(/明确有(\d+)个/)![1]), offered = task.stem.match(/名词“([a-z]+)”/)![1];
      const expected = form(noun, count) === offered; expect(task.answer).toBe(expected); outcomes.add(`${count === 1 ? 'single' : 'plural'}:${expected}`);
    }
    expect(outcomes.size).toBe(4);
  });
  it('reconstructs all requested noun forms from actual quantity rows and a fixed regular-noun dictionary', () => {
    for (const task of tasks('plural-phrase')) {
      const noun = task.stem.match(/给定单数词([a-z]+)（/)![1]; expect(plural[noun]).toBeDefined();
      expect(entries(task)).toEqual(Object.fromEntries(rows(task).map((row, i) => [`record${i}`, form(noun, Number(row[1]))])));
    }
  });
  it('finds exactly one noun-record conflict and repairs it without changing the other rows', () => {
    for (const task of tasks('plural-record-repair')) {
      const wrong = rows(task).filter(row => row[3] !== form(row[1], Number(row[2]))); expect(wrong).toHaveLength(1);
      expect(entries(task)).toEqual({ row: wrong[0][0], noun: form(wrong[0][1], Number(wrong[0][2])) });
      expect(rows(task).every(row => plural[row[1]] !== undefined)).toBe(true);
    }
    expect(new Set(tasks('plural-record-repair').map(task => JSON.stringify(task.blocks))).size).toBe(12);
  });
  it('keeps one-container and all-container scopes separate and includes six different-form contrasts', () => {
    let contrasts = 0;
    for (const task of tasks('plural-container-scope')) {
      const noun = task.stem.match(/物品单数词([a-z]+)（/)![1], record = Object.fromEntries(rows(task)), boxes = Number(record['外层盒子']), each = Number(record['每个盒子里的同类物品']);
      expect(boxes).toBeGreaterThan(1); expect(each).toBeGreaterThanOrEqual(1);
      expect(entries(task)).toEqual({ inside: form(noun, each), all: form(noun, boxes * each) });
      if (each === 1) { expect(entries(task).inside).not.toBe(entries(task).all); contrasts++; }
    }
    expect(contrasts).toBe(6);
  });
  it('checks all 144 standards against their actual supported written input configurations', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task); expect(answerInputConfiguration(schema).supported, task.stem).toBe(true);
      expect(gradeResponse(schema, task.answer, task.answer).score, task.stem).toBe(1);
    }
  });
  it('accepts legal zero-score fixtures in each used objective protocol', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task); let wrong: unknown;
      if (task.mode === 'boolean') wrong = !task.answer;
      else if (task.mode === 'single_choice') wrong = task.options!.find(value => value !== task.answer);
      else if (task.mode === 'multiple_choice') wrong = [task.options!.find(value => !(task.answer as string[]).includes(value))];
      else if (task.mode === 'multi_blank') wrong = (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: 'QA未达标' }));
      else if (task.mode === 'matching') {
        const pairs = (task.answer as { pairs: Array<{ left: string; right: string }> }).pairs;
        wrong = { pairs: pairs.map((pair, i) => ({ ...pair, right: pairs[(i + 1) % pairs.length].right })) };
      } else throw new Error(`Uncovered fixture protocol ${task.mode}`);
      expect(gradeResponse(schema, task.answer, wrong).score, task.stem).toBe(0);
    }
  });
  it('enumerates every nonempty inventory-choice subset and permits reversed correct answer order', () => {
    for (const task of tasks('numberword-inventory-check')) {
      const schema = schemaFor('core:english:numberword', task), expected = new Set(task.answer as string[]);
      for (let mask = 1; mask < 2 ** task.options!.length; mask++) {
        const answer = task.options!.filter((_, i) => mask & (1 << i)), correct = answer.length === expected.size && answer.every(value => expected.has(value));
        expect(gradeResponse(schema, task.answer, answer).score).toBe(correct ? 1 : 0);
      }
      expect(gradeResponse(schema, task.answer, [...expected].reverse()).score).toBe(1);
    }
  });
  it('preserves each intermediate multi-blank error as the corresponding partial score', () => {
    for (const family of families) for (const task of family.exercises.filter(task => task.mode === 'multi_blank')) {
      const schema = schemaFor(family.atomId, task), expected = task.answer as Array<{ key: string; value: string }>;
      for (let index = 0; index < expected.length; index++) {
        const submitted = expected.map((row, i) => ({ ...row, value: i === index ? 'QA未达标' : row.value }));
        const score = gradeResponse(schema, task.answer, submitted);
        expect(score.score).toBeCloseTo((expected.length - 1) / expected.length); expect(score.scoreDetails).toHaveLength(expected.length);
        expect(score.scoreDetails!.filter(row => row.score === 0)).toHaveLength(1);
      }
    }
  });
  it('assembles three target-only four-structure examples within 600 seconds without any oral or listening protocol', () => {
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
  it('does not misclassify letter case alone as a lexical or plural-rule failure in typed word responses', () => {
    for (const family of families) for (const task of family.exercises.filter(task => task.mode === 'multi_blank')) {
      const changedCase = (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: row.value.toUpperCase() }));
      expect(gradeResponse(schemaFor(family.atomId, task), task.answer, changedCase).score).toBe(1);
    }
  });
});
