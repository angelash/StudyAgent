import { isPaperReviewDate, type PaperReviewScope } from '@study-agent/contracts';

/** Only a local calendar location can become a return link on a private question. */
export function paperCalendarReturn(value: string | null): string | null {
  if (!value || value.length > 2048 || !value.startsWith('/studio?') || value.includes('\\')) return null;
  const url = new URL(value, 'https://study.invalid');
  if (url.origin !== 'https://study.invalid' || url.pathname !== '/studio' || url.searchParams.get('view') !== 'calendar') return null;
  const params = new URLSearchParams({ view: 'calendar' });
  for (const key of ['student', 'subject', 'date', 'mode', 'tasks', 'reviewScope']) {
    const input = url.searchParams.get(key); if (!input) continue;
    if (key === 'student' && input.length <= 180 || key === 'subject' && ['math', 'chinese', 'english'].includes(input) ||
      key === 'date' && isPaperReviewDate(input) || key === 'mode' && ['week', 'month'].includes(input) ||
      key === 'tasks' && ['confirmed', 'pending'].includes(input) || key === 'reviewScope' && ['mine', 'learner'].includes(input)) params.set(key, input);
  }
  return '/studio?' + params.toString();
}

export function paperReviewCalendarHref(studentId: string, scope: PaperReviewScope, date: string): string {
  return '/studio?' + new URLSearchParams({ view: 'calendar', reviewScope: scope,
    ...(studentId ? { student: studentId } : {}), ...(isPaperReviewDate(date) ? { date } : {}) });
}

export function paperCalendarItemHref(href: string, location: string): string {
  const target = new URL(href, 'https://study.invalid'), back = paperCalendarReturn(location);
  if (back) target.searchParams.set('calendarReturn', back);
  return target.pathname + target.search;
}
