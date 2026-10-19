'use client';
import * as React from 'react';
import type { EvidenceFeedback, EvidenceKind } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import './evidence-feedback.css';

const statusNames = { open: '已收到', investigating: '核查中', resolved: '已处理', dismissed: '已说明处理依据' };
const categories = { grading: '评分或量规', ambiguous_question: '题意或参考答案', display: '显示或媒体', learning_context: '作答环境与状态', other: '其他情况' };
export function EvidenceFeedbackForm({ kind, responseId }: { kind: EvidenceKind; responseId: string }) {
  const [open, setOpen] = React.useState(false), [category, setCategory] = React.useState<keyof typeof categories>('grading');
  const [message, setMessage] = React.useState(''), [rows, setRows] = React.useState<EvidenceFeedback[]>([]), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const requestKey = React.useRef('');
  const url = `/learning/feedback?kind=${kind}&responseId=${encodeURIComponent(responseId)}`;
  React.useEffect(() => { setRows([]); setMessage(''); setError(''); setNotice(''); requestKey.current = crypto.randomUUID(); }, [kind, responseId]);
  React.useEffect(() => { if (!open) return; let alive = true;
    apiRequest<{ rows: EvidenceFeedback[] }>(url).then((data) => { if (alive) setRows(data.rows); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [open, url]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest('/learning/feedback', { method: 'POST', body: JSON.stringify({ kind, responseId, category, message, requestKey: requestKey.current }) });
      setRows((await apiRequest<{ rows: EvidenceFeedback[] }>(url)).rows); setMessage(''); requestKey.current = crypto.randomUUID();
      setNotice('反馈已保存。核查结论会留在这里，原始作答继续保留。');
    } catch (e) { setError(e instanceof Error ? e.message : '反馈未完成，请重试'); } finally { setBusy(false); }
  }
  return <details className="evidence-feedback" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}><summary>对这道题有疑问？反馈并查看处理记录</summary>
    {open && <div><p>可以说明题意、评分或作答时的情况。反馈不会自动改变评分，复核和新题验证各自留下记录。</p>
      {rows.map((item) => <article key={item.id}><span>{statusNames[item.status]} · {categories[item.category]}</span><p>{item.message}</p>{item.history.slice(1).map((entry) => <p key={entry.version}><b>{statusNames[entry.status]}</b>：{entry.note}</p>)}</article>)}
      <form onSubmit={submit}><label>需要核查哪方面<select disabled={busy} value={category} onChange={(e) => setCategory(e.target.value as keyof typeof categories)}>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>具体情况<textarea required minLength={5} maxLength={3000} rows={3} disabled={busy} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="描述具体哪一步有疑问、当时发生了什么…" /></label>
        <button className="studio-secondary" disabled={busy || message.trim().length < 5}>{busy ? '正在保存…' : '提交反馈'}</button></form>
      {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="feedback-error">{error}</p>}
    </div>}
  </details>;
}
