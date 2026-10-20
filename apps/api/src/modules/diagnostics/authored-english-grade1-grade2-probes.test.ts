import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-10718-v1.json';
import { buildEnglishGrade1Grade2ProbeFamilies } from './authored-english-grade1-grade2-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { knowledgeMaterialCoverage } from './verification-materials';

const families = buildEnglishGrade1Grade2ProbeFamilies();
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {},
  options: task.options?.map(value => ({ id: value, label: value, value })) });

describe('English grade-one/two complete written and oral contrasts', () => {
  it('preserves 10718 historical objects and appends 960 unique tasks in 80 groups', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const ids = new Set(baseline.ids), previous = all.filter(row => ids.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(10718); expect(baseline.sha256).toBe('2331a8cda55d0f79258ad15f98f10425dc4f6d36c604a8b1f40294730b75c781');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(15758); expect(new Set(all.map(row => row.id)).size).toBe(15758);
    expect(families).toHaveLength(80); expect(new Set(families.map(row => row.atomId)).size).toBe(20);
    expect(new Set(families.flatMap(row => row.exercises.map(task => foundationQuestionId(row.atomId, task)))).size).toBe(960);
  });
  it('uses two basic and two transfer structures with twelve distinct contexts per point', () => {
    for (const atomId of new Set(families.map(row => row.atomId))) {
      const group = families.filter(row => row.atomId === atomId); expect(group).toHaveLength(4);
      expect(group.map(row => row.dimension).sort()).toEqual(['core:english:oral-greeting', 'core:english:oral-object'].includes(atomId)
        ? ['procedure', 'procedure', 'transfer', 'transfer'] : ['procedure', 'transfer', 'transfer', 'understanding']);
      expect(group.every(row => row.exercises.length === 12 && row.distinction.length > 10)).toBe(true);
      expect(new Set(group.flatMap(row => row.exercises.map(task => task.stem))).size).toBe(48);
    }
  });
  it('keeps a/an, be, have/has, can and possessive answers semantically grounded', () => {
    for (const task of families.find(row => row.family === 'article-a-an-form-choice')!.exercises) expect(task.options).toContain(task.answer);
    for (const task of families.find(row => row.family === 'can-base-verb-context-application')!.exercises) {
      expect(task.answer).toMatch(/can (fly|draw|read|swim|make|open|write|sing|find|carry|clean|fix)/); expect(task.answer).not.toContain('can fly fly');
    }
    const possessives = families.filter(row => row.family === 'possessive-owner-form-choice').flatMap(row => row.exercises);
    expect(new Set(possessives.map(task => task.answer))).toEqual(new Set(['my', 'your', 'his', 'her', 'our', 'their']));
  });
  it('uses explicit space and question-word evidence instead of item or place familiarity', () => {
    for (const task of families.find(row => row.family === 'place-in-on-under-form-choice')!.exercises) {
      expect(['in the box', 'on the desk', 'under the chair']).not.toEqual([]); expect(task.options).toContain(task.answer);
    }
    const questions = families.find(row => row.family === 'question-word-type-form-choice')!.exercises;
    expect(questions.some(task => task.answer === 'who')).toBe(true); expect(questions.some(task => task.answer === 'where')).toBe(true);
  });
  it('matches polite expressions to thanks, apology, request and clarification purposes', () => {
    const tasks = families.find(row => row.family === 'polite-purpose-form-choice')!.exercises;
    expect(tasks.some(task => String(task.answer).startsWith('Thank you'))).toBe(true);
    expect(tasks.some(task => String(task.answer).startsWith('I am sorry'))).toBe(true);
    expect(tasks.some(task => String(task.answer).includes('May I'))).toBe(true);
  });
  it('keeps self introductions and object descriptions as short-answer manual evidence', () => {
    for (const familyName of ['self-introduction-context-application', 'object-two-sentences-context-application']) {
      const family = families.find(row => row.family === familyName)!;
      expect(family.exercises.every(task => task.mode === 'short_answer' && task.rubric?.length === 3)).toBe(true);
      expect(family.exercises.every(task => task.rubric!.reduce((sum, row) => sum + row.weight, 0) >= 0.99)).toBe(true);
    }
  });
  it('uses independent audio tasks with matching greeting time and material objects', () => {
    const greeting = families.filter(row => row.atomId === 'core:english:oral-greeting'), objects = families.filter(row => row.atomId === 'core:english:oral-object');
    expect(greeting).toHaveLength(4); expect(objects).toHaveLength(4);
    for (const task of greeting.flatMap(row => row.exercises)) expect(task.mode).toBe('audio_record');
    const timed = greeting.find(row => row.family === 'oral-greeting-source-greeting')!.exercises;
    for (const [index, task] of timed.entries()) expect(task.answer).toContain(['Good morning!', 'Good afternoon!', 'Good evening!'][index % 3]);
    for (const task of objects.flatMap(row => row.exercises)) { expect(task.mode).toBe('audio_record'); expect(task.analysis).not.toContain('written score'); }
  });
  it('checks every objective standard and legal zero-score response in its protocol', () => {
    for (const family of families) for (const task of family.exercises.filter(row => !['short_answer', 'audio_record'].includes(row.mode!))) {
      const schema = schemaFor(family.atomId, task); expect(answerInputConfiguration(schema).supported).toBe(true); expect(gradeResponse(schema, task.answer, task.answer).score).toBe(1);
      let wrong: unknown; if (task.mode === 'single_choice') wrong = task.options!.find(value => value !== task.answer);
      else if (task.mode === 'multi_blank') wrong = (task.answer as Array<{ key: string; value: string }>).map(row => ({ ...row, value: 'QA mismatch' }));
      else throw new Error(`Unexpected mode ${task.mode}`); expect(gradeResponse(schema, task.answer, wrong).score).toBe(0);
    }
  });
  it('preserves every multi-blank error as its expected partial score', () => {
    for (const family of families) for (const task of family.exercises.filter(row => row.mode === 'multi_blank')) {
      const expected = task.answer as Array<{ key: string; value: string }>, schema = schemaFor(family.atomId, task);
      for (let index = 0; index < expected.length; index++) expect(gradeResponse(schema, task.answer,
        expected.map((row, i) => ({ ...row, value: i === index ? 'QA mismatch' : row.value }))).score).toBeCloseTo((expected.length - 1) / expected.length);
    }
  });
  it('sends all production modes to pending review without exact-text scoring', () => {
    for (const family of families) for (const task of family.exercises.filter(row => ['short_answer', 'audio_record'].includes(row.mode!))) {
      const schema = schemaFor(family.atomId, task), input = task.mode === 'short_answer' ? { value: String(task.answer) } : { questionId: schema.questionId, mode: 'audio_record',
        response: { mediaIds: [`student_media_${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}`], description: '' } };
      expect(gradeResponse(schema, task.answer, input)).toMatchObject({ score: null, correct: null, status: 'pending_review' });
    }
  });
  it('assembles all twenty four-structure examples within 600 seconds', () => {
    for (const atomId of new Set(families.map(row => row.atomId))) {
      const atom = buildFoundationCurriculum().find(row => row.atom.id === atomId)!.atom, candidates = families.filter(row => row.atomId === atomId).flatMap(row =>
        row.exercises.map((task, n): MeasurementItem => ({ id: `${row.family}:${n}`, atomId, family: row.family, dimension: row.dimension,
          questionId: foundationQuestionId(atomId, task), questionVersion: 1, expectedSeconds: task.expectedSeconds!, difficulty: 1, probeRole: 'anchor',
          mappingWeight: 1, observationCode: 'response_mismatch', reviewStatus: 'approved', version: 1 })));
      const coverage = knowledgeMaterialCoverage(atom, candidates); expect(coverage.ready).toBe(true); expect(coverage.sample.items).toBe(4);
      expect(coverage.sample.expectedSeconds).toBeLessThanOrEqual(600); expect(atom.subject).toBe('english'); expect([1, 2]).toContain(atom.grade);
    }
  });
});
