'use client';
import * as React from 'react';
import type { CourseSourceSnapshot } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import { WorkspaceDialog } from '../workspace-dialog';
export function FrozenCheckSource({sessionId,sourceKey,onClose}:{sessionId:string;sourceKey:string;onClose:()=>void}){
  const[source,setSource]=React.useState<CourseSourceSnapshot|null>(null),[error,setError]=React.useState(''),[attempt,setAttempt]=React.useState(0);
  React.useEffect(()=>{const operation=new AbortController();setSource(null);setError('');void apiRequest<CourseSourceSnapshot>('/learning/classroom/sessions/'+encodeURIComponent(sessionId)+'/sources/'+encodeURIComponent(sourceKey),{signal:operation.signal}).then(value=>{if(!operation.signal.aborted)setSource(value);}).catch(error=>{if(!operation.signal.aborted)setError(error.message);});return()=>operation.abort();},[sessionId,sourceKey,attempt]);
  return <WorkspaceDialog onClose={onClose}><section className="cl-check-source" role="dialog" aria-modal="true" aria-labelledby="cl-check-source-title"><header><div><small>FROZEN SOURCE</small><h2 id="cl-check-source-title">{source?.title??'核对本题原文'}</h2></div><button onClick={onClose}>关闭冻结原文</button></header>{error?<div role="alert"><p>{error}</p><button onClick={()=>setAttempt(value=>value+1)}>重读冻结原文</button></div>:source?<><p>第{source.page}{source.kind==='pdf'?'页':'段'} · 本次课堂保存的版本 {source.version.slice(0,12)}</p><p>这份快照保留开始核查时的原文，课程后来的修改不会替换它。{source.kind==='pdf'?'PDF识别正文不代表原始页面图像，结构仍需核对。':''}</p><pre>{source.text}</pre></>:<p role="status">正在读取本次课堂的冻结原文…</p>}</section></WorkspaceDialog>;
}
