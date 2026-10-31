'use client';

import * as React from 'react';
import type { TextbookLessonSource } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../../../lib/api';
import './lesson-source-panel.css';

export function TextbookLessonSourcePanel({ bookId, bookVersion, sourceSha256, lessonId, lessonName, range, actorId, onPage, onDenied }: {
  bookId: string; bookVersion: string; sourceSha256: string; lessonId: string; lessonName: string;
  range?: { start: number; end: number }; actorId: string; onPage: (page: number) => void; onDenied: () => void;
}) {
  const [source, setSource] = React.useState<TextbookLessonSource | null>(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const request = React.useRef<{ generation: number; controller: AbortController | null }>({ generation: 0, controller: null }), label = React.useId();
  React.useEffect(() => {
    let alive = true; const controller = new AbortController();
    const identity = async () => {
      try {
        const actor = await apiRequest<{ id: string; role: string }>('/auth/me', { signal: controller.signal });
        if (alive && (actor.id !== actorId || !['admin', 'teacher'].includes(actor.role))) onDenied();
      } catch (error) { if (alive && error instanceof ApiRequestError && [401, 403].includes(error.status)) onDenied(); }
    };
    const visible = () => { if (document.visibilityState === 'visible') void identity(); };
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { alive = false; controller.abort(); request.current.generation++; request.current.controller?.abort(); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [actorId, onDenied]);

  async function read(page = range?.start) {
    if (page === undefined || !range) return;
    request.current.controller?.abort(); const generation = ++request.current.generation, controller = new AbortController(); request.current.controller = controller;
    setSource(null); setBusy(true); setError('');
    try {
      const result = await apiRequest<TextbookLessonSource>(`/admin/curriculum/textbooks/${encodeURIComponent(bookId)}/lessons/${encodeURIComponent(lessonId)}/source?page=${page}`,
        { signal: controller.signal, headers: { 'x-study-actor': actorId } });
      if (controller.signal.aborted || generation !== request.current.generation) return;
      if (result.bookId !== bookId || result.bookVersion !== bookVersion || result.lessonId !== lessonId || result.page !== page || result.sourceSha256 !== sourceSha256 ||
        result.pageRange.start !== range.start || result.pageRange.end !== range.end || typeof result.text !== 'string' || result.locatorStatus !== 'candidate_needs_review' || result.contentReview !== 'not_reviewed')
        throw Error('来源身份与当前课时不一致，请刷新教材后重试。');
      setSource(result); onPage(result.page);
    } catch (error) {
      if (controller.signal.aborted || generation !== request.current.generation) return;
      if (error instanceof ApiRequestError && [401, 403].includes(error.status)) { onDenied(); return; }
      setError(error instanceof Error ? error.message : '来源暂时无法核对，请重试。');
    } finally { if (generation === request.current.generation && !controller.signal.aborted) setBusy(false); }
  }

  return <section className="curriculum-lesson-source" aria-label="课时正文来源" aria-busy={busy}>
    <div className="curriculum-source-heading"><div><span className="studio-eyebrow">课时来源 · 逐页核对</span><h4>{lessonName}</h4>
      <p>先核对原卷和提取文字，再形成教学内容。定位候选与教材映射、教学审核分别保留。</p></div>
      {range && <button type="button" className="studio-secondary" disabled={busy} onClick={() => void read(source?.page ?? range.start)}>{busy ? '正在核对来源…' : source ? '重新核对来源' : '核对本课来源'}</button>}</div>
    {!range && <p className="curriculum-source-gap">本课尚无绑定当前教材版本的页码候选。请先从原卷核对课时边界；完整正文暂不自动定位。</p>}
    {range && !source && !busy && !error && <p>候选范围：PDF 物理页 {range.start}～{range.end}。点击核对后读取该范围的一页完整提取文字。</p>}
    {busy && <p role="status">正在核对完整原卷与提取文件，请稍候。</p>}
    {error && <div className="curriculum-source-gap" role="alert"><p>{error}</p><button type="button" className="studio-text-button" onClick={() => void read()}>重试来源核对</button></div>}
    {source && <>
      <div className="curriculum-source-status" role="status"><strong>定位候选 · 待逐页核对</strong><p>{source.notice}</p>
        {!source.titleMatched && <p>算法未匹配到课时标题，当前页段仅按目录偏移推定，请先翻阅原卷确认边界。</p>}</div>
      <div className="curriculum-source-pages"><label htmlFor={label}>PDF 物理页</label><select id={label} value={source.page} onChange={event => void read(Number(event.target.value))}>
        {Array.from({ length: source.pageRange.end - source.pageRange.start + 1 }, (_, index) => source.pageRange.start + index).map(page => <option key={page} value={page}>第 {page} 页</option>)}</select>
        <button type="button" className="studio-text-button" disabled={source.page <= source.pageRange.start} onClick={() => void read(source.page - 1)}>上一原页</button>
        <button type="button" className="studio-text-button" disabled={source.page >= source.pageRange.end} onClick={() => void read(source.page + 1)}>下一原页</button></div>
      {source.extractionStatus === 'no_text' ? <p className="curriculum-source-gap">本物理页没有可读提取文字，可能含图像或扫描内容，请直接查看对应原卷。此状态不表示空白课时或已完成正文审核。</p>
        : <div className="curriculum-source-text" tabIndex={0} aria-label={`PDF 第 ${source.page} 页完整提取文字`}><p>{source.text}</p></div>}
      <p className="curriculum-source-count">本页完整提取文字 {source.textCharacters} 字符。对应原卷已切换到 PDF 第 {source.page} 页。</p>
      <details><summary>来源版本与校验依据</summary><dl><dt>教材版本</dt><dd>{source.bookVersion}</dd><dt>原卷 SHA-256</dt><dd>{source.sourceSha256}</dd><dt>提取文件 SHA-256</dt><dd>{source.extractedSha256}</dd><dt>当前页内容指纹</dt><dd>{source.fingerprint}</dd></dl></details>
    </>}
  </section>;
}
