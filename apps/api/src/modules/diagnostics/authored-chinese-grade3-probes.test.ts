import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-8222-v1.json';
import { buildChineseGrade3ProbeFamilies } from './authored-chinese-grade3-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { knowledgeMaterialCoverage } from './verification-materials';

const families = buildChineseGrade3ProbeFamilies();
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {},
  options: task.options?.map(value => ({ id: value, label: value, value })) });

describe('Chinese grade-three complete written and oral contrasts', () => {
  it('preserves 8222 historical tasks and appends 624 unique tasks in 52 groups', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const ids = new Set(baseline.ids), previous = all.filter(row => ids.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(8222); expect(baseline.sha256).toBe('18042b1c7d5c641a953917a25a3c76ebf163f97f0e341adecff3b33fbc39ea03');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(15758); expect(new Set(all.map(row => row.id)).size).toBe(15758);
    expect(families).toHaveLength(52); expect(new Set(families.map(row => row.atomId)).size).toBe(13);
    expect(new Set(families.flatMap(row => row.exercises.map(task => foundationQuestionId(row.atomId, task)))).size).toBe(624);
  });
  it('gives every point two basic and two transfer structures with twelve distinct scenarios', () => {
    for (const atomId of new Set(families.map(row => row.atomId))) {
      const group = families.filter(row => row.atomId === atomId); expect(group).toHaveLength(4);
      expect(group.map(row => row.dimension).sort()).toEqual(atomId === 'core:chinese:oral-retell'
        ? ['procedure', 'procedure', 'transfer', 'transfer'] : ['procedure', 'transfer', 'transfer', 'understanding']);
      expect(group.every(row => row.exercises.length === 12 && row.distinction.length > 10)).toBe(true);
      expect(new Set(group.flatMap(row => row.exercises.map(task => task.stem))).size).toBe(48);
    }
  });
  it('keeps written production and oral retelling as separate manual evidence', () => {
    const written = families.find(row => row.family === 'personal-production')!, oral = families.filter(row => row.atomId === 'core:chinese:oral-retell');
    expect(written.exercises.every(task => task.mode === 'short_answer' && task.rubric?.length === 3)).toBe(true);
    expect(oral.every(row => row.exercises.every(task => task.mode === 'audio_record' && task.responseShape?.mediaPolicy === 'student-media-v1'))).toBe(true);
    for (const task of [...written.exercises, ...oral.flatMap(row => row.exercises)]) {
      const schema = schemaFor(task.mode === 'audio_record' ? 'core:chinese:oral-retell' : 'core:chinese:paragraph-summary', task);
      const input = task.mode === 'audio_record' ? { questionId: schema.questionId, mode: 'audio_record', response: { mediaIds: [`student_media_${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}`], description: '' } } : { value: task.answer };
      expect(gradeResponse(schema, task.answer, input)).toMatchObject({ score: null, status: 'pending_review' });
    }
  });
  it('checks actual standards, legal zero values and all supported protocols', () => {
    for (const family of families) for (const task of family.exercises.filter(row => !['short_answer', 'audio_record'].includes(row.mode!))) {
      const schema = schemaFor(family.atomId, task); expect(answerInputConfiguration(schema).supported).toBe(true); expect(gradeResponse(schema, task.answer, task.answer).score).toBe(1);
      let wrong: unknown; if (task.mode === 'single_choice') wrong = task.options!.find(value => value !== task.answer);
      else if (task.mode === 'multiple_choice') { const expected = task.answer as string[]; wrong = expected.length === task.options!.length ? expected.slice(1) : [task.options!.find(value => !expected.includes(value))]; }
      else if (task.mode === 'multi_blank') wrong = (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: 'QA未达标' }));
      else throw new Error(`Unexpected mode ${task.mode}`); expect(gradeResponse(schema, task.answer, wrong).score).toBe(0);
    }
  });
  it('enumerates every multiple-choice subset and every multi-blank partial score', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task);
      if (task.mode === 'multiple_choice') { const expected = new Set(task.answer as string[]);
        for (let mask = 1; mask < 2 ** task.options!.length; mask++) { const answer = task.options!.filter((_, i) => mask & (1 << i));
          expect(gradeResponse(schema, task.answer, answer).score).toBe(answer.length === expected.size && answer.every(value => expected.has(value)) ? 1 : 0); }
      }
      if (task.mode === 'multi_blank') { const expected = task.answer as Array<{ key: string; value: string }>;
        for (let index = 0; index < expected.length; index++) expect(gradeResponse(schema, task.answer,
          expected.map((row, i) => ({ ...row, value: i === index ? 'QA未达标' : row.value }))).score).toBeCloseTo((expected.length - 1) / expected.length); }
    }
  });
  it('assembles all thirteen points within the four-item, 600-second material budget', () => {
    for (const atomId of new Set(families.map(row => row.atomId))) {
      const atom = buildFoundationCurriculum().find(row => row.atom.id === atomId)!.atom, candidates = families.filter(row => row.atomId === atomId).flatMap(row =>
        row.exercises.map((task, n): MeasurementItem => ({ id: `${row.family}:${n}`, atomId, family: row.family, dimension: row.dimension,
          questionId: foundationQuestionId(atomId, task), questionVersion: 1, expectedSeconds: task.expectedSeconds!, difficulty: 1, probeRole: 'anchor',
          mappingWeight: 1, observationCode: 'response_mismatch', reviewStatus: 'approved', version: 1 })));
      const coverage = knowledgeMaterialCoverage(atom, candidates); expect(coverage.ready).toBe(true); expect(coverage.sample.items).toBe(4);
      expect(coverage.sample.expectedSeconds).toBeLessThanOrEqual(600); expect(atom.subject).toBe('chinese'); expect(atom.grade).toBe(3);
    }
  });
});
