'use client';
import * as React from 'react';
import { z } from 'zod';
import { topicVisualIdSchema, topicVisualPreflightSchema, topicVisualGenerateSchema, topicVisualEditSchema, topicVisualControlSchema,
  type TopicWhiteboardContent, type TopicWhiteboardDraftView, type TopicWhiteboardFigure, type TopicVisualCapabilities, type TopicVisualView } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../../../lib/api';
import { TopicFigureImage, TopicFigureThumbnail } from '../topic-figure-image';
import { topicCopies, topicStorage } from './local-copies';
import { topicFigureCommandMatches } from './command-digest';
import { downloadTopicJson } from './download';
import { WhiteboardExhibit } from '../whiteboard-exhibit';

const base = '/learning/studio/topic-whiteboard-visuals';
const formSchema = z.object({ sceneIndex: z.number().int().min(0).max(7), purpose: z.enum(['scene', 'concept', 'comparison']), requirements: z.string().max(1200),
  parentVisualId: z.union([topicVisualIdSchema, z.literal('')]), changes: z.string().max(1200) }).strict();
type Form = z.infer<typeof formSchema>;
type Pending = { action: 'generate' | 'edit' | 'cancel' | 'retry'; visualId: string | null; body: unknown; path?: string };
type Copy = { form: Form; pending: Pending | null; rejected: Pending | null; currentId: string | null; alt: string; caption: string };
type Preflight = { available: boolean; fingerprint: string; prompt: string; contextCharacters: number; maxContextCharacters: number; capabilities: TopicVisualCapabilities;
  context: { topic: string; objective: string; audience: 'adult' | 'student'; grade: number | null; scene: TopicWhiteboardContent['scenes'][number]; targets: Array<{ name: string; objective: string }> } };
type Page = { items: TopicVisualView[]; page: number; limit: number; total: number };
const statusNames = { queued: '等待生成', generating: '正在生成参考图', cancelling: '正在停止本地生成', ready: '参考图已就绪', failed: '生成未完成', cancelled: '生成已取消', deleted: '已删除' };
function commandPath(command: Pending) { return command.action === 'generate' ? base : command.action === 'edit' ? base + '/' + (command.body as {parentVisualId:string}).parentVisualId + '/edits' : base + '/' + command.visualId + '/' + command.action; }
function imageSource(view: TopicVisualView) { return { imageUrl: view.imageUrl!, sha256: view.sha256!, width: view.width!, height: view.height!, alt: '待核对的教学参考图', caption: view.requirements }; }

export function TopicFigureWorkbench({ row, ownerId, manuscriptDirty, figures, onFigure, onCanLeaveChange, onPendingChange }:
  { row: TopicWhiteboardDraftView; ownerId: string; manuscriptDirty: boolean; figures: Array<TopicWhiteboardFigure | undefined>;
    onFigure: (index: number, figure: TopicWhiteboardFigure | undefined) => void; onCanLeaveChange: (value: boolean) => void; onPendingChange: (value: boolean) => void }) {
  const [form, setForm] = React.useState<Form>({ sceneIndex: 0, purpose: 'concept', requirements: '', parentVisualId: '', changes: '' });
  const [pending, setPending] = React.useState<Pending | null>(null), [rejected, setRejected] = React.useState<Pending | null>(null), [current, setCurrent] = React.useState<TopicVisualView | null>(null);
  const [ready, setReady] = React.useState(false), [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState('');
  const [preflight, setPreflight] = React.useState<Preflight | null>(null), [capabilities, setCapabilities] = React.useState<TopicVisualCapabilities | null>(null);
  const [comparison, setComparison] = React.useState<TopicVisualView | null>(null);
  const [page, setPage] = React.useState(1), [list, setList] = React.useState<Page | null>(null), [search, setSearch] = React.useState(''), [query, setQuery] = React.useState('');
  const [copies, setCopies] = React.useState<Array<{ key: string; at: number; value: Copy }>>([]);
  const [reviewed, setReviewed] = React.useState(false), [imageReady, setImageReady] = React.useState(false), [alt, setAlt] = React.useState(''), [caption, setCaption] = React.useState('AI参考图，标签和关系待核对。');
  const [stored, setStored] = React.useState(''), [downloaded, setDownloaded] = React.useState('');
  const operation = React.useRef<AbortController | null>(null), listEpoch = React.useRef(0), refreshing = React.useRef(false);
  const lookup = React.useRef<AbortController | null>(null);
  const storage = React.useMemo(() => topicStorage('studyagent.topic-whiteboard.figures.v1.' + ownerId + '.' + row.id), [ownerId, row.id]);
  const copy: Copy = { form, pending: pending ? { ...pending, path: commandPath(pending) } : null,
    rejected: rejected ? { ...rejected, path: commandPath(rejected) } : null, currentId: current?.id ?? null, alt, caption }, signature = JSON.stringify(copy);
  const unsafe = ready && signature !== stored && signature !== downloaded && Boolean(form.requirements || form.changes || pending || rejected || alt);
  const locked = !ready || busy || Boolean(pending), canGenerate = !manuscriptDirty && row.status === 'ready';
  const selected = figures[form.sceneIndex];
  function decode(raw: string): Copy | null {
    const value = JSON.parse(raw); if (value.ownerId !== ownerId || value.draftId !== row.id) return null;
    const parsed = formSchema.safeParse(value.form); if (!parsed.success) return null;
    function command(value: any): Pending | null {
      if (!value || !['generate', 'edit', 'cancel', 'retry'].includes(value.action)) return null;
      const schema = value.action === 'generate' ? topicVisualGenerateSchema : value.action === 'edit' ? topicVisualEditSchema : topicVisualControlSchema;
      const body = schema.safeParse(value.body); if (!body.success || 'draftId' in body.data && body.data.draftId !== row.id ||
        !['generate', 'edit'].includes(value.action) && !topicVisualIdSchema.safeParse(value.visualId).success) return null;
      const command: Pending = { action: value.action, visualId: ['generate', 'edit'].includes(value.action) ? null : value.visualId, body: body.data };
      if (value.path !== undefined && value.path !== commandPath(command)) return null; return command;
    }
    const pending = value.pending ? command(value.pending) : null, rejected = value.rejected ? command(value.rejected) : null;
    if (value.pending && !pending || value.rejected && !rejected) return null;
    if (typeof value.alt !== 'string' || value.alt.length > 600 || typeof value.caption !== 'string' || value.caption.length > 600) return null;
    return { form: parsed.data, pending, rejected, currentId: topicVisualIdSchema.safeParse(value.currentId).success ? value.currentId : null, alt: value.alt, caption: value.caption };
  }
  function adopt(saved: Copy) {
    lookup.current?.abort(); const request = new AbortController(); lookup.current = request;
    setForm(saved.form); setPending(saved.pending); setRejected(saved.rejected); setPreflight(null); setCurrent(null);
    setAlt(saved.alt); setCaption(saved.caption);
    if (saved.currentId) void apiRequest<TopicVisualView>(base + '/' + saved.currentId, { signal: request.signal }).then(value => {
      if (request.signal.aborted) return; if (value.draftId !== row.id) throw Error('本机图片不属于这份原稿，完整请求仍保留。'); setCurrent(value);
    }).catch(error => { if (!request.signal.aborted) setNotice((error as Error).message); });
  }
  React.useEffect(() => {
    try { for (const key of storage.restoreKeys) { const raw = localStorage.getItem(key); if (!raw || raw.length > 60000) continue; const saved = decode(raw);
      if (saved) { adopt(saved); setNotice('已恢复本页的完整配图需求和原请求。'); break; } } }
    catch { setNotice('本机存储暂不可用，请下载完整配图请求后再离开。'); }
    setReady(true); return () => { operation.current?.abort(); lookup.current?.abort(); };
  }, [storage.key]);
  React.useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storage.key, JSON.stringify({ ...copy, ownerId, draftId: row.id, at: Date.now() })); setStored(signature); } catch {}
  }, [ready, signature, storage.key, ownerId, row.id]);
  React.useEffect(() => { onCanLeaveChange(ready && !unsafe); onPendingChange(!ready || Boolean(pending)); }, [ready, unsafe, signature, pending, onCanLeaveChange, onPendingChange]);
  React.useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (unsafe) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [unsafe]);
  React.useEffect(() => { setPreflight(null); }, [row.revision, row.contentFingerprint]);
  React.useEffect(() => { setReviewed(false); setImageReady(false); }, [current?.id]);
  React.useEffect(() => { const request = new AbortController(); void apiRequest<TopicVisualCapabilities>(base + '/capabilities', { signal: request.signal }).then(setCapabilities)
    .catch(error => { if (!request.signal.aborted) setNotice((error as Error).message); }); return () => request.abort(); }, [row.id]);
  const refresh = React.useCallback(async (signal?: AbortSignal) => {
    if (refreshing.current) return; refreshing.current = true; const epoch = ++listEpoch.current;
    try {
      const result = await apiRequest<Page>(base + '?draftId=' + encodeURIComponent(row.id) + '&sceneIndex=' + form.sceneIndex + '&page=' + page + '&limit=6&search=' + encodeURIComponent(query), { signal });
      if (signal?.aborted || epoch !== listEpoch.current) return;
      setList(result); setCurrent(previous => result.items.find(item => item.id === previous?.id) ?? previous);
    } catch (error) { if (!signal?.aborted && epoch === listEpoch.current) setNotice((error as Error).message); }
    finally { refreshing.current = false; }
  }, [row.id, form.sceneIndex, page, query]);
  React.useEffect(() => {
    const request = new AbortController(); setList(null); void refresh(request.signal);
    const timer = setInterval(() => void refresh(request.signal), 2500);
    return () => { request.abort(); listEpoch.current++; clearInterval(timer); };
  }, [refresh]);
  React.useEffect(() => {
    if (!current || !['queued', 'generating', 'cancelling'].includes(current.status)) return;
    const request = new AbortController(); const timer = setInterval(() => {
      void apiRequest<TopicVisualView>(base + '/' + current.id, { signal: request.signal }).then(result => {
        if (!request.signal.aborted) setCurrent(previous => previous?.id === result.id ? result : previous);
      }).catch(error => { if (!request.signal.aborted) setNotice((error as Error).message); });
    }, 2000); return () => { request.abort(); clearInterval(timer); };
  }, [current?.id, current?.status]);
  function change(update: Partial<Form>) { if (update.sceneIndex !== undefined) lookup.current?.abort(); onCanLeaveChange(false); setForm(value => ({ ...value, ...update })); setPreflight(null); }
  function chooseCandidate(value: TopicVisualView) { lookup.current?.abort(); setCurrent(value); setAlt((row.content?.scenes[value.sceneIndex]?.title ?? '教学参考图') + '，图中概念和关系待核对。'); setCaption('AI参考图，标签和关系待核对。'); }
  function selection() {
    return topicVisualPreflightSchema.parse({ operation: form.parentVisualId ? 'edit' : 'generate', draftId: row.id, sceneIndex: form.sceneIndex,
      expectedRevision: row.revision, contentFingerprint: row.contentFingerprint, purpose: form.purpose, requirements: form.requirements,
      ...(form.parentVisualId ? { parentVisualId: form.parentVisualId, changes: form.changes } : {}) });
  }
  async function preview() {
    if (locked || !canGenerate) return; const request = new AbortController(); operation.current = request; setBusy(true); setNotice('');
    try { const result = await apiRequest<Preflight>(base + '/preflight', { method: 'POST', body: JSON.stringify(selection()), signal: request.signal });
      if (!request.signal.aborted) { setPreflight(result); setCapabilities(result.capabilities); }
    } catch (error) { if (!request.signal.aborted) setNotice(error instanceof z.ZodError ? '请填写至少3个字的图片要求；修图还需说明具体修改。' : (error as Error).message); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  async function send(original: Pending) {
    if (busy || !ready) return; onCanLeaveChange(false); setPending(original); setBusy(true); setNotice('');
    const request = new AbortController(); operation.current = request;
    const body = original.body as { requestKey: string; parentVisualId?: string }, creating = ['generate', 'edit'].includes(original.action);
    try {
      let result: TopicVisualView | null = null;
      const receiptPath = creating ? base + '/requests/' + encodeURIComponent(body.requestKey) : base + '/' + original.visualId + '/requests/' + encodeURIComponent(body.requestKey);
      try {
        const receipt = await apiRequest<TopicVisualView>(receiptPath, { signal: request.signal });
        if (receipt.draftId !== row.id || !await topicFigureCommandMatches(original.action, original.body, receipt.receipt?.commandFingerprint)) throw Error('原配图回执摘要不一致，请下载完整请求并保留原键。');
        result = receipt;
      } catch (error) { if (!(error instanceof ApiRequestError) || error.status !== 404) throw error; }
      const path = commandPath(original);
      if (!result && !creating) {
        const target = await apiRequest<TopicVisualView>(base + '/' + original.visualId, { signal: request.signal });
        if (target.draftId !== row.id) throw Error('原操作不属于这份原稿，完整请求仍保留。');
      }
      result ??= await apiRequest<TopicVisualView>(path, { method: 'POST', body: JSON.stringify(original.body), signal: request.signal });
      if (request.signal.aborted) return;
      if (result.receipt?.key !== body.requestKey || result.receipt.kind !== (creating ? 'prepare' : original.action) ||
        !await topicFigureCommandMatches(original.action, original.body, result.receipt.commandFingerprint)) throw Error('原配图回执尚未确认，请保留原请求继续定位。');
      chooseCandidate(result); setPending(null); setRejected(null); setNotice('原操作已确认。图片就绪后可阅读核对；选用仍需保存完整改稿。'); void refresh();
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof ApiRequestError && [400, 409].includes(error.status)) { setRejected(original); setPending(null); setPreflight(null); }
      setNotice((error as Error).message + ' 完整原请求仍保留。');
    } finally { if (!request.signal.aborted) setBusy(false); }
  }
  function generate() {
    try { if (pending) return void send(pending); if (!preflight?.available || !canGenerate) return;
      const input = selection(), body = { ...input, preflightFingerprint: preflight.fingerprint, requestKey: crypto.randomUUID() };
      void send({ action: input.operation === 'edit' ? 'edit' : 'generate', visualId: null, body });
    } catch { setNotice('请核对需求并重新预检。'); }
  }
  function control(action: 'cancel' | 'retry') {
    if (!current?.task || pending) return;
    void send({ action, visualId: current.id, body: { expectedRevision: current.revision, generation: current.task.generation, taskVersion: current.task.version, requestKey: crypto.randomUUID() } });
  }
  return <section className="tw-figure-workbench" aria-label="白板配图工作区"><header><div><span className="tw-eyebrow">TEACHING FIGURES</span><h3>让这一幕更好理解</h3></div><small>图片模型 · gpt-image-2</small></header>
    <p>围绕知识点和提炼要点配图。文字模型独立选择，图片中的标签、数量和关系需要核对。</p>
    {notice && <p className="tw-notice" role="status">{notice}</p>}{unsafe && <p role="alert">本机未能保留完整配图输入，请下载原请求后再离开。</p>}
    {!canGenerate && row.status === 'ready' && <p className="tw-notice">请先保存完整改稿并核对服务器基线，再生成这一幕的图片。</p>}
    {capabilities && !capabilities.available && <p role="status">{capabilities.message}</p>}
    <fieldset disabled={locked || row.status !== 'ready'}><label>配图分幕<select value={form.sceneIndex} onChange={event => { change({ sceneIndex: Number(event.target.value), parentVisualId: '' }); setPage(1); setCurrent(null); }}>
      {row.content?.scenes.map((scene, index) => <option key={index} value={index}>{index + 1}. {scene.title}</option>)}</select></label>
      <label>图片用途<select value={form.purpose} onChange={event => change({ purpose: event.target.value as Form['purpose'] })}><option value="concept">概念说明</option><option value="comparison">对照关系</option><option value="scene">情境示意</option></select></label>
      <label>希望图片说明什么<textarea maxLength={1200} rows={3} value={form.requirements} placeholder="例如：用两个有交集的圆说明概念关系，标签简短，保留必要条件。" onChange={event => change({ requirements: event.target.value })}/></label>
      {form.parentVisualId && <><p>修图使用当前本人候选的原始 PNG，生成一个新版本。</p><label>具体修改<textarea maxLength={1200} rows={3} value={form.changes} onChange={event => change({ changes: event.target.value })}/></label>
        <button type="button" onClick={() => change({ parentVisualId: '' })}>改为重新生成</button></>}
    </fieldset>
    {preflight && <details className="tw-figure-context" open><summary>本次完整教学范围与配图要求</summary><h4>{preflight.context.scene.title}</h4>
      <p>{preflight.context.audience === 'adult' ? '本人成人主题' : preflight.context.grade + '年级的已确认目标'} · {preflight.context.topic}</p><p>学习目标：{preflight.context.objective}</p>
      <p>{preflight.context.scene.narration}</p>{preflight.context.scene.body && <p>{preflight.context.scene.body}</p>}
      {!!preflight.context.scene.bullets.length && <ul>{preflight.context.scene.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>}
      <WhiteboardExhibit exhibit={preflight.context.scene.exhibit}/>{preflight.context.targets.map((target, index) => <p key={index}>{target.name}：{target.objective}</p>)}
      <p>图片要求：{form.requirements}</p>{form.parentVisualId && <p>原图修改：{form.changes}</p>}</details>}
    <div className="tw-actions"><button type="button" disabled={locked || !canGenerate} onClick={() => void preview()}>预检配图范围</button>
      <button type="button" className="tw-primary" disabled={busy || !ready || !pending && (!preflight?.available || !canGenerate)} onClick={generate}>{busy ? '正在核对原操作…' : pending ? '恢复原配图请求' : form.parentVisualId ? '生成修订图片' : '生成参考图'}</button>
      {busy && <button type="button" onClick={() => { operation.current?.abort(); setBusy(false); setNotice('已停止本页等待，原请求继续保留；这不代表后台任务已取消。'); }}>停止等待</button>}
      <button type="button" onClick={() => { downloadTopicJson({ ...copy, ownerId, draftId: row.id }, 'whiteboard-figure-request.json'); setDownloaded(signature); }}>下载完整配图请求</button></div>
    <div className="tw-figure-candidates"><div><h4>本幕图片候选</h4><form onSubmit={event => { event.preventDefault(); setQuery(search); setPage(1); }}><label>搜索图片要求<input value={search} maxLength={120} onChange={event => setSearch(event.target.value)}/></label><button type="submit">查找</button></form>
      <div className="tw-figure-list" aria-label="本幕图片候选">{list?.items.map(item => <article key={item.id}><button type="button" aria-pressed={current?.id === item.id} disabled={unsafe || busy || Boolean(pending)} onClick={() => chooseCandidate(item)}>
        {item.status === 'ready' && item.imageUrl && item.sha256 && <TopicFigureThumbnail source={imageSource(item)}/>}
        <b>{statusNames[item.status]}{selected?.visualId === item.id ? ' · 本机已选用' : item.selected ? ' · 稿件已保存' : ''}</b><span>{item.requirements}</span><small>{item.operation === 'edit' ? '修订版本' : '新生成'}{item.currentTeaching ? '' : ' · 原教学版本'}</small></button>
        {item.status === 'ready' && <button type="button" disabled={current?.id === item.id} onClick={() => setComparison(item)}>加入对照</button>}</article>)}</div>
      {list && !list.total && <p>尚无候选。完成预检并明确生成后，图片会保存在这里。</p>}
      <div className="tw-pagination"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>{page} / {Math.max(1, Math.ceil((list?.total ?? 0) / 6))}</span><button disabled={!list || page * 6 >= list.total} onClick={() => setPage(value => value + 1)}>下一页</button></div></div>
      {current && <article aria-label="当前图片候选"><h4>{statusNames[current.status]}</h4><p>{current.requirements}</p>
        {current.status === 'ready' && current.imageUrl && current.sha256 ? <TopicFigureImage title={row.content?.scenes[current.sceneIndex]?.title ?? '教学参考图'} onReady={setImageReady}
          source={{ imageUrl: current.imageUrl, sha256: current.sha256, width: current.width!, height: current.height!, alt, caption }}/>
          : <p>原教学范围和需求已保留。生成未完成时可以继续阅读文字稿。</p>}
        {current.task?.errorCode && <details><summary>任务诊断</summary><code>{current.task.errorCode}</code></details>}
        {current.status === 'ready' && <><label>图片替代说明<textarea disabled={busy || Boolean(pending)} maxLength={600} value={alt} onChange={event => setAlt(event.target.value)}/></label><label>图注<textarea disabled={busy || Boolean(pending)} maxLength={600} value={caption} onChange={event => setCaption(event.target.value)}/></label>
          <label className="tw-figure-check"><input disabled={busy || Boolean(pending)} type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/>我已阅读图片，并核对本次要使用的标签和关系。</label>
          <div className="tw-actions"><button type="button" disabled={!imageReady || !reviewed || !current.currentTeaching || current.sceneIndex !== form.sceneIndex || alt.trim().length < 3 || row.status !== 'ready' || Boolean(pending)}
            onClick={() => { onFigure(form.sceneIndex, { visualId: current.id, alt: alt.trim(), caption: caption.trim() }); setNotice('已选入本机完整稿。请点击“保存完整改稿”，才会写入服务器。'); }}>选入当前完整稿</button>
            <button type="button" disabled={locked || !canGenerate || !current.currentTeaching || !capabilities?.editAvailable} onClick={() => change({ parentVisualId: current.id })}>以原图继续修订</button></div></>}
        {['queued', 'generating'].includes(current.status) && <button disabled={locked} onClick={() => control('cancel')}>取消图片生成</button>}
        {['failed', 'cancelled'].includes(current.status) && <button disabled={locked || !canGenerate || !current.currentTeaching} onClick={() => control('retry')}>重试原图片任务</button>}
      </article>}
    </div>
    {current?.status === 'ready' && comparison?.id !== current.id && comparison?.status === 'ready' && <section className="tw-figure-comparison" aria-label="两个图片候选对照"><h4>对照两个候选</h4>
      <div><TopicFigureImage source={imageSource(current)} title="当前候选"/><TopicFigureImage source={imageSource(comparison)} title="对照候选"/></div><button type="button" onClick={() => setComparison(null)}>结束图片对照</button></section>}
    {selected && <p className="tw-notice">本机稿已选用一张图片。<button disabled={row.status !== 'ready' || Boolean(pending)} onClick={() => onFigure(form.sceneIndex, undefined)}>取消本幕选图</button></p>}
    <details className="tw-local-copies"><summary onClick={() => { try { setCopies(topicCopies(storage, decode, 60000)); } catch { setNotice('暂时无法读取其他副本，当前请求仍保留。'); } }}>查看其他本机配图请求</summary>
      {copies.map(item => <article key={item.key}><p>{item.value.form.requirements}</p><button disabled={busy || Boolean(pending) || unsafe} onClick={() => { adopt(item.value); setNotice('已明确恢复这份完整配图请求。'); }}>恢复这个配图副本</button>
        <button onClick={() => downloadTopicJson(item.value, 'whiteboard-figure-copy.json')}>下载这份配图副本</button></article>)}</details>
  </section>;
}
