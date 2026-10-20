'use client';
import * as React from 'react';
import type { DiagnosticReport } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';

type AnalysisStatus = { requiresReanalysis: boolean; reportVersion: number; canReanalyze: boolean };

export function ReportAnalysisUpdate({ report, studentMode, onChange, onRequiresUpdate }: {
  report: DiagnosticReport; studentMode: boolean; onChange: (report: DiagnosticReport) => void; onRequiresUpdate: (required: boolean) => void;
}) {
  const [status, setStatus] = React.useState<AnalysisStatus | null>(null), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(''), [reload, setReload] = React.useState(0);
  const requestKey = React.useRef('');
  React.useEffect(() => {
    let active = true;
    onRequiresUpdate(true);
    apiRequest<AnalysisStatus>(`/diagnostics/sessions/${encodeURIComponent(report.sessionId)}/analysis-status`).then(value => {
      if (active) { setStatus(value); setError(''); onRequiresUpdate(value.requiresReanalysis || value.reportVersion !== (report.version ?? 1)); }
    }).catch(caught => { if (active) setError((caught as Error).message); });
    return () => { active = false; };
  }, [report.sessionId, report.version, reload, onRequiresUpdate]);
  if (error && !status) return <div className="studio-hint" role="alert"><p>暂时无法核对这份报告的分析依据：{error}</p><button className="studio-secondary" onClick={() => setReload(value => value + 1)}>重新核对</button></div>;
  if (!status) return <p className="studio-muted" role="status">正在核对报告依据…</p>;
  if (!status.requiresReanalysis && status.reportVersion === (report.version ?? 1)) return null;
  const newerReport = status.reportVersion !== (report.version ?? 1);
  return <section className="studio-hint" aria-label="重新核对报告依据">
    <strong>{newerReport ? '这份报告已有更新。' : '重新核对独立任务，保留当时的作答。'}</strong>
    <p>{newerReport ? '请先查看最新报告，再确认下一步指导。' : '旧报告中，部分任务只是表达顺序不同。重新分析会把这些任务合并计量，并保存一份新报告。方法变化带来的数值变化，不表示孩子的能力发生了变化。'}</p>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {newerReport || !studentMode && status.canReanalyze ? <button className="studio-secondary" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try {
        requestKey.current ||= crypto.randomUUID();
        const route = `/diagnostics/sessions/${encodeURIComponent(report.sessionId)}`;
        const next = newerReport ? await apiRequest<DiagnosticReport>(`${route}/report`) : await apiRequest<DiagnosticReport>(`${route}/reanalyze`, {
          method: 'POST', body: JSON.stringify({ requestKey: requestKey.current, expectedReportVersion: report.version ?? 1,
            reason: '核对任务结构归并方法，按保留的原始作答更新当前报告' }) });
        onChange(next);
      } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
    }}>{busy ? '正在核对…' : newerReport ? '查看最新报告' : '按原作答重新分析'}</button> : <p>{studentMode ? '请家长查看并重新核对这份报告，再一起安排下一步。' : '请监护人核对这份报告；若原始知识定义不完整，请确认学习范围并完成新评测。'}</p>}
  </section>;
}
