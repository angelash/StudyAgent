'use client';
import * as React from 'react';
import type { PaperReviewCalendarEvent, PaperReviewScope } from '@study-agent/contracts';
import type { SessionUser } from '../../lib/session-user';
import { paperPracticeFailure, usePaperPracticeApi } from '../../lib/paper-practice-api';

export function usePaperReviewCalendar(user: SessionUser, studentId: string, from: string, to: string) {
  const { call, alive } = usePaperPracticeApi();
  const [scope, setScope] = React.useState<PaperReviewScope>(user.role === 'student' ? 'learner' : 'mine'), [reload, setReload] = React.useState(0);
  const [result, setResult] = React.useState<{ key: string; events: PaperReviewCalendarEvent[]; error: string; busy: boolean } | null>(null);
  const [exporting, setExporting] = React.useState(false), [exportError, setExportError] = React.useState<{ key: string; message: string } | null>(null);
  const actualScope = user.role === 'student' ? 'learner' : scope;
  const query = new URLSearchParams({ scope: actualScope, from, to, ...(studentId ? { studentId } : {}) }).toString();
  const key = user.id + ':' + query, valid = actualScope !== 'learner' || Boolean(studentId), keyRef = React.useRef(key);
  keyRef.current = key;
  React.useEffect(() => {
    const restore = () => setScope(new URLSearchParams(window.location.search).get('reviewScope') === 'learner' ? 'learner' : 'mine');
    restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, []);
  React.useEffect(() => {
    if (!valid) return;
    let current = true; const controller = new AbortController();
    setResult({ key, events: [], error: '', busy: true });
    void call<{ events: PaperReviewCalendarEvent[] }>('/library/practice/reviews/calendar?' + query, undefined, controller.signal)
      .then(value => { if (current) setResult({ key, events: value.events, error: '', busy: false }); })
      .catch(caught => { if (current) setResult({ key, events: [], error: paperPracticeFailure(caught), busy: false }); });
    return () => { current = false; controller.abort(); };
  }, [key, query, valid, reload, call]);
  function changeScope(next: PaperReviewScope) {
    if (user.role === 'student') return; setScope(next);
    const url = new URL(window.location.href); url.searchParams.set('reviewScope', next); window.history.replaceState(null, '', url.pathname + url.search);
  }
  async function exportCalendar() {
    if (!valid || exporting) return; const observed = key; setExporting(true); setExportError(null);
    try {
      const value = await call<{ content: string; filename: string }>('/library/practice/reviews/calendar/export?' + query);
      if (!alive.current || keyRef.current !== observed) return;
      const url = URL.createObjectURL(new Blob([value.content], { type: 'text/calendar;charset=utf-8' })), link = document.createElement('a');
      link.href = url; link.download = value.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (caught) { if (alive.current && keyRef.current === observed) setExportError({ key: observed, message: paperPracticeFailure(caught) }); }
    finally { if (alive.current) setExporting(false); }
  }
  const visible = result?.key === key ? result : null;
  return { scope: actualScope, setScope: changeScope, valid, events: valid ? visible?.events ?? [] : [], busy: valid && (!visible || visible.busy),
    error: valid ? visible?.error ?? '' : '', exportError: exportError?.key === key ? exportError.message : '', exporting,
    reload: () => setReload(value => value + 1), exportCalendar };
}

export function PaperReviewCalendarControls({ user, studentId, calendar }: { user: SessionUser; studentId: string; calendar: ReturnType<typeof usePaperReviewCalendar> }) {
  return <section className="ws-paper-reviews" aria-label="日历中的原卷复习"><div><strong>原卷复习 · 不限学科</strong>
    <label>原卷作答范围<select value={calendar.scope} disabled={user.role === 'student'} onChange={event => calendar.setScope(event.target.value as PaperReviewScope)}>
      <option value="mine">{studentId ? '本人对当前孩子的陪练' : '本人的练习与陪练'}</option><option value="learner">当前孩子学习账号（只读）</option>
    </select></label><button type="button" disabled={calendar.busy || !calendar.valid} onClick={calendar.reload}>刷新原卷安排</button></div>
    <p>计划日期与实际回看分别保留。进入原题记录回看，首答与能力证据各自保存。</p>
    {!calendar.valid && <p role="status">请先选择有权查看的孩子，再读取学习账号安排。</p>}
    {calendar.busy && <p role="status">正在读取原卷安排…</p>}
    {(calendar.error || calendar.exportError) && <p role="alert">原卷安排未能读取或导出：{calendar.error || calendar.exportError}</p>}
    <button type="button" disabled={!calendar.valid || calendar.busy || calendar.exporting || !!calendar.error} onClick={() => void calendar.exportCalendar()}>{calendar.exporting ? '正在导出原卷安排…' : '导出当前范围原卷 ICS'}</button>
  </section>;
}
