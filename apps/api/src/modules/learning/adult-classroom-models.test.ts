import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { classroomCourse, classroomLesson, classroomAnswerKey, classroomHintKeys, classroomFingerprint, classroomTeachingFingerprint } from './classroom-curriculum';
import { adultProjectDefinitions } from './course-project-content';
import { adultClassroomModels, ADULT_CLASSROOM_MODEL_VERSION } from './adult-classroom-models';
import { applyAdultClassroomModel } from './adult-classroom-model-projection';

const before = JSON.parse(gunzipSync(readFileSync(resolve(__dirname, '../../../../../doc/evidence/2026-10-31/workspace-r5-adult-model-preparation/before-content.json.gz'))).toString('utf8'));

describe('authored adult concept models and unchanged original practice', () => {
  it('changes teaching in exactly59 lessons while preserving the first reference lesson and every original question, answer and help ladder', () => {
    expect(Object.keys(adultClassroomModels)).toHaveLength(59);
    expect(classroomCourse().version).toContain(ADULT_CLASSROOM_MODEL_VERSION);
    expect(classroomCourse().units).toEqual(before.course.units);
    expect(before.lessons).toHaveLength(60);
    let changed = 0, questions = 0;
    for (const row of before.lessons) {
      const lesson = classroomLesson(row.lesson.id)!; questions += lesson.questions.length;
      expect(lesson.questions, lesson.id).toEqual(row.lesson.questions);
      expect(lesson.practiceVersion, lesson.id).toBe(row.lesson.practiceVersion);
      for (const question of lesson.questions) {
        expect(classroomAnswerKey(question.id), question.id).toEqual(row.answerKeys[question.id]);
        expect(classroomHintKeys(question.id), question.id).toEqual(row.hintKeys[question.id]);
      }
      if (lesson.id === 'soc-1-1-1') {
        expect(classroomFingerprint(lesson)).toBe(row.contentFingerprint);
        expect(classroomTeachingFingerprint(lesson)).toBe(row.teachingFingerprint);
      } else {
        expect(classroomTeachingFingerprint(lesson), lesson.id).not.toBe(row.teachingFingerprint); changed++;
        expect(lesson.steps.filter(step => step.id.startsWith(lesson.id + ':model-'))).toHaveLength(3);
      }
    }
    expect(changed).toBe(59); expect(questions).toBe(185);
    for (const row of before.unitChecks) expect(classroomFingerprint(classroomLesson(row.lesson.id)!)).toBe(row.contentFingerprint);
    expect(adultProjectDefinitions()).toEqual(before.projects);
  });
  it('presents prediction before the specific comparison and retains alternative evidence and inference limits in every actual lesson', () => {
    for (const [id, model] of Object.entries(adultClassroomModels)) {
      const lesson = classroomLesson(id)!, prediction = lesson.steps.findIndex(step => step.id === id + ':model-predict'), reading = lesson.steps.findIndex(step => step.id === id + ':model-reading'), evidence = lesson.steps.findIndex(step => step.id === id + ':model-evidence'), check = lesson.steps.findIndex(step => step.phase === 'check');
      expect(prediction, id).toBeLessThan(reading); expect(reading, id).toBeLessThan(evidence); expect(evidence, id).toBeLessThan(check);
      expect(lesson.steps[reading].narration).toContain('不是真实调查结果');
      expect(lesson.steps[reading].blocks.find(block => block.kind === 'table')?.table, id).toEqual(model.table);
      expect(lesson.steps[evidence].narration, id).toContain(model.alternative);
      expect(lesson.steps[evidence].narration, id).toContain(model.nextEvidence);
      expect(lesson.steps[evidence].narration, id).toContain(model.limit);
      expect(lesson.steps.flatMap(step => step.blocks).some(block => block.diagram?.title === '从观察走向可以核查的解释'), id).toBe(false);
      for (const step of lesson.steps) expect(step.blocks.some(block => block.kind === 'text' && block.text === step.narration), id).toBe(false);
      const blocks = lesson.steps.flatMap(step => step.blocks.map(block => block.id)); expect(new Set(blocks).size, id).toBe(blocks.length);
    }
  });
  it('rejects missing identities and a second accidental projection rather than silently mixing or duplicating model content', () => {
    const lesson = structuredClone(classroomLesson('soc-1-1-2')!);
    expect(() => applyAdultClassroomModel(lesson)).toThrow('原概念与误区步骤不一致');
    lesson.id = 'soc-missing'; expect(() => applyAdultClassroomModel(lesson)).toThrow('缺少对应概念模型');
  });
});
