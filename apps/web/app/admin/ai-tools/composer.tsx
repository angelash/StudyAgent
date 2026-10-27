'use client';
import * as React from 'react';
import type { Question, TeachingToolPreflight, TeachingToolPurpose, TeachingToolRunView } from '@study-agent/contracts';
import { ApiRequestError, apiRequest } from '../../../lib/api';
import { refreshSessionUser } from '../../../lib/session-user';
import { XiaojiuModelPicker, type useXiaojiuModels } from '../../../components/xiaojiu-model-picker';
import { TeachingQuestionPreview } from './question-preview';
import { decodeTeachingCopy, downloadTeaching, downloadTeachingText, emptyTeachingForm, hasTeachingInput, otherTeachingCopies,
  teachingDraft, teachingStorage, unknownTeachingCopies, type TeachingCopy, type TeachingCreation, type TeachingForm } from './tool-draft';

const endpoint = '/ai/teaching-tools';
type Models = ReturnType<typeof useXiaojiuModels>;
export function TeachingComposer({ ownerId, purpose, models, onCanLeaveChange, beginCreate, onCreated, importForm }: {
  ownerId: string; purpose: TeachingToolPurpose; models: Models; onCanLeaveChange: (value: boolean) => void;
  beginCreate: () => number; onCreated: (run: TeachingToolRunView, ticket: number) => void; importForm?: { id: number; form: TeachingForm } | null;
}) {
  const initial = React.useMemo<TeachingCopy>(() => ({ version: 1, ownerId, purpose, at: 0, form: emptyTeachingForm(), pending: null }), [ownerId, purpose]);
  const [copy, setCopy] = React.useState(initial), live = React.useRef(initial), alive = React.useRef(true);
  const storage = React.useMemo(() => teachingStorage(ownerId, purpose), [ownerId, purpose]);
  const [ready, setReady] = React.useState(false), [storageError, setStorageError] = React.useState(false), [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(''), [preflight, setPreflight] = React.useState<{ draft: TeachingCreation['draft']; value: TeachingToolPreflight } | null>(null);
  const [canReplay, setCanReplay] = React.useState(false), [unreadable, setUnreadable] = React.useState<Array<{ key: string; raw: string }>>([]);
  const unknownUnstored = React.useRef<string | null>(null), unknownBackup = React.useRef<string | null>(null);
  const [copies, setCopies] = React.useState<ReturnType<typeof otherTeachingCopies>>([]);
  const [questions, setQuestions] = React.useState<Question[]>([]), [bankLoading, setBankLoading] = React.useState(false), [bankError, setBankError] = React.useState(''), [search, setSearch] = React.useState('');
  const operation = React.useRef<AbortController | null>(null), downloaded = React.useRef(''), imported = React.useRef<number | null>(null);
  const form = copy.form;
  const fieldId = React.useId();
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current?.abort(); }; }, []);
  function remember(next: TeachingCopy) {
    live.current = next; setCopy(next); const text = JSON.stringify(next);
    try { if (unknownUnstored.current !== null) { localStorage.setItem(storage.base + '.unreadable.' + crypto.randomUUID(), unknownUnstored.current); unknownUnstored.current = null; }
      if (text.length > 2_000_000) throw Error('Draft too large for local recovery'); localStorage.setItem(storage.key, text); setStorageError(false); onCanLeaveChange(true); }
    catch { setStorageError(true); onCanLeaveChange((unknownUnstored.current === null || unknownBackup.current === unknownUnstored.current) && (downloaded.current === text || !hasTeachingInput(next.form) && !next.pending)); }
  }
  React.useEffect(() => {
    let restored = initial;
    try { setUnreadable(unknownTeachingCopies(storage, raw => Boolean(decodeTeachingCopy(raw, ownerId, purpose))));
      for (const key of storage.restoreKeys) { const raw = localStorage.getItem(key); if (!raw) continue;
      const saved = decodeTeachingCopy(raw, ownerId, purpose); if (saved) { restored = saved; setNotice('已恢复原输入与待核对请求。'); }
      else { if (key === storage.key) unknownUnstored.current = raw; setNotice('一份本机原稿暂不能读取，原件仍保留，可先下载。'); } break; } }
    catch { setStorageError(true); }
    remember({ ...restored, at: Date.now() }); setReady(true);
  }, [storage.key]);
  function archiveCurrent() {
    if (!hasTeachingInput(live.current.form) && !live.current.pending) return true;
    try { localStorage.setItem(storage.base + '.' + crypto.randomUUID(), JSON.stringify(live.current)); return true; }
    catch { if (downloaded.current === JSON.stringify(live.current)) return true; setNotice('当前原稿未能保留，请先下载完整副本再载入其他输入。'); return false; }
  }
  React.useEffect(() => {
    if (!ready || !importForm || imported.current === importForm.id) return;
    if (!archiveCurrent()) return; imported.current = importForm.id;
    remember({ ...initial, form: importForm.form, at: Date.now() }); setPreflight(null); setCanReplay(false); setNotice('已复制原输入，可核对模型后新建另一份建议；原任务保持。');
  }, [ready, importForm?.id]);
  React.useEffect(() => {
    if (!ready || form.source !== 'question_bank') return;
    const request = new AbortController(); setBankLoading(true); setBankError('');
    void apiRequest<Question[]>('/questions?subject=' + form.bankSubject, { signal: request.signal }).then(rows => { if (!request.signal.aborted) setQuestions(rows); })
      .catch(error => { if (!request.signal.aborted) { setBankError(error.message); if (error instanceof ApiRequestError && [401, 403].includes(error.status)) void refreshSessionUser(); } }).finally(() => { if (!request.signal.aborted) setBankLoading(false); });
    return () => request.abort();
  }, [ready, form.source, form.bankSubject]);
  function change(update: Partial<TeachingForm>) { operation.current?.abort(); setBusy(''); downloaded.current = ''; setPreflight(null); setCanReplay(false);
    onCanLeaveChange(false); remember({ ...live.current, form: { ...live.current.form, ...update }, at: Date.now() }); }
  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (storageError && downloaded.current !== JSON.stringify(live.current) && (hasTeachingInput(live.current.form) || live.current.pending)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [storageError]);
  function failure(error: unknown) {
    if (error instanceof ApiRequestError && [401, 403].includes(error.status)) { void refreshSessionUser(); return; }
    setNotice(error instanceof Error ? error.message : '暂未完成操作，原输入仍保留。');
  }
  async function execute(action: 'preflight' | 'create' | 'recover' | 'replay') {
    if (busy || !ready) return; const request = new AbortController(); operation.current?.abort(); operation.current = request; setBusy(action); setNotice('');
    const ticket = beginCreate(); let sent: TeachingCreation | null = null;
    try {
      if (action === 'preflight') {
        const draft = teachingDraft(live.current.form, purpose), value = await apiRequest<TeachingToolPreflight>(endpoint + '/preflight', { method: 'POST', body: JSON.stringify(draft), signal: request.signal });
        if (!request.signal.aborted) { setPreflight({ draft, value }); setNotice('完整输入已预检，核对后再生成。'); } return;
      }
      if (action === 'recover') {
        const original = live.current.pending; if (!original) return;
        const row = await apiRequest<TeachingToolRunView>(endpoint + '/requests/' + encodeURIComponent(original.requestKey), { signal: request.signal });
        if (!request.signal.aborted) { remember({ ...live.current, pending: null, at: Date.now() }); setCanReplay(false); onCreated(row, ticket); setNotice('已定位原任务，没有重复生成。'); } return;
      }
      if (action === 'replay') { if (!canReplay || !live.current.pending) return; sent = live.current.pending; }
      else {
        if (live.current.pending || !preflight) return;
        const current = teachingDraft(live.current.form, purpose); if (JSON.stringify(current) !== JSON.stringify(preflight.draft)) throw Error('输入已变化，请重新预检。');
        sent = { requestKey: crypto.randomUUID(), fingerprint: preflight.value.fingerprint, draft: preflight.draft };
        remember({ ...live.current, pending: sent, at: Date.now() });
      }
      const row = await apiRequest<TeachingToolRunView>(endpoint + '/runs', { method: 'POST', body: JSON.stringify(sent), signal: request.signal });
      if (!request.signal.aborted) { remember({ ...live.current, pending: null, at: Date.now() }); setPreflight(null); setCanReplay(false); onCreated(row, ticket); setNotice('原输入已保存到任务，生成结果仍需人工核对。'); }
    } catch (error) {
      if (request.signal.aborted) return;
      if (action === 'recover' && error instanceof ApiRequestError && error.status === 404) { setCanReplay(true); setNotice('暂未查到原请求，可明确再次提交同一份原命令，原输入与模型保持。'); }
      else failure(error);
    } finally { if (!request.signal.aborted && alive.current) setBusy(''); }
  }
  function backup() { downloadTeaching(live.current, 'teaching-input-and-request.json'); downloaded.current = JSON.stringify(live.current); onCanLeaveChange(unknownUnstored.current === null || unknownBackup.current === unknownUnstored.current); setNotice('已下载完整输入及原请求。'); }
  const filtered = questions.filter(row => ['draft', 'published'].includes(row.status) && (!search || (row.stem + ' ' + row.id).toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  if (!ready) return <section className="tt-composer" role="status">正在读取此标签页的原稿…</section>;
  return <section className="tt-composer" aria-label={purpose === 'assessment_analysis' ? '答案分析输入' : '提示草稿输入'}>
    <div className="tt-section-heading"><span>01 / 输入</span><button type="button" className="tt-link" onClick={backup}>下载完整原稿 ↗</button></div>
    {storageError && <p role="alert" className="tt-caution">本机存储暂不可用。输入仍在当前页，请下载后再离开。</p>}
    {!!unreadable.length && <section className="tt-caution" aria-label="未识别的本机原稿"><p>有 {unreadable.length} 份本机原稿暂不能读取，原始内容保持，可下载后核对。</p>{unreadable.map((item, index) => <button type="button" key={item.key} onClick={() => { downloadTeachingText(item.raw, 'original-unreadable-teaching-copy.json'); unknownBackup.current = item.raw; onCanLeaveChange((unknownUnstored.current === null || unknownBackup.current === unknownUnstored.current) && (!storageError || downloaded.current === JSON.stringify(live.current) || !hasTeachingInput(live.current.form) && !live.current.pending)); }}>下载暂不能读取的原件 {index + 1}</button>)}</section>}
    {notice && <p className="tt-notice" role="status">{notice}</p>}
    {copy.pending && <section className="tt-pending" aria-label="待核对原请求"><h3>先核对这条原请求</h3><p>请求回执尚未确认。当前输入与原命令分别保留，重新读取不会新建建议。</p>
      <div className="tt-actions"><button disabled={!!busy} type="button" onClick={() => void execute('recover')}>恢复原请求</button>
        {canReplay && <button disabled={!!busy} type="button" onClick={() => void execute('replay')}>再次提交原命令</button>}
        <button type="button" onClick={backup}>下载原输入与请求</button></div>
      <details><summary>查看完整原命令</summary><pre className="tt-json">{JSON.stringify(copy.pending, null, 2)}</pre></details>
      <button type="button" disabled={!!busy} className="tt-link" onClick={() => { if (archiveCurrent()) { remember({ ...live.current, pending: null, at: Date.now() }); setCanReplay(false); setPreflight(null); setNotice('原请求副本已保留。新建议需重新预检；原任务没有被取消。'); } }}>保留原请求副本，开始另一份建议</button>
    </section>}
    <fieldset disabled={!!busy}><legend className="tt-sr">完整教研输入</legend>
      <div className="tt-source-toggle"><button type="button" aria-pressed={form.source === 'temporary'} onClick={() => change({ source: 'temporary' })}>自编临时题</button>
        <button type="button" aria-pressed={form.source === 'question_bank'} onClick={() => change({ source: 'question_bank' })}>选择题库原题</button></div>
      {form.source === 'question_bank' ? <div className="tt-bank"><label>学科<select value={form.bankSubject} onChange={event => change({ bankSubject: event.target.value as TeachingForm['bankSubject'] })}>
        <option value="math">数学</option><option value="chinese">语文</option><option value="english">英语</option></select></label>
        <label>查找题目<input value={search} onChange={event => setSearch(event.target.value)} placeholder="输入题干关键词或题目编号"/></label>
        {bankLoading ? <p role="status">正在读取当前题库…</p> : bankError ? <p role="alert">{bankError}</p> : <>
          <p className="tt-muted">显示 {Math.min(filtered.length, 80)} / {filtered.length} 题；可继续缩小关键词。</p>
          <div className="tt-question-list">{filtered.slice(0, 80).map(row => <button type="button" key={row.id} aria-pressed={form.questionId === row.id} onClick={() => change({ questionId: row.id })}><span>{row.stem}</span><small>{row.id} · {row.status === 'published' ? '已发布' : '草稿'}</small></button>)}</div>
          {!filtered.length && <p>当前范围没有匹配题目。</p>}</>}
        {form.questionId && <p className="tt-selected">已选原题：{form.questionId}</p>}<p className="tt-muted">预检从服务端冻结完整题干、表格、公式与原答案结构。</p>
      </div> : <>
        <div className="tt-two"><label>草稿名称<input value={form.title} onChange={event => change({ title: event.target.value })} placeholder="给这份临时题起个名字"/></label>
          <label>学科或主题<input value={form.subject} onChange={event => change({ subject: event.target.value })}/></label></div>
        <label><span id={fieldId + '-stem'}>完整题干</span><textarea aria-labelledby={fieldId + '-stem'} rows={5} value={form.stem} onChange={event => change({ stem: event.target.value })} placeholder="保留所有条件、单位与问题。"/></label>
        <AnswerField label="参考答案" raw={form.referenceAnswer} format={form.referenceFormat} unknown={form.referenceUnknown} onChange={(raw, format, unknown) => change({ referenceAnswer: raw, referenceFormat: format, referenceUnknown: unknown })}/>
        <label><span id={fieldId + '-analysis'}>参考解析（可选）</span><textarea aria-labelledby={fieldId + '-analysis'} rows={3} value={form.referenceAnalysis} onChange={event => change({ referenceAnalysis: event.target.value })}/></label>
        <details className="tt-structures"><summary>补充表格、公式与答案结构</summary><p>已有结构化原文可完整粘贴。图片/声音引用保留供人工核对，本次文字分析不读取媒体内容。</p>
          <label><span id={fieldId + '-document'}>完整题目结构 JSON</span><textarea aria-labelledby={fieldId + '-document'} rows={5} value={form.originalDocument} onChange={event => change({ originalDocument: event.target.value })}/></label>
          <label><span id={fieldId + '-schema'}>原答案结构 JSON</span><textarea aria-labelledby={fieldId + '-schema'} rows={4} value={form.originalAnswerSchema} onChange={event => change({ originalAnswerSchema: event.target.value })}/></label>
          <label><span id={fieldId + '-media'}>媒体限制与待核对说明</span><textarea aria-labelledby={fieldId + '-media'} rows={2} value={form.mediaNotice} onChange={event => change({ mediaNotice: event.target.value })}/></label></details>
      </>}
      {purpose === 'assessment_analysis' ? <AnswerField label="待核对作答" raw={form.answer} format={form.answerFormat} unknown={form.answerUnknown}
        onChange={(raw, format, unknown) => change({ answer: raw, answerFormat: format, answerUnknown: unknown })}/>
        : <label>帮助层级<select value={form.hintLevel} onChange={event => change({ hintLevel: Number(event.target.value) as 1 | 2 | 3 })}><option value={1}>1 · 观察条件与目标</option><option value={2}>2 · 下一步与分步支架</option><option value={3}>3 · 更充分的思路支架</option></select></label>}
      <XiaojiuModelPicker catalog={models.catalog} value={form.modelId} onChange={value => { change({ modelId: value }); models.setModelId(value); }} error={models.error} onRetry={models.reload}/>
    </fieldset>
    <div className="tt-actions"><button type="button" className="tt-primary" disabled={!!busy || !!copy.pending || !models.catalog} onClick={() => void execute('preflight')}>{busy === 'preflight' ? '正在预检…' : '预检完整输入'}</button>
      <button type="button" disabled={!!busy || !!copy.pending || !preflight} onClick={() => void execute('create')}>{busy === 'create' ? '正在提交原请求…' : '确认输入并生成草稿'}</button></div>
    {preflight && <section className="tt-preflight" aria-label="完整输入预检"><div className="tt-section-heading"><span>02 / 发送前核对</span><b>{preflight.value.modelName}</b></div>
      <p>完整输入 {preflight.value.contextCharacters} 字符 · 尚未生成建议</p><TeachingQuestionPreview snapshot={preflight.value.snapshot}/></section>}
    <details className="tt-copies"><summary onClick={() => { try { setCopies(otherTeachingCopies(storage, ownerId, purpose)); } catch { setNotice('暂不能读取其他本机副本，当前原稿仍保留。'); } }}>本机其他标签页的原稿</summary>
      {!copies.length && <p>暂无其他可读取副本。</p>}{copies.map(item => <article key={item.key}><p>{item.value.form.title || item.value.form.questionId || '未命名输入'} · {new Date(item.at).toLocaleString('zh-CN')}</p>
        <button type="button" disabled={!!busy} onClick={() => { if (!archiveCurrent()) return; remember({ ...item.value, at: Date.now() }); setPreflight(null); setCanReplay(false); setNotice('已载入所选副本，原当前输入也已保留。'); }}>载入这个副本</button>
        <button type="button" onClick={() => downloadTeaching(item.value, 'other-teaching-input.json')}>下载副本</button></article>)}</details>
  </section>;
}
function AnswerField({ label, raw, format, unknown, onChange }: { label: string; raw: string; format: 'text' | 'json'; unknown: boolean;
  onChange: (raw: string, format: 'text' | 'json', unknown: boolean) => void }) {
  const labelId = React.useId();
  return <div className="tt-answer-field"><div className="tt-answer-heading"><label>{label}格式<select aria-label={label + '格式'} value={format} onChange={event => onChange(raw, event.target.value as 'text' | 'json', unknown)}><option value="text">普通文字</option><option value="json">结构化 JSON</option></select></label>
    <label className="tt-check"><input type="checkbox" checked={unknown} onChange={event => onChange(raw, format, event.target.checked)}/>暂不清楚{label}</label></div>
    <label><span id={labelId}>{label}</span><textarea aria-labelledby={labelId} rows={4} value={raw} disabled={unknown} onChange={event => onChange(event.target.value, format, unknown)} placeholder={format === 'json' ? '完整 JSON，保留步骤、单位和各个字段。' : '完整保留原文与推导过程。'}/></label>
  </div>;
}
