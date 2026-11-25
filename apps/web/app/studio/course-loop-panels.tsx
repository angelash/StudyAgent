'use client';
import * as React from 'react';
import Link from 'next/link';
import type { MasteryEstimate, StudioCourse } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { workspaceHref } from '../../lib/workspace-navigation';
import { CourseBaselineRecords, CourseVerificationRecords } from './course-loop-records';
import './course-assessments.css';
import './course-loop-panels.css';

/**
 * 232 §4.2 step one: the 摸底 and 验证 tabs show this course's own formal results and link into the existing
 * assessment, report and task pages with the course context. Nothing here writes or starts anything.
 */
const statusNames: Record<MasteryEstimate['status'], string> = { unknown: '未知', insufficient: '证据不足', learning: '学习中', fragile: '不稳固', secure: '稳固' };
type Profile = { estimates: MasteryEstimate[] };

function useCourseEstimates(course: StudioCourse) {
  const [rows, setRows] = React.useState<MasteryEstimate[] | null>(null), [error, setError] = React.useState('');
  React.useEffect(() => {
    const controller = new AbortController(); setRows(null); setError('');
    apiRequest<Profile>('/diagnostics/students/' + encodeURIComponent(course.studentId) + '/profile?subject=' + course.subject, { signal: controller.signal })
      .then(profile => { if (!controller.signal.aborted) { const focus = new Set(course.focusAtomIds); setRows(profile.estimates.filter(row => focus.has(row.atomId))); } })
      .catch(caught => { if (!controller.signal.aborted) setError((caught as Error).message); });
    return () => controller.abort();
  }, [course.id, course.studentId, course.subject, course.focusAtomIds.join(',')]);
  return { rows, error };
}

export function CourseBaselinePanel({ course, children }: { course: StudioCourse; children?: React.ReactNode }) {
  const { rows, error } = useCourseEstimates(course), context = { studentId: course.studentId, subject: course.subject };
  const counts = (rows ?? []).reduce<Record<string, number>>((sum, row) => ({ ...sum, [row.status]: (sum[row.status] ?? 0) + 1 }), {});
  return <section className="cl-card cl-loop-panel" aria-label="课程摸底">
    <h2>摸底：从哪里讲起</h2>
    <p>开课前用独立题目核对这门课的 {course.focusAtomIds.length} 个知识点。没有证据的显示为「未知」，不当作薄弱。</p>
    {error ? <p role="alert">{error}</p> : !rows ? <p role="status">正在读取这门课的测量结果…</p> :
      <ul className="cl-loop-counts">{(['secure', 'fragile', 'learning', 'insufficient', 'unknown'] as const).map(status => <li key={status} data-status={status}><b>{counts[status] ?? 0}</b><span>{statusNames[status]}</span></li>)}</ul>}
    {children}
    <CourseBaselineRecords course={course} />
    <Link className="cl-course-action" href={workspaceHref('assessment', context)}>打开知识诊断 →</Link>
  </section>;
}

export function CourseVerificationPanel({ course, children }: { course: StudioCourse; children?: React.ReactNode }) {
  const { rows, error } = useCourseEstimates(course), context = { studentId: course.studentId, subject: course.subject };
  const measured = (rows ?? []).filter(row => row.status !== 'unknown' && row.status !== 'insufficient');
  const retained = measured.filter(row => row.retentionVerified).length, transferred = measured.filter(row => row.transferVerified).length;
  return <section className="cl-card cl-loop-panel" aria-label="课程验证">
    <h2>验证：学会了没有</h2>
    <p>讲完后由独立考核、迁移题和 1、3、7、14 天复测核对。阅读与随堂练习只记作学习过程，不直接算作掌握。</p>
    {error ? <p role="alert">{error}</p> : !rows ? <p role="status">正在读取这门课的测量结果…</p> :
      <ul className="cl-loop-counts"><li><b>{measured.length}</b><span>已有正式证据</span></li><li><b>{transferred}</b><span>迁移已核对</span></li><li><b>{retained}</b><span>延迟复测已核对</span></li></ul>}
    {children}
    <CourseVerificationRecords course={course} />
    <nav className="cl-loop-links" aria-label="验证入口">
      <Link className="cl-course-action" href={workspaceHref('reports', context)}>查看学习报告 →</Link>
      <Link className="cl-course-action" href={workspaceHref('tasks', context)}>补练与到期复测 →</Link>
    </nav>
  </section>;
}
