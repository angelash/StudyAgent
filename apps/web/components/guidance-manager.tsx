'use client';
import * as React from 'react';
import type { GuidancePlanRevision, GuidancePlanView, ReviewTask } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import './guidance-manager.css';
import { GuidanceModelPanel } from './guidance-model-panel';

const send = <T,>(path: string, body?: unknown) => apiRequest<T>(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
const kindNames = { created: '建立计划', legacy: '开始保留历史', adjusted: '调整活动', status: '执行状态', retrospective: '确认复盘' };

export function GuidanceManager({ plan, onChange }: { plan: GuidancePlanView; onChange: (plan: GuidancePlanView) => void }) {
  const [editing, setEditing] = React.useState(false), [budget, setBudget] = React.useState(plan.minutesPerDay);
  const [actions, setActions] = React.useState(plan.actions.map(a => ({ actionId: a.id, activity: a.activity, minutes: a.minutes })));
  const [reason, setReason] = React.useState(''), [acknowledged, setAcknowledged] = React.useState(false);
  const [editVersion, setEditVersion] = React.useState(plan.revision ?? 1), [reportVersion, setReportVersion] = React.useState(plan.impact.currentReportVersion);
  const [history, setHistory] = React.useState<GuidancePlanRevision[] | null>(null), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const requestKey = React.useRef('');
  const requiresNewAssessment = !!(plan.impact.definitionChangedActionIds?.length || plan.impact.definitionUnverifiedActionIds?.length);
  React.useEffect(() => {
    let active = true;
    send<GuidancePlanView>(`/diagnostics/plans/${plan.id}`).then(p => { if (active) onChange(p); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [plan.id, onChange]);
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function changed() { requestKey.current = ''; }
  async function begin() {
    await run(async () => {
      const fresh = await send<GuidancePlanView>(`/diagnostics/plans/${plan.id}`); onChange(fresh);
      setBudget(fresh.minutesPerDay); setActions(fresh.actions.map(a => ({ actionId: a.id, activity: a.activity, minutes: a.minutes })));
      setEditVersion(fresh.revision ?? 1); setReportVersion(fresh.impact.currentReportVersion);
      setReason(''); setAcknowledged(false); setEditing(true); changed();
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      requestKey.current ||= crypto.randomUUID();
      const fresh = await send<GuidancePlanView>(`/diagnostics/plans/${plan.id}/adjust`, { expectedRevision: editVersion,
        requestKey: requestKey.current, minutesPerDay: budget, actions, reason, acknowledgeReportVersion: reportVersion });
      onChange(fresh); setEditing(false); setHistory(null); setNotice('调整已保存。已开始的练习保留当时的活动内容，复测时间继续保留。');
    });
  }
  return <section className="guidance-manager" aria-label="指导计划调整与历史">
    <div className="guidance-version"><span>第 {plan.revision ?? 1} 版</span><small>{plan.source === 'human' ? '家长调整' : plan.source === 'ai' ? 'AI 辅助说明' : '依据评测安排'} · {new Date(plan.createdAt).toLocaleDateString('zh-CN')}</small></div>
    {plan.impact && <div className={plan.impact.needsReview ? 'guidance-impact' : 'guidance-evidence'} role={plan.impact.needsReview ? 'status' : undefined}>
      <strong>{requiresNewAssessment ? '知识目标需要重新核对与评测。' : plan.impact.needsReview ? '评测有了修订，指导也要重新核对。' : '每次调整，都保留当时的依据。'}</strong>
      <p>{plan.impact.message}</p>{plan.impact.needsReview && <a href={requiresNewAssessment
        ? `/student/assessment?studentId=${plan.studentId}&subject=${plan.subject}`
        : `/student/assessment?studentId=${plan.studentId}&subject=${plan.subject}&session=${plan.baselineSessionId}`}>{requiresNewAssessment ? '重新确认范围与评测 ↗' : '查看修订后的报告 ↗'}</a>}
    </div>}
    {error && <p className="studio-error" role="alert">{error}</p>}{notice && <p role="status" className="studio-notice">{notice}</p>}
    <GuidanceModelPanel key={plan.id} plan={plan} onChange={value=>{onChange(value);setHistory(null);}}/>
    <div className="guidance-controls">{plan.status !== 'completed' && <button className="studio-secondary" disabled={busy || requiresNewAssessment || plan.impact.measurementRulesChanged} onClick={begin}>{plan.impact?.needsReview ? '核对依据并调整计划' : '调整时间与指导活动'}</button>}
      <button className="studio-text-button" disabled={busy} onClick={() => run(async () => setHistory(history ? null : await send<GuidancePlanRevision[]>(`/diagnostics/plans/${plan.id}/history`)))}>{history ? '收起历史' : '查看每次调整 ↗'}</button></div>
    {editing && <form className="guidance-edit" onSubmit={save}>
      <div className="guidance-edit-heading"><span className="studio-eyebrow">下一步，按实际情况调整</span><h3>让指导时间合适，也让每一步有依据。</h3><p>可调整当前知识目标的活动和时间。需要更换知识目标时，请根据最新评测建立新计划。</p></div>
      <label>每天学习几分钟<input type="number" min={5} max={60} required value={budget} onChange={e => { setBudget(Number(e.target.value)); changed(); }} /></label>
      {actions.map((action, index) => <fieldset key={action.actionId}><legend>{plan.actions.find(a => a.id === action.actionId)?.title}</legend>
        <label>这个活动用几分钟<input type="number" min={1} max={60} required value={action.minutes} onChange={e => { setActions(rows => rows.map((a, i) => i === index ? { ...a, minutes: Number(e.target.value) } : a)); changed(); }} /></label>
        <label>怎样陪孩子完成<textarea rows={4} minLength={5} maxLength={2500} required value={action.activity} onChange={e => { setActions(rows => rows.map((a, i) => i === index ? { ...a, activity: e.target.value } : a)); changed(); }} /></label>
      </fieldset>)}
      <p className={actions.reduce((s, a) => s + a.minutes, 0) === budget ? 'studio-muted' : 'guidance-budget-error'}>活动合计 {actions.reduce((s, a) => s + a.minutes, 0)} 分钟 / 每日预算 {budget} 分钟</p>
      <label>这次为什么调整<textarea rows={3} minLength={5} maxLength={1500} required placeholder="例如：孩子能说清步骤，但连续练习时间过长，先缩短每次活动再观察。" value={reason} onChange={e => { setReason(e.target.value); changed(); }} /></label>
      <label className="guidance-ack"><input type="checkbox" required checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /><span>我已查看当前评测依据，知道仍需通过独立新题和间隔复测验证。</span></label>
      <div className="guidance-controls"><button className="studio-primary" disabled={busy || !acknowledged || reason.trim().length < 5 || actions.reduce((s, a) => s + a.minutes, 0) !== budget}>保存为新版本</button><button type="button" className="studio-text-button" disabled={busy} onClick={() => setEditing(false)}>收起调整</button></div>
    </form>}
    {history && <div className="guidance-history">{history.length ? history.map(h => <details key={h.id}><summary><span>第 {h.revision} 版 · {kindNames[h.kind]}</span><small>{new Date(h.at).toLocaleString('zh-CN')}</small></summary><p>{h.reason}</p><p>每日 {h.snapshot.minutesPerDay} 分钟 · {h.snapshot.actions.length} 个活动</p>{h.snapshot.actions.map(a => <div key={a.id}><strong>{a.title} · {a.minutes} 分钟</strong><p>{a.activity}</p><small>{a.evidenceIds.length} 条评测依据</small></div>)}</details>) : <p>此历史计划尚未纳入版本记录。下一次调整开始保留快照。</p>}</div>}
  </section>;
}

export function ReviewScheduleEditor({ review, plan, onChange }: { review: ReviewTask; plan: GuidancePlanView; onChange: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false), [time, setTime] = React.useState(''), [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const requestKey = React.useRef('');
  if (review.status !== 'pending' || review.sessionId || plan.status === 'completed') return null;
  return <div className="guidance-schedule"><button className="studio-text-button" disabled={busy} onClick={() => { setOpen(!open); const d = new Date(review.dueAt); setTime(new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)); requestKey.current = ''; }}>调整复测时间</button>
    {open && <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try { requestKey.current ||= crypto.randomUUID(); await send(`/diagnostics/reviews/${encodeURIComponent(review.id)}/reschedule`, {
        expectedPlanRevision: plan.revision ?? 1, expectedScheduleRevision: review.scheduleRevision ?? 1, requestKey: requestKey.current,
        dueAt: new Date(time).toISOString(), reason }); await onChange(); setOpen(false); }
      catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
    }}><p>安排在未来 90 天内，保留原定测量间隔。已经开始的复测保留原安排。</p><label>复测时间<input type="datetime-local" required value={time} onChange={e => { setTime(e.target.value); requestKey.current = ''; }} /></label><label>调整原因<textarea required minLength={5} maxLength={1500} rows={2} value={reason} onChange={e => { setReason(e.target.value); requestKey.current = ''; }} /></label>{error && <p className="studio-error" role="alert">{error}</p>}<button className="studio-secondary" disabled={busy || reason.trim().length < 5}>保存复测时间</button></form>}
    {!!review.scheduleHistory?.length && <details><summary>时间调整记录（{review.scheduleHistory.length}）</summary>{review.scheduleHistory.map(h => <p key={h.revision}>{new Date(h.previousDueAt).toLocaleString('zh-CN')} → {new Date(h.dueAt).toLocaleString('zh-CN')}<br />{h.reason}</p>)}</details>}
  </div>;
}
