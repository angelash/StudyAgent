import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-9470-v1.json';
import { buildChineseGrade5ProbeFamilies } from './authored-chinese-grade5-probes';
import { buildChineseGrade6ProbeFamilies } from './authored-chinese-grade6-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { knowledgeMaterialCoverage } from './verification-materials';

const grade5 = buildChineseGrade5ProbeFamilies(), grade6 = buildChineseGrade6ProbeFamilies(), families = [...grade5, ...grade6];
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {},
  options: task.options?.map(value => ({ id: value, label: value, value })) });

describe('Chinese grade-five/six complete written and oral contrasts', () => {
  it('preserves 9470 historical objects and appends 1248 unique tasks in 104 groups', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const ids = new Set(baseline.ids), previous = all.filter(row => ids.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(9470); expect(baseline.sha256).toBe('c6885cde513c1722263d4fd0da3c8c7471035482d4c04782fa82791f214b61aa');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(10718); expect(new Set(all.map(row => row.id)).size).toBe(10718);
    expect(families).toHaveLength(104); expect(new Set(families.map(row => row.atomId)).size).toBe(26);
    expect(new Set(families.flatMap(row => row.exercises.map(task => foundationQuestionId(row.atomId, task)))).size).toBe(1248);
  });
  it('keeps four structures per point, two basic and two transfer, with 12 distinct scenarios', () => {
    for (const atomId of new Set(families.map(row => row.atomId))) {
      const group = families.filter(row => row.atomId === atomId); expect(group).toHaveLength(4);
      expect(group.map(row => row.dimension).sort()).toEqual(['core:chinese:oral-evidence', 'core:chinese:oral-alternative'].includes(atomId)
        ? ['procedure', 'procedure', 'transfer', 'transfer'] : ['procedure', 'transfer', 'transfer', 'understanding']);
      expect(group.every(row => row.exercises.length === 12 && row.distinction.length > 10)).toBe(true);
      expect(new Set(group.flatMap(row => row.exercises.map(task => task.stem))).size).toBe(48);
    }
  });
  it('uses actual materials for motivation, environmental links, information intersections and source scope', () => {
    for (const family of grade5.filter(row => ['action-purpose', 'environment-obstacle', 'two-constraints', 'current-official-source'].includes(row.family))) {
      expect(family.exercises.every(task => task.stem.length > 20 && task.analysis && task.answer)).toBe(true);
    }
    const combine = grade5.find(row => row.family === 'two-constraints')!.exercises[0];
    expect(combine.stem).toContain('同时满足'); expect(combine.options).toContain(combine.answer);
  });
  it('preserves necessary/sufficient direction and evidence boundaries', () => {
    const necessary = grade5.find(row => row.family === 'necessary-condition')!.exercises;
    expect(necessary.some(task => task.stem.includes('只有'))).toBe(true);
    expect(necessary.every(task => task.options!.includes(String(task.answer)))).toBe(true);
    const support = grade5.find(row => row.family === 'evidence-relevance')!.exercises;
    expect(support.every(task => String(task.answer).includes('仍需核对其他变量'))).toBe(true);
  });
  it('reconstructs rhetorical, double-negative and direct counterexample meanings', () => {
    const rhetorical = grade6.find(row => row.family === 'negative-rhetorical')!.exercises;
    for (const task of rhetorical) expect(task.options).toContain(task.answer);
    const double = grade6.find(row => row.family === 'universal-double-negative')!.exercises;
    expect(double.some(task => String(task.answer).includes('所有'))).toBe(true);
    const counter = grade6.find(row => row.family === 'universal-counterexample')!.exercises;
    for (const task of counter) expect(task.blocks ?? []).toHaveLength(0);
  });
  it('separates observed facts from explanations and retains narrative perspective limits', () => {
    for (const task of grade6.find(row => row.family === 'observation-explanation')!.exercises) expect(task.answer).toBe(task.stem.match(/记录写“([^”]+)”/)![1]);
    for (const task of grade6.find(row => row.family === 'perspective-boundary')!.exercises) expect(task.answer).toBe('不能，材料没有提供该信息');
  });
  it('allows one title to cover the material and rejects overgeneralized alternatives', () => {
    for (const task of grade6.find(row => row.family === 'event-title')!.exercises) {
      expect(task.options!.filter(option => option === task.answer)).toHaveLength(1);
      expect(task.analysis).toContain('过宽或添加未证明评价');
    }
  });
  it('sends written arguments and oral alternatives to separate frozen review paths', () => {
    for (const family of families) for (const task of family.exercises.filter(row => ['short_answer', 'audio_record'].includes(row.mode!))) {
      expect(task.rubric?.length).toBe(3); expect(task.rubric!.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(1);
      const schema = schemaFor(family.atomId, task); const input = task.mode === 'audio_record' ? { questionId: schema.questionId, mode: 'audio_record',
        response: { mediaIds: [`student_media_${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}`], description: '' } } : { value: task.answer };
      expect(gradeResponse(schema, task.answer, input)).toMatchObject({ score: null, status: 'pending_review' });
    }
    expect(grade5.find(row => row.atomId === 'core:chinese:oral-evidence')!.exercises.every(task => task.mode === 'audio_record')).toBe(true);
    expect(grade6.find(row => row.atomId === 'core:chinese:oral-alternative')!.exercises.every(task => task.mode === 'audio_record')).toBe(true);
  });
  it('checks every objective standard, legal wrong response and input configuration', () => {
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
      if (task.mode === 'multiple_choice') { const expected = new Set(task.answer as string[]); for (let mask = 1; mask < 2 ** task.options!.length; mask++) {
        const answer = task.options!.filter((_, i) => mask & (1 << i)); expect(gradeResponse(schema, task.answer, answer).score)
          .toBe(answer.length === expected.size && answer.every(value => expected.has(value)) ? 1 : 0); } }
      if (task.mode === 'multi_blank') { const expected = task.answer as Array<{ key: string; value: string }>; for (let index = 0; index < expected.length; index++)
        expect(gradeResponse(schema, task.answer, expected.map((row, i) => ({ ...row, value: i === index ? 'QA未达标' : row.value }))).score)
          .toBeCloseTo((expected.length - 1) / expected.length); }
    }
  });
  it('builds all 26 four-structure examples within 600 seconds', () => {
    for (const atomId of new Set(families.map(row => row.atomId))) {
      const atom = buildFoundationCurriculum().find(row => row.atom.id === atomId)!.atom, candidates = families.filter(row => row.atomId === atomId).flatMap(row =>
        row.exercises.map((task, n): MeasurementItem => ({ id: `${row.family}:${n}`, atomId, family: row.family, dimension: row.dimension,
          questionId: foundationQuestionId(atomId, task), questionVersion: 1, expectedSeconds: task.expectedSeconds!, difficulty: 1, probeRole: 'anchor',
          mappingWeight: 1, observationCode: 'response_mismatch', reviewStatus: 'approved', version: 1 })));
      const coverage = knowledgeMaterialCoverage(atom, candidates); expect(coverage.ready).toBe(true); expect(coverage.sample.items).toBe(4);
      expect(coverage.sample.expectedSeconds).toBeLessThanOrEqual(600); expect(atom.subject).toBe('chinese'); expect([5, 6]).toContain(atom.grade);
    }
  });
});
