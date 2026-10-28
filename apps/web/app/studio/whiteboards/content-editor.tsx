'use client';
import * as React from 'react';
import { assistantWhiteboardContentSchema, assistantWhiteboardEditSchema, topicWhiteboardContentSchema, topicWhiteboardEditSchema, type AssistantWhiteboardSourceMap, type TopicWhiteboardContent, type TopicWhiteboardDraftView } from '@study-agent/contracts';
import { ApiRequestError, apiRequest } from '../../../lib/api';
import { WhiteboardExhibit } from '../whiteboard-exhibit';
import { editableAssistantContentSchema, editableTopicContentSchema } from './content-draft';
import { AssistantWhiteboardOrigin, TopicSourceMapEditor, useWhiteboardSource } from './assistant-source';
import { TopicManuscript } from './manuscript';
import { topicCopies, topicStorage } from './local-copies';
import { topicCommandMatches } from './command-digest';
import { downloadTopicJson } from './download';
export { downloadTopicJson } from './download';
import { TopicFigureWorkbench } from './figure-workbench';
type EditCommand = ReturnType<typeof topicWhiteboardEditSchema.parse>;
type LocalEditCopy = { content: TopicWhiteboardContent; baseline: { fingerprint: string; revision: number; content: TopicWhiteboardContent }; pending: EditCommand | null };
export function TopicContentEditor({ row, ownerId, onSaved, onCanLeaveChange: reportCanLeave, onDirtyChange }: {
  row: TopicWhiteboardDraftView; ownerId: string; onSaved: (row: TopicWhiteboardDraftView) => void; onCanLeaveChange: (value: boolean) => void;
  onDirtyChange: (value: boolean) => void;
}) {
  const [content, setContent] = React.useState<TopicWhiteboardContent>(() => structuredClone(row.content!));
  const isSource = row.audience.kind === 'assistant', source = useWhiteboardSource(row.id, isSource);
  const savedSchema = isSource ? assistantWhiteboardContentSchema : topicWhiteboardContentSchema;
  const localSchema = isSource ? editableAssistantContentSchema : editableTopicContentSchema;
  const editSchema = isSource ? assistantWhiteboardEditSchema : topicWhiteboardEditSchema;
  const [baseline, setBaseline] = React.useState({ fingerprint: row.contentFingerprint!, revision: row.revision, content: structuredClone(row.content!) });
  const [pending, setPending] = React.useState<EditCommand | null>(null), [ready, setReady] = React.useState(false), [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(''), [storageError, setStorageError] = React.useState(false);
  const [downloadedRevision, setDownloadedRevision] = React.useState(-1);
  const [editorCanLeave, setEditorCanLeave] = React.useState(true), [figuresCanLeave, setFiguresCanLeave] = React.useState(true), [figurePending, setFigurePending] = React.useState(false);
  const onCanLeaveChange = React.useCallback((value: boolean) => setEditorCanLeave(value), []);
  const figureCanLeaveChange = React.useCallback((value: boolean) => setFiguresCanLeave(value), []);
  const figurePendingChange = React.useCallback((value: boolean) => setFigurePending(value), []);
  React.useEffect(() => { reportCanLeave(editorCanLeave && figuresCanLeave); }, [editorCanLeave, figuresCanLeave, reportCanLeave]);
  const latest = React.useRef(content), request = React.useRef<AbortController | null>(null), sequence = React.useRef(0);
  latest.current = content;
  const storage = React.useMemo(() => topicStorage('studyagent.topic-whiteboard.editor.v1.' + ownerId + '.' + row.id), [ownerId, row.id]), key = storage.key;
  const [copies, setCopies] = React.useState<Array<{ key: string; at: number; value: LocalEditCopy }>>([]);
  const dirty = JSON.stringify(content) !== JSON.stringify(baseline.content), changedOnServer = row.contentFingerprint !== baseline.fingerprint || row.status === 'ready' && row.revision !== baseline.revision;
  function decode(raw: string): LocalEditCopy | null {
    const saved = JSON.parse(raw), parsed = localSchema.safeParse(saved.content), base = savedSchema.safeParse(saved.baseline?.content);
    if (saved.ownerId !== ownerId || saved.id !== row.id || !parsed.success || !base.success || !/^[a-f0-9]{64}$/.test(saved.baseline.fingerprint) || !Number.isSafeInteger(saved.baseline.revision) || saved.baseline.revision < 0) return null;
    const original = saved.pending ? editSchema.safeParse(saved.pending) : null;
    return { content: parsed.data, baseline: { ...saved.baseline, content: base.data }, pending: original?.success ? original.data : null };
  }
  function restoreCopy(saved: LocalEditCopy) { sequence.current++; setContent(saved.content); latest.current = saved.content; setBaseline(saved.baseline); setPending(saved.pending); }
  React.useEffect(() => { onDirtyChange(!ready || dirty || changedOnServer || Boolean(pending) || figurePending); }, [ready, dirty, changedOnServer, pending, figurePending, onDirtyChange]);
  React.useEffect(() => {
    try {
      for (const candidate of storage.restoreKeys) {
        const raw = localStorage.getItem(candidate); if (!raw || raw.length > 256000) continue;
        const saved = decode(raw);
        if (saved) {
          restoreCopy(saved);
          setNotice('已恢复这份候选的完整本机改稿；请核对服务器版本后继续。');
          break;
        }
      }
    } catch { setStorageError(true); setNotice('本机存储暂不可用，请下载完整改稿后再离开。'); }
    setReady(true); return () => request.current?.abort();
  }, [key]);
  React.useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify({ ownerId, id: row.id, content, baseline, pending, at: Date.now() })); setStorageError(false); onCanLeaveChange(true); }
    catch { setStorageError(true); onCanLeaveChange(!dirty && !pending); }
  }, [content, baseline, pending, ready, key, dirty, onCanLeaveChange]);
  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || pending) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);
  function change(next: TopicWhiteboardContent) { sequence.current++; latest.current = next; onCanLeaveChange(false); setContent(next); }
  function sceneChange(index: number, update: Partial<TopicWhiteboardContent['scenes'][number]>) {
    change({ ...content, scenes: content.scenes.map((scene, current) => current === index ? { ...scene, ...update } : scene) });
  }
  async function save() {
    if (busy || !ready || row.status !== 'ready' || changedOnServer && !pending) return;
    const command = pending ?? { expectedRevision: baseline.revision, contentFingerprint: baseline.fingerprint,
      content: structuredClone(content), requestKey: crypto.randomUUID() };
    const validation = editSchema.safeParse(command);
    if (!validation.success) { setNotice(validation.error.issues.map(issue => issue.message).join('；')); return; }
    setPending(command); setBusy(true); setNotice('');
    try { localStorage.setItem(key, JSON.stringify({ ownerId, id: row.id, content, baseline, pending: command, at: Date.now() })); }
    catch { setStorageError(true); }
    request.current?.abort(); const operation = new AbortController(); request.current = operation; const start = sequence.current;
    try {
      const path = '/learning/studio/topic-whiteboards/drafts/' + row.id;
      let result: TopicWhiteboardDraftView | null = null;
      if (pending) try {
        const original = await apiRequest<TopicWhiteboardDraftView>(path + '/requests/' + encodeURIComponent(command.requestKey), { signal: operation.signal });
        if (await topicCommandMatches('edit', command, original.receipt?.commandFingerprint)) result = original;
      } catch (error) { if (!(error instanceof ApiRequestError) || error.status !== 404) throw error; }
      result ??= await apiRequest<TopicWhiteboardDraftView>(path + '/content', { method: 'PATCH', body: JSON.stringify(command), signal: operation.signal });
      if (operation.signal.aborted) return;
      if (result.receipt?.key !== command.requestKey || result.receipt.kind !== 'edit') throw Error('原修改回执尚未确认，请保留原命令后继续定位。');
      setPending(null); onSaved(result);
      if (result.content && result.contentFingerprint === result.receipt.contentFingerprint) {
        setBaseline({ fingerprint: result.contentFingerprint!, revision: result.revision, content: result.content });
        const currentContent = topicWhiteboardContentSchema.safeParse(latest.current);
        if (start === sequence.current && currentContent.success && JSON.stringify(currentContent.data) === JSON.stringify(topicWhiteboardContentSchema.parse(command.content))) {
          setContent(result.content); latest.current = result.content;
        }
        setNotice('完整改稿已保存；原AI复核继续保留，修改后的内容需要重新核对。');
      } else setNotice('原修改已保存过，但服务器还有较新版本。本机全文继续保留，请比较后选择基线。');
    } catch (error) {
      if (operation.signal.aborted) return;
      if (error instanceof ApiRequestError && [400, 409].includes(error.status)) setPending(null);
      setNotice((error as Error).message + ' 本机全文仍保留。');
      if (error instanceof ApiRequestError && error.status === 409) try {
        const current = await apiRequest<TopicWhiteboardDraftView>('/learning/studio/topic-whiteboards/drafts/' + row.id, { signal: operation.signal });
        if (!operation.signal.aborted) onSaved(current);
      } catch { if (!operation.signal.aborted) setNotice('本机全文仍保留。最新服务器稿暂未读到，请稍后重新读取当前候选再比较。'); }
    } finally { if (!operation.signal.aborted) setBusy(false); }
  }
  function adopt(keepLocal: boolean) {
    if (!row.content || pending) return;
    setBaseline({ fingerprint: row.contentFingerprint!, revision: row.revision, content: structuredClone(row.content) });
    if (!keepLocal) change(structuredClone(row.content));
    setNotice(keepLocal ? '已明确采用服务器基线并保留我的全文。请比较后保存。' : '已采用当前服务器稿。');
  }
  return <section className="tw-editor" aria-label="完整白板改稿">
    {isSource && <aside className="tw-source-context"><h3>来自本人对话的教学草稿</h3><p>原教学年级：{row.audience.kind === 'assistant' ? row.audience.courseGrade ?? '未指定' : ''} · 学生档案年级：{row.audience.kind === 'assistant' ? row.audience.profileGrade ?? '未指定' : ''}</p>
      {source.error ? <p role="alert">{source.error}。本机改稿仍保留。</p> : source.value ? <AssistantWhiteboardOrigin origin={source.value.origin}/> : <p role="status">正在核对原对话来源…</p>}</aside>}
    <header><div><h2>完整教学稿</h2><p>{dirty ? '有本机修改' : '与所用基线一致'} · {storageError ? '本机存储不可用' : '本机草稿已保留'}</p></div>
      <button type="button" onClick={() => { downloadTopicJson({ content, baseline, pending }, 'whiteboard-edit.json'); setDownloadedRevision(sequence.current); onCanLeaveChange(true); }}>下载完整改稿</button></header>
    {notice && <p className="tw-notice" role="status">{notice}</p>}
    <details className="tw-local-copies"><summary onClick={() => { try { setCopies(topicCopies(storage, decode, 256000)); } catch { setNotice('暂时无法读取其他本机副本，当前全文仍保留。'); } }}>查看其他本机改稿</summary>
      {copies.length ? copies.map(copy => <article key={copy.key}><b>{copy.value.content.title || '未填写标题的改稿'}</b><p>{copy.value.content.description}</p>
        <button disabled={busy || Boolean(pending) || row.status !== 'ready' || storageError && dirty && downloadedRevision !== sequence.current} onClick={() => { restoreCopy(copy.value); setNotice('已明确恢复所选本机稿，请与服务器版本比较后保存。'); }}>恢复这份本机改稿</button>
        <button onClick={() => downloadTopicJson(copy.value, 'whiteboard-local-copy.json')}>下载这份本机稿</button></article>) : <p>尚未读取到其他已绑定的本机稿。</p>}</details>
    {changedOnServer && <aside className="tw-conflict" role="alert"><p>服务器稿已变化。本机全文保留，请先比较原稿。</p>
      <details><summary>阅读当前服务器完整稿</summary><TopicManuscript content={row.content}/></details>
      <button disabled={Boolean(pending)} onClick={() => adopt(false)}>采用服务器稿</button>
      <button disabled={Boolean(pending)} onClick={() => adopt(true)}>以服务器为基线继续我的改稿</button></aside>}
    <fieldset disabled={!ready || row.status !== 'ready'}><label>白板标题<input maxLength={120} value={content.title} onChange={event => change({ ...content, title: event.target.value })}/></label>
      <label>讲解概要<textarea maxLength={600} value={content.description} onChange={event => change({ ...content, description: event.target.value })}/></label>
      {content.scenes.map((scene, index) => <details key={index} open={index === 0} className="tw-scene-editor"><summary>{index + 1}. {scene.title}</summary>
        <label>这一幕的结构<select value={scene.kind} onChange={event => sceneChange(index, { kind: event.target.value as typeof scene.kind })}><option value="title">开场</option><option value="concept">概念</option><option value="steps">步骤</option><option value="check">自我检验</option></select></label>
        <label>分幕标题<input maxLength={120} value={scene.title} onChange={event => sceneChange(index, { title: event.target.value })}/></label>
        <label>完整旁白<textarea rows={5} maxLength={1800} value={scene.narration} onChange={event => sceneChange(index, { narration: event.target.value })}/></label>
        <label>板书正文<textarea maxLength={1000} value={scene.body} onChange={event => sceneChange(index, { body: event.target.value })}/></label>
        <div className="tw-bullet-editor"><h3>完整要点</h3><p>每条要点应逐字出现在本幕旁白中。</p>{scene.bullets.map((bullet, bulletIndex) => <div key={bulletIndex}>
          <label>要点 {bulletIndex + 1}<textarea maxLength={240} value={bullet} onChange={event => sceneChange(index, { bullets: scene.bullets.map((text, current) => current === bulletIndex ? event.target.value : text) })}/></label>
          <button onClick={() => sceneChange(index, { bullets: scene.bullets.filter((_, current) => current !== bulletIndex) })}>移除此要点</button></div>)}
          <button disabled={scene.bullets.length >= 6} onClick={() => sceneChange(index, { bullets: [...scene.bullets, ''] })}>添加要点</button></div>
        <label>对照展示<select value={scene.exhibit?.kind ?? 'none'} onChange={event => sceneChange(index, { exhibit: event.target.value === 'table' ? { kind: 'table', headers: ['项目', '条件'], rows: [['请补充', '请补充']] } : event.target.value === 'formula' ? { kind: 'formula', latex: '', explanation: '' } : null })}>
          <option value="none">文字讲解</option><option value="table">对照表</option><option value="formula">公式</option></select></label>
        {scene.exhibit?.kind === 'formula' && <><label>公式 LaTeX<textarea maxLength={600} value={scene.exhibit.latex} onChange={event => sceneChange(index, { exhibit: { ...scene.exhibit as Extract<NonNullable<typeof scene.exhibit>, { kind: 'formula' }>, latex: event.target.value } })}/></label>
          <label>公式说明<textarea maxLength={1000} value={scene.exhibit.explanation} onChange={event => sceneChange(index, { exhibit: { ...scene.exhibit as Extract<NonNullable<typeof scene.exhibit>, { kind: 'formula' }>, explanation: event.target.value } })}/></label></>}
        {scene.exhibit?.kind === 'table' && <div className="tw-table-editor">{scene.exhibit.headers.map((header, column) => <label key={column}>表头 {column + 1}<input maxLength={120} value={header} onChange={event => {
          if (scene.exhibit?.kind === 'table') sceneChange(index, { exhibit: { ...scene.exhibit, headers: scene.exhibit.headers.map((text, current) => current === column ? event.target.value : text) } });
        }}/></label>)}{scene.exhibit.rows.map((cells, line) => <fieldset key={line}><legend>第 {line + 1} 行</legend>{cells.map((text, column) => <label key={column}>{scene.exhibit?.kind === 'table' ? scene.exhibit.headers[column] : column + 1}
          <textarea maxLength={240} value={text} onChange={event => { if (scene.exhibit?.kind === 'table') sceneChange(index, { exhibit: { ...scene.exhibit, rows: scene.exhibit.rows.map((row, rowIndex) => rowIndex === line ? row.map((cell, current) => current === column ? event.target.value : cell) : row) } }); }}/></label>)}
          <button disabled={scene.exhibit?.kind !== 'table' || scene.exhibit.rows.length <= 1} onClick={() => { if (scene.exhibit?.kind === 'table') sceneChange(index, { exhibit: { ...scene.exhibit, rows: scene.exhibit.rows.filter((_, current) => current !== line) } }); }}>删除此行</button></fieldset>)}
          <div className="tw-actions"><button disabled={scene.exhibit.rows.length >= 12} onClick={() => { if (scene.exhibit?.kind === 'table') sceneChange(index, { exhibit: { ...scene.exhibit, rows: [...scene.exhibit.rows, scene.exhibit.headers.map(() => '')] } }); }}>添加整行</button>
            <button disabled={scene.exhibit.headers.length >= 5} onClick={() => { if (scene.exhibit?.kind === 'table') sceneChange(index, { exhibit: { ...scene.exhibit, headers: [...scene.exhibit.headers, '新列'], rows: scene.exhibit.rows.map(row => [...row, '']) } }); }}>添加列</button>
            <button disabled={scene.exhibit.headers.length <= 2} onClick={() => { if (scene.exhibit?.kind === 'table') sceneChange(index, { exhibit: { ...scene.exhibit, headers: scene.exhibit.headers.slice(0, -1), rows: scene.exhibit.rows.map(row => row.slice(0, -1)) } }); }}>删除最后一列</button></div></div>}
        {isSource && source.value && <TopicSourceMapEditor map={(scene as typeof scene & { sourceMap: AssistantWhiteboardSourceMap }).sourceMap} origin={source.value.origin}
          onChange={sourceMap => change({ ...content, scenes: content.scenes.map((item, current) => current === index ? { ...item, sourceMap } : item) })}/>}
        <WhiteboardExhibit exhibit={scene.exhibit}/>
        {scene.figure && <div className="tw-figure-caption"><p>本幕已选图片，保存时会重新核对原图和教学内容。</p>
          <label>已选图片的替代说明<textarea maxLength={600} value={scene.figure.alt} onChange={event => sceneChange(index, { figure: { ...scene.figure!, alt: event.target.value } })}/></label>
          <label>已选图片的图注<textarea maxLength={600} value={scene.figure.caption} onChange={event => sceneChange(index, { figure: { ...scene.figure!, caption: event.target.value } })}/></label>
          <button type="button" onClick={() => { const { figure: _figure, ...teaching } = scene; change({ ...content, scenes: content.scenes.map((item, current) => current === index ? teaching : item) }); }}>移除这一幕的图片</button></div>}
      </details>)}
    </fieldset>
    <TopicFigureWorkbench row={row} ownerId={ownerId} manuscriptDirty={dirty || changedOnServer || Boolean(pending)} figures={content.scenes.map(scene => scene.figure)}
      onFigure={(index, figure) => {
        change({ ...content, scenes: content.scenes.map((scene, current) => { if (current !== index) return scene; const { figure: _previous, ...teaching } = scene; return figure ? { ...teaching, figure } : teaching; }) });
      }} onCanLeaveChange={figureCanLeaveChange} onPendingChange={figurePendingChange}/>
    <footer><button className="tw-primary" disabled={busy || !ready || row.status !== 'ready' || changedOnServer && !pending || !dirty && !pending}
      onClick={() => void save()}>{busy ? '正在核对保存回执…' : pending ? '恢复原修改请求' : '保存完整改稿'}</button></footer>
  </section>;
}
