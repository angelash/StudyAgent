'use client';
import * as React from 'react';
import type { LearningScope, TextbookTeachingCourseOptions, TextbookTeachingCourseSelection } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';

export function TextbookCourseSelector({actorId,studentId,scope,value,disabled,onChange}:{actorId:string;studentId:string;scope:LearningScope|null;value:TextbookTeachingCourseSelection|null;disabled:boolean;onChange:(value:TextbookTeachingCourseSelection)=>void}){
 const [page,setPage]=React.useState(1),[reload,setReload]=React.useState(0),[result,setResult]=React.useState<{key:string;value:TextbookTeachingCourseOptions}|null>(null),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(false),
  signature=JSON.stringify([actorId,studentId,scope?.subject,scope?.version,scope?.textbookVolumeId,scope?.textbookRevision]),current=React.useRef(signature),generation=React.useRef(0);
 current.current=signature;
 React.useEffect(()=>{setPage(1);setResult(null);},[signature]);
 React.useEffect(()=>{
  if(!scope||scope.progressMode!=='textbook'||!scope.textbookVolumeId||!scope.textbookRevision){setResult(null);return;}
  const controller=new AbortController(),request=++generation.current,expected=signature;setLoading(true);setError('');
  void apiRequest<TextbookTeachingCourseOptions>('/learning/studio/courses/teaching-options?'+new URLSearchParams({studentId,subject:scope.subject,page:String(page)}),{signal:controller.signal,headers:{'X-Study-Actor':actorId}}).then(options=>{
   if(controller.signal.aborted||generation.current!==request||current.current!==expected)return;
   if(options.protocol!=='textbook-teaching-course-options-v1'||options.studentId!==studentId||options.subject!==scope.subject||options.scopeVersion!==scope.version||options.bookId!==scope.textbookVolumeId||options.bookVersion!==scope.textbookRevision||options.page!==page)throw Error('准确课时或当前范围已改变，请重新核对。');
   setResult({key:expected+':'+page,value:options});
  }).catch(error=>{if(!controller.signal.aborted&&generation.current===request&&current.current===expected)setError(error instanceof Error?error.message:'教学稿暂时无法读取。');}).finally(()=>{if(!controller.signal.aborted&&generation.current===request)setLoading(false);});
  return()=>controller.abort();
 },[signature,page,reload]);
 const options=result?.key===signature+':'+page?result.value:null,selected=value?.lessons??[],token=(entry:Pick<TextbookTeachingCourseSelection['lessons'][number],'packageId'|'contentVersion'|'fingerprint'>)=>JSON.stringify([entry.packageId,entry.contentVersion,entry.fingerprint]);
 function select(lessonId:string,choice:string){if(!options)return;const row=options.lessons.find(row=>row.lessonId===lessonId),picked=row?.packages.find(entry=>token(entry)===choice),rest=selected.filter(entry=>entry.lessonId!==lessonId);
  if(choice&&!picked)return;onChange({bookId:options.bookId,bookVersion:options.bookVersion,lessons:picked?[...rest,{lessonId,packageId:picked.packageId,contentVersion:picked.contentVersion,fingerprint:picked.fingerprint}]:rest});}
 return <fieldset disabled={disabled} aria-label="准确教材课时与教学版本"><legend>选择教材课时与准确教学稿 <span>已选 {selected.length} 课时</span></legend>
  {!scope||scope.progressMode!=='textbook'?<p>先按准确教材版本确认已学课时，再采用完整教学稿。</p>:<p>{scope.textbookVersion} · 课程范围 {scope.grade}年级。每课保留全部目标；没有可用稿的课时仍显示缺口。</p>}
  {loading&&<p role="status">正在核对本页课时的准确发布版本…</p>}{error&&<div className="ws-builder-error" role="alert"><p>{error}</p><button type="button" onClick={()=>setReload(value=>value+1)}>重试准确课时</button></div>}
  {options&&<><p>{options.title} · {options.edition} · 共 {options.total} 个已确认课时</p><div className="ws-blueprint-selection"><button type="button" disabled={disabled||!options.lessons.some(row=>row.packages.length===1)} onClick={()=>{const exact=options.lessons.filter(row=>row.packages.length===1),ids=new Set(exact.map(row=>row.lessonId));onChange({bookId:options.bookId,bookVersion:options.bookVersion,lessons:[...selected.filter(entry=>!ids.has(entry.lessonId)),...exact.map(row=>({lessonId:row.lessonId,packageId:row.packages[0].packageId,contentVersion:row.packages[0].contentVersion,fingerprint:row.packages[0].fingerprint}))]});}}>采用本页唯一可用稿</button></div>
   <div className="ws-blueprint-textbook-lessons">{options.lessons.map(row=>{const chosen=selected.find(entry=>entry.lessonId===row.lessonId),available=chosen&&row.packages.some(entry=>token(entry)===token(chosen));return <article key={row.lessonId}><h3>{row.chapterName} · {row.lessonName}</h3><label>本课采用版本<select aria-label={'采用教学稿：'+row.lessonName} value={chosen?token(chosen):''} onChange={event=>select(row.lessonId,event.target.value)} disabled={disabled||!row.packages.length&&!chosen}><option value="">暂不采用本课</option>{chosen&&!available&&<option value={token(chosen)}>已保留原选择 · 第{chosen.contentVersion}版；当前不可用</option>}{row.packages.map(entry=><option key={token(entry)} value={token(entry)}>{entry.title} · 第{entry.contentVersion}版 · {entry.targets.length}个目标</option>)}</select></label>{row.gaps.map(gap=><p key={gap} role="status">{gap}</p>)}{row.packages.length>0&&<details><summary>核对教学目标与版本</summary>{row.packages.map(entry=><section key={token(entry)}><b>{entry.title} · 第{entry.contentVersion}版</b><ul>{entry.targets.map(target=><li key={target.atomId}>{target.name}</li>)}</ul></section>)}</details>}</article>;})}</div>
   <div className="ws-blueprint-selection"><button type="button" disabled={disabled||loading||page===1} onClick={()=>setPage(page=>page-1)}>上一页</button><span>第 {page} / {Math.max(1,Math.ceil(options.total/options.pageSize))} 页</span><button type="button" disabled={disabled||loading||page*options.pageSize>=options.total} onClick={()=>setPage(page=>page+1)}>下一页</button></div><p>{options.notice}</p></>}
  {!!selected.length&&<details><summary>保留的完整课时选择 · {selected.length}课时</summary><ul>{selected.map(entry=><li key={entry.lessonId}>{scope?.selectedLessonSnapshots?.find(lesson=>lesson.id===entry.lessonId)?.name??entry.lessonId} · 第{entry.contentVersion}版</li>)}</ul></details>}
 </fieldset>;
}
