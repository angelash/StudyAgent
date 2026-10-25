'use client';
import * as React from 'react';
import Link from 'next/link';
import type { SourceCourseLifecycleAction, SourceCourseLifecyclePreview, SourceCourseVersionSummary, SourceCourseView } from '@study-agent/contracts';
import { apiBaseUrl,apiRequest,getAuthToken } from '../../../lib/api';
import { WorkspaceDialog } from '../workspace-dialog';

const names={publish:'发布此修订',archive:'归档课程',withdraw:'撤回此版本',restore:'恢复使用此版本',discard:'放弃此修订稿'};
const states={draft:'待审修订',published:'正在使用',archived:'已归档',withdrawn:'已撤回',discarded:'已放弃'};
type Pending={kind:'revise'|'apply';body:Record<string,unknown>};
export function SourceCourseLifecyclePanel({row,viewerId,canManage,disabled,resumeHref,onUpdated,onOpen,onRevision}:{row:SourceCourseView;viewerId:string;canManage:boolean;disabled:boolean;resumeHref?:string;
  onUpdated:(row:SourceCourseView)=>void;onOpen:(row:SourceCourseVersionSummary)=>void;onRevision:(row:SourceCourseView)=>void}){
  const[versions,setVersions]=React.useState<SourceCourseVersionSummary[]>([]),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[preview,setPreview]=React.useState<SourceCourseLifecyclePreview|null>(null),[fork,setFork]=React.useState(false),[reason,setReason]=React.useState(''),[pending,setPending]=React.useState<Pending|null>(null);
  const trigger=React.useRef<HTMLElement|null>(null),refreshEpoch=React.useRef(0),alive=React.useRef(true),operation=React.useRef<AbortController|null>(null),cacheKey='studyagent.course.lifecycle.'+JSON.stringify([viewerId,row.id]);
  const refresh=React.useCallback(async(signal?:AbortSignal)=>{const epoch=++refreshEpoch.current,value=await apiRequest<SourceCourseVersionSummary[]>('/learning/source-courses/'+row.id+'/versions',{signal});if(!signal?.aborted&&alive.current&&epoch===refreshEpoch.current)setVersions(value);},[row.id]);
  React.useEffect(()=>{alive.current=true;const controller=new AbortController();void refresh(controller.signal).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    try{const value=JSON.parse(sessionStorage.getItem(cacheKey)??'null');if(value&&['revise','apply'].includes(value.kind)&&typeof value.body?.requestKey==='string'&&value.body.requestKey.length<=180)setPending(value);}catch{/* Optional local cache. */}
    return()=>{alive.current=false;controller.abort();operation.current?.abort();};},[cacheKey,refresh]);
  React.useEffect(()=>{if(alive.current)void refresh().catch(error=>setError(error.message));},[row.revision,refresh]);
  function remember(command:Pending|null){setPending(command);try{if(command)sessionStorage.setItem(cacheKey,JSON.stringify(command));else sessionStorage.removeItem(cacheKey);}catch{setError('当前标签页无法保存操作回执，请保持页面打开并重试原操作。');}}
  async function execute(command:Pending){if(busy||disabled)return;const controller=new AbortController();operation.current=controller;remember(command);setBusy(true);setError('');
    try{const token=getAuthToken(),response=await fetch(apiBaseUrl+'/api/learning/source-courses/'+row.id+(command.kind==='revise'?'/revisions':'/lifecycle'),{method:'POST',credentials:'include',signal:controller.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(command.body)}),payload=await response.json();
      if(!response.ok||payload.error){const failure=Object.assign(new Error(payload.error?.message??'课程操作暂未完成'),{status:response.status});throw failure;}
      if(!payload.data||typeof payload.data.id!=='string'||!Number.isSafeInteger(payload.data.revision)||command.kind==='apply'&&payload.data.id!==row.id||command.kind==='revise'&&payload.data.id===row.id)throw new Error('未收到有效课程回执，可以用原命令找回结果。');
      if(controller.signal.aborted||!alive.current)return;remember(null);setPreview(null);setFork(false);if(command.kind==='revise')onRevision(payload.data);else onUpdated(payload.data);
    }catch(error){if(controller.signal.aborted||!alive.current)return;const status=(error as Error&{status?:number}).status;
      if(status&&status>=400&&status<500)remember(null);setError((error as Error).message||'连接已中断，请重试原操作确认结果。');
    }finally{if(operation.current===controller){operation.current=null;if(alive.current)setBusy(false);}}
  }
  function closePreview(){setPreview(null);requestAnimationFrame(()=>{if(trigger.current?.isConnected)trigger.current.focus();});}
  async function prepare(action:SourceCourseLifecycleAction){if(busy||disabled||pending)return;trigger.current=document.activeElement as HTMLElement;const controller=new AbortController();operation.current=controller;setBusy(true);setError('');
    try{const value=await apiRequest<SourceCourseLifecyclePreview>('/learning/source-courses/'+row.id+'/lifecycle/preview',{method:'POST',body:JSON.stringify({action}),signal:controller.signal});if(!controller.signal.aborted&&alive.current){setReason('');setPreview(value);}}
    catch(error){if(!controller.signal.aborted&&alive.current)setError((error as Error).message);}finally{if(operation.current===controller){operation.current=null;if(alive.current)setBusy(false);}}}
  function stopWaiting(){operation.current?.abort();operation.current=null;setBusy(false);setError(pending?'已停止等待。操作可能已经保存，请用原命令找回结果。':'已停止读取预览；课程没有因此变更。');}
  async function readSaved(){if(busy)return;setBusy(true);try{const saved=await apiRequest<SourceCourseView>('/learning/source-courses/'+row.id);if(alive.current){onUpdated(saved);setPreview(null);setFork(false);setError('');}}catch(error){if(alive.current)setError((error as Error).message);}finally{if(alive.current)setBusy(false);}}
  const info=row.versioning,lastEvent=info?.events.at(-1),locked=busy||disabled||Boolean(pending),published=Boolean(row.confirmedAt),draft=Boolean(info?.parentCourseId)&&row.status==='ready';
  return <section className="sc-lifecycle" aria-label="课程版本与变更"><header><div><small>COURSE VERSIONS</small><h2>第 {info?.number??1} 版 <span>{info?states[info.state]:row.status==='active'?'正在使用':row.status==='archived'?'已归档':'待确认'}</span></h2></div>
    {canManage&&<div className="sc-lifecycle-actions">{published&&<button disabled={locked||row.sourceStatus!=='current'} onClick={()=>{setError('');setFork(true);}}>创建修订稿</button>}
      {draft&&<><button disabled={locked} onClick={()=>void prepare('publish')}>发布此修订</button><button disabled={locked} onClick={()=>void prepare('discard')}>放弃此修订稿</button></>}
      {row.status==='active'&&<button disabled={locked} onClick={()=>void prepare('archive')}>归档课程</button>}
      {published&&row.status==='archived'&&<button disabled={locked} onClick={()=>void prepare('restore')}>恢复使用此版本</button>}
      {published&&['active','archived'].includes(row.status)&&info?.state!=='withdrawn'&&<button disabled={locked} onClick={()=>void prepare('withdraw')}>撤回此版本</button>}</div>}
  </header>
    {lastEvent&&<p className="sc-version-reason">{lastEvent.reason} · {new Date(lastEvent.at).toLocaleString('zh-CN')}</p>}
    {resumeHref&&<p><Link href={resumeHref}>继续第 {info?.number??1} 版的原课堂 →</Link></p>}
    {info?.copiedAt&&<p>此修订来自现有教学稿，已有生成与复核来历随稿保留；复制没有重新调用模型，内容仍待人工核查。</p>}
    {pending&&!preview&&!fork&&<div className="sc-lifecycle-pending" role="status">上次操作尚未确认结果，原命令已保留。<button disabled={busy||disabled} onClick={()=>void execute(pending)}>找回上次课程操作</button></div>}
    {error&&!preview&&!fork&&<div className="sc-lifecycle-error" role="alert"><p>{error}</p><button disabled={busy} onClick={()=>void readSaved()}>读取已保存的课程版本</button></div>}
    {busy&&!preview&&!fork&&<p role="status">正在核对课程版本…</p>}
    {versions.length>1&&<details><summary>版本历史 · {versions.length} 个版本</summary><ol>{versions.map(item=><li key={item.id}><span>第 {item.number} 版 · {states[item.state]}<b>{item.title}</b></span>{item.id===row.id?<small>当前查看</small>:<button disabled={locked} onClick={()=>onOpen(item)}>查看第 {item.number} 版</button>}</li>)}</ol></details>}
    {fork&&<WorkspaceDialog busy={busy} onClose={()=>setFork(false)}><section className="sc-dialog" role="dialog" aria-modal="true" aria-label="创建课程修订稿"><header><h2>从第 {info?.number??1} 版创建修订稿</h2><button disabled={busy} onClick={()=>setFork(false)} aria-label="关闭修订确认">×</button></header><p>复制现有教学稿、题目和来源，进入完整编辑。原课程继续保留；发布修订时会再次展示对旧版的影响。</p><p>教学稿包含题目答案，将保留作者接触事实。此操作不会重新调用模型。</p>{error&&<div role="alert"><p>{error}</p><button disabled={busy} onClick={()=>void readSaved()}>读取已保存的课程版本</button>{pending&&<button disabled={busy} onClick={()=>void execute(pending)}>找回上次课程操作</button>}</div>}<footer>{busy&&<button onClick={stopWaiting}>停止等待</button>}<button disabled={busy} onClick={()=>setFork(false)}>继续使用原版</button><button className="sc-primary" disabled={busy||Boolean(pending)} onClick={()=>void execute({kind:'revise',body:{expectedRevision:row.revision,fingerprint:row.fingerprint,requestKey:crypto.randomUUID()}})}>创建并编辑修订稿</button></footer></section></WorkspaceDialog>}
    {preview&&<WorkspaceDialog busy={busy} onClose={closePreview}><section className="sc-dialog" role="dialog" aria-modal="true" aria-label="课程变更影响预览"><header><h2>{names[preview.action]}</h2><button disabled={busy} onClick={()=>setPreview(null)} aria-label="关闭课程变更预览">×</button></header>
      <p>已有 {preview.existing.sessions} 份课堂记录、{preview.existing.completedLectures} 份讲解已读记录、{preview.existing.answeredQuestions} 次首次作答将保留原快照。</p>
      <ul>{preview.changes.map(change=><li key={change.courseId}>{change.title}：{change.toStatus==='active'?'允许新开课堂':'停止新开课堂，已有课堂继续保留'}</li>)}</ul>
      <p>旧版进度与表现不会转移到新版。继续旧课堂仍读取原课件与原句。</p>
      <label>{preview.requiresReason?'变更原因（必填）':'变更原因（可选）'}<textarea aria-label="课程版本变更原因" minLength={preview.requiresReason?3:0} maxLength={1000} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)}/></label>
      {error&&<div role="alert"><p>{error}</p><button disabled={busy} onClick={()=>void readSaved()}>读取已保存的课程版本</button>{pending&&<button disabled={busy} onClick={()=>void execute(pending)}>找回上次课程操作</button>}</div>}<footer>{busy&&<button onClick={stopWaiting}>停止等待</button>}<button disabled={busy} onClick={closePreview}>取消变更</button><button className="sc-primary" disabled={busy||Boolean(pending)||preview.requiresReason&&reason.trim().length<3} onClick={()=>void execute({kind:'apply',body:{action:preview.action,expectedRevision:preview.expectedRevision,fingerprint:preview.fingerprint,impactFingerprint:preview.impactFingerprint,reason,requestKey:crypto.randomUUID()}})}>确认{names[preview.action]}</button></footer>
    </section></WorkspaceDialog>}
  </section>;
}
