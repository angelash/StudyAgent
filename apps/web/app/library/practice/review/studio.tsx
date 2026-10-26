'use client';
import * as React from 'react';
import type { PaperReviewCalendarEvent, PaperReviewFilter, PaperReviewList, PaperReviewScope } from '@study-agent/contracts';
import { useSessionStatus, refreshSessionUser, type SessionUser } from '../../../../lib/session-user';
import { paperPracticeFailure, usePaperPracticeApi } from '../../../../lib/paper-practice-api';
import { StudyNav } from '../../../../components/study-nav';
import { PaperPracticeSession } from '../session';
import '../../../student/assessment/studio.css';
import '../practice.css';
import '../review.css';
import { paperCalendarReturn, paperReviewCalendarHref } from '../../../../lib/paper-review-navigation';

const filters: Record<PaperReviewFilter, string> = { needs_review: '待复习', unsure: '尚待核对', favorites: '我的收藏', reviewed: '已实际回看', archived: '已归档', unanswered: '尚未作答', all: '全部记录' };
type Query = { scope: PaperReviewScope; studentId: string; filter: PaperReviewFilter; q: string; tag: string; paperId: string; page: number };
function queryString(value: Query) { return new URLSearchParams({ scope: value.scope, filter: value.filter, page: String(value.page), ...(value.studentId ? { studentId: value.studentId } : {}), ...(value.q ? { q: value.q } : {}), ...(value.tag ? { tag: value.tag } : {}), ...(value.paperId ? { paperId: value.paperId } : {}) }).toString(); }
export function PaperReviewStudio() {
  const identity = useSessionStatus();
  return <main className="paper-practice learning-studio"><StudyNav current="library" />{identity.status === 'anonymous' ? <section className="pp-empty"><h1>回到自己的思考，再走下一步。</h1><a href="/parent/login">登录后继续原卷复习 ↗</a></section> : identity.status === 'unavailable' ? <section className="pp-empty"><h1>暂时无法核对当前身份。</h1><button onClick={() => void refreshSessionUser()}>重新读取登录状态</button></section> : !identity.user ? <p role="status">正在核对当前学习身份…</p> : <AuthorizedReview key={identity.user.id} user={identity.user} />}</main>;
}
function AuthorizedReview({ user }: { user: SessionUser }) {
  const [search, setSearch] = React.useState<string | null>(null);
  React.useEffect(() => { const restore = () => setSearch(window.location.search); restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore); }, []);
  if (search === null) return <p role="status">正在恢复复习位置…</p>;
  const params = new URLSearchParams(search), session = params.get('session');
  if (session) { const calendar = paperCalendarReturn(params.get('calendarReturn')); params.delete('session'); params.delete('item'); return <><div className="pp-shell">{calendar && <a className="studio-secondary" href={calendar}>← 返回原日期与课程日历</a>}<a className="studio-secondary" href={'/library/practice/review?' + params.toString()}>← 返回原筛选与复习清单</a><p className="pp-review-identity">原练习中的首答与订正保持，下面继续整理这道题。</p></div><PaperPracticeSession key={session} user={user} sessionId={session} /></>; }
  return <ReviewList key={search} user={user} />;
}
function ReviewList({ user }: { user: SessionUser }) {
  const { call, alive } = usePaperPracticeApi();
  const [children, setChildren] = React.useState<Array<{ id: string; nickname: string }>>([]), [query, setQuery] = React.useState<Query | null>(null), [editing, setEditing] = React.useState<Query | null>(null);
  const [list, setList] = React.useState<PaperReviewList | null>(null), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), [reload, setReload] = React.useState(0);
  const [month, setMonth] = React.useState(() => { const date = new Date(); return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0'); });
  const [events, setEvents] = React.useState<PaperReviewCalendarEvent[]>([]), [calendarError, setCalendarError] = React.useState(''), [calendarBusy, setCalendarBusy] = React.useState(false);
  React.useEffect(() => {
    let current = true; const controller = new AbortController();
    void call<Array<{ id: string; nickname: string }>>('/learning/students', undefined, controller.signal).then(rows => {
      if (!current) return; setChildren(rows); const params = new URLSearchParams(window.location.search), selected = params.get('studentId') ?? '';
      if (selected && !rows.some(row => row.id === selected)) throw new Error('原链接中的孩子目前不可读取，请重新选择。');
      const requested = params.get('filter') ?? 'needs_review', page = Number(params.get('page') ?? '1');
      const next: Query = { scope: user.role === 'student' ? 'learner' : params.get('scope') === 'learner' ? 'learner' : 'mine', studentId: user.role === 'student' ? rows[0]?.id ?? '' : selected,
        filter: Object.hasOwn(filters, requested) ? requested as PaperReviewFilter : 'needs_review', q: params.get('q') ?? '', tag: params.get('tag') ?? '', paperId: params.get('paperId') ?? '', page: Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1 };
      if (user.role === 'student' && !next.studentId) throw new Error('当前学习档案不可用，请由家长重新开启。'); setEditing(next); setQuery(next);
    }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); });
    return () => { current = false; controller.abort(); };
  }, [call, user.role]);
  const key = query ? queryString(query) : '';
  React.useEffect(() => {
    if (!query || query.scope === 'learner' && !query.studentId) { setList(null); return; }
    let current = true; const controller = new AbortController(); setBusy(true); setError(''); setList(null);
    void call<PaperReviewList>('/library/practice/reviews?' + key, undefined, controller.signal).then(value => { if (current) setList(value); }).catch(caught => { if (current) setError(paperPracticeFailure(caught)); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; controller.abort(); };
  }, [key, call, reload]);
  const validMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month);
  const end = validMonth ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) : '';
  const calendarQuery = new URLSearchParams({ from: month + '-01', to: end, scope: query?.scope ?? 'mine', ...(query?.studentId ? { studentId: query.studentId } : {}) }).toString();
  React.useEffect(() => {
    if (!query || !validMonth || query.scope === 'learner' && !query.studentId) { setEvents([]); return; }
    let current = true; const controller = new AbortController(); setCalendarBusy(true); setCalendarError(''); setEvents([]);
    void call<{ events: PaperReviewCalendarEvent[] }>('/library/practice/reviews/calendar?' + calendarQuery, undefined, controller.signal).then(value => { if (current) setEvents(value.events); }).catch(caught => { if (current) setCalendarError(paperPracticeFailure(caught)); }).finally(() => { if (current) setCalendarBusy(false); });
    return () => { current = false; controller.abort(); };
  }, [calendarQuery, call, reload]);
  function apply(next: Query) { setQuery(next); setEditing(next); window.history.replaceState({}, '', '/library/practice/review?' + queryString(next)); }
  async function exportCalendar() {
    setCalendarError('');
    try {
      const value = await call<{ content: string; filename: string }>('/library/practice/reviews/calendar/export?' + calendarQuery); if (!alive.current) return;
      const url = URL.createObjectURL(new Blob([value.content], { type: 'text/calendar;charset=utf-8' })), link = document.createElement('a'); link.href = url; link.download = value.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (caught) { if (alive.current) setCalendarError(paperPracticeFailure(caught)); }
  }
  return <div className="pp-shell"><header className="pp-session-heading"><a href="/library/practice">← 练习历史</a><a href="/library">原卷库 ↗</a></header><small className="pp-eyebrow">REVISIT YOUR THINKING</small><h1>把每一次卡住，变成下一步。</h1><p className="pp-intro">找到要复习的原题，保留当时的思考，再把错误步骤和新的理解写具体。</p>
    {editing && <form onSubmit={event => { event.preventDefault(); apply({ ...editing, page: 1 }); }}><div className="pp-review-filters">
      {user.role !== 'student' && <label>作答身份<select value={editing.scope} onChange={event => setEditing({ ...editing, scope: event.target.value as PaperReviewScope })}><option value="mine">本人练习与陪练</option><option value="learner">孩子学习账号记录（只读）</option></select></label>}
      {children.length > 0 && <label>孩子范围<select disabled={user.role === 'student'} value={editing.studentId} onChange={event => setEditing({ ...editing, studentId: event.target.value })}><option value="">{editing.scope === 'mine' ? '全部本人记录' : '请选择孩子'}</option>{children.map(child => <option key={child.id} value={child.id}>{child.nickname}</option>)}</select></label>}
      <label>查看哪些记录<select value={editing.filter} onChange={event => setEditing({ ...editing, filter: event.target.value as PaperReviewFilter })}>{Object.entries(filters).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
    </div><details className="pp-review-more-filters"><summary>搜索与更多筛选{editing.q || editing.tag || editing.paperId ? ' · 已设置条件' : ''}</summary><div className="pp-review-filters">
      <label>搜索题卷、错误步骤或反思<input maxLength={200} value={editing.q} onChange={event => setEditing({ ...editing, q: event.target.value })} /></label><label>标签<input maxLength={40} value={editing.tag} onChange={event => setEditing({ ...editing, tag: event.target.value })} /></label><label>原卷编号<input maxLength={180} value={editing.paperId} onChange={event => setEditing({ ...editing, paperId: event.target.value })} /></label>
    </div></details><button className="studio-primary" disabled={editing.scope === 'learner' && !editing.studentId}>更新复习清单</button></form>}
    <p className="pp-review-identity">{query?.scope === 'learner' ? '这里只读孩子学习账号的实际记录，家长私人陪练保持私有。' : '这里显示本人的练习与陪练；本人反思不会自动成为孩子的能力诊断。'}</p>
    {query?.scope === 'learner' && !query.studentId && <p role="status">请选择一个有权查看的孩子，再读取学习账号记录。</p>}{error && <div role="alert" className="pp-error">{error}<button onClick={() => setReload(value => value + 1)}>重新读取原记录</button></div>}
    {busy && <p role="status">正在读取原卷复习清单…</p>}{list && <><p className="pp-review-identity">共 {list.total} 个题位记录 · 未答、待核对与自评待订正分别保留。</p><div className="pp-review-list">{list.items.map(entry => { const params = new URLSearchParams(key); params.set('session', entry.sessionId); params.set('item', entry.id); return <article className="pp-review-entry" key={entry.sessionId + ':' + entry.id}><a href={'/library/practice/review?' + params.toString()}><small>{entry.actor === 'learner' ? '孩子学习账号作答' : entry.studentId ? '本人陪练' : '本人练习'} · {entry.organization.status === 'reviewed' ? '已回看' : !entry.disposition ? '尚未作答' : '待复习或核对'}</small><h2>{entry.paperTitle} · {entry.kind === 'document' ? '整卷作答笔记' : '第 ' + entry.position + ' 题'} ↗</h2></a><div className="pp-review-tags">{entry.organization.tags.map(tag => <span key={tag}>{tag}</span>)}{entry.organization.plannedDate && <span>计划 {entry.organization.plannedDate}</span>}{entry.organization.favorite && <span>已收藏</span>}</div>{!entry.availability.available && <p>{entry.availability.reason}</p>}{(entry.organization.errorSteps || entry.organization.reflection) && <details><summary>查看完整错误步骤与反思</summary><p>{entry.organization.errorSteps}</p><p>{entry.organization.reflection}</p></details>}</article>; })}</div>{!list.total && <section className="pp-empty"><h2>这个范围暂时没有记录。</h2><p>可以调整筛选，或从原卷练习保留一次真实作答。尚未作答不会显示成错题。</p><a href="/library">打开原卷库 ↗</a></section>}<div className="pp-review-pagination"><button className="studio-secondary" disabled={busy || list.page <= 1} onClick={() => query && apply({ ...query, page: query.page - 1 })}>上一页</button><span>第 {list.page} 页</span><button className="studio-secondary" disabled={busy || list.page * list.pageSize >= list.total} onClick={() => query && apply({ ...query, page: query.page + 1 })}>下一页</button></div></>}
    <section className="pp-review-calendar" aria-label="原卷复习日历"><h2>给下一次回看，留个位置。</h2><label>复习月份<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label><p className="pp-review-identity">按本地日期安排；计划日期与实际回看分开保存。</p>{calendarError && <p role="alert">{calendarError}</p>}{calendarBusy ? <p role="status">正在读取本月复习安排…</p> : events.map(event => <a key={event.id} href={event.href}><time>{event.date}</time><span>{event.title} · {event.status === 'reviewed' ? '已回看' : '待回看'}</span></a>)}{!calendarBusy && !events.length && <p>这个月还没有已保存的原卷复习安排。</p>}<button className="studio-secondary" disabled={!validMonth || calendarBusy || !query || query.scope === 'learner' && !query.studentId} onClick={() => void exportCalendar()}>导出本月复习 ICS</button><a href={paperReviewCalendarHref(query?.studentId ?? '', query?.scope ?? 'mine', validMonth ? month + '-01' : '')}>打开课程日历 ↗</a></section>
  </div>;
}
