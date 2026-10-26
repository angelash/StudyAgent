'use client';
import * as React from 'react';
import type { KnowledgeAtom, StudioIntegrationOverview, StudioStudyPlan, StudioSubject, StudioWhiteboard } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { StudyPlanner } from './study-planner';
import { CalendarBoard } from './calendar-board';
import { WorkspaceDialog } from './workspace-dialog';
import type { SessionUser } from '../../lib/session-user';

type Props = { user: SessionUser; studentId: string; subject: StudioSubject; value: StudioIntegrationOverview;
  plans: StudioStudyPlan[]; atoms: Array<Pick<KnowledgeAtom, 'id' | 'name' | 'objective'>>;
  canManage: boolean; openPlanner?: number; onChanged: () => Promise<void>; onError: (message: string) => void;
  onOpenWhiteboard: (whiteboard: StudioWhiteboard) => void };

export function IntegrationCalendar({ user, studentId, subject, value, plans, atoms, canManage, openPlanner = 0, onChanged, onError, onOpenWhiteboard }: Props) {
  const [management, setManagement] = React.useState(false);
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
  const [dialogError, setDialogError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  async function run(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setDialogError(''); onError(''); try { await work(); } catch (error) { setDialogError((error as Error).message); onError((error as Error).message); } finally { setBusy(false); }
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault(); await run(async () => {
      await apiRequest('/learning/studio/integrations', { method: 'POST', body: JSON.stringify({ studentId, subject, kind, label, requestKey,
        ...(feedUrl.trim() ? { feedUrl: feedUrl.trim() } : { icsText }) }) });
      setFeedUrl(''); setIcsText(''); setAdding(false); setRequestKey(crypto.randomUUID()); await onChanged();
    });
  }
  function openForm(form: 'sync' | 'plan', day?: string) {
    const start = new Date(Date.now() + 60 * 60_000); start.setMinutes(0, 0, 0);
    if(day){const selected=new Date(day+'T12:00:00');start.setFullYear(selected.getFullYear(),selected.getMonth(),selected.getDate());}
    setPlanStart(new Date(start.getTime() - start.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
    setPlanTitle(`${subject === 'math' ? '数学' : subject === 'chinese' ? '语文' : '英语'}学习安排`);
    setDialogError(''); setAdding(form === 'sync'); setPlanning(form === 'plan'); setRequestKey(crypto.randomUUID());
  }
  React.useEffect(() => { if (openPlanner && canManage) setManagement(true); }, [openPlanner, canManage]);
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
  async function exportCalendar() { await run(async () => {
    const result = await apiRequest<{ filename: string; content: string }>(
      `/learning/studio/calendar/export?studentId=${encodeURIComponent(studentId)}&subject=${subject}`);
    const url = URL.createObjectURL(new Blob([result.content], { type: 'text/calendar' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }); }
  return <section className="sa-calendar-view ws-calendar-view">
    {!studentId && <div className="ws-calendar-adult"><p>这里显示本人的原卷复习；课程计划需要先选择学习档案。</p><a href="/parent/dashboard">打开学习档案 →</a></div>}<CalendarBoard user={user} studentId={studentId} events={value.events} plans={plans} canManage={canManage && Boolean(studentId)}
      onNew={day=>openForm('plan',day)} onSources={()=>openForm('sync')} onPlanner={()=>setManagement(!management)} onExport={()=>void exportCalendar()}
      onChanged={onChanged} onError={onError}/>
    <details className="ws-calendar-management" open={management} onToggle={event=>setManagement(event.currentTarget.open)}><summary>学习计划与同步来源</summary>
    <StudyPlanner studentId={studentId} subject={subject} plans={plans} atoms={atoms} canCreate={canManage&&Boolean(studentId)}
      openRequest={openPlanner} onChanged={onChanged} onError={onError} onOpenWhiteboard={onOpenWhiteboard}/>
    <div className="sa-connectors">{value.connectors.map(connector=><article key={connector.id}><span>{connector.kind==='lms_ics'?'LMS':'ICS'}</span><div><strong>{connector.label}</strong><small>{connector.sourceHost} · {connector.eventCount} 个日程</small>{connector.lastError&&<em>{connector.lastError}</em>}</div>{canManage&&<><button disabled={busy||!connector.sourceHost.includes('.')} onClick={()=>void sync(connector.id)}>同步</button><button disabled={busy} onClick={()=>void disconnect(connector.id)}>撤销连接</button></>}</article>)}</div>
    </details>
    {adding && <WorkspaceDialog onClose={() => setAdding(false)} busy={busy}><form role="dialog" aria-modal="true" aria-label="连接课程或日历" className="sa-sync-form" onSubmit={connect}><header><div><span className="studio-kicker">ADD A SOURCE</span><h2>连接课程或日历</h2></div><button type="button" onClick={() => setAdding(false)}>×</button></header>
      <div><label>来源类型<select value={kind} onChange={event => { setKind(event.target.value as typeof kind); setLabel(event.target.value === 'lms_ics' ? '学校课程' : '课程日历'); setRequestKey(crypto.randomUUID()); }}><option value="calendar_ics">日历 ICS</option><option value="lms_ics">LMS / School Sync</option></select></label>
        <label>名称<input value={label} onChange={event => { setLabel(event.target.value); setRequestKey(crypto.randomUUID()); }} minLength={2} maxLength={120} required /></label></div>
      <label>订阅链接<input type="url" value={feedUrl} onChange={event => { setFeedUrl(event.target.value); setRequestKey(crypto.randomUUID()); }} placeholder="https://.../calendar.ics" /></label>
      {!feedUrl && <label>或粘贴 ICS 文件内容<textarea value={icsText} onChange={event => { setIcsText(event.target.value); setRequestKey(crypto.randomUUID()); }} rows={8} maxLength={2500000} placeholder="BEGIN:VCALENDAR…" /></label>}
      {dialogError && <p className="ws-dialog-error" role="alert">{dialogError}</p>}<footer><span>支持可导出的 ICS 订阅与文件内容，订阅链接仅用于读取日程。</span><button disabled={busy || !label.trim() || !feedUrl.trim() && !icsText.trim()}>{busy ? '正在同步…' : '连接并同步'}</button></footer>
    </form></WorkspaceDialog>}
    {planning && <WorkspaceDialog onClose={() => setPlanning(false)} busy={busy}><form role="dialog" aria-modal="true" aria-label="新建学习安排" className="sa-sync-form sa-plan-form" onSubmit={createPlan}><header><div><span className="studio-kicker">STUDY PLANNER</span><h2>安排一段可执行的学习任务</h2><p>加入当前学生日历；是否掌握仍由后续独立题组和延迟复测验证。</p></div><button type="button" aria-label="关闭" onClick={() => setPlanning(false)}>×</button></header><div><label>任务名称<input value={planTitle} onChange={event => {setPlanTitle(event.target.value);setRequestKey(crypto.randomUUID())}} minLength={2} maxLength={160} required /></label><label>开始时间<input type="datetime-local" value={planStart} onChange={event => {setPlanStart(event.target.value);setRequestKey(crypto.randomUUID())}} required /></label></div><div><label>时长<select value={minutes} onChange={event => {setMinutes(Number(event.target.value));setRequestKey(crypto.randomUUID())}}><option value={15}>15 分钟</option><option value={25}>25 分钟</option><option value={40}>40 分钟</option><option value={60}>60 分钟</option></select></label><label>完成标准<input value={planDescription} onChange={event => {setPlanDescription(event.target.value);setRequestKey(crypto.randomUUID())}} maxLength={1500} placeholder="例如：独立完成 5 道新题并说出关键步骤" /></label></div>{dialogError && <p className="ws-dialog-error" role="alert">{dialogError}</p>}<footer><span>创建后可编辑、完成或导出为 ICS。</span><button disabled={busy || !planTitle.trim()}>{busy ? '正在加入…' : '加入学习日历'}</button></footer></form></WorkspaceDialog>}
  </section>;
}
