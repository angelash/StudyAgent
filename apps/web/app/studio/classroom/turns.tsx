'use client';
import * as React from 'react';
import { classroomTurnIntents, type ClassroomSessionView, type ClassroomTurnCommand, type ClassroomTurnIntent, type ClassroomTurnView } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';

const active = (turn: ClassroomTurnView | null) => Boolean(turn && ['queued', 'running', 'cancelling'].includes(turn.status));
export function useClassroomTurns({ session, onSession, onNotice }: { session: ClassroomSessionView;
  onSession: (value: ClassroomSessionView) => unknown; onNotice: (message: string) => void }) {
  const [turn, setTurn] = React.useState<ClassroomTurnView | null>(null), [uncertain, setUncertain] = React.useState<ClassroomTurnCommand | null>(null);
  const [working, setWorking] = React.useState(false), [loaded, setLoaded] = React.useState(false);
  const latest = React.useRef({ onSession, onNotice }); latest.current = { onSession, onNotice };
  const pending = React.useRef<ClassroomTurnCommand | null>(null), current = React.useRef<ClassroomTurnView | null>(null);
  const path = '/learning/classroom/sessions/' + session.id, storageKey = 'studyagent.classroom.turn.' + session.ownerUserId + '.' + session.id;
  const completed = React.useRef('');
  function keep(command: ClassroomTurnCommand | null) {
    pending.current = command; setUncertain(command);
    try { if (command) sessionStorage.setItem(storageKey, JSON.stringify(command)); else sessionStorage.removeItem(storageKey); } catch { /* Server records still recover after an acknowledged request. */ }
  }
  async function receive(value: ClassroomTurnView, signal?: AbortSignal) {
    if (signal?.aborted) return;
    current.current = value; setTurn(value);
    if (pending.current?.requestKey === value.requestKey) keep(null);
    if (value.status === 'completed' && completed.current !== value.id) {
      const saved = await apiRequest<ClassroomSessionView>(path, { signal });
      if (signal?.aborted) return;
      completed.current = value.id; latest.current.onSession(saved);
      latest.current.onNotice('回答已保存。可以朗读回答，或回到提问时的原句继续。');
    }
  }
  React.useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as ClassroomTurnCommand | null;
      if (raw && typeof raw.requestKey === 'string' && typeof raw.message === 'string' && raw.message.length <= 2000) { pending.current = raw; setUncertain(raw); }
    } catch { /* An invalid optional local record is ignored. */ }
    async function refresh() {
      try {
        const values = await apiRequest<ClassroomTurnView[]>(path + '/turns', { signal: controller.signal });
        if (controller.signal.aborted) return;
        const value = values.find(value => value.requestKey === pending.current?.requestKey) ?? [...values].reverse().find(value => active(value)) ?? values.at(-1);
        if (value) await receive(value, controller.signal);
        setLoaded(true);
      } catch (error) { if (!controller.signal.aborted) latest.current.onNotice((error as Error).message); }
      if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), active(current.current) ? 1200 : 5000);
    }
    void refresh();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
    // Identity scopes both server records and the optional local receipt. Exiting stops polling, not the saved task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, storageKey]);
  async function send(command: ClassroomTurnCommand) {
    keep(command); setWorking(true);
    try { const value = await apiRequest<ClassroomTurnView>(path + '/turns', { method: 'POST', body: JSON.stringify(command) }); await receive(value);
      if (value.status !== 'completed') latest.current.onSession(await apiRequest<ClassroomSessionView>(path));
      return value;
    } catch (error) { latest.current.onNotice((error as Error).message + ' 可找回这次提问，或保留内容后修改问题。'); return null; }
    finally { setWorking(false); }
  }
  async function control(action: 'cancel' | 'retry') {
    if (!current.current?.task) return;
    setWorking(true);
    try { const value = current.current; await receive(await apiRequest<ClassroomTurnView>(path + '/turns/' + value.id + '/' + action,
      { method: 'POST', body: JSON.stringify({ generation: value.task!.generation, version: value.task!.version }) }));
    } catch (error) { latest.current.onNotice((error as Error).message); } finally { setWorking(false); }
  }
  return { turn, uncertain, working, loaded, active: active(turn), send, control, discard: () => keep(null) };
}

export function ClassroomIntentPicker({ value, disabled, onChange }: { value: ClassroomTurnIntent; disabled: boolean;
  onChange: (value: ClassroomTurnIntent, prompt: string) => void }) {
  return <div className="cl-intents" role="group" aria-label="调整讲法">{classroomTurnIntents.map(item => <button key={item.id}
    type="button" disabled={disabled} aria-pressed={value === item.id} onClick={() => onChange(item.id, item.prompt)}>{item.label}</button>)}</div>;
}

export function ClassroomTurnStatus({ state, onReturn, onEdit }: { state: ReturnType<typeof useClassroomTurns>; onReturn: (turn: ClassroomTurnView) => void;
  onEdit: (command: ClassroomTurnCommand) => void }) {
  const { turn, uncertain, working } = state;
  const labels = { queued: '老师准备回答', running: '老师正在思考', completed: '回答已保存', failed: '这次回答未完成', cancelled: '这次插问已取消', cancelling: '正在停止这次回答' };
  return <div className="cl-turn-status" aria-live="polite">
    {uncertain && <section><b>找回刚才的提问</b><p>{uncertain.message}</p><small>网络回执可能丢失，找回时会沿用同一次提问。</small><div>
      <button type="button" disabled={working} onClick={() => void state.send(uncertain)}>找回这次提问</button>
      <button type="button" disabled={working} onClick={() => { onEdit(uncertain); state.discard(); }}>保留文字，修改提问</button></div></section>}
    {turn && <section data-status={turn.status}><b>{labels[turn.status]}</b><p>{turn.message}</p><small>{turn.modelName} · {turn.position.stepTitle} · 第 {turn.position.sentenceCursor + 1} 句</small>
      <div>{state.active && turn.status !== 'cancelling' && <button type="button" disabled={working} onClick={() => void state.control('cancel')}>取消这次回答</button>}
        {['failed', 'cancelled'].includes(turn.status) && <button type="button" disabled={working || state.active} onClick={() => void state.control('retry')}>重试这次提问</button>}
        {turn.status === 'completed' && <button type="button" disabled={working} onClick={() => onReturn(turn)}>回到原句继续</button>}</div>
      {turn.status === 'completed' && <p className="cl-turn-resume">“{turn.position.sentenceText}”</p>}
      {state.active && <small>可以离开或刷新页面，回来后会继续显示这次回答。</small>}</section>}
  </div>;
}
