'use client';
import * as React from 'react';
import { createPortal } from 'react-dom';
import type { AssistantArtifactPreflight, AssistantHistoryMessage, AssistantNote, AssistantNoteExport, AssistantNotePage, AssistantNoteReceipt } from '@study-agent/contracts';
import { assistantNoteCreateSchema, assistantNoteEditSchema, assistantNoteConfirmSchema } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../lib/api';
import { internalAssistantHref } from '../lib/assistant-course-navigation';
import { useOriginalTeachingFonts } from '../lib/original-teaching-fonts';
import { WorkspaceDialog } from '../app/studio/workspace-dialog';
import { AssistantNoteReading } from './assistant-note-reading';
import './assistant-notes.css';

type Pending = { kind: 'create' | 'edit' | 'confirm'; key: string; noteId: string | null; input: Record<string, unknown> };
type Draft = { title: string; objective: string; messageIds: string[]; linked: boolean; markdown: string; noteId: string | null; revision: number; dirty: boolean; pending: Pending | null };
type Cache = { version: 1; ownerId: string; sessionId: string; active: string; drafts: Record<string, Draft> };
type AssessmentBlock = { code: 'assessment_in_progress'; message: string; href: string };
type Props = { ownerId: string; sessionId: string; initialIds: string[]; messages: AssistantHistoryMessage[]; assessmentBlock?: AssessmentBlock; hasOlder: boolean; loadOlder: () => Promise<void>; searchMessages: (query: string) => Promise<void>; resetMessages: () => Promise<void>; onClose: () => void; onLocate: (id: string) => void };
const fresh = (ids: string[] = []): Draft => ({ title: '我的学习笔记', objective: '保留这次解释，便于课后复习', messageIds: ids, linked: false, markdown: '', noteId: null, revision: 0, dirty: false, pending: null });
function decode(raw: string, ownerId: string, sessionId: string): Cache | null {
  if (raw.length > 2_000_000) return null;
  const v = JSON.parse(raw) as Cache;
  if (!v || v.version !== 1 || v.ownerId !== ownerId || v.sessionId !== sessionId || typeof v.active !== 'string' || !v.drafts || Array.isArray(v.drafts) || Object.keys(v.drafts).length > 20 || !Object.hasOwn(v.drafts, v.active)) return null;
  for (const [key, d] of Object.entries(v.drafts)) {
    if (!key || key.length > 400 || !d || typeof d.title !== 'string' || d.title.length > 160 || typeof d.objective !== 'string' || d.objective.length > 500 || typeof d.markdown !== 'string' || !Array.isArray(d.messageIds) || d.messageIds.length > 20 || !d.messageIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 180) || new Set(d.messageIds).size !== d.messageIds.length || typeof d.linked !== 'boolean' || typeof d.dirty !== 'boolean' || !Number.isInteger(d.revision) || d.revision < 0 || !(d.noteId === null || typeof d.noteId === 'string' && d.noteId.length <= 180)) return null;
    if (d.pending !== null) {
      const p = d.pending; if (!p || typeof p.key !== 'string' || p.key.length < 8 || p.key.length > 180 || !['create', 'edit', 'confirm'].includes(p.kind) || p.noteId !== (p.kind === 'create' ? null : d.noteId) || p.kind !== 'create' && !p.noteId) return null;
      const parsed = (p.kind === 'create' ? assistantNoteCreateSchema : p.kind === 'edit' ? assistantNoteEditSchema : assistantNoteConfirmSchema).safeParse(p.input);
      if (!parsed.success || parsed.data.requestKey !== p.key) return null;
    }
  }
  return v;
}
function fileDownload(filename: string, mime: string, text: string) {
  const href = URL.createObjectURL(new Blob([text], { type: mime })), a = document.createElement('a'); a.href = href; a.download = filename;
  try { a.click(); } finally { setTimeout(() => URL.revokeObjectURL(href), 1000); }
}
const noteDraft = (note: AssistantNote): Draft => ({ title: note.title, objective: note.objective, messageIds: note.origin.selection.requestedMessageIds,
  linked: note.origin.selection.includeLinkedQuestions, markdown: note.markdown, noteId: note.id, revision: note.revision, dirty: false, pending: null });
function room(current: Cache, slot: string): Cache | null {
  if (Object.hasOwn(current.drafts, slot) || Object.keys(current.drafts).length < 20) return current;
  const disposable = Object.entries(current.drafts).find(([key, draft]) => key !== current.active && draft.noteId && !draft.dirty && !draft.pending);
  return disposable ? { ...current, drafts: Object.fromEntries(Object.entries(current.drafts).filter(([key]) => key !== disposable[0])) } : null;
}
const interfaceText = '私人学习笔记 选择原消息 我的笔记 关闭学习笔记 标题 复习目标 同时包含回答关联的原问题 核对完整来源 保存逐字候选 保存编辑稿 我已核对原文和编辑稿 采用这份笔记 返回原消息 下载完整JSON 下载完整Markdown 下载本机稿 核对原操作 用原请求重试 保留文字并重新核对 更早的原消息 原问题 助教原回答 原模型 无已保存引用 原文和编辑稿分别保留，不计作掌握证据。当前评测保护 已有笔记仍可阅读、下载。本机文字和原操作继续保留。进入原评测 重新核对笔记权限 服务器稿已采用；下方是本机未保存稿，尚未采用。本机未保存稿 读取最新服务器稿 使用服务器稿，保留本机副本 对照服务器已保存全文 超出字符，全文保留在本机。请缩短后保存，或下载本机稿。本人独立学习 原学生学习档案 原教学年级 未指定 上册 下册 保留原教学版本';

export function AssistantNotesPanel(props: Props) {
  const base = '/ai/assistant/sessions/' + encodeURIComponent(props.sessionId) + '/artifacts/notes';
  const key = 'studyagent.assistant.notes.v1.' + encodeURIComponent(props.ownerId) + '.' + encodeURIComponent(props.sessionId);
  const [cache, setCache] = React.useState<Cache | null>(null), memory = React.useRef<Cache | null>(null);
  const cacheWritable = React.useRef(true);
  const [mode, setMode] = React.useState<'edit' | 'list'>(props.initialIds.length ? 'edit' : 'list');
  const [note, setNote] = React.useState<AssistantNote | null>(null), [preview, setPreview] = React.useState<AssistantArtifactPreflight | null>(null);
  const [list, setList] = React.useState<AssistantNotePage | null>(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const [storage, setStorage] = React.useState(''), [reviewed, setReviewed] = React.useState(false), [missingRequest, setMissingRequest] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [assessmentBlock, setAssessmentBlock] = React.useState(props.assessmentBlock);
  React.useEffect(() => { setAssessmentBlock(props.assessmentBlock); }, [props.assessmentBlock?.href, props.assessmentBlock?.message]);
  const dead = React.useRef(false), requests = React.useRef(new Set<AbortController>()), epoch = React.useRef(0);
  const draft = cache?.drafts[cache.active], activeNote = note && draft?.noteId === note.id ? note : null;
  const fonts = useOriginalTeachingFonts('assistant-notes:' + key, interfaceText + JSON.stringify(draft ?? {}) + JSON.stringify(preview?.origin ?? activeNote?.origin ?? {}), 'standard');
  function persist(next: Cache, requireDisk = false) {
    try { const raw = JSON.stringify(next); if (!cacheWritable.current || raw.length > 2_000_000) throw Error(); localStorage.setItem(key, raw); }
    catch { setStorage(cacheWritable.current ? '本机未能暂存笔记。当前文字仍在，请先下载本机稿；服务端已保存的笔记可重新读取。' : '原笔记缓存尚未核对，已保留且没有覆盖。新稿仍在本页，请先下载本机稿；已保存笔记可从服务端读取。'); if (requireDisk) return false; }
    memory.current = next; setCache(next); return true;
  }
  function update(patch: Partial<Draft>, invalidate = false) {
    const current = memory.current; if (!current) return;
    persist({ ...current, drafts: { ...current.drafts, [current.active]: { ...current.drafts[current.active], ...patch } } });
    if (invalidate) setPreview(null); setReviewed(false); setError('');
  }
  async function call<T>(path: string, options: RequestInit = {}) {
    const controller = new AbortController(); requests.current.add(controller);
    try { return await apiRequest<T>(path, { ...options, signal: controller.signal }); }
    catch (e) {
      if (!dead.current && e instanceof ApiRequestError && e.details?.code === 'assessment_in_progress' && typeof e.details.href === 'string' && internalAssistantHref(e.details.href)) {
        setAssessmentBlock({ code: 'assessment_in_progress', message: e.message, href: e.details.href });
      }
      throw e;
    } finally { requests.current.delete(controller); }
  }
  React.useEffect(() => {
    dead.current = false;
    let saved: Cache | null = null;
    try { const raw = localStorage.getItem(key); if (raw) { saved = decode(raw, props.ownerId, props.sessionId); if (!saved) { cacheWritable.current = false; setStorage('原笔记缓存与当前身份或格式不一致，已保留并忽略。'); } } } catch { cacheWritable.current = false; setStorage('本机笔记缓存暂不可用。当前文字可下载，已保存的笔记可从服务端读取。'); }
    let current: Cache = saved ?? { version: 1, ownerId: props.ownerId, sessionId: props.sessionId, active: 'new', drafts: { new: fresh() } };
    if (props.initialIds.length) {
      const slot = 'source-' + props.initialIds.join('-');
      if (Object.hasOwn(current.drafts, slot)) current = { ...current, active: slot };
      else if (room(current, slot)) { const available = room(current, slot)!; current = { ...available, active: slot, drafts: { ...available.drafts, [slot]: fresh(props.initialIds) } }; }
      else setNotice('已保留20份本机草稿，请先打开已有草稿或下载副本；没有覆盖上次文字。');
    }
    persist(current); return () => { dead.current = true; epoch.current++; for (const request of requests.current) request.abort(); requests.current.clear(); };
  }, [key]);
  async function loadList(cursor?: string) {
    const version = ++epoch.current; setBusy(true); setError('');
    try { const value = await call<AssistantNotePage>(base + '?pageSize=20' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      if (!dead.current && version === epoch.current) setList(old => cursor && old ? { ...value, items: [...old.items, ...value.items] } : value);
    } catch (e) { if (!dead.current && version === epoch.current) setError((e as Error).message); }
    finally { if (!dead.current && version === epoch.current) setBusy(false); }
  }
  React.useEffect(() => { if (cache && mode === 'list') void loadList(); }, [!!cache, mode]);
  async function readNote(id: string, slot: string) {
    const version = ++epoch.current; setBusy(true); setError('');
    try { const value = await call<AssistantNote>(base + '/' + encodeURIComponent(id)); if (!dead.current && version === epoch.current && memory.current?.active === slot) {
      setNote(value); const local = memory.current.drafts[slot]; if (!local.dirty && !local.pending) update(noteDraft(value));
      else if (local.revision !== value.revision) setNotice('服务器已有更新。本机稿仍保留，请对照两份全文后再决定。');
    } } catch (e) { if (!dead.current && version === epoch.current) setError((e as Error).message); }
    finally { if (!dead.current && version === epoch.current) setBusy(false); }
  }
  React.useEffect(() => { if (cache && mode === 'edit' && draft?.noteId) void readNote(draft.noteId, cache.active); }, [cache?.active, mode, draft?.noteId]);
  function selectSlot(slot: string) { const current = memory.current; if (!current || !Object.hasOwn(current.drafts, slot)) return; epoch.current++; setBusy(false); persist({ ...current, active: slot }); setMode('edit'); setNote(null); setPreview(null); setReviewed(false); setError(''); setNotice(''); setMissingRequest(false); }
  function openSaved(id: string) {
    const current = memory.current; if (!current) return; const slot = 'note-' + id;
    if (!Object.hasOwn(current.drafts, slot)) {
      const available = room(current, slot); if (!available) { setError('本机已有20份未完成草稿，请先下载或打开已有笔记；没有覆盖任何草稿。'); return; }
      persist({ ...available, drafts: { ...available.drafts, [slot]: { ...fresh(), noteId: id } } });
    }
    selectSlot(slot);
  }
  async function preflight() {
    if (!draft) return; const version = ++epoch.current; setBusy(true); setError('');
    try { const value = await call<AssistantArtifactPreflight>(base.replace(/\/notes$/, '/preflight'), { method: 'POST', body: JSON.stringify({ kind: 'verbatim_note', objective: draft.objective, selection: { messageIds: draft.messageIds, includeLinkedQuestions: draft.linked } }) });
      if (!dead.current && version === epoch.current) { setPreview(value); setAssessmentBlock(undefined); }
    } catch (e) { if (!dead.current && version === epoch.current) setError((e as Error).message); }
    finally { if (!dead.current && version === epoch.current) setBusy(false); }
  }
  function pendingPath(pending: Pending) { return pending.kind === 'create' ? base : base + '/' + encodeURIComponent(pending.noteId!) + (pending.kind === 'edit' ? '/content' : '/confirm'); }
  async function finish(receipt: AssistantNoteReceipt, slot: string, pending: Pending, version: number) {
    const value = await call<AssistantNote>(base + '/' + encodeURIComponent(receipt.noteId));
    if (dead.current || version !== epoch.current || memory.current?.active !== slot) return;
    const local = memory.current.drafts[slot];
    const changedAfter = pending.kind === 'edit' && (local.markdown !== pending.input.markdown || local.title !== pending.input.title);
    update(changedAfter ? { noteId: value.id, revision: value.revision, pending: null, dirty: true } : noteDraft(value));
    setNote(value); setPreview(null); setMissingRequest(false); setNotice(changedAfter ? '原操作已核对。本机后续编辑仍保留，尚未保存。' : value.status === 'confirmed' ? '笔记已核对采用。原文和编辑稿均已保存。' : '稿件已保存。核对后可明确采用。');
  }
  async function execute(pending: Pending, retry = false) {
    const current = memory.current; if (!current) return; const slot = current.active, version = ++epoch.current;
    if (!retry) update({ pending }); setBusy(true); setError('');
    try { const receipt = await call<AssistantNoteReceipt>(pendingPath(pending), { method: pending.kind === 'edit' ? 'PATCH' : 'POST', body: JSON.stringify(pending.input) }); await finish(receipt, slot, pending, version); }
    catch (e) { if (!dead.current && version === epoch.current) setError((e as Error).message + ' 原操作仍保留，请先核对结果。'); }
    finally { if (!dead.current && version === epoch.current) setBusy(false); }
  }
  async function recover() {
    const current = memory.current, pending = current?.drafts[current.active]?.pending; if (!current || !pending) return;
    const slot = current.active, version = ++epoch.current; setBusy(true); setError(''); setMissingRequest(false);
    try { const path = pending.kind === 'create' ? base + '/requests/' + encodeURIComponent(pending.key) : base + '/' + encodeURIComponent(pending.noteId!) + '/requests/' + encodeURIComponent(pending.key);
      const receipt = await call<AssistantNoteReceipt>(path); await finish(receipt, slot, pending, version);
    } catch (e) { if (!dead.current && version === epoch.current) { if (e instanceof ApiRequestError && e.status === 404) { setMissingRequest(true); setNotice('服务端暂未找到原回执。可用原请求重试，或保留文字后重新核对。'); } else setError((e as Error).message); } }
    finally { if (!dead.current && version === epoch.current) setBusy(false); }
  }
  async function exportNote(format: 'json' | 'markdown') {
    if (!activeNote) return; const version = ++epoch.current; setBusy(true); setError('');
    try { const value = await call<AssistantNoteExport>(base + '/' + encodeURIComponent(activeNote.id) + '/export?format=' + format); if (!dead.current && version === epoch.current) { fileDownload(value.filename, value.mime, value.content); setNotice('已发起完整笔记下载，请在浏览器下载记录中核对。'); } }
    catch (e) { if (!dead.current && version === epoch.current) setError((e as Error).message + ' 笔记和本机稿仍保留，可再次下载。'); }
    finally { if (!dead.current && version === epoch.current) setBusy(false); }
  }
  function localDownload() { if (!draft) return; try { fileDownload('学习笔记本机稿.json', 'application/json', JSON.stringify({ title: draft.title, objective: draft.objective, markdown: draft.markdown, revision: draft.revision, originalOperation: draft.pending, selectedMessageIds: draft.messageIds, original: preview?.origin ?? activeNote?.origin ?? null, sourceStatus: preview || activeNote ? '已读取原来源' : '来源尚需从原会话读取' }, null, 2)); } catch { setError('本机下载未能开始。文字仍保留，请复制后重试。'); } }
  function adoptServer() {
    const current = memory.current; if (!current || !activeNote) return;
    const slot = 'local-' + crypto.randomUUID(), available = room(current, slot);
    if (!available) { setError('没有空余草稿位置，本机稿尚未替换。请先下载副本。'); return; }
    const next = { ...available, drafts: { ...available.drafts, [slot]: structuredClone(current.drafts[current.active]), [current.active]: noteDraft(activeNote) } };
    if (persist(next, true)) { setNotice('已保留本机文字和原操作副本，可从“我的笔记”重新打开；当前显示服务器稿。'); setReviewed(false); setMissingRequest(false); setError(''); }
  }
  function anotherDraft() {
    const current = memory.current; if (!current || !draft) return;
    const slot = 'new-' + crypto.randomUUID(), available = room(current, slot);
    if (!available) { setError('原操作和文字仍保留，请先下载本机稿；尚未新建草稿。'); return; }
    const next: Cache = { ...available, active: slot, drafts: { ...available.drafts, [slot]: { ...fresh(draft.messageIds), title: draft.title, objective: draft.objective, linked: draft.linked } } };
    if (persist(next, true)) { setNote(null); setPreview(null); setMissingRequest(false); setReviewed(false); setNotice('原稿与待核对操作完整保留在“我的笔记”；当前是另一份新草稿。'); }
  }
  const source = preview?.origin ?? activeNote?.origin, locked = busy || !!draft?.pending;
  const changed = !!activeNote && !!draft && (draft.title !== activeNote.title || draft.markdown !== activeNote.markdown || draft.revision !== activeNote.revision);
  const overLimit = (draft?.markdown.length ?? 0) > 30000, writeLocked = locked || !!assessmentBlock;
  if (typeof document === 'undefined') return null;
  return createPortal(<WorkspaceDialog onClose={props.onClose}><div className="assistant-notes-overlay"><section role="dialog" aria-modal="true" aria-label="私人学习笔记" className="assistant-notes-sheet" data-original-font-status={fonts.ready ? 'ready' : fonts.error ? 'error' : 'loading'}>
    <header><div><small>LEARNING NOTES</small><h2>私人学习笔记</h2><p>原文和编辑稿分别保留，不计作掌握证据。</p></div><button type="button" aria-label="关闭学习笔记" onClick={props.onClose}>×</button></header>
    <nav aria-label="笔记工作区"><button onClick={() => { setMode('edit'); setError(''); }} aria-pressed={mode === 'edit'}>选择原消息</button><button onClick={() => { setMode('list'); setError(''); }} aria-pressed={mode === 'list'}>我的笔记</button></nav>
    {error && <p role="alert" className="assistant-notes-error">{error}</p>}{notice && <p role="status">{notice}</p>}{storage && <p role="status">{storage}<button onClick={localDownload}>下载本机稿</button></p>}
    {assessmentBlock && <aside aria-label="当前评测保护" className="assistant-notes-pending"><p>{assessmentBlock.message}</p><p>已有笔记仍可阅读、下载。本机文字和原操作继续保留。</p><a href={assessmentBlock.href}>进入原评测</a><button disabled={busy || !draft?.messageIds.length} onClick={() => void preflight()}>重新核对笔记权限</button></aside>}
    {fonts.error && <p role="status">笔记字体暂未完整读取。<button onClick={fonts.retry}>重新准备字体</button></p>}
    {!cache || !draft ? <p role="status">正在读取本人笔记…</p> : mode === 'list' ? <>
      <section aria-label="本机保留草稿"><h3>本机保留草稿</h3><ul>{Object.entries(cache.drafts).map(([slot, row]) => <li key={slot}><button onClick={() => selectSlot(slot)}>{row.title || '未命名草稿'}{row.pending ? ' · 原操作待核对' : row.dirty ? ' · 有未保存文字' : ' · 本机保留'}</button></li>)}</ul></section>
      <section aria-label="服务端已保存笔记"><h3>已保存的笔记</h3>{!list && <p role="status">正在读取笔记列表…</p>}{list?.items.length === 0 && <p>这段对话还没有保存的笔记。</p>}<ul>{list?.items.map(row => <li key={row.id}><button onClick={() => openSaved(row.id)}>{row.title}<small>{row.status === 'confirmed' ? '已核对采用' : '待核对稿件'}</small></button></li>)}</ul>{list?.nextCursor && <button disabled={busy} onClick={() => void loadList(list.nextCursor!)}>更早的笔记</button>}<button disabled={busy} onClick={() => void loadList()}>重新读取列表</button></section>
    </> : <>
      <label>标题<input aria-label="笔记标题" value={draft.title} maxLength={160} disabled={locked || activeNote?.status === 'confirmed'} onChange={e => update({ title: e.target.value, dirty: true })}/></label>
      {!draft.noteId ? <><label>复习目标<input aria-label="笔记复习目标" value={draft.objective} maxLength={500} disabled={locked} onChange={e => update({ objective: e.target.value }, true)}/></label>
        <fieldset disabled={locked}><legend>选择原消息（已选 {draft.messageIds.length} / 20 条）</legend><div className="assistant-notes-actions"><label>查找这段原对话<input aria-label="查找笔记原消息" value={query} maxLength={120} onChange={e => setQuery(e.target.value)}/></label><button disabled={!query.trim()} onClick={() => void props.searchMessages(query)}>查找原消息</button><button onClick={() => { setQuery(''); void props.resetMessages(); }}>恢复最近原消息</button></div><div className="assistant-notes-messages">{props.messages.map(message => <label className="assistant-notes-message" key={message.id}><input type="checkbox" aria-label={(message.sender === 'assistant' ? '选择原回答 ' : '选择原问题 ') + message.id} checked={draft.messageIds.includes(message.id)} disabled={!draft.messageIds.includes(message.id) && draft.messageIds.length >= 20} onChange={e => update({ messageIds: e.target.checked ? [...draft.messageIds, message.id] : draft.messageIds.filter(id => id !== message.id) }, true)}/><span><strong>{message.sender === 'assistant' ? '助教原回答' : '原问题'}</strong><span>{message.content}</span></span></label>)}</div>{props.hasOlder && <button type="button" onClick={() => void props.loadOlder()}>更早的原消息</button>}<label className="assistant-notes-check"><input type="checkbox" checked={draft.linked} onChange={e => update({ linked: e.target.checked }, true)}/>同时包含回答关联的原问题</label></fieldset>
        <div className="assistant-notes-actions"><button disabled={locked || !draft.messageIds.length || !draft.objective.trim()} onClick={() => void preflight()}>核对完整来源</button>{preview && <><span>{preview.origin.messages.length} 条原消息 · 完整来源 {preview.contextCharacters} / {preview.maxContextCharacters} 字符</span><button disabled={writeLocked || !preview.fits || !draft.title.trim()} onClick={() => { const requestKey = crypto.randomUUID(); void execute({ kind: 'create', key: requestKey, noteId: null, input: { kind: 'verbatim_note', title: draft.title, objective: draft.objective, selection: { messageIds: draft.messageIds, includeLinkedQuestions: draft.linked }, preflightFingerprint: preview.fingerprint, requestKey } }); }}>保存逐字候选</button></>}</div>{preview?.blocked && <p role="alert">{preview.blocked.message}</p>}
      </> : <>
        <p>{activeNote?.status === 'confirmed' ? changed ? '服务器稿已采用；下方是本机未保存稿，尚未采用。' : '已核对采用 · 原稿只读' : '独立编辑稿 · 尚未采用'}</p><section className="assistant-note-reading-section" aria-label="笔记阅读稿"><h3>{changed ? '本机未保存稿' : '阅读稿'}</h3><AssistantNoteReading markdown={draft.markdown}/></section>
        {activeNote?.status === 'confirmed' ? <details><summary>查看可复制原稿</summary><label>编辑稿<textarea aria-label="笔记编辑稿" value={draft.markdown} readOnly/></label></details> : <label>编辑稿<textarea aria-label="笔记编辑稿" aria-describedby="assistant-note-character-count" value={draft.markdown} disabled={locked} onChange={e => update({ markdown: e.target.value, dirty: true })}/></label>}
        <p id="assistant-note-character-count" role="status" className={overLimit ? 'assistant-notes-error' : undefined}>{draft.markdown.length} / 30000 字符{overLimit ? ` · 超出 ${draft.markdown.length - 30000} 字符，全文保留在本机。请缩短后保存，或下载本机稿。` : ''}</p>
        <button disabled={busy} onClick={() => void readNote(draft.noteId!, cache.active)}>读取最新服务器稿</button>
        {changed && activeNote && <details><summary>对照服务器已保存全文</summary><h3>{activeNote.title} · {activeNote.status === 'confirmed' ? '已核对采用' : '待核对稿件'} · 版本 {activeNote.revision}</h3><pre>{activeNote.markdown}</pre><button disabled={busy} onClick={adoptServer}>使用服务器稿，保留本机副本</button></details>}
        <div className="assistant-notes-actions"><button disabled={writeLocked || overLimit || !draft.markdown.length || !draft.title.trim() || !activeNote || activeNote.status === 'confirmed' || !changed} onClick={() => { const requestKey = crypto.randomUUID(); void execute({ kind: 'edit', key: requestKey, noteId: draft.noteId, input: { expectedRevision: draft.revision, title: draft.title, markdown: draft.markdown, requestKey } }); }}>保存编辑稿</button>
          {activeNote?.status === 'ready' && <><label className="assistant-notes-check"><input type="checkbox" checked={reviewed} disabled={writeLocked || overLimit || changed} onChange={e => setReviewed(e.target.checked)}/>我已核对原文和编辑稿</label><button disabled={writeLocked || overLimit || changed || !reviewed} onClick={() => { const requestKey = crypto.randomUUID(); void execute({ kind: 'confirm', key: requestKey, noteId: draft.noteId, input: { expectedRevision: draft.revision, contentFingerprint: activeNote.contentFingerprint, acknowledgeReview: true, requestKey } }); }}>采用这份笔记</button></>}
        </div><p>完整JSON和Markdown下载服务器已保存版本；本机未保存文字请使用“下载本机稿”。</p><div className="assistant-notes-actions"><button disabled={busy || !activeNote} onClick={() => void exportNote('json')}>下载完整JSON</button><button disabled={busy || !activeNote} onClick={() => void exportNote('markdown')}>下载完整Markdown</button>{activeNote && <button onClick={() => props.onLocate(activeNote.origin.selection.requestedMessageIds[0])}>返回原消息</button>}</div>
      </>}
      {draft.pending && <aside className="assistant-notes-pending" aria-label="笔记原操作"><p>原{draft.pending.kind === 'create' ? '创建' : draft.pending.kind === 'edit' ? '保存' : '采用'}操作尚需核对，文字和原请求已保留。</p><button disabled={busy} onClick={() => void recover()}>核对原操作</button>{missingRequest && <button disabled={busy || !!assessmentBlock} onClick={() => void execute(draft.pending!, true)}>用原请求重试</button>}<button disabled={busy} onClick={anotherDraft}>保留原操作，另建笔记草稿</button></aside>}
      {source && <details open className="assistant-notes-original"><summary>完整原文与实际来源（{source.messages.length} 条）</summary><p>{source.studentId ? '原学生学习档案' : '本人独立学习'}</p>{source.course && <p>{source.course.courseTitle} · {source.course.itemTitle}</p>}{source.lecture && <p>{source.lecture.courseTitle} · {source.lecture.lectureTitle}</p>}{source.teachingScope && <p>原教学年级：{source.teachingScope.grade ?? '未指定'}{source.teachingScope.term ? source.teachingScope.term === 'upper' ? ' · 上册' : ' · 下册' : ''} · 保留原教学版本 {source.teachingScope.courseVersion}</p>}{source.lecture && !source.teachingScope && <p>保留原教学版本 {source.lecture.courseVersion}</p>}{source.messages.map(message => <article key={message.id}><h3>{message.sender === 'assistant' ? '助教原回答' : '原问题'}</h3><pre>{message.content}</pre><small>原模型：{message.modelName ?? message.modelId ?? '无已保存模型'}</small>{message.sourceReferences.length ? message.sourceReferences.map(reference => <p key={reference.key}>{internalAssistantHref(reference.href) ? <a href={reference.href}>{reference.title}{reference.page ? ' · 第' + reference.page + '页' : ''}</a> : reference.title}{reference.quote && <span>{reference.quote}</span>}</p>) : <p>无已保存引用</p>}</article>)}</details>}
      <button className="assistant-notes-local-download" onClick={localDownload}>下载本机稿</button>
    </>}{busy && <p role="status">正在核对笔记…</p>}
  </section></div></WorkspaceDialog>, document.body);
}
