import { textbookTeachingPracticeOriginSchema, type StudioCourse, type StudioLesson, type TextbookTeachingPracticeOrigin, type Subject } from '@study-agent/contracts';

const fields = ['teachingCourse', 'teachingLesson', 'teachingPackage', 'teachingVersion', 'teachingFingerprint'] as const;
export function readTeachingPracticeLocation(search: string): { kind: 'none' } | { kind: 'invalid'; message: string } | { kind: 'teaching'; origin: TextbookTeachingPracticeOrigin } {
  const params = new URLSearchParams(search); if (!fields.some(field => params.has(field))) return { kind: 'none' };
  if (fields.some(field => params.getAll(field).length !== 1) || !/^[1-9]\d{0,3}$/.test(params.get('teachingVersion') ?? '')) return { kind: 'invalid', message: '原课程的准确教学版本链接不完整，请返回原课程重新打开独立检查。' };
  const result = textbookTeachingPracticeOriginSchema.safeParse({ protocol: 'textbook-teaching-practice-v1', courseId: params.get('teachingCourse'), lessonId: params.get('teachingLesson'),
    packageId: params.get('teachingPackage'), contentVersion: Number(params.get('teachingVersion')), fingerprint: params.get('teachingFingerprint') });
  return result.success ? { kind: 'teaching', origin: result.data } : { kind: 'invalid', message: '原课程的准确教学版本链接无法核对，请返回原课程重新打开独立检查。' };
}
export function teachingPracticeHref(course: StudioCourse, activity: StudioLesson) {
  const source = activity.kind === 'learn' ? activity : activity.textbookTeachingLessonId ? course.units.flatMap(unit => unit.lessons).find(lesson => lesson.id === activity.textbookTeachingLessonId) : undefined,
    snapshot = source?.textbookTeaching;
  if (!source || !snapshot || source.kind !== 'learn' || snapshot.lesson.id !== source.id || snapshot.lesson.lectureId !== course.id) return null;
  return '/studio/assessment?' + new URLSearchParams({ studentId: course.studentId, subject: course.subject, teachingCourse: course.id, teachingLesson: source.id,
    teachingPackage: snapshot.packageId, teachingVersion: String(snapshot.contentVersion), teachingFingerprint: snapshot.fingerprint });
}
export function teachingPracticeCourseHref(origin: TextbookTeachingPracticeOrigin, studentId: string, subject: Subject) {
  return '/studio?' + new URLSearchParams({ view: 'courses', course: origin.courseId, student: studentId, subject, courseLesson:origin.lessonId });
}
