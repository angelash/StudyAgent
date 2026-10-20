import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { answerInputConfiguration } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-7550-v1.json';
import { buildChineseOralGrade1ProbeFamilies } from './authored-chinese-oral-grade1-probes';
import { buildAllAuthoredProbeFamilies } from './authored-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { knowledgeMaterialCoverage, materialStructureCoverage } from './verification-materials';

const families = buildChineseOralGrade1ProbeFamilies(), tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const rows = (task: Exercise) => task.blocks!.find(block => block.type === 'table')!.rows!;
const schemaFor = (task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId('core:chinese:oral-complete', task), mode: task.mode!,
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: task.gradingConfig ?? {} });

describe('Chinese grade-one oral production contrasts and modality profile', () => {
  it('preserves all 7550 historical objects and IDs and appends 48 unique audio tasks in four groups', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const previousIds = new Set(baseline.ids), previous = all.filter(row => previousIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(previous).toHaveLength(7550); expect(baseline.sha256).toBe('447f39ae3b8669de31eff44e500d41114f311646ed59a6f6c7ce75f8123bd37f');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    expect(all).toHaveLength(7598); expect(new Set(all.map(row => row.id)).size).toBe(7598);
    expect(families).toHaveLength(4); expect(new Set(families.map(row => row.atomId))).toEqual(new Set(['core:chinese:oral-complete']));
    expect(new Set(families.flatMap(row => row.exercises.map(task => foundationQuestionId(row.atomId, task)))).size).toBe(48);
  });
  it('uses only actual audio production with two procedure and two transfer families', () => {
    expect(families.map(row => [row.family, row.dimension])).toEqual([
      ['oral-source-clear', 'procedure'], ['oral-personal-cards', 'procedure'],
      ['oral-repair-expression', 'transfer'], ['oral-current-update', 'transfer']]);
    for (const family of families) {
      expect(family.exercises).toHaveLength(12); expect(family.exercises.every(task => task.mode === 'audio_record')).toBe(true);
      expect(family.exercises.every(task => task.responseShape?.mediaPolicy === 'student-media-v1')).toBe(true);
      expect(family.exercises.every(task => task.expectedSeconds && task.expectedSeconds <= 120)).toBe(true);
    }
    expect(buildAllAuthoredProbeFamilies().filter(row => row.atomId === 'core:chinese:oral-complete')).toEqual(families);
  });
  it('gives every task a frozen three-criterion rubric with total weight one', () => {
    for (const family of families) for (const task of family.exercises) {
      expect(task.rubric).toHaveLength(3); expect(task.rubric!.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(1);
      expect(task.rubric![0].weight).toBeGreaterThan(task.rubric![1].weight);
      expect(task.rubric!.at(-1)!.criterion).toContain('不因口音差异扣分');
      expect(task.analysis).toContain('口');
    }
  });
  it('keeps every response pending manual rubric review instead of exact-text scoring', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(task); expect(answerInputConfiguration(schema).supported).toBe(true);
      expect(gradeResponse(schema, task.answer, { questionId: schema.questionId, mode: 'audio_record',
        response: { mediaIds: [`student_media_${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}`], description: '' } }))
        .toMatchObject({ score: null, correct: null, status: 'pending_review' });
    }
  });
  it('derives the source scenario description from the actual spoken record', () => {
    for (const task of tasks('oral-source-clear')) {
      const match = task.stem.match(/“(.+?)在(.+?)(整理图书|给花浇水|擦黑板|摆正椅子|洗水果|擦花盆|收画笔|贴标签|读故事|找地图|系鞋带|叠毛巾)。”/)!;
      expect(task.answer).toBe(`${match[1]}在${match[2]}${match[3]}。`); expect(task.stem).toContain('人物、地点和动作');
    }
  });
  it('uses all three visible information cards in the personal expression family', () => {
    for (const task of tasks('oral-personal-cards')) {
      const record = Object.fromEntries(rows(task)), expected = `${record['人物']}在${record['地点']}${record['动作']}。`;
      expect(task.answer).toBe(expected); expect(task.stem).toContain('自己的自然说法'); expect(rows(task)).toHaveLength(3);
    }
  });
  it('requires every stated condition when repairing an incomplete outline', () => {
    const fragments = new Set<string>();
    for (const task of tasks('oral-repair-expression')) {
      const fragment = task.stem.match(/只写了“([^”]+)”/)![1], conditions = rows(task)[0][1].split('；');
      fragments.add(fragment.includes('和') ? 'combined' : fragment.startsWith('在') ? 'missing-actor' : 'action-only');
      expect(conditions).toHaveLength(3); for (const condition of conditions) expect(task.answer).toContain(condition);
      expect(task.stem).toContain('不要只重复提纲');
    }
    expect(fragments.size).toBe(3);
  });
  it('uses only the latest event in the updated-scene family and always changes old content', () => {
    for (const task of tasks('oral-current-update')) {
      const records = rows(task), latest = records[1][1]; expect(records[0][1]).not.toBe(latest);
      expect(task.answer).toBe(`${latest}。`); expect(task.stem).toContain('按最新事件'); expect(task.stem).toContain('不要保留旧内容');
    }
    expect(new Set(tasks('oral-current-update').map(task => JSON.stringify(task.blocks))).size).toBe(12);
  });
  it('distinguishes the oral production profile from the written-contrast requirements', () => {
    const structures = families.map(row => ({ atomId: row.atomId, family: row.family, dimension: row.dimension }));
    expect(materialStructureCoverage('core:chinese:oral-complete', structures, 'oral-production-v1')).toMatchObject({
      understandingFamilies: 0, procedureFamilies: 2, basicFamilies: 2, transferFamilies: 2, contrastFamilies: 4, ready: true, gaps: [] });
    expect(materialStructureCoverage('core:chinese:oral-complete', structures, 'written-contrast-v1').gaps).toContain('understanding_family_missing');
  });
  it('creates an unexposed four-audio sample within the 600-second material budget', () => {
    const atom = buildFoundationCurriculum().find(row => row.atom.id === 'core:chinese:oral-complete')!.atom;
    const candidates = families.flatMap(family => family.exercises.map((task, n): MeasurementItem => ({ id: `${family.family}:${n}`, atomId: atom.id,
      family: family.family, dimension: family.dimension, questionId: foundationQuestionId(atom.id, task), questionVersion: 1,
      expectedSeconds: task.expectedSeconds!, difficulty: 1, probeRole: 'anchor', mappingWeight: 1, observationCode: 'response_mismatch',
      reviewStatus: 'approved', version: 1 })));
    const coverage = knowledgeMaterialCoverage(atom, candidates);
    expect(coverage.ready).toBe(true); expect(coverage.structure.understandingFamilies).toBe(0); expect(coverage.structure.procedureFamilies).toBe(2);
    expect(coverage.sample).toMatchObject({ ready: true, items: 4, expectedSeconds: 450 });
    expect(coverage.sample.groups.map(row => [row.requiredFamilies, row.selectedFamilies])).toEqual([[2, 2], [2, 2]]);
  });
  it('contains no printable answer protocol, written understanding task or fake pronunciation metric', () => {
    for (const family of families) for (const task of family.exercises) {
      expect(task.dimension).not.toBe('understanding'); expect(task.options).toBeUndefined(); expect(task.gradingConfig).toBeUndefined();
      expect(task.rubric!.map(row => row.criterion).join(' ')).not.toMatch(/音素|声调准确|口型|语速标准/);
    }
  });
});
