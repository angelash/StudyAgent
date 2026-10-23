'use client';
import * as React from 'react';
import type { StudioScheduleEvent, StudioStudyPlan } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import { WorkspaceDialog } from './workspace-dialog';

export function calendarDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function dayDate(value: string) { return new Date(value + 'T12:00:00'); }
function includesDay(event: StudioScheduleEvent, day: string) {
  const start = event.allDay ? event.startsAt.slice(0, 10) : calendarDate(new Date(event.startsAt));
  const last = new Date(Math.max(Date.parse(event.startsAt), Date.parse(event.endsAt) - 1));
  const end = event.allDay ? last.toISOString().slice(0, 10) : calendarDate(last);
  return start <= day && day <= end;
}
function inputTime(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function queryDay() { const day = new URLSearchParams(window.location.search).get('date'); return day && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(dayDate(day).getTime()) && calendarDate(dayDate(day)) === day ? day : calendarDate(new Date()); }

export function CalendarBoard({ events, plans, canManage, onNew, onSources, onPlanner, onExport, onChanged, onError }: {
  events: StudioScheduleEvent[]; plans: StudioStudyPlan[]; canManage: boolean; onNew: (day: string) => void;
  onSources: () => void; onPlanner: () => void; onExport: () => void; onChanged: () => Promise<void>; onError: (error: string) => void;
}) {
  const [day, setDay] = React.useState(() => calendarDate(new Date()));
  const [mode, setMode] = React.useState<'month' | 'week'>('month'), [filter, setFilter] = React.useState<'confirmed' | 'pending'>('confirmed');
  const [selectedId, setSelectedId] = React.useState(''), [batch, setBatch] = React.useState(false), [checked, setChecked] = React.useState<string[]>([]);
  const [dialogError, setDialogError] = React.useState('');
  const [deleting, setDeleting] = React.useState(false), [busy, setBusy] = React.useState(false), [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(''), [description, setDescription] = React.useState(''), [start, setStart] = React.useState(''), [end, setEnd] = React.useState('');
  React.useEffect(() => { setChecked([]); setDeleting(false); }, [day, mode, filter]);
  React.useEffect(() => { const restore = () => { setDay(queryDay()); const params = new URLSearchParams(window.location.search); setMode(params.get('mode') === 'week' ? 'week' : 'month'); setFilter(params.get('tasks') === 'pending' ? 'pending' : 'confirmed'); setChecked([]); }; restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore); }, []);
  function selectDate(value: string) { setDay(value); const url = new URL(window.location.href); url.searchParams.set('date', value); window.history.replaceState(null, '', url.pathname + url.search); }
  function changeMode(value: typeof mode) { setMode(value); const url = new URL(window.location.href); url.searchParams.set('mode', value); window.history.replaceState(null, '', url.pathname + url.search); }
  function changeFilter(value: typeof filter) { setFilter(value); const url = new URL(window.location.href); url.searchParams.set('tasks', value); window.history.replaceState(null, '', url.pathname + url.search); }
  const date = dayDate(day), first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const gridStart = mode === 'month' ? new Date(first) : new Date(date); gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const count = mode === 'week' ? 7 : Math.ceil((first.getDay() + new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) / 7) * 7;
  const days = Array.from({ length: count }, (_, index) => { const value = new Date(gridStart); value.setDate(value.getDate() + index); return value; });
  const filtered = events.filter(event => filter === 'pending' ? event.confirmed === false : event.confirmed !== false);
  const selectedDay = filtered.filter(event => includesDay(event, day)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const selected = events.find(event => event.id === selectedId), completed = selectedDay.filter(event => event.status === 'completed'), pending = selectedDay.filter(event => event.status !== 'completed' && event.status !== 'skipped');
  const removable = filtered.filter(event => event.source === 'studyagent' && !event.planId && days.some(date => includesDay(event, calendarDate(date))));
  async function run(work: () => Promise<void>) { if (busy) return; setBusy(true); onError(''); setDialogError(''); try { await work(); await onChanged(); } catch (error) { setDialogError((error as Error).message); onError((error as Error).message); } finally { setBusy(false); } }
  function openEvent(event: StudioScheduleEvent) { setSelectedId(event.id); setDialogError(''); setEditing(false); setTitle(event.title); setDescription(event.description); setStart(inputTime(event.startsAt)); setEnd(inputTime(event.endsAt)); }
  async function update(event: StudioScheduleEvent, changes: object) { await apiRequest('/learning/studio/calendar/events/' + encodeURIComponent(event.id) + '/update', { method: 'POST', body: JSON.stringify({ expectedRevision: event.revision ?? 0, ...changes }) }); }
  async function status(event: StudioScheduleEvent, value: 'completed' | 'scheduled' | 'skipped') {
    if (event.planId) {
      const plan = plans.find(plan => plan.id === event.planId); if (!plan) throw new Error('计划已变化，请刷新后重试');
      await apiRequest('/learning/studio/study-plans/' + encodeURIComponent(plan.id) + '/sessions/' + encodeURIComponent(event.planSessionId!), { method: 'POST', body: JSON.stringify({ action: value === 'completed' ? 'complete' : value === 'skipped' ? 'skip' : 'reopen', expectedRevision: plan.revision, requestKey: crypto.randomUUID() }) });
    } else await update(event, { status: value });
  }
  function shift(direction: number) { const value = new Date(date); if (mode === 'month') { value.setDate(1); value.setMonth(value.getMonth() + direction); } else value.setDate(value.getDate() + 7 * direction); selectDate(calendarDate(value)); }
  return <div className="ws-calendar"><aside className="ws-day-sidebar"><section className="ws-date-card"><h1>▦ 日历</h1><button onClick={() => selectDate(calendarDate(new Date()))}>今天</button><strong>{date.getDate()}</strong><p>{date.toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}</p><div><span>{selectedDay.length} 项安排</span><span>{pending.length} 个待办</span></div></section>
    <section className="ws-day-todo"><header><h2>{day === calendarDate(new Date()) ? '今日待办' : '当日待办'}</h2>{canManage && <button aria-label="添加当日任务" onClick={() => onNew(day)}>＋</button>}</header>
      {pending.length ? pending.map(event => <button className="ws-day-event" key={event.id} onClick={() => openEvent(event)}><time>{event.allDay ? '全天' : new Date(event.startsAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time><b>{event.title}</b><small>{event.source === 'studyagent' ? '学习安排' : '订阅日程'}</small></button>) : <p className="ws-day-empty">{filter === 'pending' ? '当天没有待确认任务' : '今天没有任务'}</p>}</section>
    <section className="ws-day-done"><h2>已完成</h2>{completed.length ? completed.map(event => <button className="ws-day-event" key={event.id} onClick={() => openEvent(event)}>✓ {event.title}</button>) : <p className="ws-day-empty">完成的任务会显示在这里</p>}</section>
  </aside><section className="ws-calendar-paper"><header className="ws-calendar-toolbar"><div role="tablist" aria-label="任务确认状态"><button role="tab" aria-selected={filter === 'confirmed'} onClick={() => changeFilter('confirmed')}>已确认任务</button><button role="tab" aria-selected={filter === 'pending'} onClick={() => changeFilter('pending')}>待处理任务</button></div>
    {canManage && <button className="ws-batch-delete" onClick={() => { setBatch(!batch); setChecked([]); }}>{batch ? '退出选择' : '批量删除日程'}</button>}
    <div className="ws-calendar-month"><button aria-label="上一个日期范围" onClick={() => shift(-1)}>‹</button><h2>{date.getFullYear()}年{date.getMonth() + 1}月</h2><button aria-label="下一个日期范围" onClick={() => shift(1)}>›</button></div>
    <div className="ws-calendar-modes"><button aria-pressed={mode === 'week'} onClick={() => changeMode('week')}>周视图</button><button aria-pressed={mode === 'month'} onClick={() => changeMode('month')}>月视图</button></div>
  </header>{batch && <div className="ws-batch-actions"><label><input type="checkbox" checked={Boolean(removable.length) && removable.every(event => checked.includes(event.id))} onChange={event => setChecked(event.target.checked ? removable.map(row => row.id) : [])}/>选择当前范围的手动安排</label><span>{checked.length} 项</span><button disabled={busy || !checked.length} onClick={() => setDeleting(true)}>删除所选</button><small>计划任务与订阅日程保留</small></div>}
    <div className="ws-weekdays">{'日一二三四五六'.split('').map(label => <span key={label}>{label}</span>)}</div>
    <div className="ws-month-grid" data-mode={mode} style={{ '--calendar-rows': count / 7 } as React.CSSProperties}>{days.map(value => { const key = calendarDate(value), items = filtered.filter(event => includesDay(event, key));
      return <section key={key} className="ws-calendar-day" data-outside={value.getMonth() !== date.getMonth()} data-selected={key === day} data-today={key === calendarDate(new Date())}>
        <button className="ws-calendar-date" aria-label={'选择日期 ' + key} aria-pressed={key === day} onClick={() => selectDate(key)}>{value.getDate()}</button>
        <div className="ws-calendar-day-events">{items.map(event => <div key={event.id} className="ws-grid-event" data-completed={event.status === 'completed'}>{batch && event.source === 'studyagent' && !event.planId && <input type="checkbox" aria-label={'选择日程 ' + event.title} checked={checked.includes(event.id)} onChange={change => setChecked(ids => change.target.checked ? [...new Set([...ids, event.id])] : ids.filter(id => id !== event.id))}/>}
          <button title={event.title} onClick={() => { selectDate(key); openEvent(event); }}>{event.status === 'completed' ? '✓ ' : ''}{!event.allDay && <time>{new Date(event.startsAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} </time>}{event.title}</button></div>)}</div>
      </section>; })}</div>
    <footer className="ws-calendar-tools">{canManage && <button onClick={() => onNew(day)}>＋ 新建学习安排</button>}<button onClick={onSources}>连接 LMS / 日历</button><button onClick={onPlanner}>学习计划与同步管理</button><button onClick={onExport}>导出 ICS</button></footer>
  </section>
  {selected && <WorkspaceDialog onClose={() => setSelectedId('')} busy={busy}><section className="ws-event-dialog" role="dialog" aria-modal="true" aria-label="学习安排详情"><header><h2>{editing ? '编辑学习安排' : selected.title}</h2><button aria-label="关闭日程详情" onClick={() => setSelectedId('')}>×</button></header>
    {dialogError && !deleting && <p className="ws-dialog-error" role="alert">{dialogError}</p>}{editing ? <form onSubmit={event => { event.preventDefault(); void run(async () => { await update(selected, { title, description, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }); setEditing(false); }); }}><label>任务名称<input required minLength={2} maxLength={160} value={title} onChange={event => setTitle(event.target.value)}/></label><label>完成标准<input maxLength={1500} value={description} onChange={event => setDescription(event.target.value)}/></label><label>开始时间<input type="datetime-local" required value={start} onChange={event => setStart(event.target.value)}/></label><label>结束时间<input type="datetime-local" required value={end} onChange={event => setEnd(event.target.value)}/></label><button disabled={busy}>保存修改</button></form>
      : <><p>{new Date(selected.startsAt).toLocaleString('zh-CN')} — {new Date(selected.endsAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</p><p>{selected.description || '未填写完成标准'}</p><small>{selected.source !== 'studyagent' ? '来自订阅的只读日程' : selected.planId ? '学习计划任务' : '手动学习安排'} · {selected.status === 'completed' ? '已完成' : selected.status === 'skipped' ? '已跳过' : selected.confirmed === false ? '待处理' : '已确认'}</small>
      {(canManage || Boolean(selected.planId)) && selected.source === 'studyagent' && <footer>{selected.confirmed === false && <button disabled={busy} onClick={() => void run(() => update(selected, { confirmed: true }))}>确认安排</button>}
        <button disabled={busy} onClick={() => void run(() => status(selected, selected.status === 'completed' ? 'scheduled' : 'completed'))}>{selected.status === 'completed' ? '重新打开' : '标记完成'}</button>
        {!selected.planId && canManage && <><button onClick={() => setEditing(true)}>编辑时间与内容</button><button disabled={busy} onClick={() => void run(() => update(selected, { confirmed: selected.confirmed === false }))}>{selected.confirmed === false ? '确认任务' : '移至待处理'}</button><button onClick={() => { setChecked([selected.id]); setDeleting(true); }}>删除安排</button></>}</footer>}</>}
  </section></WorkspaceDialog>}
  {deleting && <WorkspaceDialog onClose={() => setDeleting(false)} busy={busy}><section className="ws-event-dialog" role="dialog" aria-modal="true" aria-label="确认删除学习安排"><h2>删除 {checked.length} 个学习安排？</h2><p>所选手动安排将被移除。</p>{dialogError && <p className="ws-dialog-error" role="alert">{dialogError}</p>}<footer><button onClick={() => setDeleting(false)}>取消</button><button disabled={busy} onClick={() => void run(async () => { await apiRequest('/learning/studio/calendar/batch-remove', { method: 'POST', body: JSON.stringify({ ids: checked }) }); setSelectedId(''); setChecked([]); setDeleting(false); setBatch(false); })}>确认删除</button></footer></section></WorkspaceDialog>}
  </div>;
}
