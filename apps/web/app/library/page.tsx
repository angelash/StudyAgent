import { redirect } from 'next/navigation';
import { legacyLibraryHref } from '../../lib/materials-navigation';
export const metadata = { title: '题卷资料库 · StudyAgent' };
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { redirect(legacyLibraryHref(await searchParams)); }
