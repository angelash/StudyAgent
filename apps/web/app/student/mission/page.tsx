import { redirect } from 'next/navigation';

// Forward every value of both learner aliases and the subject; the task page rejects ambiguous links itself.
export default async function StudentMissionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams, query = new URLSearchParams();
  for (const key of ['student', 'studentId', 'subject']) {
    const value = params[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  redirect('/student/today' + (query.size ? '?' + query : ''));
}
