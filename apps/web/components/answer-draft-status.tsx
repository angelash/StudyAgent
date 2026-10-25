'use client';
import * as React from 'react';
import type { useAnswerDraft } from '../lib/answer-draft';
import { AnswerEvidenceView } from './answer-evidence-view';
import type { QuestionAnswerSchema } from '@study-agent/contracts';

export function AnswerDraftStatus({ draft, schema, onRecover, onReadActivity }: { draft: ReturnType<typeof useAnswerDraft>; schema?: QuestionAnswerSchema; onRecover: () => Promise<void>; onReadActivity: () => Promise<void> }) {
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  async function run(action: () => Promise<unknown>) { const epoch = draft.epoch; setBusy(true); setError(''); try { await action(); } catch (caught) { if (draft.isCurrent(epoch)) setError((caught as Error).message); } finally { if (draft.isCurrent(epoch)) setBusy(false); } }
  React.useEffect(() => { setBusy(false); setError(''); }, [draft.epoch]);
  if (['loading', 'saved', 'editing', 'saving'].includes(draft.phase) && !draft.notice && !draft.pendingSubmission) return null;
  return <div className="studio-hint answer-draft-status" aria-label="作答保存状态">
    <p role="status">{draft.notice || draft.label}</p>{error && <p role="alert">{error}</p>}
    {draft.phase === 'conflict' && <div className="answer-draft-comparison"><section><h4>当前这题的本地稿</h4><small>{draft.localUpdatedAt ? new Date(draft.localUpdatedAt).toLocaleString('zh-CN') : '保留在本标签页'}</small><AnswerEvidenceView schema={schema} answer={draft.answer} /></section><section><h4>刚读取到的服务端记录</h4><small>{draft.conflictRemote?.state.savedAt ? new Date(draft.conflictRemote.state.savedAt).toLocaleString('zh-CN') : '暂未确认保存时间'}</small>{draft.conflictRemote?.answer ? <AnswerEvidenceView schema={schema} answer={draft.conflictRemote.answer} /> : <p>{draft.conflictRemote?.state.hasSubmission ? '这道题已经有正式提交，请读取已保存记录。' : '暂未读取到可比较的草稿，请保留本地副本后再核对。'}</p>}</section></div>}
    <div className="daily-buttons">
      {draft.pendingSubmission ? <><button className="studio-secondary" disabled={busy} onClick={() => run(onRecover)}>核对原提交</button><button className="studio-text-button" onClick={draft.stopWaiting}>停止等待</button><button className="studio-text-button" disabled={busy} onClick={() => run(async () => { draft.download(); await onReadActivity(); })}>下载副本并读取已保存记录</button></> :
        draft.phase === 'conflict' ? <><button className="studio-secondary" disabled={busy} onClick={() => run(async () => { await draft.resolve(false); await onReadActivity(); })}>保留副本，读取服务端稿</button><button className="studio-secondary" disabled={busy} onClick={() => run(() => draft.resolve(true))}>保留副本，继续本地稿</button></> :
          <button className="studio-secondary" disabled={busy || draft.phase === 'saving'} onClick={() => run(draft.flush)}>重试保存</button>}
      <button className="studio-text-button" onClick={draft.download}>下载我的作答</button>
    </div>
  </div>;
}
