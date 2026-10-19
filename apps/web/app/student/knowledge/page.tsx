import { redirect } from 'next/navigation';
export default async function StudentKnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams, query = new URLSearchParams();
  for (const key of ['studentId', 'subject']) if (typeof params[key] === 'string') query.set(key, params[key] as string);
  redirect('/parent/dashboard' + (query.size ? '?' + query : ''));
}
