'use client';
import * as React from 'react';
import Link from 'next/link';
import type { AssistantLectureDescriptor, StudioSubject } from '@study-agent/contracts';
import { AssistantWidget, type AssistantComposerContext } from '../../components/assistant-widget';
import { XiaojiuModelPicker } from '../../components/xiaojiu-model-picker';
import { apiRequest } from '../../lib/api';
import type { SessionUser } from '../../lib/session-user';
import { useOriginalTeachingFonts } from '../../lib/original-teaching-fonts';
import './reference-assistant.generated.css';
import './studio-instant-assistant.css';

function localNavigate(query: URLSearchParams) {
  window.history.pushState(null, '', '/studio?' + query); window.dispatchEvent(new PopStateEvent('popstate'));
}
function validDescriptor(value: AssistantLectureDescriptor, courseId: string, lectureId: string) {
  if (!value || value.courseId !== courseId || value.lectureId !== lectureId || !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
    value.referenceId !== courseId + '@' + value.fingerprint || typeof value.current !== 'boolean' ||
    ![value.courseTitle, value.lectureTitle, value.unitTitle, value.courseVersion].every(s => typeof s === 'string' && s.length > 0 && s.length <= 6000) ||
    ![value.unitPosition, value.lecturePosition].every(n => Number.isInteger(n) && n > 0 && n <= 100) ||
    !value.current && (typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 180)) return false;
  try { const url = new URL(value.href, 'https://study.invalid'); return url.origin === 'https://study.invalid' && url.pathname === '/studio/classroom' && url.searchParams.get('lecture') === lectureId && url.searchParams.get('lectureVersion') === value.fingerprint; }
  catch { return false; }
}

type Props = { identity: SessionUser; studentId: string; subject: StudioSubject; onWhiteboard: (text: string) => void; whiteboardBusy: boolean;
  onWorkspace: (target: 'materials' | 'calendar', packs?: boolean) => void; locationVersion: number };

export function StudioInstantAssistant(props: Props) {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const query = React.useMemo(() => new URLSearchParams(search), [search]);
  const courseId = query.get('lectureCourse') ?? '', lectureId = query.get('lecture') ?? '', fingerprint = query.get('lectureVersion') ?? '';
  const hasLecture = ['lectureCourse', 'lecture', 'lectureVersion'].some(key => query.has(key));
  const validRequest = Boolean(courseId && courseId.length <= 100 && lectureId && lectureId.length <= 180 && (!fingerprint || /^[a-f0-9]{64}$/.test(fingerprint)));
  const key = JSON.stringify([props.identity.id, props.identity.role, courseId, lectureId, fingerprint, hasLecture]);
  const [read, setRead] = React.useState<{ key: string; value?: AssistantLectureDescriptor; error?: string }>({ key: '' });
  const [retry, setRetry] = React.useState(0), epoch = React.useRef(0);
  React.useEffect(() => {
    const revision = ++epoch.current, controller = new AbortController();
    if (!hasLecture) { setRead({ key }); return; }
    if (!validRequest) { setRead({ key, error: '讲座链接不完整或版本格式无效。原草稿仍可保留，请返回课程重新打开。' }); return; }
    const params = new URLSearchParams({ courseId, lectureId }); if (fingerprint) params.set('fingerprint', fingerprint);
    void apiRequest<AssistantLectureDescriptor>('/ai/assistant/lecture-context?' + params, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted || epoch.current !== revision) return;
      if (!validDescriptor(value, courseId, lectureId)) throw Error('讲座上下文响应不完整，已停止创建对话。请重新核对。');
      setRead({ key, value });
      if (!fingerprint) { const canonical = new URLSearchParams(window.location.search); canonical.set('lectureVersion', value.fingerprint); window.history.replaceState(null, '', '/studio?' + canonical); window.dispatchEvent(new PopStateEvent('popstate')); }
    }).catch(error => { if (!controller.signal.aborted && epoch.current === revision) setRead({ key, error: error.message }); });
    return () => { controller.abort(); epoch.current++; };
  }, [key, retry, hasLecture, validRequest, courseId, lectureId, fingerprint]);
  const matched = read.key === key, descriptor = matched ? read.value : undefined, error = matched ? read.error : undefined;
  const loading = hasLecture && !descriptor && !error;
  const independent = props.identity.role !== 'student' && (hasLecture || query.get('audience') === 'independent' || !props.studentId);
  const readOnly = hasLecture && Boolean(error || descriptor && !descriptor.current);
  const reference = descriptor?.referenceId ?? (validRequest && fingerprint ? courseId + '@' + fingerprint : 'unavailable-lecture');
  const fonts=useOriginalTeachingFonts('studio-assistant:'+key,['Time for flashcards? Concept Explanation Personal Study Materials Generation Long-files Digestion Problem Solving Visualization Tools Whiteboard','学习工作台 想一起看看什么 返回本讲',descriptor?.courseTitle??'',descriptor?.lectureTitle??''].join(' '),'standard');
  function remove() { const next = new URLSearchParams({ view: 'home', mode: 'instant', audience: 'independent' }); localNavigate(next); }
  function current() { const next = new URLSearchParams({ view: 'home', mode: 'instant', lectureCourse: courseId, lecture: lectureId }); localNavigate(next); }
  return <div className="sa-instant-workspace" data-original-font-status={fonts.ready?'ready':fonts.error?'error':'loading'}>
    {fonts.error&&<p className="assistant-notice" role="status">界面字体暂未读回。<button type="button" onClick={fonts.retry}>重新准备界面字体</button></p>}
    <div className="sa-reference-hero"><img src="/reference/hyperknow-hero/assistant-ufo-crop.png" width={66} height={73} alt="" /><h1>Time for flashcards?</h1></div>
    {loading ? <p className="sa-context-loading" role="status">正在核对本讲的课程与教学目标…</p> : <>
      {error && <aside className="sa-context-error" role="alert"><p>{error}</p><button onClick={() => setRetry(v => v + 1)}>重新核对讲座</button>{validRequest && <button onClick={current}>打开当前讲座版本</button>}<Link href="/studio/classroom">返回课程</Link></aside>}
      <AssistantWidget key={key + ':' + independent} inline title="学习工作台助教" subtitle="提问与回答会保留，可恢复原任务与历史。"
        userRole={props.identity.role === 'student' ? 'student' : 'parent'} studentId={independent ? null : props.studentId || props.identity.studentId || null}
        subject={independent ? null : props.subject} pageContext={hasLecture ? 'classroom' : independent ? 'studio' : 'student_home'}
        contextRefType={hasLecture ? 'classroom_lecture' : null} contextRefId={hasLecture ? reference : null} contextItemId={hasLecture ? validRequest ? lectureId : 'unavailable-lecture' : null}
        readOnly={readOnly} frozenLectureSessionId={readOnly ? descriptor?.sessionId : undefined}
        renderComposer={context => <StudioAssistantComposer {...context} blocked={context.blocked||props.whiteboardBusy} descriptor={descriptor} hasLecture={hasLecture} independent={independent}
          canPlan={props.identity.role !== 'student'} remove={remove} openCurrent={current} onWhiteboard={props.onWhiteboard} onWorkspace={props.onWorkspace} />} />
    </>}
  </div>;
}

function StudioAssistantComposer({ conversation, models, blocked, descriptor, hasLecture, independent, canPlan, remove, openCurrent, onWhiteboard, onWorkspace }:
  AssistantComposerContext & { descriptor?: AssistantLectureDescriptor; hasLecture: boolean; independent: boolean; canPlan: boolean; remove: () => void; openCurrent: () => void;
    onWhiteboard: (text: string) => void; onWorkspace: Props['onWorkspace'] }) {
  const [tools, setTools] = React.useState(false), [whiteboard, setWhiteboard] = React.useState(false), menu = React.useRef<HTMLDivElement>(null), trigger = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { if (!tools) return; const dismiss = (event: PointerEvent | KeyboardEvent) => {
    if (event instanceof KeyboardEvent) { if (event.key === 'Escape') { setTools(false); trigger.current?.focus(); } }
    else if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setTools(false);
  }; document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss); return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); }; }, [tools]);
  const [templateNotice, setTemplateNotice] = React.useState('');
  function template(text: string) { const next=conversation.input.trim()?text+'\n'+conversation.input:text;if(next.length>3000){setTemplateNotice('当前草稿接近长度上限，示例未插入，原稿已保留。');return;}setTemplateNotice('');conversation.change(next); }
  function submit(event: React.FormEvent) { event.preventDefault(); if (blocked) return; if (whiteboard && !independent) onWhiteboard(conversation.input); else void conversation.submit(models.modelId); }
  return <div className="sa-inline-composer-slot">
    {descriptor && !descriptor.current && <aside className="sa-context-error" role="status">原讲座版本 · 已保存的对话只读。<button onClick={openCurrent}>打开当前讲座版本</button></aside>}
    <form className="input-box" onSubmit={submit}>
      {hasLecture && <section className="lecture-context-chip" role="region" aria-label="当前讲座上下文"><span className="lecture-context-chip-icon" aria-hidden="true">▣</span>
        <div className="lecture-context-chip-info"><strong className="lecture-context-chip-title">{descriptor?.lectureTitle ?? '原讲座上下文待核对'}</strong><div className="lecture-context-chip-meta"><span className="lecture-context-chip-position">{descriptor ? `U${descriptor.unitPosition}·L${descriptor.lecturePosition}` : '原版本'}</span><span className="lecture-context-chip-course">{descriptor?.courseTitle ?? '请返回课程核对'}</span></div></div>
        <button className="lecture-context-chip-remove" type="button" aria-label="移除讲座上下文" onClick={remove}>×</button>
      </section>}
      {descriptor && <Link className="sa-lecture-return" href={descriptor.href}>返回本讲 ↗</Link>}
      <label className="input-area"><span className="sa-visually-hidden">想一起看看什么</span><textarea aria-label="想一起看看什么" className="input-field" value={conversation.input} onChange={event => conversation.change(event.target.value)} rows={3} maxLength={3000}
        placeholder={whiteboard ? '输入白板主题，先预览再确认保存…' : '问一个概念，或告诉我你想理清的问题…'} disabled={blocked} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} /></label>
      <div className="button-row"><div className="left-button-group"><button className="sa-round-control" type="button" aria-label="打开学习资料" onClick={() => onWorkspace('materials')}>＋</button>
        <button className={'tools-button' + (whiteboard ? ' tools-selected' : '')} ref={trigger} type="button" aria-expanded={tools} aria-controls="studio-assistant-tools" onClick={() => setTools(v => !v)}><span aria-hidden="true">☷</span><span className="tools-button-text">{whiteboard ? 'Whiteboard' : 'Tools'}</span></button>
      </div><div className="composer-right-group"><XiaojiuModelPicker catalog={models.catalog} value={models.modelId} onChange={models.setModelId} compact presentation="inline" disabled={blocked} error={models.error} onRetry={models.reload} />
        <button className={'send-button ' + (blocked || !conversation.input.trim() ? 'disabled' : 'enabled')} aria-label={whiteboard ? '预览白板主题' : '发送学习问题'} disabled={blocked || !models.catalog || !conversation.input.trim()}>{conversation.busy ? '…' : '↑'}</button></div></div>
      {tools && <div className="sa-assistant-tools" id="studio-assistant-tools" role="menu" ref={menu}>
        {independent ? <Link role="menuitem" href="/studio/whiteboards"><b>Whiteboard session ↗</b><span>打开主题白板，审阅讲稿和要点后生成。</span></Link> : <button role="menuitem" type="button" onClick={() => { setWhiteboard(v => !v); setTools(false); trigger.current?.focus(); }}><b>Whiteboard session</b><span>先预览白板主题，再确认保存。</span></button>}
        {canPlan && <button role="menuitem" type="button" onClick={() => { setTools(false); onWorkspace('calendar'); }}><b>Study Planner</b><span>审阅任务、日期与学习范围后加入日历。</span></button>}
      </div>}
    </form>
    {templateNotice&&<p className="assistant-notice" role="status">{templateNotice}</p>}
    <div className="action-buttons-section"><div className="action-buttons-grid"><div className="action-buttons-row">
      <button className="action-button" type="button" disabled={blocked} onClick={() => template('请讲清这个概念的定义、例子、反例和适用条件：')}><span aria-hidden="true">⌕</span>Concept Explanation</button>
      <button className="action-button" type="button" onClick={() => onWorkspace('materials', true)}><span aria-hidden="true">▤</span>Personal Study Materials Generation</button>
      <button className="action-button" type="button" onClick={() => onWorkspace('materials')}><span aria-hidden="true">▱</span>Long-files Digestion</button>
    </div><div className="action-buttons-row"><button className="action-button" type="button" disabled={blocked} onClick={() => template('请帮我逐步分析问题，先核对条件，再比较方法，并给一个新情境：')}><span aria-hidden="true">♧</span>Problem Solving</button>
      <Link className="action-button" href="/studio/whiteboards"><span aria-hidden="true">▦</span>Visualization</Link></div></div></div>
  </div>;
}
