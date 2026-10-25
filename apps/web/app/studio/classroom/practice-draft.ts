'use client';
import * as React from 'react';
import type { ClassroomAnswerDisposition, ClassroomSessionView } from '@study-agent/contracts';
import { normalizeClassroomSelection } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../../../lib/api';

type Command = { protocol: 'classroom-choice-v2'; questionId: string; selectedIndices: number[];
  disposition: ClassroomAnswerDisposition; hintUsed: boolean; requestKey: string };
type Draft = { version: 1; ownerId: string; sessionId: string; fingerprint: string;
  choices: Record<string, number[]>; pending: Command | null; rejected: Command | null };

function decode(raw: string, session: ClassroomSessionView): Draft | null {
  try {
    const value = JSON.parse(raw) as Draft;
    if (value.version !== 1 || value.ownerId !== session.ownerUserId || value.sessionId !== session.id || value.fingerprint !== session.contentFingerprint ||
      !value.choices || typeof value.choices !== 'object' || Array.isArray(value.choices)) return null;
    for (const [id, indices] of Object.entries(value.choices)) {
      const question = session.lesson.questions.find(q => q.id === id);
      if (!question || !Array.isArray(indices)) return null;
      normalizeClassroomSelection(question.selectionMode ?? 'single', question.options.length, indices, indices.length ? 'answered' : 'skip');
    }
    for (const command of [value.pending, value.rejected].filter(Boolean) as Command[]) {
      const question = session.lesson.questions.find(q => q.id === command.questionId);
      if (!question || command.protocol !== 'classroom-choice-v2' || typeof command.requestKey !== 'string' || command.requestKey.length < 8 ||
        command.requestKey.length > 180 || typeof command.hintUsed !== 'boolean' ||
        Object.keys(command).some(key => !['protocol','questionId','selectedIndices','disposition','hintUsed','requestKey'].includes(key))) return null;
      normalizeClassroomSelection(question.selectionMode ?? 'single', question.options.length, command.selectedIndices, command.disposition);
    }
    if (value.pending !== null && !value.pending || value.rejected !== undefined && value.rejected !== null && !value.rejected) return null;
    // Only known fields are retained; tokens and answers never enter this cache.
    return { version: 1, ownerId: value.ownerId, sessionId: value.sessionId, fingerprint: value.fingerprint, choices: value.choices, pending: value.pending, rejected: value.rejected ?? null };
  } catch { return null; }
}

export function usePracticeDraft(session: ClassroomSessionView, onSession: (value: ClassroomSessionView) => void) {
  const key = 'studyagent.classroom.choices.v1.' + encodeURIComponent(session.ownerUserId) + '.' + encodeURIComponent(session.id);
  const [choices, setChoices] = React.useState<Record<string, number[]>>({}), [pending, setPending] = React.useState<Command | null>(null);
  const [ready, setReady] = React.useState(false), [working, setWorking] = React.useState(false), [notice, setNotice] = React.useState('');
  const [rejected, setRejected] = React.useState<Command | null>(null);
  const [storageNotice, setStorageNotice] = React.useState('');
  const draft = React.useRef<Draft | null>(null), epoch = React.useRef(0), sending = React.useRef(false);
  const controllers = React.useRef(new Set<AbortController>()), current = React.useRef(session); current.current = session;
  function write(value: Draft) {
    draft.current = value; setChoices(value.choices); setPending(value.pending); setRejected(value.rejected);
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { setStorageNotice('本机暂存不可用。当前选择和原提交仍在内存中，请下载副本后再刷新。'); }
  }
  React.useEffect(() => {
    const revision = ++epoch.current; setReady(false); setWorking(false); sending.current = false; setNotice(''); setStorageNotice('');
    let restored: Draft | null = null;
    try { const raw = localStorage.getItem(key); if (raw) { restored = decode(raw, current.current); if (!restored) setStorageNotice('本机记录与这份冻结题目不匹配，已保留原缓存并忽略恢复。'); } }
    catch { setStorageNotice('本机暂存不可用，当前选择可下载副本。'); }
    draft.current = restored ?? { version: 1, ownerId: session.ownerUserId, sessionId: session.id, fingerprint: session.contentFingerprint, choices: {}, pending: null, rejected: null };
    if (draft.current.pending && session.answers.some(a => a.questionId === draft.current!.pending!.questionId)) write({ ...draft.current, pending: null });
    else { setChoices(draft.current.choices); setPending(draft.current.pending); setRejected(draft.current.rejected); }
    if (epoch.current === revision) setReady(true);
    return () => { epoch.current++; for (const controller of controllers.current) controller.abort(); controllers.current.clear(); };
  }, [key, session.contentFingerprint]);
  React.useEffect(() => {
    const value = draft.current;
    if (ready && value?.pending && session.answers.some(a => a.questionId === value.pending!.questionId)) write({ ...value, pending: null });
  }, [session.answers, ready]);
  function select(id: string, index: number) {
    const value = draft.current, question = current.current.lesson.questions.find(q => q.id === id);
    if (!ready || sending.current || value?.pending || !value || !question || current.current.answers.some(a => a.questionId === id)) return;
    const previous = value.choices[id] ?? [], next = question.selectionMode === 'multiple' ? previous.includes(index) ? previous.filter(i => i !== index) : [...previous, index] : [index];
    const normalized = normalizeClassroomSelection(question.selectionMode ?? 'single', question.options.length, next, next.length ? 'answered' : 'skip');
    write({ ...value, choices: { ...value.choices, [id]: normalized } });
  }
  async function submit(questionId?: string, disposition: ClassroomAnswerDisposition = 'answered') {
    const value = draft.current; if (!ready || !value || sending.current) return;
    const revision = epoch.current, controller = new AbortController(); controllers.current.add(controller); sending.current = true; setWorking(true); setNotice('');
    try {
      let command = value.pending;
      if (!command) {
        const question = current.current.lesson.questions.find(q => q.id === questionId);
        if (!question || current.current.answers.some(a => a.questionId === question.id)) return;
        const indices = normalizeClassroomSelection(question.selectionMode ?? 'single', question.options.length, disposition === 'answered' ? value.choices[question.id] ?? [] : [], disposition);
        command = { protocol: 'classroom-choice-v2', questionId: question.id, selectedIndices: indices, disposition,
          hintUsed: !!current.current.hintedQuestionIds?.includes(question.id), requestKey: crypto.randomUUID() };
        write({ ...value, pending: command });
      } else {
        const saved = await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/' + value.sessionId, { signal: controller.signal });
        if (epoch.current !== revision) return;
        onSession(saved);
        if (saved.answers.some(a => a.questionId === command!.questionId)) {
          write({ ...draft.current!, pending: null }); setNotice('已读取服务端保存的首次作答。'); return;
        }
      }
      const saved = await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/' + value.sessionId + '/answers', {
        method: 'POST', body: JSON.stringify(command), signal: controller.signal });
      if (epoch.current !== revision) return;
      onSession(saved); write({ ...draft.current!, pending: null });
    } catch (error) {
      if (epoch.current === revision && (error as Error).name !== 'AbortError') {
        setNotice((error as Error).message + (draft.current?.pending ? ' 原提交已保留，请读取并恢复原提交。' : ''));
        if (error instanceof ApiRequestError && [400,409].includes(error.status) && draft.current?.pending) {
          try {
            const saved = await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/' + value.sessionId, { signal: controller.signal });
            if (epoch.current !== revision) return;
            onSession(saved); const original = draft.current!.pending;
            if (original && !saved.answers.some(answer => answer.questionId === original.questionId)) {
              write({ ...draft.current!, pending: null, rejected: original });
              setNotice('服务器已明确拒绝原提交，且当前未记录本题首答。原命令保留在副本中，可核对选择后重新提交。');
            } else { write({ ...draft.current!, pending: null }); setNotice('已读取服务端保存的首次作答。'); }
          } catch { /* A failed verification must retain the original unacknowledged command. */ }
        }
      }
    } finally { controllers.current.delete(controller); if (epoch.current === revision) { sending.current = false; setWorking(false); } }
  }
  function clear(questionId: string) {
    const value = draft.current; if (!ready || !value || value.pending || sending.current || current.current.answers.some(a => a.questionId === questionId)) return;
    write({ ...value, choices: { ...value.choices, [questionId]: [] } });
  }
  function download() {
    if (!draft.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft.current, null, 2)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = '课堂选择与原提交副本.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { choices, pending, rejected, ready, working, notice, storageNotice, select, submit, clear, download };
}
