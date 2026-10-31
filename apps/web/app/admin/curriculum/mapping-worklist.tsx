'use client';
import * as React from 'react';
import type { KnowledgeAtom, Subject, TextbookScopeBookGap, TextbookScopeBookGaps, TextbookScopeInventory } from '@study-agent/contracts';
import { apiRequest, getAuthToken } from '../../../lib/api';
import './mapping-worklist.css';

type State = 'all' | 'unmapped' | 'candidate' | 'approved' | 'rejected' | 'stale';
type CandidateFilter = 'all' | 'with' | 'without';
type SourceFilter = 'all' | 'matched' | 'unavailable';
type Row = { bookId: string; bookTitle: string; edition: string; lessonId: string; lessonName: string; printedPage?: number;
  chapterName: string; state: string; atomIds: string[]; rubric: string; mappingVersion: number | null; candidateAtomIds: string[];
  candidateRationale: string; candidateEvidence: unknown[]; candidateReviewStatus: string; sourceStatus: string; sourceReason: string };
type Result = { counts: Record<State, number>; candidateCounts: Record<CandidateFilter, number>; sourceCounts: Record<SourceFilter, number>;
  books: number; total: number; page: number;
  pageSize: number; rows: Row[]; note: string; inventory: TextbookScopeInventory; bookGaps: TextbookScopeBookGaps };
const labels: Record<State, string> = { all: '全部', unmapped: '待映射', candidate: '已存候选', approved: '已审核', rejected: '已拒绝', stale: '失效' };
const candidateLabels: Record<CandidateFilter, string> = { all: '全部依据', with: '有PDF候选', without: '无可靠候选' };
const sourceLabels: Record<SourceFilter, string> = { all: '全部来源', matched: '同版来源匹配', unavailable: '同版来源未匹配' };
const gapLabels: Record<TextbookScopeBookGap['reason'], string> = { missing_chapters: '尚无课时目录', unconfirmed_chapters: '课时目录尚未确认', no_progress_lessons: '目录中尚无独立课时' };

export function TextbookMappingWorklist({ subject, grade, term, atoms, onOpen }: { subject: Subject; grade: number;
  term: 'upper' | 'lower'; atoms: KnowledgeAtom[]; onOpen: (bookId: string, lessonId: string, candidateAtomIds: string[]) => void }) {
  const [status, setStatus] = React.useState<State>('unmapped'), [candidate, setCandidate] = React.useState<CandidateFilter>('all');
  const [source, setSource] = React.useState<SourceFilter>('all');
  const [page, setPage] = React.useState(1), [bookPage, setBookPage] = React.useState(1);
  const [attempt, setAttempt] = React.useState(0);
  const query = `subject=${subject}&grade=${grade}&term=${term}&status=${status}&candidate=${candidate}&source=${source}&page=${page}&pageSize=30&bookPage=${bookPage}&bookPageSize=10`;
  const [loaded, setLoaded] = React.useState<{ query: string; attempt: number; atoms: KnowledgeAtom[]; value: Result } | null>(null);
  const data = loaded?.query === query && loaded.attempt === attempt && loaded.atoms === atoms ? loaded.value : null;
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const names = React.useMemo(() => new Map(atoms.map(atom => [atom.id, atom.name])), [atoms]);
  React.useEffect(() => { let alive = true; setBusy(true); setError('');
    apiRequest<Result>(`/admin/curriculum/textbook-mapping-worklist?${query}`,
      {}, getAuthToken()).then(result => { if (alive) setLoaded({ query, attempt, atoms, value: result }); }).catch(reason => { if (alive) { setLoaded(null); setError((reason as Error).message); } })
      .finally(() => { if (alive) setBusy(false); }); return () => { alive = false; };
  }, [query, attempt, atoms]);
  React.useEffect(() => setPage(1), [subject, grade, term, status, candidate, source]);
  React.useEffect(() => setBookPage(1), [subject, grade, term]);
  return <div className="mapping-worklist"><div className="mapping-worklist-head"><div><h3>跨教材课时核对清单</h3><p>按当前学科、年级和学期核对；标题相近不会自动形成已审核映射。</p></div>{data && <span className="studio-badge">{data.inventory.registeredBooks}册登记</span>}<button type="button" className="studio-secondary" disabled={busy} onClick={() => setAttempt(value => value + 1)}>刷新清单</button></div>
    {data && <p className="studio-muted" role="status">本范围{data.inventory.registeredBooks}册：{data.inventory.booksWithProgressLessons}册有课时，{data.inventory.booksWithoutProgressLessons}册尚无可核对课时；共{data.inventory.progressLessons}个课时。目录、正文与教学审核分别核对。</p>}
    <div className="mapping-state-filter" role="group" aria-label="映射状态">{(Object.keys(labels) as State[]).map(value => <button key={value} type="button" aria-pressed={status === value}
      onClick={() => setStatus(value)}>{labels[value]} <span>{data?.counts[value] ?? 0}</span></button>)}</div>
    <div className="mapping-state-filter mapping-candidate-filter" role="group" aria-label="候选证据">{(Object.keys(candidateLabels) as CandidateFilter[]).map(value => <button key={value} type="button" aria-pressed={candidate === value}
      onClick={() => setCandidate(value)}>{candidateLabels[value]} <span>{data?.candidateCounts?.[value] ?? 0}</span></button>)}</div>
    <div className="mapping-state-filter mapping-source-filter" role="group" aria-label="原卷来源">{(Object.keys(sourceLabels) as SourceFilter[]).map(value => <button key={value} type="button" aria-pressed={source === value}
      onClick={() => setSource(value)}>{sourceLabels[value]} <span>{data?.sourceCounts?.[value] ?? 0}</span></button>)}</div>
    {error && <div><p className="studio-error" role="alert">{error}</p><button type="button" className="studio-secondary" onClick={() => setAttempt(value => value + 1)}>重试清单</button></div>}{busy && <p role="status">正在读取课时清单…</p>}
    {data && <><div className="mapping-worklist-rows">{data.rows.map(row => <button key={`${row.bookId}:${row.lessonId}`} type="button" onClick={() => onOpen(row.bookId, row.lessonId, row.candidateAtomIds)}>
      <span><small>{row.edition} · {row.chapterName}</small><strong>{row.printedPage ? `第${row.printedPage}页 · ` : ''}{row.lessonName}</strong><em>{row.atomIds.length ? row.atomIds.map(id => names.get(id) ?? id).join('、') : row.candidateAtomIds.length ? `参考候选（未审核）：${row.candidateAtomIds.map(id => names.get(id) ?? id).join('、')}` : row.rubric || '尚无人工映射证据'}</em>{row.candidateAtomIds.length > 0 && <small>{row.candidateRationale}</small>}</span>
      <span><small data-source={row.sourceStatus === 'matched' ? 'available' : 'unavailable'}>{row.sourceStatus === 'matched' ? '同版来源匹配' : '同版来源未匹配'}</small><span data-state={row.state}>{labels[row.state as State] ?? row.state}{row.mappingVersion ? ` · v${row.mappingVersion}` : ''}</span></span></button>)}</div>
      {!data.rows.length && <p className="mapping-worklist-empty">当前筛选下没有课时。</p>}
      <div className="admin-toolbar"><button type="button" className="studio-secondary" disabled={busy || page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>{page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" className="studio-secondary" disabled={busy || page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>下一页</button></div>
      <p className="studio-muted">{data.note} 同版来源匹配只核对版本；原卷安装、字节校验与正文审核另行核对。</p>
      <section className="mapping-book-gaps" aria-label="无可核对课时的教材"><h4>尚无可核对课时的教材</h4><p className="studio-muted">本范围还有{data.bookGaps.total}册；课时筛选不会隐藏这些教材。打开原目录后继续核对来源和课时结构。</p>
        <div className="mapping-worklist-rows">{data.bookGaps.rows.map(book => <button key={book.bookId} type="button" onClick={() => onOpen(book.bookId, '', [])} aria-label={`核对教材目录：${book.bookTitle}`}>
          <span><small>{book.edition}</small><strong>{book.bookTitle}</strong><em>{gapLabels[book.reason]}</em></span><span><small data-source={book.sourceStatus === 'matched' ? 'available' : 'unavailable'}>{book.sourceStatus === 'matched' ? '同版来源匹配' : '同版来源未匹配'}</small><span data-state="unmapped">核对目录 →</span></span>
        </button>)}</div>
        {!data.bookGaps.total && <p className="mapping-worklist-empty">{data.inventory.registeredBooks ? '本范围的已登记教材均有可核对课时；正文与教学审核继续分别核对。' : '本范围尚未登记教材，请先核对学科、年级和学期。'}</p>}
        {data.bookGaps.total > 0 && <div className="admin-toolbar"><button type="button" className="studio-secondary" disabled={busy || bookPage <= 1} onClick={() => setBookPage(value => value - 1)}>上一页教材</button><span>{bookPage} / {Math.max(1, Math.ceil(data.bookGaps.total / data.bookGaps.pageSize))}</span><button type="button" className="studio-secondary" disabled={busy || bookPage * data.bookGaps.pageSize >= data.bookGaps.total} onClick={() => setBookPage(value => value + 1)}>下一页教材</button></div>}
      </section></>}
  </div>;
}
