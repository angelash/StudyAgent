'use client';
import * as React from 'react';
import Link from 'next/link';
import type { AnswerDraftState, DiagnosticStart, QuestionRenderPayload, StudentAnswerPayload, Subject } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import { Child, DailyLearning, Practice, PracticeFeedback, readableAnswer, subjectNames } from '../../../lib/learning';
import { StudyNav } from '../../../components/study-nav';
import { QuestionRenderer, createEmptyAnswerPayload } from '../../../components/question-renderer';
import { useAnswerDraft, recoverPendingAnswerSubmission } from '../../../lib/answer-draft';
import { AnswerDraftStatus } from '../../../components/answer-draft-status';
import { AssistantWidget } from '../../../components/assistant-widget';
import { MistakeNotebook } from '../../../components/mistake-notebook';
import { EvidenceFeedbackForm } from '../../../components/evidence-feedback';
import { TeachingGuide } from '../../../components/teaching-guide';
import { useSessionUser } from '../../../lib/session-user';
import { answerInputConfiguration } from '@study-agent/contracts';
import '../assessment/studio.css';
import './today.css';

const send = <T,>(path: string, body?: unknown, method = 'POST') => apiRequest<T>(path, body === undefined ? {} : { method, body: JSON.stringify(body) });
export function DailyStudio() {
  const studentMode = useSessionUser()?.role === 'student';
  const [children, setChildren] = React.useState<Child[]>([]), [studentId, setStudentId] = React.useState(''), [subject, setSubject] = React.useState<Subject>('math');
  const [today, setToday] = React.useState<DailyLearning | null>(null), [practice, setPractice] = React.useState<Practice | null>(null);
  const [payload, setPayload] = React.useState<QuestionRenderPayload | null>(null), draft = useAnswerDraft(), answer = draft.answer;
  const [answerReadRevision, setAnswerReadRevision] = React.useState(0);
  const [mediaPending, setMediaPending] = React.useState(false);
  const [resourceBlocked, setResourceBlocked] = React.useState(false);
  const [feedback, setFeedback] = React.useState<PracticeFeedback | null>(null), [index, setIndex] = React.useState(0), [retry, setRetry] = React.useState(false);
  const [hint, setHint] = React.useState(''), [saved, setSaved] = React.useState(''), [tab, setTab] = React.useState<'today' | 'mistakes'>('today');
  const [busy, setBusy] = React.useState(false), [loading, setLoading] = React.useState(true), [error, setError] = React.useState(''), [loggedIn, setLoggedIn] = React.useState(false);
  const blueprintRequest = React.useRef({ signature: '', key: '' });
  const question = practice?.questions[index], child = children.find((item) => item.id === studentId);
  const answerReady = !!payload && !!answer && draft.matches('practice', practice?.id ?? '', question?.id ?? '');
  const canAnswer = answerReady && payload ? answerInputConfiguration(payload.answerSchema).supported && payload.inputAvailability?.supported !== false && !mediaPending && !resourceBlocked && !draft.pendingSubmission && draft.phase !== 'conflict' : false;
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (caught) { setError(caught instanceof Error ? caught.message : '操作未完成，请重试'); } finally { setBusy(false); } }
  function selectPractice(next: Practice) {
    const params = new URLSearchParams(window.location.search), selected = params.get('practice') === next.id ? next.questions.findIndex(item => item.id === params.get('question')) : -1;
    const cursor = selected >= 0 ? selected : Math.max(0, next.questions.findIndex(item => !item.attempted));
    setPractice(next); setIndex(cursor); setRetry(false); practiceLocation(next, cursor);
  }
  function practiceLocation(activity: Practice, cursor: number) { const params = new URLSearchParams({ studentId: activity.studentId, subject: activity.subject, practice: activity.id }); if (activity.questions[cursor]) params.set('question', activity.questions[cursor].id); window.history.replaceState({}, '', '?' + params); }
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await send<Child[]>('/learning/students');
        if (!alive) return; setLoggedIn(true); setChildren(list);
        const params = new URLSearchParams(window.location.search), selected = list.find((item) => item.id === params.get('studentId')) ?? list[0];
        const selectedSubject = params.get('subject'); if (selectedSubject && selectedSubject in subjectNames) setSubject(selectedSubject as Subject);
        if (selected) setStudentId(selected.id);
        const id = params.get('practice');
        if (id) { await recoverPendingAnswerSubmission('practice', id); const restored = await send<Practice>(`/learning/practice/${encodeURIComponent(id)}`); if (alive) { setStudentId(restored.studentId); setSubject(restored.subject); selectPractice(restored); } }
      } catch (caught) { if (alive) setError(caught instanceof Error ? caught.message : '请先登录'); }
      finally { if (alive) setLoading(false); }
    })(); return () => { alive = false; };
  }, []);
  React.useEffect(() => {
    if (!studentId) return; let alive = true; setToday(null);
    send<DailyLearning>(`/learning/students/${studentId}/today?subject=${subject}`)
      .then(daily => { if (alive) setToday(daily); }).catch((caught) => { if (alive) setError(caught.message); });
    return () => { alive = false; };
  }, [studentId, subject, practice?.status]);
  React.useEffect(() => {
    if (!practice || !question) return; let alive = true; draft.reset(); setPayload(null); setFeedback(null); setHint(''); setSaved(''); setRetry(false);
    const path = `/learning/practice/${practice.id}/questions/${encodeURIComponent(question.id)}`;
    send<{ payload: QuestionRenderPayload; feedback: PracticeFeedback | null; draft: { answer: StudentAnswerPayload } | null; draftState: AnswerDraftState }>(path)
      .then((value) => { if (alive) { const prior = value.feedback?.attempt.answer as StudentAnswerPayload | null;
        setPayload(value.payload);
        const restored = draft.open({ kind: 'practice', sessionId: practice.id, itemId: question.id, path, responsesPath: `/learning/practice/${practice.id}/responses`, state: value.draftState, retrying: !!value.feedback && !!value.draft },
          value.draft?.answer ?? (prior?.mode === value.payload.answerSchema.mode ? prior : createEmptyAnswerPayload(value.payload)));
        setFeedback(value.feedback); setRetry(restored.retrying); } })
      .catch((caught) => { if (alive) setError(caught.message); });
    window.scrollTo({ top: 0, behavior: 'instant' });
    return () => { alive = false; };
  }, [practice?.id, question?.id, answerReadRevision]);
  function change(next: StudentAnswerPayload) {
    draft.change(next);
  }
  async function submit(disposition: 'answered' | 'skip') {
    if (!practice || !question || !answerReady) return; const epoch = draft.epoch;
    await run(async () => {
      await draft.submit<PracticeFeedback>(disposition);
      const next = await send<Practice>(`/learning/practice/${practice.id}`); if (!draft.isCurrent(epoch)) return;
      draft.confirmed(); setRetry(false); setSaved(''); setPractice(next); setAnswerReadRevision(value => value + 1);
    });
  }
  async function leave() {
    if (practice?.status === 'in_progress' && question && answer && (!feedback || retry)) {
      if (!await draft.prepareToLeave()) return;
    }
    draft.reset(); setPractice(null); setPayload(null); window.history.replaceState({}, '', `?studentId=${studentId}&subject=${subject}`);
  }
  async function chooseQuestion(next: number) {
    if (busy || !practice || !answerReady || next === index) return; const epoch = draft.epoch;
    await run(async () => { if (!feedback || retry) await draft.flush(); if (draft.isCurrent(epoch)) { setIndex(next); practiceLocation(practice, next); } });
  }
  async function previewAssessment(command: DiagnosticStart) {
    const signature = JSON.stringify(command);
    if (blueprintRequest.current.signature !== signature) blueprintRequest.current = { signature, key: crypto.randomUUID() };
    const body = { ...command, adaptive: command.intent !== 'retest', requestKey: blueprintRequest.current.key };
    try { sessionStorage.setItem(`study-blueprint:${command.studentId}:${command.subject}`, JSON.stringify(body)); }
    catch { /* A preview is also recoverable through its server URL. */ }
    const next = await send<{ id: string }>('/diagnostics/blueprints', body);
    window.location.href = `/student/assessment?studentId=${encodeURIComponent(command.studentId)}&subject=${command.subject}&blueprint=${encodeURIComponent(next.id)}`;
  }
  const assessmentHref = `/student/assessment?studentId=${studentId}&subject=${subject}`;
  return <main className="learning-studio daily-studio"><StudyNav current="today" context={{ studentId: studentId || undefined, subject }} /><div className="daily-layout">
    <aside className="daily-rail"><span className="studio-eyebrow">DAILY PRACTICE / 每日一小步</span><h1>把学会的，<br /><em>慢慢变稳。</em></h1><p>先理解，再练习。用之后的独立新题，看看这一步有没有留下来。</p>
      {!practice && <><label>正在陪伴<select aria-label="选择学生" value={studentId} onChange={(e) => setStudentId(e.target.value)}>{children.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}</select></label><div className="studio-subjects">{Object.entries(subjectNames).map(([key, name]) => <button key={key} aria-pressed={subject === key} onClick={() => setSubject(key as Subject)}>{name}</button>)}</div></>}
      {child && <p>{child.nickname} · {child.grade}年级 · {subjectNames[subject]}</p>}
      {practice && <button className="studio-text-button" onClick={leave}>← 返回今日安排</button>}
      <Link className="studio-text-button" href={assessmentHref}>查看知识诊断与计划 ↗</Link>
      {studentMode && <Link className="studio-text-button" href="/student/gesp">进入GESP编程试点 ↗</Link>}
    </aside>
    <section className="studio-main" aria-busy={busy}>
      {error && <div className="studio-error" role="alert">{error}<button aria-label="关闭提示" onClick={() => setError('')}>×</button></div>}
      {loading ? <div className="studio-empty" role="status">正在取回学习安排…</div> : !loggedIn ? <div className="studio-empty"><h2>继续孩子的学习旅程</h2><p>登录后保存每天的练习和思路。</p><Link className="studio-primary" href="/student/login">使用学习码进入 ↗</Link></div> : !studentId ? <div className="studio-empty"><h2>先建立一个学习档案</h2><p>确认年级和已经学过的知识点后，再安排适合的任务。</p><Link className="studio-primary" href="/student/assessment">建立档案 ↗</Link></div> : practice ? <>
        <div className="studio-section-head"><span className="studio-eyebrow">{practice.status === 'completed' ? '今日活动已完成' : '可以提示，也可以订正'}</span><h2>{practice.action.title}</h2><p>{practice.action.activity}</p></div>{practice.planRevision !== practice.currentPlanRevision && <p className="studio-notice" role="status">{practice.snapshotOrigin === 'started' ? '指导计划已调整。这次练习继续使用开始时保存的活动，完成后按最新计划安排下一步。' : '这是早期练习记录，活动内容在首次版本归档时保存，无法追溯更早的活动变化。'}</p>}
        {practice.status === 'completed' && <div className="daily-complete"><span aria-hidden="true">✓</span><h2>这一步，已经认真走过。</h2><p>已作答 {practice.summary.answered} 道，跳过 {practice.summary.skipped} 道；其中 {practice.summary.independentFirstPass} 道首次独立做对。{practice.summary.pendingReview > 0 && `${practice.summary.pendingReview} 道表达题等待复核。`}</p><p>{practice.origin === 'notebook' ? '原题订正已记录。回到错题本，另用未见新题核查，再等待间隔复测。' : '接下来按计划复测，用新题检查理解和保持。'}</p><button className="studio-primary" onClick={leave}>查看下一步 ↗</button></div>}<>
          <TeachingGuide snapshot={practice.action.teachingSnapshot} showObservation={!studentMode} />
          <div className="daily-question-index" aria-label="练习进度">{practice.questions.map((item, i) => <button key={item.id} disabled={busy || !answerReady} aria-current={index === i ? 'step' : undefined} onClick={() => void chooseQuestion(i)}>{i + 1}{item.attempted ? ' ✓' : ''}</button>)}</div>
          <div className="studio-progress"><span style={{ width: `${100 * practice.summary.attempted / practice.summary.total}%` }} /></div>
          <div className="studio-question"><div className="studio-question-top"><span>第 {index + 1} / {practice.summary.total} 题</span><span role="status">{draft.label}</span></div>
            {answerReady && payload && answer ? <fieldset disabled={busy || draft.pendingSubmission || practice.status === 'completed' || Boolean(feedback && !retry)} className="daily-answer-field"><legend className="visually-hidden">本题作答</legend><QuestionRenderer disabled={busy || draft.pendingSubmission || practice.status === "completed" || Boolean(feedback && !retry)} key={practice.id + ":" + question!.id + ":" + draft.state?.baseHash} renderPayload={payload} answer={answer} onChange={change} mediaTarget={{ kind: 'practice', sessionId: practice.id, itemId: question!.id }} onPendingChange={setMediaPending} onDisplayIssueChange={setResourceBlocked} /></fieldset> : <p role="status">正在打开题目…</p>}
            <AnswerDraftStatus draft={draft} schema={payload?.answerSchema} onRecover={() => submit('answered')} onReadActivity={async () => { const next = await send<Practice>(`/learning/practice/${practice.id}`); draft.confirmed(); setPractice(next); setAnswerReadRevision(value => value + 1); }} />
            {hint && <div className="studio-hint" role="status">{hint}</div>}
            {feedback && !retry ? <div className="daily-feedback" data-correct={feedback.attempt.correct}><strong>{feedback.attempt.status === 'skipped' ? '这道题先放一放' : feedback.attempt.status === 'pending_review' ? '你的表达已保存' : feedback.attempt.correct ? '这一步做到了' : '我们一起看看卡在哪里'}</strong><p>{feedback.notice}</p><details><summary>查看参考思路</summary><p>参考答案：{readableAnswer(feedback.referenceAnswer)}</p><p>{feedback.analysis}</p></details><p className="studio-muted">第 {feedback.attempt.attempt} 次作答 · {feedback.attempt.hintLevel ? `使用了 ${feedback.attempt.hintLevel} 级提示` : '未使用提示'}{feedback.attempt.solutionExposedBefore && ' · 参考思路已提供'}</p><EvidenceFeedbackForm kind="practice" responseId={feedback.attempt.id} /><div className="daily-buttons"><button className="studio-secondary" disabled={busy || draft.pendingSubmission || draft.phase === 'conflict' || practice.status === 'completed' || feedback.attempt.attempt >= 5} onClick={() => { draft.beginRetry(); setRetry(true); }}>再想一次</button>{index < practice.questions.length - 1 && <button className="studio-primary" onClick={() => void chooseQuestion(index + 1)}>下一题 →</button>}</div></div> : <div className="studio-answer-actions"><button className="studio-text-button" disabled={busy || !answerReady || draft.pendingSubmission || draft.phase === 'conflict'} onClick={() => run(async () => { const epoch = draft.epoch, result = await send<{ hint: string }>(`/learning/practice/${practice.id}/questions/${encodeURIComponent(question!.id)}/hint`, {}); if (draft.isCurrent(epoch)) setHint(result.hint); })}>给我一点提示</button><div><button className="studio-secondary" disabled={busy || !answerReady || draft.pendingSubmission || draft.phase === 'conflict'} onClick={() => submit('skip')}>先跳过</button><button className="studio-primary" disabled={busy || !canAnswer} onClick={() => submit('answered')}>{busy ? '正在保存…' : retry ? '提交这次订正 →' : '完成这一题 →'}</button></div></div>}
          </div>
          {practice.status === 'in_progress' && practice.summary.attempted === practice.summary.total && <button className="studio-primary daily-finish" disabled={busy || retry || draft.pendingSubmission} onClick={() => run(async () => setPractice(await send<Practice>(`/learning/practice/${practice.id}/complete`, {})))}>结束这次活动 ✓</button>}
        </>
      </> : <>
        <div className="studio-section-head"><span className="studio-eyebrow">{today?.day ?? 'TODAY'} / {subjectNames[subject]}</span><h2>今天，往前走一小步。</h2><p>{today?.notice ?? '正在加载当前安排…'}</p></div>
        <div className="studio-subjects"><button aria-pressed={tab === 'today'} onClick={() => setTab('today')}>今日安排</button><button aria-pressed={tab === 'mistakes'} onClick={() => setTab('mistakes')}>错题与思路</button></div>
        {tab === 'mistakes' ? <MistakeNotebook key={`${studentId}:${subject}`} studentId={studentId} subject={subject} onPractice={selectPractice} /> : <>
          {today?.incompleteAssessments.map((item) => <div className="daily-resume" key={item.id}><div><strong>{item.status === 'paused' ? '有一组小测正在休息中' : '有一组小测还没完成'}</strong><p>已保存 {item.answeredCount} / {item.totalCount} 道</p></div><Link className="studio-secondary" href={`${assessmentHref}&session=${item.id}`}>{item.status === 'paused' ? '恢复这一组' : '继续作答'} →</Link></div>)}
          {today?.plan?.impact.needsReview && <div className="studio-hint" role="status"><strong>指导依据需要核对</strong><p>{today.plan.impact.message}</p><Link className="studio-secondary" href={`${assessmentHref}&view=plan&planId=${today.plan.id}`}>请家长核对指导计划 ↗</Link></div>}{today?.plan ? <><p className="studio-muted">已确认计划 · 每天约 {today.plan.minutesPerDay} 分钟</p><div className="daily-activities">{today.activities.map((action, i) => <article key={action.id} id={"activity-" + action.id}><span className="studio-action-number">0{i + 1}</span><div><span className="studio-badge">{action.minutes} 分钟 · {action.status === 'completed' ? '今日已完成' : action.status === 'in_progress' ? '进行中' : '等待开始'}</span><h3>{action.title}</h3><p>{action.activity}</p><details><summary>怎样算有进步</summary><p>{action.successCriterion}</p></details><div className="daily-buttons"><button className="studio-secondary" disabled={busy || today.plan?.impact.needsReview} onClick={() => run(async () => { await previewAssessment({ studentId, subject, planId: today.plan!.id, intent: 'verification', targetAtomIds: [action.atomId], maxItems: 4, includePrerequisites: true }); })}>先用新题检查</button><button className="studio-primary" disabled={busy || Boolean(today.plan?.impact.needsReview && !action.sessionId)} onClick={() => run(async () => selectPractice(await send<Practice>(`/learning/plans/${today.plan!.id}/actions/${action.id}/start`, {})))}>{action.status === 'completed' ? '回看这次练习' : action.status === 'in_progress' ? '继续这次活动 →' : '进入指导练习 →'}</button></div></div></article>)}</div></> : <div className="studio-empty"><h3>{today?.awaitingConfirmation ? (studentMode ? '请家长确认下一步安排' : '有一份指导计划等待确认') : '从了解孩子开始'}</h3><p>{today?.awaitingConfirmation ? (studentMode ? '这份计划需要家长先核对。你可以回看已有报告，或在已确认的范围内继续评测。' : '先查看计划的依据和每日安排，确认后就可以开始。') : '确认学习进度，做一组知识点小测，再安排有针对性的练习。'}</p><Link className="studio-primary" href={`${assessmentHref}&view=plan`}>{today?.awaitingConfirmation ? (studentMode ? '查看学习安排 ↗' : '查看并确认计划 ↗') : '开始知识诊断 ↗'}</Link></div>}
          {Boolean(today?.reviews.length) && <><h3 className="studio-line-title">过一段时间，再看看。</h3><p className="studio-muted">到期后用新题检查；时间未到时，请继续按计划练习。</p><div className="studio-reviews">{today?.reviews.filter((item) => item.status !== 'completed').map((item) => <div key={item.id} id={"review-" + item.id}><span className="studio-review-day">+{item.intervalDays}天</span><div><strong>{item.atomName}</strong><small>{new Date(item.dueAt).toLocaleString('zh-CN')}</small></div><button className="studio-secondary" disabled={busy || !item.due || Boolean(today?.plan?.impact.needsReview && !item.sessionId)} onClick={() => run(async () => { if (item.sessionId) window.location.href = `${assessmentHref}&session=${encodeURIComponent(item.sessionId)}`; else await previewAssessment({ studentId, subject, intent: 'retest', includePrerequisites: false, reviewTaskId: item.id }); })}>{item.status === 'in_progress' ? '继续复测' : item.due ? '开始复测' : '等待到期'}</button></div>)}</div></>}
        </>}
      </>}
    </section></div>{loggedIn && studentId && <AssistantWidget userRole="student" studentId={studentId} subject={subject} pageContext={practice ? 'mission' : 'student_home'}
      contextRefType={practice && question ? 'practice' : null} contextRefId={practice && question ? practice.id : null} contextItemId={practice && question ? question.id : null}
      title="学习小助教" subtitle="把你卡住的那一步告诉我" />}</main>;
}
