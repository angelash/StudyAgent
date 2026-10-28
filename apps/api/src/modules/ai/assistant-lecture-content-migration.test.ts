import { describe, expect, it } from 'vitest';
import { classroomCourse, classroomLesson } from '../learning/classroom-curriculum';
import { assistantDigest } from './assistant-turn-record';
import { assistantLectureReference, freezeAssistantLecture, readAssistantLecture } from './assistant-lecture-context';

function legacy() {
  const course = classroomCourse(), unit = course.units[0], lecture = unit.lectures[0];
  const safe = { protocol: 'classroom-lecture-v1' as const, courseId: course.id, courseVersion: course.version, courseTitle: course.title,
    unitId: unit.id, unitTitle: unit.title, unitPosition: 1, lectureId: lecture.id, lectureTitle: lecture.title,
    description: lecture.description, lecturePosition: 1, lessons: lecture.lessons.map(l => ({ id: l.id, title: l.title, objective: l.objective })) };
  return { ...safe, fingerprint: assistantDigest(safe) };
}

describe('actual lecture teaching and original v1 compatibility', () => {
  it('opens new lecture snapshots using the actual teaching protocol', () => {
    const old = legacy(); expect(freezeAssistantLecture(old.courseId, old.lectureId).protocol).toBe('classroom-lecture-v2');
  });
  it('carries actual narrated teaching for all fifteen authored lectures', () => {
    const course = classroomCourse();
    for (const unit of course.units) for (const lecture of unit.lectures) {
      const snapshot = freezeAssistantLecture(course.id, lecture.id), raw = JSON.stringify(snapshot);
      expect(raw).toContain(JSON.stringify(classroomLesson(lecture.lessons[0].id)!.steps[0].narration).slice(1, -1));
      expect(raw.length).toBeLessThan(17_800);
    }
  });
  it('reads a valid old goal snapshot as its original, without silently adding current teaching', () => {
    const snapshot = legacy(), result = readAssistantLecture(snapshot, assistantLectureReference(snapshot), snapshot.lectureId, false);
    expect(result.snapshot).toEqual(snapshot); expect(result.current).toBe(false);
    expect(JSON.stringify(result.snapshot)).not.toContain(classroomLesson(snapshot.lessons[0].id)!.steps[0].narration);
  });
  it('requires a new teaching scope before sending from a legacy goal-only snapshot', () => {
    const snapshot = legacy();
    expect(() => readAssistantLecture(snapshot, assistantLectureReference(snapshot), snapshot.lectureId, true)).toThrow('讲座内容已更新');
  });
  it('does not rebuild a corrupt old snapshot from the new teaching catalog', () => {
    const snapshot = legacy();
    expect(() => readAssistantLecture({ ...snapshot, description: 'changed' }, assistantLectureReference(snapshot), snapshot.lectureId, false)).toThrow('标识与快照不一致');
  });
  it('keeps exercise and scoring data outside both versions', () => {
    const old = legacy(), current = freezeAssistantLecture(old.courseId, old.lectureId);
    expect(JSON.stringify([old, current])).not.toMatch(/questions|answerKeys|hintKeys|ownerUserId|privatePrompt/);
  });
});
