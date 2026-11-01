import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, curriculumPackageSchema, questionAnswerSchemaSchema,
  type DiagnosticResponse, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import draftPackage from '../../../../../resources/curriculum/source-lessons/chinese-g3-daqingshu-objectives-v1.json';
import { buildFirstSourceReadingFamilies, firstSourceReadingWords } from './source-chinese-reading-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint, verificationResult } from './verification-blueprint';
import { materialStructureCoverage } from './verification-materials';
import { DIAGNOSIS_VERSION } from './diagnosis';

const families = buildFirstSourceReadingFamilies(), atomId = families[0].atomId;
const atom = curriculumPackageSchema.parse(draftPackage).atoms.find(row => row.atom.id === atomId)!.atom;
const schema = (task: Exercise): QuestionAnswerSchema => questionAnswerSchemaSchema.parse({ questionId: 'reading-candidate', mode: task.mode,
  responseShape: task.responseShape, validationRules: { required: true }, gradingConfig: task.rubric ? { rubric: task.rubric, reviewRequired: true, referenceOnly: true } : {} });
// A format-only fixture. It does not identify an uploaded attachment or a learner recording.
const contractOnlyMedia = { mediaIds: ['student_media_00000000-0000-0000-0000-000000000001'], description: '仅协议模型夹具，不对应真实附件或学生声音' };
const response = (task: Exercise) => task.mode === 'audio_record' ? contractOnlyMedia : task.answer;
const items: MeasurementItem[] = families.flatMap(family => family.exercises).map((task, index) => ({ id: 'reading-' + index,
  atomId, questionId: foundationQuestionId(atomId, task), questionVersion: 1, version: 1, family: atomId + ':' + task.family,
  dimension: task.dimension, probeRole: task.dimension === 'retention' ? 'retention' : task.dimension === 'transfer' ? 'transfer' : 'anchor',
  expectedSeconds: task.expectedSeconds!, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'contract-model-only' }));
const blueprint = () => verificationBlueprint({ id: 'reading-stock', title: '识读材料库存，不是朗读结果', cause: 'retention_gap', ruleVersion: DIAGNOSIS_VERSION }, atom, 'reading-stock');

describe('accurate-source word reading material and actual-pronunciation boundaries', () => {
  it('retains all ten distinct source characters, keeps the objective draft and creates no automatic seed release', () => {
    expect(firstSourceReadingWords.map(row => row.character)).toEqual(['坝', '汉', '艳', '扮', '扬', '读', '摔', '跤', '凤', '洁']);
    expect(new Set(firstSourceReadingWords.map(row => row.character)).size).toBe(10);
    expect(atom.status).toBe('draft'); expect(buildFoundationCurriculum().some(row => row.atom.id === atomId)).toBe(false);
    expect(new Set(items.map(row => row.questionId)).size).toBe(22);
    expect(materialStructureCoverage(atomId, items)).toMatchObject({ ready: true, basicFamilies: 2, transferFamilies: 2, contrastFamilies: 4 });
  });

  it('grades the five written pronunciation checks but never converts the seventeen audio references into scored pronunciation', () => {
    let written = 0, oral = 0;
    for (const family of families) for (const task of family.exercises) {
      const input = schema(task); expect(answerInputConfiguration(input).supported).toBe(true);
      const result = gradeResponse(input, task.answer, response(task));
      if (task.mode === 'audio_record') {
        expect(result).toMatchObject({ status: 'pending_review', score: null, correct: null }); oral++;
        expect(task.rubric!.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(1);
        expect(() => gradeResponse(input, task.answer, { mediaIds: [], description: '只有文字，没有录音' })).toThrow('请录音');
        expect(() => gradeResponse(input, task.answer, task.answer)).toThrow('作答题目或模式不匹配');
      } else {
        expect(result).toMatchObject({ status: 'scored', score: 1, correct: true }); written++;
        const wrong = (task.answer as Array<{ key: string; value: string }>).map((entry, index) => index ? entry : { ...entry, value: '未标声调的错误读法' });
        const failed = gradeResponse(input, task.answer, wrong); expect(failed.correct).toBe(false); expect(failed.score).toBeLessThan(1);
      }
    }
    expect({ written, oral }).toEqual({ written: 5, oral: 17 });
  });

  it('uses disjoint material questions for four original stock appointments and reports exhaustion afterward', () => {
    const used = new Set<string>();
    for (const day of [1, 3, 7, 14]) {
      const selected = selectVerificationItems(blueprint(), items.filter(row => !used.has(row.questionId)), new Set([atomId]), 'reading-' + day, 4, 600);
      expect(selected.verification.fullyCovered).toBe(true); expect(selected.selected).toHaveLength(4); expect(selected.seconds).toBeLessThanOrEqual(600);
      selected.selected.forEach(row => { expect(used.has(row.questionId)).toBe(false); used.add(row.questionId); });
    }
    expect(selectVerificationItems(blueprint(), items.filter(row => !used.has(row.questionId)), new Set([atomId]), 'reading-exhausted', 4, 600).verification.fullyCovered).toBe(false);
  });

  it('does not turn format-only media submissions into reviewed independent observations', () => {
    const selected = selectVerificationItems(blueprint(), items, new Set([atomId]), 'reading-pending', 4, 600);
    const tasks = new Map(families.flatMap(family => family.exercises).map(task => [foundationQuestionId(atomId, task), task]));
    const responses = selected.selected.map(row => {
      const task = tasks.get(row.questionId)!, graded = gradeResponse(schema(task), task.answer, response(task));
      return { ...row, id: 'model-' + row.id, itemId: row.id, studentId: 'model-child', sessionId: 'model-session', disposition: 'answered',
        hintLevel: 0, priorExposure: false, ...graded } as unknown as DiagnosticResponse;
    });
    const result = verificationResult(selected.verification, responses);
    expect(result.independentObservationsComplete).toBe(false); expect(result.groups.reduce((sum, group) => sum + group.awaitingReview, 0)).toBe(3);
    expect(result.groups.find(group => group.groupId.includes('verification-1'))?.independentFamilies).toBe(0);
  });
});
