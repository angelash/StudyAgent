import type { StudioCourse } from '@study-agent/contracts';
import { classroomFingerprint } from '../learning/classroom-curriculum';
import { assertClassroomRetentionRecord } from './classroom-retention-record';
import { assertClassroomRetentionOrigins } from './classroom-retention-origin';
import { assertAdoptedTeachingLesson } from './textbook-teaching-adoption';
import { teachingHash } from './textbook-teaching-package';
import { retainedCourseLesson } from '../learning/studio-course-history-lookup';

/** Check adopted classroom writes before COMMIT as well as on cold open. A
 * native caller cannot quietly drop seven targets and poison the next read. */
export function assertAdoptedTeachingClassrooms(state: Record<string, any[]>) {
  const retained: any[] = [];
  for (const session of state.classroomSessions ?? []) {
    const savedCourse=session.studioCourseId?retainedCourseLesson(state,session.studioCourseId,session.lessonId,session.studentId):undefined,course=savedCourse?.course,source=savedCourse?.lesson;
    if (!source?.textbookTeaching && !session.lesson?.practiceVersion?.startsWith('textbook-teaching-public-v1:')) continue;
    try {
      if (!course || !source || session.courseId !== course.id || session.studentId !== course.studentId) throw Error();
      const adoption = state.textbookTeachingAdoptions?.find(record => record.courseId === course.id && record.studentId === course.studentId && record.lessonId === source.id),
        { snapshot } = assertAdoptedTeachingLesson(adoption, course as StudioCourse, source);
      if (teachingHash(session.lesson) !== teachingHash(snapshot.lesson) || session.contentFingerprint !== classroomFingerprint(snapshot.lesson) ||
          state.users?.some(user => user.id === session.ownerUserId && user.role === 'student') && !session.retentionContext) throw Error();
      assertClassroomRetentionRecord(session); retained.push(session);
    } catch (cause) { throw Error('textbook_teaching_classroom_integrity_failed', { cause }); }
  }
  assertClassroomRetentionOrigins({ ...state, classroomSessions: retained });
}
