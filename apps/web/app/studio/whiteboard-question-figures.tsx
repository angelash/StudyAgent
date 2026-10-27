'use client';
import * as React from 'react';
import { z } from 'zod';
import { questionVisualTargetSchema, questionVisualIdSchema, questionVisualGenerateSchema, questionVisualEditSchema, questionVisualControlSchema, questionVisualAdoptSchema,
  type QuestionVisualTarget, type QuestionVisualView, type QuestionTeachingVersionView, type StudioQuestionWhiteboard, type TopicVisualCapabilities } from '@study-agent/contracts';
import { ApiRequestError, apiRequest, getAuthToken } from '../../lib/api';
import { TopicFigureImage, TopicFigureThumbnail, topicFigureBlob } from './topic-figure-image';
import { topicStorage, topicCopies } from './whiteboards/local-copies';
import { downloadTopicJson } from './whiteboards/download';
import { questionFigureCommandMatches } from './whiteboards/command-digest';
import './whiteboard-question-figures.css';

const base = '/learning/studio/whiteboard-question-visuals';
const formSchema = z.object({ purpose: z.enum(['scene', 'concept', 'comparison']), requirements: z.string().max(1200),
  parentVisualId: z.union([questionVisualIdSchema, z.literal('')]), changes: z.string().max(1200), alt: z.string().max(600), caption: z.string().max(600) }).strict();
type Form = z.infer<typeof formSchema>;
type Pending = { action: 'generate' | 'edit' | 'cancel' | 'retry' | 'adopt'; visualId: string | null; body: unknown };
type Copy = { form: Form; pending: Pending | null; rejected: Pending | null; currentId: string | null };
type Source = { target: QuestionVisualTarget; teachingFingerprint: string; versions: QuestionTeachingVersionView[] };
type Preflight = { available: boolean; capabilities: TopicVisualCapabilities; fingerprint: string; prompt: string; context: unknown; contextCharacters: number; maxContextCharacters: number };
type Page = { items: QuestionVisualView[]; total: number; page: number; limit: number };
type Adopted = { versionId: string; board: StudioQuestionWhiteboard; versions: QuestionTeachingVersionView[] };
const names: Record<QuestionVisualView['status'], string> = { queued: '等待生成', generating: '正在生成', cancelling: '正在取消', ready: '图片已就绪', failed: '生成未完成', cancelled: '已取消', deleted: '已删除' };
const pendingStates = new Set(['queued', 'generating', 'cancelling']);
function path(command: Pending) { return command.action === 'generate' ? base : command.action === 'adopt' ? base + '/adopt' : base + '/' + command.visualId + '/' + command.action; }
function sameTarget(a: unknown, b: QuestionVisualTarget) { const parsed = questionVisualTargetSchema.safeParse(a); return parsed.success && Object.keys(b).every(key => parsed.data[key as keyof QuestionVisualTarget] === b[key as keyof QuestionVisualTarget]); }
function image(view: QuestionVisualView) { return { imageUrl: view.imageUrl!, sha256: view.sha256!, width: view.width!, height: view.height!, alt: '待核对的回答配图', caption: view.requirements }; }

export function WhiteboardQuestionFigures({ ownerId, boardKind, boardId, boardFingerprint, turnId, replyFingerprint, onCanLeaveChange, onUnavailable, onClose, onAdopted }:
  { ownerId: string; boardKind: 'guidance' | 'topic'; boardId: string; boardFingerprint: string; turnId: string; replyFingerprint: string;
    onCanLeaveChange: (value: boolean) => void; onUnavailable: () => void; onClose: () => void;
    onAdopted: (value: Adopted, trigger: HTMLElement) => void }) {
  const [copy, setCopy] = React.useState<Copy>({ form: { purpose: 'concept', requirements: '', parentVisualId: '', changes: '', alt: '', caption: '' }, pending: null, rejected: null, currentId: null });
  const currentCopy = React.useRef(copy); currentCopy.current = copy;
  const [ready, setReady] = React.useState(false), [stored, setStored] = React.useState(''), [downloaded, setDownloaded] = React.useState('');
  const [source, setSource] = React.useState<Source | null>(null), [preflight, setPreflight] = React.useState<Preflight | null>(null);
  const [current, setCurrent] = React.useState<QuestionVisualView | null>(null), [list, setList] = React.useState<Page | null>(null), [page, setPage] = React.useState(1);
  const [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState(''), [reviewed, setReviewed] = React.useState(false), [imageReady, setImageReady] = React.useState(false);
  const [copies, setCopies] = React.useState<Array<{ key: string; at: number; value: Copy }>>([]);
  const alive = React.useRef(false), requests = React.useRef(new Set<AbortController>()), working = React.useRef(false), epoch = React.useRef(0), token = React.useRef(getAuthToken());
  const callbacks = React.useRef({ onCanLeaveChange, onUnavailable, onClose, onAdopted }); callbacks.current = { onCanLeaveChange, onUnavailable, onClose, onAdopted };
  const scope = { ownerId, boardKind, boardId, boardFingerprint, turnId, replyFingerprint };
  const storage = React.useMemo(() => topicStorage('studyagent.question-figures.v1.' + ownerId + '.' + boardKind + '.' + boardId + '.' + boardFingerprint + '.' + turnId + '.' + replyFingerprint),
    [ownerId, boardKind, boardId, boardFingerprint, turnId, replyFingerprint]);
  const serialized = JSON.stringify(copy), hasInput = Boolean(copy.form.requirements || copy.form.changes || copy.form.alt || copy.form.caption || copy.pending || copy.rejected);
  const unsafe = !ready || hasInput && serialized !== stored && serialized !== downloaded, locked = !ready || busy || Boolean(copy.pending);
  const safeToLeave = React.useRef(false); safeToLeave.current = !unsafe;
  const query = 'boardKind=' + boardKind + '&boardId=' + encodeURIComponent(boardId) + '&turnId=' + encodeURIComponent(turnId);
  function decode(raw: string): Copy | null {
    if (raw.length > 80000) return null; const value = JSON.parse(raw), form = formSchema.safeParse(value.form);
    if (value.format !== 'studyagent-question-figure-copy-v1' || !form.success || Object.keys(scope).some(key => value[key] !== scope[key as keyof typeof scope])) return null;
    function command(input: any): Pending | null {
      if (!input || !['generate', 'edit', 'cancel', 'retry', 'adopt'].includes(input.action)) return null;
      const schema = input.action === 'generate' ? questionVisualGenerateSchema : input.action === 'edit' ? questionVisualEditSchema : input.action === 'adopt' ? questionVisualAdoptSchema : questionVisualControlSchema;
      const result = schema.safeParse(input.body); if (!result.success) return null;
      if ('target' in result.data && (result.data.target.boardKind !== boardKind || result.data.target.boardId !== boardId || result.data.target.turnId !== turnId || result.data.target.replyFingerprint !== replyFingerprint)) return null;
      if (input.action !== 'generate' && !questionVisualIdSchema.safeParse(input.visualId).success) return null;
      if (input.action === 'edit' && 'parentVisualId' in result.data && result.data.parentVisualId !== input.visualId || input.action === 'adopt' && 'visualId' in result.data && result.data.visualId !== input.visualId) return null;
      return { action: input.action, visualId: input.action === 'generate' ? null : input.visualId, body: result.data };
    }
    const pending = value.pending ? command(value.pending) : null, rejected = value.rejected ? command(value.rejected) : null;
    if (value.pending && !pending || value.rejected && !rejected) return null;
    return { form: form.data, pending, rejected, currentId: questionVisualIdSchema.safeParse(value.currentId).success ? value.currentId : null };
  }
  function persist(value: Copy) {
    try { localStorage.setItem(storage.key, JSON.stringify({ format: 'studyagent-question-figure-copy-v1', ...scope, ...value, at: Date.now() })); setStored(JSON.stringify(value)); }
    catch { /* Keep all input mounted and require its complete download before leaving. */ }
  }
  function update(change: Partial<Copy>) {
    callbacks.current.onCanLeaveChange(false); const value = { ...currentCopy.current, ...change }; currentCopy.current = value; setCopy(value); persist(value);
  }
  function form(change: Partial<Form>) { update({ form: { ...currentCopy.current.form, ...change } }); setPreflight(null); }
  async function read<T>(url: string, options: RequestInit = {}) {
    if (!alive.current || getAuthToken() !== token.current) throw new Error('当前登录已变化，请重新打开原回答。');
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const result = await apiRequest<T>(url, { ...options, signal: controller.signal });
      if (!alive.current || controller.signal.aborted || getAuthToken() !== token.current) throw new DOMException('Cancelled', 'AbortError'); return result;
    } finally { requests.current.delete(controller); }
  }
  function fail(error: unknown) {
    if (!alive.current || error instanceof DOMException && error.name === 'AbortError') return;
    if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) { setSource(null); setCurrent(null); setList(null); callbacks.current.onUnavailable(); return; }
    setNotice(error instanceof Error ? error.message : '暂时无法读取配图，请保留完整要求。');
  }
  function verifySource(value: Source) {
    if (value.target.boardKind !== boardKind || value.target.boardId !== boardId || value.target.turnId !== turnId || value.target.replyFingerprint !== replyFingerprint) throw Error('配图目标与原回答不一致。'); return value;
  }
  async function refreshSource() { const value = verifySource(await read<Source>(base + '/source?' + query)); setSource(value); return value; }
  async function refresh() {
    const serial = ++epoch.current, value = await read<Page>(base + '?' + query + '&page=' + page + '&limit=6');
    if (serial !== epoch.current) return; setList(value);
    setCurrent(previous => value.items.find(item => item.id === previous?.id) ?? previous);
  }
  function choose(value: QuestionVisualView) {
    if (value.target.boardKind !== boardKind || value.target.boardId !== boardId || value.target.turnId !== turnId || value.target.replyFingerprint !== replyFingerprint) throw Error('候选图片不属于这条原回答。');
    update({ currentId: value.id }); setCurrent(value); setReviewed(false); setImageReady(false);
  }
  React.useEffect(() => {
    alive.current = true;
    try { for (const key of storage.restoreKeys) { const raw = localStorage.getItem(key); if (!raw) continue; const value = decode(raw); if (!value) continue;
      currentCopy.current = value; setCopy(value); persist(value); setNotice('已找回本页的完整配图要求和原请求。'); break; } } catch { setNotice('本机存储暂不可用。完整要求可下载后继续保留。'); }
    setReady(true); void refreshSource().catch(fail);
    const warn = (event: BeforeUnloadEvent) => { if (!safeToLeave.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { alive.current = false; epoch.current++; for (const controller of requests.current) controller.abort(); requests.current.clear(); window.removeEventListener('beforeunload', warn); };
  }, [storage.key]);
  React.useEffect(() => { callbacks.current.onCanLeaveChange(!unsafe); }, [unsafe]);
  React.useEffect(() => {
    if (!ready) return; void refresh().catch(fail); const timer = setInterval(() => { if (!working.current) void refresh().catch(fail); }, 2500);
    return () => { epoch.current++; clearInterval(timer); };
  }, [ready, page]);
  React.useEffect(() => {
    if (!ready || !copy.currentId) return; let valid = true;
    void read<QuestionVisualView>(base + '/' + copy.currentId).then(value => {
      if (!valid) return;
      if (value.target.boardKind !== boardKind || value.target.boardId !== boardId || value.target.turnId !== turnId || value.target.replyFingerprint !== replyFingerprint) throw Error('恢复的候选不属于这条回答，完整输入仍保留。');
      setCurrent(value);
    }).catch(fail);
    return () => { valid = false; };
  }, [ready, copy.currentId]);
  React.useEffect(() => {
    if (!current || !pendingStates.has(current.status)) return; let valid = true;
    const timer = setInterval(() => void read<QuestionVisualView>(base + '/' + current.id).then(value => { if (valid) setCurrent(previous => previous?.id === value.id ? value : previous); }).catch(fail), 2000);
    return () => { valid = false; clearInterval(timer); };
  }, [current?.id, current?.status]);
  function selection() {
    if (!source) throw Error('请先重新读取原回答范围。'); const value = currentCopy.current.form;
    return { target: source.target, purpose: value.purpose, requirements: value.requirements,
      ...(value.parentVisualId ? { operation: 'edit' as const, parentVisualId: value.parentVisualId, changes: value.changes } : { operation: 'generate' as const }) };
  }
  async function preview() {
    if (locked || working.current) return; working.current = true; setBusy(true); setNotice('');
    try { setPreflight(await read<Preflight>(base + '/preflight', { method: 'POST', body: JSON.stringify(selection()) })); }
    catch (error) { fail(error); } finally { working.current = false; if (alive.current) setBusy(false); }
  }
  async function send(command: Pending, trigger?: HTMLElement) {
    if (!ready || working.current) return; working.current = true; setBusy(true); setNotice(''); update({ pending: command });
    try {
      const body = command.body as { requestKey: string; target?: QuestionVisualTarget }, creating = ['generate', 'edit'].includes(command.action);
      if (command.action === 'adopt') {
        const result = await read<Adopted>(base + '/adopt', { method: 'POST', body: JSON.stringify(command.body) });
        const expected = questionVisualAdoptSchema.parse(command.body), version = result.versions.find(item => item.id === result.versionId);
        if (result.board.originalBoardKind !== boardKind || result.board.originalBoardId !== boardId || result.board.turnId !== turnId || result.board.replyFingerprint !== replyFingerprint ||
          result.board.teachingVersionId !== result.versionId || version?.figure?.visualId !== expected.visualId || version.figure.originalSha256 !== expected.originalSha256 || version.figure.imageSha256 !== expected.imageSha256 ||
          version.figure.alt !== expected.alt || version.figure.caption !== expected.caption) throw Error('采用回执与完整原请求不一致，请保留原键。');
        update({ pending: null, rejected: null }); setSource(previous => previous ? { ...previous, versions: result.versions } : previous);
        setNotice('已保存独立图片版本，原回答和旧版本都保留。'); if (trigger) callbacks.current.onAdopted(result, trigger); return;
      }
      let result: QuestionVisualView | null = null;
      const receiptPath = creating ? base + '/requests/' + encodeURIComponent(body.requestKey) : base + '/' + command.visualId + '/requests/' + encodeURIComponent(body.requestKey);
      try { result = await read<QuestionVisualView>(receiptPath); } catch (error) { if (!(error instanceof ApiRequestError) || error.status !== 404) throw error; }
      if (!result && !creating) {
        const original = await read<QuestionVisualView>(base + '/' + command.visualId);
        if (!source || !sameTarget(original.target, source.target)) throw Error('原控制请求不属于这条回答，完整请求仍保留。');
      }
      result ??= await read<QuestionVisualView>(path(command), { method: 'POST', body: JSON.stringify(command.body) });
      if (!source || !sameTarget(result.target, source.target) || result.receipt?.key !== body.requestKey || result.receipt.kind !== (creating ? 'prepare' : command.action) ||
        !await questionFigureCommandMatches(command.action, command.body, result.receipt.commandFingerprint)) throw Error('图片回执与原命令不一致，完整请求仍保留。');
      choose(result); update({ pending: null, rejected: null }); setNotice('原操作已确认。图片就绪后请核对标签、条件和关系。'); void refresh().catch(fail);
    } catch (error) {
      if (alive.current && error instanceof ApiRequestError && [400, 409].includes(error.status)) { update({ pending: null, rejected: command }); setPreflight(null); setSource(null); setReviewed(false); }
      fail(error);
    } finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function generate() {
    if (locked || !preflight?.available) return;
    try {
      const value = selection(), command = { ...value, preflightFingerprint: preflight.fingerprint, requestKey: crypto.randomUUID() };
      const body = value.operation === 'edit' ? questionVisualEditSchema.parse(command) : questionVisualGenerateSchema.parse(command);
      void send({ action: value.operation, visualId: value.operation === 'edit' ? value.parentVisualId : null, body });
    } catch { setNotice('请填写至少3个字的完整要求；修图还需要具体修改说明。'); }
  }
  function control(action: 'cancel' | 'retry') {
    if (!current?.task || locked) return;
    void send({ action, visualId: current.id, body: { expectedRevision: current.revision, taskVersion: current.task.version, generation: current.task.generation, requestKey: crypto.randomUUID() } });
  }
  async function original() {
    if (!current?.originalSha256 || !current.width || !current.height || locked) return;
    working.current = true; setBusy(true); const controller = new AbortController(); requests.current.add(controller);
    try {
      const blob = await topicFigureBlob({ ...image(current), imageUrl: base + '/' + current.id + '/original', sha256: current.originalSha256 }, controller.signal);
      await refreshSource(); if (!alive.current || controller.signal.aborted || getAuthToken() !== token.current) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = current.id + '-original.png'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('已下载字节校验通过的实际原PNG。');
    } catch (error) { fail(error); } finally { requests.current.delete(controller); working.current = false; if (alive.current) setBusy(false); }
  }
  function download() { downloadTopicJson({ format: 'studyagent-question-figure-copy-v1', ...scope, ...currentCopy.current }, 'whiteboard-question-figure-copy.json'); setDownloaded(JSON.stringify(currentCopy.current)); }
  function restore(value: Copy) {
    if (locked || currentCopy.current.pending) return;
    if (hasInput && serialized !== downloaded) { setNotice('请先下载当前完整配图副本，再恢复另一份输入。'); return; }
    update(value); setCurrent(null); setPreflight(null); setNotice('已恢复完整输入；待确认操作保留原键。');
  }
  return <section className="wb-question-figures" aria-label="回答配图工作区">
    <header><div><span className="wb-question-figure-eyebrow">这段讲解的配图</span><h4>把关系画清楚</h4></div><button type="button" aria-label="关闭回答配图" onClick={() => {
      if (!safeToLeave.current) { setNotice('完整要求尚未保存在本机，请先下载完整配图副本。'); return; } callbacks.current.onClose();
    }}>×</button></header>
    <p className="wb-question-figure-hint">生成后先核对，再选用。原回答与之前的图片版本会一直保留。</p>
    {!source && <button type="button" disabled={busy} onClick={() => void refreshSource().catch(fail)}>重新读取原回答范围</button>}
    {source && <p className="wb-question-figure-hint">{source.versions.find(item => item.current)?.figure ? '当前采用图片：' + (source.versions.find(item => item.current)!.figure!.caption || source.versions.find(item => item.current)!.figure!.alt) : '当前是无配图的原回答。'}</p>}
    <label>图片用途<select value={copy.form.purpose} disabled={locked} onChange={event => form({ purpose: event.target.value as Form['purpose'] })}><option value="concept">说明概念关系</option><option value="comparison">对比条件与差异</option><option value="scene">展示具体情境</option></select></label>
    <label>完整配图要求<textarea aria-label="完整配图要求" maxLength={1200} value={copy.form.requirements} disabled={locked} placeholder="想看清哪些概念、标签、条件和关系？" onChange={event => form({ requirements: event.target.value })}/></label>
    {copy.form.parentVisualId && <div className="wb-question-figure-edit"><p>正在修改所选实际原PNG。</p><label>具体修改说明<textarea aria-label="具体修改说明" value={copy.form.changes} maxLength={1200} disabled={locked} onChange={event => form({ changes: event.target.value })}/></label>
      <button type="button" disabled={locked} onClick={() => form({ parentVisualId: '' })}>回到新图生成</button></div>}
    <div className="wb-question-figure-actions"><button type="button" disabled={locked || !source} onClick={() => void preview()}>预检完整配图提示</button>
      <button type="button" disabled={locked || !preflight?.available} onClick={generate}>{copy.form.parentVisualId ? '用原PNG生成修改图' : '生成这段讲解的配图'}</button></div>
    {preflight && <div className="wb-question-figure-preflight"><p>{preflight.capabilities.message} · {preflight.capabilities.modelId}</p><details><summary>查看完整模型提示与教学上下文</summary><pre>{preflight.prompt}</pre><pre>{JSON.stringify(preflight.context, null, 2)}</pre></details></div>}
    {copy.pending && <div className="wb-question-figure-pending"><p>原{copy.pending.action === 'adopt' ? '采用' : '配图'}请求待确认，完整输入与原键已保留。</p><button type="button" disabled={busy || !source} onClick={event => void send(copy.pending!, event.currentTarget)}>按原请求继续</button></div>}
    {copy.rejected && <details><summary>查看被拒绝的完整原请求</summary><pre>{JSON.stringify(copy.rejected, null, 2)}</pre></details>}
    {list && <><div className="wb-question-figure-list" aria-label="这段讲解的图片候选">{list.items.map(item => <button type="button" key={item.id} disabled={locked} aria-pressed={current?.id === item.id} onClick={() => choose(item)}>
      {item.status === 'ready' && item.imageUrl && <TopicFigureThumbnail source={image(item)}/>}<span>{names[item.status]}{item.selected ? ' · 当前采用' : ''}</span><small>{item.requirements}</small></button>)}</div>
      {list.total > list.limit && <nav aria-label="配图候选分页"><button type="button" disabled={locked || page <= 1} onClick={() => setPage(value => value - 1)}>上一组图片</button><span>{page} / {Math.ceil(list.total / list.limit)}</span><button type="button" disabled={locked || page * list.limit >= list.total} onClick={() => setPage(value => value + 1)}>下一组图片</button></nav>}</>}
    {current && <section className="wb-question-figure-current" aria-label="所选回答图片"><p>{names[current.status]} · {current.modelId}</p><p>{current.requirements}</p>
      {pendingStates.has(current.status) && <button type="button" disabled={locked || current.status === 'cancelling'} onClick={() => control('cancel')}>取消图片生成</button>}
      {['failed', 'cancelled'].includes(current.status) && <button type="button" disabled={locked} onClick={() => control('retry')}>按原要求重试图片</button>}
      {current.status === 'ready' && current.imageUrl && <><TopicFigureImage source={image(current)} title="回答配图" onReady={setImageReady}/>
        <div className="wb-question-figure-actions"><button type="button" disabled={locked || !imageReady} onClick={() => void original()}>下载实际原PNG</button><button type="button" disabled={locked || !imageReady} onClick={() => form({ parentVisualId: current.id })}>以这张原图继续修改</button></div>
        <label>图片说明<textarea aria-label="图片说明" value={copy.form.alt} maxLength={600} disabled={locked} onChange={event => form({ alt: event.target.value })}/></label>
        <label>展示图注<input aria-label="展示图注" value={copy.form.caption} maxLength={600} disabled={locked} onChange={event => form({ caption: event.target.value })}/></label>
        <label className="wb-question-figure-review"><input type="checkbox" checked={reviewed} disabled={locked || !imageReady} onChange={event => setReviewed(event.target.checked)}/>我已核对图中文字、条件和关系</label>
        <button type="button" className="wb-question-figure-adopt" disabled={locked || !reviewed || !imageReady || !source || copy.form.alt.trim().length < 3} onClick={event => {
          if (!source || !current.originalSha256 || !current.sha256) return;
          const body = questionVisualAdoptSchema.parse({ target: source.target, visualId: current.id, expectedTeachingVersionId: source.versions.find(item => item.current)?.id ?? 'original',
            expectedVisualRevision: current.revision, originalSha256: current.originalSha256, imageSha256: current.sha256, alt: copy.form.alt, caption: copy.form.caption, acknowledgeImageReviewed: true, requestKey: crypto.randomUUID() });
          void send({ action: 'adopt', visualId: current.id, body }, event.currentTarget);
        }}>采用并打开这个讲解版本</button></>}
    </section>}
    {notice && <p role="status">{notice}</p>}
    <details className="wb-question-figure-recovery" open={unsafe}><summary>保留与恢复完整配图要求</summary>
      {unsafe && <p>本机副本尚未保存，请下载完整要求与原请求后再离开。</p>}
      <button type="button" onClick={download}>下载完整配图副本</button><button type="button" disabled={locked} onClick={() => { try { setCopies(topicCopies(storage, decode, 80000)); } catch { setNotice('本机副本不可读，可导入完整JSON。'); } }}>查看其他配图输入</button>
      {copies.map(item => <button type="button" key={item.key} disabled={locked} onClick={() => restore(item.value)}>{new Date(item.at).toLocaleString()} · {item.value.form.requirements.slice(0, 30) || '原请求'}</button>)}
      <label className="wb-question-figure-import">导入完整配图副本<input type="file" aria-label="导入完整配图副本" accept="application/json,.json" disabled={locked} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (file.size > 80000) { setNotice('副本超过读取上限，原输入仍保留。'); return; }
        void file.text().then(raw => { if (!alive.current) return; const value = decode(raw); if (!value) throw Error('副本与当前账号、原回答或格式不符。'); restore(value); }).catch(fail);
      }}/></label>
    </details>
  </section>;
}
