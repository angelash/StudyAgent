'use client';
import * as React from 'react';
import type { GuidanceModelAdoptionCommand,GuidanceModelSuggestionCommand,GuidanceModelSuggestionList,GuidanceModelSuggestionView,GuidancePlanView } from '@study-agent/contracts';
import { apiRequest,ApiRequestError } from '../lib/api';
import { useSessionUser } from '../lib/session-user';
import { useXiaojiuModels,XiaojiuModelPicker } from './xiaojiu-model-picker';
import './guidance-model-panel.css';

type Pending={kind:'create';command:GuidanceModelSuggestionCommand}|{kind:'adopt';id:string;command:GuidanceModelAdoptionCommand};
type Draft={version:1;ownerId:string;planId:string;studentId:string;pending:Pending|null;rejected:Pending|null;selectedId:string|null};
const active=(row:GuidanceModelSuggestionView|null|undefined)=>!!row&&['queued','running','validating','cancelling'].includes(row.status);
const labels={queued:'等待生成',running:'正在生成说明',validating:'正在检查依据',completed:'建议已生成',failed:'生成未完成',cancelled:'已取消',cancelling:'正在取消'};
function latest(old:GuidanceModelSuggestionView,next:GuidanceModelSuggestionView) {
  const before=[old.task?.generation??0,old.revision,old.task?.version??0],after=[next.task?.generation??0,next.revision,next.task?.version??0];
  for(let index=0;index<before.length;index++)if(before[index]!==after[index])return after[index]>before[index]?next:old;
  return next;
}
function merge(old:GuidanceModelSuggestionView[],incoming:GuidanceModelSuggestionView[]) {
  const rows=new Map(old.map(row=>[row.id,row]));for(const row of incoming)rows.set(row.id,rows.has(row.id)?latest(rows.get(row.id)!,row):row);
  return [...rows.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
}
function decode(raw:string,ownerId:string,plan:GuidancePlanView):Draft|null {
  try {
    const value=JSON.parse(raw) as Draft;
    if(value.version!==1||value.ownerId!==ownerId||value.planId!==plan.id||value.studentId!==plan.studentId||value.selectedId!==null&&(typeof value.selectedId!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(value.selectedId)))return null;
    for(const pending of [value.pending,value.rejected]) {
      if(pending===null)continue;
      if(!pending||!['create','adopt'].includes(pending.kind)||!pending.command)return null;
      const command=pending.command;
      if(typeof command.requestKey!=='string'||command.requestKey.length<8||command.requestKey.length>180||!Number.isInteger(command.expectedRevision)||command.expectedRevision<1)return null;
      if(pending.kind==='create') {
        if(Object.keys(command).some(key=>!['requestKey','modelId','expectedRevision'].includes(key))||typeof pending.command.modelId!=='string'||!pending.command.modelId.trim()||pending.command.modelId.length>180)return null;
      }else if(Object.keys(command).some(key=>!['requestKey','expectedRevision','suggestionRevision'].includes(key))||typeof pending.id!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(pending.id)||!Number.isInteger(pending.command.suggestionRevision)||pending.command.suggestionRevision<0)return null;
    }
    return {version:1,ownerId,planId:plan.id,studentId:plan.studentId,pending:value.pending,rejected:value.rejected,selectedId:value.selectedId};
  }catch{return null;}
}

export function GuidanceModelPanel({plan,onChange}:{plan:GuidancePlanView;onChange:(value:GuidancePlanView)=>void}) {
  const identity=useSessionUser(),allowed=!!identity&&['parent','admin'].includes(identity.role),ownerId=allowed?identity!.id:'';
  const key=ownerId?'studyagent.guidance.model.v1.'+encodeURIComponent(ownerId)+'.'+encodeURIComponent(plan.id):'',base='/diagnostics/plans/'+plan.id+'/model-suggestions';
  const {catalog,modelId,setModelId,error:modelError}=useXiaojiuModels(allowed);
  const [scope,setScope]=React.useState(''),[rows,setRows]=React.useState<GuidanceModelSuggestionView[]>([]),[selected,setSelected]=React.useState<GuidanceModelSuggestionView|null>(null);
  const [pending,setPending]=React.useState<Pending|null>(null),[rejected,setRejected]=React.useState<Pending|null>(null),[busy,setBusy]=React.useState(false),[loading,setLoading]=React.useState(false);
  const [error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),[storageNotice,setStorageNotice]=React.useState(''),[page,setPage]=React.useState(1),[hasMore,setHasMore]=React.useState(false);
  const [pollPaused,setPollPaused]=React.useState(false),epoch=React.useRef(0),draft=React.useRef<Draft|null>(null),working=React.useRef(false),controllers=React.useRef(new Set<AbortController>());
  const current=React.useRef(plan),callback=React.useRef(onChange);current.current=plan;callback.current=onChange;
  const matches=!!key&&scope===key;
  function write(value:Draft){draft.current=value;setPending(value.pending);setRejected(value.rejected);try{localStorage.setItem(key,JSON.stringify(value));}catch{setStorageNotice('本机暂存不可用。原建议命令仍在内存中，可下载副本后再刷新。');}}
  async function call<T>(path:string,options:RequestInit={}){const controller=new AbortController();controllers.current.add(controller);try{return await apiRequest<T>(path,{...options,signal:controller.signal});}finally{controllers.current.delete(controller);}}
  function accept(row:GuidanceModelSuggestionView,choose=true){setRows(old=>merge(old,[row]));if(choose){setSelected(old=>old?.id===row.id?latest(old,row):row);if(draft.current&&draft.current.selectedId!==row.id)write({...draft.current,selectedId:row.id});}}
  async function refresh(choose=true){const revision=epoch.current,list=await call<GuidanceModelSuggestionList>(base+'?pageSize=20');if(revision!==epoch.current)return;
    setRows(old=>merge(old,list.suggestions));setPage(1);setHasMore(list.hasMore);
    if(choose){let row=list.suggestions.find(row=>row.id===draft.current?.selectedId);if(!row&&draft.current?.selectedId)try{row=await call<GuidanceModelSuggestionView>(base+'/'+draft.current.selectedId);}catch(e){if(!(e instanceof ApiRequestError&&e.status===404))throw e;}
      if(revision!==epoch.current)return;row??=list.suggestions.find(active)??list.suggestions[0];if(row)accept(row);}
  }
  React.useEffect(()=>{
    const revision=++epoch.current;for(const controller of controllers.current)controller.abort();controllers.current.clear();working.current=false;setBusy(false);setRows([]);setSelected(null);setPending(null);setRejected(null);setError('');setNotice('');setStorageNotice('');setPollPaused(false);setScope('');
    if(!key||!allowed){setLoading(false);return;}
    let restored:Draft|null=null;try{const raw=localStorage.getItem(key);if(raw){restored=decode(raw,ownerId,current.current);if(!restored)setStorageNotice('本机记录与当前账号或计划不匹配，已保留原缓存并忽略恢复。');}}catch{setStorageNotice('本机缓存不可用，当前命令可下载副本。');}
    draft.current=restored??{version:1,ownerId,planId:plan.id,studentId:plan.studentId,pending:null,rejected:null,selectedId:null};setPending(draft.current.pending);setRejected(draft.current.rejected);setScope(key);setLoading(true);
    void refresh().catch(e=>{if(revision===epoch.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}).finally(()=>{if(revision===epoch.current)setLoading(false);});
    return()=>{epoch.current++;for(const controller of controllers.current)controller.abort();controllers.current.clear();};
  },[key,allowed]);
  const polling=active(selected)?selected:rows.find(active)??null;
  React.useEffect(()=>{
    if(!matches||!polling||pollPaused)return;
    const revision=epoch.current,id=polling.id;let alive=true,timer:ReturnType<typeof setTimeout>|undefined;
    async function poll(){try{const row=await call<GuidanceModelSuggestionView>(base+'/'+id);if(!alive||revision!==epoch.current)return;accept(row,selected?.id===row.id);if(active(row))timer=setTimeout(()=>void poll(),1000);}
      catch(e){if(alive&&revision===epoch.current&&(e as Error).name!=='AbortError'){setError((e as Error).message);setPollPaused(true);}}}
    timer=setTimeout(()=>void poll(),500);return()=>{alive=false;if(timer)clearTimeout(timer);};
  },[matches,polling?.id,polling?.status,selected?.id,pollPaused]);
  async function submit(recover=false,adopt=false){
    if(!matches||working.current||!draft.current)return;if(pending&&!recover){setError('原操作尚待确认，请先读取并恢复原操作。');return;}
    const revision=epoch.current;working.current=true;setBusy(true);setError('');setNotice('');setPollPaused(false);
    try{
      let action=recover?draft.current.pending:null;
      if(!action)action=adopt&&selected?{kind:'adopt',id:selected.id,command:{requestKey:crypto.randomUUID(),expectedRevision:current.current.revision??1,suggestionRevision:selected.revision}}:
        {kind:'create',command:{requestKey:crypto.randomUUID(),modelId,expectedRevision:current.current.revision??1}};
      write({...draft.current,pending:action});
      if(action.kind==='create'){
        const found=await call<GuidanceModelSuggestionList>(base+'?requestKey='+encodeURIComponent(action.command.requestKey));if(revision!==epoch.current)return;
        const row=found.suggestions[0]??await call<GuidanceModelSuggestionView>(base,{method:'POST',body:JSON.stringify(action.command)});if(revision!==epoch.current)return;
        write({...draft.current!,pending:null,selectedId:row.id});accept(row);setNotice('原计划保持当前说明；生成完成后可对照，再明确采用。');
      }else{
        const updated=await call<GuidancePlanView>(base+'/'+action.id+'/adopt',{method:'POST',body:JSON.stringify(action.command)});if(revision!==epoch.current)return;
        write({...draft.current!,pending:null,selectedId:action.id});callback.current(updated);const row=await call<GuidanceModelSuggestionView>(base+'/'+action.id);if(revision!==epoch.current)return;accept(row);setNotice('已采用说明，原行动定义、规则计划和各次修订继续保留。');
      }
    }catch(e){if(revision===epoch.current&&(e as Error).name!=='AbortError'){
      setError((e as Error).message);const action=draft.current?.pending;
      if(action&&e instanceof ApiRequestError&&[400,409,429,503].includes(e.status))try{
        if(action.kind==='create'){const found=await call<GuidanceModelSuggestionList>(base+'?requestKey='+encodeURIComponent(action.command.requestKey));if(revision!==epoch.current)return;
          if(found.suggestions[0]){write({...draft.current!,pending:null});accept(found.suggestions[0]);}else{write({...draft.current!,pending:null,rejected:action});setNotice('原请求已被明确拒绝，原命令留在副本中；请核对当前版本后重新请求。');}}
        else{const row=await call<GuidanceModelSuggestionView>(base+'/'+action.id);if(revision!==epoch.current)return;accept(row);write({...draft.current!,pending:null,rejected:action});setNotice('采用未获确认，已读取当前建议；原命令保留在副本中。');}
      }catch{/* Preserve unknown outcomes if the confirming read fails. */}
    }}finally{if(revision===epoch.current){working.current=false;setBusy(false);}}
  }
  async function control(action:'cancel'|'retry'){
    if(!matches||!selected||working.current)return;const revision=epoch.current,id=selected.id;working.current=true;setBusy(true);setError('');setNotice('');
    try{const latest=await call<GuidanceModelSuggestionView>(base+'/'+id);if(revision!==epoch.current)return;
      const row=latest.status==='completed'?latest:await call<GuidanceModelSuggestionView>(base+'/'+id+'/'+action,{method:'POST',body:JSON.stringify({generation:latest.task!.generation,version:latest.task!.version})});
      if(revision!==epoch.current)return;accept(row);setPollPaused(false);
    }catch(e){if(revision===epoch.current){setError((e as Error).message);try{const row=await call<GuidanceModelSuggestionView>(base+'/'+id);if(revision===epoch.current)accept(row);}catch{}}}
    finally{if(revision===epoch.current){working.current=false;setBusy(false);}}
  }
  async function choose(id:string){const revision=epoch.current;setError('');try{const row=await call<GuidanceModelSuggestionView>(base+'/'+id);if(revision===epoch.current)accept(row);}catch(e){if(revision===epoch.current)setError((e as Error).message);}}
  async function more(){if(busy||!hasMore)return;const revision=epoch.current;setBusy(true);try{const list=await call<GuidanceModelSuggestionList>(base+'?pageSize=20&page='+(page+1));if(revision!==epoch.current)return;setRows(old=>merge(old,list.suggestions));setPage(list.page);setHasMore(list.hasMore);}catch(e){if(revision===epoch.current)setError((e as Error).message);}finally{if(revision===epoch.current)setBusy(false);}}
  function download(){if(!draft.current)return;const url=URL.createObjectURL(new Blob([JSON.stringify(draft.current,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='指导建议原命令副本.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(!allowed)return null;
  return <section className="guidance-model-panel" aria-label="AI指导说明建议"><header><div><span>说明建议</span><h3>把下一步，写得更具体。</h3><p>对照原计划与建议，再决定是否采用。知识目标、时间、成功标准和复测安排按原计划保留。</p></div></header>
    {!matches||loading?<p role="status">正在读取这份计划的建议记录…</p>:<>
      <div className="guidance-model-controls"><XiaojiuModelPicker catalog={catalog} value={modelId} onChange={setModelId} disabled={busy||!!pending}/>
        <button className="studio-secondary" disabled={busy||!!pending||!!rows.find(active)||plan.status!=='proposed'||plan.impact.needsReview||!catalog} onClick={()=>void submit()}>生成说明建议</button>
        <button className="studio-text-button" disabled={busy} onClick={()=>{setPollPaused(false);void refresh().catch(e=>setError(e.message));}}>读取最新状态</button></div>
      {(error||modelError)&&<p role="alert" className="studio-error">{error||modelError}</p>}{notice&&<p role="status" className="studio-notice">{notice}</p>}{storageNotice&&<p role="status">{storageNotice}</p>}
      {pending&&<p className="guidance-model-recovery">原{pending.kind==='create'?'建议请求':'采用操作'}结果尚未确认。<button className="studio-secondary" disabled={busy} onClick={()=>void submit(true)}>读取并恢复原操作</button></p>}
      {(pending||rejected||storageNotice)&&<button className="studio-text-button" onClick={download}>下载原命令副本</button>}
      {selected&&<article className="guidance-model-result" aria-label="当前说明建议"><div className="guidance-model-state" role="status"><strong>{labels[selected.status]}</strong><span>{selected.modelName} · 原计划第{selected.planRevision}版</span></div>
        {selected.task?.errorCode&&<p>{selected.task.errorCode==='guidance_context_changed'?'原计划、授权或评测依据已变化，请核对当前版本后重新请求。':'这次生成未能完成，原计划仍可使用；可重试原任务或选择模型重新请求。'}</p>}
        <div className="guidance-model-controls">{active(selected)&&<button className="studio-secondary" disabled={busy} onClick={()=>void control('cancel')}>取消生成</button>}
          {active(selected)&&!pollPaused&&<button className="studio-text-button" disabled={busy} onClick={()=>setPollPaused(true)}>暂停读取状态</button>}
          {['failed','cancelled'].includes(selected.status)&&<button className="studio-secondary" disabled={busy||!!pending||plan.status!=='proposed'||plan.impact.needsReview||plan.revision!==selected.planRevision} onClick={()=>void control('retry')}>重试原模型</button>}
          {pollPaused&&<button className="studio-secondary" onClick={()=>{setPollPaused(false);void refresh().catch(e=>setError(e.message));}}>继续读取状态</button>}</div>
        {pollPaused&&<p role="status">已暂停自动读取，可以继续使用原计划，稍后查看建议。</p>}
        {selected.result&&<details className="guidance-model-compare-details"><summary>对照原说明与建议，再决定是否采用</summary><div className="guidance-model-comparison"><section aria-label="原计划说明"><h4>原说明 · 第{selected.planRevision}版</h4><p>{selected.original.summary}</p></section><section aria-label="模型建议说明"><h4>建议说明 · {selected.modelName}</h4><p>{selected.result.summary}</p></section></div>
          {selected.original.actions.map(action=><div className="guidance-model-action" key={action.id}><h4>{action.title}</h4><div className="guidance-model-comparison"><p><small>原说明</small>{action.activity}</p><p><small>建议说明</small>{selected.result!.activities.find(item=>item.actionId===action.id)?.activity}</p></div><p className="guidance-model-basis">{action.minutes}分钟 · 成功标准：{action.successCriterion} · 原证据 {action.evidenceIds.length} 条</p></div>)}
          <button className="studio-primary" disabled={busy||!!pending||!selected.eligibility.canAdopt||plan.status!=='proposed'||plan.impact.needsReview||plan.revision!==selected.planRevision} onClick={()=>void submit(false,true)}>采用这份说明</button>
          {selected.adoptedRevision===null&&(plan.status!=='proposed'||plan.impact.needsReview||plan.revision!==selected.planRevision)&&<p>当前计划或评测依据已更新，这份建议保留为原版本的记录。</p>}
          {!selected.eligibility.canAdopt&&<p>{selected.eligibility.reason}</p>}</details>}
      </article>}
      {!!rows.length&&<details className="guidance-model-history"><summary>这份计划的建议记录</summary><ul>{rows.map(row=><li key={row.id}><button className="studio-text-button" aria-current={selected?.id===row.id?'true':undefined} onClick={()=>void choose(row.id)}>{row.modelName} · {labels[row.status]} · 第{row.planRevision}版</button></li>)}</ul>{hasMore&&<button className="studio-secondary" disabled={busy} onClick={()=>void more()}>读取更早建议</button>}</details>}
    </>}
  </section>;
}
