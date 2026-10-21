'use client';
import * as React from 'react';
import Link from 'next/link';
import { StudyNav } from '../../../components/study-nav';
import { apiRequest } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import '../../student/gesp/gesp-student.css';

type Child = { id: string; nickname: string; grade: number };
type Task = { id: string; atomId: string; title: string; prompt: string; standard: string; reviewStatus: 'original_authored_pilot' | 'instructional_approved' };
type Capability = { atomId: string; state: string; dimensions: Array<{ dimension: string; status: string; attempts: number }>; hypothesis: string; nextAction: string };
type Plan = { id: string; status: string; version: number; minutesPerDay: number; totalActionMinutes: number; deferredAtomIds: string[]; actions: Array<{ id: string; atomId: string; title: string; activity: string; successCriterion: string; dimensionGaps: string[] }> };
type Review = { id: string; atomId: string; stageDay: number; dueAt: string; status: string; due: boolean };
type Workspace = { scope: null | { level: number; atomIds: string[]; version: number }; notice: string; tasks: Task[]; availableTasks: Task[];
  capabilities: Capability[]; guidancePlans: Plan[]; reviewTasks: Review[] };

export default function ParentGespPage() {
  const identity = useSessionUser(), [children, setChildren] = React.useState<Child[]>([]), [studentId, setStudentId] = React.useState('');
  const [workspace, setWorkspace] = React.useState<Workspace | null>(null), [selected, setSelected] = React.useState<string[]>([]);
  const [level, setLevel] = React.useState(1);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  React.useEffect(() => { if (!identity || identity.role !== 'parent') return; void apiRequest<Child[]>(`/parents/${identity.id}/students`).then(rows => {
    setChildren(rows); setStudentId(current => current || new URLSearchParams(window.location.search).get('studentId') || rows[0]?.id || '');
  }).catch(reason => setError((reason as Error).message)); }, [identity]);
  React.useEffect(() => { if (!studentId) { setWorkspace(null); return; } setBusy(true); setError('');
    void apiRequest<Workspace>(`/gesp/students/${studentId}/workspace`).then(result => { setWorkspace(result); setSelected(result.scope?.atomIds ?? []);
      setLevel(result.scope?.level ?? 1); })
      .catch(reason => setError((reason as Error).message)).finally(() => setBusy(false)); }, [studentId]);
  async function save() { if (!workspace || !selected.length) return; setBusy(true); setError(''); setNotice('');
    try { const result = await apiRequest(`/gesp/students/${studentId}/scope`, { method: 'PUT', body: JSON.stringify({ level, atomIds: selected,
      requestKey: crypto.randomUUID(), reason: '家长依据当前原创试点题确认GESP独立学习范围' }) });
      setWorkspace({ ...workspace, scope: result as Workspace['scope'] }); setNotice('范围已确认。孩子需要使用独立学习码进入GESP编程工作台。'); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  async function createPlan() { if (!workspace?.scope) return; setBusy(true); setError(''); setNotice('');
    try { const plan = await apiRequest<Plan>('/gesp/guidance-plans', { method: 'POST', body: JSON.stringify({ studentId,
      scopeVersion: workspace.scope.version, minutesPerDay: 20, requestKey: crypto.randomUUID(), reason: '家长依据现有GESP独立证据生成待确认指导计划' }) });
      setWorkspace({ ...workspace, guidancePlans: [plan, ...workspace.guidancePlans] }); setNotice('规则指导计划已生成，请核对证据和目标后确认启用。'); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  async function decidePlan(plan: Plan) { setBusy(true); setError(''); setNotice('');
    try { await apiRequest(`/gesp/guidance-plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active',
      expectedVersion: plan.version, requestKey: crypto.randomUUID(), reason: '家长核对知识点、活动、成功标准与每日时长后确认启用' }) });
      setWorkspace(await apiRequest<Workspace>(`/gesp/students/${studentId}/workspace`)); setNotice('指导计划已启用，孩子工作台可以查看下一步。'); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  if (identity === undefined) return <main className="learning-studio"><StudyNav current="family" /><div className="studio-empty">正在读取家长身份…</div></main>;
  if (!identity || !['parent', 'admin'].includes(identity.role)) return <main className="learning-studio"><StudyNav current="family" /><div className="studio-empty"><h1>需要家长身份</h1><p>GESP学习范围必须由监护人确认。</p><Link className="studio-primary" href="/parent/login">家长登录 ↗</Link></div></main>;
  return <main className="learning-studio gesp-page"><StudyNav current="family" /><div className="gesp-shell"><header><span className="studio-eyebrow">GESP / INDEPENDENT CERTIFICATION TRACK</span><h1>认证等级独立于年级，<br /><em>范围先由家长确认。</em></h1><p>当前只开放原创试点编程题。范围、作答、编译结果和历史分别保存；试点题不等于完整1～4级课程，也不作为小学三科教材进度。</p></header>
    {error && <div className="studio-error" role="alert">{error}</div>}{notice && <div className="studio-notice" role="status">{notice}</div>}
    <section className="gesp-panel"><label>学生<select value={studentId} onChange={event => setStudentId(event.target.value)}>{children.map(child => <option key={child.id} value={child.id}>{child.nickname} · {child.grade}年级</option>)}</select></label>
      {busy && !workspace ? <p role="status">正在读取GESP范围…</p> : workspace && <><div className="gesp-panel-head"><div><h2>认证{level}级原创试点范围</h2><p>{workspace.notice}</p></div><span className="studio-badge">v{workspace.scope?.version ?? 0}</span></div>
        <label>认证等级<select value={level} onChange={event => { setLevel(Number(event.target.value)); setSelected(current => current.filter(id => id.startsWith(`gesp-cpp.l${event.target.value}.`))); }}>{[1,2,3,4].map(value => <option key={value} value={value}>{value}级</option>)}</select></label>
        <div className="gesp-task-grid">{workspace.availableTasks.filter(task => task.atomId.startsWith(`gesp-cpp.l${level}.`)).map(task => <label key={task.id} className="gesp-task-card"><input type="checkbox" checked={selected.includes(task.atomId)} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, task.atomId])] : current.filter(id => id !== task.atomId))} /><span><small>{task.atomId}</small><strong>{task.title}</strong><p>{task.prompt}</p><em>{task.standard} · {task.reviewStatus === 'instructional_approved' ? '教研内容已审核' : '原创试点 · 尚未内容审核'}</em></span></label>)}</div>
        <div className="gesp-actions"><button className="studio-primary" disabled={busy || !selected.length} onClick={() => void save()}>{busy ? '正在保存…' : '确认并保存范围'}</button><Link className="studio-secondary" href="/student/login">打开孩子学习入口 ↗</Link></div></>}
      {!children.length && <p>还没有孩子档案。请先在家长空间建立档案。</p>}</section>
    {workspace && <section className="gesp-panel"><div className="gesp-panel-head"><div><h2>证据到下一步</h2><p>规则根据当前独立证据生成活动；计划必须由家长确认后孩子才能看到。提示后通过和到期复测分别留证。</p></div><button className="studio-primary" disabled={busy || !workspace.scope} onClick={() => void createPlan()}>生成待确认计划</button></div>
      {!!workspace.capabilities.length && <div className="gesp-task-grid">{workspace.capabilities.map(item => <article key={item.atomId} className="gesp-task-card"><small>{item.atomId} · {item.state}</small><strong>{item.dimensions.map(dimension => `${dimension.dimension}:${dimension.status}`).join(' · ')}</strong><p>{item.hypothesis}</p><em>{item.nextAction}</em></article>)}</div>}
      {!!workspace.guidancePlans.length && <div>{workspace.guidancePlans.map(plan => <article key={plan.id} className="studio-notice"><strong>{plan.status === 'active' ? '已启用' : plan.status === 'awaiting_confirmation' ? '等待家长确认' : '已完成'} · v{plan.version}</strong><p>每天预算 {plan.minutesPerDay} 分钟，本轮安排 {plan.totalActionMinutes} 分钟；{plan.actions.length} 个知识点行动{plan.deferredAtomIds.length ? `，另有 ${plan.deferredAtomIds.length} 个点延后到下一轮` : ''}。</p>{plan.actions.map(action => <details key={action.id}><summary>{action.title}</summary><p>{action.activity}</p><p>成功标准：{action.successCriterion}</p><small>待补维度：{action.dimensionGaps.join('、') || '延迟保持'}</small></details>)}{plan.status === 'awaiting_confirmation' && <button className="studio-primary" disabled={busy} onClick={() => void decidePlan(plan)}>核对并启用计划</button>}</article>)}</div>}
      {!!workspace.reviewTasks.length && <details><summary>间隔复测队列</summary>{workspace.reviewTasks.map(review => <p key={review.id}>{review.atomId} · 第{review.stageDay}天 · {review.status} · {new Date(review.dueAt).toLocaleString('zh-CN')}</p>)}</details>}
    </section>}
    <section className="studio-hint"><strong>能力结论边界</strong><p>程序通过只说明当前隐藏测试通过。概念题、错误修复和陌生任务仍需分别留证；运行器不向页面返回隐藏测试和期望输出。</p></section>
  </div></main>;
}
