import { redirect } from 'next/navigation';

// Keep saved links working through the normal course library.
export default async function ChemistryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const old = await searchParams, query = new URLSearchParams({ view: 'courses', subject: 'chemistry', course: 'chemistry' });
  const student = old.studentId ?? old.student;
  if (typeof student === 'string') query.set('student', student);
  if (typeof old.unit === 'string') query.set('unit', old.unit);
  redirect('/studio?' + query);
}
