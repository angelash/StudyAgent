'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { DiagnosticBlueprintView, DiagnosticHypothesis, MasteryEstimate, NotebookMetadata, QuestionRenderPayload, Subject } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import { Practice, subjectNames } from '../lib/learning';
import { QuestionFaceView } from './question-face-view';
import { AnswerEvidenceView } from './answer-evidence-view';
import { EvidenceFeedbackForm } from './evidence-feedback';
import './mistake-notebook.css';

type Card = {
  id: string | null; kind: 'diagnostic' | 'practice'; responseId: string; questionId: string; atomId: string; atomName: string;
  stem: string; at: string; status: string; correct: boolean | null; score: number | null; originalScore: number | null;
  version: number; metadata: NotebookMetadata; sourceName: string; redoCount: number; verificationCount: number;
  hintLevel: number; priorExposure: boolean; attemptNumber: number;
  paper: { id: string; title: string; position: number; published: boolean } | null;
};
type Detail = Card & {
  reason: string; answer: unknown; referenceAnswer: unknown; analysis: string; payload: QuestionRenderPayload | null;
  hypotheses: DiagnosticHypothesis[];
  history: Array<{ version: number; at: string; action: string; reason: string }>;
  redos: Array<{ id: string; createdAt: string; completedAt: string | null; status: string; summary: Practice['summary'] }>;
  verifications: Array<{ blueprintId: string; canResumePreview: boolean; sessionId: string | null; status: string; createdAt: string;
    report: { rawScore: number | null; scoredCount: number; pendingReviewCount: number; estimates: MasteryEstimate[] } | null }>;
};
type Listing = { items: Card[]; total: number; page: number; pageSize: number; tags: string[]; atoms: Array<{ id: string; name: string; count: number; open: number; pending: number; removed: number }>;
  counts: { active: number; removed: number; pendingScoring: number }; notice: string };
const read = <T,>(path: string) => apiRequest<T>(path);
const post = <T,>(path: string, body: unknown) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
const keyOf = (row: Pick<Card, 'kind' | 'responseId'>) => `${row.kind}:${row.responseId}`;
const date = (value: string) => new Date(value).toLocaleString('zh-CN');
const status = (row: Card) => row.status === 'pending_review' ? '表达待核查' : row.correct ? '已重评为正确' : row.score !== null && row.score > 0 ? '部分做到，继续回看' : '一起看看卡在哪里';

export function MistakeNotebook({ studentId, subject, onPractice }: { studentId: string; subject: Subject; onPractice: (practice: Practice) => void }) {
  const base = `/learning/students/${encodeURIComponent(studentId)}/notebook`;
  const [list, setList] = React.useState<Listing | null>(null), [loading, setLoading] = React.useState(true), [error, setError] = React.useState('');
  const [filters, setFilters] = React.useState({ q: '', atomId: '', tag: '', favorite: '', state: 'active', reviewState: '' });
  const [query, setQuery] = React.useState(filters), [page, setPage] = React.useState(1), [revision, setRevision] = React.useState(0);
  const [detail, setDetail] = React.useState<Detail | null>(null), [opening, setOpening] = React.useState(''), [busy, setBusy] = React.useState(false);
  const [metadata, setMetadata] = React.useState<NotebookMetadata | null>(null), [tags, setTags] = React.useState(''), [steps, setSteps] = React.useState('');
  const [notice, setNotice] = React.useState(''), [selected, setSelected] = React.useState<Record<string, Card>>({});
  const [printRows, setPrintRows] = React.useState<Detail[] | null>(null), [printAnswers, setPrintAnswers] = React.useState(false), [printReady, setPrintReady] = React.useState(false);
  const pending = React.useRef<{ signature: string; key: string }>({ signature: '', key: '' });
  const detailRef = React.useRef<HTMLDivElement>(null), listRef = React.useRef<HTMLDivElement>(null);
  const generation = React.useRef(0);
  React.useEffect(() => () => { generation.current++; }, []);
  React.useEffect(() => {
    let alive = true; setLoading(true); setError('');
    const parameters = new URLSearchParams({ subject, page: String(page), pageSize: '12' });
    for (const [key, value] of Object.entries(query)) if (value) parameters.set(key, value);
    read<Listing>(`${base}?${parameters}`).then(next => { if (alive) setList(next); })
      .catch(caught => { if (alive) setError(caught instanceof Error ? caught.message : '错题本暂时未能打开'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [base, subject, query, page, revision]);
  React.useEffect(() => { if (detail) detailRef.current?.focus(); }, [detail?.responseId]);
  React.useEffect(() => {
    if (!printRows) return;
    const sheet = document.querySelector('.notebook-print-sheet'); if (!sheet) return;
    let alive = true;
    const verify = () => { if (alive) setPrintReady([...sheet.querySelectorAll<HTMLImageElement>('img')].every(img => img.complete && img.naturalWidth > 0) && !sheet.querySelector('[data-student-media-state]:not([data-student-media-state="ready"])')); };
    const observer = new MutationObserver(verify); observer.observe(sheet, { attributes: true, childList: true, subtree: true });
    sheet.addEventListener('load', verify, true); sheet.addEventListener('error', verify, true); verify();
    Promise.all([...sheet.querySelectorAll<HTMLImageElement>('img')].map(img => img.decode().catch(() => undefined))).then(verify);
    return () => { alive = false; observer.disconnect(); sheet.removeEventListener('load', verify, true); sheet.removeEventListener('error', verify, true); };
  }, [printRows, printAnswers]);
  function install(next: Detail) { setDetail(next); setMetadata(structuredClone(next.metadata)); setTags(next.metadata.tags.join('、')); setSteps(next.metadata.errorSteps.join('\n')); }
  async function open(row: Card) {
    if (busy || opening) return; setOpening(keyOf(row)); setError(''); const current = generation.current;
    try { const next = await read<Detail>(`${base}/${row.kind}/${encodeURIComponent(row.responseId)}`); if (current === generation.current) { install(next); setNotice(''); } }
    catch (caught) { if (current === generation.current) setError(caught instanceof Error ? caught.message : '未能打开这道题'); }
    finally { if (current === generation.current) setOpening(''); }
  }
  async function mutate(action: 'organize' | 'redo' | 'verification', nextMetadata?: NotebookMetadata) {
    if (!detail || busy) return;
    const body = { expectedVersion: detail.version, reason: action === 'organize' ? '回看原始思路后保存本次错题整理。' : action === 'redo' ? '回想卡住的步骤并重新解释原题；另用新题核查掌握。' : '使用当前范围内的未见新题核查这一步及必要先修。',
      ...(nextMetadata ? { metadata: nextMetadata } : {}) };
    const signature = JSON.stringify([keyOf(detail), action, body]);
    if (pending.current.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError(''); setNotice(''); const current = generation.current;
    try {
      const path = `${base}/${detail.kind}/${encodeURIComponent(detail.responseId)}/${action}`, command = { ...body, requestKey: pending.current.key };
      if (action === 'organize') {
        const next = await post<Detail>(path, command); if (current !== generation.current) return;
        install(next); setNotice('整理已保存，原始作答和评分仍完整保留。'); setRevision(value => value + 1);
        if (selected[keyOf(next)]) setSelected(previous => ({ ...previous, [keyOf(next)]: next }));
      } else if (action === 'redo') { const next = await post<Practice>(path, command); if (current === generation.current) onPractice(next); }
      else { const next = await post<DiagnosticBlueprintView>(path, command); if (current === generation.current) window.location.href = `/student/assessment?studentId=${encodeURIComponent(studentId)}&subject=${subject}&blueprint=${encodeURIComponent(next.id)}`; }
      pending.current = { signature: '', key: '' };
    } catch (caught) { if (current === generation.current) setError(caught instanceof Error ? caught.message : '保存未完成，请重试；已有回执会自动恢复'); }
    finally { if (current === generation.current) setBusy(false); }
  }
  function close() { setDetail(null); setMetadata(null); setNotice(''); setRevision(value => value + 1); requestAnimationFrame(() => listRef.current?.focus()); }
  async function preparePrint() {
    if (busy || !Object.keys(selected).length) return; setBusy(true); setError(''); setPrintReady(false); const current = generation.current;
    try { const rows = await Promise.all(Object.values(selected).map(row => read<Detail>(`${base}/${row.kind}/${encodeURIComponent(row.responseId)}`)));
      if (current === generation.current) { setPrintRows(rows); requestAnimationFrame(() => document.querySelector('.notebook-print-root')?.scrollIntoView({ behavior: 'instant' })); } }
    catch (caught) { if (current === generation.current) setError(caught instanceof Error ? caught.message : '打印稿准备失败'); }
    finally { if (current === generation.current) setBusy(false); }
  }
  const selectedCount = Object.keys(selected).length;
  const dirty = detail && metadata ? JSON.stringify({ ...metadata, tags: tags.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean), errorSteps: steps.split('\n').map(step => step.trim()).filter(Boolean) }) !== JSON.stringify(detail.metadata) : false;
  return <div className="mistake-notebook" ref={listRef} tabIndex={-1} aria-label="错题与思路笔记本">
    <div className="notebook-intro"><span className="studio-eyebrow">MISTAKES & REFLECTION / 把卡点变成下一步</span><h3>留住思路，慢慢解开。</h3><p>{list?.notice ?? '回看当时的想法，记录卡住的一步，再用新题验证。'}</p></div>
    {error && <p className="studio-error" role="alert">{error}<button disabled={busy || !!opening} onClick={() => { setError(''); if (detail) void open(detail); else setRevision(value => value + 1); }}>重新读取记录</button></p>}
    {notice && <p className="studio-notice" role="status">{notice}</p>}
    {detail && metadata ? <section className="notebook-detail" ref={detailRef} tabIndex={-1} aria-label={`回看：${detail.atomName}`}>
      <div className="notebook-detail-head"><button className="studio-text-button" disabled={busy || !!dirty} onClick={close}>← 返回错题本</button><span className="studio-badge">{status(detail)}</span></div>
      <h3>{detail.atomName}</h3><p className="studio-muted">{detail.kind === 'diagnostic' ? '评测记录' : '指导练习'} · {date(detail.at)} · {detail.sourceName}</p><p className="studio-muted">第 {detail.attemptNumber} 次作答 · {detail.hintLevel ? `使用了 ${detail.hintLevel} 级提示` : '本次未使用提示'}{detail.priorExposure && ' · 此题曾经见过或已提供参考思路'}</p>
      {detail.paper && <p className="notebook-source">来自《{detail.paper.title}》第 {detail.paper.position} 题{detail.paper.published && <> · <Link href={`/library?paper=${encodeURIComponent(detail.paper.id)}`}>回看原卷 ↗</Link></>}</p>}
      <QuestionFace row={detail} />
      <div className="notebook-evidence"><div><h4>当时留下的回答</h4><AnswerEvidenceView answer={detail.answer} schema={detail.payload?.answerSchema} /><p>{detail.reason}</p>{detail.originalScore !== detail.score && <p className="studio-muted">评分经过复核，原始表现和修改依据均保留。</p>}</div>
        <details><summary>参考思路与订正线索</summary><AnswerEvidenceView answer={detail.referenceAnswer} schema={detail.payload?.answerSchema} /><p>{detail.analysis}</p></details></div>
      <EvidenceFeedbackForm kind={detail.kind} responseId={detail.responseId} />
      {detail.hypotheses.length > 0 && <aside className="studio-hint"><h4>仍需验证的解释</h4><p>这些解释来自同一知识定义下的学习证据；一道原题的对错不能单独确定深层原因。</p>{detail.hypotheses.map(hypothesis => <details key={hypothesis.id}><summary>{hypothesis.title}</summary><p>观察到的表现：{hypothesis.observation}</p><p>{hypothesis.explanation}</p><p>还可能是：{hypothesis.alternatives.join('；')}</p><p>下一步：{hypothesis.nextAction}</p><small>支持记录 {hypothesis.supportingEvidenceIds.length} 条 · 反向证据 {hypothesis.counterEvidenceIds.length} 条</small></details>)}</aside>}
      <form className="notebook-notes" onSubmit={event => { event.preventDefault(); const next = { ...metadata, tags: tags.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean), errorSteps: steps.split('\n').map(step => step.trim()).filter(Boolean) }; void mutate('organize', next); }}>
        <div className="notebook-note-title"><h4>给这一步写一张便签</h4><label className="notebook-check"><input type="checkbox" checked={metadata.favorite} disabled={busy} onChange={event => setMetadata({ ...metadata, favorite: event.target.checked })} />收藏重点</label></div>
        <label>我卡在哪几步<textarea value={steps} disabled={busy} onChange={event => setSteps(event.target.value)} rows={3} maxLength={4800} placeholder="每行记一步。例如：把条件和要求对应起来时，还不能说明为什么这样列式。" /></label>
        <label>现在的解释与下次核对方法<textarea value={metadata.reflection} disabled={busy} onChange={event => setMetadata({ ...metadata, reflection: event.target.value })} rows={4} maxLength={3000} placeholder="当时怎么想？现在怎样解释？还需要用什么表现来验证？" /></label>
        <label>标签 <small>用顿号或逗号分开，每个最多30字，最多12个</small><input value={tags} disabled={busy} onChange={event => setTags(event.target.value)} maxLength={380} placeholder="例如：条件对应、需要再讲一次" /></label>
        <label className="notebook-check"><input type="checkbox" disabled={busy} checked={metadata.reviewState === 'reviewed'} onChange={event => setMetadata({ ...metadata, reviewState: event.target.checked ? 'reviewed' : 'open' })} />这次已回看并整理思路 <small>掌握情况仍等新题验证</small></label>
        <div className="notebook-actions"><button className="studio-primary" disabled={busy || !dirty}>{busy ? '正在保存…' : '保存这张便签'}</button>{dirty && <button type="button" className="studio-text-button" disabled={busy} onClick={() => install(detail)}>撤销本次编辑</button>}<button type="button" className="studio-text-button" disabled={busy || !!dirty} onClick={() => mutate('organize', { ...metadata, removed: !metadata.removed })}>{metadata.removed ? '恢复到错题本' : '移到已移除'}</button></div>
        {dirty && <p className="studio-muted">便签有未保存内容，请先保存，再开始复做或新题核查。</p>}
      </form>
      <div className="notebook-next"><div><span className="studio-eyebrow">NEXT STEP / 分清订正和验证</span><h4>先讲清原题，再看看新题。</h4><p>原题复做用于整理思路。之后的未见新题和间隔复测，才帮助判断理解是否稳定。</p></div><div className="notebook-actions"><button className="studio-secondary" disabled={busy || dirty || metadata.removed || !detail.payload} onClick={() => mutate('redo')}>原题复做 →</button><button className="studio-primary" disabled={busy || dirty || metadata.removed} onClick={() => mutate('verification')}>查看新题核查组 ↗</button></div></div>
      {(detail.redos.length > 0 || detail.verifications.length > 0) && <section className="notebook-history"><h4>这一步，后来怎样了</h4>{detail.redos.map(row => <div key={row.id}><div><strong>原题复做 · {row.status === 'completed' ? '已结束' : '进行中'}</strong><p>{date(row.createdAt)} · 已作答 {row.summary.answered} 道{row.summary.pendingReview > 0 && ` · ${row.summary.pendingReview} 道待复核`}</p><small>原题表现不用于增加独立掌握样本。</small></div><Link className="studio-text-button" href={`/student/today?studentId=${encodeURIComponent(studentId)}&subject=${subject}&practice=${encodeURIComponent(row.id)}`}>{row.status === 'completed' ? '回看订正' : '继续复做'} →</Link></div>)}
        {detail.verifications.map(row => <div key={row.blueprintId}><div><strong>新题核查 · {({ preview: '等待开始', in_progress: '进行中', paused: '休息中', completed: '已结束', aborted: '提前结束' } as Record<string, string>)[row.status] ?? row.status}</strong><p>{date(row.createdAt)}{row.report && ` · 已评分 ${row.report.scoredCount} 道 · 待评分 ${row.report.pendingReviewCount} 道`}</p><small>{row.report ? '打开报告核对知识点证据、区间与仍待验证的解释。' : '确认范围与题量后再开始，未作答内容保持未知。'}</small></div>{(row.sessionId || row.canResumePreview) && <Link className="studio-text-button" href={`/student/assessment?studentId=${encodeURIComponent(studentId)}&subject=${subject}&${row.sessionId ? `session=${encodeURIComponent(row.sessionId)}` : `blueprint=${encodeURIComponent(row.blueprintId)}`}`}>{row.sessionId ? '查看记录' : '查看题组'} ↗</Link>}</div>)}</section>}
      {detail.history.length > 0 && <details className="notebook-audit"><summary>查看整理记录（{detail.history.length}）</summary><ol>{[...detail.history].reverse().map(row => <li key={row.version}>{date(row.at)} · {({ organized: '保存整理', redo_started: '打开原题复做', verification_previewed: '准备新题核查' } as Record<string, string>)[row.action]}<p>{row.reason}</p></li>)}</ol></details>}
    </section> : <>
      <form className="notebook-filters" onSubmit={event => { event.preventDefault(); setQuery({ ...filters }); setPage(1); }}>
        <label className="notebook-search">查找题目或思路<input value={filters.q} maxLength={100} onChange={event => setFilters({ ...filters, q: event.target.value })} placeholder="知识点、题干、笔记" /></label>
        <label>知识点<select value={filters.atomId} onChange={event => setFilters({ ...filters, atomId: event.target.value })}><option value="">全部知识点</option>{list?.atoms.map(atom => <option key={atom.id} value={atom.id}>{atom.name}</option>)}</select></label>
        <label>标签<select value={filters.tag} onChange={event => setFilters({ ...filters, tag: event.target.value })}><option value="">全部标签</option>{list?.tags.map(tag => <option key={tag}>{tag}</option>)}</select></label>
        <label>收藏<select value={filters.favorite} onChange={event => setFilters({ ...filters, favorite: event.target.value })}><option value="">全部记录</option><option value="true">只看收藏</option></select></label>
        <label>整理状态<select value={filters.reviewState} onChange={event => setFilters({ ...filters, reviewState: event.target.value })}><option value="">全部进度</option><option value="open">待回看</option><option value="reviewed">已整理</option></select></label>
        <label>收纳位置<select value={filters.state} onChange={event => setFilters({ ...filters, state: event.target.value })}><option value="active">错题本</option><option value="removed">已移除，可恢复</option><option value="all">全部位置</option></select></label>
        <button className="studio-primary" disabled={loading || busy}>查找</button><button type="button" className="studio-text-button" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}>刷新评分</button>
      </form>
      {!!list?.atoms.length && <details className="notebook-atom-groups"><summary>按知识点回看 · {list.atoms.length} 个点</summary><div>{list.atoms.map(atom => <button key={atom.id} aria-pressed={query.atomId === atom.id} onClick={() => { const next = { ...query, atomId: query.atomId === atom.id ? '' : atom.id }; setFilters(next); setQuery(next); setPage(1); }}><strong>{atom.name}</strong><small>{atom.count} 条 · 待回看 {atom.open} 条{atom.pending > 0 && ` · 待核查 ${atom.pending} 条`}{atom.removed > 0 && ` · 已移除 ${atom.removed} 条`}</small></button>)}</div></details>}
      <div className="notebook-list-head"><p role="status">{list ? `错题本 ${list.counts.active} 条 · 表达待核查 ${list.counts.pendingScoring} 条 · 已移除 ${list.counts.removed} 条` : '正在取回记录…'}</p><span>已选 {selectedCount} / 40 条</span></div>
      <div className="notebook-cards" aria-busy={loading}>
        {loading ? <p className="studio-empty" role="status">正在查找这一步的记录…</p> : !list?.items.length ? <div className="studio-empty"><h4>这里暂时没有记录</h4><p>{list?.counts.removed ? '可以调整筛选，或到“已移除”中恢复记录。' : '结束评测或完成练习后，需要回看与待核查的表现会保存在这里。'}</p></div> : list.items.map(row => <article key={keyOf(row)} data-pending={row.status === 'pending_review'}>
          <label className="notebook-selection"><input type="checkbox" aria-label={`选择打印：${row.atomName}，${row.stem.slice(0, 40)}`} checked={!!selected[keyOf(row)]} disabled={!selected[keyOf(row)] && selectedCount >= 40} onChange={event => setSelected(previous => { const next = { ...previous }; if (event.target.checked) next[keyOf(row)] = row; else delete next[keyOf(row)]; return next; })} /></label>
          <div><div className="notebook-card-label"><span>{row.metadata.favorite && <span aria-label="已收藏">★ </span>}{row.atomName}</span><small>{row.metadata.removed ? '已移除' : row.metadata.reviewState === 'reviewed' ? '已整理' : '待回看'}</small></div><p className="notebook-stem">{row.stem}</p><p className="notebook-card-status">{status(row)}</p><div className="notebook-tags">{row.metadata.tags.map(tag => <span key={tag}>{tag}</span>)}</div><small>{row.kind === 'diagnostic' ? '评测' : '练习'} · {new Date(row.at).toLocaleDateString('zh-CN')} · 复做 {row.redoCount} 次 · 新题核查 {row.verificationCount} 组</small></div>
          <button className="studio-text-button" disabled={busy || !!opening} onClick={() => open(row)}>{opening === keyOf(row) ? '正在打开…' : '回看这一步 →'}</button>
        </article>)}
      </div>
      {list && list.total > 0 && <nav className="notebook-pagination" aria-label="错题本翻页"><button className="studio-secondary" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} / {Math.max(1, Math.ceil(list.total / list.pageSize))} 页 · 共 {list.total} 条</span><button className="studio-secondary" disabled={loading || page * list.pageSize >= list.total} onClick={() => setPage(value => value + 1)}>下一页</button></nav>}
      <div className="notebook-print-controls"><div><strong>把思路带到纸上</strong><p>跨页选择题目，准备完整打印稿，可在打印窗口存为 PDF。</p></div><label className="notebook-check"><input type="checkbox" checked={printAnswers} onChange={event => setPrintAnswers(event.target.checked)} />附上原回答、便签和参考思路</label><div className="notebook-actions"><button className="studio-secondary" disabled={busy || !selectedCount} onClick={() => setSelected({})}>清空所选</button><button className="studio-primary" disabled={busy || !selectedCount} onClick={preparePrint}>{busy ? '正在准备…' : `准备 ${selectedCount || ''} 道打印稿`}</button></div></div>
    </>}
    {printRows && createPortal(<div className="notebook-print-root"><div className="notebook-print-toolbar"><strong>打印稿已准备 · {printRows.length} 道</strong><p>{printReady ? '题面图片已加载。音频和视频请在应用内播放；纸上保留题目说明。' : '正在加载图片。若图片未能打开，请返回应用重试。'}</p><label><input type="checkbox" checked={printAnswers} onChange={event => setPrintAnswers(event.target.checked)} />附上订正资料</label><button disabled={!printReady} onClick={() => window.print()}>打印 / 存为 PDF</button><button onClick={() => setPrintRows(null)}>收起打印稿</button></div><div className="notebook-print-sheet"><header><span>STUDY / 思路笔记</span><h1>{subjectNames[subject]} · 这一步，我再想一想</h1><p>{new Date().toLocaleDateString('zh-CN')} · 原题订正用于回看思路，掌握情况需要另用新题验证。</p></header>{printRows.map((row, index) => <article key={keyOf(row)}><h2>{index + 1}. {row.atomName}</h2><QuestionFace row={row} />{printAnswers ? <><h3>当时的回答</h3><AnswerEvidenceView answer={row.answer} schema={row.payload?.answerSchema} /><p>{row.reason}</p><h3>参考思路</h3><AnswerEvidenceView answer={row.referenceAnswer} schema={row.payload?.answerSchema} /><p>{row.analysis}</p><h3>我的便签</h3><p>{row.metadata.errorSteps.join('\n') || '尚未记录卡住的步骤'}</p><p>{row.metadata.reflection || '尚未记录新的解释'}</p></> : <div className="notebook-writing-lines"><p>我的思路与核对方法：</p></div>}</article>)}</div></div>, document.body)}
  </div>;
}

function QuestionFace({ row }: { row: Detail }) {
  return <QuestionFaceView payload={row.payload} stem={row.stem} />;
}
