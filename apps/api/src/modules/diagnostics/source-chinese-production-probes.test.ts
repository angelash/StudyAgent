import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, curriculumPackageSchema, questionAnswerSchemaSchema,
  type DiagnosticResponse, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import draftPackage from '../../../../../resources/curriculum/source-lessons/chinese-g3-daqingshu-objectives-v1.json';
import { buildFirstSourceWritingFamilies, firstSourceWritingCharacters } from './source-chinese-writing-probes';
import { buildFirstSourceExpressionFamilies } from './source-chinese-expression-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { canonicalFamily } from './family-identity';
import { gradeResponse } from './scoring';
import { materialStructureCoverage } from './verification-materials';
import { selectVerificationItems, verificationBlueprint, verificationResult } from './verification-blueprint';
import { DIAGNOSIS_VERSION } from './diagnosis';

const fixtures = [
  { name: 'actual handwriting', families: buildFirstSourceWritingFamilies(), media: 17, text: 0 },
  { name: 'grounded campus description', families: buildFirstSourceExpressionFamilies(), media: 11, text: 6 },
];
// This is a protocol fixture, not an uploaded picture, an audio recording or stored learner evidence.
const mediaFixture = { mediaIds: ['student_media_00000000-0000-0000-0000-000000000002'], description: '仅协议测试，不对应已上传文件或真人作品' };
const isMedia = (task: Exercise) => task.mode === 'image_upload' || task.mode === 'audio_record';
const schema = (task: Exercise): QuestionAnswerSchema => questionAnswerSchemaSchema.parse({ questionId: 'production-candidate', mode: task.mode,
  responseShape: task.responseShape ?? { value: 'string' }, validationRules: { required: true },
  gradingConfig: task.rubric ? { rubric: task.rubric, reviewRequired: true, referenceOnly: true } : {},
  ...(task.options ? { options: task.options.map((value, index) => ({ id: 'o' + index, value, content: value, label: String.fromCharCode(65 + index) })) } : {}) });

describe.each(fixtures)('$name: editorial structures and review boundaries', fixture => {
  const atomId = fixture.families[0].atomId, atom = curriculumPackageSchema.parse(draftPackage).atoms.find(row => row.atom.id === atomId)!.atom;
  const tasks = fixture.families.flatMap(family => family.exercises);
  const items: MeasurementItem[] = tasks.map((task, index) => ({ id: 'production-' + index, atomId,
    questionId: foundationQuestionId(atomId, task), questionVersion: 1, version: 1, family: atomId + ':' + task.family, dimension: task.dimension,
    probeRole: task.dimension === 'retention' ? 'retention' : task.dimension === 'transfer' ? 'transfer' : 'anchor', expectedSeconds: task.expectedSeconds!,
    difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'protocol-model-only' }));
  const blueprint = () => verificationBlueprint({ id: 'production-stock', title: '产生性任务库存，不是实际表现', cause: 'retention_gap', ruleVersion: DIAGNOSIS_VERSION }, atom, 'production-stock');

  it('keeps draft objectives, counts four actual structures and preserves transfer identities at delayed use', () => {
    expect(atom.status).toBe('draft'); expect(buildFoundationCurriculum().some(row => row.atom.id === atomId)).toBe(false);
    expect(tasks).toHaveLength(22); expect(new Set(items.map(item => item.questionId)).size).toBe(22);
    expect(new Set(items.map(canonicalFamily)).size).toBe(4);
    const transfers = new Set(items.filter(item => item.dimension === 'transfer').map(canonicalFamily));
    expect(new Set(items.filter(item => item.dimension === 'retention').map(canonicalFamily))).toEqual(transfers);
    expect(materialStructureCoverage(atomId, items)).toMatchObject({ ready: true, basicFamilies: 2, transferFamilies: 2, contrastFamilies: 4 });
    if (atomId.endsWith(':handwriting')) {
      expect(firstSourceWritingCharacters).toEqual(['晨', '绒', '球', '汉', '艳', '服', '装', '扮', '静', '停', '孔', '雀', '粗']);
      for (const task of tasks.filter(task => task.dimension === 'procedure')) expect(firstSourceWritingCharacters.every(char => task.stem.includes(char))).toBe(true);
    }
  });

  it('scores only five closed checks and requires original media or text review for all production tasks', () => {
    let closed = 0, media = 0, text = 0;
    for (const task of tasks) {
      const input = schema(task); expect(answerInputConfiguration(input).supported).toBe(true);
      const result = gradeResponse(input, task.answer, isMedia(task) ? mediaFixture : task.answer);
      if (task.rubric) {
        expect(result).toMatchObject({ status: 'pending_review', score: null, correct: null });
        expect(task.rubric.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(1);
        if (isMedia(task)) {
          media++; expect(() => gradeResponse(input, task.answer, { mediaIds: [], description: '没有实际附件' })).toThrow(task.mode === 'image_upload' ? '请上传' : '请录音');
          expect(() => gradeResponse(input, task.answer, task.answer)).toThrow('作答题目或模式不匹配');
        } else text++;
      } else {
        closed++; expect(result).toMatchObject({ status: 'scored', score: 1, correct: true });
        const wrong = task.options ? task.options.find(option => option !== task.answer) :
          (task.answer as Array<{ key: string; value: string }>).map((entry, index) => index ? entry : { ...entry, value: '不符合材料的结构' });
        const failed = gradeResponse(input, task.answer, wrong); expect(failed.correct).toBe(false); expect(failed.score).toBeLessThan(1);
      }
    }
    expect({ closed, media, text }).toEqual({ closed: 5, media: fixture.media, text: fixture.text });
  });

  it('fills four bounded stock appointments with fresh questions without inventing families from dimension changes', () => {
    const seen = new Set<string>();
    for (const day of [1, 3, 7, 14]) {
      const result = selectVerificationItems(blueprint(), items.filter(item => !seen.has(item.questionId)), new Set([atomId]), 'production-' + day, 4, 600);
      expect(result.verification.fullyCovered).toBe(true); expect(result.selected).toHaveLength(4); expect(result.seconds).toBeLessThanOrEqual(600);
      result.selected.forEach(item => { expect(seen.has(item.questionId)).toBe(false); seen.add(item.questionId); });
    }
    expect(selectVerificationItems(blueprint(), items.filter(item => !seen.has(item.questionId)), new Set([atomId]), 'stock-exhausted', 4, 600).verification.fullyCovered).toBe(false);
  });

  it('keeps three of four selected observations unscored and cannot infer mastery from protocol-only submissions', () => {
    const result = selectVerificationItems(blueprint(), items, new Set([atomId]), 'production-review', 4, 600), byQuestion = new Map(tasks.map(task => [foundationQuestionId(atomId, task), task]));
    const responses = result.selected.map(item => {
      const task = byQuestion.get(item.questionId)!, graded = gradeResponse(schema(task), task.answer, isMedia(task) ? mediaFixture : task.answer);
      return { ...item, id: 'model-' + item.id, itemId: item.id, studentId: 'model-child', sessionId: 'model-session', disposition: 'answered',
        hintLevel: 0, priorExposure: false, ...graded } as unknown as DiagnosticResponse;
    });
    const evidence = verificationResult(result.verification, responses);
    expect(evidence.independentObservationsComplete).toBe(false); expect(evidence.groups.reduce((sum, group) => sum + group.awaitingReview, 0)).toBe(3);
    expect(evidence.groups.find(group => group.groupId.includes('verification-1'))?.independentFamilies).toBe(0);
  });
});
