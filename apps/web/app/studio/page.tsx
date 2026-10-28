import { LearningStudio } from './studio';
import { Suspense } from 'react';
export const metadata = { title: '学习工作台 · StudyAgent' };
export default function StudioPage() { return <Suspense fallback={<p role="status">正在打开学习工作台…</p>}><LearningStudio /></Suspense>; }
