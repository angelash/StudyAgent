'use client';
import * as React from 'react';
import type { GuidancePlanView } from '@study-agent/contracts';
import { apiRequest,ApiRequestError } from './api';

type Command={baselineSessionId:string;minutesPerDay:number;useAi:true;modelId:'auto';requestKey:string;expectedReportVersion:number};
type Draft={version:1;ownerId:string;studentId:string;baselineSessionId:string;reportVersion:number;pending:Command|null;rejected:Command|null};
export function useGuidanceCreation(ownerId:string,studentId:string,baselineSessionId:string,reportVersion:number,enabled:boolean,onPlan:(plan:GuidancePlanView)=>void) {
  const key=enabled&&ownerId&&studentId&&baselineSessionId?'studyagent.guidance.create.v1.'+[ownerId,studentId,baselineSessionId,String(reportVersion)].map(encodeURIComponent).join('.'):'';
  const [pending,setPending]=React.useState<Command|null>(null),[ready,setReady]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[storageNotice,setStorageNotice]=React.useState('');
  const [rejected,setRejected]=React.useState<Command|null>(null);
  const epoch=React.useRef(0),draft=React.useRef<Draft|null>(null),sending=React.useRef(false),callback=React.useRef(onPlan),controller=React.useRef<AbortController|null>(null);callback.current=onPlan;
  const memory=React.useRef(new Map<string,Draft>());
  function write(value:Draft){draft.current=value;memory.current.set(key,value);setPending(value.pending);setRejected(value.rejected);try{localStorage.setItem(key,JSON.stringify(value));}catch{setStorageNotice('原创建命令仍在内存中，本机暂存不可用，离开或刷新前可先下载副本。');}}
  React.useEffect(()=>{
    epoch.current++;controller.current?.abort();setReady(false);setBusy(false);sending.current=false;setError('');setStorageNotice('');setPending(null);setRejected(null);draft.current=null;if(!key)return;
    let value:Draft|null=memory.current.get(key)??null;
    try{const raw=value?null:localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw) as Draft;
      const valid=(command:Command|null|undefined)=>command===null||command&&typeof command==='object'&&command.baselineSessionId===baselineSessionId&&command.expectedReportVersion===reportVersion&&command.useAi===true&&command.modelId==='auto'&&
        Number.isInteger(command.minutesPerDay)&&command.minutesPerDay>=5&&command.minutesPerDay<=60&&typeof command.requestKey==='string'&&command.requestKey.length>=8&&command.requestKey.length<=180&&
        Object.keys(command).every(key=>['baselineSessionId','minutesPerDay','useAi','modelId','requestKey','expectedReportVersion'].includes(key));
      if(parsed.version===1&&parsed.ownerId===ownerId&&parsed.studentId===studentId&&parsed.baselineSessionId===baselineSessionId&&parsed.reportVersion===reportVersion&&valid(parsed.pending)&&valid(parsed.rejected??null))value={version:1,ownerId,studentId,baselineSessionId,reportVersion,pending:parsed.pending,rejected:parsed.rejected??null};
      else setStorageNotice('本机创建命令与当前账号或原评测不匹配，已保留并忽略恢复。');}}
    catch{setStorageNotice('本机创建缓存不可用，当前命令仍可下载副本。');}
    draft.current=value??{version:1,ownerId,studentId,baselineSessionId,reportVersion,pending:null,rejected:null};setPending(draft.current.pending);setRejected(draft.current.rejected);setReady(true);
    return()=>{epoch.current++;controller.current?.abort();};
  },[key,ownerId,studentId,baselineSessionId,reportVersion]);
  async function create(minutesPerDay:number,recover=false){
    if(!ready||!draft.current||sending.current)return;
    if(!recover&&(!Number.isInteger(minutesPerDay)||minutesPerDay<5||minutesPerDay>60)){setError('请选择5～60分钟的每日预算。');return;}
    if(draft.current.pending&&!recover){setError('原创建结果尚未确认，请先读取原计划创建结果。');return;}
    const revision=epoch.current,abort=new AbortController();controller.current=abort;sending.current=true;setBusy(true);setError('');
    try{
      const command=draft.current.pending??{baselineSessionId,expectedReportVersion:reportVersion,minutesPerDay,useAi:true as const,modelId:'auto' as const,requestKey:crypto.randomUUID()};
      write({...draft.current,pending:command});
      const found=await apiRequest<GuidancePlanView|null>('/diagnostics/students/'+studentId+'/plan-requests/'+encodeURIComponent(command.requestKey),{signal:abort.signal});
      if(revision!==epoch.current)return;
      const plan=found??await apiRequest<GuidancePlanView>('/diagnostics/students/'+studentId+'/plans',{method:'POST',body:JSON.stringify(command),signal:abort.signal});
      if(revision!==epoch.current)return;write({...draft.current!,pending:null});callback.current(plan);
    }catch(e){if(revision===epoch.current&&(e as Error).name!=='AbortError'){
      setError((e as Error).message+' 原创建命令已保留，请读取原计划创建结果。');
      const command=draft.current?.pending;
      if(command&&e instanceof ApiRequestError&&[400,409].includes(e.status))try{
        const found=await apiRequest<GuidancePlanView|null>('/diagnostics/students/'+studentId+'/plan-requests/'+encodeURIComponent(command.requestKey),{signal:abort.signal});
        if(revision!==epoch.current)return;
        if(found){write({...draft.current!,pending:null});callback.current(found);}
        else{write({...draft.current!,pending:null,rejected:command});setError('服务器已明确拒绝原创建，且当前没有原请求回执。原命令保留在副本中，请核对报告与预算后重新创建。');}
      }catch{/* A failed lookup keeps the complete original command pending. */}
    }}
    finally{if(revision===epoch.current){sending.current=false;setBusy(false);if(controller.current===abort)controller.current=null;}}
  }
  function download(){if(!draft.current)return;const url=URL.createObjectURL(new Blob([JSON.stringify(draft.current,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='指导计划原创建命令.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return {pending,rejected,ready,busy,error,storageNotice,create,download};
}
