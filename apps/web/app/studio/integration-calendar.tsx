'use client';
import * as React from 'react';
import type { KnowledgeAtom, StudioIntegrationOverview, StudioStudyPlan, StudioSubject, StudioWhiteboard } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { StudyPlanner } from './study-planner';

type Props = { studentId: string; subject: StudioSubject; value: StudioIntegrationOverview;
  plans: StudioStudyPlan[]; atoms: Array<Pick<KnowledgeAtom, 'id' | 'name' | 'objective'>>;
  canManage: boolean; openPlanner?: number; onChanged: () => Promise<void>; onError: (message: string) => void;
  onOpenWhiteboard: (whiteboard: StudioWhiteboard) => void };

export function IntegrationCalendar({ studentId, subject, value, plans, atoms, canManage, openPlanner = 0, onChanged, onError, onOpenWhiteboard }: Props) {
  const [adding, setAdding] = React.useState(false);
  const [planning, setPlanning] = React.useState(false);
  const [kind, setKind] = React.useState<'lms_ics' | 'calendar_ics'>('calendar_ics');
  const [label, setLabel] = React.useState('课程日历');
  const [feedUrl, setFeedUrl] = React.useState('');
  const [icsText, setIcsText] = React.useState('');
  const [planTitle, setPlanTitle] = React.useState('');
  const [planDescription, setPlanDescription] = React.useState('');
  const [planStart, setPlanStart] = React.useState('');
  const [minutes, setMinutes] = React.useState(25);
  const [requestKey, setRequestKey] = React.useState(() => crypto.randomUUID());
  const [busy, setBusy] = React.useState(false);
  async function run(work: () => Promise<void>) {
    setBusy(true); try { await work(); } catch (error) { onError((error as Error).message); } finally { setBusy(false); }
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault(); await run(async () => {
      await apiRequest('/learning/studio/integrations', { method: 'POST', body: JSON.stringify({ studentId, subject, kind, label, requestKey,
        ...(feedUrl.trim() ? { feedUrl: feedUrl.trim() } : { icsText }) }) });
      setFeedUrl(''); setIcsText(''); setAdding(false); setRequestKey(crypto.randomUUID()); await onChanged();
    });
  }
  function openForm(form: 'sync' | 'plan') {
    const start = new Date(Date.now() + 60 * 60_000); start.setMinutes(0, 0, 0);
    setPlanStart(new Date(start.getTime() - start.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
    setPlanTitle(`${subject === 'math' ? '数学' : subject === 'chinese' ? '语文' : '英语'}学习安排`);
    setAdding(form === 'sync'); setPlanning(form === 'plan'); setRequestKey(crypto.randomUUID());
  }
  React.useEffect(() => { if (openPlanner && canManage) openForm('plan'); }, [openPlanner, canManage]);
  async function createPlan(event: React.FormEvent) {
    event.preventDefault(); const start = new Date(planStart);
    if (!Number.isFinite(start.getTime())) { onError('请选择有效的学习开始时间'); return; }
    await run(async () => { await apiRequest('/learning/studio/calendar/events', { method: 'POST', body: JSON.stringify({
      studentId, subject, title: planTitle, description: planDescription, startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(), requestKey }) });
      setPlanning(false); setPlanDescription(''); setRequestKey(crypto.randomUUID()); await onChanged(); });
  }
  async function sync(id: string) { await run(async () => {
    await apiRequest(`/learning/studio/integrations/${encodeURIComponent(id)}/sync`, { method: 'POST' }); await onChanged();
  }); }
  async function disconnect(id: string) { await run(async () => {
    await apiRequest(`/learning/studio/integrations/${encodeURIComponent(id)}/disconnect`, { method: 'POST' }); await onChanged();
  }); }
  async function removeStudyEvent(id: string) { await run(async () => {
    await apiRequest(`/learning/studio/calendar/events/${encodeURIComponent(id)}/remove`, { method: 'POST' }); await onChanged();
  }); }
  async function exportCalendar() { await run(async () => {
    const result = await apiRequest<{ filename: string; content: string }>(
      `/learning/studio/calendar/export?studentId=${encodeURIComponent(studentId)}&subject=${subject}`);
    const url = URL.createObjectURL(new Blob([result.content], { type: 'text/calendar' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }); }
  const ordered = [...value.events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const groups = new Map<string, typeof ordered>();
  for (const item of ordered) {
    const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(item.startsAt));
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }
  const upcoming = ordered.filter(item => Date.parse(item.endsAt) >= Date.now()).length;
  const lmsCount = ordered.filter(item => item.source === 'lms').length;
  return <section className="sa-calendar-view">
    <header className="sa-page-head"><div><span className="studio-kicker">CALENDAR & LMS</span><h1>把课堂安排接回学习路径。</h1>
      <p>支持 Canvas/Schoology 等 LMS 导出的 ICS，也可连接公开或带令牌的日历订阅。</p></div>
      <div className="sa-page-actions">{canManage && <button onClick={() => openForm('plan')}>＋ 新建学习安排</button>}{canManage && <button onClick={() => openForm('sync')}>连接 LMS / 日历</button>}<button disabled={busy} onClick={() => void exportCalendar()}>导出 ICS</button></div></header>
    <div className="sa-calendar-summary"><article><span>UPCOMING</span><strong>{upcoming}</strong><small>待开始安排</small></article><article><span>SCHOOL</span><strong>{lmsCount}</strong><small>学校 LMS 任务</small></article><article><span>SOURCES</span><strong>{value.connectors.length}</strong><small>已连接来源</small></article><div><b>同步边界</b><p>订阅内容只读取日历字段；不上传学生作答，不把课程完成自动计为知识掌握。</p></div></div>
    <StudyPlanner studentId={studentId} subject={subject} plans={plans} atoms={atoms} canCreate={canManage}
      openRequest={openPlanner} onChanged={onChanged} onError={onError} onOpenWhiteboard={onOpenWhiteboard} />
    <div className="sa-connectors">{value.connectors.map(connector => <article key={connector.id}>
      <span data-kind={connector.kind}>{connector.kind === 'lms_ics' ? 'LMS' : 'ICS'}</span><div><strong>{connector.label}</strong>
        <small>{connector.sourceHost} · {connector.eventCount} 个日程 · {connector.lastSyncedAt ? new Date(connector.lastSyncedAt).toLocaleString('zh-CN') : '尚未同步'}</small>
        {connector.lastError && <em>{connector.lastError}</em>}</div>
      {canManage && <><button disabled={busy || !connector.sourceHost.includes('.')} onClick={() => void sync(connector.id)}>同步</button>
      <button disabled={busy} onClick={() => void disconnect(connector.id)}>撤销</button></>}
    </article>)}</div>
    {adding && <form className="sa-sync-form" onSubmit={connect}><header><div><span className="studio-kicker">ADD A SOURCE</span><h2>连接课程或日历</h2></div><button type="button" onClick={() => setAdding(false)}>×</button></header>
      <div><label>来源类型<select value={kind} onChange={event => { setKind(event.target.value as typeof kind); setLabel(event.target.value === 'lms_ics' ? '学校课程' : '课程日历'); setRequestKey(crypto.randomUUID()); }}><option value="calendar_ics">日历 ICS</option><option value="lms_ics">LMS / School Sync</option></select></label>
        <label>名称<input value={label} onChange={event => { setLabel(event.target.value); setRequestKey(crypto.randomUUID()); }} minLength={2} maxLength={120} required /></label></div>
      <label>订阅链接<input type="url" value={feedUrl} onChange={event => { setFeedUrl(event.target.value); setRequestKey(crypto.randomUUID()); }} placeholder="https://.../calendar.ics" /></label>
      {!feedUrl && <label>或粘贴 ICS 文件内容<textarea value={icsText} onChange={event => { setIcsText(event.target.value); setRequestKey(crypto.randomUUID()); }} rows={8} maxLength={2500000} placeholder="BEGIN:VCALENDAR…" /></label>}
      <footer><span>服务会验证地址、限制大小，并拒绝本机与局域网地址。订阅令牌加密保存，界面不回显。</span><button disabled={busy || !label.trim() || !feedUrl.trim() && !icsText.trim()}>{busy ? '正在同步…' : '连接并同步'}</button></footer>
    </form>}
    {planning && <form className="sa-sync-form sa-plan-form" onSubmit={createPlan}><header><div><span className="studio-kicker">STUDY PLANNER</span><h2>安排一段可执行的学习任务</h2><p>加入当前学生日历；是否掌握仍由后续独立题组和延迟复测验证。</p></div><button type="button" aria-label="关闭" onClick={() => setPlanning(false)}>×</button></header><div><label>任务名称<input value={planTitle} onChange={event => {setPlanTitle(event.target.value);setRequestKey(crypto.randomUUID())}} minLength={2} maxLength={160} required /></label><label>开始时间<input type="datetime-local" value={planStart} onChange={event => {setPlanStart(event.target.value);setRequestKey(crypto.randomUUID())}} required /></label></div><div><label>时长<select value={minutes} onChange={event => {setMinutes(Number(event.target.value));setRequestKey(crypto.randomUUID())}}><option value={15}>15 分钟</option><option value={25}>25 分钟</option><option value={40}>40 分钟</option><option value={60}>60 分钟</option></select></label><label>完成标准<input value={planDescription} onChange={event => {setPlanDescription(event.target.value);setRequestKey(crypto.randomUUID())}} maxLength={1500} placeholder="例如：独立完成 5 道新题并说出关键步骤" /></label></div><footer><span>创建后可导出为 ICS；删除只影响 StudyAgent 任务。</span><button disabled={busy || !planTitle.trim()}>{busy ? '正在加入…' : '加入学习日历'}</button></footer></form>}
    <div className="sa-calendar-grid">
      <aside><span className="studio-kicker">UPCOMING</span><strong>{ordered.length}</strong><p>个已同步日程</p><small>来自学校课程、日历订阅与 StudyAgent 活动。</small></aside>
      <main>{groups.size ? [...groups.entries()].map(([date, events]) => <section key={date}><header><time>{date}</time><small>{events.length} 个安排</small></header>
        {events.map(event => <article key={event.id} data-source={event.source}><span>{event.allDay ? '全天' : new Date(event.startsAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span><div><h2>{event.title}</h2><p>{event.description || '来自已连接日历的学习安排'}</p><small>{event.source === 'lms' ? '学校 LMS' : event.source === 'calendar' ? '外部日历' : 'StudyAgent 计划'}</small></div>{canManage && event.source === 'studyagent' && <button aria-label={`删除 ${event.title}`} disabled={busy} onClick={() => void removeStudyEvent(event.id)}>×</button>}</article>)}</section>)
        : <div className="sa-calendar-empty"><span className="studio-kicker">NO EVENTS YET</span><h2>课程安排会出现在这里。</h2><p>从 Canvas 或学校 LMS 导出 `.ics`，或先安排一段可以完成的学习任务。</p>{canManage && <div><button onClick={() => openForm('plan')}>新建学习安排</button><button onClick={() => openForm('sync')}>连接第一个来源</button></div>}</div>}
      </main></div>
  </section>;
}
