import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, questionAnswerSchemaSchema, type QuestionAnswerSchema } from '@study-agent/contracts';
import { buildFirstSourceRetentionFamilies } from './source-chinese-first-probes';
import { buildChineseGrade3ProbeFamilies } from './authored-chinese-grade3-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { canonicalFamily } from './family-identity';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';
import { DIAGNOSIS_VERSION } from './diagnosis';
import type { MeasurementItem } from '@study-agent/contracts';

const families = buildFirstSourceRetentionFamilies();
const schema = (task: Exercise): QuestionAnswerSchema => questionAnswerSchemaSchema.parse({ questionId: 'original-editorial-candidate',
  mode: task.mode, responseShape: task.responseShape ?? { value: 'string' }, validationRules: { required: true }, gradingConfig: {},
  ...(task.options ? { options: task.options.map((value, index) => ({ id: 'o' + index, value, content: value, label: String.fromCharCode(65 + index) })) } : {}) });
const mapping = (atomId: string, task: Exercise, index: number): MeasurementItem => ({ id: 'new-' + index,
  questionId: foundationQuestionId(atomId, task), atomId, family: `${atomId}:${task.family}`, dimension: task.dimension,
  version: 1, questionVersion: 1, probeRole: 'anchor', expectedSeconds: task.expectedSeconds!, difficulty: 1,
  mappingWeight: 1, reviewStatus: 'approved', observationCode: 'editorial-test-only' });

describe('first accurate-source lesson: original delayed editorial materials', () => {
  it('preserves existing tasks and identities; four variants remain one structure', () => {
    const before = buildChineseGrade3ProbeFamilies(), originals = new Set(before.flatMap(f => f.exercises.map(t => foundationQuestionId(f.atomId, t))));
    const proposals = buildFirstSourceRetentionFamilies();
    expect(buildChineseGrade3ProbeFamilies()).toEqual(before);
    expect(proposals).toHaveLength(6);
    const questions = proposals.flatMap(f => f.exercises.map(t => foundationQuestionId(f.atomId, t)));
    expect(new Set(questions).size).toBe(24);
    expect(questions.every(id => !originals.has(id))).toBe(true);
    for (const atomId of new Set(proposals.map(f => f.atomId))) {
      const local = proposals.filter(f => f.atomId === atomId);
      expect(local.every(f => f.exercises.length === 4 && f.structure.length > 20 && f.distinction.length > 35)).toBe(true);
      expect(new Set(local.flatMap(f => f.exercises.map(t => canonicalFamily({ atomId, family: `${atomId}:${t.family}` })))).size).toBe(2);
    }
  });

  it('checks all actual answer protocols against both correct and incorrect responses', () => {
    for (const family of families) for (const task of family.exercises) {
      const input = schema(task);
      expect(answerInputConfiguration(input).supported, task.stem).toBe(true);
      expect(gradeResponse(input, task.answer, task.answer), task.stem).toMatchObject({ status: 'scored', score: 1, correct: true });
      const wrong = task.mode === 'single_choice' ? task.options!.find(option => option !== task.answer) :
        (task.answer as Array<{ key: string; value: string }>).map((entry, index) => index ? entry : { ...entry, value: '不相容的解释' });
      const result = gradeResponse(input, task.answer, wrong);
      expect(result.status).toBe('scored'); expect(result.correct, task.stem).toBe(false); expect(result.score).toBeLessThan(1);
      if (task.mode === 'single_choice') expect(new Set(task.options).size).toBe(4);
    }
  });

  it('fills four different stock slots under the original selector and exposes exhaustion after one family is seen', () => {
    const definitions = buildFoundationCurriculum();
    for (const atomId of new Set(families.map(f => f.atomId))) {
      const atom = definitions.find(row => row.atom.id === atomId)!.atom;
      const basics = buildChineseGrade3ProbeFamilies().filter(f => f.atomId === atomId && ['understanding', 'procedure'].includes(f.dimension));
      const stock = [...basics, ...families.filter(f => f.atomId === atomId)].flatMap(f => f.exercises).map((task, index) => mapping(atomId, task, index));
      const spec = verificationBlueprint({ id: 'stock-' + atomId, title: '真实规则材料库存', cause: 'retention_gap', ruleVersion: DIAGNOSIS_VERSION }, atom, 'editorial-stock');
      const seen = new Set<string>();
      for (const day of [1, 3, 7, 14]) {
        const selected = selectVerificationItems(spec, stock.filter(row => !seen.has(row.questionId)), new Set([atomId]), `original-stock-${day}`, 4, 600);
        expect(selected.verification.fullyCovered, atomId + ':' + day).toBe(true);
        expect(selected.selected).toHaveLength(4);
        selected.selected.forEach(row => { expect(seen.has(row.questionId)).toBe(false); seen.add(row.questionId); });
      }
      const exhausted = selectVerificationItems(spec, stock.filter(row => !seen.has(row.questionId)), new Set([atomId]), 'exhausted', 4, 600);
      expect(exhausted.verification.fullyCovered).toBe(false);
      const withheld = families.find(f => f.atomId === atomId)!.family;
      const exposed = selectVerificationItems(spec, stock.filter(row => row.family !== `${atomId}:${withheld}`), new Set([atomId]), 'seen-family', 4, 600);
      expect(exposed.verification.fullyCovered).toBe(false);
      expect(exposed.verification.groups.find(group => group.dimensions.includes('retention'))?.availableFamilies).toBe(1);
    }
  });

  it('cannot replace basic observations by relabelling the same structure as retention', () => {
    const atom = buildFoundationCurriculum().find(row => row.atom.id === families[0].atomId)!.atom;
    const task = families[0].exercises[0];
    const rows = ['understanding', 'procedure', 'retention', 'retention'].map((dimension, index) => ({ ...mapping(atom.id, { ...task, stem: task.stem + '变式' + index }, index),
      dimension: dimension as MeasurementItem['dimension'] }));
    const spec = verificationBlueprint({ id: 'no-relabel', title: '不能重复使用结构', cause: 'retention_gap', ruleVersion: DIAGNOSIS_VERSION }, atom, 'no-relabel');
    expect(selectVerificationItems(spec, rows, new Set([atom.id]), 'no-relabel', 4, 600).verification.fullyCovered).toBe(false);
  });
});
