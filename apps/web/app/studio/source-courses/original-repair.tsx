'use client';
import * as React from 'react';
import type {StudioMaterialUpload,StudioOriginalRepair,StudioSourceMaterial} from '@study-agent/contracts';
import {apiRequest} from '../../../lib/api';

const uploads='/learning/material-uploads',labels={queued:'等待恢复',restoring:'正在恢复并核验原件',cleaning:'正在安全收尾',completed:'原件已恢复',cancelled:'这次恢复已取消'};
const reason=(code:string|null)=>code?.includes('active')||code?.includes('busy')?'正在等待现有文件操作结束。':code?.includes('changed')||code?.includes('unknown')?'文件或授权状态发生变化，请读取最新进度并核对；系统保留了不能确认的文件。':code?.includes('chunk')||code?.includes('candidate')?'上传的原件未通过核验，请保留手头文件并取消这次恢复后重新选择。':'这次恢复尚未完成，可以重试或取消。';

export function PdfOriginalRepair({material,version,canStart,disabled,onActiveChange,onRecheck,onCompleted}:{material:StudioSourceMaterial;version:string;canStart:boolean;disabled:boolean;onActiveChange:(active:boolean)=>void;onRecheck:()=>void;onCompleted:()=>void}){
 const[repair,setRepair]=React.useState<StudioOriginalRepair|null>(null),[loading,setLoading]=React.useState(true),[busy,setBusy]=React.useState(''),[error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),[received,setReceived]=React.useState(0),[attempt,setAttempt]=React.useState(0);
 const fileInput=React.useRef<HTMLInputElement>(null),operation=React.useRef<AbortController|null>(null),startRequest=React.useRef<{version:string;uploadId:string;requestKey:string}|null>(null);
 const controls=React.useRef<{id:string;action:string;expectedRevision:number;requestKey:string}|null>(null),activeCallback=React.useRef(onActiveChange);activeCallback.current=onActiveChange;
 const completed=React.useRef(new Set<string>()),completionCallback=React.useRef(onCompleted);completionCallback.current=onCompleted;
 const subject:Record<string,string>=material.studentId&&material.subject?{studentId:material.studentId,subject:material.subject}:{},query=new URLSearchParams(subject).toString(),endpoint='/learning/source-courses/materials/'+encodeURIComponent(material.id)+'/repairs';
 const active=Boolean(repair&&['queued','restoring','cleaning'].includes(repair.status));
 React.useEffect(()=>{activeCallback.current(active);return()=>activeCallback.current(false);},[active]);
 React.useEffect(()=>{if(repair?.status==='completed'&&!completed.current.has(repair.id)){completed.current.add(repair.id);completionCallback.current();}},[repair?.id,repair?.status]);
 React.useEffect(()=>{
  const controller=new AbortController();operation.current?.abort();startRequest.current=null;controls.current=null;setRepair(null);setLoading(true);setBusy('');setError('');setNotice('');setReceived(0);
  void apiRequest<StudioOriginalRepair[]>(endpoint,{signal:controller.signal}).then(rows=>{if(!controller.signal.aborted)setRepair(rows[0]??null);}).catch(caught=>{if(!controller.signal.aborted)setError(caught.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>{controller.abort();operation.current?.abort();};
 },[endpoint,version,attempt]);
 React.useEffect(()=>{
  if(!active||!repair)return;const controller=new AbortController();let fetching=false;
  const read=async()=>{if(fetching)return;fetching=true;try{const row=await apiRequest<StudioOriginalRepair>(endpoint+'/'+repair.id,{signal:controller.signal});if(!controller.signal.aborted){setRepair(row);setError('');}}catch(caught){if(!controller.signal.aborted)setError((caught as Error).message);}finally{fetching=false;}};
  const timer=setInterval(()=>void read(),1500);return()=>{clearInterval(timer);controller.abort();};
 },[endpoint,repair?.id,active]);
 async function refresh(){const rows=await apiRequest<StudioOriginalRepair[]>(endpoint);setRepair(rows[0]??null);return rows;}
 async function choose(file:File){
  if(busy||disabled||active)return;
  if(!/\.pdf$/iu.test(file.name)||file.size!==material.byteSize||file.size>50*1024*1024){setError('请选择这份资料的同一原始PDF，文件大小需要完全一致。');return;}
  const controller=new AbortController();operation.current?.abort();operation.current=controller;setBusy('checking');setError('');setNotice('');setReceived(0);
  const live=()=>operation.current===controller&&!controller.signal.aborted;
  try{
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');if(!live())return;
   if(hash!==material.sha256)throw new Error('所选文件内容与原资料不同。请选择当时的原始PDF，改名后的其他文件不能用于恢复。');
   const rows=await apiRequest<StudioMaterialUpload[]>(uploads+'?'+query,{signal:controller.signal});if(!live())return;
   const reserved=rows.find(row=>row.sha256===hash&&row.size===file.size&&row.repairId);
   if(reserved){await refresh();setNotice('这份原件已有恢复任务，已读取保存的进度。');return;}
   let upload=rows.find(row=>!row.repairId&&row.sha256===hash&&row.size===file.size&&row.name===file.name&&Date.parse(row.expiresAt)>Date.now());
   if(!upload)upload=await apiRequest<StudioMaterialUpload>(uploads,{method:'POST',body:JSON.stringify({...subject,name:file.name,size:file.size,sha256:hash,requestKey:crypto.randomUUID()}),signal:controller.signal});
   if(!live())return;setBusy('uploading');setReceived(upload.chunks.reduce((sum,part)=>sum+part.size,0));
   for(let index=0;index<Math.ceil(file.size/upload.chunkSize);index++){
    if(!live())return;if(upload.chunks.some(part=>part.index===index))continue;
    upload=await apiRequest<StudioMaterialUpload>(uploads+'/'+upload.id+'/chunks/'+index,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file.slice(index*upload.chunkSize,(index+1)*upload.chunkSize),signal:controller.signal});
    if(live())setReceived(upload.chunks.reduce((sum,part)=>sum+part.size,0));
   }
   if(!live())return;setBusy('requesting');
   if(startRequest.current?.uploadId!==upload.id||startRequest.current.version!==version)startRequest.current={version,uploadId:upload.id,requestKey:crypto.randomUUID()};
   const row=await apiRequest<StudioOriginalRepair>(endpoint,{method:'POST',body:JSON.stringify(startRequest.current),signal:controller.signal});if(live()){setRepair(row);startRequest.current=null;setNotice('原件恢复已保存，离开后仍可回来查看进度。');}
  }catch(caught){if(live()){setError((caught as Error).message);try{const rows=await apiRequest<StudioOriginalRepair[]>(endpoint,{signal:controller.signal});if(live()){setRepair(rows[0]??null);if(rows.some(row=>row.uploadId===startRequest.current?.uploadId)){setError('');startRequest.current=null;}}}catch{/* Keep the failed request and show the saved-data recovery action. */}}}
  finally{if(operation.current===controller){operation.current=null;setBusy('');}if(fileInput.current)fileInput.current.value='';}
 }
 async function control(action:'cancel'|'retry'){
  if(!repair||busy)return;const controller=new AbortController();operation.current?.abort();operation.current=controller;setBusy(action);setError('');
  try{
   if(controls.current?.id!==repair.id||controls.current.action!==action)controls.current={id:repair.id,action,expectedRevision:repair.revision,requestKey:crypto.randomUUID()};
   const request=controls.current,row=await apiRequest<StudioOriginalRepair>(endpoint+'/'+repair.id+'/'+action,{method:'POST',body:JSON.stringify({expectedRevision:request.expectedRevision,requestKey:request.requestKey}),signal:controller.signal});
   if(!controller.signal.aborted){setRepair(row);controls.current=null;}
  }catch(caught){if(!controller.signal.aborted)setError((caught as Error).message);}finally{if(operation.current===controller){operation.current=null;setBusy('');}}
 }
 function pause(){operation.current?.abort();operation.current=null;setBusy('');setNotice('已停止等待。收到的分块和已创建的恢复任务会保留，可以读取进度或重选同一文件。');}
 const failed=Boolean(repair&&['failed','cancelled'].includes(repair.task?.state??'')&&!['completed','cancelled','cleaning'].includes(repair.status));
 const canControl=repair?.canManage??false;
 if(!canStart&&!repair&&!error)return null;
 return<section className="sc-original-repair" aria-label="恢复PDF原件" aria-busy={Boolean(busy)||loading}>
  <header><b>恢复原件</b>{repair&&<span role="status">{failed?'恢复需要处理':labels[repair.status]}</span>}</header>
  <p>选择当时的同一PDF，核对内容后恢复原件。已保存的正文、课程和审核结果继续保留；原页图可以在恢复后另行检查。</p>
  <input ref={fileInput} type="file" hidden accept="application/pdf,.pdf" aria-label="选择用于恢复的原始PDF" onChange={event=>{const file=event.target.files?.[0];if(file)void choose(file);}}/>
  {busy&&['checking','uploading','requesting'].includes(busy)&&<div className="sc-repair-upload"><p role="status">{busy==='checking'?'正在核对所选原件…':busy==='requesting'?'正在保存恢复任务…':'正在上传用于恢复的原件…'}</p><progress value={received} max={material.byteSize} aria-label="恢复原件上传进度"/><button type="button" onClick={pause}>停止等待</button></div>}
  {notice&&<p role="status">{notice}</p>}
  {active&&<p>{repair?.status==='cleaning'?'取消后会清理这次恢复的临时文件，已恢复的正确原件会保留。':repair?.task?.state==='retry_wait'?reason(repair.task.errorCode):'正在等待或执行文件核验。刷新页面可以读取同一任务。'}</p>}
  {repair?.status==='cleaning'&&repair.task?.errorCode&&<p className="sc-pdf-notice" role="status">{reason(repair.task.errorCode)}仍在收尾的原件会继续保留，核对后可读取最新进度。</p>}
  {failed&&<p className="sc-pdf-notice">{reason(repair?.task?.errorCode??null)}</p>}
  {repair?.status==='completed'&&<p role="status">完整原件已核验并保存。请重新检查原件与原页，按需重新生成页图。</p>}
  <footer>
   {canStart&&!active&&<button type="button" disabled={disabled||Boolean(busy)||loading||!version} onClick={()=>fileInput.current?.click()}>选择同一PDF恢复</button>}
   {failed&&canControl&&<button type="button" disabled={Boolean(busy)} onClick={()=>void control('retry')}>重试原件恢复</button>}
   {active&&repair?.status!=='cleaning'&&canControl&&<button type="button" disabled={Boolean(busy)} onClick={()=>void control('cancel')}>取消这次恢复</button>}
   {repair?.status==='completed'&&<button type="button" disabled={Boolean(busy)||disabled} onClick={onRecheck}>重新检查文件</button>}
   {(error||repair)&&<button type="button" disabled={Boolean(busy)} onClick={()=>{controls.current=null;setAttempt(value=>value+1);}}>读取恢复进度</button>}
  </footer>
  {error&&<p className="sc-pdf-error" role="alert">{error}</p>}
 </section>;
}
