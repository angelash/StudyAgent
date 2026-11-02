import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, questionAnswerSchemaSchema } from '@study-agent/contracts';
import originalLesson from '../../../../../resources/curriculum/source-lessons/chinese-g3-daqingshu-v1.json';
import { buildFirstSourceCoreFollowupCandidates, firstSourceFollowupReview } from './source-chinese-followup-probes';
import { buildFirstSourcePracticalFollowupCandidates } from './source-chinese-practical-followup-probes';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { buildFirstSourceRetentionFamilies } from './source-chinese-first-probes';
import { gradeResponse } from './scoring';

const schema = (task: Exercise) => questionAnswerSchemaSchema.parse({ questionId: 'editorial-followup', mode: task.mode,
  responseShape: task.responseShape ?? { value: 'string' }, validationRules: { required: true },
  gradingConfig: task.rubric ? { rubric: task.rubric, reviewRequired: true, referenceOnly: true } : {},
  ...(task.options ? { options: task.options.map((value, index) => ({ id: 'choice-' + index, label: String.fromCharCode(65 + index), value, content: value })) } : {}) });

describe('first-source follow-up editorial candidates', () => {
  it('keeps original material identities and delayed reserves while producing a separately reviewable stock', () => {
    const before = buildFoundationCurriculum(), reserve = buildFirstSourceRetentionFamilies();
    const originalIds = new Set(before.flatMap(row => row.exercises.map(task => foundationQuestionId(row.atom.id, task))));
    const families = buildFirstSourceCoreFollowupCandidates(), ids = families.flatMap(f => f.exercises.map(task => foundationQuestionId(f.atomId, task)));
    expect(new Set(ids).size).toBe(ids.length); expect(ids.some(id => originalIds.has(id))).toBe(false);
    expect(buildFoundationCurriculum()).toEqual(before); expect(buildFirstSourceRetentionFamilies()).toEqual(reserve);
    expect(buildFoundationCurriculum().flatMap(row => row.exercises).some(task => task.family?.startsWith('followup-'))).toBe(false);
    for (const family of families) {
      expect(originalLesson.targetIds).toContain(family.atomId);
      expect(['understanding', 'procedure', 'transfer']).toContain(family.dimension);
      expect(family.behavior.length).toBeGreaterThan(12); expect(family.structure.length).toBeGreaterThan(12);
      expect(family.distinction.trim().length).toBeGreaterThan(0);
    }
    expect(firstSourceFollowupReview).toMatchObject({ sourceSha256: originalLesson.source.sourceSha256,
      teacherReviewed: false, familyIndependenceReviewed: false, automaticPublication: false });
  });

  it('deterministically grades closed gold answers and their supplied alternatives without auto-scoring open production', () => {
    let closed = 0, open = 0;
    for (const family of buildFirstSourceCoreFollowupCandidates()) for (const task of family.exercises) {
      const input = schema(task); expect(answerInputConfiguration(input).supported).toBe(true);
      if (task.options) {
        closed++; expect(gradeResponse(input, task.answer, task.answer)).toMatchObject({ correct: true, score: 1 });
        for (const wrong of task.options.filter(value => value !== task.answer)) expect(gradeResponse(input, task.answer, wrong)).toMatchObject({ correct: false, score: 0 });
      } else {
        open++; expect(task.rubric?.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(1);
        expect(gradeResponse(input, task.answer, task.answer)).toMatchObject({ status: 'pending_review', score: null, correct: null });
        expect(gradeResponse(input, task.answer, '这里保留一份待核查的原创解释。')).toMatchObject({ status: 'pending_review', score: null, correct: null });
      }
    }
    expect({ closed, open }).toEqual({ closed: 6, open: 18 });
  });

  it('builds stable candidate identities without sharing mutable task objects across exports', () => {
    const first = buildFirstSourceCoreFollowupCandidates(), second = buildFirstSourceCoreFollowupCandidates();
    expect(first).toEqual(second);
    first[0].exercises[0].answer = '工程草稿中的局部修订';
    expect(buildFirstSourceCoreFollowupCandidates()).toEqual(second);
  });

  it('keeps actual reading and handwriting production dependent on media and human review', () => {
    const families = buildFirstSourcePracticalFollowupCandidates();
    const all = [...buildFirstSourceCoreFollowupCandidates(), ...families];
    expect([...new Set(all.map(f => f.atomId))].sort()).toEqual([...originalLesson.targetIds].sort());
    const ids = all.flatMap(f => f.exercises.map(task => foundationQuestionId(f.atomId, task)));
    expect(new Set(ids).size).toBe(ids.length);
    for (const family of families) {
      expect(originalLesson.targetIds).toContain(family.atomId);
      for (const task of family.exercises) {
        const input = schema(task); expect(answerInputConfiguration(input).supported).toBe(true);
        if (task.mode === 'image_upload' || task.mode === 'audio_record') {
          // Format-only identifier: no upload, learner voice or actual handwriting is claimed.
          const response = { mediaIds: ['student_media_00000000-0000-0000-0000-000000000003'], description: '仅契约夹具，不是真实附件或真人表现' };
          expect(gradeResponse(input, task.answer, response)).toMatchObject({ status: 'pending_review', score: null, correct: null });
          expect(() => gradeResponse(input, task.answer, { mediaIds: [], description: '缺原件' })).toThrow();
        } else if (task.rubric) {
          expect(gradeResponse(input, task.answer, task.answer)).toMatchObject({ status: 'pending_review', score: null, correct: null });
        } else {
          expect(gradeResponse(input, task.answer, task.answer)).toMatchObject({ correct: true, score: 1 });
          for (const wrong of task.options!.filter(value => value !== task.answer)) expect(gradeResponse(input, task.answer, wrong)).toMatchObject({ correct: false, score: 0 });
        }
      }
    }
    expect(firstSourceFollowupReview.targetAlignmentReviewed).toBe(false);
  });
});
