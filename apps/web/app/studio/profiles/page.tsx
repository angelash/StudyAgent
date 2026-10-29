import { Suspense } from 'react';
import { ProfilesWorkspace } from './profiles';
export const metadata = { title: '学习档案 · StudyAgent' };
export default function ProfilesPage() { return <Suspense fallback={<p role="status">正在打开学习档案…</p>}><ProfilesWorkspace /></Suspense>; }
