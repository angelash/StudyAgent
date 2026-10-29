'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { CourseSourceSnapshot, StudioSourceMaterial } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
import type { SessionUser } from '../../lib/session-user';
import type { LearningContext } from '../../lib/learning-context';
import { copyMaterialsState, materialsReturn, withMaterialsReturn } from '../../lib/materials-navigation';
import { materialTextCommand, materialTextDraftKey, parseMaterialTextDraft, type MaterialTextDraft } from '../../lib/material-text-draft';
import { WorkspaceDialog } from './workspace-dialog';
import { PdfMaterialUploader, PdfProcessingProgress } from './source-courses/pdf-material';
import { SourceReader } from './source-courses/source-reader';
import { useWorkspaceExitGuard } from '../../lib/use-workspace-exit-guard';
import { sameWorkspaceActivity } from '../../lib/workspace-exit-guard';

type Material = { material: StudioSourceMaterial; version: string };
const stateNames: Record<string, string> = { queued: '等待处理', processing: '正在整理', ready: '可核对', needs_review: '需要核对', failed: '未完成', cancelled: '已停止' };
export function PersonalMaterials({ identity, context }: { identity: SessionUser; context: LearningContext }) {
  const params = useSearchParams(), searchKey = params.toString();
  const safe = copyMaterialsState(new URLSearchParams(searchKey), new URLSearchParams());
  const studentId = context.audience === 'self' ? undefined : context.studentId, subject = studentId ? context.subject : undefined;
  const scope = React.useMemo(() => { const value: Record<string, string> = {};if (studentId) { value.studentId = studentId;value.subject = subject!; }return value; }, [studentId, subject]);
  const [rows, setRows] = React.useState<Material[]>([]), [loading, setLoading] = React.useState(true), [error, setError] = React.useState(''), [attempt, setAttempt] = React.useState(0);
  const queryValue = safe.get('materialQuery') ?? '', kind = safe.get('materialKind') ?? '', status = safe.get('materialStatus') ?? '';
  const [query, setQuery] = React.useState(queryValue);
  const page = Number(safe.get('materialListPage') ?? 1);
  const selectedId = safe.get('material') ?? '', selectedPage = Number(safe.get('page') ?? 1);
  const [textOpen, setTextOpen] = React.useState(false), [title, setTitle] = React.useState(''), [text, setText] = React.useState('');
  const [draftNotice, setDraftNotice] = React.useState(''), [canPersist, setCanPersist] = React.useState(true), [saving, setSaving] = React.useState(false), [saveError, setSaveError] = React.useState('');
  const [confirmClose, setConfirmClose] = React.useState(false), [exported, setExported] = React.useState(false);
  const draftProtected = canPersist && text.length <= 180000;
  const draftHref = React.useRef(''), pendingNavigation = React.useRef<string | null>(null);
  const allowNavigation = React.useRef(false);
  const pendingProceed = React.useRef<(() => void) | null>(null);
  const request = React.useRef<AbortController | null>(null), draftKey = materialTextDraftKey(identity.id, studentId, subject);
  const openButton = React.useRef<HTMLButtonElement>(null);
  const refresh = React.useCallback(() => setAttempt(value => value + 1), []);
  const hostProtectsExit = useWorkspaceExitGuard(identity.id, textOpen&&!draftProtected&&Boolean(title||text), {
    isInternal:(next,current)=>sameWorkspaceActivity(next,current)&&new URL(next,current).searchParams.get('view')==='materials'&&new URL(next,current).searchParams.get('tab')==='personal',
    request:(href,proceed)=>{if(exported){allowNavigation.current=true;proceed();return;}pendingNavigation.current=href;pendingProceed.current=proceed;setConfirmClose(true);},
  });
  React.useEffect(() => setQuery(queryValue), [queryValue]);
  React.useEffect(() => {
    const controller = new AbortController(); setRows([]); setLoading(true); setError('');
    apiRequest<Material[]>('/learning/source-courses/materials?' + new URLSearchParams({ view: 'catalog', ...scope }), { signal: controller.signal })
      .then(values => { if (!controller.signal.aborted) setRows(values.filter(row => (row.material.studentId ?? null) === (studentId ?? null) && (row.material.subject ?? null) === (subject ?? null))); })
      .catch(caught => { if (!controller.signal.aborted) setError((caught as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [identity.id, studentId, subject, scope, attempt]);
  React.useEffect(() => {
    setTitle(''); setText(''); setDraftNotice(''); setCanPersist(true);
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const saved = parseMaterialTextDraft(JSON.parse(raw), identity.id, studentId, subject);
      if (saved) { setTitle(saved.title); setText(saved.text); setDraftNotice('已恢复本机文字稿，尚未提交。'); }
      else { setCanPersist(false); setDraftNotice('本机旧稿的归属或格式无法核对，旧字节保留。新编辑可先下载副本。'); }
    } catch { setCanPersist(false); setDraftNotice('本机草稿暂不可读写，输入会保留在当前页，可先下载副本。'); }
  }, [identity.id, studentId, subject, draftKey]);
  React.useEffect(() => () => request.current?.abort(), []);
  React.useEffect(() => {
    if (hostProtectsExit || !textOpen || draftProtected || exported || !title && !text) return;
    const guard = (event: PopStateEvent) => { const next = window.location.href; event.stopImmediatePropagation();window.history.pushState(null, '', draftHref.current);pendingNavigation.current = next;setConfirmClose(true); };
    // Cancel a history traversal before the app router can unmount this editor.
    const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      const change = event as Event & { navigationType?: string; destination?: { url: string } };
      if(allowNavigation.current||change.navigationType!=='traverse'||!change.cancelable||!change.destination)return;
      change.preventDefault();pendingNavigation.current=change.destination.url;setConfirmClose(true);
    };
    const follow = (event: MouseEvent) => {
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const anchor=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;
      if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;
      event.preventDefault();event.stopImmediatePropagation();pendingNavigation.current=anchor.href;setConfirmClose(true);
    };
    navigation?.addEventListener('navigate',traverse);window.addEventListener('popstate', guard, { capture: true });document.addEventListener('click',follow,true);
    return () => {navigation?.removeEventListener('navigate',traverse);window.removeEventListener('popstate', guard, { capture: true });document.removeEventListener('click',follow,true);};
  }, [hostProtectsExit, textOpen, draftProtected, exported, title, text]);
  React.useEffect(() => {
    if (!textOpen || !title && !text) return;
    const warn = (event: BeforeUnloadEvent) => { if(allowNavigation.current)return;event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [textOpen, title, text]);
  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) if (value === null || value === '') next.delete(key); else next.set(key, value);
    window.history.pushState(null, '', '/studio?' + next);
  }
  function edit(nextTitle: string, nextText: string) {
    setTitle(nextTitle); setText(nextText); setSaveError(''); setExported(false);
    if (!canPersist) return;
    if (nextText.length > 180000) { setDraftNotice('完整输入仍在当前页，已超过本机稿的大小范围。请下载后分成相邻资料，正文不会被截断。'); return; }
    const value: MaterialTextDraft = { format: 'workspace-material-text-v1', actorId: identity.id, studentId: studentId ?? null, subject: subject ?? null, title: nextTitle, text: nextText };
    try { const bytes = JSON.stringify(value); sessionStorage.setItem(draftKey, bytes); if (sessionStorage.getItem(draftKey) !== bytes) throw new Error(); setDraftNotice('文字稿已在本机保留，尚未提交。'); }
    catch { setCanPersist(false); setDraftNotice('本机暂不能保留草稿，当前输入仍可编辑。可下载完整副本后继续。'); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'workspace-material-text-v1', actorId: identity.id, studentId: studentId ?? null, subject: subject ?? null, title, text }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = '文字资料草稿.json'; link.click(); setExported(true);setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function closeText() { if (saving) return; if (title || text) setConfirmClose(true); else setTextOpen(false); }
  async function saveText(event: React.FormEvent) {
    event.preventDefault(); if (saving) return; setSaveError('');
    let command: ReturnType<typeof materialTextCommand>;
    try { command = materialTextCommand(title, text); } catch (caught) { setSaveError((caught as Error).message); return; }
    const controller = new AbortController(); request.current = controller; setSaving(true);
    try {
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ actorId: identity.id, ...scope, ...command })))), byte => byte.toString(16).padStart(2, '0')).join('');
      if (controller.signal.aborted) return;
      const saved = await apiRequest<Material>('/learning/source-courses/materials/text', { method: 'POST', signal: controller.signal, body: JSON.stringify({ ...scope, ...command, requestKey: 'workspace-text-v1-' + fingerprint }) });
      if (controller.signal.aborted) return;
      if (canPersist) try { sessionStorage.removeItem(draftKey); } catch { /* The server acknowledgment remains authoritative. */ }
      setTitle(''); setText(''); setTextOpen(false); setConfirmClose(false); setDraftNotice('文字资料已保存。');
      refresh(); update({ materialQuery: null, materialKind: null, materialStatus: null, materialListPage: null, material: saved.material.id, page: '1' });
    } catch (caught) { if (!controller.signal.aborted) setSaveError((caught as Error).message); }
    finally { if (!controller.signal.aborted) setSaving(false); }
  }
  const visible = rows.filter(row => (!queryValue || (row.material.title + ' ' + row.material.filename).toLocaleLowerCase().includes(queryValue.toLocaleLowerCase())) && (!kind || (row.material.kind ?? 'pdf') === kind) && (!status || (row.material.status ?? 'ready') === status));
  const pages = Math.max(1, Math.ceil(visible.length / 20)), currentPage = Math.min(page, pages), current = rows.find(row => row.material.id === selectedId);
  const sourcePage = current?.material.pages.find(value => value.page === selectedPage);
  const preview: CourseSourceSnapshot | null = current && sourcePage ? { key: 'material-preview', materialId: current.material.id, page: sourcePage.page, title: current.material.title, kind: current.material.kind ?? 'pdf', text: sourcePage.text, textCharacters: sourcePage.textCharacters, blocks: sourcePage.blocks ?? [], sha256: current.material.sha256, version: current.version, fingerprint: current.version, structureReviewRequired: current.material.structure?.reviewRequired ?? false } : null;
  const back = materialsReturn('/studio?' + searchKey), newCourse = withMaterialsReturn('/studio/source-courses?' + new URLSearchParams({ new: '1', ...scope }), back);
  return <section className="workspace-personal-materials" aria-label="当前对象的学习资料"><header className="workspace-materials-heading"><div><h2>{studentId ? '当前档案的资料' : '我的资料'}</h2><p>原件、识别正文和课程分别保存，先核对来源再使用。</p></div><div><button className="workspace-button" ref={openButton} onClick={() => { setSaveError(''); allowNavigation.current=false;pendingNavigation.current = null;pendingProceed.current=null;draftHref.current = window.location.href;setTextOpen(true); }}>{title || text ? '继续文字资料草稿' : '添加文字资料'}</button>{identity.role !== 'student' && <Link className="workspace-button" href={newCourse}>从资料创建课程</Link>}</div></header>
    <PdfMaterialUploader scope={scope} disabled={saving} onSaved={value => { refresh(); update({ materialQuery: null, materialKind: null, materialStatus: null, materialListPage: null, material: value.material.id, page: '1' }); }} />
    <form className="workspace-page-controls" onSubmit={event => { event.preventDefault(); update({ materialQuery: query.trim(), materialListPage: null, material: null, page: null }); }}><label>搜索资料<input aria-label="搜索学习资料" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /></label><label>类型<select aria-label="资料类型" value={kind} onChange={event => update({ materialKind: event.target.value, materialListPage: null, material: null, page: null })}><option value="">全部类型</option><option value="pdf">PDF</option><option value="text">文字</option></select></label><label>处理状态<select aria-label="资料处理状态" value={status} onChange={event => update({ materialStatus: event.target.value, materialListPage: null, material: null, page: null })}><option value="">全部状态</option>{Object.entries(stateNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="workspace-button">查找资料</button></form>
    {draftNotice && !textOpen && <p role="status">{draftNotice}</p>}
    {error && <div className="workspace-error" role="alert"><p>{error}</p><button className="workspace-button" onClick={refresh}>重新读取资料</button></div>}
    {loading ? <p role="status">正在读取当前对象的资料…</p> : <><p className="workspace-materials-count">{visible.length} 份资料</p>{!visible.length && <p>当前范围还没有资料。可以添加PDF或文字，也可以调整筛选。</p>}{visible.slice((currentPage - 1) * 20, currentPage * 20).map(row => <article className="workspace-page-row" key={row.material.id}><div><h3>{row.material.title}</h3><p>{row.material.kind === 'text' ? '文字' : 'PDF'} · {row.material.pageCount} 页/段 · {stateNames[row.material.status ?? 'ready'] ?? '待核对'}{row.material.structure?.reviewRequired ? ' · 需要对照原页' : ''}</p></div><button className="workspace-button" onClick={() => update({ material: row.material.id, page: '1' })}>核对原文与原页</button>{identity.role !== 'student' && <Link className="workspace-button" href={withMaterialsReturn('/studio/source-courses?' + new URLSearchParams({ new: '1', ...scope, material: row.material.id, page: '1' }), back)}>选择内容建课</Link>}{['queued', 'processing', 'failed', 'cancelled'].includes(row.material.status ?? '') && <PdfProcessingProgress material={row.material} onRefresh={refresh} />}</article>)}
      {pages > 1 && <nav className="workspace-page-controls" aria-label="学习资料分页"><button className="workspace-button" disabled={currentPage <= 1} onClick={() => update({ materialListPage: String(currentPage - 1) })}>上一页</button><span>{currentPage} / {pages}</span><button className="workspace-button" disabled={currentPage >= pages} onClick={() => update({ materialListPage: String(currentPage + 1) })}>下一页</button></nav>}
    </>}
    {selectedId && !loading && <WorkspaceDialog onClose={() => update({ material: null, page: null })}><section className="workspace-material-dialog" role="dialog" aria-modal="true" aria-label="核对学习资料"><header><h2>{current?.material.title ?? '原资料暂不可用'}</h2><button className="workspace-button" onClick={() => update({ material: null, page: null })}>关闭资料核对</button></header>{!current ? <p role="alert">所选资料不属于当前对象或当前已不可访问。请关闭后从当前列表重新选择。</p> : <><div className="workspace-page-controls"><label>原文页/段<select aria-label="核对资料页码" value={sourcePage?.page ?? ''} onChange={event => update({ page: event.target.value })}>{current.material.pages.map(value => <option key={value.page} value={value.page}>{value.page}</option>)}</select></label>{identity.role !== 'student' && <Link className="workspace-button" href={withMaterialsReturn('/studio/source-courses?' + new URLSearchParams({ new: '1', ...scope, material: current.material.id, page: String(sourcePage?.page ?? 1) }), back)}>用当前页建课</Link>}</div>{preview ? <SourceReader key={preview.materialId+':'+preview.version+':'+preview.page} source={preview} materialPreview /> : <p role="status">当前页尚未有可读取的正文，原件和处理进度仍保留。</p>}{current.material.kind !== 'text' && <PdfProcessingProgress material={current.material} onRefresh={refresh} />}</>}</section></WorkspaceDialog>}
    {textOpen && <WorkspaceDialog onClose={closeText} returnFocus={openButton.current}><section className="workspace-material-dialog" role="dialog" aria-modal="true" aria-label="添加文字资料"><header><h2>添加文字资料</h2><button className="workspace-button" disabled={saving} onClick={closeText}>关闭文字编辑</button></header>{confirmClose ? <><p>完整文字稿仍在当前页；可下载后关闭，也可以继续编辑。</p><div className="workspace-page-controls"><button className="workspace-button" onClick={() => { pendingNavigation.current = null;pendingProceed.current=null;setConfirmClose(false); }}>继续编辑</button><button className="workspace-button" onClick={download}>下载完整文字稿</button><button className="workspace-button" disabled={!draftProtected && !exported} onClick={() => { const next = pendingNavigation.current,proceed=pendingProceed.current;allowNavigation.current=true;pendingNavigation.current = null;pendingProceed.current=null;setTextOpen(false);setConfirmClose(false);if(proceed)proceed();else if (next) window.location.assign(next); }}>{draftProtected ? '保留草稿并关闭' : '已保留副本，关闭编辑'}</button></div></> : <form onSubmit={event => void saveText(event)}><label>资料名称<input required maxLength={180} value={title} disabled={saving} onChange={event => edit(event.target.value, text)} /></label><label>完整文字<textarea aria-label="完整文字" required rows={14} value={text} disabled={saving} onChange={event => edit(title, event.target.value)} /></label><p>每段20至8000字，最多8段；分段之间单独写一行 ---。较长TXT/Markdown资料可从资料建课入口导入。</p>{draftNotice && <p role="status">{draftNotice}</p>}{saveError && <p className="workspace-error" role="alert">{saveError}</p>}<footer><button type="button" className="workspace-button" onClick={download}>下载完整文字稿</button><button className="workspace-button" disabled={saving || !title.trim() || !text.trim()}>{saving ? '正在保存…' : '保存文字资料'}</button></footer></form>}</section></WorkspaceDialog>}
  </section>;
}
