'use client';
import * as React from 'react';
import type { KnowledgeAtom, StudioStudyPlan, StudioStudyPlanPreview, StudioSubject, StudioWhiteboard } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';

type Props = {
  studentId: string;
  subject: StudioSubject;
  plans: StudioStudyPlan[];
  atoms: Array<Pick<KnowledgeAtom, 'id' | 'name' | 'objective'>>;
  canCreate: boolean;
  openRequest: number;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onOpenWhiteboard: (whiteboard: StudioWhiteboard) => void;
};

const kindNames = { learn: '重建', practice: '练习', transfer: '迁移', review: '复测' } as const;
const statusNames = { scheduled: '待执行', completed: '已完成', skipped: '已跳过' } as const;

function localDate(offsetDays = 0) {
  const value = new Date(); value.setDate(value.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
function localDateTime() {
  const value = new Date(Date.now() + 60 * 60_000); value.setMinutes(0, 0, 0);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function StudyPlanner({ studentId, subject, plans, atoms, canCreate, openRequest, onChanged, onError, onOpenWhiteboard }: Props) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<StudioStudyPlanPreview | null>(null);
  const [goal, setGoal] = React.useState('把本阶段最薄弱的知识点练到能够独立解释和迁移');
  const [title, setTitle] = React.useState('');
  const [targetDate, setTargetDate] = React.useState(() => localDate(7));
  const [firstSessionAt, setFirstSessionAt] = React.useState(localDateTime);
  const [minutesPerDay, setMinutesPerDay] = React.useState(20);
  const [requestKey, setRequestKey] = React.useState(() => crypto.randomUUID());
  const atomNames = new Map(atoms.map(atom => [atom.id, atom.name]));

  async function run(work: () => Promise<void>) {
    setBusy(true); onError('');
    try { await work(); } catch (error) { onError(error instanceof Error ? error.message : '学习计划操作未完成'); }
    finally { setBusy(false); }
  }
  function begin() {
    setOpen(true); setPreview(null); setTargetDate(localDate(7)); setFirstSessionAt(localDateTime());
    setRequestKey(crypto.randomUUID());
  }
  React.useEffect(() => { if (openRequest > 0 && canCreate) begin(); }, [openRequest, canCreate]);

  async function makePreview(event?: React.FormEvent) {
    event?.preventDefault();
    await run(async () => {
      setPreview(await apiRequest<StudioStudyPlanPreview>('/learning/studio/study-plans/preview', { method: 'POST',
        body: JSON.stringify({ studentId, subject, ...(title.trim() ? { title: title.trim() } : {}), goal,
          targetDate, firstSessionAt: new Date(firstSessionAt).toISOString(), minutesPerDay }) }));
    });
  }
  async function save() {
    if (!preview) return;
    await run(async () => {
      await apiRequest('/learning/studio/study-plans', { method: 'POST', body: JSON.stringify({
        studentId, subject, ...(title.trim() ? { title: title.trim() } : {}), goal, targetDate,
        firstSessionAt: new Date(firstSessionAt).toISOString(), minutesPerDay,
        fingerprint: preview.fingerprint, requestKey }) });
      setPreview(null); setOpen(false); setRequestKey(crypto.randomUUID()); await onChanged();
    });
  }
  async function sessionAction(plan: StudioStudyPlan, sessionId: string, action: 'complete' | 'skip' | 'reopen') {
    await run(async () => {
      await apiRequest('/learning/studio/study-plans/' + encodeURIComponent(plan.id) + '/sessions/' + encodeURIComponent(sessionId), {
        method: 'POST', body: JSON.stringify({ action, expectedRevision: plan.revision, requestKey: crypto.randomUUID() }) });
      await onChanged();
    });
  }
  async function openLesson(sessionTitle: string, atomId: string) {
    await run(async () => {
      const atom = atoms.find(item => item.id === atomId);
      const board = await apiRequest<StudioWhiteboard>('/learning/studio/whiteboards/preview', { method: 'POST',
        body: JSON.stringify({ studentId, subject, atomId, prompt: sessionTitle + '：' + (atom?.objective ?? '从具体例子核对关键关系') }) });
      onOpenWhiteboard(board);
    });
  }
  function openPractice(atomId: string) {
    window.location.href = '/student/assessment?studentId=' + encodeURIComponent(studentId) +
      '&subject=' + encodeURIComponent(subject) + '&atom=' + encodeURIComponent(atomId);
  }

  return <section className="sa-study-planner">
    <header className="sa-page-head sa-calendar-heading"><div><span className="studio-kicker">EVIDENCE-DRIVEN PLANNER</span>
      <h2>把薄弱点排进真实日程。</h2><p>先按掌握状态和独立题族选择优先点，再生成学习、练习、迁移与间隔复测。计划完成只代表执行过任务。</p></div>
      {canCreate && <div className="sa-page-actions"><button onClick={begin}>＋ 生成诊断学习计划</button></div>}</header>
    {open && <form className="sa-plan-builder" onSubmit={makePreview}>
      <header><div><span className="studio-kicker">PLAN PREVIEW</span><h3>{preview ? '审阅后再加入日历' : '描述目标与时间'}</h3></div>
        <button type="button" aria-label="关闭计划表单" onClick={() => { setOpen(false); setPreview(null); }}>×</button></header>
      {!preview ? <>
        <div className="sa-plan-fields"><label>计划目标<textarea rows={3} value={goal} onChange={event => { setGoal(event.target.value); setRequestKey(crypto.randomUUID()); }} minLength={5} maxLength={1000} required /></label>
          <label>计划名称（可选）<input value={title} onChange={event => { setTitle(event.target.value); setRequestKey(crypto.randomUUID()); }} maxLength={180} placeholder="系统会按学科和日期自动命名" /></label></div>
        <div className="sa-plan-fields"><label>目标日期<input type="date" value={targetDate} min={localDate()} onChange={event => { setTargetDate(event.target.value); setRequestKey(crypto.randomUUID()); }} required /></label>
          <label>首次开始<input type="datetime-local" value={firstSessionAt} onChange={event => { setFirstSessionAt(event.target.value); setRequestKey(crypto.randomUUID()); }} required /></label>
          <label>每次时长<select value={minutesPerDay} onChange={event => { setMinutesPerDay(Number(event.target.value)); setRequestKey(crypto.randomUUID()); }}>{[10, 15, 20, 25, 30, 40, 50, 60].map(value => <option key={value} value={value}>{value} 分钟</option>)}</select></label></div>
        <footer><span>只使用当前{subject === 'math' ? '数学' : subject === 'chinese' ? '语文' : subject === 'chemistry' ? '化学' : '英语'}已确认范围内、已发布且有教学依据的知识点；会避开现有日历冲突。</span>
          <button disabled={busy || !goal.trim() || !targetDate || !firstSessionAt}>{busy ? '正在编排…' : '预览学习计划'}</button></footer>
      </> : <>
        <div className="sa-plan-evidence">{preview.evidence.map(item => <article key={item.atomId} data-status={item.status}><strong>{item.atomName}</strong>
          <span>{item.status === 'fragile' ? '优先重建' : item.status === 'learning' ? '继续巩固' : item.status === 'secure' ? '维持迁移' : '证据不足'}</span><small>{item.reason}</small></article>)}</div>
        {preview.warnings.map(warning => <p className="sa-plan-warning" key={warning}>{warning}</p>)}
        <div className="sa-plan-sessions">{preview.sessions.map(session => <article key={session.id} data-kind={session.kind}>
          <span>{String(session.index).padStart(2, '0')} · {kindNames[session.kind]}</span><div><b>{session.title}</b><p>{session.objective}</p>
            <small>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(session.startsAt))} · {session.evidenceBasis}</small></div></article>)}</div>
        <p className="sa-plan-boundary">计划完成后仍需独立新题与延迟复测确认掌握；观看讲解、完成任务或勾选完成都不会直接提升掌握等级。</p>
        <footer><button type="button" onClick={() => setPreview(null)}>返回修改</button><button disabled={busy} onClick={() => void save()}>{busy ? '正在写入…' : '确认并加入日历'}</button></footer>
      </>}
    </form>}
    <div className="sa-plan-list">{plans.length ? plans.map(plan => <article className="sa-plan-card" key={plan.id} data-status={plan.status}>
      <header><div><span className="studio-kicker">{plan.status === 'completed' ? 'EXECUTED' : 'ACTIVE PLAN'} · REV {plan.revision}</span><h3>{plan.title}</h3><p>{plan.goal}</p></div>
        <div><strong>{plan.sessions.filter(item => item.status === 'completed').length}/{plan.sessions.length}</strong><small>任务完成</small></div></header>
      <div className="sa-plan-timeline">{plan.sessions.map(session => <div key={session.id} data-kind={session.kind} data-status={session.status}>
        <time>{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(session.startsAt))}</time>
        <span>{kindNames[session.kind]}</span><div><b>{session.title}</b><small>{statusNames[session.status]} · {session.atomIds.map(id => atomNames.get(id) ?? id).join('、')}</small><p>{session.evidenceBasis}</p></div>
        <div className="sa-plan-actions">{session.status === 'scheduled' && <><button disabled={busy} onClick={() => session.atomIds[0] && void openLesson(session.title, session.atomIds[0])}>看讲解</button>
          <button disabled={busy} onClick={() => session.atomIds[0] && openPractice(session.atomIds[0])}>做微测</button>
          <button disabled={busy} onClick={() => void sessionAction(plan, session.id, 'complete')}>完成</button><button disabled={busy} onClick={() => void sessionAction(plan, session.id, 'skip')}>跳过</button></>}
          {session.status !== 'scheduled' && <button disabled={busy} onClick={() => void sessionAction(plan, session.id, 'reopen')}>重新打开</button>}</div>
      </div>)}</div>
    </article>) : <div className="sa-plan-empty"><span className="studio-kicker">NO PLAN YET</span><h3>先测清优先点，再把下一步放上日历。</h3><p>{canCreate ? '系统会优先选择表现不稳、独立题族不足或尚未充分测量的知识点。' : '家长生成计划后，你可以在这里按步骤学习和做题。'}</p></div>}</div>
  </section>;
}
