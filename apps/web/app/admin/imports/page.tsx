'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ImportFile, ProcessingTaskView, QuestionImportJob, QuestionImportRecord, Subject } from '@study-agent/contracts';
import { apiBaseUrl, apiRequest } from '../../../lib/api';
import { StudyNav } from '../../../components/study-nav';
import '../../student/assessment/studio.css';
import '../workbench.css';
import './imports.css';

const send = <T,>(path: string, body?: unknown) => apiRequest<T>(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
const stateNames: Record<string, string> = { queued: '等待处理', running: '正在处理', retry_wait: '等待重试', cancel_requested: '正在取消', cancelled: '已取消', succeeded: '已完成', failed: '处理失败', pending: '待处理', completed: '已完成' };
const stages: Record<string, string> = { starting: '准备资料', ocr: '识别扫描页', extracting: '提取页面', local_model: '本地模型处理', processed: '核对结果', completed: '处理完成' };
const taskNames: Record<string, string> = { 'question.pdf.import': 'PDF 题目导入', 'image.handwriting.preview': '手写擦除预览', 'question.local_explain': '本地辅助审阅' };
const errorNames: Record<string, string> = { processor_unavailable: '本地处理环境尚未配置', processor_dependency_missing: '本地处理组件缺失，请补齐运行环境后重试', model_assets_missing: '本地模型文件尚未就绪，请核对资产配置', worker_stopped: '工作进程已停止，任务会继续排队恢复', processor_timeout: '处理超时，可重试已保存的页面', encrypted_pdf: '文件受密码保护，请先提供可读取的副本', page_limit: '文件超过单次 500 页，请拆分后上传', author_permission_changed: '发起账号的内容权限已变化', candidate_changed: '候选题已被修改，请对最新版本重新发起', attempts_exhausted: '多次处理未完成，可查看原文件后手动重试', interrupted: '处理已中断', invalid_document_or_processor: '文件无法读取，或本地处理组件未就绪，请检查原文件与运行环境' };
const date = (s: string) => new Date(s).toLocaleString('zh-CN');
const url = (s: string) => `${apiBaseUrl}${s}`;
const reviewNames = { pending: '待核对', approved: '已确认候选', rejected: '已驳回' };
type TaskList = { rows: ProcessingTaskView[]; total: number; page: number; pageSize: number };
type CandidateList = { rows: QuestionImportRecord[]; total: number; page: number; pageSize: number };

export default function ImportWorkbench() {
  const [files, setFiles] = React.useState<ImportFile[]>([]), [jobs, setJobs] = React.useState<QuestionImportJob[]>([]), [tasks, setTasks] = React.useState<TaskList>({ rows: [], total: 0, page: 1, pageSize: 30 });
  const [selectedFiles, setSelectedFiles] = React.useState<string[]>([]), [subject, setSubject] = React.useState<Subject>('math'), [sourceClass, setSourceClass] = React.useState('C_PUBLIC_REFERENCE_ONLY'), [licenseName, setLicenseName] = React.useState('');
  const [jobId, setJobId] = React.useState(''), [candidates, setCandidates] = React.useState<CandidateList | null>(null), [page, setPage] = React.useState(1), [reviewState, setReviewState] = React.useState('pending');
  const [record, setRecord] = React.useState<QuestionImportRecord | null>(null), [stem, setStem] = React.useState(''), [excerpt, setExcerpt] = React.useState(''), [comment, setComment] = React.useState('');
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [loading, setLoading] = React.useState(true), [userId, setUserId] = React.useState('');
  const [uploadProgress, setUploadProgress] = React.useState<{ name: string; done: number; total: number } | null>(null), [taskPage, setTaskPage] = React.useState(1);
  const [history, setHistory] = React.useState<{ id: string; rows: Array<{ action: string; at: string; detail: Record<string, unknown> }> } | null>(null), [artifact, setArtifact] = React.useState<{ id: string; fileId: string } | null>(null);
  const [taskFilter, setTaskFilter] = React.useState(''), stopUpload = React.useRef<AbortController | null>(null);
  const candidateRequest = React.useRef(0);
  const listRequest = React.useRef(0);
  const [recordLoading, setRecordLoading] = React.useState(false);
  const selectedJob = jobs.find(j => j.id === jobId);

  const reload = React.useCallback(async () => {
    const [f, j, t] = await Promise.all([send<ImportFile[]>('/admin/import-files'), send<QuestionImportJob[]>('/admin/question-import-jobs'),
      send<TaskList>(`/admin/processing/tasks?page=${taskPage}${taskFilter ? `&state=${taskFilter}` : ''}`)]);
    setFiles(f); setJobs(j); setTasks(t);
  }, [taskPage, taskFilter]);
  const loadCandidates = React.useCallback(async () => {
    const requestId = ++listRequest.current;
    if (!jobId) { setCandidates(null); return; }
    const result = await send<CandidateList>(`/admin/question-import-jobs/${jobId}/candidates?page=${page}${reviewState ? `&state=${reviewState}` : ''}`);
    if (requestId === listRequest.current) setCandidates(result);
  }, [jobId, page, reviewState]);
  React.useEffect(() => {
    let active = true;
    send<{ id: string }>('/auth/me').then(u => { if (active) setUserId(u.id); }).catch(() => {});
    reload().catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  React.useEffect(() => { loadCandidates().catch(e => setError(e.message)); }, [loadCandidates]);
  React.useEffect(() => { ++candidateRequest.current; setRecord(null); setRecordLoading(false); }, [jobId]);
  React.useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !busy) void reload().then(loadCandidates).catch(() => {}); }, 3000);
    return () => window.clearInterval(timer);
  }, [reload, loadCandidates, busy]);
  React.useEffect(() => () => stopUpload.current?.abort(), []);

  async function act(fn: () => Promise<void>, success = '') {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await reload(); await loadCandidates(); if (success) setNotice(success); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function openRecord(item: QuestionImportRecord) {
    const requestId = ++candidateRequest.current;
    setRecordLoading(true); setRecord(null);
    try {
      const detail = await send<QuestionImportRecord>(`/admin/question-import-records/${encodeURIComponent(item.id)}`);
      if (candidateRequest.current !== requestId) return;
      setRecord(detail); setStem(detail.candidateStem); setExcerpt(detail.excerpt); setComment('');
    } catch (e) { if (candidateRequest.current === requestId) setError((e as Error).message); }
    finally { if (candidateRequest.current === requestId) setRecordLoading(false); }
  }
  async function upload(selected: File[]) {
    if (!userId || !selected.length) return;
    stopUpload.current = new AbortController(); const signal = stopUpload.current.signal;
    await act(async () => {
      for (const input of selected) {
        const type = input.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : /\.png$/i.test(input.name) ? 'image/png' : 'image/jpeg';
        const storageKey = `study-upload:${userId}:${input.name}:${input.size}:${input.lastModified}`;
        const requestKey = localStorage.getItem(storageKey) ?? crypto.randomUUID(); localStorage.setItem(storageKey, requestKey);
        let file = await send<ImportFile>('/admin/import-files', { name: input.name, size: input.size, mediaType: type, requestKey });
        setUploadProgress({ name: input.name, done: 0, total: input.size });
        for (let index = 0; index < Math.ceil(input.size / file.chunkSize); index++) {
          if (signal.aborted) throw new Error('上传已暂停。重新选择同一文件可继续上传。');
          const bytes = await input.slice(index * file.chunkSize, Math.min(input.size, (index + 1) * file.chunkSize)).arrayBuffer();
          const previous = file.chunks.find(c => c.index === index);
          if (previous) {
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
            if (previous.sha256 !== digest) { localStorage.removeItem(storageKey); throw new Error('所选文件与已上传分块不同。请再次选择，以新的上传记录开始。'); }
          } else file = await apiRequest<ImportFile>(`/admin/import-files/${file.id}/chunks/${index}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes, signal });
          setUploadProgress({ name: input.name, done: Math.min(input.size, (index + 1) * file.chunkSize), total: input.size });
        }
        file = await send<ImportFile>(`/admin/import-files/${file.id}/complete`, {});
        if (file.mediaType === 'application/pdf') setSelectedFiles(ids => [...new Set([...ids, file.id])]);
      }
      setUploadProgress(null);
    }, '文件已校验并保存，可以发起处理。');
    stopUpload.current = null;
  }
  async function createImport() {
    await act(async () => {
      const job = await send<QuestionImportJob>('/admin/question-import-jobs', { importType: 'textbook_pdf', subject, fileIds: selectedFiles, requestKey: crypto.randomUUID(),
        sourcePolicy: { sourceType: sourceClass === 'A_INTERNAL' ? 'internal_textbook' : sourceClass === 'B_OPEN' ? 'open_content' : sourceClass === 'D_COMMERCIAL_PARTNER' ? 'partner' : 'public_reference', licenseClass: sourceClass, licenseName: licenseName || null } });
      setJobId(job.id); setPage(1); setRecord(null);
    }, '导入任务已保存，页面可关闭，处理进度会保留。');
  }
  async function review(decision: 'approved' | 'rejected') {
    if (!record) return;
    await act(async () => {
      const result = await send<{ record: QuestionImportRecord }>(`/admin/question-import-records/${encodeURIComponent(record.id)}/review`, { decision, comment,
        expectedVersion: record.reviewVersion ?? 0, createDraft: decision === 'approved',
        ...(decision === 'approved' && !record.candidateQuestionId ? { correctedStem: stem, correctedExcerpt: excerpt } : {}) });
      await openRecord(result.record);
    }, decision === 'approved' ? '候选已确认，草稿已建立。来源、答案量规与知识映射仍需分别审核。' : '候选已驳回，原页及处理记录继续保留。');
  }

  return <div className="learning-studio"><StudyNav /><main className="admin-workbench import-workbench">
    <div className="admin-links"><Link href="/admin/curriculum">课程与知识图谱</Link><Link href="/admin/reviews">评分与反馈</Link><Link href="/admin/imports" aria-current="page">资料导入</Link><Link href="/admin/content">题目编辑</Link><Link href="/admin/accounts">账号权限</Link></div>
    <div className="import-heading"><div><span className="studio-kicker">内容生产 · 原页与证据</span><h1>把一页资料，变成可核对的题。</h1><p>上传保留原件，提取与识别生成候选。逐页确认内容后建立草稿，再核实来源、评分和知识点映射。</p></div><span className="import-stamp">原件保留<br />人工确认后入库</span></div>
    {error && <div className="studio-error" role="alert">{error}<button onClick={() => setError('')} aria-label="关闭错误提示">×</button></div>}
    {notice && <p className="studio-notice" role="status">{notice}</p>}
    {loading ? <p role="status">正在读取已保存的文件和任务…</p> : <>
      <section className="import-intake" aria-labelledby="intake-title"><div className="import-step">01</div><div><h2 id="intake-title">选择资料</h2><p>PDF 用于题目导入；PNG / JPEG 可生成手写擦除预览。单个文件最多 512 MB。上传暂停后，重新选择同一文件可续传。</p>
        <div className="import-upload"><label>上传文件<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" disabled={busy || !userId} onChange={e => { const chosen = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; void upload(chosen); }} /></label>
          {uploadProgress && <div role="status"><span>{uploadProgress.name} · {Math.round(uploadProgress.done / uploadProgress.total * 100)}%</span><progress value={uploadProgress.done} max={uploadProgress.total} aria-label="上传进度" />{busy && <button className="studio-button secondary" onClick={() => stopUpload.current?.abort()}>暂停上传</button>}</div>}</div>
        <div className="import-file-list">{files.length ? files.map(file => <div className="import-file" key={file.id}>
          {file.mediaType === 'application/pdf' && file.status === 'ready' ? <label className="import-file-choice"><input type="checkbox" checked={selectedFiles.includes(file.id)} disabled={busy} onChange={e => setSelectedFiles(ids => e.target.checked ? [...ids, file.id] : ids.filter(id => id !== file.id))} /><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB · 已校验 · 原件保留</small></span></label> : <span>{file.name}<small>{file.status === 'ready' ? '图片已保存' : `已上传 ${file.chunks.length} / ${Math.ceil(file.size / file.chunkSize)} 块，选择同一文件续传`}</small></span>}
          {file.status === 'ready' && <div className="import-file-actions"><a href={url(`/api/admin/import-files/${file.id}/content`)} target="_blank" rel="noreferrer">查看原件</a>{file.mediaType !== 'application/pdf' && <button disabled={busy} onClick={() => void act(async () => { await send('/admin/processing/handwriting-preview', { fileId: file.id, requestKey: crypto.randomUUID() }); }, '预览任务已保存，原图保留。请在下方查看处理结果。')}>生成擦除预览</button>}</div>}
        </div>) : <p>还没有上传资料。选好文件后，上传和处理状态会保存在这里。</p>}</div>
        <div className="admin-form"><label>导入学科<select value={subject} disabled={busy} onChange={e => setSubject(e.target.value as Subject)}><option value="math">数学</option><option value="chinese">语文</option><option value="english">英语</option></select></label><label>来源声明（发布前另行核实）<select value={sourceClass} disabled={busy} onChange={e => setSourceClass(e.target.value)}><option value="C_PUBLIC_REFERENCE_ONLY">公开参考资料，仅供研究</option><option value="A_INTERNAL">自有或内部授权资料</option><option value="B_OPEN">开放许可资料</option><option value="D_COMMERCIAL_PARTNER">合作授权资料</option></select></label><label className="wide">来源 / 许可名称<input value={licenseName} maxLength={200} placeholder="例如：原创练习或明确的开放许可名称" onChange={e => setLicenseName(e.target.value)} /></label></div>
        <button className="studio-button" disabled={busy || !selectedFiles.length || selectedFiles.length > 10} onClick={() => void createImport()}>导入 {selectedFiles.length || ''} 份 PDF</button><small className="import-caption">一次最多 10 份。来源声明不会自动授权发布。</small>
      </div></section>

      <section className="import-section" aria-labelledby="task-title"><div className="import-section-title"><div><span className="studio-kicker">02 · 任务进度</span><h2 id="task-title">离开页面，工作仍会继续。</h2></div><label>任务状态<select value={taskFilter} onChange={e => { setTaskFilter(e.target.value); setTaskPage(1); }}><option value="">全部状态</option>{Object.entries(stateNames).filter(([k]) => !['pending', 'completed'].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
        <div className="import-tasks">{tasks.rows.length ? tasks.rows.map(task => <article key={task.id}><div><strong>{taskNames[task.kind] ?? '资料处理'}</strong><span className={`import-state state-${task.state}`}>{stateNames[task.state]}</span></div><p>{stages[String(task.progress.stage)] ?? '任务已保存'}{task.progress.page ? ` · 第 ${task.progress.page} / ${task.progress.pages} 页` : ''}{task.progress.resumedPage ? ' · 已恢复保存的页面' : ''}</p><small>{date(task.createdAt)} · 本轮第 {task.attempts} / {task.maxAttempts} 次处理{task.generation > 1 ? ` · 手动重试 ${task.generation - 1} 次` : ''}</small>
          {task.errorCode && <p className="import-warning">{errorNames[task.errorCode] ?? '处理未完成，请检查原件后重试。'}</p>}
          <div className="import-task-actions">{['queued', 'running', 'retry_wait'].includes(task.state) && <button disabled={busy} onClick={() => void act(async () => { await send(`/admin/processing/tasks/${task.id}/cancel`, { expectedVersion: task.version }); }, '取消请求已保存。取消的任务不会发布新的候选。')}>取消处理</button>}{['failed', 'cancelled'].includes(task.state) && <button disabled={busy} onClick={() => void act(async () => { await send(`/admin/processing/tasks/${task.id}/retry`, { expectedVersion: task.version }); }, '任务已重新排队，已校验的页面会被复用。')}>重试</button>}
            {typeof task.result?.jobId === 'string' && <button onClick={() => { setJobId(String(task.result!.jobId)); setPage(1); setReviewState('pending'); setRecord(null); document.getElementById('candidate-title')?.scrollIntoView({ behavior: 'smooth' }); }}>核对候选</button>}
            {typeof task.result?.artifactId === 'string' && <button onClick={() => setArtifact({ id: String(task.result!.artifactId), fileId: String(task.result!.fileId) })}>对照预览</button>}
            <button onClick={() => void act(async () => { setHistory({ id: task.id, rows: await send(`/admin/processing/tasks/${task.id}/history`) }); })}>处理记录</button>
          </div></article>) : <p>当前没有此状态的任务。上传文件后可以发起导入或预览。</p>}</div>
        {tasks.total > 30 && <div className="import-pagination"><button disabled={taskPage <= 1} onClick={() => setTaskPage(n => n - 1)}>上一页任务</button><span>{taskPage} / {Math.ceil(tasks.total / 30)}</span><button disabled={taskPage * 30 >= tasks.total} onClick={() => setTaskPage(n => n + 1)}>下一页任务</button></div>}
        {history && <details open className="import-history"><summary>处理历史<button onClick={() => setHistory(null)}>收起</button></summary>{history.rows.map((row, i) => <p key={i}>{date(row.at)} · {{ requested: '任务已保存', claimed: '开始一次处理', succeeded: '结果已发布', cancel_requested: '请求取消', cancelled: '已停止处理', retried: '手动重试', attempt_failed: '本次处理未完成' }[row.action] ?? row.action}{row.detail.code ? ` · ${errorNames[String(row.detail.code)] ?? '处理未完成'}` : ''}</p>)}</details>}
        {artifact && <section className="import-comparison"><div><h3>原图</h3><img src={url(`/api/admin/import-files/${artifact.fileId}/content`)} alt="保留的上传原图" /></div><div><h3>本地模型预览</h3><img src={url(`/api/admin/processing/artifacts/${artifact.id}`)} alt="待人工确认的手写擦除结果" /><p>请逐处核对是否误删印刷文字、公式或图形。此预览不会替换原图，也未被自动确认正确。</p><button onClick={() => setArtifact(null)}>关闭对照</button></div></section>}
      </section>

      <section className="import-section" aria-labelledby="candidate-title"><span className="studio-kicker">03 · 内容核对</span><h2 id="candidate-title">让每个候选都有原页可查。</h2><div className="admin-toolbar"><label>导入批次<select value={jobId} onChange={e => { setJobId(e.target.value); setPage(1); setRecord(null); }}><option value="">选择一条导入</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.sourcePathOrUrl} · {stateNames[j.status]} · {j.recordCount} 候选</option>)}</select></label><label>审核状态<select value={reviewState} onChange={e => { setReviewState(e.target.value); setPage(1); }}><option value="pending">待核对</option><option value="approved">已确认候选</option><option value="rejected">已驳回</option><option value="">全部</option></select></label><button disabled={busy} onClick={() => void act(loadCandidates)}>刷新</button></div>
        {selectedJob && <p>{selectedJob.fileCount} 份文件 · {selectedJob.recordCount} 个候选 · {stateNames[selectedJob.status]}。拆题结果需对照原页确认，整页候选不代表题目已完整拆分。</p>}
        <div className="import-review-layout"><div className="import-candidates">{candidates?.rows.length ? candidates.rows.map(item => <button key={item.id} aria-pressed={record?.id === item.id} onClick={() => openRecord(item)}><small>{item.sourceName} · 第 {item.pageNumber} 页 / 候选 {item.candidateIndexOnPage}</small><strong>{item.candidateStem}</strong><span>{reviewNames[item.reviewStatus]} · {item.extractionMethod === 'ocr' ? '扫描识别' : item.extractionMethod === 'unreadable' ? '待人工录入' : '文字提取'} · {item.splitMode === 'page' ? '整页候选' : '拆题候选'}</span></button>) : <p>{jobId ? '此筛选下暂无候选。处理中的文件可稍后刷新，已完成批次可切换审核状态。' : '选择已处理的导入批次，查看候选与原页。'}</p>}
          {candidates && candidates.total > 20 && <div className="import-pagination"><button disabled={page <= 1} onClick={() => setPage(n => n - 1)}>上一页</button><span>{page} / {Math.ceil(candidates.total / 20)}</span><button disabled={page * 20 >= candidates.total} onClick={() => setPage(n => n + 1)}>下一页</button></div>}</div>
          {recordLoading && <p role="status">正在读取候选与原页证据…</p>}
          {record && <article className="admin-editor import-review"><div className="import-section-title"><h3>第 {record.pageNumber} 页 · 候选 {record.candidateIndexOnPage}</h3><span>{reviewNames[record.reviewStatus]} / v{record.reviewVersion ?? 0}</span></div>
            {record.pageEvidence && <><a href={url(record.pageEvidence.imageUrl)} target="_blank" rel="noreferrer"><img className="import-original-page" src={url(record.pageEvidence.imageUrl)} alt={`${record.sourceName}第${record.pageNumber}页，点击打开完整原页`} /></a><p>{record.extractionMethod === 'ocr' ? 'OCR 识别仅作候选依据，文字、公式和配图需要逐项核对。' : '原页图与提取文字并列保留，请核对题目是否被完整拆分。'}</p><details><summary>识别证据与页内位置</summary><p>坐标空间：{record.pageEvidence.boxSpace === 'pdf_points' ? 'PDF 页面点坐标' : '原页预览像素'}。置信度只描述识别输出，不代表题目正确性。</p>{record.pageEvidence.lines.map((line, i) => <div className="import-line" key={i}><span>{line.text}</span><small>{line.confidence === null ? '原生文字' : `识别置信度 ${Math.round(line.confidence * 100)}%`}{line.box ? ` · ${line.box.map(p => p.map(n => Math.round(n)).join(',')).join(' / ')}` : ''}</small></div>)}</details></>}
            <label>确认后的题干<textarea rows={3} value={stem} maxLength={4000} readOnly={!!record.candidateQuestionId} onChange={e => setStem(e.target.value)} /></label><label>题目上下文 / 文字内容<textarea rows={7} value={excerpt} maxLength={16000} readOnly={!!record.candidateQuestionId} onChange={e => setExcerpt(e.target.value)} /></label>
            {record.aiSuggestion && <aside className="import-model-note"><h3>辅助审阅建议 · 待核实</h3><p>{record.aiSuggestion.reviewAdvice}</p><small>本地模型输出不会替代评分、知识映射或来源审核。</small></aside>}
            <button disabled={busy} onClick={() => void act(async () => { await send('/admin/processing/local-explain', { recordId: record.id, requestKey: crypto.randomUUID() }); }, '本地审阅任务已保存。完成后重新打开候选查看建议。')}>请求本地辅助审阅</button>
            <label>本次审核依据<textarea rows={3} value={comment} minLength={5} maxLength={3000} placeholder="写明对照原页核对了哪些文字、公式、图形或拆题边界。" onChange={e => setComment(e.target.value)} /></label><div className="import-review-actions"><button className="studio-button" disabled={busy || comment.trim().length < 5 || stem.trim().length < 3 || excerpt.trim().length < 3} onClick={() => void review('approved')}>{record.candidateQuestionId ? '确认核对意见' : '确认候选并生成草稿'}</button><button className="studio-button secondary" disabled={busy || comment.trim().length < 5} onClick={() => void review('rejected')}>驳回候选</button></div>
            {record.candidateQuestionId && <p><Link href="/admin/content">进入题目编辑器</Link>，查找草稿编号 <code>{record.candidateQuestionId}</code>。补齐答案、量规和媒体，核实来源后再发布；知识点评测还需审核知识映射。</p>}
            {!!record.reviewHistory?.length && <details><summary>候选审核历史</summary>{record.reviewHistory.map(h => <p key={h.version}>v{h.version} · {date(h.at)} · {reviewNames[h.decision]}<br />{h.comment}</p>)}</details>}
          </article>}
        </div>
      </section>
    </>}
  </main></div>;
}
