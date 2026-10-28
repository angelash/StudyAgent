'use client';
import * as React from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { topicWhiteboardInputSchema, topicWhiteboardCreateSchema, topicWhiteboardConfirmSchema, topicWhiteboardControlSchema,
  type TopicWhiteboardDraftView, type StudioTopicWhiteboard, type StudioSubject, type StudioOverview } from '@study-agent/contracts';
import { ApiRequestError, apiRequest } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import { XiaojiuModelPicker, useXiaojiuModels } from '../../../components/xiaojiu-model-picker';
import { StudioNavigation } from '../studio-navigation';
import { WhiteboardPlayer } from '../whiteboard-player';
import { TopicContentEditor, downloadTopicJson } from './content-editor';
import { TopicManuscript } from './manuscript';
import { topicCopies, topicStorage } from './local-copies';
import { topicCommandMatches } from './command-digest';
import '../studio.css';
import '../workspace.css';
import './whiteboards.css';

const base = '/learning/studio/topic-whiteboards';
const active = new Set(['queued', 'generating', 'cancelling']);
const statusLabel: Record<TopicWhiteboardDraftView['status'], string> = { queued: '等待生成', generating: '正在生成', ready: '待你核对', failed: '生成未完成', cancelling: '正在取消', cancelled: '已取消', confirmed: '已保存白板' };
type Page<T> = { items: T[]; page: number; limit: number; total: number };
type Selection = { kind: 'draft' | 'whiteboard'; id: string } | null;
type Scope = { studentId: string; subject: StudioSubject };
type Preflight = { fingerprint: string; available: boolean; modelId: string; modelName: string; contextCharacters: number; targets: Array<{ id: string; name: string; objective: string }> };
const formSchema = z.object({ prompt: z.string().max(2000), objective: z.string().max(1000), modelId: z.string().max(160), atomIds: z.array(z.string().max(180)).max(6) }).strict();
type Form = z.infer<typeof formSchema>;
type PrepareCommand = ReturnType<typeof topicWhiteboardCreateSchema.parse>;
type ComposerCopy = { form: Form; pending: PrepareCommand | null; rejected: unknown };
function readSelection(): Selection {
  const params = new URLSearchParams(window.location.search), kind = params.has('draft') ? 'draft' : 'whiteboard', id = params.get(kind);
  return id && id.length <= 180 ? { kind, id } : null;
}
export function TopicWhiteboardWorkbench() {
  const identity = useSessionUser();
  if (identity === undefined) return <main className="tw-gate" role="status">正在确认学习身份…</main>;
  if (!identity) return <main className="tw-gate"><h1>把一个问题，讲清楚。</h1><p>登录后生成、核对并保留自己的白板。</p><Link href="/parent/login">登录学习工作台 →</Link></main>;
  return <TopicWorkspace key={identity.id + ':' + identity.role} identity={identity}/>;
}
function TopicWorkspace({ identity }: { identity: NonNullable<ReturnType<typeof useSessionUser>> }) {
  const models = useXiaojiuModels();
  const [scope, setScope] = React.useState<Scope>({ studentId: identity.role === 'student' ? identity.studentId ?? '' : '', subject: 'math' });
  const [profiles, setProfiles] = React.useState<StudioOverview['children']>([]), [overview, setOverview] = React.useState<StudioOverview | null>(null);
  const [selection, setSelection] = React.useState<Selection>(null), [row, setRow] = React.useState<TopicWhiteboardDraftView | null>(null), [board, setBoard] = React.useState<StudioTopicWhiteboard | null>(null);
  const sourceReturn = React.useRef<{ boardId: string; draftId: string } | null>(null);
  const [drafts, setDrafts] = React.useState<Page<TopicWhiteboardDraftView> | null>(null), [published, setPublished] = React.useState<Page<StudioTopicWhiteboard> | null>(null);
  const [listPage, setListPage] = React.useState(1), [search, setSearch] = React.useState(''), [refresh, setRefresh] = React.useState(0), [tab, setTab] = React.useState<'drafts' | 'saved'>('drafts');
  const [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [canLeave, setCanLeave] = React.useState(true), [loading, setLoading] = React.useState(false);
  const [formCanLeave, setFormCanLeave] = React.useState(true), formLeaveChange = React.useCallback((value: boolean) => setFormCanLeave(value), []);
  const [selectionEpoch, setSelectionEpoch] = React.useState(0);
  const leaveAllowed = React.useRef(canLeave && formCanLeave), currentHref = React.useRef(''); leaveAllowed.current = canLeave && formCanLeave;
  const canLeaveChange = React.useCallback((value: boolean) => setCanLeave(value), []);
  React.useEffect(() => {
    currentHref.current = window.location.href; setSelection(readSelection()); const back = () => {
      if (!leaveAllowed.current) { window.history.pushState(null, '', currentHref.current); setNotice('请先保存或下载完整改稿，再离开当前候选。'); return; }
      currentHref.current = window.location.href; setRow(null); setBoard(null); setSelection(readSelection()); setSelectionEpoch(value => value + 1);
    };
    window.addEventListener('popstate', back); return () => window.removeEventListener('popstate', back);
  }, []);
  React.useEffect(() => {
    const controller = new AbortController();
    void apiRequest<StudioOverview['children']>('/learning/students', { signal: controller.signal }).then(setProfiles)
      .catch(error => { if (!controller.signal.aborted) setError(error.message); }); return () => controller.abort();
  }, []);
  React.useEffect(() => {
    setOverview(null); const controller = new AbortController(), params = new URLSearchParams({ subject: scope.subject });
    if (scope.studentId) params.set('studentId', scope.studentId);
    void apiRequest<StudioOverview>('/learning/studio/overview?' + params, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setOverview(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); }); return () => controller.abort();
  }, [scope.studentId, scope.subject]);
  React.useEffect(() => {
    const controller = new AbortController(); const timer = setTimeout(() => {
      const query = '?page=' + listPage + '&limit=12&search=' + encodeURIComponent(search);
      void Promise.all([apiRequest<Page<TopicWhiteboardDraftView>>(base + '/drafts' + query, { signal: controller.signal }),
        apiRequest<Page<StudioTopicWhiteboard>>(base + query, { signal: controller.signal })]).then(([drafts, saved]) => {
        if (!controller.signal.aborted) { setDrafts(drafts); setPublished(saved); }
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    }, 180); return () => { clearTimeout(timer); controller.abort(); };
  }, [listPage, search, refresh]);
  React.useEffect(() => {
    if (!selection) { setRow(null); setBoard(null); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    const path = selection.kind === 'draft' ? base + '/drafts/' + selection.id : base + '/' + selection.id;
    void apiRequest<TopicWhiteboardDraftView | StudioTopicWhiteboard>(path, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      if (selection.kind === 'draft') {
        const draft = value as TopicWhiteboardDraftView; setRow(draft); setBoard(null);
        setScope({ studentId: draft.studentId ?? '', subject: draft.subject ?? 'math' });
      } else {
        const saved = value as StudioTopicWhiteboard; setBoard(saved); setRow(null); setScope({ studentId: saved.studentId ?? '', subject: saved.subject ?? 'math' });
      }
    }).catch(error => { if (!controller.signal.aborted) { setRow(null); setBoard(null); setError(error.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selection?.kind, selection?.id, selectionEpoch]);
  React.useEffect(() => {
    if (!row || !active.has(row.status)) return;
    const controller = new AbortController(); let polling = false;
    const timer = setInterval(() => {
      if (polling) return; polling = true;
      void apiRequest<TopicWhiteboardDraftView>(base + '/drafts/' + row.id, { signal: controller.signal }).then(value => {
        if (!controller.signal.aborted) { setRow(value); if (!active.has(value.status)) setRefresh(value => value + 1); }
      }).catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) { setRow(null); setBoard(null); }
        setError(error.message);
      }).finally(() => { polling = false; });
    }, 1500); return () => { clearInterval(timer); controller.abort(); };
  }, [row?.id, row?.status]);
  function choose(next: Selection, knownForm = false) {
    if (!canLeave || !knownForm && !formCanLeave) { setNotice('当前输入未能存到本机，请先保存或下载完整副本后再离开。'); return; }
    setRow(null); setBoard(null); setSelection(next); setCanLeave(true); setNotice('');
    setSelectionEpoch(value => value + 1);
    const query = next ? '?' + next.kind + '=' + encodeURIComponent(next.id) : ''; window.history.pushState(null, '', '/studio/whiteboards' + query); currentHref.current = window.location.href;
  }
  function changeScope(next: Scope) {
    if (!canLeave || !formCanLeave) { setNotice('请先保存或下载完整输入，再切换学习范围。'); return; }
    choose(null); setScope(next); setError('');
  }
  const list = tab === 'drafts' ? drafts : published;
  return <main className="tw-shell"><StudioNavigation active="whiteboards"/><div className="tw-body">
    <header className="tw-page-header"><div><span className="tw-eyebrow">WHITEBOARD STUDIO</span><h1>从一个问题开始，讲清每一步。</h1><p>先生成教学稿，完整核对后再保存。AI 讲解需要内容核对。</p></div><Link href="/studio">返回学习工作台 →</Link></header>
    {(error || notice || models.error) && <div className="tw-notice" role="status">{error || notice || models.error}<button onClick={() => { setError(''); setNotice(''); }}>收起提示</button></div>}
    <div className="tw-workspace"><aside className="tw-composer"><header><span className="tw-eyebrow">NEW BOARD</span><h2>这次想弄懂什么？</h2></header>
      <label>学习对象<select aria-label="白板学习对象" value={scope.studentId} onChange={event => changeScope({ ...scope, studentId: event.target.value })}>
        {identity.role !== 'student' && <option value="">我自己 · 成人主题</option>}{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.nickname} · {profile.grade}年级</option>)}</select></label>
      {scope.studentId && <label>学科<select value={scope.subject} onChange={event => changeScope({ ...scope, subject: event.target.value as StudioSubject })}><option value="math">数学</option><option value="chinese">语文</option><option value="english">英语</option></select></label>}
      <TopicComposer key={scope.studentId + ':' + scope.subject} ownerId={identity.id} scope={scope} overview={overview} models={models} onCanLeaveChange={formLeaveChange}
        onCreated={value => { setFormCanLeave(true); choose({ kind: 'draft', id: value.id }, true); setRefresh(value => value + 1); }}/>
    </aside><section className="tw-main" aria-label="白板工作区">
      {loading ? <p role="status">正在读取原白板…</p> : row ? <TopicCandidate key={row.id} row={row} ownerId={identity.id} onChanged={value => { setRow(value); setRefresh(value => value + 1); }}
        onCanLeaveChange={canLeaveChange} onOpen={id => { sourceReturn.current = row.audience.kind === 'assistant' ? { boardId: id, draftId: row.id } : null; choose({ kind: 'whiteboard', id }); }}/> : board ? <section className="tw-saved-board"><span className="tw-eyebrow">SAVED BOARD</span><h2>{board.title}</h2><p>AI生成 · 待内容核对 · {board.origin.modelName}</p>
        <button className="tw-primary" onClick={() => setBoard({ ...board })}>继续阅读</button>{board.origin.draftId && <button onClick={() => choose({ kind: 'draft', id: board.origin.draftId! })}>查看自己的原稿</button>}</section> :
        <div className="tw-empty"><div aria-hidden="true" className="tw-board-mark">Aa <span>＋</span> ∑</div><h2>让知识有条理地展开。</h2><p>概念、步骤、对照表与公式，保留完整讲稿。生成后你可以修改和核对，再开始逐句播放。</p><small>成人主题无需建立孩子档案。孩子白板只使用明确选择的已学知识点。</small></div>}
      {board && <WhiteboardPlayer whiteboard={board} narrationAvailable={overview?.narrationAvailable} speech={overview?.speech} onClose={() => choose(sourceReturn.current?.boardId === board.id ? { kind: 'draft', id: sourceReturn.current.draftId } : null)}/>}
    </section><aside className="tw-library" aria-label="白板与候选历史"><header><h2>我的白板</h2><button onClick={() => choose(null)}>＋ 新白板</button></header>
      <div className="tw-tabs"><button aria-pressed={tab === 'drafts'} onClick={() => { setTab('drafts'); setListPage(1); }}>教学草稿</button><button aria-pressed={tab === 'saved'} onClick={() => { setTab('saved'); setListPage(1); }}>已保存</button></div>
      <label className="tw-search"><span className="sr-only">搜索我的白板</span><input placeholder="搜索主题或标题" value={search} onChange={event => { setSearch(event.target.value); setListPage(1); }}/></label>
      {!list ? <p role="status">正在读取历史…</p> : !list.items.length ? <p className="tw-muted">这里还没有匹配的白板。</p> : list.items.map(value => 'status' in value ? <button className="tw-history-card" key={value.id} onClick={() => choose({ kind: 'draft', id: value.id })} aria-current={selection?.id === value.id ? 'true' : undefined}>
        <small>{statusLabel[value.status]} · {value.studentId ? '孩子白板' : '本人主题'}</small><b>{value.content?.title ?? value.prompt}</b><span>{value.modelName}</span></button> :
        <button className="tw-history-card" key={value.id} onClick={() => choose({ kind: 'whiteboard', id: value.id })} aria-current={selection?.id === value.id ? 'true' : undefined}><small>AI生成 · 待核对</small><b>{value.title}</b><span>{value.scenes.length}幕 · {value.origin.modelName}</span></button>)}
      <div className="tw-pagination"><button disabled={listPage <= 1} onClick={() => setListPage(value => value - 1)}>上一页</button><span>{listPage} / {Math.max(1, Math.ceil((list?.total ?? 0) / 12))}</span><button disabled={!list || listPage * 12 >= list.total} onClick={() => setListPage(value => value + 1)}>下一页</button></div>
    </aside></div>
  </div></main>;
}

function TopicComposer({ ownerId, scope, overview, models, onCreated, onCanLeaveChange }: { ownerId: string; scope: Scope; overview: StudioOverview | null;
  models: ReturnType<typeof useXiaojiuModels>; onCreated: (row: TopicWhiteboardDraftView) => void; onCanLeaveChange: (value: boolean) => void }) {
  const [form, setForm] = React.useState<Form>({ prompt: '', objective: '', modelId: '', atomIds: [] }), [ready, setReady] = React.useState(false);
  const [preflight, setPreflight] = React.useState<Preflight | null>(null), [pending, setPending] = React.useState<ReturnType<typeof topicWhiteboardCreateSchema.parse> | null>(null);
  const [busy, setBusy] = React.useState(''), [notice, setNotice] = React.useState(''), [storageError, setStorageError] = React.useState(false);
  const [rejected, setRejected] = React.useState<unknown>(null);
  const [downloaded, setDownloaded] = React.useState(false), [knownForm, setKnownForm] = React.useState('');
  const request = React.useRef<AbortController | null>(null);
  const storage = React.useMemo(() => topicStorage('studyagent.topic-whiteboard.form.v1.' + ownerId + '.' + (scope.studentId || 'adult') + '.' + (scope.studentId ? scope.subject : '')), [ownerId, scope.studentId, scope.subject]), key = storage.key;
  const [copies, setCopies] = React.useState<Array<{ key: string; at: number; value: ComposerCopy }>>([]);
  function decode(raw: string): ComposerCopy | null {
    const saved = JSON.parse(raw), parsed = formSchema.safeParse(saved.form);
    if (!parsed.success || saved.ownerId !== undefined && saved.ownerId !== ownerId || saved.studentId !== undefined && saved.studentId !== scope.studentId || saved.subject !== undefined && saved.subject !== scope.subject) return null;
    const original = saved.pending ? topicWhiteboardCreateSchema.safeParse(saved.pending) : null;
    const command = original?.success ? original.data : null;
    if (command && (scope.studentId ? command.audience.kind !== 'student' || command.audience.studentId !== scope.studentId || command.audience.subject !== scope.subject : command.audience.kind !== 'adult')) return null;
    return { form: parsed.data, pending: command, rejected: saved.rejected ?? null };
  }
  const cached = (command: PrepareCommand | null) => ({ ownerId, studentId: scope.studentId, subject: scope.subject, form, pending: command, rejected, at: Date.now() });
  React.useEffect(() => {
    try { for (const candidate of storage.restoreKeys) { const raw = localStorage.getItem(candidate); if (!raw || raw.length > 20000) continue;
      const saved = decode(raw); if (saved) { setForm(saved.form); setPending(saved.pending); setRejected(saved.rejected); setNotice('已恢复此标签页的原主题与模型选择。'); break; } } }
    catch { setStorageError(true); } setReady(true); return () => request.current?.abort();
  }, [key]);
  React.useEffect(() => { if (ready && !form.modelId && models.catalog) setForm(value => ({ ...value, modelId: models.modelId })); }, [ready, models.catalog, models.modelId, form.modelId]);
  React.useEffect(() => {
    if (!ready) return; try { localStorage.setItem(key, JSON.stringify(cached(pending))); setStorageError(false); onCanLeaveChange(true); }
    catch { setStorageError(true); onCanLeaveChange(downloaded || !pending && (JSON.stringify(form) === knownForm || !form.prompt && !form.objective && !form.atomIds.length)); }
  }, [form, pending, rejected, key, ready, downloaded, knownForm, onCanLeaveChange]);
  const unsafe = storageError && !downloaded && Boolean(pending || JSON.stringify(form) !== knownForm && (form.prompt || form.objective || form.atomIds.length));
  React.useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (unsafe) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [unsafe]);
  const atoms = scope.studentId && overview?.selected?.id === scope.studentId && overview.selected.subject === scope.subject ? overview.selected.atoms : [];
  const modelAvailable = Boolean(models.catalog?.models.some(model => model.id === form.modelId) || form.modelId === 'auto');
  function change(update: Partial<Form>) { setDownloaded(false); onCanLeaveChange(false); setForm(value => ({ ...value, ...update })); setPreflight(null); }
  function input() { return topicWhiteboardInputSchema.parse({ prompt: form.prompt, objective: form.objective, modelId: form.modelId,
    audience: scope.studentId ? { kind: 'student', studentId: scope.studentId, subject: scope.subject, atomIds: form.atomIds } : { kind: 'adult' } }); }
  async function run(action: 'preflight' | 'generate') {
    if (busy || !ready) return; request.current?.abort(); const operation = new AbortController(); request.current = operation; setBusy(action); setNotice('');
    let sent: typeof pending = null;
    try {
      if (action === 'preflight') {
        const result = await apiRequest<Preflight>(base + '/preflight', { method: 'POST', body: JSON.stringify(input()), signal: operation.signal });
        if (!operation.signal.aborted) setPreflight(result); return;
      }
      if (!pending && !preflight) throw Error('请先预检当前主题和范围。');
      const command = pending ?? { ...input(), preflightFingerprint: preflight!.fingerprint, requestKey: crypto.randomUUID() };
      sent = command;
      setPending(command); setDownloaded(false); try { localStorage.setItem(key, JSON.stringify(cached(command))); } catch { setStorageError(true); }
      const result = await apiRequest<TopicWhiteboardDraftView>(base + '/drafts', { method: 'POST', body: JSON.stringify(command), signal: operation.signal });
      if (operation.signal.aborted) return;
      if (result.receipt?.key !== command.requestKey || result.receipt.kind !== 'prepare') throw Error('原生成回执尚未确认，请保留原请求并继续定位。');
      setPending(null); setPreflight(null); setKnownForm(JSON.stringify(form)); onCreated(result);
    } catch (error) { if (!operation.signal.aborted) {
      if (action === 'generate' && error instanceof ApiRequestError && [400, 409].includes(error.status)) {
        setRejected(sent); setPending(null); setPreflight(null);
      }
      setNotice(error instanceof z.ZodError ? '请填写至少3个字的主题和目标，并明确选择知识点与可用模型。' : (error as Error).message);
    } }
    finally { if (!operation.signal.aborted) setBusy(''); }
  }
  return <section className="tw-topic-form" aria-label="新建AI白板"><fieldset disabled={Boolean(busy) || !ready || Boolean(pending)}>
    <label>讲解主题<textarea rows={3} maxLength={2000} value={form.prompt} placeholder="例如：为什么先统一单位，才能比较和合并？" onChange={event => change({ prompt: event.target.value })}/></label>
    <label>希望弄懂什么<textarea rows={3} maxLength={1000} value={form.objective} placeholder="想理解的区别、步骤，或一个具体困惑" onChange={event => change({ objective: event.target.value })}/></label>
    {scope.studentId && <fieldset className="tw-goals"><legend>明确选择这次要讲的知识点（最多6个）</legend>{atoms.length ? atoms.map(atom => <label key={atom.id}><input type="checkbox" checked={form.atomIds.includes(atom.id)} disabled={!form.atomIds.includes(atom.id) && form.atomIds.length >= 6}
      onChange={event => change({ atomIds: event.target.checked ? [...form.atomIds, atom.id] : form.atomIds.filter(id => id !== atom.id) })}/><span>{atom.name}</span></label>) : <p>尚未取得当前已确认知识点。请先确认学习范围。</p>}</fieldset>}
    <XiaojiuModelPicker error={models.error} onRetry={models.reload} catalog={models.catalog} value={form.modelId || models.modelId} onChange={modelId => { models.setModelId(modelId); change({ modelId }); }} compact/>
  </fieldset>
    {pending && <p className="tw-notice">原生成请求仍需定位；恢复时继续使用原主题、范围与模型。</p>}
    {ready && models.catalog && !modelAvailable && <p role="status">原模型目前不在可用目录，请明确选择模型后再预检。</p>}
    {scope.studentId && overview && form.atomIds.some(id => !atoms.some(atom => atom.id === id)) && <p className="tw-notice">原选择中有知识点已不在当前范围。<button onClick={() => change({ atomIds: form.atomIds.filter(id => atoms.some(atom => atom.id === id)) })}>移除当前不可用的选择</button></p>}
    {storageError && <p role="alert">本机存储暂不可用，请下载原主题和请求后再离开。</p>}
    {notice && <p className="tw-notice" role="status">{notice}</p>}
    {preflight && <div className="tw-preflight"><b>本次使用 {preflight.modelName}</b><p>{preflight.targets.length ? preflight.targets.map(target => target.name).join('、') : '本人成人主题，不关联孩子能力记录。'}</p><p>{preflight.available ? '可生成教学候选，生成后仍需核对。' : '模型连接当前不可用，请稍后重新预检。'}</p></div>}
    <div className="tw-actions"><button disabled={Boolean(busy) || Boolean(pending) || !modelAvailable} onClick={() => void run('preflight')}>{busy === 'preflight' ? '正在预检…' : '预检主题与范围'}</button>
      <button className="tw-primary" disabled={Boolean(busy) || !pending && (!preflight?.available || !modelAvailable)} onClick={() => void run('generate')}>{busy === 'generate' ? '正在定位生成任务…' : pending ? '恢复原生成请求' : '生成教学稿'}</button></div>
    {busy && <button onClick={() => { request.current?.abort(); setBusy(''); setNotice('已停止等待，原请求仍保留。恢复可定位原任务。'); }}>停止等待</button>}
    <button className="tw-download-link" onClick={() => { downloadTopicJson({ form, pending, rejected, scope }, 'whiteboard-topic.json'); setDownloaded(true); onCanLeaveChange(true); }}>下载原主题与请求</button>
    <details className="tw-local-copies"><summary onClick={() => { try { setCopies(topicCopies(storage, decode, 20000)); } catch { setNotice('暂时无法读取其他本机主题，当前输入仍保留。'); } }}>查看其他本机主题</summary>
      {copies.length ? copies.map(copy => <article key={copy.key}><p>{copy.value.form.prompt || '未填写主题的本机稿'}</p>
        <button disabled={Boolean(busy) || Boolean(pending) || unsafe} onClick={() => { setDownloaded(false); setForm(copy.value.form); setPending(copy.value.pending); setRejected(copy.value.rejected); setPreflight(null); setNotice('已明确恢复所选主题及原模型；生成前仍需预检或定位原请求。'); }}>恢复这个本机主题</button>
        <button onClick={() => downloadTopicJson(copy.value, 'whiteboard-topic-copy.json')}>下载这个本机主题</button></article>) : <p>尚未读取到其他已绑定的本机主题。</p>}</details>
  </section>;
}

function TopicCandidate({ row, ownerId, onChanged, onCanLeaveChange, onOpen }: { row: TopicWhiteboardDraftView; ownerId: string;
  onChanged: (row: TopicWhiteboardDraftView) => void; onCanLeaveChange: (value: boolean) => void; onOpen: (id: string) => void }) {
  const [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState(''), [acknowledge, setAcknowledge] = React.useState(false);
  const [editingDirty, setEditingDirty] = React.useState(true);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { const frame = requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' }); }); return () => cancelAnimationFrame(frame); }, [row.id]);
  const dirtyChanged = React.useCallback((value: boolean) => setEditingDirty(value), []);
  React.useEffect(() => setAcknowledge(false), [row.contentFingerprint]);
  const [pending, setPending] = React.useState<{ action: 'confirm' | 'cancel' | 'retry'; body: unknown } | null>(null);
  const [editorCanLeave, setEditorCanLeave] = React.useState(true), [storedCommand, setStoredCommand] = React.useState(''), [downloadedCommand, setDownloadedCommand] = React.useState('');
  const editorLeaveChange = React.useCallback((value: boolean) => setEditorCanLeave(value), []);
  const commandSignature = pending ? JSON.stringify(pending) : '', unsafeCommand = Boolean(pending && storedCommand !== commandSignature && downloadedCommand !== commandSignature);
  React.useEffect(() => { onCanLeaveChange(editorCanLeave && !unsafeCommand); }, [editorCanLeave, unsafeCommand, commandSignature, busy, onCanLeaveChange]);
  React.useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (unsafeCommand) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [unsafeCommand]);
  const [history, setHistory] = React.useState<Page<{ version: number; content: unknown; at: string }> | null>(null);
  const [rejected, setRejected] = React.useState<unknown>(null);
  const operation = React.useRef<AbortController | null>(null), historyRequest = React.useRef<AbortController | null>(null);
  const storage = React.useMemo(() => topicStorage('studyagent.topic-whiteboard.command.v1.' + ownerId + '.' + row.id), [ownerId, row.id]), key = storage.key;
  const [copies, setCopies] = React.useState<Array<{ key: string; at: number; value: NonNullable<typeof pending> }>>([]);
  React.useEffect(() => {
    if (!pending) return;
    try { localStorage.setItem(key, JSON.stringify({ ...pending, ownerId, id: row.id, at: Date.now() })); setStoredCommand(commandSignature); }
    catch { setNotice('原操作未存到本机，请先下载原稿与请求，再离开此页。'); }
  }, [key, commandSignature, ownerId, row.id]);
  function decode(raw: string): NonNullable<typeof pending> | null {
    const value = JSON.parse(raw);
    if (value.resolved) return null;
    if (value.ownerId !== undefined && value.ownerId !== ownerId || value.id !== undefined && value.id !== row.id) return null;
    const parsed = value.action === 'confirm' ? topicWhiteboardConfirmSchema.safeParse(value.body) : ['cancel', 'retry'].includes(value.action) ? topicWhiteboardControlSchema.safeParse(value.body) : null;
    return parsed?.success ? { action: value.action, body: parsed.data } : null;
  }
  React.useEffect(() => {
    try { for (const candidate of storage.restoreKeys) { const raw = localStorage.getItem(candidate); if (!raw || raw.length > 4000) continue;
      const value = JSON.parse(raw); if (value.ownerId === ownerId && value.id === row.id && value.resolved === true) { setRejected(value.rejected ?? null); break; }
      const original = decode(raw); if (original) { setPending(original); break; } } }
    catch { setNotice('本机操作缓存不可用，请下载原稿以保留副本。'); }
    return () => { operation.current?.abort(); historyRequest.current?.abort(); };
  }, [key]);
  const warning = !row.review || row.review.decision === 'uncertain' || !row.review.current;
  async function perform(action: 'confirm' | 'cancel' | 'retry') {
    if (busy) return; const original = pending ?? { action, body: action === 'confirm' ? { expectedRevision: row.revision, contentFingerprint: row.contentFingerprint,
      acknowledgeAiGeneratedContent: true, acknowledgeUnreviewedChanges: acknowledge, requestKey: crypto.randomUUID() } :
      { expectedRevision: row.revision, generation: row.generation, taskVersion: row.task?.version, requestKey: crypto.randomUUID() } };
    const body = original.body as { requestKey: string }; onCanLeaveChange(false); setPending(original); setBusy(true); setNotice('');
    try { localStorage.setItem(key, JSON.stringify({ ...original, ownerId, id: row.id, at: Date.now() })); } catch { setNotice('操作未存到本机，当前页仍保留原请求。'); }
    operation.current?.abort(); const request = new AbortController(); operation.current = request;
    try {
      let result: TopicWhiteboardDraftView | null = null;
      if (pending) try { result = await apiRequest<TopicWhiteboardDraftView>(base + '/drafts/' + row.id + '/requests/' + encodeURIComponent(body.requestKey), { signal: request.signal }); }
      catch (error) { if (!(error instanceof ApiRequestError) || error.status !== 404) throw error; }
      if (result && !await topicCommandMatches(original.action, body, result.receipt?.commandFingerprint)) result = null;
      result ??= await apiRequest<TopicWhiteboardDraftView>(base + '/drafts/' + row.id + '/' + original.action, { method: 'POST', body: JSON.stringify(body), signal: request.signal });
      if (request.signal.aborted) return;
      if (result.receipt?.key !== body.requestKey || result.receipt.kind !== original.action) throw Error('原操作回执尚未确认。');
      setPending(null); try { localStorage.setItem(key, JSON.stringify({ ownerId, id: row.id, resolved: true, at: Date.now() })); } catch { /* The known receipt remains readable from the server. */ }
      onChanged(result); setNotice(result.receipt.generation !== result.generation ? '已找到原操作；当前已有后续生成，请按页面状态继续。' : original.action === 'confirm' ? '白板已保存，仍标记为AI生成、待内容核对。' : original.action === 'cancel' ? '已提交取消，请以任务实际状态为准。' : '已用原输入和原模型重新排队。');
    } catch (error) { if (!request.signal.aborted) {
      if (error instanceof ApiRequestError && [400, 409].includes(error.status)) { setRejected(original); setPending(null); try { localStorage.setItem(key, JSON.stringify({ ownerId, id: row.id, resolved: true, rejected: original, at: Date.now() })); } catch {} }
      setNotice((error as Error).message + ' 原稿仍保留，可下载副本。');
      if (error instanceof ApiRequestError && error.status === 409) try {
        const current = await apiRequest<TopicWhiteboardDraftView>(base + '/drafts/' + row.id, { signal: request.signal }); if (!request.signal.aborted) onChanged(current);
      } catch { if (!request.signal.aborted) setNotice('原稿仍保留，最新服务器版本暂未读到，请稍后重新读取当前候选。'); }
    } }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  async function loadHistory(page = 1) {
    historyRequest.current?.abort(); const request = new AbortController(); historyRequest.current = request;
    try { const result = await apiRequest<Page<{ version: number; content: unknown; at: string }>>(base + '/drafts/' + row.id + '/history?page=' + page + '&limit=3', { signal: request.signal });
      if (!request.signal.aborted) setHistory(result); } catch (error) { if (!request.signal.aborted) setNotice((error as Error).message); }
  }
  return <article className="tw-candidate"><header><span className="tw-eyebrow">{statusLabel[row.status]}</span><h2 ref={heading} tabIndex={-1}>{row.content?.title ?? row.prompt}</h2><p>{row.modelName} · {row.audience.kind === 'assistant' ? '来自本人原对话 · 私人教学白板' : row.studentId ? '孩子已确认范围' : '本人成人主题'}</p></header>
    <div className="tw-generation-state" role="status">{active.has(row.status) ? row.status === 'cancelling' ? '正在停止原生成进程…' : row.stage === 'reviewing' ? '教学初稿已保留，正在复核…' : '正在编写完整教学稿…' : statusLabel[row.status]}</div>
    {row.status === 'failed' && <p className="tw-notice">生成未完成，已保存的阶段继续保留。你可以用原模型重试，或下载现有稿件。</p>}
    <div className="tw-actions">{['queued', 'generating'].includes(row.status) && <button disabled={busy || Boolean(pending)} onClick={() => void perform('cancel')}>取消生成</button>}
      {['failed', 'cancelled'].includes(row.status) && <button disabled={busy || Boolean(pending)} onClick={() => void perform('retry')}>用原模型重试</button>}
      {pending && <button disabled={busy} onClick={() => void perform(pending.action)}>恢复原{pending.action === 'confirm' ? '确认' : pending.action === 'cancel' ? '取消' : '重试'}请求</button>}
      {row.whiteboardId && <button className="tw-primary" onClick={() => onOpen(row.whiteboardId!)}>打开已保存白板</button>}
      <button onClick={() => { downloadTopicJson({ row, pending, rejected }, 'whiteboard-manuscript.json'); setDownloadedCommand(commandSignature); }}>下载原稿与请求</button></div>
    {notice && <p className="tw-notice" role="status">{notice}</p>}
    <details className="tw-local-copies"><summary onClick={() => { try { setCopies(topicCopies(storage, decode, 4000)); } catch { setNotice('暂时无法读取其他本机操作，当前原请求仍保留。'); } }}>查看其他本机操作</summary>
      {copies.length ? copies.map(copy => <article key={copy.key}><p>原{copy.value.action === 'confirm' ? '确认保存' : copy.value.action === 'cancel' ? '取消生成' : '重试'}请求</p>
        <button disabled={busy || Boolean(pending)} onClick={() => { setPending(copy.value); setNotice('已恢复所选原操作，请点击恢复原请求来核对服务器回执。'); }}>恢复这次原操作</button>
        <button onClick={() => downloadTopicJson(copy.value, 'whiteboard-original-command.json')}>下载这次原操作</button></article>) : <p>尚未读取到其他已绑定的原操作。</p>}</details>
    {row.review && <section className="tw-review"><h3>AI 复核 · {row.review.current ? row.review.decision === 'uncertain' ? '仍有待核对问题' : row.review.decision === 'revised' ? '已给出修订稿' : '未提出修改' : '针对旧稿，尚未复核当前修改'}</h3>
      <p>这不是教师审核，也不代表孩子已掌握。</p>{row.review.issues.length > 0 && <ul>{row.review.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}</section>}
    {row.content && <TopicContentEditor key={row.id} row={row} ownerId={ownerId} onSaved={onChanged} onCanLeaveChange={editorLeaveChange} onDirtyChange={dirtyChanged}/>}
    {row.originalContent && <details className="tw-original"><summary>阅读AI最初原稿</summary><TopicManuscript content={row.originalContent}/></details>}
    {row.content && <section className="tw-history"><button onClick={() => void loadHistory()}>查看完整修改历史</button>{history && <>{history.items.map(item => <details key={item.version}><summary>第{item.version}版 · {new Date(item.at).toLocaleString()}</summary><TopicManuscript content={item.content}/><button onClick={() => downloadTopicJson(item, 'whiteboard-history-' + item.version + '.json')}>下载此完整版本</button></details>)}
      <div className="tw-pagination"><button disabled={history.page <= 1} onClick={() => void loadHistory(history.page - 1)}>上一组历史</button><span>{history.total}个旧版本</span><button disabled={history.page * history.limit >= history.total} onClick={() => void loadHistory(history.page + 1)}>下一组历史</button></div></>}</section>}
    {row.status === 'ready' && <footer className="tw-confirm"><p>保存后保持AI生成、待内容核对；不会写入能力或评测结果。</p>{warning && <label><input type="checkbox" checked={acknowledge} onChange={event => setAcknowledge(event.target.checked)}/>我已阅读未确定问题或手工改稿，知晓仍需内容核对</label>}
      {editingDirty && <p>请先保存完整改稿，并比较服务器版本后再确认。</p>}
      <button className="tw-primary" disabled={busy || Boolean(pending) || editingDirty || warning && !acknowledge} onClick={() => void perform('confirm')}>确认并保存这份白板</button></footer>}
  </article>;
}
