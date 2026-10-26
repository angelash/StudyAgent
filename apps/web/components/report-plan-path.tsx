'use client';
import * as React from 'react';
import type { DiagnosticReport, GuidancePlanView, ReviewTask } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../lib/api';

export type ReportPlanRead = { ownerId: string; studentId: string; subject: string; phase: 'loading' | 'ready' | 'error' };
const statuses = { proposed: '待家长确认', active: '正在指导', paused: '已暂停', completed: '已完成' };
const reviewStatuses = { pending: '待复测', in_progress: '已开始', completed: '已完成' };
function dateLabel(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : '日期待核对'; }

export function ReportPlanPath({ ownerId, report, atomId, plans, currentPlan, read, onRetry, onOpenPlan, onAccessLost }: {
  ownerId: string; report: DiagnosticReport; atomId: string; plans: GuidancePlanView[]; currentPlan: GuidancePlanView | null;
  read: ReportPlanRead; onRetry: () => void; onOpenPlan?: (plan: GuidancePlanView) => void; onAccessLost: () => void;
}) {
  const phase = read.ownerId === ownerId && read.studentId === report.studentId && read.subject === report.subject ? read.phase : 'loading';
  const candidates = currentPlan ? [currentPlan, ...plans.filter(row => row.id !== currentPlan.id)] : plans;
  const plan = phase === 'ready' ? candidates.find(row => row.studentId === report.studentId && row.subject === report.subject && row.baselineSessionId === report.sessionId) : undefined;
  const scope = plan ? JSON.stringify([ownerId, report.studentId, report.subject, report.sessionId, report.version ?? 1, plan.id, plan.revision ?? 1]) : '';
  const [reviews, setReviews] = React.useState<{ scope: string; phase: 'loading' | 'ready' | 'error'; rows: ReviewTask[]; error: string; unavailable?: boolean }>({ scope: '', phase: 'loading', rows: [], error: '' });
  const [retry, setRetry] = React.useState(0), accessLost = React.useRef(onAccessLost); accessLost.current = onAccessLost;
  React.useEffect(() => {
    if (!plan || !scope) return;
    const request = new AbortController(); let alive = true, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; request.abort(); }, 15000);
    setReviews({ scope, phase: 'loading', rows: [], error: '' });
    void apiRequest<ReviewTask[]>('/diagnostics/plans/' + encodeURIComponent(plan.id) + '/reviews', { signal: request.signal }).then(rows => {
      if (!alive) return;
      if (request.signal.aborted) { if (timedOut) throw new Error('复测安排读取超时，请重试。'); return; }
      if (rows.some(row => row.planId !== plan.id || row.studentId !== report.studentId || row.subject !== report.subject)) throw new Error('复测记录与当前计划不一致，请重新读取。');
      setReviews({ scope, phase: 'ready', rows, error: '' });
    }).catch(error => {
      if (!alive || request.signal.aborted && !timedOut) return;
      if (error instanceof ApiRequestError && [401, 403].includes(error.status)) { accessLost.current(); return; }
      setReviews({ scope, phase: 'error', rows: [], unavailable: error instanceof ApiRequestError && error.status === 404, error: timedOut ? '复测安排读取超时，请重试。' : error instanceof Error ? error.message : '复测安排暂时未能读取。' });
    }).finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); request.abort(); };
  }, [scope, retry]);
  const current = reviews.scope === scope ? reviews : { phase: 'loading', rows: [] as ReviewTask[], error: '', unavailable: false };
  const actions = plan?.actions.filter(row => row.atomId === atomId) ?? [], tasks = current.rows.filter(row => row.atomId === atomId);
  return <section className="kr-plan" aria-label="本点指导与复测" data-plan-id={plan?.id}><h4>指导之后，怎样再验证</h4>
    {phase === 'loading' ? <p role="status">正在核对这份报告的指导记录…</p> : phase === 'error' ? <div role="alert"><p>指导记录暂时未能读取，还不能判断是否已有对应计划。</p><button className="studio-secondary" onClick={onRetry}>重新读取指导安排</button></div> : !plan ? <p>这份报告尚无对应的指导计划。家长可在报告下方制定计划，再确认指导活动与复测安排。</p> : current.unavailable ? <div role="alert"><p>这份计划当前无法读取，请重新核对指导记录。</p><button className="studio-secondary" onClick={onRetry}>重新读取指导安排</button></div> : <>
      <p><strong>{statuses[plan.status]}</strong> · 依据本报告第 {plan.baselineReportVersion ?? plan.impact.baselineReportVersion} 版制定{(plan.baselineReportVersion ?? plan.impact.baselineReportVersion) !== (report.version ?? 1) && `，当前报告为第 ${report.version ?? 1} 版`}</p>
      {plan.impact.needsReview && <p className="kr-caution">{plan.impact.message} 请先核对计划，再继续指导。</p>}
      {actions.length ? actions.map(action => <article key={action.id}><h5>{action.title}</h5><p>{action.activity}</p><p>每天安排：{action.minutes} 分钟</p><p><strong>成功标准：</strong>{action.successCriterion}</p></article>) : <p>这份计划没有单列本知识点的指导活动，可查看整份计划的优先安排。</p>}
      {current.phase === 'loading' ? <p role="status">正在读取原复测安排…</p> : current.phase === 'error' ? <div role="alert"><p>{current.error}</p><button className="studio-secondary" onClick={() => setRetry(value => value + 1)}>重试读取复测</button></div> : tasks.length ? <ul className="kr-review-list">{tasks.map(task => <li key={task.id}><strong>间隔 {task.intervalDays} 天</strong><span>{dateLabel(task.dueAt)}</span><span>{reviewStatuses[task.status]}</span></li>)}</ul> : <p>本点暂未列入这份计划的复测安排。</p>}
      <p>保持情况由实际间隔后的新题验证；安排了复测不等于已经保持。</p>
      {onOpenPlan && <button className="studio-secondary" onClick={() => onOpenPlan(plan)}>查看指导与复测 ↗</button>}
    </>}
    {phase === 'ready' && <button className="studio-text-button" onClick={onRetry}>刷新指导记录</button>}
  </section>;
}
