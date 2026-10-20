import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-14174-v1.json';
import completedBaseline from '../../../../../resources/curriculum/authored-task-baseline-15758-v1.json';
import { buildMathGrade5Grade6ProbeFamilies } from './authored-math-grade5-grade6-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { knowledgeMaterialCoverage } from './verification-materials';

const families = buildMathGrade5Grade6ProbeFamilies();
const definitions = buildFoundationCurriculum();
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {}, options: task.options?.map(value => ({ id: value, label: value, value })) });
const expectedAtoms = new Set(['foundation:math:decimalplace', 'foundation:math:decimaladd', 'foundation:math:fractionequivalence',
  'foundation:math:fractionmultiply', 'foundation:math:percentage', 'foundation:math:ratio', 'core:math:decimalmultiply', 'core:math:decimaldivide',
  'core:math:fractionadd', 'core:math:fractionsubtract', 'core:math:equation', 'core:math:trianglearea', 'core:math:parallelogramarea',
  'core:math:trapezoidarea', 'core:math:cuboidvolume', 'core:math:cuboidsurface', 'core:math:volumeconvert', 'core:math:fractiondivide',
  'core:math:percentagerate', 'core:math:percentagewhole', 'core:math:ratioequivalent', 'core:math:proportion', 'core:math:diameter',
  'core:math:circumference', 'core:math:circlearea', 'core:math:cylindervolume', 'core:math:cylinderlateral', 'core:math:conevolume',
  'core:math:scale', 'core:math:speed', 'core:math:negativeorder', 'core:math:sectorcount', 'core:math:possibility']);

describe('Math grade-five/six complete written contrasts', () => {
  it('preserves all 14174 English-era tasks and appends 1584 unique tasks in 132 groups', () => {
    const all = definitions.flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const ids = new Set(baseline.ids), preserved = all.filter(row => ids.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(preserved).toHaveLength(14174); expect(createHash('sha256').update(JSON.stringify(preserved)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(15758); expect(new Set(all.map(row => row.id)).size).toBe(15758);
    const completed = [...all].sort((a, b) => a.id.localeCompare(b.id));
    expect(completedBaseline.count).toBe(15758); expect(completedBaseline.sha256).toBe('9d377ab639dbde67a2248246428bdf767bdd17e6eb36bebc3f403b269aabebcb');
    expect(createHash('sha256').update(JSON.stringify(completed)).digest('hex')).toBe(completedBaseline.sha256);
    expect(families).toHaveLength(132); expect(new Set(families.map(row => row.atomId)).size).toBe(33);
    expect(families.flatMap(row => row.exercises)).toHaveLength(1584);
    expect(new Set(families.flatMap(row => row.exercises.map(task => foundationQuestionId(row.atomId, task)))).size).toBe(1584);
  });

  it('covers the exact 33 remaining points with four structures and twelve distinct contexts', () => {
    expect(new Set(families.map(row => row.atomId))).toEqual(expectedAtoms);
    for (const atomId of expectedAtoms) {
      const group = families.filter(row => row.atomId === atomId); expect(group).toHaveLength(4);
      expect(group.map(row => row.dimension).sort()).toEqual(['procedure', 'transfer', 'transfer', 'understanding']);
      expect(group.every(row => row.exercises.length === 12 && row.structure.length > 5 && row.distinction.length > 10)).toBe(true);
      expect(new Set(group.flatMap(row => row.exercises.map(task => task.stem))).size).toBe(48);
      expect(group.flatMap(row => row.exercises).every(task => task.expectedSeconds && (task.analysis ?? '').trim().length > 3)).toBe(true);
    }
    const points = definitions.filter(row => expectedAtoms.has(row.atom.id)); expect(points).toHaveLength(33);
    expect(points.filter(row => row.atom.grade === 5)).toHaveLength(14); expect(points.filter(row => row.atom.grade === 6)).toHaveLength(19);
  });

  it('keeps every choice answer selectable with two distinct distractors', () => {
    for (const task of families.flatMap(row => row.exercises).filter(row => row.mode === 'single_choice')) {
      expect(task.options).toContain(task.answer); expect(task.options!.length).toBeGreaterThanOrEqual(3); expect(task.options!.length).toBeLessThanOrEqual(4);
      expect(new Set(task.options).size).toBe(task.options!.length);
    }
    expect(families.flatMap(row => row.exercises).filter(row => row.mode === 'single_choice')).toHaveLength(396);
    expect(families.flatMap(row => row.exercises).filter(row => row.mode === 'multi_blank')).toHaveLength(1188);
  });

  it('grounds area, percentage, circle and relationship examples in their stated quantities', () => {
    const task = (family: string) => families.find(row => row.family === family)!.exercises[0];
    expect(task('g5-triangle-area-procedure').answer).toEqual([{ key: 'product', value: '60' }, { key: 'area', value: '30' }]);
    expect(task('g5-parallelogram-area-procedure').answer).toEqual([{ key: 'base', value: '9' }, { key: 'height', value: '4' }, { key: 'area', value: '36' }]);
    expect(task('g6-percentage-part-procedure').answer).toEqual([{ key: 'rate', value: '0.1' }, { key: 'part', value: '10' }]);
    expect(task('g6-circle-area-procedure').answer).toEqual([{ key: 'square', value: '1' }, { key: 'area', value: '3.14' }]);
    expect(task('g6-ratio-equivalent-procedure').answer).toContainEqual({ key: 'simplified', value: '2:3' });
  });

  it('checks every objective standard and legal zero-score response in its protocol', () => {
    for (const family of families) for (const task of family.exercises) {
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

  it('assembles all 33 four-structure points within the 600-second budget', () => {
    for (const atomId of expectedAtoms) {
      const atom = definitions.find(row => row.atom.id === atomId)!.atom, candidates = families.filter(row => row.atomId === atomId).flatMap(row =>
        row.exercises.map((task, n): MeasurementItem => ({ id: `${row.family}:${n}`, atomId, family: row.family, dimension: row.dimension,
          questionId: foundationQuestionId(atomId, task), questionVersion: 1, expectedSeconds: task.expectedSeconds!, difficulty: 1, probeRole: 'anchor',
          mappingWeight: 1, observationCode: 'response_mismatch', reviewStatus: 'approved', version: 1 })));
      const coverage = knowledgeMaterialCoverage(atom, candidates); expect(coverage.ready).toBe(true); expect(coverage.sample.items).toBe(4);
      expect(coverage.sample.expectedSeconds).toBeLessThanOrEqual(600); expect(atom.subject).toBe('math'); expect([5, 6]).toContain(atom.grade);
    }
  });
});
