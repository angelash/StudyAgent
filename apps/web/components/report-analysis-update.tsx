'use client';
import * as React from 'react';
import type { DiagnosticReport, DiagnosticReportAnalysisStatus } from '@study-agent/contracts';
import { ApiRequestError, apiRequest } from '../lib/api';

type Props = { report: DiagnosticReport; studentMode: boolean; ownerId: string; ownerRole: string;
  onChange: (report: DiagnosticReport) => void; onRequiresUpdate: (required: boolean) => void };
type Command = { schema: 1; ownerId: string; ownerRole: string; studentId: string; sessionId: string;
  requestKey: string; expectedReportVersion: number; reason: string };
type AnalysisEntry = { status?: DiagnosticReportAnalysisStatus; error?: string; promise?: Promise<DiagnosticReportAnalysisStatus> };
const analysisCache = new Map<string, AnalysisEntry>();

export function ReportAnalysisUpdate({ report, studentMode, ownerId, ownerRole, onChange, onRequiresUpdate }: Props) {
  const [status, setStatus] = React.useState<DiagnosticReportAnalysisStatus | null>(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [reload, setReload] = React.useState(0);
  const [command, setCommand] = React.useState<Command | null>(null), [unknownOriginal, setUnknownOriginal] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false), [copies, setCopies] = React.useState<Array<{ key: string; raw: string }>>([]);
  const live = React.useRef(false), action = React.useRef<AbortController | null>(null);
  const callbacks = React.useRef({ onChange, onRequiresUpdate }); callbacks.current = { onChange, onRequiresUpdate };
  const slot = 'studyagent.report-analysis-command.v1:' + JSON.stringify([ownerId, ownerRole, report.studentId, report.sessionId]);
  function original(): Command | null {
    const raw = localStorage.getItem(slot); if (raw === null) return null;
    try {
      const value = JSON.parse(raw) as Partial<Command>;
      if (value.schema !== 1 || value.ownerId !== ownerId || value.ownerRole !== ownerRole ||
        value.studentId !== report.studentId || value.sessionId !== report.sessionId ||
        typeof value.requestKey !== 'string' || value.requestKey.length < 8 || value.requestKey.length > 180 ||
        !Number.isSafeInteger(value.expectedReportVersion) || value.expectedReportVersion! < 1 ||
        typeof value.reason !== 'string' || value.reason.length < 5 || value.reason.length > 1000) throw new Error('Unrecognised original');
      setUnknownOriginal(null); return value as Command;
    } catch {
      setUnknownOriginal(raw); throw new Error('本机原核对操作无法识别，原文已保留。请下载原件，保留原报告并重新核查。');
    }
  }
  React.useEffect(() => {
    live.current = true;
    return () => { live.current = false; action.current?.abort(); };
  }, []);
  React.useEffect(() => {
    let active = true;
    let pending = false;
    try {
      const saved = original(); setCommand(saved); pending = !!saved;
      const archived: Array<{ key: string; raw: string }> = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index); if (key?.startsWith(slot + ':copy:')) archived.push({ key, raw: localStorage.getItem(key) ?? '' });
      }
      setCopies(archived);
    } catch (caught) { setError((caught as Error).message); pending = true; }
    if (!ownerId) { analysisCache.clear(); callbacks.current.onRequiresUpdate(true); return () => { active = false; }; }
    const signature = JSON.stringify([ownerId, ownerRole, studentMode, report.studentId, report.sessionId, report.version ?? 1,
      report.measurementVersion, report.familyIdentityVersion, report.estimates.map(row => row.algorithmVersion), reload]);
    const cached = analysisCache.get(signature);
    if (cached?.status) {
      setStatus(cached.status);
      callbacks.current.onRequiresUpdate(pending || cached.status.requiresReanalysis || cached.status.reportVersion !== (report.version ?? 1));
    } else if (cached?.error) { setError(cached.error); callbacks.current.onRequiresUpdate(true); }
    else {
      setStatus(null); callbacks.current.onRequiresUpdate(true);
      const reading = cached?.promise ?? apiRequest<DiagnosticReportAnalysisStatus>(`/diagnostics/sessions/${encodeURIComponent(report.sessionId)}/analysis-status`);
      if (!cached?.promise) {
        if (analysisCache.size >= 100) analysisCache.delete(analysisCache.keys().next().value!);
        analysisCache.set(signature, { promise: reading });
      }
      reading
      .then(value => {
        analysisCache.set(signature, { status: value });
        if (!active) return;
        setStatus(value);
        callbacks.current.onRequiresUpdate(pending || value.requiresReanalysis || value.reportVersion !== (report.version ?? 1));
      }).catch(caught => { const message = (caught as Error).message; analysisCache.set(signature, { error: message }); if (active) setError(message); });
    }
    const storage = (event: StorageEvent) => { if (event.key === slot) setReload(value => value + 1); };
    window.addEventListener('storage', storage);
    return () => { active = false; window.removeEventListener('storage', storage); };
  }, [reload, ownerId, slot, report.sessionId, report.version]);
  async function update(newerReport: boolean) {
    setBusy(true); setError('');
    const controller = new AbortController(); action.current = controller;
    try {
      const route = `/diagnostics/sessions/${encodeURIComponent(report.sessionId)}`;
      let saved = original();
      if (!saved && !newerReport) {
        saved = { schema: 1, ownerId, ownerRole, studentId: report.studentId, sessionId: report.sessionId,
          requestKey: crypto.randomUUID(), expectedReportVersion: report.version ?? 1,
          reason: '核对实际回答与自述的计量资格和题族方法，按保留的原作答更新报告' };
        const raw = JSON.stringify(saved); localStorage.setItem(slot, raw);
        if (localStorage.getItem(slot) !== raw) throw new Error('无法保存原核对操作，请恢复本机存储后重试。');
      }
      setCommand(saved); callbacks.current.onRequiresUpdate(true);
      const next = saved ? await apiRequest<DiagnosticReport>(`${route}/reanalyze`, { method: 'POST', signal: controller.signal,
        body: JSON.stringify({ requestKey: saved.requestKey, expectedReportVersion: saved.expectedReportVersion, reason: saved.reason }) }) :
        await apiRequest<DiagnosticReport>(`${route}/report`, { signal: controller.signal });
      if (!live.current) return;
      if (saved) {
        const current = original();
        if (current && JSON.stringify(current) === JSON.stringify(saved)) localStorage.removeItem(slot);
        else if (current) throw new Error('本报告另有一份原核对操作，已保留；请重新读取后核对。');
      }
      analysisCache.clear(); setCommand(null); callbacks.current.onChange(next); setReload(value => value + 1);
    } catch (caught) { if (live.current) { setError((caught as Error).message); setConflict(caught instanceof ApiRequestError && caught.status === 409); } }
    finally { if (live.current) setBusy(false); }
  }
  if (unknownOriginal !== null) return <div className="studio-hint" role="alert"><p>{error || '本机原核对操作无法识别，原文仍保留。'}</p><button className="studio-secondary" onClick={() => {
    const url = URL.createObjectURL(new Blob([unknownOriginal], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'report-analysis-original.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}>下载原核对操作</button></div>;
  if (error && !status) return <div className="studio-hint" role="alert"><p>暂时无法核对这份报告的分析依据：{error}</p><button className="studio-secondary" onClick={() => { setError(''); setReload(value => value + 1); }}>重新核对</button></div>;
  if (!status) return <p className="studio-muted" role="status">正在核对报告依据…</p>;
  const originalCopies = copies.length > 0 && <details className="studio-hint"><summary>本机原核对操作副本（{copies.length}）</summary>{copies.map((copy, index) =>
    <button className="studio-secondary" key={copy.key} onClick={() => {
      const url = URL.createObjectURL(new Blob([copy.raw], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `report-analysis-command-${index + 1}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>下载原操作副本 {index + 1}</button>)}</details>;
  if (!command && !status.requiresReanalysis && status.reportVersion === (report.version ?? 1)) return originalCopies || null;
  const newerReport = status.reportVersion !== (report.version ?? 1);
  return <><section className="studio-hint" aria-label="重新核对报告依据">
    <strong>{command ? '上次核对的结果还需确认。' : newerReport ? '这份报告已有更新。' : '重新核对独立任务，保留当时的作答。'}</strong>
    <p>{command ? '原请求、版本和原因已保留。恢复会读取同一次操作的结果。' : newerReport ? '请先查看最新报告，再确认下一步指导。' :
      '旧报告按当时方法保留。重新分析会核对实际回答、自述和题族资格，另存新报告；方法变化带来的数值变化，不表示孩子的能力发生了变化。'}</p>
    {!newerReport && !command && status.reasons?.map(reason => <p key={reason}>{reason}</p>)}
    {error && <p className="studio-error" role="alert">{error}</p>}
    {conflict && command && !studentMode && ['parent', 'admin'].includes(ownerRole) && <button className="studio-secondary" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      const controller = new AbortController(); action.current = controller;
      try {
        const saved = original(); if (!saved) throw new Error('请重新读取原核对操作。');
        const key = slot + ':copy:' + saved.requestKey, raw = JSON.stringify(saved), archived = localStorage.getItem(key);
        if (archived !== null && archived !== raw) throw new Error('原操作副本已存在不同内容，请保留并下载核对。');
        localStorage.setItem(key, raw); if (localStorage.getItem(key) !== raw) throw new Error('无法保留原操作副本，请恢复本机存储后重试。');
        const next = await apiRequest<DiagnosticReport>(`/diagnostics/sessions/${encodeURIComponent(report.sessionId)}/report`, { signal: controller.signal });
        if (!live.current) return;
        if (JSON.stringify(original()) !== raw) throw new Error('原操作已在另一窗口变化，所有副本已保留，请重新核对。');
        localStorage.removeItem(slot); analysisCache.clear(); setCommand(null); setConflict(false); callbacks.current.onChange(next); setReload(value => value + 1);
      } catch (caught) { if (live.current) setError((caught as Error).message); }
      finally { if (live.current) setBusy(false); }
    }}>保留原操作副本，查看最新报告</button>}
    {newerReport && !command || !studentMode && ['parent', 'admin'].includes(ownerRole) && (command || status.canReanalyze) ?
      <button className="studio-secondary" disabled={busy} onClick={() => void update(newerReport)}>{busy ? '正在核对…' : command ? '恢复原核对结果' : newerReport ? '查看最新报告' : '按原作答重新分析'}</button> :
      <p>{studentMode ? '请家长查看并重新核对这份报告，再一起安排下一步。' : '请监护人核对这份报告；若原知识定义或计量原件不完整，请保留原报告，确认范围并完成新评测。'}</p>}
  </section>{originalCopies}</>;
}
