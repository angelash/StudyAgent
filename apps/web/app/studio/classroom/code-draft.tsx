'use client';
import * as React from 'react';
import type { ClassroomCodeDraftCommand, ClassroomCodeDraftView } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';

export type CodeDraftContext = { ownerUserId: string; sessionId: string; stepId: string; blockId: string };
type Buffer = { code: string; input: string };
type Cache = { version: 1; baseCode: string; baseRevision: number | null; buffer: Buffer; pending: ClassroomCodeDraftCommand | null };
type SaveState = 'loading' | 'saved' | 'editing' | 'saving' | 'offline' | 'conflict';
const equal = (a: Buffer, b: Buffer) => a.code === b.code && a.input === b.input;

export function useCodeDraft(initialCode: string, context?: CodeDraftContext) {
  const [buffer, setBuffer] = React.useState<Buffer>({ code: initialCode, input: '' });
  const current = React.useRef(buffer), remote = React.useRef<ClassroomCodeDraftView | null>(null), pending = React.useRef<ClassroomCodeDraftCommand | null>(null);
  const [state, setState] = React.useState<SaveState>(context ? 'loading' : 'saved'), [notice, setNotice] = React.useState('');
  const phase = React.useRef(state), busy = React.useRef(false), alive = React.useRef(true), timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = React.useRef<AbortController | null>(null);
  const url = context ? '/learning/classroom/sessions/' + encodeURIComponent(context.sessionId) + '/code-drafts/' + encodeURIComponent(context.stepId) + '/' + encodeURIComponent(context.blockId) : '';
  const cacheKey = context ? 'studyagent.classroom.code.' + JSON.stringify([context.ownerUserId, context.sessionId, context.stepId, context.blockId]) : '';
  function status(value: SaveState) { phase.current = value; if (alive.current) setState(value); }
  function remember() {
    if (!cacheKey) return;
    try { const value: Cache = { version: 1, baseCode: initialCode, baseRevision: remote.current?.revision ?? null, buffer: current.current, pending: pending.current }; sessionStorage.setItem(cacheKey, JSON.stringify(value)); }
    catch { if (alive.current) setNotice('当前标签页无法保留离线草稿，请保持页面打开并复制代码。'); }
  }
  function clearCache() { if (cacheKey) try { sessionStorage.removeItem(cacheKey); } catch { /* Server version is already saved. */ } }
  async function flush() {
    if (!url || !remote.current || busy.current || phase.current === 'conflict' || !alive.current) return;
    if (!pending.current && equal(current.current, remote.current)) { status('saved'); clearCache(); return; }
    if (current.current.code.length > 16000 || current.current.input.length > 8000) { setNotice('代码最多16000字符，输入最多8000字符；请缩短后保存或运行。'); status('editing'); return; }
    const command = pending.current ?? { ...current.current, baseHash: remote.current.baseHash, expectedRevision: remote.current.revision, requestKey: crypto.randomUUID() };
    pending.current = command; remember(); busy.current = true; status('saving'); const controller = new AbortController(); request.current = controller;
    try {
      const saved = await apiRequest<ClassroomCodeDraftView>(url, { method: 'PATCH', body: JSON.stringify(command), signal: controller.signal });
      if (!alive.current || controller.signal.aborted) return;
      remote.current = saved; pending.current = null;
      // A replay can return a newer version written by another page. Preserve the local buffer for an explicit choice.
      if (!equal(saved, command)) { status('conflict'); remember(); setNotice('其他页面已有更新；本地代码和输入都保留，请选择要继续的版本。'); return; }
      if (equal(current.current, command)) { clearCache(); status('saved'); setNotice(''); }
      else { remember(); status('editing'); timer.current = setTimeout(() => void flush(), 300); }
    } catch (error) {
      if (!alive.current || controller.signal.aborted) return;
      try {
        const saved = await apiRequest<ClassroomCodeDraftView>(url, { signal: controller.signal }); remote.current = saved;
        if (saved.revision !== command.expectedRevision && !equal(saved, command)) { status('conflict'); setNotice('其他页面已保存更新，本地代码和输入仍然保留。'); return; }
      } catch { /* Keep the same command when its acknowledgment is uncertain. */ }
      status('offline'); setNotice((error as Error).message + ' 本地草稿已保留，可重试保存。');
    } finally { if (request.current === controller) { busy.current = false; request.current = null; } }
  }
  async function load() {
    if (!url || busy.current) return;
    busy.current = true; const controller = new AbortController(); request.current = controller;
    try {
      const saved = await apiRequest<ClassroomCodeDraftView>(url, { signal: controller.signal });
      if (!alive.current || controller.signal.aborted) return;
      remote.current = saved;
      let cached: Cache | null = null;
      try { cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null') as Cache | null; } catch { /* Optional local cache. */ }
      if (cached?.version === 1 && cached.baseCode === initialCode && typeof cached.buffer?.code === 'string' && typeof cached.buffer?.input === 'string' && cached.buffer.code.length <= 160000 && cached.buffer.input.length <= 80000) {
        current.current = cached.buffer; pending.current = cached.pending; setBuffer(cached.buffer);
        if (!cached.pending && !equal(cached.buffer, saved) && (cached.baseRevision ?? 0) !== saved.revision) {
          status('conflict'); setNotice('其他页面在本地草稿尚未保存时已有更新，请选择要继续的版本。');
        } else {
          status(equal(cached.buffer, saved) && !cached.pending ? 'saved' : 'editing');
          timer.current = setTimeout(() => void flush(), 300); setNotice('');
        }
      } else { current.current = { code: saved.code, input: saved.input }; setBuffer(current.current); status('saved'); setNotice(''); }
    } catch (error) { if (!controller.signal.aborted && alive.current) { status('offline'); setNotice((error as Error).message + ' 可以保留本地代码，重试连接后再保存。'); } }
    finally { if (request.current === controller) { busy.current = false; request.current = null; } }
  }
  React.useEffect(() => {
    alive.current = true;
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null') as Cache | null;
      if (cached?.version === 1 && cached.baseCode === initialCode && typeof cached.buffer?.code === 'string' && typeof cached.buffer?.input === 'string' && cached.buffer.code.length <= 160000 && cached.buffer.input.length <= 80000) {
        current.current = cached.buffer; pending.current = cached.pending; setBuffer(cached.buffer);
      }
    } catch { /* Preserve any unrecognized cache without applying it to this source. */ }
    void load();
    return () => { alive.current = false; request.current?.abort(); request.current = null; busy.current = false; if (timer.current) clearTimeout(timer.current); };
    // The containing code block is keyed by its frozen session/step/block identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, cacheKey]);
  function edit(change: Partial<Buffer>) {
    current.current = { ...current.current, ...change }; setBuffer(current.current); remember();
    if (phase.current === 'conflict') return;
    status('editing'); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), 800);
  }
  async function readSaved() {
    if (!url || busy.current) return;
    busy.current = true; const controller = new AbortController(); request.current = controller;
    try {
      const saved = await apiRequest<ClassroomCodeDraftView>(url, { signal: controller.signal });
      if (controller.signal.aborted || !alive.current) return;
      remote.current = saved; pending.current = null; current.current = { code: saved.code, input: saved.input }; setBuffer(current.current); clearCache(); status('saved'); setNotice('');
    } catch (error) { if (!controller.signal.aborted && alive.current) setNotice((error as Error).message + ' 本地草稿仍保留。'); }
    finally { if (request.current === controller) { busy.current = false; request.current = null; } }
  }
  function keepLocal() { pending.current = null; status('editing'); remember(); void flush(); }
  return { ...buffer, state, notice, edit, readSaved, keepLocal, save: () => remote.current ? flush() : load(),
    labels: { loading: '正在读取草稿', saved: context ? '草稿已保存' : '当前示例', editing: '草稿待保存', saving: '正在保存草稿', offline: '仅本地草稿', conflict: '代码草稿有冲突' } as Record<SaveState, string> };
}
