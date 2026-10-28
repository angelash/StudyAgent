'use client';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { assistantWhiteboardCreateSchema, assistantWhiteboardPreflightSchema, type AssistantHistoryMessage, type AssistantWhiteboardPage,
  type AssistantWhiteboardPreflight, type TopicWhiteboardDraftView } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../lib/api';
import { internalAssistantHref } from '../lib/assistant-course-navigation';
import { useOriginalTeachingFonts } from '../lib/original-teaching-fonts';
import { WorkspaceDialog } from '../app/studio/workspace-dialog';
import { AssistantWhiteboardOrigin } from '../app/studio/whiteboards/assistant-source';
import { assistantWhiteboardCommandMatches } from '../app/studio/whiteboards/command-digest';
import { downloadTopicJson } from '../app/studio/whiteboards/download';
import { topicCopies, topicStorage } from '../app/studio/whiteboards/local-copies';
import { XiaojiuModelPicker, useXiaojiuModels, XIAOJIU_MODEL_STORAGE_KEY } from './xiaojiu-model-picker';
import './assistant-notes.css';
import './assistant-whiteboards.css';

type Block = { code: 'assessment_in_progress'; message: string; href: string };
type Props = { ownerId: string; sessionId: string; initialIds: string[]; messages: AssistantHistoryMessage[]; assessmentBlock?: Block;
  hasOlder: boolean; loadOlder: () => Promise<void>; searchMessages: (query: string) => Promise<void>; resetMessages: () => Promise<void>; onClose: () => void; onLocate: (id: string) => void };
const formSchema = z.object({ selection: z.object({ messageIds: z.array(z.string().min(1).max(180)).max(20).refine(ids => new Set(ids).size === ids.length), includeLinkedQuestions: z.boolean() }).strict(),
  objective: z.string().max(500), modelId: z.string().min(1).max(160), acknowledgeHistoricalSource: z.boolean() }).strict();
type Form = z.infer<typeof formSchema>;
type Command = z.infer<typeof assistantWhiteboardCreateSchema>;
type Cache = { version: 1; ownerId: string; sessionId: string; form: Form; pending: Command | null; archived: Command[]; draftId: string | null; at?: number };
const labels: Record<TopicWhiteboardDraftView['status'], string> = { queued: '等待生成', generating: '正在生成与复核', ready: '待你核对', failed: '本次未完成', cancelled: '已取消', cancelling: '正在取消', confirmed: '已保存白板' };
const text = '对话教学白板 选择原消息 对话白板 我的白板 教学目标 核对完整来源 生成教学草稿 原文支持 新增解释 原教学年级 学生档案年级 关闭对话白板 核对原请求 用原请求重试 下载完整本机草稿 保留原请求并重新选择 同时包含回答关联的原问题 我已核对原教学版本 更早的原消息 返回原消息 打开教学草稿 原稿、来源及编辑稿分别保留，不计为知识掌握。本机保留草稿 每个标签页分别保留 打开副本前会保留当前选择 另起一份白板草稿 读取最新本机草稿 原请求待核对 保留完整选择 已有教学草稿';

export function AssistantWhiteboardsPanel(props: Props) {
  const base = '/ai/assistant/sessions/' + encodeURIComponent(props.sessionId) + '/artifacts/whiteboards';
  const baseKey = 'studyagent.assistant.whiteboards.v1.' + encodeURIComponent(props.ownerId) + '.' + encodeURIComponent(props.sessionId);
  const local = React.useMemo(() => topicStorage(baseKey), [baseKey]), key = local.key;
  const models = useXiaojiuModels();
  const [cache, setCache] = React.useState<Cache | null>(null), current = React.useRef<Cache | null>(null), writable = React.useRef(true);
  const [mode, setMode] = React.useState<'source' | 'list'>(props.initialIds.length ? 'source' : 'list');
  const [preview, setPreview] = React.useState<AssistantWhiteboardPreflight | null>(null), [page, setPage] = React.useState<AssistantWhiteboardPage | null>(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [storage, setStorage] = React.useState('');
  const [query, setQuery] = React.useState(''), [missing, setMissing] = React.useState(false), [assessment, setAssessment] = React.useState(props.assessmentBlock);
  const dead = React.useRef(false), epoch = React.useRef(0), requests = React.useRef(new Set<AbortController>());
  const retained = React.useRef(''), downloadedCache = React.useRef(''), downloadedCommand = React.useRef('');
  const [copies, setCopies] = React.useState<Array<{ key: string; at: number; value: Cache }>>([]);
  const fonts = useOriginalTeachingFonts('assistant-whiteboards:' + key, text + JSON.stringify(cache?.form ?? {}) + JSON.stringify(preview?.origin ?? {}), 'standard');
  React.useEffect(() => { setAssessment(props.assessmentBlock); }, [props.assessmentBlock?.href, props.assessmentBlock?.message]);
  function decode(raw: string): Cache | null {
    if (raw.length > 100000) return null;
    const checked = z.object({ version: z.literal(1), ownerId: z.literal(props.ownerId), sessionId: z.literal(props.sessionId), form: formSchema,
      pending: assistantWhiteboardCreateSchema.nullable(), archived: z.array(assistantWhiteboardCreateSchema).max(10), draftId: z.string().min(1).max(180).nullable(), at: z.number().finite().optional() }).strict().safeParse(JSON.parse(raw));
    return checked.success ? checked.data : null;
  }
  function persist(value: Cache): boolean {
    current.current = value; setCache(value);
    if (writable.current) try {
      const bytes = JSON.stringify(value); localStorage.setItem(key, bytes);
      if (localStorage.getItem(key) !== bytes) throw Error(); retained.current = bytes; return true;
    } catch { setStorage('本机保存暂不可用，关闭前请下载完整本机草稿与原请求。'); }
    return false;
  }
  function refreshCopies() {
    try { setCopies(topicCopies(local, decode, 100000)); } catch { setStorage('本机副本暂时无法读取，当前全文继续保留。'); }
  }
  function fresh(): Cache {
    let modelId = 'deepseek-v4-flash'; try { modelId = localStorage.getItem(XIAOJIU_MODEL_STORAGE_KEY) || modelId; } catch {}
    return { version: 1, ownerId: props.ownerId, sessionId: props.sessionId, form: { selection: { messageIds: props.initialIds, includeLinkedQuestions: false },
      objective: '把这些解释整理为简练板书，并留下独立检查问题', modelId, acknowledgeHistoricalSource: false }, pending: null, archived: [], draftId: null };
  }
  function downloadLocal() {
    if (!current.current) return; downloadTopicJson(current.current, 'assistant-whiteboard-local.json'); retained.current = JSON.stringify(current.current); downloadedCache.current = retained.current;
    downloadedCommand.current = current.current.pending ? JSON.stringify(current.current.pending) : '';
    setNotice('已发起完整本机稿下载。请确认文件已保存，再明确切换或核对原请求。');
  }
  function close() {
    if (current.current && retained.current !== JSON.stringify(current.current)) { setStorage('当前全文尚未保留，请先下载完整本机草稿再关闭。'); return; }
    props.onClose();
  }
  function switchDraft(next?: Cache) {
    const value = current.current; if (!value || busy) return;
    // Every retained copy has a new key; another document's bytes are never replaced.
    try {
      const copyKey = baseKey + '.' + crypto.randomUUID(), bytes = JSON.stringify({ ...value, at: Date.now() });
      if (!writable.current || localStorage.getItem(copyKey) !== null) throw Error();
      localStorage.setItem(copyKey, bytes); if (localStorage.getItem(copyKey) !== bytes) throw Error();
    } catch { setStorage('当前草稿副本尚未写入，请先下载完整本机草稿，再明确切换。'); if (downloadedCache.current !== JSON.stringify(value)) return; }
    epoch.current++; for (const controller of requests.current) controller.abort(); requests.current.clear();
    downloadedCommand.current = ''; downloadedCache.current = ''; setPreview(null); setError(''); setMissing(false); setPage(null); setMode('source');
    persist(next ? structuredClone(next) : fresh()); refreshCopies();
    setNotice(next ? '已打开完整本机副本；原请求先核对回执，不会自动重发。' : '原草稿已保留。新选择需重新核对完整来源。');
  }
  React.useEffect(() => {
    dead.current = false; writable.current = true;
    let saved: Cache | null = null;
    try {
      for (const candidate of local.restoreKeys) {
        const raw = localStorage.getItem(candidate); if (!raw) continue;
        saved = decode(raw);
        if (!saved) { writable.current = false; setStorage('原白板缓存与当前身份或格式不一致，已保留原字节。当前选择可下载。'); }
        break;
      }
    } catch { writable.current = false; setStorage('本机白板缓存暂不可用，当前选择可下载，已保存白板可从服务端读取。'); }
    const value = saved ?? fresh();
    if (saved && props.initialIds.some(id => !saved.form.selection.messageIds.includes(id))) setNotice('上次的来源选择和原请求已保留。可在下方明确勾选这条消息。');
    persist(value); refreshCopies();
    return () => { dead.current = true; epoch.current++; for (const controller of requests.current) controller.abort(); requests.current.clear(); };
  }, [key]);
  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (current.current && retained.current !== JSON.stringify(current.current)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [key]);
  async function call<T>(path: string, body?: unknown) {
    const controller = new AbortController(); requests.current.add(controller);
    try { return await apiRequest<T>(path, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), signal: controller.signal }); }
    catch (error) {
      if (!dead.current && error instanceof ApiRequestError && error.details?.code === 'assessment_in_progress' && typeof error.details.href === 'string') {
        const href = internalAssistantHref(error.details.href); if (href) setAssessment({ code: 'assessment_in_progress', message: error.message, href });
      }
      throw error;
    } finally { requests.current.delete(controller); }
  }
  function update(next: Form) {
    if (!current.current || busy || current.current.pending) return;
    epoch.current++; persist({ ...current.current, form: next, draftId: null }); setPreview(null); setError('');
  }
  async function list(cursor?: string) {
    const version = ++epoch.current; setBusy(true); setError('');
    try { const value = await call<AssistantWhiteboardPage>(base + '?' + new URLSearchParams({ pageSize: '20', ...(cursor ? { cursor } : {}) }));
      if (!dead.current && version === epoch.current) setPage(old => cursor && old ? { items: [...old.items, ...value.items], nextCursor: value.nextCursor } : value);
    } catch (error) { if (!dead.current && version === epoch.current) setError((error as Error).message); }
    finally { if (!dead.current && version === epoch.current) setBusy(false); }
  }
  React.useEffect(() => { if (mode === 'list') void list(); }, [mode, base]);
  async function preflight() {
    if (!current.current) return; const version = ++epoch.current; setBusy(true); setError('');
    try { const input = assistantWhiteboardPreflightSchema.parse(current.current.form), value = await call<AssistantWhiteboardPreflight>(base + '/preflight', input);
      if (!dead.current && version === epoch.current) { setPreview(value); setAssessment(undefined); }
    } catch (error) { if (!dead.current && version === epoch.current) setError((error as Error).message); }
    finally { if (!dead.current && version === epoch.current) setBusy(false); }
  }
  async function execute(action: 'create' | 'probe' | 'retry') {
    const original = current.current; if (!original || busy) return;
    const command = original.pending ?? (preview?.canGenerate ? assistantWhiteboardCreateSchema.parse({ ...original.form, preflightFingerprint: preview.fingerprint, requestKey: crypto.randomUUID() }) : null);
    if (!command) return; const version = ++epoch.current;
    const persisted = persist({ ...original, pending: command });
    if (action !== 'probe' && !persisted && downloadedCommand.current !== JSON.stringify(command)) {
      setStorage('完整原请求尚未写入本机。请下载完整本机草稿，确认文件已保存后，先核对原请求再明确重试。'); return;
    }
    setBusy(true); setError(''); setMissing(false);
    try {
      const result = action === 'probe' ? await call<TopicWhiteboardDraftView>(base + '/requests/' + encodeURIComponent(command.requestKey)) : await call<TopicWhiteboardDraftView>(base, command);
      if (dead.current || version !== epoch.current) return;
      if (result.receipt?.key !== command.requestKey || result.receipt.kind !== 'prepare' || !await assistantWhiteboardCommandMatches(props.sessionId, command, result.receipt.commandFingerprint))
        throw Error('原创建回执与完整选择尚未匹配，原请求继续保留。');
      if (dead.current || version !== epoch.current) return;
      persist({ ...current.current!, pending: null, draftId: result.id }); setNotice('原教学草稿与任务已保存。打开草稿核对逐幕来源、图片和讲稿后，再明确采用。');
    } catch (error) {
      if (!dead.current && version === epoch.current) {
        if (action === 'probe' && error instanceof ApiRequestError && error.status === 404) { setMissing(true); setNotice('尚未找到原创建回执，可明确用同一原请求重试。'); }
        else setError((error as Error).message);
      }
    } finally { if (!dead.current && version === epoch.current) setBusy(false); }
  }
  function archivePending() {
    const value = current.current; if (!value?.pending || busy) return;
    if (value.archived.length >= 10) { setNotice('已保留10份原请求副本，请先下载完整本机草稿；没有覆盖原请求。'); return; }
    persist({ ...value, archived: [...value.archived, value.pending], pending: null }); setPreview(null); setMissing(false); setNotice('原请求已作为独立副本保留。请重新选择后明确预检。');
  }
  if (!cache) return null;
  const form = cache.form, locked = busy || Boolean(cache.pending), selected = form.selection.messageIds;
  const absent = selected.filter(id => !props.messages.some(message => message.id === id));
  return createPortal(<WorkspaceDialog onClose={close}><div className="assistant-notes-overlay"><section role="dialog" aria-modal="true" aria-label="对话教学白板" className="assistant-notes-sheet assistant-whiteboards-sheet" data-original-font-status={fonts.ready ? 'ready' : fonts.error ? 'error' : 'loading'}>
    <header><div><span className="tw-eyebrow">CONVERSATION TO CLASSROOM</span><h2>把这次解释，讲清楚。</h2><p>提炼为板书，保留原文与每一幕的依据。</p></div><button type="button" aria-label="关闭对话白板" onClick={close}>关闭</button></header>
    <nav className="assistant-notes-actions"><button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>选择原消息</button><button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>我的对话白板</button>
      <button onClick={downloadLocal}>下载完整本机草稿</button></nav>
    <details className="assistant-whiteboard-local-copies"><summary>本机保留草稿（{copies.length}）</summary><p>每个标签页分别保留，打开副本前会保留当前选择。</p><div className="assistant-notes-actions"><button disabled={busy} onClick={() => switchDraft()}>另起一份白板草稿</button><button disabled={busy} onClick={refreshCopies}>读取最新本机草稿</button></div><ul>{copies.map(copy => <li key={copy.key}><button disabled={busy} onClick={() => switchDraft(copy.value)}><span>{copy.value.form.objective || '未完成的教学目标'}</span><small>{copy.value.pending ? '原请求待核对' : copy.value.draftId ? '已有教学草稿' : '保留完整选择'} · {copy.at ? new Date(copy.at).toLocaleString('zh-CN') : '本机副本'}</small></button></li>)}</ul></details>
    {storage && <p role="status">{storage}</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {assessment && <aside className="assistant-notes-pending"><p>{assessment.message}。已有白板和原请求仍可阅读，本机选择继续保留。</p><a href={internalAssistantHref(assessment.href) ?? undefined}>进入原评测</a><button disabled={busy || !!cache.pending} onClick={() => void preflight()}>重新核对白板权限</button></aside>}
    {mode === 'list' ? <section aria-label="原会话白板列表"><button disabled={busy} onClick={() => void list()}>读取最新白板</button>{!page ? <p role="status">正在读取原会话白板…</p> : <><ul>{page.items.map(item => <li key={item.id}><a href={'/studio/whiteboards?draft=' + encodeURIComponent(item.id)}><b>{item.prompt}</b><span>{labels[item.status]} · {item.modelName} · {new Date(item.updatedAt).toLocaleString('zh-CN')}</span></a></li>)}</ul>{!page.items.length && <p>这段对话还没有保存白板。</p>}{page.nextCursor && <button disabled={busy} onClick={() => void list(page.nextCursor!)}>更早的白板</button>}</>}</section> : <>
      <form onSubmit={event => { event.preventDefault(); void props.searchMessages(query).catch(error => setError(error.message)); }} className="assistant-notes-actions"><label>搜索原消息<input value={query} maxLength={120} onChange={event => setQuery(event.target.value)}/></label><button disabled={busy || !query.trim()}>搜索</button><button type="button" disabled={busy} onClick={() => void props.resetMessages().catch(error => setError(error.message))}>恢复最近消息</button></form>
      <fieldset disabled={locked}><legend>选择原消息（{selected.length}/20）</legend><div className="assistant-notes-messages">{props.messages.map(message => <label key={message.id} className="assistant-notes-message"><input type="checkbox" checked={selected.includes(message.id)} disabled={!selected.includes(message.id) && selected.length >= 20}
        onChange={event => update({ ...form, selection: { ...form.selection, messageIds: event.target.checked ? [...selected, message.id] : selected.filter(id => id !== message.id) } })}/><span><strong>{message.sender === 'user' ? '原问题' : '助教原回答'}</strong><span>{message.content}</span><small>{message.modelName ?? message.modelId ?? '本人消息'}</small></span></label>)}</div>
        {!!absent.length && <p>仍保留{absent.length}条未在当前页的原消息选择。完整预检会逐条读取，不会因分页丢失。</p>}
        {props.hasOlder && <button type="button" onClick={() => void props.loadOlder().catch(error => setError(error.message))}>更早的原消息</button>}
        <label className="assistant-notes-check"><input type="checkbox" checked={form.selection.includeLinkedQuestions} onChange={event => update({ ...form, selection: { ...form.selection, includeLinkedQuestions: event.target.checked } })}/>同时包含回答关联的原问题</label>
        <label>教学目标<textarea aria-label="白板教学目标" maxLength={500} rows={3} value={form.objective} onChange={event => update({ ...form, objective: event.target.value })}/></label>
        <XiaojiuModelPicker catalog={models.catalog} error={models.error} onRetry={models.reload} value={form.modelId} onChange={modelId => { models.setModelId(modelId); update({ ...form, modelId }); }} disabled={locked}/>
        <label className="assistant-notes-check"><input type="checkbox" checked={form.acknowledgeHistoricalSource} onChange={event => update({ ...form, acknowledgeHistoricalSource: event.target.checked })}/>我已核对原教学版本，允许使用旧来源</label>
      </fieldset>
      <div className="assistant-notes-actions"><button disabled={locked || selected.length === 0 || form.objective.trim().length < 3} onClick={() => void preflight()}>核对完整来源</button><button disabled={locked || !!assessment || !preview?.canGenerate} onClick={() => void execute('create')}>生成教学草稿</button></div>
      {preview && <aside className="tw-source-context"><p>{preview.contextCharacters}/{preview.maxContextCharacters}字符 · 固定模型：{preview.modelName}</p><p>原教学年级：{preview.audience.courseGrade ?? '未指定'} · 学生档案年级：{preview.audience.profileGrade ?? '未指定'}</p>{preview.blocked && <p role="status">{preview.blocked.message}</p>}<AssistantWhiteboardOrigin origin={preview.origin} onLocate={props.onLocate}/></aside>}
    </>}
    {cache.pending && <aside className="assistant-notes-pending" aria-label="白板原创建操作"><p>创建结果尚需核对。完整原请求和模型已保留。</p><button disabled={busy} onClick={() => void execute('probe')}>核对原请求</button>{missing && <button disabled={busy || !!assessment} onClick={() => void execute('retry')}>用原请求重试</button>}<button disabled={busy} onClick={archivePending}>保留原请求并重新选择</button></aside>}
    {cache.draftId && <a className="assistant-whiteboard-open" href={'/studio/whiteboards?draft=' + encodeURIComponent(cache.draftId)}>打开教学草稿 →</a>}
    <p>原稿、来源及编辑稿分别保留。生成和阅读不计为知识掌握。</p>
  </section></div></WorkspaceDialog>, document.body);
}
