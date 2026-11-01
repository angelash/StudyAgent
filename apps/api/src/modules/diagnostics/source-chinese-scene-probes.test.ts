import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, curriculumPackageSchema, knowledgeAtomSchema, questionAnswerSchemaSchema,
  type DiagnosticResponse, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import rawPackage from '../../../../../resources/curriculum/source-lessons/chinese-g3-daqingshu-objectives-v1.json';
import { buildFirstSourceSceneFamilies } from './source-chinese-scene-probes';
import { buildFirstSourceRetentionFamilies } from './source-chinese-first-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { verificationBlueprint, selectVerificationItems, verificationResult } from './verification-blueprint';
import { materialStructureCoverage } from './verification-materials';
import { DIAGNOSIS_VERSION } from './diagnosis';

const families = buildFirstSourceSceneFamilies(), atomId = families[0].atomId;
const draftPackage = curriculumPackageSchema.parse(rawPackage);
const atom = knowledgeAtomSchema.parse(draftPackage.atoms.find(row => row.atom.id === atomId)!.atom);
const input = (task: Exercise): QuestionAnswerSchema => questionAnswerSchemaSchema.parse({ questionId: 'scene-candidate', mode: task.mode,
  responseShape: { value: 'string' }, validationRules: { required: true },
  gradingConfig: task.rubric ? { rubric: task.rubric, reviewRequired: true, referenceOnly: true } : {},
  ...(task.options ? { options: task.options.map((value, index) => ({ id: 'o' + index, value, content: value, label: String.fromCharCode(65 + index) })) } : {}) });
const items: MeasurementItem[] = families.flatMap(family => family.exercises).map((task, index) => ({ id: 'scene-' + index,
  questionId: foundationQuestionId(atomId, task), atomId, family: atomId + ':' + task.family, dimension: task.dimension, version: 1,
  questionVersion: 1, probeRole: task.dimension === 'transfer' ? 'transfer' : task.dimension === 'retention' ? 'retention' : 'anchor',
  expectedSeconds: task.expectedSeconds!, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'editorial-only' }));
const blueprint = () => verificationBlueprint({ id: 'scene-stock', title: '场景还原材料储备', cause: 'retention_gap', ruleVersion: DIAGNOSIS_VERSION }, atom, 'scene-stock');

describe('accurate-source scene reconstruction editorial candidates', () => {
  it('keeps the real objective draft, avoids an implicit seed release, and separates original materials', () => {
    expect(atom.status).toBe('draft');
    expect(draftPackage.atoms.every(row => row.expectedVersion === 0 && row.atom.status === 'draft')).toBe(true);
    expect(buildFoundationCurriculum().some(row => row.atom.id === atomId)).toBe(false);
    expect(items).toHaveLength(22); expect(new Set(items.map(row => row.questionId)).size).toBe(22);
    const previous = new Set(buildFirstSourceRetentionFamilies().flatMap(family => family.exercises.map(task => task.stem)));
    for (const family of families) {
      expect(family.distinction.length).toBeGreaterThan(35);
      expect(family.exercises.every(task => !previous.has(task.stem))).toBe(true);
    }
    expect(materialStructureCoverage(atomId, items)).toMatchObject({ ready: true, basicFamilies: 2, transferFamilies: 2, contrastFamilies: 4 });
  });

  it('scores only the nine closed decisions and keeps all thirteen reconstructions awaiting rubric review', () => {
    let closed = 0, pending = 0;
    for (const family of families) for (const task of family.exercises) {
      const schema = input(task); expect(answerInputConfiguration(schema).supported, task.stem).toBe(true);
      const correct = gradeResponse(schema, task.answer, task.answer);
      if (task.rubric) {
        expect(task.rubric.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(1);
        expect(correct).toMatchObject({ status: 'pending_review', score: null, correct: null }); pending++;
      } else {
        expect(correct).toMatchObject({ status: 'scored', score: 1, correct: true });
        const wrong = gradeResponse(schema, task.answer, task.options!.find(value => value !== task.answer));
        expect(wrong).toMatchObject({ status: 'scored', score: 0, correct: false }); closed++;
      }
    }
    expect({ closed, pending }).toEqual({ closed: 9, pending: 13 });
  });

  it('reserves disjoint questions for four intervals within the original time limit, then reports exhaustion', () => {
    const used = new Set<string>();
    for (const day of [1, 3, 7, 14]) {
      const result = selectVerificationItems(blueprint(), items.filter(row => !used.has(row.questionId)), new Set([atomId]), 'scene-' + day, 4, 600);
      expect(result.verification.fullyCovered).toBe(true); expect(result.selected).toHaveLength(4); expect(result.seconds).toBeLessThanOrEqual(600);
      result.selected.forEach(row => { expect(used.has(row.questionId)).toBe(false); used.add(row.questionId); });
    }
    expect(selectVerificationItems(blueprint(), items.filter(row => !used.has(row.questionId)), new Set([atomId]), 'scene-exhausted', 4, 600).verification.fullyCovered).toBe(false);
  });

  it('does not turn submitted open descriptions or matching reference text into independent mastery observations', () => {
    const selected = selectVerificationItems(blueprint(), items, new Set([atomId]), 'scene-pending', 4, 600);
    const tasks = new Map(families.flatMap(family => family.exercises).map(task => [foundationQuestionId(atomId, task), task]));
    const responses = selected.selected.map(row => {
      const task = tasks.get(row.questionId)!, graded = gradeResponse(input(task), task.answer, task.answer);
      return { ...row, id: 'response-' + row.id, itemId: row.id, studentId: 'generated-model-child', sessionId: 'generated-model-session',
        disposition: 'answered', hintLevel: 0, priorExposure: false, ...graded } as unknown as DiagnosticResponse;
    });
    const result = verificationResult(selected.verification, responses);
    expect(result.independentObservationsComplete).toBe(false);
    expect(result.groups.reduce((sum, group) => sum + group.awaitingReview, 0)).toBe(2);
    expect(result.groups.find(group => group.groupId.includes('verification-1'))?.independentFamilies).toBe(1);
  });
});
