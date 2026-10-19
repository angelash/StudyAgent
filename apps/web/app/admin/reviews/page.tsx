'use client';
import * as React from 'react';
import Link from 'next/link';
import type { EvidenceFeedback, EvidenceKind, QuestionRenderPayload, RubricRating, ScoringRevision } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import { readableAnswer, subjectNames } from '../../../lib/learning';
import { QuestionBlockView } from '../../../components/question-renderer';
import { StudyNav } from '../../../components/study-nav';
import '../../student/assessment/studio.css';
import '../workbench.css';
import './reviews.css';

type Row = { kind: EvidenceKind; responseId: string; nickname: string; subject: keyof typeof subjectNames; atomName: string; stem: string; submittedAt: string; reviewVersion: number; feedbackCount: number };
type Detail = { kind: EvidenceKind; responseId: string; student: { nickname: string }; subject: keyof typeof subjectNames; atomName: string;
  payload: QuestionRenderPayload; referenceAnswer: unknown; analysis: string;
  response: { answer: unknown; score: number | null; hintLevel: number; elapsedMs: number; submittedAt: string; solutionExposedBefore?: boolean; priorExposure?: boolean };
  rubric: Array<{ criterion: string; weight: number }> | null; rubricIssue: string | null; canScore: boolean;
  reviewVersion: number; revisions: ScoringRevision[]; feedback: EvidenceFeedback[] };
const date = (value: string) => new Date(value).toLocaleString('zh-CN');
const states = { open: '待核查', investigating: '核查中', resolved: '已处理', dismissed: '已说明依据' };
const send = <T,>(path: string, body?: unknown, method = 'POST') => apiRequest<T>(path, body === undefined ? {} : { method, body: JSON.stringify(body) });

export default function ReviewWorkbench() {
  const [tab, setTab] = React.useState<'pending' | 'reviewed' | 'all' | 'feedback'>('pending'), [subject, setSubject] = React.useState('');
  const [page, setPage] = React.useState(1), [rows, setRows] = React.useState<Row[]>([]), [feedback, setFeedback] = React.useState<EvidenceFeedback[]>([]), [total, setTotal] = React.useState(0);
  const [detail, setDetail] = React.useState<Detail | null>(null), [ratings, setRatings] = React.useState<Array<{ score: string; observation: string }>>([]), [score, setScore] = React.useState(''), [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(false), [opening, setOpening] = React.useState(false), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [reload, setReload] = React.useState(0);
  const requestKey = React.useRef(''), sequence = React.useRef(0);
  React.useEffect(() => { let alive = true; setLoading(true); setError('');
    (async () => {
      if (tab === 'feedback') {
        const data = await send<{ rows: EvidenceFeedback[]; total: number }>(`/admin/evidence-feedback?page=${page}`);
        if (alive) { setFeedback(data.rows); setRows([]); setTotal(data.total); }
      } else {
        const data = await send<{ rows: Row[]; total: number }>(`/admin/reviews?state=${tab}&page=${page}${subject ? `&subject=${subject}` : ''}`);
        if (alive) { setRows(data.rows); setFeedback([]); setTotal(data.total); }
      }
    })().catch((e) => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, page, subject, reload]);

  async function open(kind: EvidenceKind, responseId: string) {
    const ticket = ++sequence.current; setOpening(true); setError(''); setNotice(''); setDetail(null);
    try {
      const next = await send<Detail>(`/admin/reviews/${kind}/${encodeURIComponent(responseId)}`);
      if (sequence.current !== ticket) return;
      setDetail(next); setReason(''); setScore('');
      setRatings(next.rubric?.map(() => ({ score: '', observation: '' })) ?? []); requestKey.current = crypto.randomUUID();
    } catch (e) { if (sequence.current === ticket) setError(e instanceof Error ? e.message : '打开未完成'); }
    finally { if (sequence.current === ticket) setOpening(false); }
  }
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search), kind = params.get('kind'), id = params.get('responseId');
    if ((kind === 'diagnostic' || kind === 'practice') && id) void open(kind, id);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!detail) return; setBusy(true); setError(''); setNotice('');
    try {
      const command = { expectedVersion: detail.reviewVersion, requestKey: requestKey.current, reason,
        ...(detail.rubric ? { ratings: ratings.map((r, criterionIndex): RubricRating => ({ criterionIndex, score: Number(r.score), observation: r.observation })) } : { score: Number(score) }) };
      await send(`/admin/reviews/${detail.kind}/${encodeURIComponent(detail.responseId)}`, command);
      await open(detail.kind, detail.responseId); setNotice('复核已保存。首次回答和旧评分仍可追溯。'); setReload((n) => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : '复核未完成，请重试'); } finally { setBusy(false); }
  }
  const computed = detail?.rubric && ratings.every((r) => r.score !== '') ? Math.round(ratings.reduce((n, r, i) => n + Number(r.score) * detail.rubric![i].weight, 0) * 100) : null;
  return <main className="learning-studio"><StudyNav /><div className="admin-workbench">
    <nav className="admin-links" aria-label="教研导航"><Link href="/admin/curriculum">课程与覆盖</Link><Link href="/admin/reviews" aria-current="page">作答复核与反馈</Link><Link href="/admin/imports">资料导入</Link><Link href="/admin/content">内容管理</Link><Link href="/library">题卷资料</Link></nav>
    <span className="studio-eyebrow">REVIEW DESK / 每一次评价，都有依据</span><h1>看见表达，再作判断。</h1><p>逐项核对作答与冻结量规。评分、异议处理和新题验证分别记录；训练复核不直接增加能力证据。</p>
    <div className="admin-toolbar"><div className="studio-subjects review-tabs">{([['pending', '待复核'], ['reviewed', '已复核'], ['all', '全部作答'], ['feedback', '反馈记录']] as const).map(([key, name]) => <button key={key} disabled={busy} aria-pressed={tab === key} onClick={() => { setTab(key); setPage(1); }}>{name}</button>)}</div>
      {tab !== 'feedback' && <label>学科<select value={subject} disabled={busy} onChange={(e) => { setSubject(e.target.value); setPage(1); }}><option value="">全部学科</option>{Object.entries(subjectNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      <span className="studio-muted">{loading ? '正在读取…' : `${total} 条记录`}</span><button className="studio-text-button" disabled={loading || busy} onClick={() => setReload((n) => n + 1)}>刷新</button></div>
    {error && <div className="studio-error" role="alert">{error}</div>}{notice && <p role="status" className="review-notice">{notice}</p>}
    <div className="admin-columns review-columns"><section aria-label="复核任务"><div className="admin-atom-list review-list" aria-busy={loading}>
      {!loading && !total && <div className="review-empty"><h3>这一页暂时没有待办</h3><p>教师只会看到已获监护人授权的孩子。已结束评测的开放回答和训练表达会进入这里。</p></div>}
      {rows.map((row) => <button key={`${row.kind}:${row.responseId}`} disabled={busy} aria-pressed={detail?.responseId === row.responseId} onClick={() => open(row.kind, row.responseId)}><span>{row.nickname} · {subjectNames[row.subject]} · {row.kind === 'practice' ? '训练' : '评测'}</span><strong>{row.atomName}</strong><small>{row.stem}</small><small>{date(row.submittedAt)} · {row.reviewVersion ? `复核 v${row.reviewVersion}` : '首次评分'}{row.feedbackCount > 0 && ` · ${row.feedbackCount} 条待核查反馈`}</small></button>)}
      {feedback.map((item) => <button key={item.id} disabled={busy} aria-pressed={detail?.responseId === item.responseId} onClick={() => open(item.kind, item.responseId)}><span>{states[item.status]} · {subjectNames[item.subject]}</span><strong>{item.message}</strong><small>{date(item.updatedAt)} · {item.kind === 'practice' ? '训练' : '评测'}</small></button>)}
    </div><div className="review-pagination"><button className="studio-secondary" disabled={page <= 1 || loading || busy} onClick={() => setPage((p) => p - 1)}>上一页</button><span>{page} / {Math.max(1, Math.ceil(total / 25))}</span><button className="studio-secondary" disabled={page * 25 >= total || loading || busy} onClick={() => setPage((p) => p + 1)}>下一页</button></div></section>
    <section className="admin-editor" aria-busy={opening || busy}>{opening ? <p role="status">正在打开冻结题目与作答记录…</p> : !detail ? <div className="review-empty"><span className="review-mark" aria-hidden="true">阅</span><h2>先看原题，后看回答。</h2><p>从左侧选择一条记录。题目和评分量规以作答当时的版本为准。</p></div> : <>
      <span className="studio-eyebrow">{detail.student.nickname} / {detail.kind === 'practice' ? '训练表达' : '评测证据'}</span><h2>{detail.atomName}</h2>
      <div className="review-question">{detail.payload.document.blocks.map((block) => <QuestionBlockView key={block.id} block={block} />)}</div>
      <div className="review-answer"><strong>孩子当时的回答</strong><p>{readableAnswer(detail.response.answer)}</p><small>{date(detail.response.submittedAt)} · {Math.round(detail.response.elapsedMs / 1000)} 秒 · {detail.response.hintLevel ? `使用 ${detail.response.hintLevel} 级提示` : '未使用提示'}{(detail.response.solutionExposedBefore || detail.response.priorExposure) && ' · 已接触过题目或参考'}</small></div>
      <details className="review-reference"><summary>参考响应与思路</summary><p>{readableAnswer(detail.referenceAnswer)}</p><p>{detail.analysis}</p></details>
      {detail.canScore ? <form onSubmit={submit} className="review-rubric"><h3>{detail.reviewVersion ? `新增复核版本 v${detail.reviewVersion + 1}` : '逐项记录本次评价'}</h3>
        <fieldset disabled={busy} className="review-fieldset">{detail.rubric ? detail.rubric.map((criterion, i) => <div key={i} className="review-criterion"><div><span>0{i + 1}</span><strong>{criterion.criterion}</strong><small>权重 {Math.round(criterion.weight * 100)}%</small></div><fieldset className="review-rating"><legend>达到程度</legend>{([['0', '尚未达到'], ['0.25', '少量达到'], ['0.5', '部分达到'], ['0.75', '基本达到'], ['1', '完整达到']] as const).map(([value, label]) => <label key={value} data-checked={ratings[i]?.score === value}><input required type="radio" name={`criterion-${i}`} value={value} checked={ratings[i]?.score === value} onChange={() => setRatings((all) => all.map((r, n) => n === i ? { ...r, score: value } : r))} /><span>{label}<small>{value}</small></span></label>)}</fieldset><label>作答中看到了什么<textarea required maxLength={1000} rows={2} value={ratings[i]?.observation ?? ''} onChange={(e) => setRatings((all) => all.map((r, n) => n === i ? { ...r, observation: e.target.value } : r))} placeholder="引用作答中的具体表现，说明评价依据" /></label></div>) : <label>此历史题没有分项量规，记录复核得分（0–1）<input required type="number" min={0} max={1} step={0.01} value={score} onChange={(e) => setScore(e.target.value)} /></label>}
          <label>综合反馈与下一步<textarea required minLength={5} maxLength={2000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="指出具体做到了什么、还卡在哪一步、下一步怎样验证" /></label>
          <div className="review-submit"><span>{computed === null ? '记录完整依据后保存' : `量规加权参考：${computed}%`}</span><button className="studio-primary" disabled={busy}>{busy ? '正在保存…' : '保存复核版本 →'}</button></div></fieldset></form> : <p className="studio-muted">{detail.rubricIssue ?? '本题是跳过或暂时不会的记录，不能改作有效回答评分。可以继续核查反馈与安排新题。'}</p>}
      {detail.revisions.length > 0 && <details className="review-history"><summary>评分版本与依据 · {detail.revisions.length} 次</summary>{[...detail.revisions].reverse().map((item) => <article key={item.id}><strong>v{item.version} · {Math.round(item.score * 100)}% <small>{date(item.createdAt)}</small></strong><p>{item.reason}</p>{item.ratings?.map((r) => <p key={r.criterionIndex}>{item.rubricSnapshot?.[r.criterionIndex]?.criterion}：{r.score} · {r.observation}</p>)}</article>)}</details>}
      {detail.feedback.length > 0 && <section className="review-feedback-section"><h3>家长反馈与处理</h3>{detail.feedback.map((item) => <FeedbackResolution key={`${item.id}:${item.version}`} item={item} disabled={busy} onSave={async (body) => { setBusy(true); setError(''); try { await send(`/admin/evidence-feedback/${item.id}`, body, 'PATCH'); await open(detail.kind, detail.responseId); setReload((n) => n + 1); setNotice('处理依据已保存，家长可以查看。'); } catch (e) { setError(e instanceof Error ? e.message : '处理未完成'); } finally { setBusy(false); } }} />)}</section>}
    </>}</section></div>
  </div></main>;
}
function FeedbackResolution({ item, onSave, disabled }: { item: EvidenceFeedback; onSave: (body: unknown) => Promise<void>; disabled: boolean }) {
  const [status, setStatus] = React.useState('investigating'), [note, setNote] = React.useState('');
  return <article className="review-feedback"><span className="studio-badge">{states[item.status]}</span><p>{item.message}</p>{item.history.slice(1).map((entry) => <p key={entry.version}><b>{states[entry.status]}</b>：{entry.note}</p>)}
    {!['resolved', 'dismissed'].includes(item.status) && <form onSubmit={(event) => { event.preventDefault(); void onSave({ expectedVersion: item.version, status, note }); }}><label>处理进度<select disabled={disabled} value={status} onChange={(e) => setStatus(e.target.value)}><option value="investigating">继续核查</option><option value="resolved">已处理</option><option value="dismissed">说明无需改分的依据</option></select></label><label>核查依据与处理说明<textarea required minLength={5} maxLength={3000} rows={3} disabled={disabled} value={note} onChange={(e) => setNote(e.target.value)} /></label><button className="studio-secondary" disabled={disabled || note.trim().length < 5}>保存处理记录</button></form>}
  </article>;
}
