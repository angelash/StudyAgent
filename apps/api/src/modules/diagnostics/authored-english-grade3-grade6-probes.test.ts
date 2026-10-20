import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-10718-v1.json';
import completedBaseline from '../../../../../resources/curriculum/authored-task-baseline-14174-v1.json';
import { buildEnglishGrade3Grade6ProbeFamilies } from './authored-english-grade3-grade6-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { knowledgeMaterialCoverage } from './verification-materials';

const families = buildEnglishGrade3Grade6ProbeFamilies();
const englishAtoms = buildFoundationCurriculum().filter(row => row.atom.subject === 'english');
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {},
  options: task.options?.map(value => ({ id: value, label: value, value })) });

describe('English grade-three through grade-six complete written and oral contrasts', () => {
  it('preserves 10718 historical objects and appends 2496 unique tasks in 208 groups', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const ids = new Set(baseline.ids), previous = all.filter(row => ids.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(10718); expect(baseline.sha256).toBe('2331a8cda55d0f79258ad15f98f10425dc4f6d36c604a8b1f40294730b75c781');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(15758); expect(new Set(all.map(row => row.id)).size).toBe(15758);
    const completedIds = new Set(completedBaseline.ids), completed = all.filter(row => completedIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(completedBaseline.count).toBe(14174); expect(completedBaseline.sha256).toBe('19b761ca36f634b9d79ccd98c1162a889c6fdfebe64a13c033759948274bb2b7');
    expect(createHash('sha256').update(JSON.stringify(completed)).digest('hex')).toBe(completedBaseline.sha256);
    expect(families).toHaveLength(208); expect(new Set(families.map(row => row.atomId)).size).toBe(52);
    expect(families.reduce((sum, row) => sum + row.exercises.length, 0)).toBe(2496);
    expect(new Set(families.flatMap(row => row.exercises.map(task => foundationQuestionId(row.atomId, task)))).size).toBe(2496);
  });

  it('covers every remaining grade-three through grade-six point with four structures and twelve distinct contexts', () => {
    const covered = new Set(families.map(row => row.atomId)), expected = englishAtoms.filter(row => !row.atom.id.startsWith('foundation:english:g1-') &&
      !row.atom.id.startsWith('foundation:english:g2-') && !['core:english:lettercase', 'core:english:alphabet', 'core:english:greeting', 'core:english:iam',
        'core:english:color', 'core:english:numberword', 'core:english:simpleplural', 'core:english:he-she', 'core:english:this', 'core:english:introduce-self',
        'core:english:article', 'core:english:be', 'core:english:demonstrative', 'core:english:have-has', 'core:english:possessive', 'core:english:can',
        'core:english:placeword', 'core:english:questionword', 'core:english:polite', 'core:english:object-description', 'core:english:oral-greeting',
        'core:english:oral-object'].includes(row.atom.id));
    expect(covered).toEqual(new Set(expected.map(row => row.atom.id))); expect(covered.size).toBe(52);
    for (const atomId of covered) {
      const group = families.filter(row => row.atomId === atomId), oral = atomId.startsWith('core:english:oral-');
      expect(group).toHaveLength(4); expect(group.map(row => row.dimension).sort()).toEqual(oral
        ? ['procedure', 'procedure', 'transfer', 'transfer'] : ['procedure', 'transfer', 'transfer', 'understanding']);
      expect(group.every(row => row.exercises.length === 12 && row.distinction.length > 10 && row.structure.length > 5)).toBe(true);
      expect(new Set(group.flatMap(row => row.exercises.map(task => task.stem))).size).toBe(48);
    }
  });

  it('keeps every objective answer selectable and gives each rule task two distinct distractors', () => {
    for (const task of families.flatMap(row => row.exercises).filter(row => row.mode === 'single_choice')) {
      expect(task.options).toContain(task.answer); expect(new Set(task.options).size).toBeGreaterThanOrEqual(3); expect(task.options).toHaveLength(3);
    }
    for (const task of families.flatMap(row => row.exercises)) {
      expect(task.stem.trim().length).toBeGreaterThan(20); expect((task.analysis ?? '').trim().length).toBeGreaterThan(15); expect(task.expectedSeconds).toBeGreaterThanOrEqual(55);
      if (task.mode === 'multi_blank') expect((task.answer as Array<{ key: string; value: string }>).every(row => row.key && row.value)).toBe(true);
    }
  });

  it('grounds the high-risk English rules in the current material', () => {
    const family = (name: string) => families.find(row => row.family === name)!.exercises;
    expect(family('past-account-context-transfer').every(task => task.mode === 'short_answer' && String(task.answer).startsWith('Yesterday ') &&
      /then (finished|helped|read|opened)/.test(String(task.answer)))).toBe(true);
    expect(family('daily-routine-context-transfer').every(task => /(?:reads|walks|has|feeds)/.test(String(task.answer)))).toBe(true);
    expect(family('two-source-reading-rule-choice').every(task => String(task.answer).includes(';'))).toBe(true);
    expect(new Set(family('tense-discrimination-rule-choice').map(task => task.answer))).toEqual(new Set(['visited', 'is visiting', 'will visit']));
    expect(new Set(family('conditional-rule-choice').map(task => task.answer)).size).toBe(4);
    expect(family('evidence-vs-claim-rule-choice').every(task => !String(task.answer).includes('best'))).toBe(true);
    expect(family('object-pronoun-rule-choice').map(task => task.answer)).toContain('me');
    expect(family('object-pronoun-rule-choice').map(task => task.answer)).toContain('them');
  });

  it('uses independent audio tasks with matching scenes and latest-information repair', () => {
    const oral = families.filter(row => row.atomId.startsWith('core:english:oral-'));
    expect(new Set(oral.map(row => row.atomId)).size).toBe(4); expect(oral).toHaveLength(16);
    expect(oral.flatMap(row => row.exercises).every(task => task.mode === 'audio_record' && task.rubric?.length === 3 &&
      task.responseShape?.mediaPolicy === 'student-media-v1')).toBe(true);
    for (const atomId of new Set(oral.map(row => row.atomId))) {
      const updated = oral.find(row => row.atomId === atomId && row.family.endsWith('-updated'))!.exercises;
      expect(updated.every(task => task.stem.includes('latest'))).toBe(true);
      expect(new Set(updated.map(task => task.stem)).size).toBe(12);
    }
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

  it('sends every written and spoken production to pending review without exact-text scoring', () => {
    const production = families.flatMap(row => row.exercises.filter(task => ['short_answer', 'audio_record'].includes(task.mode!)));
    expect(production).toHaveLength(240);
    for (const family of families) for (const task of family.exercises.filter(row => ['short_answer', 'audio_record'].includes(row.mode!))) {
      const schema = schemaFor(family.atomId, task), input = task.mode === 'short_answer' ? { value: String(task.answer) } : { questionId: schema.questionId, mode: 'audio_record',
        response: { mediaIds: [`student_media_${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}`], description: '' } };
      expect(gradeResponse(schema, task.answer, input)).toMatchObject({ score: null, correct: null, status: 'pending_review' });
    }
  });

  it('assembles every four-structure point within the 600-second assessment budget', () => {
    for (const atomId of new Set(families.map(row => row.atomId))) {
      const atom = buildFoundationCurriculum().find(row => row.atom.id === atomId)!.atom, candidates = families.filter(row => row.atomId === atomId).flatMap(row =>
        row.exercises.map((task, n): MeasurementItem => ({ id: `${row.family}:${n}`, atomId, family: row.family, dimension: row.dimension,
          questionId: foundationQuestionId(atomId, task), questionVersion: 1, expectedSeconds: task.expectedSeconds!, difficulty: 1, probeRole: 'anchor',
          mappingWeight: 1, observationCode: 'response_mismatch', reviewStatus: 'approved', version: 1 })));
      const coverage = knowledgeMaterialCoverage(atom, candidates); expect(coverage.ready).toBe(true); expect(coverage.sample.items).toBe(4);
      expect(coverage.sample.expectedSeconds).toBeLessThanOrEqual(600); expect([3, 4, 5, 6]).toContain(atom.grade);
    }
  });
});
