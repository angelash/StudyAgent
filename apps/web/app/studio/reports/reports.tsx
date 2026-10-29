'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Subject } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import { useSessionUser, type SessionUser } from '../../../lib/session-user';
import { learningContextIssue, readLearningContext, saveLearningContext, type LearningContext } from '../../../lib/learning-context';
import { subjectNames } from '../../../lib/learning';
import { StudioNavigation } from '../studio-navigation';
import { AssessmentStudio } from '../../student/assessment/studio';
import { workspaceHref } from '../../../lib/workspace-navigation';
import { FamilyStudio } from '../../parent/dashboard/studio';
import { ReportTabs } from './report-tabs';

type Child = { id: string; nickname: string; grade: number };
type SessionRow = { id: string; status: string; subject: Subject; startedAt: string; answeredCount: number; totalCount: number };
export function ReportsWorkspace() {
  const identity = useSessionUser();
  if (!identity) return <main className="learning-studio"><section className="workspace-page"><h1>学习报告</h1>{identity === undefined ? <p role="status">正在确认学习身份…</p> : <Link href="/parent/login">登录后查看自己的学习报告</Link>}</section></main>;
  return <ActorReports key={identity.id} identity={identity} />;
}
function ActorReports({ identity }: { identity: SessionUser }) {
  const search = useSearchParams(), searchKey = search.toString(), reportId = search.get('session');
  const [children, setChildren] = React.useState<Child[]>([]), [context, setContext] = React.useState<LearningContext | null>(null);
  const [rows, setRows] = React.useState<SessionRow[]>([]), [loading, setLoading] = React.useState(true), [error, setError] = React.useState(''), [retry, setRetry] = React.useState(0);
  const generation = React.useRef(0);
  React.useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    setRows([]); setContext(null); setChildren([]); setError(''); setLoading(true);
    const requested = readLearningContext(identity.id, '?' + searchKey), params = new URLSearchParams(searchKey);
    const issue = learningContextIssue('?' + searchKey);
    if (issue || identity.role === 'student' && requested.audience === 'self') { setError(issue ?? '学生学习身份不能进入成人独立学习。');setLoading(false);return () => controller.abort(); }
    if (reportId) { setLoading(false); return () => controller.abort(); }
    if (requested.audience === 'self') { setContext(requested); setLoading(false); return () => controller.abort(); }
    if (params.get('tab') === 'knowledge') { setLoading(false); return () => controller.abort(); }
    if (params.has('student') && params.has('studentId') && params.get('student') !== params.get('studentId')) {
      setError('链接中的学习档案不一致，请重新选择可用档案。'); setLoading(false); return () => controller.abort();
    }
    if (!(requested.subject in subjectNames)) { setError('这门学科不可用，请从工作台重新选择。'); setLoading(false); return () => controller.abort(); }
    apiRequest<Child[]>('/learning/students', { signal: controller.signal }).then(async list => {
      if (version !== generation.current || controller.signal.aborted) return;
      setChildren(list);
      const child = requested.studentId ? list.find(item => item.id === requested.studentId) : list[0];
      if (requested.studentId && !child) throw new Error('所选学习档案不可访问，请重新选择可用档案。');
      const selected = { studentId: child?.id, subject: requested.subject };
      setContext(selected);
      if (!child) return;
      saveLearningContext(identity.id, selected);
      const result = await apiRequest<SessionRow[]>('/diagnostics/sessions?' + new URLSearchParams({ studentId: child.id, subject: selected.subject }), { signal: controller.signal });
      if (version !== generation.current || controller.signal.aborted) return;
      setRows(result.filter(row => ['completed', 'aborted'].includes(row.status)));
    }).catch(caught => { if (version === generation.current && !controller.signal.aborted) { setRows([]); setError((caught as Error).message); } })
      .finally(() => { if (version === generation.current && !controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); };
  }, [identity.id, searchKey, reportId, retry]);
  if (reportId) return <AssessmentStudio key={reportId + ':' + (search.get('studentId') ?? search.get('student') ?? '') + ':' + search.get('subject')} reportOnly />;
  if (search.get('tab') === 'knowledge' && readLearningContext(identity.id, '?' + searchKey).audience !== 'self') return <FamilyStudio />;
  function select(next: LearningContext) { window.location.assign(workspaceHref('reports', next)); }
  return <main className="learning-studio"><StudioNavigation active="reports" context={context ?? undefined} />
    <section className="workspace-page"><h1>学习报告</h1><p className="workspace-page-intro">查看原测评、具体知识与待验证原因，再决定下一步。</p>{context?.audience !== 'self' && <ReportTabs active="sessions" context={context ?? undefined} />}
      {context?.audience === 'self' ? <><p>本人课程、对话和白板记录保留在学习历史中。儿童知识诊断报告按孩子档案分别查看。</p><Link className="workspace-button" href={workspaceHref('history', context)}>查看我的学习历史</Link></> : <>
        {children.length > 0 && context && <div className="workspace-page-controls"><label>学习档案<select aria-label="报告学习档案" disabled={identity.role === 'student'} value={context.studentId ?? ''} onChange={event => select({ ...context, studentId: event.target.value })}>{children.map(child => <option key={child.id} value={child.id}>{child.nickname} · {child.grade}年级</option>)}</select></label>
          <label>学科<select aria-label="报告学科" value={context.subject} onChange={event => select({ ...context, subject: event.target.value as Subject })}>{Object.entries(subjectNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>}
        {error && <div className="workspace-error" role="alert"><p>{error}</p><button className="workspace-button" onClick={() => setRetry(value => value + 1)}>重新读取</button> <Link href="/studio/reports?studentId=&subject=math">重新选择可用档案</Link></div>}
        {loading && <p role="status">正在取回当前档案的报告…</p>}
        {!loading && !error && !rows.length && <section><h2>{context?.studentId ? '还没有已完成的知识诊断报告' : '先选择一份学习档案'}</h2><p>只有实际测评和可用证据才形成报告。课程阅读与提示后的练习分别保存。</p><Link className="workspace-button" href={workspaceHref(context?.studentId ? 'assessment' : identity.role === 'student' ? 'home' : 'profiles', context ?? undefined)}>{context?.studentId ? '查看知识诊断' : identity.role === 'student' ? '返回学习首页' : '管理学习档案'}</Link></section>}
        {!loading && !error && rows.map(row => <article key={row.id} className="workspace-page-row"><div><h2>{subjectNames[row.subject]} · {row.status === 'aborted' ? '已结束的测评' : '测评报告'}</h2><p>{new Date(row.startedAt).toLocaleString('zh-CN')} · 已保存 {row.answeredCount} / {row.totalCount} 道作答</p></div><Link className="workspace-button" href={workspaceHref('reports', context ?? undefined) + '&session=' + encodeURIComponent(row.id)}>查看原报告</Link></article>)}
      </>}
    </section></main>;
}
