import { Suspense } from 'react';
import { ReportsWorkspace } from './reports';
export const metadata = { title: '学习报告 · StudyAgent' };
export default function ReportsPage() { return <Suspense fallback={<p role="status">正在打开学习报告…</p>}><ReportsWorkspace /></Suspense>; }
