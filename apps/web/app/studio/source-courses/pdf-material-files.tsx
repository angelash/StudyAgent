'use client';
import * as React from 'react';
import type { StudioMaterialFileReport, StudioMaterialFileState, StudioSourceMaterial } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import {PdfOriginalRepair} from './original-repair';

const sources = '/learning/source-courses/materials/';
const states: Record<StudioMaterialFileState, string> = { verified: '校验通过', baseline_recorded: '已登记当前页图', missing: '文件缺失', mismatch: '校验不符', unknown: '尚不能核对', not_required: '以文字保存' };

export function PdfMaterialFiles({ material, disabled, onRegenerate }: { material: StudioSourceMaterial; disabled: boolean; onRegenerate: () => Promise<void> }) {
  const [report, setReport] = React.useState<StudioMaterialFileReport | null>(null), [version, setVersion] = React.useState('');
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [attempt, setAttempt] = React.useState(0), [loading, setLoading] = React.useState(true);
  const [repairActive,setRepairActive]=React.useState(false);
  const operation = React.useRef<AbortController | null>(null), request = React.useRef<{ version: string; requestKey: string } | null>(null);
  React.useEffect(() => {
    const controller = new AbortController(); operation.current?.abort(); request.current = null; setReport(null); setVersion(''); setError(''); setLoading(true); setBusy(false);
    void Promise.all([
      apiRequest<StudioMaterialFileReport | null>(sources + material.id + '/files', { signal: controller.signal }),
      apiRequest<{ version: string }>(sources + material.id, { signal: controller.signal }),
    ]).then(([value, current]) => { if (!controller.signal.aborted) { setReport(value); setVersion(current.version); } })
      .catch(caught => { if (!controller.signal.aborted) setError(caught.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); operation.current?.abort(); };
  }, [material.id, material.updatedAt, material.status, attempt]);

  async function check() {
    if (busy || disabled || repairActive || !version) return;
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller; setBusy(true); setError('');
    request.current ??= { version, requestKey: crypto.randomUUID() };
    try {
      const value = await apiRequest<StudioMaterialFileReport>(sources + material.id + '/files/check', { method: 'POST', signal: controller.signal, body: JSON.stringify(request.current) });
      if (!controller.signal.aborted) { setReport(value); request.current = null; }
    } catch (caught) { if (!controller.signal.aborted) setError((caught as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function refreshAfterRepair(){
    const controller=new AbortController();operation.current?.abort();operation.current=controller;
    try{const latest=await apiRequest<StudioMaterialFileReport|null>(sources+material.id+'/files',{signal:controller.signal});if(!controller.signal.aborted){setReport(latest);request.current=null;}}
    catch(caught){if(!controller.signal.aborted)setError((caught as Error).message);}
  }
  const stale = Boolean(report && report.version !== version), badPages = report?.pages.filter(page => ['missing', 'mismatch', 'unknown'].includes(page.state)) ?? [];
  const baseline = report?.pages.filter(page => page.state === 'baseline_recorded').length ?? 0;
  return <section className="sc-material-files" aria-label={material.title + '文件核对'} aria-busy={busy || loading}>
    <header><div><b>原件与原页</b><p>{loading ? '正在读取最近一次文件检查…' : report ? '上次检查：' + new Date(report.checkedAt).toLocaleString('zh-CN') : '尚未核对文件。可以检查原件、原页是否仍可用。'}</p></div>
      <button type="button" disabled={busy || loading || disabled || repairActive || !version} onClick={() => void check()}>{busy ? '正在检查文件…' : request.current ? '重试这次检查' : '检查原件与原页'}</button></header>
    {stale && <p className="sc-pdf-notice" role="status">正文已更新，下方是旧版本的检查结果，请重新检查。</p>}
    {report && <><div className="sc-material-file-summary" role="status"><span data-state={report.original}>原件 · {states[report.original]}</span><span>{report.pages.length - badPages.length} / {report.pages.length} 页图可用{badPages.length ? ' · ' + badPages.length + '页需要处理' : ''}</span></div>
      {baseline > 0 && <p>{baseline}页已登记当前可读图像的校验基线；历史文件是否曾改变，仍需对照原件。</p>}
      {!!report.pages.length && <details><summary>查看逐页文件状态</summary><ol tabIndex={0} aria-label="原页文件核对清单">{report.pages.map(page => <li key={page.page} data-state={page.state}><b>第{page.page}页</b><span>{states[page.state]}{page.storage === 'embedded' ? ' · 随资料保存' : ''}</span></li>)}</ol></details>}
      {!stale && report.canRegenerate && <div className="sc-file-recovery"><p>原件可用，可以重新生成缺失或校验不符的原页。已保存的课程继续保留。</p><button type="button" disabled={busy || disabled || repairActive} onClick={() => void onRegenerate()}>重新生成原页</button></div>}
      {report.original === 'missing' && <p className="sc-pdf-notice">原始文件已缺失，可以在下方选择同一PDF恢复。已保存的正文仍保留。</p>}
      {report.original === 'mismatch' && <p className="sc-pdf-notice">原始文件校验不符，可以用同一PDF恢复原件；重新生成原页不能修复原件。</p>}
      {report.original === 'unknown' && <p className="sc-pdf-error">原始文件尚不能安全核对，请保留手头的原件并核对备份。系统不会替换未知文件或链接。</p>}
    </>}
    {material.kind!=='text'&&version&&<PdfOriginalRepair material={material} version={version} canStart={!stale&&Boolean(report&&['missing','mismatch'].includes(report.original))} disabled={busy||disabled||loading} onActiveChange={setRepairActive} onRecheck={()=>void check()} onCompleted={()=>void refreshAfterRepair()}/>}
    {error && <div className="sc-pdf-error" role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>读取最近检查结果</button></div>}
  </section>;
}
