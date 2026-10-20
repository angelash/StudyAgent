'use client';
import * as React from 'react';
import Link from 'next/link';
import { StudyNav } from '../../../components/study-nav';
import { apiRequest } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import '../../student/gesp/gesp-student.css';

type Child = { id: string; nickname: string; grade: number };
type Task = { id: string; atomId: string; title: string; prompt: string; standard: string };
type Workspace = { scope: null | { level: number; atomIds: string[]; version: number }; notice: string; tasks: Task[]; availableTasks: Task[] };

export default function ParentGespPage() {
  const identity = useSessionUser(), [children, setChildren] = React.useState<Child[]>([]), [studentId, setStudentId] = React.useState('');
  const [workspace, setWorkspace] = React.useState<Workspace | null>(null), [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  React.useEffect(() => { if (!identity || identity.role !== 'parent') return; void apiRequest<Child[]>(`/parents/${identity.id}/students`).then(rows => {
    setChildren(rows); setStudentId(current => current || new URLSearchParams(window.location.search).get('studentId') || rows[0]?.id || '');
  }).catch(reason => setError((reason as Error).message)); }, [identity]);
  React.useEffect(() => { if (!studentId) { setWorkspace(null); return; } setBusy(true); setError('');
    void apiRequest<Workspace>(`/gesp/students/${studentId}/workspace`).then(result => { setWorkspace(result); setSelected(result.scope?.atomIds ?? []); })
      .catch(reason => setError((reason as Error).message)).finally(() => setBusy(false)); }, [studentId]);
  async function save() { if (!workspace || !selected.length) return; setBusy(true); setError(''); setNotice('');
    try { const result = await apiRequest(`/gesp/students/${studentId}/scope`, { method: 'PUT', body: JSON.stringify({ level: 1, atomIds: selected,
      requestKey: crypto.randomUUID(), reason: '家长依据当前原创试点题确认GESP独立学习范围' }) });
      setWorkspace({ ...workspace, scope: result as Workspace['scope'] }); setNotice('范围已确认。孩子需要使用独立学习码进入GESP编程工作台。'); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  if (identity === undefined) return <main className="learning-studio"><StudyNav current="family" /><div className="studio-empty">正在读取家长身份…</div></main>;
  if (!identity || !['parent', 'admin'].includes(identity.role)) return <main className="learning-studio"><StudyNav current="family" /><div className="studio-empty"><h1>需要家长身份</h1><p>GESP学习范围必须由监护人确认。</p><Link className="studio-primary" href="/parent/login">家长登录 ↗</Link></div></main>;
  return <main className="learning-studio gesp-page"><StudyNav current="family" /><div className="gesp-shell"><header><span className="studio-eyebrow">GESP / INDEPENDENT CERTIFICATION TRACK</span><h1>认证等级独立于年级，<br /><em>范围先由家长确认。</em></h1><p>当前只开放原创试点编程题。范围、作答、编译结果和历史分别保存；试点题不等于完整1～4级课程，也不作为小学三科教材进度。</p></header>
    {error && <div className="studio-error" role="alert">{error}</div>}{notice && <div className="studio-notice" role="status">{notice}</div>}
    <section className="gesp-panel"><label>学生<select value={studentId} onChange={event => setStudentId(event.target.value)}>{children.map(child => <option key={child.id} value={child.id}>{child.nickname} · {child.grade}年级</option>)}</select></label>
      {busy && !workspace ? <p role="status">正在读取GESP范围…</p> : workspace && <><div className="gesp-panel-head"><div><h2>一级原创试点范围</h2><p>{workspace.notice}</p></div><span className="studio-badge">v{workspace.scope?.version ?? 0}</span></div>
        <div className="gesp-task-grid">{workspace.availableTasks.map(task => <label key={task.id} className="gesp-task-card"><input type="checkbox" checked={selected.includes(task.atomId)} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, task.atomId])] : current.filter(id => id !== task.atomId))} /><span><small>{task.atomId}</small><strong>{task.title}</strong><p>{task.prompt}</p><em>{task.standard}</em></span></label>)}</div>
        <div className="gesp-actions"><button className="studio-primary" disabled={busy || !selected.length} onClick={() => void save()}>{busy ? '正在保存…' : '确认并保存范围'}</button><Link className="studio-secondary" href="/student/login">打开孩子学习入口 ↗</Link></div></>}
      {!children.length && <p>还没有孩子档案。请先在家长空间建立档案。</p>}</section>
    <section className="studio-hint"><strong>能力结论边界</strong><p>程序通过只说明当前隐藏测试通过。概念题、错误修复和陌生任务仍需分别留证；运行器不向页面返回隐藏测试和期望输出。</p></section>
  </div></main>;
}
