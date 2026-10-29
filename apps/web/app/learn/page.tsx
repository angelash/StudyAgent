import { redirect } from 'next/navigation';
import { legacyWorkspaceHref } from '../../lib/workspace-navigation';
export default async function LearnPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyWorkspaceHref('home', await searchParams));
}
