'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ReviewTask, StudioCourse } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceHref } from '../../lib/workspace-navigation';

/**
 * 232 §4.2 step two: the 摸底 and 验证 tabs list this course's own assessment sessions and retests inline, instead of
 * only linking away. "This course" means the session covered at least one of the course's knowledge points.
 * Read-only: starting or answering still happens in the existing assessment page.
 */
type SessionRow = { id: string; intent: string; status: 'in_progress' | 'paused' | 'completed' | 'aborted'; startedAt: string;
  completedAt: string | null; answeredCount?: number; totalCount?: number; coverage?: Array<{ atomId: string }> };
const intentNames: Record<string, string> = { baseline: '摸底', unit: '单元核查', phase: '阶段核查', micro: '小测', verification: '原因核对', retest: '复测' };
const statusNames: Record<SessionRow['status'], string> = { in_progress: '作答中', paused: '已暂停', completed: '已完成', aborted: '已结束' };
const reviewNames: Record<ReviewTask['status'], string> = { pending: '待复测', in_progress: '复测中', completed: '已复测' };

function useCourseRecords(course: StudioCourse) {
  const [sessions, setSessions] = React.useState<SessionRow[] | null>(null), [reviews, setReviews] = React.useState<ReviewTask[] | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    const controller = new AbortController(), focus = new Set(course.focusAtomIds);
    setSessions(null); setReviews(null); setError('');
    const query = new URLSearchParams({ studentId: course.studentId, subject: course.subject });
    Promise.all([
      apiRequest<SessionRow[]>('/diagnostics/sessions?' + query, { signal: controller.signal }),
      apiRequest<ReviewTask[]>('/diagnostics/students/' + encodeURIComponent(course.studentId) + '/reviews?subject=' + course.subject, { signal: controller.signal }),
    ]).then(([sessionRows, reviewRows]) => {
      if (controller.signal.aborted) return;
      setSessions(sessionRows.filter(row => (row.coverage ?? []).some(item => focus.has(item.atomId))));
      setReviews(reviewRows.filter(row => focus.has(row.atomId)));
    }).catch(caught => { if (!controller.signal.aborted) setError((caught as Error).message); });
    return () => controller.abort();
  }, [course.id, course.studentId, course.subject, course.focusAtomIds.join(',')]);
  return { sessions, reviews, error };
}

function sessionHref(course: StudioCourse, row: SessionRow) {
  const params = new URLSearchParams({ studentId: course.studentId, subject: course.subject, session: row.id });
  return (row.status === 'completed' || row.status === 'aborted' ? '/studio/reports?' : '/studio/assessment?') + params;
}

function SessionList({ course, rows }: { course: StudioCourse; rows: SessionRow[] }) {
  if (!rows.length) return <p className="cl-loop-empty">这门课还没有相关的评测记录。</p>;
  return <ol className="cl-loop-records">{rows.slice(0, 8).map(row => <li key={row.id}>
    <span>{intentNames[row.intent] ?? row.intent}</span><b>{statusNames[row.status]}</b>
    <small>{new Date(row.completedAt ?? row.startedAt).toLocaleDateString('zh-CN')}{row.totalCount ? ` · ${row.answeredCount ?? 0}/${row.totalCount} 题` : ''}</small>
    <Link href={sessionHref(course, row)}>{row.status === 'completed' || row.status === 'aborted' ? '查看报告' : '继续作答'} →</Link>
  </li>)}</ol>;
}

export function CourseBaselineRecords({ course }: { course: StudioCourse }) {
  const { sessions, error } = useCourseRecords(course);
  if (error) return <p className="cl-loop-empty" role="alert">评测记录暂时无法读取：{error}</p>;
  if (!sessions) return <p className="cl-loop-empty" role="status">正在读取本课评测记录…</p>;
  return <section className="cl-loop-section" aria-label="本课摸底记录"><h3>本课摸底记录</h3>
    <SessionList course={course} rows={sessions.filter(row => row.intent === 'baseline')} /></section>;
}

export function CourseVerificationRecords({ course }: { course: StudioCourse }) {
  const { sessions, reviews, error } = useCourseRecords(course);
  if (error) return <p className="cl-loop-empty" role="alert">验证记录暂时无法读取：{error}</p>;
  if (!sessions || !reviews) return <p className="cl-loop-empty" role="status">正在读取本课验证记录…</p>;
  const now = Date.now(), upcoming = reviews.filter(row => row.status !== 'completed').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return <>
    <section className="cl-loop-section" aria-label="本课复测安排"><h3>复测安排</h3>
      {!upcoming.length ? <p className="cl-loop-empty">目前没有待做的复测。制定指导计划后，会按 1、3、7、14 天安排。</p> :
        <ol className="cl-loop-records">{upcoming.slice(0, 8).map(row => <li key={row.id}>
          <span>{row.intervalDays} 天复测</span><b>{Date.parse(row.dueAt) <= now ? '已到期' : reviewNames[row.status]}</b>
          <small>{new Date(row.dueAt).toLocaleDateString('zh-CN')}</small>
          <Link href={workspaceHref('tasks', { studentId: course.studentId, subject: course.subject })}>去复测 →</Link>
        </li>)}</ol>}
    </section>
    <section className="cl-loop-section" aria-label="本课核查与复测记录"><h3>核查与复测记录</h3>
      <SessionList course={course} rows={sessions.filter(row => row.intent !== 'baseline')} /></section>
  </>;
}
