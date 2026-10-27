'use client';
import * as React from 'react';
import type { TeachingToolRunView } from '@study-agent/contracts';
import { ApiRequestError, apiRequest } from '../../../lib/api';
import { refreshSessionUser } from '../../../lib/session-user';
import { topicCopies, topicStorage } from '../../studio/whiteboards/local-copies';
import { TeachingQuestionPreview } from './question-preview';
import { decodeTeachingControl, downloadTeaching, downloadTeachingText, unknownTeachingCopies, type TeachingControl } from './tool-draft';

export const teachingStatus: Record<TeachingToolRunView['status'], string> = { queued: '已排队', running: '正在生成', validating: '核对完整结果', completed: '草稿已生成', failed: '本次未完成', cancelling: '正在取消', cancelled: '已取消' };
const sourceLabel = { question: '题干', question_document: '原题结构', reference_answer: '参考答案', reference_analysis: '参考解析', submitted_answer: '待核对作答' };
export function TeachingRunDetail({ row, ownerId, onChanged, onCanLeaveChange, onReuse }: { row: TeachingToolRunView; ownerId: string;
  onChanged: (row: TeachingToolRunView) => void; onCanLeaveChange: (value: boolean) => void; onReuse: () => void }) {
  const storage = React.useMemo(() => topicStorage('studyagent.teaching-tool.control.v1.' + ownerId + '.' + row.id), [ownerId, row.id]);
  const [pending, setPending] = React.useState<TeachingControl | null>(null), live = React.useRef<TeachingControl | null>(null);
  const [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState(''), [storageError, setStorageError] = React.useState(false), [unreadable, setUnreadable] = React.useState<Array<{ key: string; raw: string }>>([]), [conflict, setConflict] = React.useState(false);
  const unknownUnstored = React.useRef<string | null>(null), unknownBackup = React.useRef<string | null>(null);
  const [copies, setCopies] = React.useState<Array<{ key: string; at: number; value: { pending: TeachingControl | null } }>>([]);
  const request = React.useRef<AbortController | null>(null), backup = React.useRef('');
  function remember(value: TeachingControl | null) {
    live.current = value; setPending(value); const text = JSON.stringify(value);
    try { if (unknownUnstored.current !== null) { localStorage.setItem(storage.base + '.unreadable.' + crypto.randomUUID(), unknownUnstored.current); unknownUnstored.current = null; }
      localStorage.setItem(storage.key, JSON.stringify({ version: 1, ownerId, runId: row.id, pending: value, at: Date.now() })); setStorageError(false); onCanLeaveChange(true); }
    catch { setStorageError(true); onCanLeaveChange((unknownUnstored.current === null || unknownBackup.current === unknownUnstored.current) && (!value || backup.current === text)); }
  }
  React.useEffect(() => {
    let restored: TeachingControl | null = null;
    try { setUnreadable(unknownTeachingCopies(storage, raw => Boolean(decodeTeachingControl(raw, ownerId, row.id))));
      for (const key of storage.restoreKeys) { const raw = localStorage.getItem(key); if (!raw) continue;
      const saved = decodeTeachingControl(raw, ownerId, row.id);
      if (saved) restored = saved.pending;
      else if (key === storage.key) unknownUnstored.current = raw; break; } } catch { setStorageError(true); }
    remember(restored); return () => request.current?.abort();
  }, [storage.key]);
  async function control(action?: 'cancel' | 'retry') {
    if (busy || !row.task) return; const original = live.current;
    if (action && original) { setNotice('先恢复原操作，确认其回执后再发起另一条命令。'); return; }
    const command = original ?? (action ? { runId: row.id, action, command: { requestKey: crypto.randomUUID(), generation: row.task.generation, version: row.task.version } } : null);
    if (!command) return; remember(command); const operation = new AbortController(); request.current?.abort(); request.current = operation; setBusy(true); setNotice('');
    try { const updated = await apiRequest<TeachingToolRunView>('/ai/teaching-tools/runs/' + encodeURIComponent(command.runId) + '/' + command.action,
      { method: 'POST', body: JSON.stringify(command.command), signal: operation.signal });
      if (!operation.signal.aborted) { remember(null); setConflict(false); onChanged(updated); setNotice('原操作回执已确认。'); }
    } catch (error) { if (!operation.signal.aborted) { if (error instanceof ApiRequestError && [401, 403].includes(error.status)) void refreshSessionUser(); else { setConflict(error instanceof ApiRequestError && error.status === 409); setNotice((error as Error).message); } } }
    finally { if (!operation.signal.aborted) setBusy(false); }
  }
  async function retainAndRead() {
    if (busy || !live.current || !conflict) return; setBusy(true); const operation = new AbortController(); request.current?.abort(); request.current = operation;
    try { const latest = await apiRequest<TeachingToolRunView>('/ai/teaching-tools/runs/' + encodeURIComponent(row.id), { signal: operation.signal }); if (operation.signal.aborted) return;
      try { localStorage.setItem(storage.base + '.' + crypto.randomUUID(), JSON.stringify({ version: 1, ownerId, runId: row.id, pending: live.current, at: Date.now() })); }
      catch { if (backup.current !== JSON.stringify(live.current)) throw Error('原操作副本未能保存，请先下载原操作，再核对最新状态。'); }
      remember(null); setConflict(false); onChanged(latest); setNotice('原操作副本已保留，已读取最新状态。需要取消或重试时，请再次明确操作。');
    } catch (error) { if (!operation.signal.aborted) { if (error instanceof ApiRequestError && [401, 403].includes(error.status)) void refreshSessionUser(); else setNotice((error as Error).message); } }
    finally { if (!operation.signal.aborted) setBusy(false); }
  }
  function download() { downloadTeaching({ run: row, pendingControl: live.current }, 'teaching-suggestion-and-original-operation.json'); backup.current = JSON.stringify(live.current); onCanLeaveChange(unknownUnstored.current === null || unknownBackup.current === unknownUnstored.current); setNotice('已下载完整草稿、原输入与未确认操作。'); }
  const analysis = row.result?.purpose === 'assessment_analysis' ? row.result.analysis : null, hint = row.result?.purpose === 'hint_draft' ? row.result : null;
  const errorMessage = row.task?.errorCode === 'teaching_context_changed' ? '原授权或题目范围已变化。请先核对当前权限与原题，再决定是否重试。'
    : row.task?.errorCode ? '本次没有取得可核对的完整草稿。原输入和模型仍保留，可明确使用原模型重试。' : '';
  return <section className="tt-detail" aria-label="教研建议原记录">
    <header className="tt-detail-head"><span className="tt-kicker">03 / 原记录</span><span className="tt-status" data-status={row.status}>{teachingStatus[row.status]}</span>
      <h2>{row.purpose === 'assessment_analysis' ? '答案分析建议' : '提示草稿'}</h2><p>{row.modelName} · {new Date(row.createdAt).toLocaleString('zh-CN')}</p><b className="tt-review-tag">尚未人工核对 · 仅为教研建议</b></header>
    {notice && <p role="status" className="tt-notice">{notice}</p>}{errorMessage && <p role="alert" className="tt-caution">{errorMessage}</p>}
    {storageError && pending && <p role="alert" className="tt-caution">原操作暂不能存到本机，请下载完整副本后再离开。</p>}
    {!!unreadable.length && <section className="tt-caution" aria-label="未识别的本机操作"><p>有 {unreadable.length} 份原操作暂不能读取，原件保持。</p>{unreadable.map((item, index) => <button type="button" key={item.key} onClick={() => { downloadTeachingText(item.raw, 'original-teaching-operation.json'); unknownBackup.current = item.raw; onCanLeaveChange((unknownUnstored.current === null || unknownBackup.current === unknownUnstored.current) && (!storageError || !live.current || backup.current === JSON.stringify(live.current))); }}>下载暂不能读取的原操作 {index + 1}</button>)}</section>}
    {pending && <div className="tt-pending"><p>有一条原{pending.action === 'retry' ? '重试' : '取消'}命令待确认。恢复将使用同一请求键和原模型。</p><button type="button" disabled={busy} onClick={() => void control()}>恢复原操作</button><button type="button" onClick={download}>下载原操作</button>{conflict && <button type="button" disabled={busy} onClick={() => void retainAndRead()}>保留原操作副本，核对最新状态</button>}</div>}
    {analysis && <div className="tt-analysis"><p className="tt-summary">{analysis.summary}</p>
      <dl className="tt-analysis-facts"><div><dt>建议判断</dt><dd>{({ correct: '可能正确', incorrect: '可能有误', uncertain: '保持未知' })[analysis.judgement]}</dd></div>
        <div><dt>建议置信度</dt><dd>{({ low: '低', medium: '中', high: '高' })[analysis.confidenceLevel]}</dd></div></dl>
      <h3>观察与原文依据</h3>{analysis.observations.map((item, index) => <article className="tt-observation" key={index}><small>{sourceLabel[item.source]}</small><blockquote>{item.quote}</blockquote><p>{item.observation}</p></article>)}
      <h3>还不能确定什么</h3>{analysis.uncertainties.length ? <ul>{analysis.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>本次未另列未知，仍须人工核对输入与解释。</p>}
      <h3>怎样进一步验证</h3><ol>{analysis.verificationSteps.map((item, index) => <li key={index}>{item}</li>)}</ol>
    </div>}
    {hint && <div className="tt-hint"><span className="tt-kicker">帮助层级 {hint.hint.suggestedLevel}</span><p className="tt-summary">{hint.hint.hint}</p><h3>关注点</h3><p>{hint.hint.focus}</p><h3>使用前核对</h3><p>{hint.hint.reviewAdvice}</p>
      {!!hint.warnings.length && <p className="tt-caution">提示与参考答案有文字重合，请人工检查是否透露最终答案。自动检查不能保证语义上没有泄露。</p>}</div>}
    {!row.result && ['queued', 'running', 'validating', 'cancelling'].includes(row.status) && <p className="tt-waiting" role="status">{teachingStatus[row.status]}。关闭页面不会重新生成，可从原记录继续查看。</p>}
    <div className="tt-actions"><button type="button" onClick={download}>下载完整草稿</button><button type="button" className="tt-link" onClick={onReuse}>用原输入另建建议</button>
      {['failed', 'cancelled'].includes(row.status) && <button type="button" disabled={busy || !!pending || !row.task} onClick={() => void control('retry')}>使用原模型重试 · {row.modelName}</button>}
      {['queued', 'running', 'validating'].includes(row.status) && <button type="button" disabled={busy || !!pending || !row.task} onClick={() => void control('cancel')}>取消本次生成</button>}</div>
    <p className="tt-muted">这些建议没有改变原题、首次作答、正式评分或能力记录。用于教学内容前，继续走现有内容审核。</p>
    <details className="tt-frozen"><summary>完整原题与本次输入</summary><TeachingQuestionPreview snapshot={row.snapshot}/></details>
    <details className="tt-copies"><summary onClick={() => { try { setCopies(topicCopies(storage, raw => decodeTeachingControl(raw, ownerId, row.id), 2_000_000).filter(item => item.value.pending)); } catch { setNotice('暂不能读取本机原操作副本，当前记录保持。'); } }}>本机原操作副本</summary>
      {!copies.length && <p>暂无其他可读取的原操作副本。</p>}{copies.map(item => <article key={item.key}><p>{item.value.pending?.action === 'cancel' ? '取消' : '重试'} · {new Date(item.at).toLocaleString('zh-CN')}</p><p>此副本只供核对，不会执行命令。</p><button type="button" onClick={() => downloadTeaching(item.value, 'archived-teaching-operation.json')}>下载原操作副本</button></article>)}</details>
    <details><summary>原请求与完整结果</summary><pre className="tt-json">{JSON.stringify(row, null, 2)}</pre></details>
  </section>;
}
