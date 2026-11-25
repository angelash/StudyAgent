'use client';
import * as React from 'react';
import Link from 'next/link';
import type { SourceCourseEstimateSummary } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';

/** 232 §3.3: per-course estimate totals for one learner. Shown apart from formal knowledge-point results. */
export function LearnerCourseEstimates({ studentId }: { studentId: string }) {
  const [rows, setRows] = React.useState<SourceCourseEstimateSummary[] | null>(null), [error, setError] = React.useState('');
  React.useEffect(() => {
    const controller = new AbortController(); setRows(null); setError('');
    apiRequest<SourceCourseEstimateSummary[]>('/learning/source-courses/estimates?' + new URLSearchParams({ studentId }), { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setRows(value); })
      .catch(caught => { if (!controller.signal.aborted) setError((caught as Error).message); });
    return () => controller.abort();
  }, [studentId]);
  if (error) return <p className="workspace-estimates-note" role="alert">课程目标（估计）暂时无法读取：{error}</p>;
  if (!rows) return <p className="workspace-estimates-note" role="status">正在读取课程目标（估计）…</p>;
  if (!rows.length) return null;
  return <section className="workspace-estimates" aria-label="课程目标（估计）">
    <h3>课程目标（估计）</h3>
    <p className="workspace-estimates-note">按 AI 课程和资料课程的随堂题首次作答估计，不是知识点掌握度，也不进入正式测量。</p>
    <ul>{rows.map(row => <li key={row.courseId}>
      <Link href={'/studio/source-courses?' + new URLSearchParams({ course: row.courseId })}>{row.title}</Link>
      <span>{row.objectives} 个目标 · 估计已达成 {row.likelyMet} · 估计需巩固 {row.needsPractice} · 证据不足 {row.insufficient} · 未作答 {row.notAttempted}</span>
    </li>)}</ul>
  </section>;
}
