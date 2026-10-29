import { redirect } from 'next/navigation';
import { legacyWorkspaceHref } from '../../../lib/workspace-navigation';
export default async function StudentKnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyWorkspaceHref('reports', await searchParams));
}
