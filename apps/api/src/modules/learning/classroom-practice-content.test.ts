import { describe, expect, it } from 'vitest';
import { classroomPracticeSummary, type ClassroomAnswerReceipt } from '@study-agent/contracts';
import { classroomAnswerKey, classroomCourse, classroomHintKeys, classroomLesson, classroomTeachingFingerprint } from './classroom-curriculum';
import { practiceVariations } from './classroom-practice-content';
import { microChoices, unitChoice } from './classroom-choice-content';

const lessons = classroomCourse().units.flatMap(unit => unit.lectures.flatMap(lecture => lecture.lessons.map(lesson => classroomLesson(lesson.id)!)));
describe('complete authored micro-lesson practice sets', () => {
  it('retains five first-lesson checks and provides three cognitive roles in every remaining lesson', () => {
    expect(Object.keys(practiceVariations)).toHaveLength(59);
    expect(lessons.flatMap(lesson => lesson.questions)).toHaveLength(185);
    for (const lesson of lessons) {
      expect(lesson.questions).toHaveLength(lesson.id === 'soc-1-1-1' ? 6 : ['soc-1-1-2', 'soc-1-3-1'].includes(lesson.id) ? 4 : 3);
      expect(new Set(lesson.questions.map(question => question.purpose))).toEqual(new Set(['application', 'boundary', 'evidence']));
      expect(lesson.practiceVersion).toMatch(/^2026-10-25\.1:[a-f0-9]{16}$/);
    }
  });
  it('keeps all 245 questions distinct and all frozen help ladders complete', () => {
    const questions = [...lessons.flatMap(lesson => lesson.questions), ...classroomCourse().units.flatMap(unit => classroomLesson('unit-exam:' + unit.id)!.questions)];
    expect(questions).toHaveLength(245); expect(new Set(questions.map(question => question.id)).size).toBe(245);
    expect(new Set(questions.map(question => question.prompt)).size).toBe(245);
    for (const question of questions) {
      expect(new Set(question.options).size).toBe(question.selectionMode === 'multiple' ? 5 : 4); expect(classroomAnswerKey(question.id)?.explanation.length, question.id).toBeGreaterThan(question.id.includes(':practice:') ? 20 : 0);
      const hints = classroomHintKeys(question.id)!; expect(hints).toHaveLength(2); expect(hints[0]).not.toBe(hints[1]);
      expect(hints.every(text => text.length > 10)).toBe(true);
      if (question.table) { expect(question.table.caption).toContain('教学示例'); expect(question.table.rows.every(row => row.length === question.table!.headers.length)).toBe(true); }
    }
    for (const unit of classroomCourse().units) {
      const questions = unit.lectures.flatMap(lecture => lecture.lessons.flatMap(lesson => classroomLesson(lesson.id)!.questions));
      expect(questions.some(question => question.table || question.diagram)).toBe(true);
    }
  });
  it.each([
    ['soc-1-3-1', 'boundary', '付费资格与入群选择可能使一部分成人没有被覆盖'],
    ['soc-2-3-3', 'boundary', '它可能连接原本较少互通的信息来源，但作用仍取决于圈层和内容'],
    ['soc-3-3-3', 'boundary', '同时计入有偿与无偿劳动，并继续比较强度、控制权和休息条件'],
    ['soc-4-3-2', 'evidence', '可见制度参与下降，但个人实践没有呈现相同方向的变化'],
    ['soc-5-2-1', 'evidence', '乙地出生人数更多，但粗出生率更低；仍不能由此确定育龄者的具体选择'],
  ])('preserves the intended distinction under choice rotation: %s / %s', (lessonId, purpose, expected) => {
    const question = classroomLesson(lessonId)!.questions.find(question => question.id.includes(':practice:') && question.purpose === purpose)!;
    const answer = classroomAnswerKey(question.id)!.answer; expect(Array.isArray(answer)).toBe(false);
    expect(question.options[answer as number]).toBe(expected);
  });
  it('checks numeric table examples rather than inferring rates from counts', () => {
    const question = classroomLesson('soc-5-2-1')!.questions.find(question => question.table)!;
    expect(question.table!.rows.map(row => Number(row[2]) / Number(row[1]) * 1000)).toEqual([10, 5]);
    const labor = classroomLesson('soc-3-3-3')!.questions.find(question => question.table)!;
    expect(labor.table!.rows.map(row => Number(row[1]) + Number(row[2]))).toEqual([45, 55]);
  });
  it('preserves all authored multiple-choice distinctions and option explanations after freezing and rotation', () => {
    const questions = [...lessons.flatMap(lesson => lesson.questions), ...classroomLesson('unit-exam:soc-u1')!.questions].filter(question => question.selectionMode === 'multiple');
    expect(questions).toHaveLength(4);
    expect(new Set(microChoices.map(choice => choice.purpose))).toEqual(new Set(['boundary','application','evidence']));
    for (const question of questions) {
      const source = [...microChoices, unitChoice].find(choice => choice.prompt === question.prompt)!, key = classroomAnswerKey(question.id)!;
      expect(Array.isArray(key.answer)).toBe(true);
      expect((key.answer as number[]).map(index => question.options[index]).sort()).toEqual(source.answer.map(index => source.options[index]).sort());
      expect(question.options.map((option,index) => [option,key.optionExplanations![index]]).sort()).toEqual(source.options.map((option,index) => [option,source.optionExplanations[index]]).sort());
      expect(classroomHintKeys(question.id)).toEqual(source.hints); expect(question).not.toHaveProperty('optionExplanations'); expect(question).not.toHaveProperty('answer');
    }
  });
  it('separates reading identity from question updates and does not convert unknown to wrong or skipped', () => {
    const lesson = classroomLesson('soc-2-2-3')!, previous = structuredClone(lesson); previous.questions = previous.questions.slice(0, 1); delete previous.practiceVersion;
    expect(classroomTeachingFingerprint(previous)).toBe(classroomTeachingFingerprint(lesson));
    previous.steps[0].narration += '更改的讲解'; expect(classroomTeachingFingerprint(previous)).not.toBe(classroomTeachingFingerprint(lesson));
    const receipt: ClassroomAnswerReceipt = { questionId: lesson.questions[0].id, selectedIndex: null, correct: false, skipped: true, disposition: 'dont_know', hintUsed: true, hintLevel: 2, explanation: '本次不会，尚待复核', at: '2026-10-24T00:00:00Z' };
    expect(classroomPracticeSummary(lesson.questions, [receipt])).toMatchObject({ dontKnow: 1, skipped: 0, incorrect: 0, assisted: 1, remaining: 2, independentCorrect: 0 });
  });
});
