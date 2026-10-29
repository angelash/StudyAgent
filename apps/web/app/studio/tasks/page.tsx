import { Suspense } from 'react';
import { TasksWorkspace } from './tasks';
export const metadata = { title: '学习任务 · StudyAgent' };
export default function TasksPage() { return <Suspense fallback={<p role="status">正在打开学习任务…</p>}><TasksWorkspace /></Suspense>; }
