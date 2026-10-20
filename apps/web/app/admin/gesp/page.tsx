'use client';

import * as React from 'react';
import Link from 'next/link';
import type { GespAtom, GespOverview, GespPilotTaskReviewView, GespQuestionDetail, GespSearchResult } from '@study-agent/contracts';
import { apiBaseUrl, apiRequest, getAuthToken } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import { StudyNav } from '../../../components/study-nav';
import '../../student/assessment/studio.css';
import '../workbench.css';
import './gesp.css';

const kinds = { choice: '单选', 'true-false': '判断', programming: '编程' };
const sources = { exam: '官方原卷', official_explanation: '官方解析补充', sample: '官方样题', mirror_exam: '公开镜像 · 官网仍缺' };
const levelTitles = ['编程基础', '多层逻辑', '数组与模拟', '函数与递推', '二分与贪心', '搜索与背包', '动态规划与图', '图论与优化'];
const reviewGateLabels = { atomAlignment: '知识目标对齐', instructions: '题面与运行说明', probes: '概念与跟踪探针',
  hiddenTests: '隐藏测试与边界', executionSafety: '运行资源与安全边界' } as const;
type ReviewGate = keyof typeof reviewGateLabels;
const req = <T,>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { signal }, getAuthToken());

export default function GespWorkbench() {
  const user = useSessionUser(), allowed = Boolean(user && ['admin', 'teacher'].includes(user.role));
  const [overview, setOverview] = React.useState<GespOverview | null>(null), [atoms, setAtoms] = React.useState<GespAtom[]>([]);
  const [level, setLevel] = React.useState(1), [tab, setTab] = React.useState<'questions' | 'knowledge' | 'teaching' | 'pilot'>('questions');
  const [session, setSession] = React.useState(''), [kind, setKind] = React.useState(''), [sourceKind, setSourceKind] = React.useState('');
  const [atomId, setAtomId] = React.useState(''), [input, setInput] = React.useState(''), [q, setQ] = React.useState(''), [page, setPage] = React.useState(1);
  const [result, setResult] = React.useState<GespSearchResult | null>(null), [selected, setSelected] = React.useState('');
  const [detail, setDetail] = React.useState<GespQuestionDetail | null>(null), [error, setError] = React.useState('');
  const [searchError, setSearchError] = React.useState(''), [detailError, setDetailError] = React.useState(''), [retry, setRetry] = React.useState(0);
  const [loading, setLoading] = React.useState(false), [detailLoading, setDetailLoading] = React.useState(false);
  const [pilot, setPilot] = React.useState<GespPilotTaskReviewView[]>([]), [pilotSelected, setPilotSelected] = React.useState('');
  const [pilotLoading, setPilotLoading] = React.useState(false), [reviewNotice, setReviewNotice] = React.useState('');
  const [reviewRationale, setReviewRationale] = React.useState('');
  const [reviewGates, setReviewGates] = React.useState<Partial<Record<ReviewGate, 'approved' | 'rejected'>>>({});
  const [reviewBusy, setReviewBusy] = React.useState(false);
  React.useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController(); setError('');
    Promise.all([req<GespOverview>('/gesp/overview', controller.signal), req<GespAtom[]>('/gesp/atoms', controller.signal)])
      .then(([data, nodes]) => { setOverview(data); setAtoms(nodes); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [allowed, retry]);
  React.useEffect(() => {
    if (!allowed || !overview?.ready) return;
    const controller = new AbortController(); setLoading(true); setSearchError(''); setResult(null); setSelected(''); setDetail(null);
    const params = new URLSearchParams({ level: String(level), page: String(page), pageSize: '20' });
    for (const [key, value] of Object.entries({ session, kind, sourceKind, atomId, q })) if (value) params.set(key, value);
    req<GespSearchResult>(`/gesp/questions?${params}`, controller.signal).then(data => { setResult(data); })
      .catch(e => { if (!controller.signal.aborted) setSearchError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowed, overview, level, session, kind, sourceKind, atomId, q, page, retry]);
  React.useEffect(() => {
    setDetail(null); setDetailError('');
    if (!selected || !allowed) { setDetailLoading(false); return; }
    const controller = new AbortController(); setDetailLoading(true);
    req<GespQuestionDetail>(`/gesp/questions/${encodeURIComponent(selected)}`, controller.signal)
      .then(setDetail).catch(e => { if (!controller.signal.aborted) setDetailError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selected, allowed, retry]);

  React.useEffect(() => {
    if (!allowed || tab !== 'pilot' || level > 4) return;
    const controller = new AbortController(); setPilotLoading(true); setReviewNotice(''); setPilotSelected('');
    req<{ tasks: GespPilotTaskReviewView[] }>(`/gesp/student-content?level=${level}`, controller.signal)
      .then(data => setPilot(data.tasks)).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setPilotLoading(false); });
    return () => controller.abort();
  }, [allowed, tab, level]);
  const currentAtoms = atoms.filter(a => a.level === level), atomNames = new Map(atoms.map(a => [a.id, a.name]));
  const atom = currentAtoms.find(a => a.id === atomId);
  function changeLevel(value: number) { setLevel(value); setAtomId(''); setPage(1); }
  function openAtom(value: GespAtom) { changeLevel(value.level); setAtomId(value.id); setTab('knowledge'); }
  const pilotTask = pilot.find(task => task.id === pilotSelected);
  function openPilotTask(task: GespPilotTaskReviewView) {
    setPilotSelected(task.id); setReviewNotice(''); setReviewRationale(task.review?.rationale ?? '');
    setReviewGates(task.review ? { ...task.review.gates } : {});
  }
  async function savePilotReview() {
    if (!pilotTask) return; setReviewBusy(true); setError(''); setReviewNotice('');
    try {
      await apiRequest(`/gesp/student-content/reviews`, { method: 'POST', body: JSON.stringify({ taskId: pilotTask.id,
        expectedVersion: pilotTask.review?.version ?? 0, gates: reviewGates, rationale: reviewRationale, requestKey: crypto.randomUUID() }) }, getAuthToken());
      const data = await req<{ tasks: GespPilotTaskReviewView[] }>(`/gesp/student-content?level=${level}`);
      setPilot(data.tasks); setReviewNotice('审核结论及不可变修订已保存；内容变化后结论会自动显示为失效。');
    } catch (reason) { setError((reason as Error).message); } finally { setReviewBusy(false); }
  }

  return <main className="learning-studio"><StudyNav /><div className="admin-workbench gesp-workbench">
    <nav className="admin-links" aria-label="教研导航"><Link href="/admin/curriculum">知识与覆盖</Link><Link href="/admin/gesp" aria-current="page">GESP C++</Link><Link href="/admin/measurement">测量素材</Link><Link href="/library">题卷审核</Link></nav>
    <header className="gesp-hero"><div><span className="studio-eyebrow">GESP / C++ · 教研资料</span><h1>从一行程序，<br />走向独立解题。</h1><p>按认证等级研究知识与题目，把看懂、会写和独立迁移分别观察。</p></div><div className="gesp-scope"><strong>01—04</strong><span>零基础优先研究</span><small>05—08 保留完整进阶框架</small></div></header>
    {user === undefined && <p role="status">正在核对教研权限…</p>}
    {user === null && <p>请先<Link href="/parent/login">登录</Link>教研账号。</p>}
    {user && !allowed && <p>此资料区需要教研权限。<Link href="/parent/dashboard">返回家长空间</Link></p>}
    {error && <div className="studio-error" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>重新读取</button></div>}
    {allowed && !overview && !error && <p role="status">正在读取资料目录…</p>}
    {allowed && overview && <>
      <div className="gesp-stats"><span><strong>{overview.stats?.questions.toLocaleString() ?? '待建索引'}</strong> 条机器题目索引</span><span><strong>{atoms.length}</strong> 个候选知识点</span><span><strong>{overview.stats?.officialPdfs ?? '—'} + {overview.stats?.mirrorPdfs ?? '—'}</strong> 份官方 / 镜像 PDF</span><span>资料截至 <strong>{overview.asOf}</strong></span></div>
      <p className="gesp-notice">{overview.notice}</p>
      {!overview.ready && <p className="studio-error" role="alert">题目索引未安装。恢复 GESP 原始档案并运行 <code>scripts/gesp/build_runtime_index.py</code>，重启 API；知识框架与教学草案仍可查看。</p>}
      <nav className="gesp-levels" aria-label="认证等级">{overview.levels.map(l => <button key={l.level} aria-pressed={level === l.level} onClick={() => changeLevel(l.level)}><strong>{String(l.level).padStart(2, '0')}<small>级</small></strong><span>{levelTitles[l.level - 1]}</span><small>{l.atoms} 点 · {l.questions} 题</small></button>)}</nav>
      <div className="gesp-tabs" role="group" aria-label="资料视图">{([['questions', '历年题目'], ['knowledge', '知识与先修'], ['teaching', '教学衔接'], ['pilot', '学生试题目审核']] as const).map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
      {tab === 'knowledge' && <div className="gesp-columns"><section><h2>{level}级 · 候选知识点</h2><p>先修边为教学建议，全部定义待审核。</p><div className="gesp-atom-list">{currentAtoms.map(a => <button key={a.id} aria-pressed={a.id === atomId} onClick={() => { setAtomId(a.id); setPage(1); }}><strong>{a.name}</strong><small>{a.successCriterion}</small></button>)}</div></section><section className="gesp-panel">{atom ? <>
        <span className="studio-eyebrow">候选定义 · 未发布</span><h2>{atom.name}</h2><p>{atom.successCriterion}</p><h3>先修建议</h3>{atom.prerequisiteIds.length ? <div className="gesp-related">{atom.prerequisiteIds.map(id => <button key={id} onClick={() => { const target = atoms.find(a => a.id === id); if (target) openAtom(target); }}>{atomNames.get(id) ?? id}</button>)}</div> : <p>未指定编程先修点。</p>}<h3>数学与经验准备</h3><p>{atom.mathPrerequisites.join('；')}</p><h3>需要核实的错误</h3><p>{atom.commonErrorToInvestigate}</p><h3>官方条款依据</h3>{atom.sourceEvidence.map(e => <p key={e.clauseId}><a href={`${e.pdfUrl}#page=${e.pdfPages[0]}`} target="_blank" rel="noreferrer">{e.clauseId} · PDF 第 {e.pdfPages.join('、')} 页</a></p>)}<button className="studio-primary" onClick={() => setTab('questions')}>查看关键字命中的候选题</button><p>命中仅作检索线索，不是已审核的主测映射。</p>
      </> : <><h2>从一个可观察的行为开始</h2><p>选择知识点，查看成功标准、先修建议、数学准备和官方条款。</p></>}</section></div>}
      {tab === 'teaching' && <section className="gesp-teaching"><h2>{level}级 · 教学衔接草案</h2><p>{overview.teachingPlan.audience}</p><ul>{overview.teachingPlan.principles.map(p => <li key={p}>{p}</li>)}</ul><div className="gesp-units">{overview.teachingPlan.units.filter(u => u.level === level).map(u => <article key={u.id}><span className="studio-eyebrow">{u.id.split('.').at(-1)}</span><h3>{u.title}</h3><p>{u.observableGoal}</p><p><strong>先讨论：</strong>{u.discussionPrompt}</p><p><strong>数学准备：</strong>{u.mathReadiness}</p><p><strong>独立检查：</strong>{u.independentCheck}</p><div className="gesp-related">{u.atomIds.map(id => <button key={id} onClick={() => { const target = atoms.find(a => a.id === id); if (target) openAtom(target); }}>{atomNames.get(id) ?? id}</button>)}</div></article>)}</div>{level > 4 && <p>{overview.teachingPlan.advancedReference}</p>}<h3>记录学习证据</h3><ol>{overview.teachingPlan.evidenceCycle.map(p => <li key={p}>{p}</li>)}</ol><p>当前是教研草案，尚未发布到孩子的学习范围，也未启用程序编译与运行。</p></section>}
      {tab === 'pilot' && <section className="gesp-panel"><div className="gesp-panel-head"><div><span className="studio-eyebrow">AUTHORED PILOT / REVIEW GATE</span><h2>{level}级学生试题目审核</h2><p>教研人员查看完整题面、探针答案和隐藏测试后，分别确认五个门禁。只有五项全部批准才记为正式审核；文件内容变化会自动使结论失效。审核不会替代真实学生或学习效果验证。</p></div><span className="studio-badge">{pilot.filter(task => task.review?.status === 'approved').length} / {pilot.length} 已审</span></div>
        {level > 4 && <p>学生试题目目前只覆盖认证1～4级；5～8级保留研究索引。</p>}
        {pilotLoading && <p role="status">正在读取完整试点内容…</p>}{reviewNotice && <p className="studio-notice" role="status">{reviewNotice}</p>}
        {level <= 4 && <div className="gesp-columns"><section><div className="gesp-atom-list">{pilot.map(task => <button key={task.id} aria-pressed={pilotSelected === task.id} onClick={() => openPilotTask(task)}><strong>{task.title}</strong><small>{task.atomId} · v{task.review?.version ?? 0} · {task.review?.current === false ? '内容已变化，审核失效' : task.review?.status ?? '尚未审核'}</small></button>)}</div></section><section>
          {!pilotTask ? <><h2>选择一道试点题</h2><p>完整隐藏测试仅对教研身份开放。逐项确认后写入带指纹的审核修订。</p></> : <><h2>{pilotTask.title}</h2><p>{pilotTask.prompt}</p><p className="gesp-fingerprint">内容 SHA-256：{pilotTask.contentSha256}</p>
            <h3>概念与跟踪探针</h3>{pilotTask.probes.map(probe => <article key={probe.id} className="gesp-review-evidence"><strong>{probe.dimension} · {probe.prompt}</strong><small>选项：{probe.options.join(' / ')}</small><small>答案：{probe.answer}</small>{probe.analysis && <p>{probe.analysis}</p>}</article>)}
            <h3>隐藏测试与边界</h3><div className="gesp-review-tests">{pilotTask.tests.map((test, index) => <article key={index}><strong>测试 {index + 1}</strong><small>输入：{test.input || '（空）'}</small><small>期望输出：{test.expected || '（空）'}</small></article>)}</div>
            <h3>五项审核门禁</h3><div className="gesp-review-gates">{(Object.keys(reviewGateLabels) as ReviewGate[]).map(gate => <label key={gate}>{reviewGateLabels[gate]}<select value={reviewGates[gate] ?? ''} onChange={event => setReviewGates(current => ({ ...current, [gate]: event.target.value ? event.target.value as 'approved' | 'rejected' : undefined }))}><option value="">请选择</option><option value="approved">通过</option><option value="rejected">拒绝</option></select></label>)}</div>
            <label>审核理由与证据<textarea rows={5} minLength={20} maxLength={3000} value={reviewRationale} onChange={event => setReviewRationale(event.target.value)} placeholder="说明知识目标、题面、探针、隐藏边界和运行资源分别核对了什么；拒绝时指出需要修改的具体位置" /></label>
            <div className="gesp-actions"><small>版本 {pilotTask.review?.version ?? 0} · 已变化内容不能沿用旧审核</small><button className="studio-primary" disabled={reviewBusy || Object.keys(reviewGateLabels).some(gate => !reviewGates[gate as ReviewGate]) || reviewRationale.trim().length < 20} onClick={() => void savePilotReview()}>{reviewBusy ? '正在保存审核…' : '保存审核结论'}</button></div>
          </>}
        </section></div>}
      </section>}
      {tab === 'questions' && <>
        <form className="gesp-filters" onSubmit={e => { e.preventDefault(); setQ(input.trim()); setPage(1); }}>
          <label>场次<select value={session} onChange={e => { setSession(e.target.value); setPage(1); }}><option value="">全部场次与样题</option>{overview.sessions.map(s => <option key={s} value={s}>{s}</option>)}<option value="sample">官方样题</option></select></label>
          <label>题型<select value={kind} onChange={e => { setKind(e.target.value); setPage(1); }}><option value="">全部题型</option>{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>来源<select value={sourceKind} onChange={e => { setSourceKind(e.target.value); setPage(1); }}><option value="">全部来源</option>{Object.entries(sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>知识点候选<select value={atomId} onChange={e => { setAtomId(e.target.value); setPage(1); }}><option value="">不限关键字命中</option>{currentAtoms.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="gesp-search">题面关键字<input value={input} onChange={e => setInput(e.target.value)} maxLength={100} placeholder="如：字符串、循环、排序" /></label><button className="studio-primary" disabled={loading || !overview.ready}>检索</button>
        </form>
        {loading && <p role="status">正在检索…</p>}{searchError && <p className="studio-error" role="alert">{searchError} <button onClick={() => setRetry(n => n + 1)}>重试</button></p>}
        {result && <p role="status" aria-live="polite">找到 {result.total} 条，当前第 {result.page} / {Math.max(1, Math.ceil(result.total / result.pageSize))} 页。关键字检索基于提取文本，图示和未提取公式可能漏检。</p>}
        <div className="gesp-columns"><section aria-label="题目检索结果"><div className="gesp-question-list">{result?.items.map(item => <button key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><small>{item.session === 'sample' ? '样题' : item.session} · {item.certificationLevel}级 · {kinds[item.kind]} {item.number}</small><strong>{item.title || '题面需查看原卷'}</strong><span className={item.sourceKind === 'mirror_exam' ? 'gesp-mirror' : ''}>{sources[item.sourceKind]} · 第 {item.pdfPages.join('、')} 页</span></button>)}</div>{result && !result.items.length && <p>当前条件下没有题目。可以减少筛选条件后重试。</p>}{result && result.total > result.pageSize && <div className="gesp-pagination"><button className="studio-secondary" disabled={page <= 1 || loading} onClick={() => setPage(n => n - 1)}>上一页</button><span>{page} / {Math.ceil(result.total / result.pageSize)}</span><button className="studio-secondary" disabled={page * result.pageSize >= result.total || loading} onClick={() => setPage(n => n + 1)}>下一页</button></div>}</section>
          <section className="gesp-panel" aria-label="题目证据">{detailLoading && <p role="status">正在读取题目档案…</p>}{detailError && <p className="studio-error" role="alert">{detailError}</p>}{!selected && <><span className="studio-eyebrow">SOURCE / EVIDENCE</span><h2>先看原卷，再用题目。</h2><p>选择左侧题目查看提取文本、参考材料和原卷页码。公式、跨页代码和图示以 PDF 为准。</p></>}{detail && <>
            <span className="studio-eyebrow">{sources[detail.sourceKind]} · 逐题待审</span><h2>{detail.title}</h2><p>{detail.session} · {detail.certificationLevel}级 · {kinds[detail.kind]} {detail.number} · PDF 第 {detail.pdfPages.join('、')} 页</p>
            <div className="gesp-source-links"><a href={`${detail.pdfUrl}#page=${detail.pdfPages[0]}`} target="_blank" rel="noreferrer">{detail.sourceKind === 'mirror_exam' ? '查看固定版本镜像' : '查看官方 PDF'} ↗</a><a href={`${apiBaseUrl}/api/gesp/documents/${detail.pdfSha256}#page=${detail.pdfPages[0]}`} target="_blank" rel="noreferrer">本地校验原卷 ↗</a></div>
            {detail.sourceKind === 'mirror_exam' && <p className="gesp-mirror">此卷由公开仓库镜像补充，未补成官方来源；官网缺口仍保留。</p>}
            {detail.archiveStatus === 'missing' && <p className="studio-error">单题档案未安装，请恢复 GESP 原始资料；仍可查看来源链接。</p>}
            {detail.content && <><h3>题面机器文本</h3><pre className="gesp-machine-text">{detail.content.promptMachineText}</pre></>}
            <details key={detail.id}><summary>参考答案与材料（未审核）</summary><p>{detail.answer ? `提取答案：${detail.answer}` : detail.kind === 'programming' ? '编程题以参考材料和原卷为准。' : '答案符号未自动恢复，请回看原卷。'}</p>{detail.answerBasis && <p>来源依据：{detail.answerBasis.includes('mirror') ? '镜像 PDF 答案表' : detail.answerBasis.includes('inline') ? '官方解析题内答案' : '官方 PDF 答案表'}</p>}{detail.content?.referenceMaterialMachineText && <pre className="gesp-machine-text">{detail.content.referenceMaterialMachineText}</pre>}<p>隐藏测试数据未收集；参考程序与样例不能代替完整程序评测。</p></details>
            <h3>知识点候选</h3><p>{detail.atomCandidates.map(a => atomNames.get(a.atomId) ?? a.atomId).join('、') || '没有关键字命中，仍需人工定位。'}</p><p className="gesp-fingerprint">原卷 SHA-256：{detail.pdfSha256}</p>
          </>}</section></div>
      </>}
      <details className="gesp-provenance"><summary>来源覆盖与待补项</summary><p>官网目录覆盖 108 个已开考场次等级组合。原卷缺链用官方解析或公开镜像分别补充，保留 {overview.quarantinedLinks} 个错链隔离记录。</p>{overview.sourceGaps.map(g => <p key={`${g.session}:${g.level}`}>{g.session} · {g.level}级：{g.status === 'public_mirror_fallback' ? '公开镜像补充，官方来源仍缺失' : '官方解析补充，官网原卷缺失或错链'}</p>)}<p>{overview.unrecoveredObjectiveAnswers.toLocaleString()} 道客观题答案符号尚未自动恢复。所有题目均待完整内容、题族和教学映射审核。</p></details>
    </>}
  </div></main>;
}
