'use client';
import * as React from 'react';
import Link from 'next/link';
import { apiRequest,ApiRequestError } from '../../../lib/api';
import type { SessionUser } from '../../../lib/session-user';
import { refreshSessionUser } from '../../../lib/session-user';
import { GespWorkspaceNavigation } from '../../../components/gesp-workspace-navigation';
import { WorkspaceDialog } from '../../studio/workspace-dialog';
import { readGespLocation,gespLocationHref,decodeGespManagementCopy,type GespLocation,type GespManagementCopy,type GespManagementPending } from '../../../lib/gesp-workspace';
import { gespManagementStorage,downloadGespCopy } from '../../../lib/gesp-workspace-storage';
import '../../student/assessment/studio.css';
import '../../student/gesp/gesp-student.css';

type Child = { id: string; nickname: string; grade: number };
type Task = { id: string; atomId: string; title: string; prompt: string; standard: string; reviewStatus: 'original_authored_pilot' | 'instructional_approved' };
type Capability = { atomId: string; state: string; dimensions: Array<{ dimension: string; status: string; attempts: number }>; hypothesis: string; nextAction: string };
type Plan = { id: string; status: string; version: number; minutesPerDay: number; totalActionMinutes: number; deferredAtomIds: string[]; actions: Array<{ id: string; atomId: string; title: string; activity: string; successCriterion: string; dimensionGaps: string[] }> };
type Review = { id: string; atomId: string; stageDay: number; dueAt: string; status: string; due: boolean };
type Workspace = { scope: null | { level: number; atomIds: string[]; version: number }; notice: string; tasks: Task[]; availableTasks: Task[];
  capabilities: Capability[]; guidancePlans: Plan[]; reviewTasks: Review[] };

export function GespParentWorkbench({user}:{user:SessionUser}){
  const [profiles,setProfiles]=React.useState<Child[]|null>(null),[location,setLocation]=React.useState<GespLocation|null>(null),[locationError,setLocationError]=React.useState('');
  const [loaded,setLoaded]=React.useState<{studentId:string;view:Workspace}|null>(null),[error,setError]=React.useState(''),[reload,setReload]=React.useState(0);
  const studentId=location?.studentId??'',workspace=loaded&&loaded.studentId===studentId?loaded.view:null;
  function setWorkspace(value:Workspace|null){setLoaded(value?{studentId,view:value}:null);}
  React.useEffect(()=>{const read=()=>{try{setLocation(readGespLocation(window.location.search));setLocationError('');}catch(reason){setLocation(null);setLocationError(reason instanceof Error?reason.message:'认证范围链接无效。');}};read();window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read);},[]);
  React.useEffect(()=>{
    if(!location||locationError)return;const request=new AbortController();
    void apiRequest<Child[]>('/learning/students',{signal:request.signal}).then(rows=>{
      if(request.signal.aborted)return;setProfiles(rows);
      if(!location.studentId&&rows.length){const next={...location,studentId:rows[0].id};window.history.replaceState(window.history.state,'',gespLocationHref('manage',next));setLocation(next);}
    }).catch(reason=>{if(!request.signal.aborted){setError(reason instanceof Error?reason.message:'无法读取授权档案。');if(reason instanceof ApiRequestError&&[401,403].includes(reason.status)){setProfiles(null);setWorkspace(null);void refreshSessionUser();}}});
    return()=>request.abort();
  },[user.id,Boolean(location),locationError,reload]);
  const allowed=!!profiles?.some(profile=>profile.id===studentId);
  React.useEffect(()=>{
    if(!allowed||locationError){setWorkspace(null);return;}const request=new AbortController();setError('');
    void apiRequest<Workspace>('/gesp/students/'+studentId+'/workspace',{signal:request.signal}).then(value=>{if(request.signal.aborted)return;setWorkspace(value);if(location?.level===null){const next={...location,level:value.scope?.level??1};window.history.replaceState(window.history.state,'',gespLocationHref('manage',next));setLocation(next);}}).catch(reason=>{if(request.signal.aborted)return;setError(reason instanceof Error?reason.message:'无法读取当前认证范围。');if(reason instanceof ApiRequestError&&[401,403,404].includes(reason.status)){setWorkspace(null);if([401,403].includes(reason.status))void refreshSessionUser();}});
    return()=>request.abort();
  },[user.id,studentId,allowed,locationError,reload]);
  React.useEffect(()=>{const refresh=()=>setReload(value=>value+1),timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  function choose(id:string,level:number|null){const next:GespLocation={studentId:id,level,taskId:'',reviewTaskId:''};window.history.pushState(window.history.state,'',gespLocationHref('manage',next));setWorkspace(id!==studentId?null:workspace);setLocation(next);setLocationError('');}
  const level=location?.level??workspace?.scope?.level??1;
  if(!workspace||!allowed||!location||locationError)return <main className="learning-studio gesp-page"><GespWorkspaceNavigation mode="manage" studentId={allowed?studentId:undefined} level={location?.level??undefined} pending={!error&&!locationError&&(profiles===null||allowed)} unavailable={!!error||!!locationError||!!profiles?.length&&!allowed}/><div className="gesp-shell"><h1>GESP认证范围与计划</h1><p role={error||locationError||profiles&&studentId&&!allowed?'alert':'status'}>{locationError||error||(profiles&&studentId&&!allowed?'链接中的档案当前不可管理，请重新选择。':profiles?.length===0?'当前还没有可管理的学习档案。':'正在读取授权档案与认证范围…')}</p>{profiles?.map(profile=><button className="studio-secondary" key={profile.id} onClick={()=>choose(profile.id,1)}>{profile.nickname}</button>)}<button className="studio-secondary" onClick={()=>setReload(value=>value+1)}>重新读取</button><Link href="/studio/profiles">学习档案</Link></div></main>;
  return <GespManagementEditor key={studentId+':'+level} user={user} studentId={studentId} level={level} workspace={workspace} profiles={profiles!} rootError={error} onChoose={choose} onRefresh={()=>setReload(value=>value+1)}/>;
}

function GespManagementEditor({user,studentId,level,workspace,profiles,rootError,onChoose,onRefresh}:{rootError:string;user:SessionUser;studentId:string;level:number;workspace:Workspace;profiles:Child[];onChoose:(id:string,level:number)=>void;onRefresh:()=>void}){
  const storage=React.useMemo(()=>gespManagementStorage(user.id,studentId,level),[user.id,studentId,level]),scope={ownerId:user.id,studentId,level};
  const empty=():GespManagementCopy=>({format:'gesp-management-copy-v1',...scope,atomIds:workspace.scope?.level===level?[...workspace.scope.atomIds]:[],baseScopeVersion:workspace.scope?.version??0,pending:null});
  const [copy,setCopy]=React.useState<GespManagementCopy>(()=>{for(const key of storage.restoreKeys){try{const raw=localStorage.getItem(key);if(raw&&raw.length<256*1024)return decodeGespManagementCopy(JSON.parse(raw),scope);}catch{/* Preserve unknown originals. */}}return empty();});
  const latest=React.useRef(copy);latest.current=copy;
  const [protectedSignature,setProtectedSignature]=React.useState(''),[exported,setExported]=React.useState(''),[notice,setNotice]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const [waiting,setWaiting]=React.useState<{proceed:()=>void}|null>(null),[comparison,setComparison]=React.useState<GespManagementCopy|null>(null),[alternatives,setAlternatives]=React.useState<GespManagementCopy[]>([]);
  const request=React.useRef<AbortController|null>(null),running=React.useRef(false);React.useEffect(()=>()=>request.current?.abort(),[]);
  const signature=JSON.stringify(copy),current=copy.baseScopeVersion===(workspace.scope?.version??0),different=copy.level!==(workspace.scope?.level??level)||JSON.stringify([...copy.atomIds].sort())!==JSON.stringify([...(workspace.scope?.atomIds??[])].sort()),changed=Boolean(copy.pending||different&&Boolean(copy.atomIds.length||workspace.scope?.level===level));
  const unsafe=changed&&signature!==protectedSignature&&signature!==exported;
  function store(value:GespManagementCopy){latest.current=value;setCopy(value);try{const raw=JSON.stringify(value);if(localStorage.getItem(storage.key)!==raw)localStorage.setItem(storage.key,raw);if(localStorage.getItem(storage.key)!==raw)throw Error('unconfirmed');setProtectedSignature(raw);}catch{setProtectedSignature('');setNotice('本机暂不能保留完整范围选择与原操作。请先下载副本再切换或离开。');}}
  React.useEffect(()=>{store(latest.current);},[storage.key]);
  React.useEffect(()=>{const protect=(event:BeforeUnloadEvent)=>{if(unsafe){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[unsafe]);
  function download(){downloadGespCopy(latest.current,'GESP完整范围与计划副本.json');setExported(JSON.stringify(latest.current));}
  function leave(proceed:()=>void){if(running.current){setNotice('原操作正在核对，请稍后再切换。');return;}if(unsafe)setWaiting({proceed});else proceed();}
  async function run(pending:GespManagementPending,protectedNow=false){
    if(running.current)return;if(unsafe&&!protectedNow){setNotice('先下载完整范围副本，再用原操作继续。');return;}
    if(pending.kind==='decision'&&!workspace.guidancePlans.some(plan=>plan.id===pending.planId)){setError('原计划不属于当前档案，请保留副本并核对原计划。');return;}
    running.current=true;const operation=new AbortController();request.current=operation;setBusy(true);setError('');
    try{
      const path=pending.kind==='scope'?'/gesp/students/'+studentId+'/scope':pending.kind==='plan'?'/gesp/guidance-plans':'/gesp/guidance-plans/'+encodeURIComponent(pending.planId);
      const result=await apiRequest<any>(path,{method:pending.kind==='scope'?'PUT':pending.kind==='plan'?'POST':'PATCH',body:JSON.stringify(pending.command),signal:operation.signal});if(operation.signal.aborted)return;
      if(result.studentId!==studentId)throw Error('原结果不属于当前档案，完整输入与原操作保持。');
      if(pending.kind==='scope'&&(result.level!==pending.command.level||JSON.stringify([...result.atomIds].sort())!==JSON.stringify([...new Set(pending.command.atomIds)].sort())||result.version!==pending.command.expectedVersion!+1))throw Error('范围回执与原选择或版本不一致，请保留完整副本核对。');
      if(pending.kind==='decision'&&(result.id!==pending.planId||result.status!==pending.command.status))throw Error('原计划确认回执不一致。');
      store({...latest.current,pending:null,...(pending.kind==='scope'?{baseScopeVersion:result.version}:{})});setNotice(pending.kind==='scope'?'原范围确认已保存，正在读取当前版本；其他位置的后续修改会另行显示。':pending.kind==='plan'?'原计划已生成，请核对活动和目标后再明确启用。':'原计划确认已保存。');onRefresh();
    }catch(reason){if(!operation.signal.aborted){setError(reason instanceof Error?reason.message:'原结果尚未确认。');if(reason instanceof ApiRequestError&&[401,403].includes(reason.status))void refreshSessionUser();}}
    finally{running.current=false;if(!operation.signal.aborted)setBusy(false);}
  }
  function prepare(pending:GespManagementPending){if(running.current||latest.current.pending)return;const value={...latest.current,pending};store(value);try{const raw=JSON.stringify(value);if(localStorage.getItem(storage.key)!==raw)throw Error('unconfirmed');void run(pending,true);}catch{setNotice('原操作保留在当前页面，请先下载完整副本后再继续。');}}
  function save(){if(!current||!copy.atomIds.length)return;prepare({kind:'scope',command:{level,atomIds:copy.atomIds,expectedVersion:copy.baseScopeVersion,requestKey:crypto.randomUUID(),reason:'家长依据当前原创试点题确认GESP独立学习范围'}});}
  function createPlan(){if(!workspace.scope||!current||different)return;prepare({kind:'plan',command:{studentId,scopeVersion:workspace.scope.version,minutesPerDay:20,requestKey:crypto.randomUUID(),reason:'家长依据现有GESP独立证据生成待确认指导计划'}});}
  function decidePlan(plan:Plan){prepare({kind:'decision',planId:plan.id,command:{status:'active',expectedVersion:plan.version,requestKey:crypto.randomUUID(),reason:'家长核对知识点、活动、成功标准与每日时长后确认启用'}});}
  async function restore(file:File|undefined){if(!file)return;try{if(file.size>256*1024)throw Error('范围副本过大，请使用原下载文件。');setComparison(decodeGespManagementCopy(JSON.parse(await file.text()),scope));}catch(reason){setError(reason instanceof Error?reason.message:'无法读取这份管理副本。');}}
  function inspect(){try{const values:GespManagementCopy[]=[];for(const key of Object.keys(localStorage)){if(key===storage.key||!key.startsWith(storage.base+'.'))continue;const raw=localStorage.getItem(key);if(!raw||raw.length>256*1024)continue;try{values.push(decodeGespManagementCopy(JSON.parse(raw),scope));}catch{/* Other scopes remain separate. */}}setAlternatives(values);}catch{setNotice('其他本机副本暂时无法读取，请使用自己的下载文件。');}}
  function preserve(){try{const raw=JSON.stringify(latest.current),key=storage.base+'.'+crypto.randomUUID();localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw Error('unconfirmed');return true;}catch{if(exported===JSON.stringify(latest.current))return true;setNotice('先下载当前完整范围与原操作，再确认换用另一份副本。');return false;}}
  function fresh(){if(unsafe||!preserve())return;store(empty());setNotice('原选择与原请求已另存。当前确认范围已读入，请重新明确选择。');}
  function adopt(){if(!comparison||unsafe||!preserve())return;store(comparison);setComparison(null);setNotice('已采用完整管理副本。原版本不一致时仍需比较当前范围。');}
  return <main className="learning-studio gesp-page"><GespWorkspaceNavigation mode="manage" studentId={studentId} level={level} onRequestNavigate={(_href,proceed)=>leave(proceed)}/><div className="gesp-shell">
    <header><span className="studio-eyebrow">GESP / INDEPENDENT CERTIFICATION TRACK</span><h1>GESP认证范围与计划</h1><p>认证等级独立于学校年级。当前为1～4级原创试点，内容资格和实际学习证据分别保留；试点任务不代表完整审核课程。</p></header>
    {(error||rootError)&&<p className="studio-error" role="alert">{error||rootError}<button className="studio-secondary" onClick={onRefresh}>重新读取当前范围</button></p>}{notice&&<p className="studio-notice" role="status">{notice}</p>}
    <section className="gesp-recovery" aria-label="GESP管理副本恢复"><button className="studio-secondary" onClick={download}>下载完整范围与计划副本</button><button className="studio-secondary" onClick={inspect}>查看其他本机范围副本</button><label>从本次GESP管理副本恢复<input type="file" accept="application/json,.json" onChange={event=>{void restore(event.target.files?.[0]);event.target.value='';}}/></label></section>
    {copy.pending&&<section className="studio-notice" aria-label="GESP原管理操作恢复"><h2>原范围或计划操作尚待确认</h2><p>继续时保留同一份选择与原操作。当前最新范围与原确认结果分别核对。</p><button className="studio-primary" disabled={busy||unsafe} onClick={()=>void run(copy.pending!)}>核对并继续原管理操作</button><button className="studio-secondary" onClick={download}>下载原选择与原操作</button></section>}
    {!current&&<section className="studio-notice" aria-label="GESP范围版本比较"><h2>当前确认范围已变化</h2><p>本机选择基于 v{copy.baseScopeVersion}，当前范围为 v{workspace.scope?.version??0}。旧输入保持，不会自动覆盖新确认。</p><p>当前等级：{workspace.scope?.level??'尚未确认'}；已确认 {workspace.scope?.atomIds.length??0} 个知识点。</p><button className="studio-secondary" disabled={unsafe||busy} onClick={fresh}>保留旧副本，采用当前范围</button></section>}
    {alternatives.map((value,index)=><button className="studio-secondary" key={index} onClick={()=>setComparison(value)}>比较本机范围副本 {index+1}</button>)}
    {comparison&&<section className="gesp-comparison" aria-label="GESP范围副本比较"><h2>先核对两份完整范围</h2><p>当前输入：{copy.atomIds.join('、')||'尚未选择'}；版本 v{copy.baseScopeVersion}。</p><p>准备采用：{comparison.atomIds.join('、')||'尚未选择'}；版本 v{comparison.baseScopeVersion}；{comparison.pending?'包含原操作':'没有待确认操作'}。</p><button className="studio-secondary" disabled={unsafe||busy} onClick={adopt}>明确采用这份完整管理副本</button><button className="studio-secondary" onClick={()=>setComparison(null)}>保留当前选择</button></section>}
    <section className="gesp-panel"><div className="gesp-panel-head"><div><h2>认证{level}级原创试点范围</h2><p>{workspace.notice}</p></div><span className="studio-badge">已确认{workspace.scope?.level??'—'}级 · v{workspace.scope?.version??0}</span></div>
      <div className="gesp-management-controls"><label>学习档案<select aria-label="GESP学习档案" value={studentId} disabled={busy} onChange={event=>{const next=event.target.value;leave(()=>onChoose(next,level));}}>{profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.nickname} · 学校{profile.grade}年级</option>)}</select></label><label>认证等级<select aria-label="GESP认证等级" value={level} disabled={busy} onChange={event=>{const next=Number(event.target.value);leave(()=>onChoose(studentId,next));}}>{[1,2,3,4].map(value=><option key={value} value={value}>{value}级</option>)}</select></label></div>
      <div className="gesp-task-grid">{workspace.availableTasks.filter(task=>task.atomId.startsWith('gesp-cpp.l'+level+'.')).map(task=><label key={task.id} className="gesp-task-card"><input type="checkbox" aria-label={task.title} disabled={busy||!!copy.pending} checked={copy.atomIds.includes(task.atomId)} onChange={event=>{setExported('');store({...latest.current,atomIds:event.target.checked?[...new Set([...latest.current.atomIds,task.atomId])]:latest.current.atomIds.filter(id=>id!==task.atomId)});}}/><span><small>{task.atomId}</small><strong>{task.title}</strong><p>{task.prompt}</p><em>{task.standard} · {task.reviewStatus==='instructional_approved'?'教研内容已审核':'原创试点 · 尚未内容审核'}</em></span></label>)}</div>
      <div className="gesp-actions"><button className="studio-primary" disabled={busy||!!copy.pending||!current||!copy.atomIds.length} onClick={save}>确认并保存范围</button><Link className="studio-secondary" href={'/student/login?'+new URLSearchParams({returnTo:'/student/gesp'})}>打开孩子学习入口</Link></div>
    </section>
    <section className="gesp-panel"><div className="gesp-panel-head"><div><h2>证据到下一步</h2><p>计划依据已确认范围与现有独立证据生成，家长核对后才能启用。</p></div><button className="studio-primary" disabled={busy||!!copy.pending||!current||different||!workspace.scope} onClick={createPlan}>生成待确认计划</button></div>
      {different&&<p>当前还有未确认的范围选择。请先保存或明确恢复已确认范围，再生成计划。</p>}
      <div className="gesp-task-grid">{workspace.capabilities.map(item=><article key={item.atomId} className="gesp-task-card"><strong>{item.atomId}</strong><p>{item.dimensions.map(dimension=>dimension.dimension+'：'+dimension.status).join(' · ')}</p><p>{item.hypothesis}</p><small>{item.nextAction}</small></article>)}</div>
      {workspace.guidancePlans.map(plan=><article key={plan.id} className="studio-notice"><h3>{plan.status==='active'?'已启用':plan.status==='awaiting_confirmation'?'等待家长确认':'已完成'} · v{plan.version}</h3><p>每天约{plan.minutesPerDay}分钟；本轮{plan.actions.length}项，共{plan.totalActionMinutes}分钟；另有{plan.deferredAtomIds.length}个点延后。</p>{plan.actions.map(action=><details key={action.id}><summary>{action.title}</summary><p>{action.activity}</p><p>成功标准：{action.successCriterion}</p><small>待补维度：{action.dimensionGaps.join('、')||'延迟保持'}</small></details>)}{plan.status==='awaiting_confirmation'&&<button className="studio-primary" disabled={busy||!!copy.pending} onClick={()=>decidePlan(plan)}>核对并启用计划</button>}</article>)}
      {workspace.reviewTasks.length>0&&<details><summary>间隔复测队列</summary>{workspace.reviewTasks.map(review=><p key={review.id}>{review.atomId} · 第{review.stageDay}天 · {review.status} · {new Date(review.dueAt).toLocaleString('zh-CN')}</p>)}</details>}
    </section>
    {waiting&&<WorkspaceDialog onClose={()=>setWaiting(null)} returnFocus={typeof window!=='undefined'&&window.matchMedia('(max-width:1000px)').matches?document.querySelector<HTMLButtonElement>('.ws-reference-trigger'):undefined}><div className="gesp-exit-layer"><section className="gesp-panel" role="dialog" aria-modal="true" aria-label="保留GESP范围与原操作"><h2>先保留完整范围选择</h2><p>副本包括当前等级、知识点、原版本及尚待确认的范围或计划操作。</p><button className="studio-secondary" onClick={()=>setWaiting(null)}>继续核对</button><button className="studio-secondary" onClick={download}>下载完整范围与计划副本</button><button className="studio-primary" disabled={unsafe||busy} onClick={()=>{const next=waiting;setWaiting(null);next.proceed();}}>已保留副本，继续</button></section></div></WorkspaceDialog>}
  </div></main>;
}
