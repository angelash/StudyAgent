'use client';
import * as React from 'react';
import type { AnswerDraftReceipt, AnswerDraftSave, AnswerDraftState, StudentAnswerPayload } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from './api';

type Kind = 'diagnostic' | 'practice';
type Submission = { requestKey: string; draftFence: { actorId: string; revision: number; baseHash: string; attempt: number }; [key: string]: unknown };
type Cache = { version: 2; baseHash: string; baseRevision: number; openedAt: number; answer: StudentAnswerPayload;
  pendingSave: AnswerDraftSave | null; pendingSubmission: Submission | null; retrying: boolean; localUpdatedAt?: string };
export type AnswerDraftContext = { kind: Kind; sessionId: string; itemId: string; path: string; responsesPath: string; state: AnswerDraftState; retrying?: boolean };
type Phase = 'loading' | 'saved' | 'editing' | 'saving' | 'offline' | 'conflict' | 'submitting';
type RemoteCopy = { answer: StudentAnswerPayload | null; state: AnswerDraftState };
type Scope = AnswerDraftContext & { epoch: string; key: string; outbox: string; answer: StudentAnswerPayload; serverAnswer: StudentAnswerPayload;
  openedAt: number; retrying: boolean; pendingSave: AnswerDraftSave | null; pendingSubmission: Submission | null; phase: Phase; notice: string;
  remote: AnswerDraftState; localBaseHash: string; localRevision: number; localUpdatedAt: string; conflictRemote?: RemoteCopy; saving?: Promise<AnswerDraftState>; request?: AbortController; timer?: ReturnType<typeof setTimeout> };
const keyFor = (owner: string, kind: Kind, sessionId: string, itemId: string) => 'studyagent.answer.draft.' + JSON.stringify([owner, kind, sessionId, itemId]);
const outboxFor = (owner: string, kind: Kind, sessionId: string) => 'studyagent.answer.submit.' + JSON.stringify([owner, kind, sessionId]);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
  return value;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function cache(key: string): Cache | null {
  try { const raw = sessionStorage.getItem(key); if (!raw || raw.length > 400000) return null;
    const data = JSON.parse(raw) as Cache;
    return data?.version === 2 && typeof data.baseHash === 'string' && Number.isSafeInteger(data.baseRevision) && data.baseRevision >= 0 &&
      Number.isFinite(data.openedAt) && data.openedAt > 0 && data.openedAt <= Date.now() && data.answer && typeof data.answer.questionId === 'string' && typeof data.answer.mode === 'string' && data.answer.response && typeof data.answer.response === 'object' ? data : null;
  } catch { return null; }
}
/** Resolve the original command before selecting a new question. The live identity owns its outbox. */
export async function recoverPendingAnswerSubmission(kind: Kind, sessionId: string) {
  const user = await apiRequest<{ id: string }>('/auth/me'), outbox = outboxFor(user.id, kind, sessionId);
  let entry: { key: string; path: string; command: Submission } | null = null;
  try { const raw = sessionStorage.getItem(outbox); if (raw && raw.length < 400000) entry = JSON.parse(raw); } catch { /* The current server activity remains readable. */ }
  const expectedPath = kind === 'diagnostic' ? '/diagnostics/sessions/' + sessionId + '/responses' : '/learning/practice/' + sessionId + '/responses';
  const itemId = entry?.command?.[kind === 'diagnostic' ? 'itemId' : 'questionId'];
  if (!entry || entry.path !== expectedPath || entry.command?.draftFence?.actorId !== user.id || typeof entry.command.requestKey !== 'string' ||
    typeof itemId !== 'string' || entry.key !== keyFor(user.id, kind, sessionId, itemId)) return;
  await apiRequest(entry.path, { method: 'POST', body: JSON.stringify(entry.command) });
  try { const old = cache(entry.key); if (old?.pendingSubmission?.requestKey === entry.command.requestKey) sessionStorage.removeItem(entry.key); sessionStorage.removeItem(outbox); } catch { /* Confirmed server submission is authoritative. */ }
}

export function useAnswerDraft() {
  const current = React.useRef<Scope | null>(null), mounted = React.useRef(true);
  const [view, setView] = React.useState<{ answer: StudentAnswerPayload | null; phase: Phase; notice: string; epoch: string; pendingSubmission: boolean; state: AnswerDraftState | null; localUpdatedAt?: string; conflictRemote?: RemoteCopy }>({ answer: null, phase: 'loading', notice: '', epoch: '', pendingSubmission: false, state: null });
  function publish(s: Scope) { if (mounted.current && current.current === s) setView({ answer: s.answer, phase: s.phase, notice: s.notice, epoch: s.epoch, pendingSubmission: !!s.pendingSubmission, state: s.remote, localUpdatedAt: s.localUpdatedAt, conflictRemote: s.conflictRemote }); }
  function remember(s: Scope) {
    try {
      const value: Cache = { version: 2, baseHash: s.localBaseHash, baseRevision: s.localRevision, answer: s.answer, openedAt: s.openedAt, pendingSave: s.pendingSave, pendingSubmission: s.pendingSubmission, retrying: s.retrying, localUpdatedAt: s.localUpdatedAt };
      sessionStorage.setItem(s.key, JSON.stringify(value));
      if (s.pendingSubmission) sessionStorage.setItem(s.outbox, JSON.stringify({ key: s.key, path: s.responsesPath, command: s.pendingSubmission }));
    } catch { s.notice = '本标签页暂不能保留离线副本，请保持页面打开，并下载你的作答。'; }
  }
  function clear(s: Scope) { try { sessionStorage.removeItem(s.key); if (s.pendingSubmission) sessionStorage.removeItem(s.outbox); } catch { /* The live answer remains in memory. */ } }
  function deactivate(s: Scope | null) { if (!s) return; if (s.timer) clearTimeout(s.timer); s.request?.abort(); }
  function reset() { deactivate(current.current); current.current = null; if (mounted.current) setView({ answer: null, phase: 'loading', notice: '', epoch: '', pendingSubmission: false, state: null }); }
  function open(context: AnswerDraftContext, initial: StudentAnswerPayload) {
    deactivate(current.current);
    const s: Scope = { ...context, epoch: crypto.randomUUID(), key: keyFor(context.state.actorId, context.kind, context.sessionId, context.itemId), outbox: outboxFor(context.state.actorId, context.kind, context.sessionId),
      answer: initial, serverAnswer: initial, openedAt: Date.now(), localBaseHash: context.state.baseHash, localRevision: context.state.revision, localUpdatedAt: new Date().toISOString(), retrying: !!context.retrying, pendingSave: null, pendingSubmission: null, phase: 'saved', notice: '', remote: context.state };
    current.current = s;
    const prior = cache(s.key);
    if (prior && prior.answer.questionId === initial.questionId && prior.answer.mode === initial.mode) {
      s.answer = prior.answer; s.openedAt = prior.openedAt; s.pendingSave = prior.pendingSave; s.pendingSubmission = prior.pendingSubmission;
      s.localBaseHash = prior.baseHash; s.localRevision = prior.baseRevision;
      s.localUpdatedAt = typeof prior.localUpdatedAt === 'string' && Number.isFinite(Date.parse(prior.localUpdatedAt)) ? prior.localUpdatedAt : new Date(prior.openedAt).toISOString();
      if (prior.baseHash === context.state.baseHash && prior.retrying) s.retrying = true;
      if (s.pendingSubmission) { s.phase = 'submitting'; s.notice = '上一次提交尚待确认，请核对原提交后再继续。'; }
      else if (prior.baseHash !== context.state.baseHash || !s.pendingSave && prior.baseRevision !== context.state.revision && !equal(prior.answer, initial)) {
        s.phase = 'conflict'; s.conflictRemote = { answer: initial, state: context.state }; s.notice = '另一个页面或作答次数已有变化，本地输入已保留，请选择要继续的版本。';
      } else if (s.pendingSave || !equal(prior.answer, initial)) { s.phase = 'editing'; s.timer = setTimeout(() => void flushScope(s).catch(() => undefined), 300); }
      else clear(s);
    }
    publish(s);
    return { retrying: s.retrying };
  }
  async function flushScope(s: Scope): Promise<AnswerDraftState> {
    if (s.timer) clearTimeout(s.timer);
    if (current.current !== s) throw new Error('题目已切换，原稿仍在本标签页保留。');
    if (s.saving) { await s.saving; return flushScope(s); }
    if (s.phase === 'conflict') throw new Error('请先核对两份草稿，原输入已保留。');
    if (s.pendingSubmission) throw new Error('请先核对原提交。');
    if (!s.pendingSave && equal(s.answer, s.serverAnswer)) { s.phase = 'saved'; publish(s); return s.remote; }
    const command = s.pendingSave ?? { protocol: 'answer-draft-v2' as const, actorId: s.remote.actorId, expectedRevision: s.remote.revision, baseHash: s.remote.baseHash, attempt: s.remote.attempt, requestKey: crypto.randomUUID(), answer: structuredClone(s.answer) };
    s.pendingSave = command; s.phase = 'saving'; remember(s); publish(s);
    const controller = new AbortController(); s.request = controller;
    const promise = (async () => {
      try {
        const ack = await apiRequest<AnswerDraftReceipt>(s.path + '/draft', { method: 'PATCH', body: JSON.stringify(command), signal: controller.signal });
        if (current.current !== s || controller.signal.aborted) throw new Error('原保存等待已停止，回执可在下次恢复时核对。');
        s.pendingSave = null;
        if (ack.acknowledgedRevision !== ack.currentRevision || ack.draftState.baseHash !== s.remote.baseHash || ack.draftState.actorId !== s.remote.actorId) {
          s.phase = 'conflict'; s.notice = '原保存已确认，但其他页面又有更新；本地输入已保留。'; remember(s); publish(s); throw new Error(s.notice);
        }
        s.remote = ack.draftState; s.localRevision = ack.currentRevision; s.localBaseHash = ack.draftState.baseHash; s.serverAnswer = structuredClone(command.answer) as StudentAnswerPayload;
        s.phase = equal(s.answer, s.serverAnswer) ? 'saved' : 'editing'; s.notice = ''; remember(s); publish(s); return s.remote;
      } catch (error) {
        if (current.current === s && !controller.signal.aborted) {
          s.phase = s.phase === 'conflict' || error instanceof ApiRequestError && error.status === 409 ? 'conflict' : 'offline';
          if (s.phase === 'conflict') {
            try { const latest = await apiRequest<{ draft: StudentAnswerPayload | { answer: StudentAnswerPayload } | null; draftState: AnswerDraftState }>(s.path, { signal: controller.signal });
              if (current.current === s && !controller.signal.aborted) s.conflictRemote = { answer: latest.draft && 'answer' in latest.draft ? latest.draft.answer : latest.draft as StudentAnswerPayload | null, state: latest.draftState };
            } catch { /* A comparison read never replaces the local buffer or erases its command. */ }
          }
          if (current.current !== s || controller.signal.aborted) throw error;
          s.notice = (error as Error).message + ' 你的本地输入仍然保留。'; remember(s); publish(s);
        }
        throw error;
      } finally { if (s.request === controller) s.request = undefined; s.saving = undefined; }
    })();
    s.saving = promise; await promise;
    return equal(s.answer, s.serverAnswer) ? s.remote : flushScope(s);
  }
  async function flush() { const s = current.current; if (!s) throw new Error('题目尚未打开'); return flushScope(s); }
  function change(next: StudentAnswerPayload) {
    const s = current.current; if (!s || s.epoch !== view.epoch || s.pendingSubmission) return;
    s.answer = next; s.localUpdatedAt = new Date().toISOString(); if (s.phase !== 'conflict') s.phase = 'editing'; remember(s); publish(s);
    if (s.timer) clearTimeout(s.timer); if (s.phase !== 'conflict') s.timer = setTimeout(() => void flushScope(s).catch(() => undefined), 700);
  }
  async function submit<T>(disposition: 'answered'|'dont_know'|'skip') {
    const s = current.current; if (!s) throw new Error('题目尚未打开');
    if (!s.pendingSubmission) {
      const state = await flushScope(s); if (current.current !== s) throw new Error('当前题目已变化');
      const { actorId, revision, baseHash, attempt } = state;
      s.pendingSubmission = { requestKey: crypto.randomUUID(), [s.kind === 'diagnostic' ? 'itemId' : 'questionId']: s.itemId,
        ...(disposition === 'answered' ? { answer: structuredClone(s.answer) } : {}), disposition, elapsedMs: Math.max(0, Math.min(3600000, Date.now() - s.openedAt)), draftFence: { actorId, revision, baseHash, attempt } };
      remember(s);
    }
    if (s.timer) clearTimeout(s.timer); s.phase = 'submitting'; publish(s); const controller = new AbortController(); s.request = controller;
    try { const result = await apiRequest<T>(s.responsesPath, { method: 'POST', body: JSON.stringify(s.pendingSubmission), signal: controller.signal });
      if (controller.signal.aborted || current.current !== s) throw new Error('已停止等待，原提交仍可核对。'); return result;
    } catch (error) { if (current.current === s) { s.notice = '提交尚待核对：' + (error as Error).message; publish(s); } throw error; }
    finally { if (s.request === controller) s.request = undefined; }
  }
  function confirmed() { const s = current.current; if (!s) return; clear(s); s.pendingSubmission = null; s.phase = 'saved'; s.notice = ''; publish(s); }
  function beginRetry() { const s = current.current; if (!s || s.pendingSubmission || s.phase === 'conflict' || s.localBaseHash !== s.remote.baseHash) return; s.retrying = true; s.openedAt = Date.now(); remember(s); publish(s); }
  function stopWaiting() { const s = current.current; if (!s) return; s.request?.abort(); s.notice = '已停止等待。原命令和本地稿都保留，可重新核对。'; publish(s); }
  function download() {
    const s = current.current; if (!s) return;
    const blob = new Blob([JSON.stringify({ format: 'study-agent-answer-copy-v2', kind: s.kind, sessionId: s.sessionId, itemId: s.itemId, localAnswer: s.answer, savedRevision: s.remote.revision, savedAt: s.remote.savedAt, pendingSave: s.pendingSave, pendingSubmission: s.pendingSubmission }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = '我的作答-' + s.kind + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function prepareToLeave() {
    const scope = current.current; if (!scope) return true;
    try { await flush(); return mounted.current && current.current === scope; }
    catch { if (!mounted.current || current.current !== scope || !window.confirm('当前作答尚未与服务端核对。选择确定会下载完整副本，并在本标签页保留原命令后离开；选择取消可继续核对。')) return false; download(); return true; }
  }
  async function resolve(useLocal: boolean) {
    const s = current.current; if (!s || s.pendingSubmission) throw new Error('请先核对原提交'); download();
    const read = await apiRequest<{ draft: StudentAnswerPayload | { answer: StudentAnswerPayload } | null; draftState: AnswerDraftState }>(s.path);
    if (current.current !== s) throw new Error('题目已切换，原本地副本已保留。');
    const remote = read.draft && 'answer' in read.draft ? read.draft.answer : read.draft as StudentAnswerPayload | null;
    if (useLocal && (read.draftState.baseHash !== s.localBaseHash || read.draftState.actorId !== s.state.actorId || !read.draftState.editable)) throw new Error('题目或作答次数已变化，请保留下载副本并读取当前记录；新的订正需明确选择“再想一次”。');
    s.pendingSave = null; s.remote = read.draftState; s.serverAnswer = remote ?? { ...s.answer, response: {} }; s.state = read.draftState;
    s.localRevision = read.draftState.revision; s.localBaseHash = read.draftState.baseHash;
    if (!useLocal) { s.answer = s.serverAnswer; s.openedAt = Date.now(); }
    s.phase = useLocal ? 'editing' : 'saved'; s.conflictRemote = undefined; s.notice = ''; remember(s); publish(s); if (useLocal) await flushScope(s);
  }
  React.useEffect(() => {
    mounted.current = true;
    const before = (event: BeforeUnloadEvent) => { const s = current.current; if (s && (s.pendingSave || s.pendingSubmission || !equal(s.answer, s.serverAnswer))) { event.preventDefault(); } };
    const online = () => { const s = current.current; if (s && !s.pendingSubmission && s.phase === 'offline') void flushScope(s).catch(() => undefined); };
    window.addEventListener('beforeunload', before); window.addEventListener('online', online);
    return () => { mounted.current = false; deactivate(current.current); window.removeEventListener('beforeunload', before); window.removeEventListener('online', online); };
    // Scope objects retain their exact request and buffer across asynchronous continuations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ...view, open, reset, change, flush, submit, confirmed, stopWaiting, download, resolve, beginRetry, prepareToLeave,
    matches: (kind: Kind, sessionId: string, itemId: string) => { const s = current.current; return !!s && s.epoch === view.epoch && s.kind === kind && s.sessionId === sessionId && s.itemId === itemId; },
    isCurrent: (epoch: string) => current.current?.epoch === epoch,
    label: view.phase === 'saved' && !view.state?.savedAt ? view.state?.hasSubmission ? '本次作答已保存' : '尚未填写' :
      ({ loading: '正在读取草稿', saved: '草稿已保存', editing: '草稿待保存', saving: '正在保存草稿', offline: '仅本地草稿', conflict: '草稿版本有冲突', submitting: '原提交待核对' } as Record<Phase, string>)[view.phase] };
}
