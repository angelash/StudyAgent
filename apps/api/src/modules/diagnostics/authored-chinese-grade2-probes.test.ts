import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-7598-v1.json';
import { buildChineseGrade2ProbeFamilies, buildChineseOralGrade2ProbeFamilies } from './authored-chinese-grade2-probes';
import { buildAllAuthoredProbeFamilies } from './authored-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { knowledgeMaterialCoverage } from './verification-materials';

const families = [...buildChineseGrade2ProbeFamilies(), ...buildChineseOralGrade2ProbeFamilies()];
const written = buildChineseGrade2ProbeFamilies(), oral = buildChineseOralGrade2ProbeFamilies();
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {},
  options: task.options?.map(value => ({ id: value, label: value, value })) });

describe('Chinese grade-two complete written and oral contrasts', () => {
  it('preserves 7598 historical objects and appends 624 unique tasks in 52 groups', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const ids = new Set(baseline.ids), previous = all.filter(row => ids.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(7598); expect(baseline.sha256).toBe('dd1e4f21d3bfe9ec79a1f2e36a6dc56ec9d71c168cc5e9db2f4cbe21143194e1');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(9470); expect(new Set(all.map(row => row.id)).size).toBe(9470);
    expect(families).toHaveLength(52); expect(families.reduce((n, family) => n + family.exercises.length, 0)).toBe(624);
    expect(new Set(families.flatMap(family => family.exercises.map(task => foundationQuestionId(family.atomId, task)))).size).toBe(624);
  });
  it('covers all 13 grade-two points with four structures and the oral profile', () => {
    expect(new Set(written.map(row => row.atomId)).size).toBe(12); expect(oral).toHaveLength(4);
    expect(written.every(row => row.exercises.length === 12)).toBe(true); expect(oral.every(row => row.exercises.length === 12)).toBe(true);
    expect(oral.map(row => row.dimension).sort()).toEqual(['procedure', 'procedure', 'transfer', 'transfer']);
    expect(oral.every(row => row.exercises.every(task => task.mode === 'audio_record' && task.rubric?.length === 3))).toBe(true);
    expect(buildAllAuthoredProbeFamilies().filter(row => [...new Set(families.map(family => family.atomId))].includes(row.atomId))).toEqual(families);
  });
  it('keeps temporal, causal, homophone and punctuation answers explicit rather than assumed', () => {
    const cause = written.find(row => row.family === 'cause-syntax-1')!; for (const task of cause.exercises) expect(task.blocks?.length).toBe(1);
    const homophone = written.find(row => row.family === 'homophone-repair')!; for (const task of homophone.exercises) expect(task.stem).toContain('词语意义');
    const time = written.find(row => row.family === 'time-update')!; for (const task of time.exercises) expect(task.blocks?.length).toBe(1);
    const punctuation = written.find(row => row.family === 'list-record-repair')!; for (const task of punctuation.exercises) expect(task.blocks?.length).toBe(1);
  });
  it('keeps two- and three-condition instruction rows aligned', () => {
    const task = written.find(row => row.family === 'instruction-table')!.exercises[0], row = task.blocks![0], rows = (row as any).rows as string[][];
    expect(rows).toHaveLength(3); expect(rows.every(values => values.length === 3)).toBe(true);
  });
  it('grades every objective standard and legal wrong value in its supported protocol', () => {
    for (const family of written) for (const task of family.exercises.filter(row => !['short_answer'].includes(row.mode!))) {
      const schema = schemaFor(family.atomId, task); expect(answerInputConfiguration(schema).supported).toBe(true);
      expect(gradeResponse(schema, task.answer, task.answer).score).toBe(1); let wrong: unknown;
      if (task.mode === 'single_choice') wrong = task.options!.find(value => value !== task.answer);
      else if (task.mode === 'multiple_choice') { const expected = task.answer as string[]; wrong = expected.length === task.options!.length ? expected.slice(1) : [task.options!.find(value => !expected.includes(value))]; }
      else if (task.mode === 'multi_blank') wrong = (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: 'QA未达标' }));
      else if (task.mode === 'matching') { const pairs = (task.answer as { pairs: Array<{ left: string; right: string }> }).pairs;
        wrong = { pairs: pairs.map((pair, i) => ({ ...pair, right: pairs[(i + 1) % pairs.length].right })) }; }
      else throw new Error(`Unexpected objective mode ${task.mode}`); expect(gradeResponse(schema, task.answer, wrong).score).toBe(0);
    }
  });
  it('enumerates all nonempty multiple-choice subsets and reverse order', () => {
    for (const family of written) for (const task of family.exercises.filter(row => row.mode === 'multiple_choice')) {
      const schema = schemaFor(family.atomId, task), expected = new Set(task.answer as string[]);
      for (let mask = 1; mask < 2 ** task.options!.length; mask++) { const answer = task.options!.filter((_, i) => mask & (1 << i));
        expect(gradeResponse(schema, task.answer, answer).score).toBe(answer.length === expected.size && answer.every(value => expected.has(value)) ? 1 : 0); }
      expect(gradeResponse(schema, task.answer, [...expected].reverse()).score).toBe(1);
    }
  });
  it('preserves each multi-blank partial score and every matching permutation error', () => {
    for (const family of written) for (const task of family.exercises.filter(row => row.mode === 'multi_blank')) {
      const schema = schemaFor(family.atomId, task), expected = task.answer as Array<{ key: string; value: string }>;
      for (let index = 0; index < expected.length; index++) expect(gradeResponse(schema, task.answer, expected.map((row, i) => ({ ...row, value: i === index ? 'QA未达标' : row.value }))).score)
        .toBeCloseTo((expected.length - 1) / expected.length);
    }
    for (const task of written.flatMap(row => row.exercises).filter(row => row.mode === 'matching')) { const schema = schemaFor('core:chinese:reduplication', task),
      pairs = (task.answer as { pairs: Array<{ left: string; right: string }> }).pairs; expect(gradeResponse(schema, task.answer, { pairs: [...pairs].reverse() }).score).toBe(1);
      expect(gradeResponse(schema, task.answer, { pairs: pairs.map((pair, i) => ({ ...pair, right: pairs[(i + 1) % pairs.length].right })) }).score).toBe(0); }
  });
  it('sends written and oral production to manual review with frozen rubrics', () => {
    for (const family of families) for (const task of family.exercises.filter(row => ['short_answer', 'audio_record'].includes(row.mode!))) {
      const schema = schemaFor(family.atomId, task); expect(task.rubric?.length).toBe(3); expect(task.rubric!.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(1);
      const input = task.mode === 'short_answer' ? { value: task.answer } : { questionId: schema.questionId, mode: 'audio_record',
        response: { mediaIds: [`student_media_${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}`], description: '' } };
      expect(gradeResponse(schema, task.answer, input)).toMatchObject({ score: null, status: 'pending_review' });
    }
  });
  it('has distinct reduplication forms and exactly one tested form per card', () => {
    const task = written.find(row => row.family === 'pattern-card-match')!.exercises[0], config = answerInputConfiguration(schemaFor('core:chinese:reduplication', task));
    expect(config.left).toHaveLength(2); expect(new Set(config.right.map(row => row.label)).size).toBe(2);
    expect(gradeResponse(schemaFor('core:chinese:reduplication', task), task.answer, task.answer).score).toBe(1);
  });
  it('builds one four-structure written sample and one four-audio sample within 600 seconds', () => {
    for (const atomId of new Set(families.map(row => row.atomId))) {
      const atom = buildFoundationCurriculum().find(row => row.atom.id === atomId)!.atom, candidates = families.filter(row => row.atomId === atomId).flatMap(row =>
        row.exercises.map((task, n): MeasurementItem => ({ id: `${row.family}:${n}`, atomId, family: row.family, dimension: row.dimension,
          questionId: foundationQuestionId(atomId, task), questionVersion: 1, expectedSeconds: task.expectedSeconds!, difficulty: 1, probeRole: 'anchor',
          mappingWeight: 1, observationCode: 'response_mismatch', reviewStatus: 'approved', version: 1 })));
      const coverage = knowledgeMaterialCoverage(atom, candidates); expect(coverage.ready).toBe(true); expect(coverage.sample.items).toBe(4);
      expect(coverage.sample.expectedSeconds).toBeLessThanOrEqual(600); expect(atom.grade).toBe(2);
    }
  });
});
