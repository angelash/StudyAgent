'use client';
import * as React from 'react';
import Link from 'next/link';
import type { TeachingToolPurpose, TeachingToolRunsPage, TeachingToolRunView } from '@study-agent/contracts';
import { ApiRequestError, apiRequest } from '../../../lib/api';
import { refreshSessionUser, useSessionStatus, useSessionUser } from '../../../lib/session-user';
import { useXiaojiuModels } from '../../../components/xiaojiu-model-picker';
import { StudyNav } from '../../../components/study-nav';
import { TeachingComposer } from './composer';
import { TeachingRunDetail, teachingStatus } from './run-detail';
import { formFromSnapshot, type TeachingForm } from './tool-draft';
import '../../student/assessment/studio.css';
import '../workbench.css';
import './tools.css';

const endpoint = '/ai/teaching-tools', active = new Set(['queued', 'running', 'validating', 'cancelling']);
function locationState() { const query = new URLSearchParams(window.location.search), id = query.get('run'); return { purpose: query.get('purpose') === 'hint_draft' ? 'hint_draft' as const : 'assessment_analysis' as const, id: id && id.length <= 180 ? id : null }; }
export function TeachingToolsWorkbench() {
  const user = useSessionUser(), session = useSessionStatus();
  if (user === undefined) return <main className="learning-studio tt-gate"><h1>教研工作台</h1><p role="status">{session.status === 'unavailable' ? '暂不能确认当前身份，原资料仍保留。' : '正在确认教研身份…'}</p>{session.status === 'unavailable' && <button type="button" onClick={() => void refreshSessionUser()}>重新确认登录</button>}</main>;
  if (!user) return <main className="learning-studio tt-gate"><h1>教研工作台</h1><p>登录后查看本人教研草稿。</p><Link href="/parent/login">登录工作台 →</Link></main>;
  if (user.role !== 'admin') return <main className="learning-studio tt-gate"><StudyNav/><h1>这是一处内部教研工作区</h1><p>当前身份没有教研管理员权限。学习任务仍可从学习首页继续。</p><Link href="/learn">返回学习首页 →</Link></main>;
  return <Workspace key={user.id + ':' + user.role} ownerId={user.id}/>;
}
function Workspace({ ownerId }: { ownerId: string }) {
  const models = useXiaojiuModels(), [purpose, setPurpose] = React.useState<TeachingToolPurpose>('assessment_analysis');
  const [selected, setSelected] = React.useState<string | null>(null), [row, setRow] = React.useState<TeachingToolRunView | null>(null);
  const [list, setList] = React.useState<TeachingToolRunsPage | null>(null), [page, setPage] = React.useState(1), [filter, setFilter] = React.useState(''), [from, setFrom] = React.useState(''), [to, setTo] = React.useState('');
  const [refresh, setRefresh] = React.useState(0), [reread, setReread] = React.useState(0), [notice, setNotice] = React.useState(''), [error, setError] = React.useState('');
  const [listLoading, setListLoading] = React.useState(false), [rowLoading, setRowLoading] = React.useState(false), [formSafe, setFormSafe] = React.useState(true), [detailSafe, setDetailSafe] = React.useState(true);
  const [importForm, setImportForm] = React.useState<{ id: number; form: TeachingForm } | null>(null);
  const safe = React.useRef(true), detailAllowed = React.useRef(true), epoch = React.useRef(0), selectedRef = React.useRef<string | null>(null), href = React.useRef('');
  safe.current = formSafe && detailSafe; detailAllowed.current = detailSafe; selectedRef.current = selected;
  const formSafety = React.useCallback((value: boolean) => setFormSafe(value), []), detailSafety = React.useCallback((value: boolean) => setDetailSafe(value), []);
  function retainMessage() { setNotice('当前原稿或原操作未能存到本机，请先下载完整副本再离开。'); }
  function updateLocation(nextPurpose: TeachingToolPurpose, id: string | null) { const query = new URLSearchParams({ purpose: nextPurpose }); if (id) query.set('run', id); window.history.pushState(null, '', '/admin/ai-tools?' + query); href.current = window.location.href; }
  React.useEffect(() => {
    const state = locationState(); setPurpose(state.purpose); setSelected(state.id); href.current = window.location.href;
    const back = () => { if (!safe.current) { window.history.pushState(null, '', href.current); retainMessage(); return; } const next = locationState(); setPurpose(next.purpose); setSelected(next.id); setRow(null); epoch.current++; href.current = window.location.href; };
    const click = (event: MouseEvent) => { const anchor = (event.target as Element | null)?.closest('a'); if (!safe.current && anchor && !anchor.hasAttribute('download') && anchor.target !== '_blank') { event.preventDefault(); event.stopPropagation(); retainMessage(); } };
    const logout = (event: Event) => { if (!safe.current) { event.preventDefault(); retainMessage(); } };
    const unload = (event: BeforeUnloadEvent) => { if (!safe.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('popstate', back); document.addEventListener('click', click, true); window.addEventListener('studyagent:before-logout', logout); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('popstate', back); document.removeEventListener('click', click, true); window.removeEventListener('studyagent:before-logout', logout); window.removeEventListener('beforeunload', unload); };
  }, []);
  React.useEffect(() => {
    const request = new AbortController(); setListLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '12' }); if (filter) params.set('purpose', filter);
    try { if (from) params.set('from', new Date(from).toISOString()); if (to) params.set('to', new Date(to).toISOString()); }
    catch { setError('请填写有效的起止时间。'); setListLoading(false); return; }
    void apiRequest<TeachingToolRunsPage>(endpoint + '/runs?' + params, { signal: request.signal }).then(value => { if (!request.signal.aborted) { setList(value); setError(''); } })
      .catch(caught => { if (!request.signal.aborted) { setError(caught.message); if (caught instanceof ApiRequestError && [401, 403].includes(caught.status)) void refreshSessionUser(); } })
      .finally(() => { if (!request.signal.aborted) setListLoading(false); });
    return () => request.abort();
  }, [page, filter, from, to, refresh]);
  React.useEffect(() => {
    if (!selected) { setRow(null); return; } const request = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; setRowLoading(true);
    const load = async () => { try { const value = await apiRequest<TeachingToolRunView>(endpoint + '/runs/' + encodeURIComponent(selected), { signal: request.signal });
      if (request.signal.aborted) return; setRow(value); setError(''); setRowLoading(false); if (active.has(value.status)) timer = setTimeout(load, 1300);
    } catch (caught) { if (!request.signal.aborted) { const error = caught as Error; setError(error.message); setRowLoading(false);
      if (error instanceof ApiRequestError && [401, 403].includes(error.status)) { setRow(null); void refreshSessionUser(); }
      if (error instanceof ApiRequestError && error.status === 404) setRow(null); } } };
    void load(); return () => { request.abort(); if (timer) clearTimeout(timer); };
  }, [selected, reread]);
  function choose(id: string, known?: TeachingToolRunView) { if (!detailAllowed.current) { retainMessage(); return; } epoch.current++; setSelected(id); setRow(known ?? null); setDetailSafe(true); setError(''); updateLocation(purpose, id); }
  const beginCreate = React.useCallback(() => epoch.current, []);
  const created = React.useCallback((value: TeachingToolRunView, ticket: number) => { setRefresh(version => version + 1);
    if (ticket !== epoch.current || !detailAllowed.current) { setNotice('新建议已保存在历史中，当前查看位置保持。'); return; }
    epoch.current++; setSelected(value.id); setRow(value); setDetailSafe(true); const params = new URLSearchParams(window.location.search); params.set('run', value.id); window.history.pushState(null, '', '/admin/ai-tools?' + params); href.current = window.location.href;
  }, []);
  function reuse() { if (!row || !safe.current) { retainMessage(); return; } setImportForm({ id: Date.now(), form: formFromSnapshot(row.snapshot, row.modelId) }); setPurpose(row.purpose); setFormSafe(true); epoch.current++; updateLocation(row.purpose, row.id); setNotice('将完整原输入复制到编辑区，原任务与结果保持。'); }
  return <main className="learning-studio"><StudyNav/><div className="admin-workbench tt-workbench">
    <nav className="admin-links" aria-label="教研导航"><Link href="/admin/curriculum">知识与覆盖</Link><Link href="/admin/ai-tools" aria-current="page">AI 教研草稿</Link><Link href="/admin/reviews">作答复核</Link><Link href="/admin/content">内容管理</Link></nav>
    <header className="tt-page-head"><div><span className="tt-kicker">TEACHING STUDIO / PRIVATE DRAFTS</span><h1>把一次作答，看得更清楚。</h1><p>保留完整条件与推导，比较可能的解释，再用新证据核对。这里产生的是待复核建议。</p></div><aside><span>教研草稿</span><b>尚未人工核对</b><p>不会自动写入评分、能力判断或指导计划。</p></aside></header>
    {notice && <p className="tt-notice" role="status">{notice}</p>}{error && <div className="tt-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setRefresh(value => value + 1); setReread(value => value + 1); }}>重新读取原记录</button></div>}
    <div className="tt-workspace"><div className="tt-editor-column"><div className="tt-purpose-tabs" role="tablist" aria-label="教研用途">{([['assessment_analysis', '答案分析建议'], ['hint_draft', '提示草稿']] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={purpose === value} key={value} onClick={() => { if (!formSafe) { retainMessage(); return; } epoch.current++; setPurpose(value); setFormSafe(true); setImportForm(null); updateLocation(value, selected); }}>{label}</button>)}</div>
      <TeachingComposer key={purpose} ownerId={ownerId} purpose={purpose} models={models} onCanLeaveChange={formSafety} beginCreate={beginCreate} onCreated={created} importForm={importForm}/></div>
      <aside className="tt-history" aria-label="本人教研历史"><div className="tt-section-heading"><span>本人原记录</span><button type="button" className="tt-link" onClick={() => setRefresh(value => value + 1)}>刷新</button></div>
        <label>用途<select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="">全部</option><option value="assessment_analysis">答案分析</option><option value="hint_draft">提示草稿</option></select></label>
        <details className="tt-dates"><summary>按时间查找</summary><label>开始时间<input type="datetime-local" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }}/></label><label>结束时间<input type="datetime-local" value={to} onChange={event => { setTo(event.target.value); setPage(1); }}/></label></details>
        {listLoading && <p role="status">正在读取原记录…</p>}{!listLoading && list && !list.runs.length && <div className="tt-history-empty"><b>还没有匹配记录</b><p>预检不会生成建议。核对输入后，可明确创建一份草稿。</p></div>}
        <div className="tt-history-list">{list?.runs.map(item => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => choose(item.id, item)}><span>{item.purpose === 'assessment_analysis' ? '答案分析建议' : '提示草稿'}</span><b>{item.snapshot.source.kind === 'temporary' ? item.snapshot.source.title : '题库原题'}</b><small>{item.modelName} · {teachingStatus[item.status]}</small><time>{new Date(item.createdAt).toLocaleString('zh-CN')}</time></button>)}</div>
        <div className="tt-pagination"><button type="button" disabled={page <= 1 || listLoading} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} 页</span><button type="button" disabled={!list?.hasMore || listLoading} onClick={() => setPage(value => value + 1)}>下一页</button></div>
      </aside></div>
    {rowLoading && !row && <p role="status" className="tt-detail-loading">正在读取完整原任务…</p>}
    {row && <TeachingRunDetail key={row.id} row={row} ownerId={ownerId} onChanged={value => { if (selectedRef.current === value.id) { setRow(value); setReread(version => version + 1); } setRefresh(version => version + 1); }} onCanLeaveChange={detailSafety} onReuse={reuse}/>}
  </div></main>;
}
