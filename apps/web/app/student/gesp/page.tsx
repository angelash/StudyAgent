'use client';
import * as React from 'react';
import Link from 'next/link';
import { StudyNav } from '../../../components/study-nav';
import { apiRequest } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import './gesp-student.css';

type Task = { id: string; atomId: string; title: string; prompt: string; language: 'cpp'; standard: 'C++17'; timeLimitSeconds: number; memoryLimitMiB: number };
type Receipt = { id: string; status: string; sourceSha256: string; createdAt: string; compilePassed: boolean; tests: Array<{ index: number; status: string; passed: boolean; durationMs: number }> };
type Workspace = { scope: null | { level: number; atomIds: string[]; version: number }; notice: string; tasks: Task[]; submissions: Receipt[] };
const starter = '#include <iostream>\nusing namespace std;\n\nint main() {\n    // 从标准输入读取数据，向标准输出写答案。\n    return 0;\n}\n';

export default function StudentGespPage() {
  const identity = useSessionUser(), [workspace, setWorkspace] = React.useState<Workspace | null>(null), [taskId, setTaskId] = React.useState('');
  const [source, setSource] = React.useState(starter), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [receipt, setReceipt] = React.useState<Receipt | null>(null);
  const requestKey = React.useRef(crypto.randomUUID()), studentId = identity?.role === 'student' ? identity.studentId ?? '' : '';
  React.useEffect(() => { if (!studentId) return; setBusy(true); void apiRequest<Workspace>(`/gesp/students/${studentId}/workspace`).then(result => {
    setWorkspace(result); setTaskId(current => current || result.tasks[0]?.id || ''); }).catch(reason => setError((reason as Error).message)).finally(() => setBusy(false)); }, [studentId]);
  const task = workspace?.tasks.find(row => row.id === taskId);
  async function submit() { if (!task) return; setBusy(true); setError(''); setReceipt(null);
    try { const result = await apiRequest<Receipt>('/gesp/code-submissions', { method: 'POST', body: JSON.stringify({ studentId, atomId: task.atomId,
      source, requestKey: requestKey.current }) }); setReceipt(result); setWorkspace(await apiRequest<Workspace>(`/gesp/students/${studentId}/workspace`)); requestKey.current = crypto.randomUUID(); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  if (identity === undefined) return <main className="learning-studio"><StudyNav current="today" /><div className="studio-empty">正在读取学习身份…</div></main>;
  if (!studentId) return <main className="learning-studio"><StudyNav current="today" /><div className="studio-empty"><h1>请先使用独立学习码进入</h1><Link className="studio-primary" href="/student/login">打开学习入口 ↗</Link></div></main>;
  return <main className="learning-studio gesp-page"><StudyNav current="today" /><div className="gesp-shell"><header><span className="studio-eyebrow">GESP C++ / ISOLATED PRACTICE</span><h1>先写清楚，<br /><em>再让隔离运行器核对。</em></h1><p>这里只显示家长已确认的原创试点范围。隐藏测试与期望输出不会出现在题目或结果里；编译失败、错误输出和超时分别记录。</p></header>
    {error && <div className="studio-error" role="alert">{error}</div>}
    {!workspace ? <div className="studio-empty" role="status">正在读取编程范围…</div> : !workspace.scope || !workspace.tasks.length ? <div className="studio-empty"><h2>还没有确认GESP编程范围</h2><p>请家长先选择当前原创试点题，再由孩子使用独立学习码进入。</p><Link className="studio-secondary" href="/parent/gesp">家长打开GESP范围 ↗</Link></div> : <section className="gesp-panel"><div className="gesp-panel-head"><div><h2>一级原创试点</h2><p>{workspace.notice}</p></div><span className="studio-badge">范围 v{workspace.scope.version}</span></div>
      <div className="gesp-work-grid"><aside><label>本次任务<select value={taskId} onChange={event => { setTaskId(event.target.value); setReceipt(null); setSource(starter); requestKey.current = crypto.randomUUID(); }}>{workspace.tasks.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>{task && <article className="gesp-brief"><small>{task.atomId} · {task.standard}</small><h3>{task.title}</h3><p>{task.prompt}</p><p>墙钟 {task.timeLimitSeconds} 秒 · 内存 {task.memoryLimitMiB} MiB · 隐藏测试最多40组</p></article>}<details><summary>运行边界</summary><p>程序在独立Linux命名空间中编译和运行，无法读取 Windows 盘符与用户目录，也没有网络。</p></details></aside>
        <section className="gesp-editor"><label>源代码<textarea aria-label="GESP C++源代码" spellCheck={false} value={source} onChange={event => { setSource(event.target.value); setReceipt(null); requestKey.current = crypto.randomUUID(); }} /></label><div className="gesp-actions"><small>首次提交独立作答；相同提交键只保存一条记录。</small><button className="studio-primary" disabled={busy || !source.trim()} onClick={() => void submit()}>{busy ? '隔离编译与测试中…' : '提交并运行 →'}</button></div></section></div>
      {receipt && <section className={`gesp-result result-${receipt.status}`} aria-live="polite"><span className="studio-eyebrow">RUN RECEIPT</span><h2>{receipt.status === 'passed' ? '当前隐藏测试全部通过' : receipt.compilePassed ? '程序运行结果仍需修正' : '编译没有通过'}</h2><p>源码哈希 {receipt.sourceSha256.slice(0, 16)}… · {new Date(receipt.createdAt).toLocaleString('zh-CN')}</p><div className="gesp-test-grid">{receipt.tests.map(test => <span key={test.index} data-status={test.status}>测试 {test.index + 1}<strong>{test.status}</strong><small>{test.durationMs}ms</small></span>)}</div><p>通过当前测试集只证明这些边界；它不能单独证明陌生任务迁移或完整课程掌握。</p></section>}
      {!!workspace.submissions.length && <section><h2>最近提交</h2><div className="gesp-history">{workspace.submissions.slice(0, 8).map(row => <article key={row.id}><span data-status={row.status}>{row.status}</span><div><strong>{row.tests.filter(test => test.passed).length} / {row.tests.length} 组通过</strong><small>{new Date(row.createdAt).toLocaleString('zh-CN')} · {row.sourceSha256.slice(0, 16)}…</small></div></article>)}</div></section>}
    </section>}</div></main>;
}
