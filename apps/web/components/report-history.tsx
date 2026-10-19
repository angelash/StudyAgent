'use client';
import * as React from 'react';
import type { DiagnosticReport } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
export function ReportHistory({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = React.useState(false), [versions, setVersions] = React.useState<DiagnosticReport[]>([]), [error, setError] = React.useState('');
  React.useEffect(() => { if (!open) return; let alive = true; setVersions([]); setError('');
    apiRequest<DiagnosticReport[]>(`/diagnostics/sessions/${encodeURIComponent(sessionId)}/report-history`).then((data) => { if (alive) setVersions(data); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [open, sessionId]);
  return <details className="studio-report-history" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}><summary>报告版本与评分变更记录</summary>
    {error && <p role="alert">{error}</p>}{open && !versions.length && !error && <p role="status">正在读取历史报告…</p>}
    {versions.map((item) => <details key={item.version}><summary>版本 {item.version} · {item.generatedAt ? new Date(item.generatedAt).toLocaleString('zh-CN') : ''} · {item.scoredCount} 题已评分</summary><p>{item.revisionReason ?? '首次评测报告，保存完成时的证据。'}</p><p>{item.summary}</p><p>本次题目得分：{item.rawScore === null ? '待评分' : `${item.rawScore}%`}；待复核 {item.pendingReviewCount} 题。</p>{item.evidence.map((e) => <p key={e.id}>{item.estimates.find((a) => a.atomId === e.atomId)?.atomName ?? '知识点'}：{e.score === null ? e.status === 'pending_review' ? '待复核' : '已跳过' : `${Math.round(e.score * 100)}%`} · {e.gradingReason}</p>)}</details>)}
  </details>;
}
