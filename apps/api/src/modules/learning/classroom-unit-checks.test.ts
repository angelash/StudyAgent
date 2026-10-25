import { describe, expect, it } from 'vitest';
import { classroomPracticeSummary, type ClassroomAnswerReceipt, type ClassroomQuestion } from '@study-agent/contracts';
import { classroomAnswerKey, classroomCourse, classroomLesson } from './classroom-curriculum';

describe('unit checks cover all topics with new scenarios', () => {
  const course = classroomCourse();
  const practice = course.units.flatMap(unit => unit.lectures.flatMap(lecture => lecture.lessons.flatMap(lesson => classroomLesson(lesson.id)!.questions)));
  const exams = course.units.flatMap(unit => classroomLesson('unit-exam:' + unit.id)!.questions);
  it('has sixty new questions, separated by identity and scenario from all classroom practice', () => {
    expect(exams).toHaveLength(60);
    expect(new Set(exams.map(question => question.id)).size).toBe(60);
    expect(new Set(exams.map(question => question.prompt)).size).toBe(60);
    for (const exam of exams) {
      expect(practice.some(question => question.id === exam.id || question.prompt === exam.prompt)).toBe(false);
      expect(exam.options).toHaveLength(exam.selectionMode === 'multiple' ? 5 : 4); expect(new Set(exam.options).size).toBe(exam.options.length);
      const answer = classroomAnswerKey(exam.id)!.answer, indices = Array.isArray(answer) ? answer : [answer];
      expect(indices.every(index => Number.isInteger(index) && index >= 0 && index < exam.options.length)).toBe(true);
      if (exam.selectionMode === 'multiple') { expect(indices.length).toBeGreaterThanOrEqual(2); expect(indices.length).toBeLessThan(exam.options.length); }
      expect(classroomAnswerKey(exam.id)?.explanation.length).toBeGreaterThan(20);
      expect(exam).not.toHaveProperty('answer'); expect(exam).not.toHaveProperty('explanation');
    }
  });
  it.each(course.units.map(unit => [unit.id, unit] as const))('%s covers each of its twelve micro-lessons exactly once', (_id, unit) => {
    const lesson = classroomLesson('unit-exam:' + unit.id)!;
    expect(lesson.questions).toHaveLength(12);
    expect(lesson.questions.map(question => question.topic?.lessonId).sort()).toEqual(unit.lectures.flatMap(lecture => lecture.lessons.map(lesson => lesson.id)).sort());
    expect(new Set(lesson.questions.map(question => question.purpose))).toEqual(new Set(['application', 'evidence', 'boundary']));
    expect(lesson.assessment?.notice).toContain('不是标准化能力等级');
  });
  it.each([
    ['soc-u1', 'soc-1-3-1', '白天无法到馆的人可能被系统性遗漏'],
    ['soc-u2', 'soc-2-2-3', '两个角色的期待在同一时间提出不相容要求'],
    ['soc-u3', 'soc-3-1-3', '教育整体扩张不自动意味着相对流动更加平等'],
    ['soc-u4', 'soc-4-3-2', '制度分化和个人信仰变化可以并不一致'],
    ['soc-u5', 'soc-5-2-1', '人数之外，还需合适分母和年龄结构口径'],
  ])('retains the intended distinction after option ordering: %s / %s', (unitId, topicId, correct) => {
    const question = classroomLesson('unit-exam:' + unitId)!.questions.find(question => question.topic?.lessonId === topicId)!;
    const answer = classroomAnswerKey(question.id)!.answer; expect(Array.isArray(answer)).toBe(false);
    expect(question.options[answer as number]).toBe(correct);
  });
});

describe('practice review distinguishes first answers, assistance and unanswered work', () => {
  const questions = Array.from({ length: 5 }, (_, index) => ({ id: 'q' + index })) as ClassroomQuestion[];
  const receipt = (id: string, correct: boolean, skipped = false, hintUsed = false): ClassroomAnswerReceipt =>
    ({ questionId: id, correct, skipped, hintUsed, selectedIndex: skipped ? null : 0, explanation: '合成测试说明', at: '2026-10-23T00:00:00Z' });
  it('keeps incomplete work incomplete and finds the first unanswered question', () => {
    const summary = classroomPracticeSummary(questions, [receipt('q0', true), receipt('q4', false)]);
    expect(summary).toMatchObject({ answered: 2, remaining: 3, nextQuestionIndex: 1, complete: false });
  });
  it('separates independent correct, assisted correct, wrong and skipped without double-counting receipts', () => {
    const summary = classroomPracticeSummary(questions, [receipt('q0', true), receipt('q1', true, false, true),
      receipt('q2', false), receipt('q3', false, true), receipt('q4', false, false, true), receipt('q2', true), receipt('foreign', true)]);
    expect(summary).toMatchObject({ answered: 5, remaining: 0, complete: true, correct: 2, independentCorrect: 1, incorrect: 2, skipped: 1, assisted: 2 });
    expect(summary.reviewQuestionIds).toEqual(['q1', 'q2', 'q3', 'q4']);
  });
  it('does not declare an empty question set completed', () => { expect(classroomPracticeSummary([], []).complete).toBe(false); });
});
