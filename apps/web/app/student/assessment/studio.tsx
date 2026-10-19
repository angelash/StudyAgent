'use client';

import * as React from 'react';
import Link from 'next/link';
import type { GuidancePlanView, DiagnosticHypothesis, DiagnosticReport, KnowledgeAtom, LearningScope,
  MasteryEstimate, QuestionRenderPayload, ReviewTask, StudentAnswerPayload, Subject } from '@study-agent/contracts';
import { apiRequest, getAuthToken } from '../../../lib/api';
import { QuestionRenderer, createEmptyAnswerPayload } from '../../../components/question-renderer';
import './studio.css';
import '../today/today.css';
import { StudyNav } from '../../../components/study-nav';
import { LearningProgressSelector, ProgressSelection } from '../../../components/learning-progress-selector';
import { EvidenceFeedbackForm } from '../../../components/evidence-feedback';
import { ReportHistory } from '../../../components/report-history';
import { GuidanceManager, ReviewScheduleEditor } from '../../../components/guidance-manager';
import { useSessionUser } from '../../../lib/session-user';
import { AssistantWidget } from '../../../components/assistant-widget';

type Child = { id: string; nickname: string; grade: number };
type Session = { id: string; status: 'in_progress' | 'completed' | 'aborted'; subject: Subject; scopeSnapshot: LearningScope;
  answeredCount: number; totalCount: number; startedAt: string;
  items: Array<{ id: string; atomId: string; questionId: string; dimension: string; atomName: string; answered: boolean; reason: string }> };
type Review = ReviewTask & { atomName: string; due: boolean };
type Retrospective = { fingerprint: string; reviewed: boolean; followupSessionIds: string[]; comparisons: Array<{ atomId: string; atomName: string; outcome: string; note: string; retentionSamples: number }> };
const subjects: Array<[Subject, string]> = [['math', '数学'], ['chinese', '语文'], ['english', '英语']];
const statuses: Record<MasteryEstimate['status'], string> = { unknown: '尚未测量', insufficient: '证据待补充', learning: '继续巩固', fragile: '还需验证', secure: '稳定掌握' };
const hypothesisStatuses: Record<string, string> = { proposed: '待验证', testing: '验证中', supported: '已有支持证据', contradicted: '已有反证', inconclusive: '证据不一致', monitoring: '持续观察', resolved: '已通过后续验证', reopened: '需要再次核查', withdrawn: '原依据已撤回' };
const outcomeNames: Record<string, string> = { awaiting_retest: '等待复测', different_dimensions: '测量维度或量规不同', insufficient: '证据待补充', uncertain: '变化尚不确定', improved: '观察到改善', declined: '需要重新指导' };
const request = <T,>(path: string, body?: unknown, method = 'POST') => apiRequest<T>(path, body === undefined ? {} : { method, body: JSON.stringify(body) }, getAuthToken());

export function AssessmentStudio() {
  const identity = useSessionUser(), studentMode = identity?.role === 'student';
  const [confirmedScope, setConfirmedScope] = React.useState<LearningScope | null>(null);
  const [children, setChildren] = React.useState<Child[]>([]), [studentId, setStudentId] = React.useState('');
  const [subject, setSubject] = React.useState<Subject>('math'), [grade, setGrade] = React.useState(3), [term, setTerm] = React.useState<'upper' | 'lower'>('upper');
  const [nickname, setNickname] = React.useState(''), [textbookVersion, setTextbookVersion] = React.useState('按已学知识点确认');
  const [progress, setProgress] = React.useState<ProgressSelection>({ bookId: '', mode: 'knowledge', lessonIds: [] });
  const [atoms, setAtoms] = React.useState<KnowledgeAtom[]>([]), [learned, setLearned] = React.useState<string[]>([]);
  const [minutes, setMinutes] = React.useState(15), [maxItems, setMaxItems] = React.useState(12);
  const [sessions, setSessions] = React.useState<Session[]>([]), [session, setSession] = React.useState<Session | null>(null);
  const [payload, setPayload] = React.useState<QuestionRenderPayload | null>(null), [answer, setAnswer] = React.useState<StudentAnswerPayload | null>(null);
  const [report, setReport] = React.useState<DiagnosticReport | null>(null), [plan, setPlan] = React.useState<GuidancePlanView | null>(null);
  const [reviews, setReviews] = React.useState<Review[]>([]), [retrospective, setRetrospective] = React.useState<Retrospective | null>(null);
  const [screen, setScreen] = React.useState<'setup' | 'assessment' | 'report' | 'plan'>('setup');
  const [busy, setBusy] = React.useState(false), [loading, setLoading] = React.useState(true), [error, setError] = React.useState('');
  const [loggedIn, setLoggedIn] = React.useState(false), [hint, setHint] = React.useState(''), [saved, setSaved] = React.useState('');
  const [expandedAtom, setExpandedAtom] = React.useState<string | null>(null);
  const [retrospectiveNote, setRetrospectiveNote] = React.useState('');
  const openedAt = React.useRef(Date.now()), draftTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = session?.items.find((item) => !item.answered);
  const child = children.find((item) => item.id === studentId);
  const subjectName = subjects.find(([key]) => key === subject)?.[1];
  React.useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [screen, current?.id]);

  async function execute(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); } catch (caught) { setError(caught instanceof Error ? caught.message : '操作暂未完成，请重试'); }
    finally { setBusy(false); }
  }
  async function openSession(next: Session) {
    setStudentId(next.scopeSnapshot.studentId); setSubject(next.subject); setGrade(next.scopeSnapshot.grade); setTerm(next.scopeSnapshot.term);
    setSession(next); setReport(null); setPayload(null); setAnswer(null); setHint('');
    window.history.replaceState({}, '', `?studentId=${encodeURIComponent(next.scopeSnapshot.studentId)}&session=${encodeURIComponent(next.id)}`);
    if (next.status === 'completed') { setReport(await request<DiagnosticReport>(`/diagnostics/sessions/${next.id}/report`)); setScreen('report'); }
    else setScreen('assessment');
  }

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await request<Child[]>('/learning/students');
        if (!alive) return;
        setLoggedIn(true); setChildren(list);
        const params = new URLSearchParams(window.location.search), requested = params.get('studentId');
        const requestedSubject = params.get('subject');
        if (subjects.some(([key]) => key === requestedSubject)) setSubject(requestedSubject as Subject);
        const selected = list.find((item) => item.id === requested) ?? list[0];
        if (selected) { setStudentId(selected.id); setGrade(selected.grade); }
        const sessionId = params.get('session');
        if (sessionId && selected) {
          const restored = await request<Session>(`/diagnostics/sessions/${encodeURIComponent(sessionId)}`);
          if (!alive) return;
          setSubject(restored.subject); await openSession(restored);
        }
      } catch (caught) { if (alive) setError(caught instanceof Error ? caught.message : '请先登录'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, []);

  React.useEffect(() => {
    if (!studentId) return;
    let alive = true;
    Promise.all([request<LearningScope | null>(`/students/${studentId}/learning-scope?subject=${subject}`),
      request<Session[]>(`/diagnostics/sessions?studentId=${studentId}&subject=${subject}`),
      request<GuidancePlanView[]>(`/diagnostics/students/${studentId}/plans?subject=${subject}`)])
      .then(([scope, history, plans]) => {
        if (!alive) return;
        setConfirmedScope(scope);
        if (scope) { setGrade(scope.grade); setTerm(scope.term); setLearned(scope.learnedAtomIds); setMinutes(scope.minutesPerSession); setTextbookVersion(scope.textbookVersion);
          setProgress({ bookId: scope.textbookVolumeId ?? '', mode: scope.progressMode ?? 'knowledge', lessonIds: scope.selectedLessonIds ?? [] }); }
        else { setLearned([]); setProgress({ bookId: '', mode: 'knowledge', lessonIds: [] }); setGrade(children.find((item) => item.id === studentId)?.grade ?? 3); }
        const requestedPlan = new URLSearchParams(window.location.search).get('planId');
        setSessions(history); setPlan(plans.find(p => p.id === requestedPlan) ?? plans[0] ?? null); setRetrospective(null);
        if (new URLSearchParams(window.location.search).get('view') === 'plan' && plans[0]) setScreen('plan');
      }).catch((caught) => { if (alive) setError(caught.message); });
    return () => { alive = false; };
  }, [studentId, subject, children]);

  React.useEffect(() => {
    let alive = true; setReviews([]);
    if (plan) request<Review[]>(`/diagnostics/plans/${plan.id}/reviews`).then(items => { if (alive) setReviews(items); })
      .catch(caught => { if (alive) setError(caught.message); });
    return () => { alive = false; };
  }, [plan?.id, plan?.revision, screen]);

  React.useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    request<KnowledgeAtom[]>(`/diagnostics/curriculum?subject=${subject}&grade=${grade}&term=${term}`)
      .then((items) => { if (alive) setAtoms(items); }).catch((caught) => { if (alive) setError(caught.message); });
    return () => { alive = false; };
  }, [loggedIn, grade, term, subject]);

  React.useEffect(() => {
    if (!session || !current) return;
    let alive = true;
    setPayload(null); setAnswer(null); setHint(''); setSaved('');
    request<{ payload: QuestionRenderPayload; draft: StudentAnswerPayload | null }>(`/diagnostics/sessions/${session.id}/items/${encodeURIComponent(current.id)}`)
      .then((result) => {
        if (!alive) return;
        setPayload(result.payload); setAnswer(result.draft ?? createEmptyAnswerPayload(result.payload));
        setSaved(result.draft ? '已恢复上次草稿' : ''); openedAt.current = Date.now();
      }).catch((caught) => { if (alive) setError(caught.message); });
    return () => { alive = false; if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [session?.id, current?.id]);

  function changeAnswer(next: StudentAnswerPayload) {
    setAnswer(next); setSaved('正在保存…');
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (!session || !current) return;
    const sessionId = session.id, itemId = current.id;
    draftTimer.current = setTimeout(() => request(`/diagnostics/sessions/${sessionId}/items/${encodeURIComponent(itemId)}/draft`, { answer: next }, 'PATCH')
      .then(() => setSaved('草稿已保存')).catch(() => setSaved('保存未成功，请保持页面并重试')), 800);
  }

  async function createChild() {
    await execute(async () => {
      const created = await request<{ profile: Child }>('/students', { nickname, grade, preferredSessionMinutes: minutes,
        defaultVersionMap: { math: 'common', chinese: 'common', english: 'common' } });
      setChildren((items) => [...items, created.profile]); setStudentId(created.profile.id); setNickname('');
    });
  }
  async function startAssessment() {
    await execute(async () => {
      const allowed = new Set(atoms.map((atom) => atom.id));
      const ids = progress.mode === 'textbook' ? learned : learned.filter((id) => allowed.has(id));
      if (!ids.length) throw new Error('请先勾选孩子已经学习的知识点');
      const proposedScope = { subject, grade, term, textbookVolumeId: progress.bookId || null, textbookVersion,
        progressMode: progress.mode, selectedLessonIds: progress.mode === 'textbook' ? progress.lessonIds : [],
        learnedAtomIds: ids, currentAtomId: ids.at(-1), minutesPerSession: minutes };
      if (studentMode) {
        await request(`/students/${studentId}/progress-proposals`, { scope: proposedScope, baseScopeVersion: confirmedScope?.version ?? 0, requestKey: crypto.randomUUID() });
        setSaved('已把你的进度告诉家长。确认前继续使用原来的学习范围。'); return;
      }
      setConfirmedScope(await request<LearningScope>(`/students/${studentId}/learning-scope`, proposedScope, 'PUT'));
      await openSession(await request<Session>('/diagnostics/sessions', { studentId, subject, intent: 'baseline', maxItems, includePrerequisites: false }));
    });
  }
  async function respond(disposition: 'answered' | 'dont_know' | 'skip') {
    if (!session || !current) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    await execute(async () => {
      await request(`/diagnostics/sessions/${session.id}/responses`, { itemId: current.id, ...(disposition === 'answered' ? { answer } : {}),
        disposition, elapsedMs: Math.min(3_600_000, Date.now() - openedAt.current), requestKey: `${session.id}:${current.id}` });
      const next = await request<Session>(`/diagnostics/sessions/${session.id}`);
      setSession(next);
      if (next.answeredCount === next.totalCount) { setReport(await request<DiagnosticReport>(`/diagnostics/sessions/${next.id}/complete`, {})); setScreen('report'); }
    });
  }
  async function verify(hypothesis?: DiagnosticHypothesis, atomId?: string) {
    await execute(async () => openSession(await request<Session>('/diagnostics/sessions', { studentId, subject, intent: 'verification', maxItems: 8,
      includePrerequisites: true, ...(screen === 'plan' && plan ? { planId: plan.id } : {}),
      ...(hypothesis ? { hypothesisId: hypothesis.id, targetAtomIds: hypothesis.probeAtomIds } : { targetAtomIds: atomId ? [atomId] : learned }) })));
  }
  async function updatePlan(status: 'active' | 'paused' | 'completed') {
    if (!plan) return;
    await execute(async () => {
      setPlan(await request<GuidancePlanView>(`/diagnostics/plans/${plan.id}`, { status, expectedRevision: plan.revision ?? 1, requestKey: crypto.randomUUID() }, 'PATCH'));
      setReviews(await request<Review[]>(`/diagnostics/plans/${plan.id}/reviews`));
    });
  }

  return <main className="learning-studio">
    <StudyNav current="assessment" />
    <div className="studio-layout">
      <aside className="studio-rail"><span className="studio-eyebrow">LEARNING / INSIGHT</span><h1>把知识<br /><em>学扎实。</em></h1>
        <p>从学到了哪里开始，找到卡住的那一步，再用新题看看是否真的掌握。</p>
        <ol className="studio-steps">{[['setup', '确认学习进度'], ['assessment', '完成一组评测'], ['report', '看懂知识与原因'], ['plan', '指导、复测与复盘']].map(([key, title], index) =>
          <li key={key} data-active={screen === key}><span>{String(index + 1).padStart(2, '0')}</span>{title}</li>)}</ol>
        {child && <div className="studio-child"><span className="studio-avatar">{child.nickname.slice(0, 1)}</span><div><strong>{child.nickname}</strong><small>{grade}年级 · {subjectName}</small></div></div>}
        {screen !== 'setup' && <button className="studio-text-button" onClick={() => { setScreen('setup'); window.history.replaceState({}, '', `?studentId=${studentId}`); }}>返回学习进度与历史</button>}
      </aside>
      <section className="studio-main" aria-busy={busy || loading}>
        {error && <div role="alert" className="studio-error">{error}<button aria-label="收起提示" onClick={() => setError('')}>×</button></div>}
        {loading ? <div className="studio-empty">正在取回你的学习记录…</div> : !loggedIn ? <div className="studio-empty"><h2>从孩子的学习档案开始</h2><p>登录后即可保存进度、评测与指导计划。</p><Link className="studio-primary" href="/parent/login">登录或创建家长账号</Link></div> : <>
          {screen === 'setup' && <>
            <div className="studio-section-head"><span className="studio-eyebrow">01 / 学习起点</span><h2>先告诉我们，学到哪里了。</h2><p>只测已学内容。还没有测到的知识点，会保留为未知。</p></div>
            <div className="studio-config">
              {children.length > 0 ? <label>孩子<select value={studentId} onChange={(event) => { setStudentId(event.target.value); setSession(null); setReport(null); }}>
                {children.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}</select></label> : <label>孩子的昵称<input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="例如：小禾" maxLength={50} /></label>}
              <label>当前年级<select value={grade} onChange={(event) => { setGrade(Number(event.target.value)); setProgress({ bookId: '', mode: 'knowledge', lessonIds: [] }); setLearned([]); }}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}年级</option>)}</select></label>
              <label>学期<select value={term} onChange={(event) => { setTerm(event.target.value as 'upper' | 'lower'); setProgress({ bookId: '', mode: 'knowledge', lessonIds: [] }); setLearned([]); }}><option value="upper">上学期</option><option value="lower">下学期</option></select></label>
              <label>每次时间<select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>{[5, 10, 15, 20, 30].map((value) => <option key={value} value={value}>{value}分钟</option>)}</select></label>
            </div>
            {!children.length ? <button className="studio-primary" disabled={busy || !nickname.trim()} onClick={createChild}>建立学习档案</button> : <>
              <div className="studio-subjects" role="group" aria-label="学科">{subjects.map(([key, title]) => <button key={key} aria-pressed={subject === key} onClick={() => { setSubject(key); setSession(null); setReport(null); }}>{title}</button>)}</div>
              <LearningProgressSelector subject={subject} grade={grade} term={term} selection={progress} onChange={setProgress}
                version={textbookVersion} onVersion={setTextbookVersion} onLearned={setLearned} />
              <div className="studio-point-heading"><h3>{progress.mode === 'textbook' ? '已学课时对应的知识点' : '勾选已经学过的知识点'}</h3>{progress.mode === 'knowledge' && <button className="studio-text-button" onClick={() => setLearned(atoms.filter((atom) => atom.grade === grade).map((atom) => atom.id))}>选择本年级能力点</button>}</div>
              <div className="studio-points">{[1, 2, 3, 4, 5, 6].filter((value) => atoms.some((atom) => atom.grade === value)).map((value) => <fieldset key={value}>
                <legend>{value}年级{value < grade ? ' · 前期基础' : ''}</legend>{atoms.filter((atom) => atom.grade === value).map((atom) => <label key={atom.id}>
                  <input type="checkbox" disabled={progress.mode === 'textbook'} checked={learned.includes(atom.id)} onChange={(event) => setLearned((items) => event.target.checked ? [...items, atom.id] : items.filter((id) => id !== atom.id))} />
                  <span><strong>{atom.name}</strong><small>{atom.objective}</small></span></label>)}</fieldset>)}</div>
              {!atoms.length && <p className="studio-muted">当前范围还没有已发布的原子知识点，可在内容工作台补充。</p>}
              <div className="studio-start"><div><strong>已选 {learned.filter((id) => atoms.some((atom) => atom.id === id)).length} 个点</strong><label>本组最多<select value={maxItems} onChange={(event) => setMaxItems(Number(event.target.value))}>{[6, 12, 20, 30].map((value) => <option key={value} value={value}>{value}题</option>)}</select></label></div>
                <button className="studio-primary" onClick={startAssessment} disabled={busy || !learned.length}>{busy ? '正在准备…' : studentMode ? '把这个进度告诉家长' : '确认进度，开始评测'} <span aria-hidden="true">↗</span></button></div>
              {studentMode && <><p role="status" className="studio-notice">{saved || '可以选择自己的年级和已学内容，请家长一起确认后，用新范围评测。'}</p>{confirmedScope && <button className="studio-primary" disabled={busy} onClick={() => execute(async () => openSession(await request<Session>('/diagnostics/sessions', { studentId, subject, intent: 'baseline', maxItems, includePrerequisites: false })))}>按已确认的范围开始评测 →</button>}</>}<p className="studio-footnote">题量由时长和可用题目共同决定。基础题为规则估计材料，教材完整覆盖与标准化常模尚需独立验证。</p>
            </>}
            {sessions.length > 0 && <section className="studio-history"><h3>继续上一次，或回看报告</h3>{sessions.slice(0, 6).map((item) => <button key={item.id} onClick={() => execute(() => openSession(item))} disabled={busy}>
              <span>{new Date(item.startedAt).toLocaleDateString('zh-CN')} · {item.scopeSnapshot.grade}年级</span><strong>{item.status === 'completed' ? '查看报告' : `继续评测 ${item.answeredCount}/${item.totalCount}`} ↗</strong></button>)}</section>}
            {plan && <button className="studio-plan-shortcut" onClick={() => setScreen('plan')}>已有指导计划 · {plan.status === 'active' ? '正在执行' : '查看与确认'} <span>↗</span></button>}
          </>}
          {screen === 'assessment' && session && <>
            <div className="studio-section-head"><span className="studio-eyebrow">02 / 一次只看一步</span><div className="studio-question-meta"><h2>{current?.atomName ?? '这一组已完成'}</h2><span>{session.answeredCount + (current ? 1 : 0)} / {session.totalCount}</span></div><p>先独立想一想。暂时不会也可以如实记录。</p></div>
            <div className="studio-progress" role="progressbar" aria-label="评测进度" aria-valuemin={0} aria-valuemax={session.totalCount} aria-valuenow={session.answeredCount}><span style={{ width: `${session.answeredCount / session.totalCount * 100}%` }} /></div>
            {current ? <div className="studio-question"><div className="studio-question-top"><span>{session.answeredCount + 1 < 5 ? '第一小组' : `第 ${Math.floor(session.answeredCount / 4) + 1} 小组`}</span><small aria-live="polite">{saved}</small></div>
              {payload && answer ? <QuestionRenderer renderPayload={payload} answer={answer} onChange={changeAnswer} /> : <p>正在打开题目…</p>}
              {hint && <div className="studio-hint" role="status">{hint}</div>}
              <div className="studio-answer-actions"><button className="studio-text-button" disabled={busy} onClick={() => execute(async () => {
                const result = await request<{ hint: string }>(`/diagnostics/sessions/${session.id}/items/${encodeURIComponent(current.id)}/hint`, {}); setHint(result.hint);
              })}>给我一点提示</button><div><button className="studio-secondary" disabled={busy} onClick={() => respond('dont_know')}>暂时不会</button><button className="studio-primary" disabled={busy || !answer} onClick={() => respond('answered')}>{busy ? '保存中…' : '提交，下一步'} →</button></div></div>
              <button className="studio-text-button studio-skip" disabled={busy} onClick={() => respond('skip')}>题目显示不清或有问题，先跳过</button>
            </div> : <button className="studio-primary" disabled={busy} onClick={() => execute(async () => { setReport(await request<DiagnosticReport>(`/diagnostics/sessions/${session.id}/complete`, {})); setScreen('report'); })}>生成本次报告</button>}
            <p className="studio-footnote">首次提交会保留为测量证据；提示记录会单独计入。随时可以离开，回来继续。</p>
          </>}
          {screen === 'report' && report && <>
            <div className="studio-section-head"><span className="studio-eyebrow">03 / 知道表现，也知道依据</span><h2>从知识点看清下一步。</h2><p>{report.summary}</p></div>
            {report.scopeSnapshot && <details className="studio-report-scope"><summary>本次范围：{report.scopeSnapshot.grade}年级 · {report.scopeSnapshot.term === 'upper' ? '上学期' : '下学期'} · {report.scopeSnapshot.textbookVersion}</summary><p>按评测开始时确认的范围测量：{report.scopeSnapshot.learnedAtomIds.length} 个知识点，{report.scopeSnapshot.selectedLessonIds?.length ?? 0} 个已学课时。</p>{(report.scopeSnapshot.uncoveredLessonIds?.length ?? 0) > 0 && <p>其中 {report.scopeSnapshot.uncoveredLessonIds!.length} 个课时尚缺已审核的知识映射，报告不评价这些课时。</p>}{report.scopeSnapshot.selectedLessonSnapshots?.map((lesson) => <p key={lesson.id}>{lesson.chapterName} / {lesson.name}{report.scopeSnapshot!.uncoveredLessonIds?.includes(lesson.id) && ' · 尚未覆盖'}</p>)}</details>}
            <ReportHistory sessionId={report.sessionId} />
            <div className="studio-report-stats"><div><strong>{report.scoredCount}<small> / {report.totalCount}</small></strong><span>已评分题目</span></div><div><strong>{report.rawScore === null ? '待评分' : `${report.rawScore}%`}</strong><span>本次题目得分</span></div><div><strong>{report.unmeasuredAtomIds.length}</strong><span>尚未测到的点</span></div></div>
            <h3 className="studio-line-title">知识掌握与证据范围</h3><p className="studio-muted">点按知识点展开作答依据。横线范围越宽，说明仍需要更多证据。</p>
            <div className="studio-estimates">{report.estimates.map((estimate) => <article key={estimate.atomId} data-status={estimate.status}>
              <button className="studio-estimate-head" onClick={() => setExpandedAtom(expandedAtom === estimate.atomId ? null : estimate.atomId)} aria-expanded={expandedAtom === estimate.atomId}>
                <span><strong>{estimate.atomName}</strong><small>{statuses[estimate.status]} · {estimate.scoredCount} 题证据 · {estimate.independentFamilies} 个题族</small></span><b>{estimate.mastery === null ? '—' : `${Math.round(estimate.mastery)}%`} <small>⌄</small></b></button>
              <div className="studio-interval" aria-label={estimate.mastery === null ? '尚未测量' : `参考估计${estimate.mastery}%，95%区间${estimate.lower}%至${estimate.upper}%`}>
                {estimate.lower !== null && estimate.upper !== null && <><span style={{ left: `${estimate.lower}%`, width: `${estimate.upper - estimate.lower}%` }} /><i style={{ left: `${estimate.mastery}%` }} /></>}</div>
              {expandedAtom === estimate.atomId && <div className="studio-evidence"><p>{estimate.mastery === null ? '没有有效证据，保留为未知。' : `现有证据的估计区间：${estimate.lower}% – ${estimate.upper}%。有效样本权重 ${estimate.effectiveSamples}。`}</p>
                <div className="studio-dimensions">{estimate.dimensions.map((dimension) => <span key={dimension.dimension}>{({ understanding: '理解', procedure: '执行', transfer: '迁移', retention: '保持' } as Record<string, string>)[dimension.dimension]}<strong>{dimension.mastery === null ? '未测' : `${dimension.mastery}%`}</strong></span>)}</div>
                {report.evidence.filter((item) => item.atomId === estimate.atomId).map((item) => <div key={item.id} className="studio-evidence-item"><b>{item.status === 'pending_review' ? '待复核' : item.status === 'skipped' ? '已跳过' : item.correct ? '达到本题标准' : '本题需要核查'}</b><span>{item.gradingReason}</span><small>{item.hintLevel ? `使用${item.hintLevel}级提示` : '独立作答'} · {Math.round(item.elapsedMs / 1000)}秒</small><EvidenceFeedbackForm kind="diagnostic" responseId={item.id} /></div>)}
              </div>}
            </article>)}</div>
            {report.hypotheses.length > 0 && <><h3 className="studio-line-title">可能卡在哪里，以及怎样验证</h3><div className="studio-hypotheses">{report.hypotheses.map((hypothesis) => <article key={hypothesis.id}><span className="studio-badge">{hypothesisStatuses[hypothesis.status]}</span><h4>{hypothesis.title}</h4><p>{hypothesis.observation}</p><p>{hypothesis.explanation}</p><small>支持 {hypothesis.supportingEvidenceIds.length} 条 · 反证 {hypothesis.counterEvidenceIds.length} 条</small>
              <details><summary>查看验证方向与其他解释</summary><p>{hypothesis.nextAction}</p><ul>{hypothesis.alternatives.map((item) => <li key={item}>{item}</li>)}</ul></details>
              {!['resolved', 'contradicted', 'withdrawn'].includes(hypothesis.status) && <button className="studio-secondary" disabled={busy} onClick={() => verify(hypothesis)}>做一组题验证原因 ↗</button>}</article>)}</div></>}
            {!studentMode ? <div className="studio-report-next"><div><h3>让评测变成下一步行动。</h3><p>计划包含指导活动、成功标准与间隔复测。</p></div><button className="studio-primary" disabled={busy} onClick={() => execute(async () => {
              setPlan(await request<GuidancePlanView>(`/diagnostics/students/${studentId}/plans`, { baselineSessionId: report.sessionId, minutesPerDay: minutes, useAi: true })); setRetrospective(null); setScreen('plan');
            })}>{busy ? '正在制定…' : '制定指导计划'} ↗</button></div> : <div className="studio-hint"><strong>这次的观察已经保存。</strong><p>请家长查看报告，一起确认下一步指导；也可以继续完成新的验证任务。</p><Link className="studio-secondary" href="/student/today">回到今日学习 ↗</Link></div>}<p className="studio-footnote">{report.modelNotice}</p>
          </>}
          {screen === 'plan' && plan && <>
            <div className="studio-section-head"><span className="studio-eyebrow">04 / 指导 · 验证 · 复盘</span><h2>每天 {plan.minutesPerDay} 分钟，<br />把一步走稳。</h2><p>{plan.summary}</p></div>
            <div className="studio-plan-toolbar"><span className="studio-badge">{plan.status === 'active' ? '正在执行' : plan.status === 'paused' ? '已暂停' : plan.status === 'completed' ? '本轮已结束' : '待家长确认'}</span>{!studentMode && plan.status !== 'completed' && <button className="studio-primary" disabled={busy || (plan.status !== 'active' && plan.impact?.needsReview)} onClick={() => updatePlan(plan.status === 'active' ? 'paused' : 'active')}>{plan.status === 'active' ? '暂停计划' : '确认并开始计划'}</button>}</div>
            {!studentMode && <GuidanceManager plan={plan} onChange={setPlan} />}
            {plan.actions.map((action, index) => <article className="studio-action" key={action.id}><span className="studio-action-number">0{index + 1}</span><div><span className="studio-eyebrow">约 {action.minutes} 分钟 / {action.evidenceIds.length} 条依据</span><h3>{action.title}</h3><p>{action.activity}</p><div className="studio-criterion"><strong>怎样算走稳了</strong><p>{action.successCriterion}</p></div><button className="studio-secondary" disabled={busy || plan.status !== 'active' || plan.impact?.needsReview} onClick={() => verify(undefined, action.atomId)}>做新题验证 ↗</button></div></article>)}
            <h3 className="studio-line-title">留出间隔，再看是否保持</h3><div className="studio-reviews">{reviews.some(r => r.planId === plan.id) ? reviews.filter(r => r.planId === plan.id).map((review) => <div key={review.id}><span className="studio-review-day">D+{review.intervalDays}</span><div><strong>{review.atomName}</strong><small>{new Date(review.dueAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div><button className="studio-text-button" disabled={busy || (review.status === 'pending' && (!review.due || plan.status !== 'active' || plan.impact?.needsReview))} onClick={() => execute(async () => openSession(await request<Session>(`/diagnostics/reviews/${encodeURIComponent(review.id)}/start`, {})))}>{review.status === 'completed' ? '查看' : review.due ? '开始复测 ↗' : '等待到期'}</button>{!studentMode && <ReviewScheduleEditor review={review} plan={plan} onChange={async () => setReviews(await request<Review[]>(`/diagnostics/plans/${plan.id}/reviews`))} />}</div>) : <p className="studio-muted">确认计划后，会安排次日、3日、7日和14日复测。</p>}</div>
            <div className="studio-retrospective"><h3>复盘：哪些变化已经得到验证？</h3><button className="studio-secondary" disabled={busy} onClick={() => execute(async () => setRetrospective(await request<Retrospective>(`/diagnostics/plans/${plan.id}/retrospective`)))}>查看前后证据</button>{retrospective?.comparisons.map((item) => <div key={item.atomId}><strong>{item.atomName} · {outcomeNames[item.outcome]}</strong><p>{item.note}</p><small>延迟新题证据 {item.retentionSamples} 条</small></div>)}{!studentMode && retrospective && plan.status !== 'completed' && <form onSubmit={e => { e.preventDefault(); execute(async () => { setPlan(await request<GuidancePlanView>(`/diagnostics/plans/${plan.id}/retrospective/acknowledge`, { expectedRevision: plan.revision ?? 1, requestKey: crypto.randomUUID(), fingerprint: retrospective.fingerprint, reason: retrospectiveNote })); setRetrospective(await request<Retrospective>(`/diagnostics/plans/${plan.id}/retrospective`)); }); }}><label className="guidance-retrospective-note">这次复盘看到了什么<textarea required minLength={5} maxLength={1500} rows={3} value={retrospectiveNote} onChange={e => setRetrospectiveNote(e.target.value)} placeholder="记录已验证的变化、仍不确定的解释，以及下一步准备观察什么。" /></label><button className="studio-secondary" disabled={busy || retrospectiveNote.trim().length < 5 || !retrospective.followupSessionIds.length || plan.impact?.needsReview}>{retrospective.reviewed ? '补充复盘记录' : '确认已核对前后证据'}</button><p className="studio-muted">计划结束后保留全部证据。证据不足的知识点继续显示待验证。</p>{retrospective.reviewed && reviews.some(r => r.planId === plan.id) && reviews.filter(r => r.planId === plan.id).every(r => r.status === 'completed') && <button type="button" className="studio-primary" disabled={busy} onClick={() => updatePlan('completed')}>结束本轮指导计划</button>}</form>}</div>
            {plan.aiStatus === 'unavailable' && <p className="studio-footnote">AI 个性化说明暂不可用，当前活动已按评测证据与指导规则安排，可以照常执行。</p>}
          </>}
        </>}
      </section>
    </div>
    {loggedIn && studentId && <AssistantWidget userRole={screen === 'assessment' || studentMode ? 'student' : 'parent'} studentId={studentId} subject={subject}
      pageContext={screen === 'assessment' ? 'assessment' : 'review'}
      contextRefType={screen === 'assessment' && current || screen === 'report' ? 'diagnostic' : screen === 'plan' && plan ? 'plan' : null}
      contextRefId={screen === 'assessment' && current || screen === 'report' ? session?.id : screen === 'plan' ? plan?.id : null}
      contextItemId={screen === 'assessment' ? current?.id : null}
      title="学习观察助教" subtitle={screen === 'assessment' ? '提示会与独立作答分开记录' : '从具体证据，看清下一步'} />}
  </main>;
}
