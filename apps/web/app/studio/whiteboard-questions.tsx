'use client';
import * as React from 'react';
import { z } from 'zod';
import { WHITEBOARD_QUESTION_INTENTS, type WhiteboardQuestionContextView, type WhiteboardQuestionPosition,
  type WhiteboardQuestionTurnView, type StudioQuestionWhiteboard, type WhiteboardTeachingNotes } from '@study-agent/contracts';
import { ApiRequestError, apiRequest, getAuthToken } from '../../lib/api';
import { XiaojiuModelPicker, useXiaojiuModels } from '../../components/xiaojiu-model-picker';
import { isTopicWhiteboard, type PlayableWhiteboard } from './whiteboard-original';
import { topicCopies, topicStorage } from './whiteboards/local-copies';
import { downloadTopicJson } from './whiteboards/download';
import './whiteboard-questions.css';
import { whiteboardQuestionNotesMarkdown } from './whiteboard-question-notes';
import { WhiteboardQuestionFigures } from './whiteboard-question-figures';

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/), key = z.string().min(8).max(180);
const formSchema = z.object({ message: z.string().max(3000), modelId: z.string().max(180), intent: z.enum(WHITEBOARD_QUESTION_INTENTS) }).strict();
const commandSchema = z.object({ fingerprint, unitId: z.string().min(1).max(2000), contextVersion: fingerprint, requestKey: key,
  modelId: z.string().min(1).max(180), intent: z.enum(WHITEBOARD_QUESTION_INTENTS), message: z.string().min(1).max(3000),
  bookmark: z.object({ progress: z.number().min(0).max(1), audioTime: z.number().min(0).max(86400).nullable(), mode: z.enum(['text','cloud']), voice: z.string().max(180),
    speed: z.union([z.literal(.5),z.literal(.75),z.literal(1),z.literal(1.25),z.literal(1.5),z.literal(2)]),
    camera: z.object({ zoom: z.number().min(.5).max(2), x: z.number().min(-1000000).max(1000000), y: z.number().min(-1000000).max(1000000), follow: z.boolean() }).strict().optional() }).strict() }).strict();
const pendingSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('create'), command: commandSchema }).strict(),
  z.object({ kind: z.enum(['cancel','retry']), turnId: z.string().max(180), command: z.object({ requestKey: key, generation: z.number().int().min(1), version: z.number().int().min(1) }).strict() }).strict()]);
type Form = z.infer<typeof formSchema>;
type Pending = z.infer<typeof pendingSchema>;
type Page = { turns: WhiteboardQuestionTurnView[]; page: number; pageSize: number; hasMore: boolean; total: number };
const active = new Set(['queued','running','cancelling']);
const statuses: Record<WhiteboardQuestionTurnView['status'], string> = { queued: '等待回答', running: '正在思考', cancelling: '正在取消', completed: 'AI补充讲解', failed: '回答未完成', cancelled: '已取消' };
const intents: Record<Form['intent'], string> = { question: '问一个问题', example: '换个例子', simplify: '讲简单些', prerequisite: '补补基础', compare: '对比理解' };

export function WhiteboardQuestions({ board, ownerId, disabled, capture, onReturn, onOpenTeaching, onUnavailable, onCanLeaveChange }:
  { board: PlayableWhiteboard; ownerId: string; disabled: boolean; capture: () => WhiteboardQuestionPosition | null;
    onReturn: (position: WhiteboardQuestionPosition) => void; onOpenTeaching: (board: StudioQuestionWhiteboard, trigger: HTMLElement) => void;
    onUnavailable: () => void; onCanLeaveChange: (value: boolean) => void }) {
  const kind = isTopicWhiteboard(board) ? 'topic' : 'guidance', base = '/learning/studio/' + (kind === 'topic' ? 'topic-whiteboards/' : 'whiteboards/') + encodeURIComponent(board.id) + '/questions';
  const models = useXiaojiuModels();
  const storage = React.useMemo(() => topicStorage('studyagent.whiteboard.questions.v1.' + ownerId + '.' + kind + '.' + board.id + '.' + board.fingerprint), [ownerId, kind, board.id, board.fingerprint]);
  const [form, setForm] = React.useState<Form>({ message: '', modelId: 'auto', intent: 'question' }), [pending, setPending] = React.useState<Pending | null>(null);
  const [ready, setReady] = React.useState(false), [busy, setBusy] = React.useState(false), [storageError, setStorageError] = React.useState(false);
  const [turns, setTurns] = React.useState<WhiteboardQuestionTurnView[]>([]), [earlierPage, setEarlierPage] = React.useState(0), [historyReady, setHistoryReady] = React.useState(false);
  const [notice, setNotice] = React.useState(''), [downloaded, setDownloaded] = React.useState('');
  const [copies, setCopies] = React.useState<Array<{ key: string; at: number; value: { form: Form; pending: Pending | null } }>>([]);
  const [figureTurn, setFigureTurn] = React.useState<string | null>(null), [teachingVersions, setTeachingVersions] = React.useState<Record<string, string>>({});
  const figureCanLeave = React.useRef(true), questionUnsafe = React.useRef(false), figureTrigger = React.useRef<HTMLButtonElement | null>(null);
  const figureLeaveChange = React.useCallback((value: boolean) => { figureCanLeave.current = value; callbacks.current.onCanLeaveChange(value && !questionUnsafe.current); }, []);
  const alive = React.useRef(false), requests = React.useRef(new Set<AbortController>()), serial = React.useRef(0), posting = React.useRef(false);
  const callbacks = React.useRef({ onUnavailable, onCanLeaveChange }); callbacks.current = { onUnavailable, onCanLeaveChange };
  const copy = { version: 1, ownerId, boardKind: kind, boardId: board.id, fingerprint: board.fingerprint, form, pending };
  const current = React.useRef(copy); current.current = copy;
  const serialized = JSON.stringify(copy), unsafe = Boolean(form.message.trim() || pending) && storageError && serialized !== downloaded;
  questionUnsafe.current = unsafe;
  const canLeave = React.useRef(!unsafe); canLeave.current = !unsafe && figureCanLeave.current;
  const activeTurn = turns.find(turn => active.has(turn.status));
  function decode(raw: string) {
    if (raw.length > 64000) return null;
    const value = JSON.parse(raw), parsedForm = formSchema.safeParse(value.form), parsedPending = value.pending ? pendingSchema.safeParse(value.pending) : null;
    if (value.ownerId !== ownerId || value.boardKind !== kind || value.boardId !== board.id || value.fingerprint !== board.fingerprint ||
      !parsedForm.success || value.pending && !parsedPending?.success) return null;
    return { form: parsedForm.data, pending: parsedPending?.success ? parsedPending.data : null };
  }
  function adopt(value: NonNullable<ReturnType<typeof decode>>) {
    if (posting.current || Boolean(current.current.pending)) { setNotice('请先确认当前原请求，再恢复其他输入。'); return; }
    if (current.current.form.message.trim() && JSON.stringify(current.current) !== downloaded) { setNotice('请先下载当前完整提问副本，再恢复另一份输入。'); return; }
    serial.current++; setForm(value.form); setPending(value.pending); setNotice('已恢复所选完整副本；原请求需核对后继续。');
  }
  function persist(value: typeof copy) {
    try { localStorage.setItem(storage.key, JSON.stringify({ ...value, at: Date.now() })); setStorageError(false); }
    catch { setStorageError(true); }
  }
  function remember(value: Pending | null) { current.current = { ...current.current, pending: value }; setPending(value); persist(current.current); }
  function update(turn: WhiteboardQuestionTurnView) {
    setTurns(rows => [...rows.filter(row => row.id !== turn.id), turn].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
  }
  async function read<T>(path: string, options: RequestInit = {}) {
    if (!alive.current) throw new Error('当前白板已关闭');
    const controller = new AbortController(); requests.current.add(controller);
    try { return await apiRequest<T>(base + path, { ...options, signal: controller.signal }); }
    finally { requests.current.delete(controller); }
  }
  function fail(error: unknown) {
    if (!alive.current || error instanceof DOMException && error.name === 'AbortError') return;
    if (error instanceof ApiRequestError && [401,403,404].includes(error.status)) { setTurns([]); callbacks.current.onUnavailable(); return; }
    setNotice(error instanceof Error ? error.message : '暂时无法读取原插问，请保留完整输入后重试。');
  }
  async function history() {
    const first = await read<Page>('?page=1&pageSize=10');
    const page = first.hasMore ? await read<Page>('?page=' + Math.ceil(first.total / 10) + '&pageSize=10') : first;
    if (!alive.current) return;
    setTurns(page.turns); setEarlierPage(page.page - 1); setHistoryReady(true);
  }
  React.useEffect(() => {
    alive.current = true;
    void history().catch(fail);
    const before = (event: BeforeUnloadEvent) => { if (!canLeave.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => { alive.current = false; serial.current++; for (const controller of requests.current) controller.abort(); requests.current.clear(); window.removeEventListener('beforeunload', before); };
  }, [base]);
  React.useEffect(() => {
    if (ready || !models.catalog) return;
    try {
      for (const candidate of storage.restoreKeys) {
        const raw = localStorage.getItem(candidate); if (!raw || raw.length > 64000) continue;
        const value = decode(raw); if (!value) continue;
        setForm(value.form); setPending(value.pending);
        setNotice('已恢复这份原稿在本页的完整输入和原请求。'); setReady(true); return;
      }
    } catch { setStorageError(true); }
    setForm(value => ({ ...value, modelId: models.modelId })); setReady(true);
  }, [models.catalog, models.modelId, ready, storage, ownerId, kind, board.id, board.fingerprint]);
  React.useEffect(() => { if (ready) persist(current.current); }, [serialized, ready, storage.key]);
  React.useEffect(() => { callbacks.current.onCanLeaveChange(!unsafe && figureCanLeave.current); }, [unsafe]);
  React.useEffect(() => {
    if (!ready || !pending || pending.kind !== 'create') return;
    const requestKey = pending.command.requestKey; let valid = true;
    void read<WhiteboardQuestionTurnView>('/requests/' + encodeURIComponent(requestKey)).then(turn => {
      if (!valid || !alive.current || current.current.pending?.kind !== 'create' || current.current.pending.command.requestKey !== requestKey) return;
      const command = current.current.pending.command;
      update(turn); remember(null); setForm(value => value.message.trim() === command.message && value.intent === command.intent &&
        (value.modelId === 'auto' ? models.catalog?.defaultModel : value.modelId) === command.modelId ? { ...value, message: '' } : value);
      setNotice('已找回原提问，未重复创建。');
    }).catch(error => { if (!valid || !alive.current) return; if (error instanceof ApiRequestError && error.status === 404) setNotice('原请求尚未找到。可以按原请求继续发送，保留原模型和原句。'); else fail(error); });
    return () => { valid = false; };
  }, [ready, pending?.kind, pending?.kind === 'create' ? pending.command.requestKey : null]);
  React.useEffect(() => {
    if (!activeTurn) return;
    let polling = false;
    const timer = setInterval(() => {
      if (polling) return; polling = true;
      void read<WhiteboardQuestionTurnView>('/' + encodeURIComponent(activeTurn.id)).then(turn => { if (alive.current) update(turn); }).catch(fail).finally(() => { polling = false; });
    }, 1200);
    return () => clearInterval(timer);
  }, [activeTurn?.id, activeTurn?.status]);
  async function execute(command: Pending) {
    if (posting.current || disabled) return;
    posting.current = true; setBusy(true); remember(command); setNotice(''); const epoch = serial.current;
    try {
      const path = command.kind === 'create' ? '' : '/' + encodeURIComponent(command.turnId) + '/' + command.kind;
      const turn = await read<WhiteboardQuestionTurnView>(path, { method: 'POST', body: JSON.stringify(command.command) });
      if (!alive.current || epoch !== serial.current) return;
      update(turn); remember(null);
      if (command.kind === 'create') setForm(value => value.message.trim() === command.command.message && value.intent === command.command.intent &&
        (value.modelId === 'auto' ? models.catalog?.defaultModel : value.modelId) === command.command.modelId ? { ...value, message: '' } : value);
    } catch (error) { fail(error); }
    finally { posting.current = false; if (alive.current) setBusy(false); }
  }
  async function send() {
    if (posting.current || pending || activeTurn || disabled || !form.message.trim() || !models.catalog || !historyReady) return;
    const position = capture(); if (!position) return;
    posting.current = true; setBusy(true); setNotice('');
    const snapshot = { ...form }, epoch = serial.current;
    try {
      const context = await read<WhiteboardQuestionContextView>('/context?' + new URLSearchParams({ fingerprint: position.fingerprint, unitId: position.unitId }));
      if (!alive.current || epoch !== serial.current) return;
      const command = commandSchema.parse({ fingerprint: position.fingerprint, unitId: position.unitId, contextVersion: context.contextVersion, requestKey: crypto.randomUUID(),
        message: snapshot.message.trim(), intent: snapshot.intent, modelId: snapshot.modelId === 'auto' ? models.catalog.defaultModel : snapshot.modelId,
        bookmark: position.bookmark ?? { progress: 0, audioTime: null, mode: 'text', voice: '', speed: 1 } });
      posting.current = false; await execute({ kind: 'create', command });
    } catch (error) { fail(error); }
    finally { posting.current = false; if (alive.current) setBusy(false); }
  }
  async function exportNotes(format: 'json' | 'markdown') {
    if (posting.current || disabled) return;
    capture(); posting.current = true; setBusy(true); setNotice('正在读取完整教学笔记…');
    const epoch = serial.current, token = getAuthToken();
    try {
      const notes = await read<WhiteboardTeachingNotes>('/notes');
      const identity = await read<{ ownerId: string; definitionHash: string }>('/notes/identity');
      if (!alive.current || epoch !== serial.current || getAuthToken() !== token) return;
      if (notes.ownerId !== ownerId || identity.ownerId !== ownerId || notes.boardId !== board.id || notes.boardKind !== kind ||
        notes.original.fingerprint !== board.fingerprint || notes.definitionHash !== identity.definitionHash) throw new Error('原稿或权限已变化，笔记未下载，请重新读取。');
      if (format === 'json') downloadTopicJson(notes, 'whiteboard-teaching-notes.json');
      else {
        const url = URL.createObjectURL(new Blob([whiteboardQuestionNotesMarkdown(notes)], { type: 'text/markdown;charset=utf-8' })), anchor = document.createElement('a');
        anchor.href = url; anchor.download = 'whiteboard-teaching-notes.md'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice('已导出原讲解与全部 ' + notes.turns.length + ' 条已保存提问；未发送输入仍保留在本页。');
    } catch (error) { fail(error); }
    finally { posting.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="wb-questions" aria-label="原句提问">
    <header><h3>一起想清楚</h3><span>AI补充讲解</span></header>
    <details className="wb-question-notes"><summary>带走完整教学笔记</summary><button type="button" disabled={busy || disabled} onClick={() => void exportNotes('markdown')}>下载完整教学笔记 Markdown</button>
      <button type="button" disabled={busy || disabled} onClick={() => void exportNotes('json')}>下载完整教学笔记 JSON</button></details>
    <div className="wb-question-messages" aria-live="polite" aria-busy={busy}>
      {!historyReady ? <p role="status">正在读取原提问…</p> : !turns.length && <p className="wb-question-empty">哪里没听懂，就从那一句问起。</p>}
      {!historyReady && <button type="button" onClick={() => void history().catch(fail)}>重新读取对话</button>}
      {earlierPage > 0 && <button type="button" disabled={busy} onClick={() => {
        setBusy(true); void read<Page>('?page=' + earlierPage + '&pageSize=10').then(page => { if (!alive.current) return;
          setTurns(rows => [...page.turns, ...rows.filter(row => !page.turns.some(item => item.id === row.id))]); setEarlierPage(page.page - 1);
        }).catch(fail).finally(() => { if (alive.current) setBusy(false); });
      }}>查看更早的提问</button>}
      {turns.map(turn => <article key={turn.id} className="wb-question-turn" data-status={turn.status}>
        <p className="wb-question-user">{turn.message}</p><div className="wb-question-meta"><span>{statuses[turn.status]}</span><span>{turn.modelName}</span></div>
        {turn.reply && <><p className="wb-question-answer">{turn.reply.text}</p>{!!turn.reply.anchors.length && <div className="wb-question-anchors">{turn.reply.anchors.map(anchor => <span key={anchor.id}>{anchor.source ? anchor.source.label + ' · 第' + anchor.source.page + '页' : anchor.label}</span>)}</div>}</>}
        {turn.reply && <button type="button" className="wb-question-open" disabled={busy || disabled} onClick={event => {
          const trigger = event.currentTarget;
          capture(); setBusy(true); const epoch = serial.current;
          const versionId = teachingVersions[turn.id] ?? turn.teachingVersions?.find(item => item.current)?.id;
          void read<StudioQuestionWhiteboard>('/' + encodeURIComponent(turn.id) + '/board' + (versionId ? '?teachingVersionId=' + encodeURIComponent(versionId) : '')).then(value => {
            if (!alive.current || epoch !== serial.current) return;
            if (value.originalBoardKind !== kind || value.originalBoardId !== board.id || value.turnId !== turn.id || value.replyFingerprint !== turn.reply?.fingerprint || versionId && value.teachingVersionId !== versionId)
              throw new Error('补充讲解与原回答不一致，请重新读取对话。');
            onOpenTeaching(value, trigger);
          }).catch(fail).finally(() => { if (alive.current) setBusy(false); });
        }}>{turn.reply.board ? '查看补充板书与声音' : '收听原回答'}</button>}
        {turn.reply && (turn.teachingVersions?.length ?? 0) > 1 && <label className="wb-question-version">讲解版本<select aria-label="讲解版本" disabled={busy || disabled}
          value={teachingVersions[turn.id] ?? turn.teachingVersions?.find(item => item.current)?.id ?? 'original'} onChange={event => setTeachingVersions(values => ({ ...values, [turn.id]: event.target.value }))}>
          {turn.teachingVersions?.map((version, index) => <option key={version.id} value={version.id}>{version.id === 'original' ? '原回答 · 无配图' : '图片版本 ' + index + ' · ' + new Date(version.createdAt).toLocaleString()}{version.current ? ' · 当前采用' : ''}</option>)}
        </select></label>}
        {turn.reply?.fingerprint && <button type="button" className="wb-question-open" disabled={busy || disabled} onClick={event => {
          if (figureTurn === turn.id) return;
          if (!figureCanLeave.current) { setNotice('请先下载当前完整配图副本，再切换回答。'); return; }
          capture(); figureTrigger.current = event.currentTarget; figureCanLeave.current = false; callbacks.current.onCanLeaveChange(false); setFigureTurn(turn.id);
        }}>为这段讲解配图</button>}
        {figureTurn === turn.id && turn.reply?.fingerprint && <WhiteboardQuestionFigures key={turn.id + ':' + turn.reply.fingerprint} ownerId={ownerId} boardKind={kind} boardId={board.id}
          boardFingerprint={board.fingerprint} turnId={turn.id} replyFingerprint={turn.reply.fingerprint} onCanLeaveChange={figureLeaveChange} onUnavailable={onUnavailable}
          onClose={() => { setFigureTurn(null); figureCanLeave.current = true; callbacks.current.onCanLeaveChange(!questionUnsafe.current); requestAnimationFrame(() => figureTrigger.current?.focus()); }}
          onAdopted={(value, trigger) => { update({ ...turn, teachingVersions: value.versions }); setTeachingVersions(values => ({ ...values, [turn.id]: value.versionId })); onOpenTeaching(value.board, trigger); }}/>}
        <button type="button" className="wb-question-return" disabled={disabled} onClick={() => onReturn(turn.position)}>回到这句<span>{turn.position.sentenceText}</span></button>
        {active.has(turn.status) && <button type="button" disabled={busy || disabled || Boolean(pending) || !turn.task} onClick={() => { if (turn.task) void execute({ kind: 'cancel', turnId: turn.id, command: { requestKey: crypto.randomUUID(), generation: turn.task.generation, version: turn.task.version } }); }}>取消回答</button>}
        {['failed','cancelled'].includes(turn.status) && <button type="button" disabled={busy || disabled || Boolean(pending) || Boolean(activeTurn) || !turn.task} onClick={() => { if (turn.task) void execute({ kind: 'retry', turnId: turn.id, command: { requestKey: crypto.randomUUID(), generation: turn.task.generation, version: turn.task.version } }); }}>用原模型重试</button>}
      </article>)}
    </div>
    <form className="wb-question-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label className="sr-only" htmlFor={'wb-question-' + board.id}>向老师提问</label><textarea id={'wb-question-' + board.id} placeholder="对这句有疑问？" value={form.message} maxLength={3000}
        disabled={!ready || busy || disabled} onChange={event => setForm(value => ({ ...value, message: event.target.value }))}/>
      <div className="wb-question-options"><select aria-label="讲解方式" value={form.intent} disabled={!ready || busy || disabled} onChange={event => setForm(value => ({ ...value, intent: event.target.value as Form['intent'] }))}>
        {WHITEBOARD_QUESTION_INTENTS.map(intent => <option key={intent} value={intent}>{intents[intent]}</option>)}</select>
        <XiaojiuModelPicker compact error={models.error} onRetry={models.reload} catalog={models.catalog} value={form.modelId} disabled={!ready || busy || disabled} onChange={modelId => { models.setModelId(modelId); setForm(value => ({ ...value, modelId })); }}/>
        <button type="submit" disabled={!ready || !historyReady || busy || disabled || Boolean(activeTurn) || Boolean(pending) || !form.message.trim()}>发送</button></div>
      {pending && <div className="wb-question-pending"><p>原{pending.kind === 'create' ? '提问' : pending.kind === 'cancel' ? '取消' : '重试'}请求待确认。</p><button type="button" disabled={busy || disabled} onClick={() => void execute(pending)}>按原请求继续</button></div>}
      {(notice || models.error) && <p role="status">{notice || models.error}</p>}
      {storageError && <p role="status">本机副本暂未保存。请下载完整输入与原请求后再离开。</p>}
      <details className="wb-question-recovery" open={storageError}><summary>保留与恢复提问</summary><div className="wb-question-recovery-actions">
      <button type="button" className="wb-question-copy" onClick={() => { downloadTopicJson(current.current, 'whiteboard-question-copy.json'); setDownloaded(JSON.stringify(current.current)); }}>下载完整提问副本</button>
      <button type="button" className="wb-question-copy" disabled={busy || Boolean(pending)} onClick={() => {
        try { setCopies(topicCopies(storage, decode, 64000)); setNotice('仅列出当前账号与这份原稿的本机输入。'); } catch { setNotice('当前无法读取本机副本，可导入已下载的完整JSON。'); }
      }}>查看其他本机输入</button>
      {!!copies.length && <div className="wb-question-copies">{copies.map(item => <button type="button" key={item.key} disabled={busy || Boolean(pending)}
        onClick={() => adopt(item.value)}>{new Date(item.at).toLocaleString()} · {item.value.form.message.slice(0,36) || '原请求副本'}</button>)}</div>}
      <label className="wb-question-copy wb-question-import">导入完整提问副本<input aria-label="导入完整提问副本" type="file" accept="application/json,.json" disabled={busy || Boolean(pending)} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        const epoch = serial.current;
        if (file.size > 64000) { setNotice('提问副本超过读取上限，请保留原文件。'); return; }
        void file.text().then(raw => { if (!alive.current || epoch !== serial.current) return; const value = decode(raw);
          if (!value) { setNotice('副本与当前账号、原白板版本或格式不符，未替换输入。'); return; } adopt(value);
        }).catch(error => { if (alive.current) setNotice(error instanceof Error ? error.message : '无法读取提问副本。'); });
      }}/></label></div></details>
    </form>
  </section>;
}
