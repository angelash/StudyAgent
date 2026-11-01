import { redirect } from 'next/navigation';

// Keep saved links working through the normal course library. Both learner aliases and any old subject
// are forwarded unchanged, so the workspace rejects an ambiguous link instead of silently choosing one.
export default async function ChemistryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const old = await searchParams, query = new URLSearchParams({ view: 'courses', subject: 'chemistry', course: 'chemistry' });
  for (const key of ['subject', 'student', 'studentId']) {
    const value = old[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  if (typeof old.unit === 'string') query.set('unit', old.unit);
  redirect('/studio?' + query);
}
