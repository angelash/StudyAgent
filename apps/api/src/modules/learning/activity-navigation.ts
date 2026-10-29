import type { ActivityNavigationContext, StudioSubject } from '@study-agent/contracts';

type CourseScope = { studentId: string | null; subject: StudioSubject | null };
const subjects: readonly string[] = ['math', 'chinese', 'english', 'chemistry'];

/** Course rows and frozen lesson links are server-owned; never pass request query fields here. */
export function activityNavigationContext(studentId: string | null, course?: CourseScope, frozenVerificationHref?: string): ActivityNavigationContext {
  if (course && course.studentId !== studentId) return { audience: 'unavailable' };
  if (!studentId) return { audience: 'independent' };
  if (course?.subject && subjects.includes(course.subject)) return { audience: 'student', studentId, subject: course.subject };
  if (frozenVerificationHref?.startsWith('/') && !frozenVerificationHref.startsWith('//') && !/[\\\u0000-\u0020\u007f]/.test(frozenVerificationHref)) {
    try {
      const url = new URL(frozenVerificationHref, 'https://study.invalid'), params = url.searchParams;
      const values = [params.get('student'), params.get('studentId')].filter(value => value !== null);
      if (url.origin === 'https://study.invalid' && ['/student/assessment', '/studio/assessment'].includes(url.pathname) &&
          values.length > 0 && values.every(value => value === studentId) &&
          ['student', 'studentId', 'subject'].every(key => new Set(params.getAll(key)).size <= 1) && subjects.includes(params.get('subject') ?? '') &&
          params.get('courseScope') !== 'adult' && params.get('audience') !== 'independent') {
        return { audience: 'student', studentId, subject: params.get('subject') as StudioSubject };
      }
    } catch { /* An invalid historical link does not change access to the preserved activity. */ }
  }
  return { audience: 'unavailable' };
}
