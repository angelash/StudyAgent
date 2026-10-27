import { describe, expect, it } from 'vitest';
import { classroomCourse } from '../learning/classroom-curriculum';
import { assistantLectureReference, assistantLectureSummary, freezeAssistantLecture, readAssistantLecture } from './assistant-lecture-context';

describe('frozen adult lecture context', () => {
  const source = () => { const course = classroomCourse(); return { course, lecture: course.units[0].lectures[0] }; };
  it('accepts all fifteen current authored lectures and gives each its own return position', () => {
    const course = classroomCourse(); const references = new Set<string>();
    for (const [unitIndex, unit] of course.units.entries()) for (const [lectureIndex, lecture] of unit.lectures.entries()) {
      const snapshot = freezeAssistantLecture(course.id, lecture.id), reference = assistantLectureReference(snapshot);
      expect(readAssistantLecture(snapshot, reference, lecture.id, true).current).toBe(true);
      expect(assistantLectureSummary(snapshot, true)).toMatchObject({ unitPosition: unitIndex + 1, lecturePosition: lectureIndex + 1 });
      expect(snapshot.lessons).toHaveLength(4); references.add(reference);
    }
    expect(references.size).toBe(15);
  });
  it('uses a detached teaching-only snapshot and never includes exercise or scoring properties', () => {
    const { course, lecture } = source(); const original = structuredClone(course);
    Object.assign(lecture.lessons[0], { answer: 'PRIVATE_ANSWER', questions: ['PRIVATE_QUESTION'], gradingConfig: { key: 'PRIVATE_KEY' } });
    const snapshot = freezeAssistantLecture(course.id, lecture.id, course);
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE_|questions|gradingConfig/);
    lecture.lessons[0].objective = 'Changed after the snapshot';
    expect(snapshot.lessons[0].objective).toBe(original.units[0].lectures[0].lessons[0].objective);
    expect(assistantLectureSummary(snapshot, true).href).toContain('/studio/classroom?');
    expect(JSON.stringify(assistantLectureSummary(snapshot, true))).not.toContain(snapshot.lessons[0].objective);
  });
  it('keeps an old snapshot readable while refusing a send after content changes without a course version bump', () => {
    const { course, lecture } = source(); const snapshot = freezeAssistantLecture(course.id, lecture.id, course), reference = assistantLectureReference(snapshot);
    lecture.lessons[0].objective += ' A new teaching objective.';
    expect(readAssistantLecture(snapshot, reference, lecture.id, false, course)).toEqual({ snapshot, current: false });
    expect(() => readAssistantLecture(snapshot, reference, lecture.id, true, course)).toThrow('讲座内容已更新');
    expect(assistantLectureReference(freezeAssistantLecture(course.id, lecture.id, course))).not.toBe(reference);
  });
  it('does not reconstruct a missing or corrupt original from the current curriculum', () => {
    const { course, lecture } = source(); const snapshot = freezeAssistantLecture(course.id, lecture.id, course), reference = assistantLectureReference(snapshot);
    expect(() => readAssistantLecture(undefined, reference, lecture.id, false, course)).toThrow('快照缺失或损坏');
    expect(() => readAssistantLecture({ ...snapshot, lectureTitle: 'Forged title' }, reference, lecture.id, false, course)).toThrow('标识与快照不一致');
    expect(() => readAssistantLecture(snapshot, reference, 'another-lecture', false, course)).toThrow('标识与快照不一致');
  });
  it('preserves history after removal and rejects ambiguous lecture identifiers', () => {
    const { course, lecture } = source(); const snapshot = freezeAssistantLecture(course.id, lecture.id, course), reference = assistantLectureReference(snapshot);
    const removed = structuredClone(course); removed.units[0].lectures.shift();
    expect(readAssistantLecture(snapshot, reference, lecture.id, false, removed).current).toBe(false);
    expect(() => readAssistantLecture(snapshot, reference, lecture.id, true, removed)).toThrow('讲座内容已更新');
    course.units[1].lectures.push(structuredClone(lecture));
    expect(() => freezeAssistantLecture(course.id, lecture.id, course)).toThrow('标识不唯一');
  });
});
