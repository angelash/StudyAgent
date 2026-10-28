'use client';
import * as React from 'react';
import Link from 'next/link';
import type { AssistantCourseDescriptor, AssistantCourseKind, AssistantTeachingSelection, StudioSubject } from '@study-agent/contracts';
import { AssistantWidget, type AssistantComposerContext } from '../../components/assistant-widget';
import { XiaojiuModelPicker } from '../../components/xiaojiu-model-picker';
import { apiRequest, ApiRequestError } from '../../lib/api';
import type { SessionUser } from '../../lib/session-user';
import { useOriginalTeachingFonts } from '../../lib/original-teaching-fonts';
import { assessmentHref, readTeachingSelection, validCourseDescriptor, transferKey, readCourseTransfer } from '../../lib/assistant-course-client';
import { courseAssistantHref, internalAssistantHref } from '../../lib/assistant-course-navigation';
import { WorkspaceDialog } from './workspace-dialog';
import './studio-course-assistant.css';

type Props = { identity: SessionUser; studentId: string; subject: StudioSubject; locationVersion: number;
  onWorkspace: (target: 'materials' | 'calendar', packs?: boolean) => void };
const uiText = '正在核对课程教学、档案与范围 课程学习助教 围绕已选教学解释概念，提问与回答保留。原课程版本只读，原问题与草稿保留。当前评测期间课程助教只读。原问题仍可编辑、保留；从评测返回后重新核对课程。新范围已有草稿。待采用的原问题副本：带入哪些教学内容 所选 个 可完整带入。超过输入范围，请减少条目；原问题保留。问一个概念，或告诉我想理清的问题… 关闭教学范围选择 Time for flashcards? 当前课程上下文 小学单元 资料课 已确认课程 待核对教案 原课程版本 只读 来源与讲解仍需核对 教学范围 完整正文 课程目标概览 自选教学条目 核对所选范围 应用所选范围 取消 范围选择带来的原问题副本 想一起看看什么 返回本课 移除课程上下文 发送学习问题 读取最新状态 重新核对课程 打开当前课程版本 选择教学范围 份额 知识目标 教学条目 字符 保留当前问题并复制到新范围 下载当前问题并采用副本 放弃副本 资料 学习计划 概念讲解 所选教学原文超过当前模型输入范围。原问题仍可编辑、下载并在选择范围后继续。当前学习档案或学科与课程不一致。切回课程档案 进入原评测 界面字体暂未读回 重新准备字体 当前问题会留在原范围，更改范围将打开独立对话。模型解释与课堂练习分别保留，不作为独立能力评测。';
function navigate(query: URLSearchParams) { window.history.pushState(null, '', '/studio?' + query); window.dispatchEvent(new PopStateEvent('popstate')); }

export function StudioCourseAssistant(props: Props) {
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const kind = query.get('courseKind') as AssistantCourseKind, courseId = query.get('courseId') ?? '', itemId = query.get('courseItem') ?? '', fingerprint = query.get('courseVersion') ?? '';
  const selectionRaw = query.get('courseSelection'), signature = JSON.stringify([props.identity.id, props.identity.role, kind, courseId, itemId, fingerprint, selectionRaw]);
  const [read, setRead] = React.useState<{ signature: string; value?: AssistantCourseDescriptor; error?: string; assessment?: string }>({ signature: '' });
  const [attempt, setAttempt] = React.useState(0);
  const valid = ['primary_unit', 'material_lesson'].includes(kind) && courseId.length > 0 && courseId.length <= 180 && itemId.length > 0 && itemId.length <= 180 && (!fingerprint || /^[a-f0-9]{64}$/.test(fingerprint)) && !query.has('lectureCourse');
  React.useEffect(() => {
    const controller = new AbortController();
    if (!valid) { setRead({ signature, error: '课程链接不完整或混入其他课程类型，请从原课重新打开。' }); return; }
    try { readTeachingSelection(selectionRaw); } catch (e) { setRead({ signature, error: (e as Error).message }); return; }
    const params = new URLSearchParams({ kind, courseId, itemId }); if (fingerprint) params.set('fingerprint', fingerprint); if (selectionRaw) params.set('selection', selectionRaw);
    void apiRequest<AssistantCourseDescriptor>('/ai/assistant/course-context?' + params, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      if (!validCourseDescriptor(value, kind, courseId, itemId)) throw Error('课程上下文响应不完整，已停止创建对话，请重新核对。');
      const next = new URLSearchParams(window.location.search); let changed = false;
      if (!fingerprint) { next.set('courseVersion', value.fingerprint); changed = true; }
      if (JSON.stringify(value.selection) !== (selectionRaw ?? JSON.stringify({ mode: 'complete' }))) { next.set('courseSelection', JSON.stringify(value.selection)); changed = true; }
      if (!next.has('student') && !next.has('studentId') && value.studentId) { next.set('student', value.studentId); changed = true; }
      if (!next.has('subject') && value.subject) { next.set('subject', value.subject); changed = true; }
      if (!value.studentId && next.get('courseScope') !== 'adult') { next.set('courseScope', 'adult'); changed = true; }
      if (changed) { window.history.replaceState(null, '', '/studio?' + next); window.dispatchEvent(new PopStateEvent('popstate')); }
      setRead({ signature, value });
    }).catch(error => { if (!controller.signal.aborted) setRead({ signature, error: error.message, assessment: error instanceof ApiRequestError ? assessmentHref(error.details?.href) : undefined }); });
    return () => controller.abort();
  }, [signature, attempt]);
  const d = read.signature === signature ? read.value : undefined, error = read.signature === signature ? read.error : undefined;
  const explicitStudent = query.get('student') ?? query.get('studentId'), explicitSubject = query.get('subject');
  const mismatch = !!d && (explicitStudent !== null && explicitStudent !== (d.studentId ?? '') || explicitSubject !== null && d.subject !== null && explicitSubject !== d.subject ||
    props.identity.role === 'student' && props.identity.studentId !== d.studentId);
  const fonts = useOriginalTeachingFonts('course-assistant:' + signature, uiText + JSON.stringify(d ?? {}) + (error ?? ''), 'standard');
  const back = d ? internalAssistantHref(d.href) : props.identity.role === 'student' ? '/student/today' : '/studio?view=courses';
  function current() { const q = new URLSearchParams(window.location.search); q.delete('courseVersion'); q.delete('assistantCarry'); navigate(q); }
  function matchScope() { if (!d) return; const q = new URLSearchParams(window.location.search); q.delete('studentId'); if (d.studentId) q.set('student', d.studentId); else q.delete('student'); if (d.subject) q.set('subject', d.subject); else q.delete('subject'); navigate(q); }
  function remove() { if (props.identity.role === 'student') { window.location.assign(back ?? '/student/today'); return; } navigate(new URLSearchParams({ view: 'home', mode: 'instant', audience: 'independent' })); }
  return <div className="sa-instant-workspace sa-course-assistant" data-original-font-status={fonts.ready ? 'ready' : fonts.error ? 'error' : 'loading'}>
    <div className="sa-reference-hero"><img src="/reference/hyperknow-hero/assistant-ufo-crop.png" width={66} height={73} alt=""/><h1>Time for flashcards?</h1></div>
    {fonts.error && <p role="status" className="assistant-notice">界面字体暂未读回。<button onClick={fonts.retry}>重新准备字体</button></p>}
    {error ? <aside role="alert" className="sa-context-error"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>重新核对课程</button>{valid && <button onClick={current}>打开当前课程版本</button>}
      {read.assessment && <a href={read.assessment}>进入原评测</a>}<a href={back ?? '/student/today'}>返回课程</a></aside> : !d ? <p className="sa-context-loading" role="status">正在核对课程教学、档案与范围…</p> : mismatch ?
      <aside role="alert" className="sa-context-error"><p>当前学习档案或学科与课程不一致。</p><button onClick={matchScope}>切回课程档案</button><button onClick={remove}>移除课程上下文</button></aside> :
      <AssistantWidget inline key={JSON.stringify([props.identity.id, d.kind, d.referenceId, d.itemId])} userRole={props.identity.role === 'student' ? 'student' : 'parent'}
        title="课程学习助教" subtitle="围绕已选教学解释概念，提问与回答保留。" studentId={d.studentId} subject={d.subject} pageContext="course" contextRefType={d.kind}
        contextRefId={d.referenceId} contextItemId={d.itemId} contextSelection={d.selection} readOnly={!d.current || !!d.blocked}
        readOnlyMessage={d.current&&d.blocked?'当前评测期间课程助教只读。原问题仍可编辑、保留；从评测返回后重新核对课程。':undefined}
        frozenLectureSessionId={d.sessionId} deferSession={d.current && d.selectionFits === false}
        renderComposer={context => <CourseComposer {...context} ownerId={props.identity.id} descriptor={d} query={query} remove={remove} current={current}
          recheck={() => setAttempt(n => n + 1)} onWorkspace={props.onWorkspace} canPlan={props.identity.role !== 'student'}/>}/>}
  </div>;
}

function CourseComposer({ conversation, models, blocked, ownerId, descriptor: d, query, remove, current, recheck, onWorkspace, canPlan }:
  AssistantComposerContext & { ownerId: string; descriptor: AssistantCourseDescriptor; query: URLSearchParams; remove: () => void; current: () => void; recheck: () => void;
    onWorkspace: Props['onWorkspace']; canPlan: boolean }) {
  const [selecting, setSelecting] = React.useState(false), [questionCopy, setQuestionCopy] = React.useState<string | null>(null);
  const carry = query.get('assistantCarry'), transfer = readCourseTransfer(ownerId, carry, d.referenceId, d.itemId), applied = React.useRef('');
  React.useEffect(() => {
    if (!transfer || conversation.loading || !conversation.matches || applied.current === carry) return;
    applied.current = carry ?? '';
    if (!conversation.input || conversation.input === transfer) { conversation.change(transfer); if (carry) try { sessionStorage.removeItem(transferKey(ownerId, carry)); } catch {} }
    else setQuestionCopy(transfer);
  }, [carry, transfer, conversation.loading, conversation.matches]);
  const latest = conversation.currentCourse ?? d, sendBlocked = blocked || latest.canSend === false;
  function finishTransfer() { if(carry)try{sessionStorage.removeItem(transferKey(ownerId,carry));}catch{}setQuestionCopy(null); }
  const editable = !conversation.loading && !conversation.busy && !conversation.waiting && !conversation.pending && !conversation.mismatch;
  function appliedRange(value: AssistantCourseDescriptor, copy: boolean) {
    const next = new URLSearchParams(courseAssistantHref(value.kind, value.courseId, value.itemId, value.studentId, value.subject, value.selection).split('?')[1]);
    next.set('courseVersion', value.fingerprint);
    if (copy && conversation.input) { const token = crypto.randomUUID(); try {
      sessionStorage.setItem(transferKey(ownerId, token), JSON.stringify({ ownerId, reference: value.referenceId, itemId: value.itemId, question: conversation.input })); next.set('assistantCarry', token);
    } catch { throw Error('本机暂未能保留问题副本。原问题仍在，请下载后再切换范围。'); } }
    navigate(next); setSelecting(false);
  }
  return <div className="sa-inline-composer-slot">
    {(!d.current||!latest.current) && <aside role="status" className="sa-context-error">原课程版本只读，原问题与草稿保留。<button onClick={current}>打开当前课程版本</button></aside>}
    {latest.blocked && <aside role="status" className="sa-context-error"><p>{latest.blocked.message}</p>{assessmentHref(latest.blocked.href) && <a href={latest.blocked.href}>进入原评测</a>}</aside>}
    {d.selectionFits === false && <p role="status" className="sa-context-error">所选教学原文超过当前模型输入范围。原问题仍可编辑、下载并在选择范围后继续。</p>}
    {questionCopy && <aside className="assistant-notice" role="status"><p>新范围已有草稿。待采用的原问题副本：</p><pre>{questionCopy}</pre><button onClick={() => { conversation.download(); conversation.change(questionCopy); finishTransfer(); }}>下载当前问题并采用副本</button><button onClick={finishTransfer}>放弃副本</button></aside>}
    <form className="input-box" onSubmit={event => { event.preventDefault(); if (!sendBlocked) void conversation.submit(models.modelId); }}>
      <section className="lecture-context-chip" role="region" aria-label="当前课程上下文"><span className="lecture-context-chip-icon" aria-hidden="true">▣</span><div className="lecture-context-chip-info">
        <strong className="lecture-context-chip-title">{d.itemTitle}</strong><div className="lecture-context-chip-meta"><span>{d.kind === 'primary_unit' ? '小学单元' : '资料课'} · {d.accessMode === 'authoring' ? '待核对教案' : '已确认课程'}</span><span>{d.courseTitle}</span></div>
      </div><button className="lecture-context-chip-remove" type="button" aria-label="移除课程上下文" onClick={remove}>×</button></section>
      <a className="sa-lecture-return" href={d.href}>返回本课 ↗</a>
      <div className="sa-course-range"><span>{d.selection.mode === 'complete' ? '完整正文' : d.selection.mode === 'overview' ? '课程目标概览' : '自选教学条目'} · {d.coverage.includedTargets}/{d.coverage.totalTargets} 知识目标 · {d.coverage.includedParts}/{d.coverage.totalParts} 教学条目</span>
        <div className="sa-course-range-actions"><button type="button" onClick={recheck} disabled={conversation.busy||conversation.waiting||!!conversation.pending}>重新核对课程</button>{d.current && <button type="button" onClick={() => setSelecting(true)} disabled={conversation.busy || conversation.waiting || !!conversation.pending}>选择教学范围</button>}</div></div>
      <label className="input-area"><span className="sa-visually-hidden">想一起看看什么</span><textarea aria-label="想一起看看什么" className="input-field" value={conversation.input} maxLength={3000} rows={3}
        onChange={event => conversation.change(event.target.value)} disabled={!editable} placeholder="问一个概念，或告诉我想理清的问题…" onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!sendBlocked) event.currentTarget.form?.requestSubmit(); }
        }}/></label>
      <div className="button-row"><div className="left-button-group"><button type="button" className="sa-round-control" aria-label="打开学习资料" onClick={() => onWorkspace('materials')}>＋</button>{canPlan && <button className="tools-button" type="button" onClick={() => onWorkspace('calendar')}>学习计划</button>}</div>
        <div className="composer-right-group"><XiaojiuModelPicker catalog={models.catalog} value={models.modelId} onChange={models.setModelId} compact presentation="inline" disabled={!editable} error={models.error} onRetry={models.reload}/>
          <button className={'send-button ' + (sendBlocked ? 'disabled' : 'enabled')} aria-label="发送学习问题" disabled={sendBlocked || !conversation.input.trim() || !models.catalog}>↑</button></div></div>
    </form><p className="sa-course-advisory">模型解释与课堂练习分别保留，不作为独立能力评测。</p>
    {selecting && <CourseRangeDialog descriptor={d} question={conversation.input} close={() => setSelecting(false)} apply={appliedRange}/>}
  </div>;
}

function CourseRangeDialog({ descriptor: d, question, close, apply }: { descriptor: AssistantCourseDescriptor; question: string; close: () => void;
  apply: (descriptor: AssistantCourseDescriptor, copy: boolean) => void }) {
  const [selection, setSelection] = React.useState<AssistantTeachingSelection>(d.selection), [preview, setPreview] = React.useState<AssistantCourseDescriptor | null>(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [copy, setCopy] = React.useState(Boolean(question));
  const controller = React.useRef<AbortController | null>(null); React.useEffect(() => () => controller.current?.abort(), []);
  function change(next: AssistantTeachingSelection) { controller.current?.abort(); setSelection(next); setPreview(null); setBusy(false); setError(''); }
  async function check() {
    controller.current?.abort(); const c = new AbortController(); controller.current = c; setBusy(true); setError(''); setPreview(null);
    try { if (selection.mode === 'detail' && !selection.partKeys.length) throw Error('请至少选择一个完整教学条目。');
      const params = new URLSearchParams({ kind: d.kind, courseId: d.courseId, itemId: d.itemId, selection: JSON.stringify(selection) });
      const result = await apiRequest<AssistantCourseDescriptor>('/ai/assistant/course-context?' + params, { signal: c.signal });
      if (c.signal.aborted) return; if (!validCourseDescriptor(result, d.kind, d.courseId, d.itemId) || result.studentId !== d.studentId || result.subject !== d.subject) throw Error('课程身份已变化，请保留问题并重新核对。'); setPreview(result);
    } catch (e) { if (!c.signal.aborted) setError((e as Error).message); } finally { if (!c.signal.aborted) setBusy(false); }
  }
  return <WorkspaceDialog onClose={close}><section role="dialog" aria-modal="true" aria-labelledby="course-range-title" className="sa-course-range-dialog"><header><h2 id="course-range-title">选择教学范围</h2><button type="button" onClick={close} aria-label="关闭教学范围选择">×</button></header>
    <p>当前问题会留在原范围，更改范围将打开独立对话。</p><fieldset><legend>带入哪些教学内容</legend>{(['complete', 'overview', 'detail'] as const).map((mode, i) => <label key={mode}><input type="radio" name="teaching-range" checked={selection.mode === mode} onChange={() => change(mode === 'detail' ? { mode, partKeys: d.selection.mode === 'detail' ? d.selection.partKeys : [] } : { mode })}/><span>{['完整正文', '课程目标概览', '自选教学条目'][i]}{mode === 'complete' && d.completeCharacters ? ' · ' + d.completeCharacters + ' 字符' : mode === 'overview' && d.overviewCharacters ? ' · ' + d.overviewCharacters + ' 字符' : ''}</span></label>)}</fieldset>
    {selection.mode === 'detail' && <div className="sa-course-part-list">{d.targets.map(target => <fieldset key={target.id}><legend>{target.title}</legend><p>{target.objective}</p>{d.parts.filter(part => part.targetId === target.id).map(part => <label key={part.key}><input type="checkbox" checked={selection.partKeys.includes(part.key)} onChange={event => change({ mode: 'detail', partKeys: event.target.checked ? [...selection.partKeys, part.key] : selection.partKeys.filter(key => key !== part.key) })}/><span>{part.title}</span></label>)}</fieldset>)}</div>}
    {question && <label className="sa-copy-question"><input type="checkbox" checked={copy} onChange={event => setCopy(event.target.checked)}/>保留当前问题并复制到新范围</label>}
    {error && <p role="alert" className="assistant-error">{error}</p>}{preview && <p role="status" className={preview.selectionFits ? 'assistant-notice' : 'sa-context-error'}>所选 {preview.coverage.includedTargets}/{preview.coverage.totalTargets} 个知识目标、{preview.coverage.includedParts}/{preview.coverage.totalParts} 个教学条目，{preview.selectedCharacters}/{preview.maximumCharacters} 字符。{preview.selectionFits ? '所选范围可完整带入。' : '超过输入范围，请减少条目；原问题保留。'}</p>}
    <footer><button onClick={close}>取消</button><button onClick={() => void check()} disabled={busy}>{busy ? '正在核对…' : '核对所选范围'}</button><button disabled={busy || !preview?.selectionFits || preview.canSend === false} onClick={() => { if (preview) try { apply(preview, copy); } catch (e) { setError((e as Error).message); } }}>应用所选范围</button></footer>
  </section></WorkspaceDialog>;
}
