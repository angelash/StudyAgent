'use client';
import * as React from 'react';
import type { KnowledgeAtom, Subject } from '@study-agent/contracts';
import { apiRequest, getAuthToken } from '../../../lib/api';
import './mapping-worklist.css';

type State = 'all' | 'unmapped' | 'candidate' | 'approved' | 'rejected' | 'stale';
type Row = { bookId: string; bookTitle: string; edition: string; lessonId: string; lessonName: string; printedPage?: number;
  chapterName: string; state: string; atomIds: string[]; rubric: string; mappingVersion: number | null };
type Result = { counts: Record<State, number>; books: number; total: number; page: number; pageSize: number; rows: Row[]; note: string };
const labels: Record<State, string> = { all: '全部', unmapped: '待映射', candidate: '候选', approved: '已审核', rejected: '已拒绝', stale: '失效' };

export function TextbookMappingWorklist({ subject, grade, term, atoms, onOpen }: { subject: Subject; grade: number;
  term: 'upper' | 'lower'; atoms: KnowledgeAtom[]; onOpen: (bookId: string, lessonId: string) => void }) {
  const [status, setStatus] = React.useState<State>('unmapped'), [page, setPage] = React.useState(1), [data, setData] = React.useState<Result | null>(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const names = React.useMemo(() => new Map(atoms.map(atom => [atom.id, atom.name])), [atoms]);
  React.useEffect(() => { let alive = true; setBusy(true); setError('');
    apiRequest<Result>(`/admin/curriculum/textbook-mapping-worklist?subject=${subject}&grade=${grade}&term=${term}&status=${status}&page=${page}&pageSize=30`,
      {}, getAuthToken()).then(result => { if (alive) setData(result); }).catch(reason => { if (alive) setError((reason as Error).message); })
      .finally(() => { if (alive) setBusy(false); }); return () => { alive = false; };
  }, [subject, grade, term, status, page]);
  React.useEffect(() => setPage(1), [subject, grade, term, status]);
  return <div className="mapping-worklist"><div className="mapping-worklist-head"><div><h3>跨教材课时核对清单</h3><p>服务端按当前学科、年级和学期分页定位；标题相近不会自动形成已审核映射。</p></div>{data && <span className="studio-badge">{data.books}册 · {data.total}项</span>}</div>
    <div className="mapping-state-filter" role="group" aria-label="映射状态">{(Object.keys(labels) as State[]).map(value => <button key={value} type="button" aria-pressed={status === value}
      onClick={() => setStatus(value)}>{labels[value]} <span>{data?.counts[value] ?? 0}</span></button>)}</div>
    {error && <p className="studio-error" role="alert">{error}</p>}{busy && <p role="status">正在读取课时清单…</p>}
    {data && <><div className="mapping-worklist-rows">{data.rows.map(row => <button key={`${row.bookId}:${row.lessonId}`} type="button" onClick={() => onOpen(row.bookId, row.lessonId)}>
      <span><small>{row.edition} · {row.chapterName}</small><strong>{row.printedPage ? `第${row.printedPage}页 · ` : ''}{row.lessonName}</strong><em>{row.atomIds.length ? row.atomIds.map(id => names.get(id) ?? id).join('、') : row.rubric || '尚无人工映射证据'}</em></span>
      <span data-state={row.state}>{labels[row.state as State] ?? row.state}{row.mappingVersion ? ` · v${row.mappingVersion}` : ''}</span></button>)}</div>
      {!data.rows.length && <p className="mapping-worklist-empty">当前筛选下没有课时。</p>}
      <div className="admin-toolbar"><button type="button" className="studio-secondary" disabled={busy || page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>{page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" className="studio-secondary" disabled={busy || page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>下一页</button></div>
      <p className="studio-muted">{data.note}</p></>}
  </div>;
}
