'use client';
import * as React from 'react';
import Link from 'next/link';
import { StudyNav } from '../../../components/study-nav';
import { apiRequest } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import './gesp-student.css';

type Probe = { id: string; dimension: 'understanding' | 'procedure'; prompt: string; options: string[] };
type Task = { id: string; atomId: string; title: string; prompt: string; language: 'cpp'; standard: 'C++17'; timeLimitSeconds: number; memoryLimitMiB: number; probes: Probe[]; reviewStatus: 'original_authored_pilot' | 'instructional_approved' };
type Receipt = { id: string; status: string; sourceSha256: string; createdAt: string; compilePassed: boolean;
  compileDiagnostics: string[]; runtimeDiagnostics: Array<{ index: number; status: string; stderr: string }>;
  tests: Array<{ index: number; status: string; passed: boolean; durationMs: number }>; hintLevel: number; independent: boolean; reviewTaskId: string | null };
type Capability = { atomId: string; state: string; dimensions: Array<{ dimension: string; status: string; attempts: number }>; hypothesis: string; nextAction: string };
type Hint = { id: string; taskId: string; level: number; text: string; revealsAnswer: false; createdAt: string };
type Review = { id: string; atomId: string; taskId: string; stageDay: number; dueAt: string; status: string; due: boolean; attemptCount: number };
type Plan = { id: string; status: string; version: number; minutesPerDay: number; actions: Array<{ id: string; atomId: string; title: string; activity: string; successCriterion: string; dimensionGaps: string[] }> };
type Workspace = { scope: null | { level: number; atomIds: string[]; version: number }; notice: string; tasks: Task[]; submissions: Receipt[];
  probeSubmissions: Array<{ id: string; probeId: string; status: string; analysis: string }>; hintEvents: Hint[];
  guidancePlans: Plan[]; reviewTasks: Review[]; capabilities: Capability[] };
const starter = '#include <iostream>\nusing namespace std;\n\nint main() {\n    // 从标准输入读取数据，向标准输出写答案。\n    return 0;\n}\n';

export default function StudentGespPage() {
  const identity = useSessionUser(), [workspace, setWorkspace] = React.useState<Workspace | null>(null), [taskId, setTaskId] = React.useState('');
  const [source, setSource] = React.useState(starter), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [receipt, setReceipt] = React.useState<Receipt | null>(null);
  const [probeAnswers, setProbeAnswers] = React.useState<Record<string, string>>({}), [probeNotice, setProbeNotice] = React.useState('');
  const [hints, setHints] = React.useState<Hint[]>([]), [reviewTaskId, setReviewTaskId] = React.useState<string | null>(null);
  const requestKey = React.useRef(crypto.randomUUID()), studentId = identity?.role === 'student' ? identity.studentId ?? '' : '';
  React.useEffect(() => { if (!studentId) return; setBusy(true); void apiRequest<Workspace>(`/gesp/students/${studentId}/workspace`).then(result => {
    setWorkspace(result); setTaskId(current => current || result.tasks[0]?.id || ''); }).catch(reason => setError((reason as Error).message)).finally(() => setBusy(false)); }, [studentId]);
  const task = workspace?.tasks.find(row => row.id === taskId);
  const activePlan = workspace?.guidancePlans.find(plan => plan.status === 'active');
  const dueReviews = workspace?.reviewTasks.filter(review => review.due) ?? [];
  const activeHint = hints.at(-1) ?? null;
  async function submit() { if (!task) return; setBusy(true); setError(''); setReceipt(null);
    try { const result = await apiRequest<Receipt>('/gesp/code-submissions', { method: 'POST', body: JSON.stringify({ studentId, atomId: task.atomId,
      source, requestKey: requestKey.current, ...(activeHint?.taskId === task.id ? { hintEventId: activeHint.id } : {}),
      ...(reviewTaskId ? { reviewTaskId } : {}) }) }); setReceipt(result); setWorkspace(await apiRequest<Workspace>(`/gesp/students/${studentId}/workspace`));
      requestKey.current = crypto.randomUUID(); setReviewTaskId(null); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  async function requestHint(level: number) { if (!task) return; setBusy(true); setError('');
    try { const hint = await apiRequest<Hint>('/gesp/hints', { method: 'POST', body: JSON.stringify({ studentId, atomId: task.atomId,
      taskId: task.id, level, requestKey: crypto.randomUUID() }) }); setHints(current => [...current, hint]);
      setWorkspace(await apiRequest<Workspace>(`/gesp/students/${studentId}/workspace`)); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  function openTask(nextTaskId: string, reviewId: string | null = null) { setTaskId(nextTaskId); setReviewTaskId(reviewId); setReceipt(null); setSource(starter);
    setProbeAnswers({}); setProbeNotice(''); setHints([]); requestKey.current = crypto.randomUUID(); }
  async function submitProbe(probe: Probe) { if (!task || !probeAnswers[probe.id]) return; setBusy(true); setError(''); setProbeNotice('');
    try { const result = await apiRequest<{ status: string; analysis: string }>('/gesp/probe-submissions', { method: 'POST',
      body: JSON.stringify({ studentId, atomId: task.atomId, probeId: probe.id, answer: probeAnswers[probe.id], requestKey: crypto.randomUUID() }) });
      setProbeNotice(result.analysis); setWorkspace(await apiRequest<Workspace>(`/gesp/students/${studentId}/workspace`)); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  if (identity === undefined) return <main className="learning-studio"><StudyNav current="today" /><div className="studio-empty">正在读取学习身份…</div></main>;
  if (!studentId) return <main className="learning-studio"><StudyNav current="today" /><div className="studio-empty"><h1>请先使用独立学习码进入</h1><Link className="studio-primary" href="/student/login">打开学习入口 ↗</Link></div></main>;
  return <main className="learning-studio gesp-page"><StudyNav current="today" /><div className="gesp-shell"><header><span className="studio-eyebrow">GESP C++ / ISOLATED PRACTICE</span><h1>先写清楚，<br /><em>再让隔离运行器核对。</em></h1><p>这里只显示家长已确认的原创试点范围。隐藏测试与期望输出不会出现在题目或结果里；编译失败、错误输出和超时分别记录。</p></header>
    {error && <div className="studio-error" role="alert">{error}</div>}
    {!workspace ? <div className="studio-empty" role="status">正在读取编程范围…</div> : !workspace.scope || !workspace.tasks.length ? <div className="studio-empty"><h2>还没有确认GESP编程范围</h2><p>请家长先选择当前原创试点题，再由孩子使用独立学习码进入。</p><Link className="studio-secondary" href="/parent/gesp">家长打开GESP范围 ↗</Link></div> : <section className="gesp-panel"><div className="gesp-panel-head"><div><h2>{workspace.scope.level}级原创试点</h2><p>{workspace.notice}</p></div><span className="studio-badge">范围 v{workspace.scope.version}</span></div>
      {activePlan && <section className="studio-hint" aria-label="已确认GESP指导计划"><strong>家长已确认 · 每日约 {activePlan.minutesPerDay} 分钟</strong><details><summary>查看 {activePlan.actions.length} 个指导行动</summary>{activePlan.actions.map(action => <article key={action.id}><h3>{action.title}</h3><p>{action.activity}</p><p>成功标准：{action.successCriterion}</p></article>)}</details></section>}
      {!!dueReviews.length && <section className="gesp-probes" aria-label="到期间隔复测"><h3>到期复测</h3><p>复测使用与首次提交不同的隐藏边界；通过后只增加保持证据，不把原题重做称为陌生迁移。</p>{dueReviews.map(review => { const row = workspace.tasks.find(item => item.id === review.taskId); return <article key={review.id}><strong>第 {review.stageDay} 天 · {row?.title ?? review.atomId}</strong><button type="button" className="studio-secondary" disabled={busy || !row} onClick={() => row && openTask(row.id, review.id)}>打开独立复测 →</button></article>; })}</section>}
      <div className="gesp-work-grid"><aside><label>本次任务<select value={taskId} onChange={event => openTask(event.target.value)}>{workspace.tasks.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>{task && <article className="gesp-brief"><small>{task.atomId} · {task.standard} · {task.reviewStatus === 'instructional_approved' ? '教研内容已审核' : '原创试点 · 尚未内容审核'}{reviewTaskId ? ' · 延迟复测' : ''}</small><h3>{task.title}</h3><p>{task.prompt}</p><p>墙钟 {task.timeLimitSeconds} 秒 · 内存 {task.memoryLimitMiB} MiB · 隐藏测试最多40组</p></article>}
        {task && <section className="gesp-probes" aria-label="渐进提示"><h3>需要时获取提示</h3><p>{reviewTaskId ? '间隔复测必须独立完成，因此本轮不开放提示。' : '提示必须逐级开启，不显示隐藏输入、期望输出或最终答案；有提示的提交会标为辅助证据。'}</p><div className="gesp-actions">{[1,2,3].map(level => <button key={level} type="button" className="studio-text-button" disabled={busy || Boolean(reviewTaskId) || (level > 1 && !hints.some(hint => hint.level === level - 1))} onClick={() => void requestHint(level)}>获取第 {level} 级提示</button>)}</div>{activeHint && <p className="studio-notice" role="status">{activeHint.text}</p>}</section>}
        {task && <section className="gesp-probes" aria-label="概念与跟踪探针"><h3>先核对概念，再预测程序状态</h3>{task.probes.map(probe => <fieldset key={probe.id}><legend>{probe.dimension === 'understanding' ? '理解' : '步骤跟踪'} · {probe.prompt}</legend>{probe.options.map(option => <label key={option}><input type="radio" name={probe.id} checked={probeAnswers[probe.id] === option} onChange={() => setProbeAnswers(current => ({ ...current, [probe.id]: option }))} />{option}</label>)}<button type="button" className="studio-secondary" disabled={busy || !probeAnswers[probe.id]} onClick={() => void submitProbe(probe)}>提交这个独立探针</button></fieldset>)}{probeNotice && <p className="studio-notice" role="status">{probeNotice}</p>}<p className="studio-muted">概念、跟踪和代码实现分别留证，不因一次代码结果把它们合并成一个能力分数。</p></section>}
        <details><summary>运行边界</summary><p>程序在独立Linux命名空间中编译和运行，无法读取 Windows 盘符与用户目录，也没有网络。</p></details></aside>
        <section className="gesp-editor"><label>源代码<textarea aria-label="GESP C++源代码" spellCheck={false} value={source} onChange={event => { setSource(event.target.value); setReceipt(null); requestKey.current = crypto.randomUUID(); }} /></label><div className="gesp-actions"><small>{reviewTaskId ? '这是到期保持复测，结果与首次实现分开保存。' : activeHint ? `本次包含第 ${activeHint.level} 级提示，将标记为辅助证据。` : '首次提交独立作答；相同提交键只保存一条记录。'}</small><button className="studio-primary" disabled={busy || !source.trim()} onClick={() => void submit()}>{busy ? '隔离编译与测试中…' : reviewTaskId ? '提交到期复测 →' : '提交并运行 →'}</button></div></section></div>
      {receipt && <section className={`gesp-result result-${receipt.status}`} aria-live="polite"><span className="studio-eyebrow">RUN RECEIPT</span><h2>{receipt.status === 'passed' ? '当前隐藏测试全部通过' : receipt.compilePassed ? '程序运行结果仍需修正' : '编译没有通过'}</h2><p>源码哈希 {receipt.sourceSha256.slice(0, 16)}… · {new Date(receipt.createdAt).toLocaleString('zh-CN')}</p><div className="gesp-test-grid">{receipt.tests.map(test => <span key={test.index} data-status={test.status}>测试 {test.index + 1}<strong>{test.status}</strong><small>{test.durationMs}ms</small></span>)}</div>{!!receipt.compileDiagnostics.length && <details className="gesp-diagnostics"><summary>查看编译器诊断</summary><pre>{receipt.compileDiagnostics.join('\n')}</pre></details>}{!!receipt.runtimeDiagnostics.length && <details className="gesp-diagnostics"><summary>查看运行期诊断</summary>{receipt.runtimeDiagnostics.map(item => <pre key={item.index}>测试 {item.index + 1} · {item.status}{'\n'}{item.stderr}</pre>)}</details>}<p>{receipt.reviewTaskId ? '本次到期复测已单独记录，用于保持证据。' : receipt.hintLevel ? `本次使用第 ${receipt.hintLevel} 级提示，属于辅助证据。` : '本次为无提示独立提交。'}通过当前测试集只证明这些边界；它不能单独证明陌生任务迁移或完整课程掌握。</p></section>}
      {!!workspace.submissions.length && <section><h2>最近提交</h2><div className="gesp-history">{workspace.submissions.slice(0, 8).map(row => <article key={row.id}><span data-status={row.status}>{row.status}</span><div><strong>{row.tests.filter(test => test.passed).length} / {row.tests.length} 组通过</strong><small>{new Date(row.createdAt).toLocaleString('zh-CN')} · {row.sourceSha256.slice(0, 16)}…</small></div></article>)}</div></section>}
      <section className="gesp-capabilities"><h2>当前能证明什么</h2><p>每一项只反映当前范围的独立证据；三个维度没有测完时保持未知。</p>{workspace.capabilities.map(item => <article key={item.atomId} data-state={item.state}><strong>{item.atomId}</strong><span>{item.dimensions.map(dimension => <small key={dimension.dimension}>{({understanding:'理解',procedure:'跟踪',implementation:'实现'} as Record<string,string>)[dimension.dimension]}：{dimension.status} · {dimension.attempts}次</small>)}</span><p>{item.hypothesis}</p><small>{item.nextAction}</small></article>)}</section>
    </section>}</div></main>;
}
