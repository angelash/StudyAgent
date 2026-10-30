import { describe, it, expect } from 'vitest';
import { buildChemistryCurriculum } from './chemistry-curriculum';
import { buildChemistryCourse, chemistryCourseFingerprint } from '../learning/chemistry-course';
import { reviseChemistryTutorial } from '../learning/chemistry-tutorial-revision';
import { curriculumClassroomLesson, classroomFingerprint } from '../learning/classroom-curriculum';
import { resolveClassroomRetentionContext, assertClassroomRetentionOrigins } from './classroom-retention-origin';

describe('retained classroom origins across an actual in-place chemistry tutorial revision', () => {
  it('retains the original child mapping after the actual revision command stores previousCourse', async () => {
    const atoms = buildChemistryCurriculum().map(row => row.atom), course = buildChemistryCourse('original-child', atoms);
    delete course.teachingVersion; course.fingerprint = chemistryCourseFingerprint(course);
    const source = course.units.flatMap(unit => unit.lessons).find(row => row.kind === 'learn')!;
    const lesson = curriculumClassroomLesson(course, source)!;
    const session = { id: 'original-child-classroom', studentId: course.studentId, studioCourseId: course.id,
      lessonId: source.id, contentFingerprint: classroomFingerprint(lesson), lesson };
    const records: any = { studioCourses: [course], knowledgeAtoms: atoms, events: [] };
    const context = resolveClassroomRetentionContext(records, session)!;
    expect(context.targets).toHaveLength(1);
    records.classroomSessions = [{ ...session, retentionContext: context }];
    const store: any = { find: (name: string, where: any) => records[name]?.find((row: any) => Object.entries(where).every(([key, value]) => row[key] === value)),
      events: records.events, nextId: () => 'actual-maintenance-audit', transaction: async (body: () => unknown) => body() };
    await reviseChemistryTutorial(store, course.id, course.fingerprint, true);
    expect(records.events[0].payload.previousCourse.id).toBe(course.id);
    expect(classroomFingerprint(curriculumClassroomLesson(course, source)!)).not.toBe(session.contentFingerprint);
    expect(resolveClassroomRetentionContext(records, session)).toEqual(context);
    expect(() => assertClassroomRetentionOrigins(records)).not.toThrow();
  });
});
