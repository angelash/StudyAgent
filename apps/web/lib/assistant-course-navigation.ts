import type { AssistantCourseKind, AssistantTeachingSelection, StudioSubject } from '@study-agent/contracts';

export const assistantNavigationKeys = ['audience', 'lectureCourse', 'lecture', 'lectureVersion', 'courseKind', 'courseId', 'courseItem', 'courseVersion',
  'courseSelection', 'assistantSourceSession', 'assistantSourceKey', 'assistantSourceMessage', 'courseScope'] as const;

export function copyAssistantContext(from: URLSearchParams, to: URLSearchParams) {
  for (const key of assistantNavigationKeys) if (from.has(key)) to.set(key, from.get(key)!);
  return to;
}

export function courseAssistantHref(kind: AssistantCourseKind, courseId: string, itemId: string,
  studentId: string | null, subject: StudioSubject | null, selection?: AssistantTeachingSelection) {
  const query = new URLSearchParams({ view: 'home', mode: 'instant', audience: 'course', courseKind: kind, courseId, courseItem: itemId });
  if (studentId) query.set('student', studentId);
  if (subject) query.set('subject', subject);
  if (!studentId) query.set('courseScope', 'adult');
  if (selection) query.set('courseSelection', JSON.stringify(selection));
  return '/studio?' + query;
}

export function internalAssistantHref(href: unknown) {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return null;
  try { const url = new URL(href, 'https://study.invalid');
    return url.origin === 'https://study.invalid' && (/^\/studio(?:\/source-courses|\/classroom)?$/.test(url.pathname) || /^\/(student|parent)\//.test(url.pathname)) ? url.pathname + url.search + url.hash : null;
  } catch { return null; }
}
