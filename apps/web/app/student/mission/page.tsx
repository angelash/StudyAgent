import { redirect } from 'next/navigation';
export default async function StudentMissionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams, query = new URLSearchParams();
  for (const key of ['studentId', 'subject']) if (typeof params[key] === 'string') query.set(key, params[key] as string);
  redirect('/student/today' + (query.size ? '?' + query : ''));
}
