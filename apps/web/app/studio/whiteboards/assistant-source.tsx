'use client';
import * as React from 'react';
import type { AssistantArtifactOrigin, AssistantWhiteboardSourceMap, AssistantWhiteboardSourceView } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import { internalAssistantHref } from '../../../lib/assistant-course-navigation';
import { AssistantNoteReading } from '../../../components/assistant-note-reading';
import '../../../components/assistant-notes.css';
import '../../../components/assistant-whiteboards.css';

export function useWhiteboardSource(id: string, enabled: boolean) {
  const [value, setValue] = React.useState<AssistantWhiteboardSourceView | null>(null), [error, setError] = React.useState('');
  React.useEffect(() => {
    setValue(null); setError(''); if (!enabled) return;
    const controller = new AbortController();
    void apiRequest<AssistantWhiteboardSourceView>('/learning/studio/topic-whiteboards/drafts/' + encodeURIComponent(id) + '/source', { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setValue(value); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, enabled]);
  return { value, error };
}
export function AssistantWhiteboardOrigin({ origin, onLocate }: { origin: AssistantArtifactOrigin; onLocate?: (id: string) => void }) {
  const href = internalAssistantHref(origin.location.href);
  return <details className="tw-source-original"><summary>完整原对话与教学来源（{origin.messages.length}条）</summary>
    <p>{origin.studentId ? '原学生学习档案' : '本人独立学习'} · 原消息和人工改稿分别保留。</p>
    {origin.course && <p>{origin.course.courseTitle} · {origin.course.itemTitle}</p>}
    {origin.lecture && <p>{origin.lecture.courseTitle} · {origin.lecture.lectureTitle}</p>}
    {origin.teachingScope && <p>原教学年级：{origin.teachingScope.grade ?? '未指定'} · {origin.teachingScope.term === 'upper' ? '上册' : origin.teachingScope.term === 'lower' ? '下册' : '未指定册次'} · 原版本：{origin.teachingScope.courseVersion}</p>}
    {href && <a href={href}>打开原学习位置 →</a>}
    {origin.messages.map(message => <section key={message.id} className="assistant-note-reading-section" tabIndex={0} aria-label={'白板原消息 ' + message.id}>
      <h4>{message.sender === 'user' ? '原问题' : '助教原回答'} · {message.sequence}</h4>
      <small>{message.modelName ?? message.modelId ?? '无模型记录'} · {new Date(message.createdAt).toLocaleString('zh-CN')}</small>
      <AssistantNoteReading markdown={message.content}/>
      {message.sourceReferences.map(reference => { const href = internalAssistantHref(reference.href); return <p key={reference.key}>{href ? <a href={href}>{reference.title}</a> : reference.title}{reference.quote && <span>{reference.quote}</span>}</p>; })}
      {onLocate && <button type="button" onClick={() => onLocate(message.id)}>返回这条原消息</button>}
    </section>)}
  </details>;
}
export function TopicSourceMapEditor({ map, origin, onChange }: { map: AssistantWhiteboardSourceMap; origin: AssistantArtifactOrigin; onChange: (value: AssistantWhiteboardSourceMap) => void }) {
  const references = [...new Map(origin.messages.filter(message => map.messageIds.includes(message.id)).flatMap(message => message.sourceReferences).map(reference => [reference.key, reference])).values()];
  function message(id: string, checked: boolean) {
    const messageIds = checked ? [...map.messageIds, id] : map.messageIds.filter(value => value !== id);
    const valid = new Set(origin.messages.filter(m => messageIds.includes(m.id)).flatMap(m => m.sourceReferences.map(reference => reference.key)));
    onChange({ ...map, messageIds, referenceKeys: map.referenceKeys.filter(key => valid.has(key)) });
  }
  return <fieldset className="tw-source-map"><legend>这一幕的来源依据</legend>
    <label>内容性质<select value={map.status} onChange={event => onChange({ ...map, status: event.target.value as AssistantWhiteboardSourceMap['status'], referenceKeys: event.target.value === 'supplementary' ? [] : map.referenceKeys })}>
      <option value="sourced">原文支持</option><option value="supplementary">新增解释，需另外核对</option></select></label>
    <div className="tw-source-options">{origin.messages.map(item => <label key={item.id}><input type="checkbox" checked={map.messageIds.includes(item.id)} onChange={event => message(item.id, event.target.checked)}/>
      {item.sender === 'user' ? '原问题' : '原回答'} · {item.sequence} · {item.modelName ?? item.modelId ?? '本人消息'}</label>)}</div>
    {map.status === 'sourced' && <div className="tw-source-options">{references.length ? references.map(reference => <label key={reference.key}><input type="checkbox" checked={map.referenceKeys.includes(reference.key)}
      onChange={event => onChange({ ...map, referenceKeys: event.target.checked ? [...map.referenceKeys, reference.key] : map.referenceKeys.filter(key => key !== reference.key) })}/>{reference.title}</label>) : <p>已选消息没有保存的引用，不会补造出处。</p>}</div>}
    <label>来源或新增解释的说明<textarea value={map.explanation} maxLength={600} onChange={event => onChange({ ...map, explanation: event.target.value })}/></label>
    <small>“原文支持”需要至少一条所选原消息。新增解释不代表事实审核，也不记录为知识掌握。</small>
  </fieldset>;
}
