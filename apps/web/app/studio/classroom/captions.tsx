'use client';
import * as React from 'react';
import type { ClassroomSessionView } from '@study-agent/contracts';
import { apiRequest } from '../../../lib/api';
import './captions.css';

export function useCaptionUpgrade(options:{
  session:ClassroomSessionView;visible:boolean;getSession:()=>ClassroomSessionView;
  beforeChange:()=>Promise<unknown>;onSession:(value:ClassroomSessionView)=>unknown;
  onNotice:(text:string)=>void;onClose:()=>void;
}){
  const [busy,setBusy]=React.useState(false),[confirm,setConfirm]=React.useState(false),[error,setError]=React.useState('');
  const command=React.useRef<{expectedRevision:number;expectedVersion:'legacy-v1';requestKey:string}|null>(null);
  const pending=React.useRef<AbortController|null>(null),alive=React.useRef(true);
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;pending.current?.abort();};},[]);
  React.useEffect(()=>{if(!options.visible&&pending.current){pending.current.abort();setError('操作已停止，可读取已保存状态核对字幕版本。');}},[options.visible]);
  async function execute(readOnly:boolean){
    if(pending.current)return;
    const operation=new AbortController();pending.current=operation;setBusy(true);setError('');
    try{
      await options.beforeChange();if(operation.signal.aborted)return;
      const session=options.getSession();
      if(!readOnly&&!command.current)command.current={expectedRevision:session.revision,expectedVersion:'legacy-v1',requestKey:crypto.randomUUID()};
      const value=await apiRequest<ClassroomSessionView>('/learning/classroom/sessions/'+session.id+(readOnly?'':'/presentation'),
        {signal:operation.signal,...(readOnly?{}:{method:'POST',body:JSON.stringify(command.current)})});
      if(operation.signal.aborted||!alive.current)return;
      options.onSession(value);command.current=null;setConfirm(false);
      options.onNotice((readOnly?'已读取保存的字幕':'已更新字幕节奏')+'，停在当前环节第'+((value.sentenceCursor??0)+1)+'句。点击继续讲解，从这句开头开始。');
      if(!readOnly)options.onClose();
    }catch(error){if(!operation.signal.aborted&&alive.current)setError((error as Error).message);}
    finally{if(pending.current===operation){pending.current=null;if(alive.current)setBusy(false);}}
  }
  return{busy,confirm,setConfirm,error,version:options.session.presentation?.version??'legacy-v1',upgrade:()=>execute(false),refresh:()=>execute(true)};
}
export function CaptionUpgradeControl({state}:{state:ReturnType<typeof useCaptionUpgrade>}){
  return <section className="cl-caption-settings" aria-label="字幕节奏">
    <div><b>字幕与讲解</b><span>{state.version==='speech-v2'?'当前逐句节奏':'保留的旧版节奏'}</span></div>
    {state.version==='legacy-v1'&&!state.confirm&&<><p>这节课堂保留了原来的字幕断点。可更新为中英文逐句讲解，继续使用原讲稿和学习记录。</p><button disabled={state.busy} onClick={()=>state.setConfirm(true)}>更新字幕节奏</button></>}
    {state.version==='legacy-v1'&&state.confirm&&<div className="cl-caption-confirm"><p>会从当前已保存句的起点重新分句，更新后保持暂停。讲稿、答案、提示和已读记录都会保留。</p><div><button disabled={state.busy} onClick={()=>void state.upgrade()}>{state.busy?'正在更新字幕…':'确认更新字幕'}</button><button disabled={state.busy} onClick={()=>state.setConfirm(false)}>保留原字幕</button></div></div>}
    {state.error&&<div className="cl-caption-error" role="alert"><p>{state.error}</p><button disabled={state.busy} onClick={()=>void state.refresh()}>读取已保存的字幕状态</button></div>}
    {state.busy&&<p role="status">正在核对保存的字幕位置，关闭设置可停止等待。</p>}
  </section>;
}
