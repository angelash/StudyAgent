'use client';
import * as React from 'react';
import { WorkspaceDialog } from '../app/studio/workspace-dialog';
import { StudioNavigation } from '../app/studio/studio-navigation';
import { useWorkspaceExitGuard } from '../lib/use-workspace-exit-guard';
import type { Subject } from '@study-agent/contracts';
import type { usePracticeLocalCopy } from '../lib/use-practice-local-copy';
import { sameWorkspaceActivity } from '../lib/workspace-exit-guard';

type Local<T>=ReturnType<typeof usePracticeLocalCopy<T>>;
export function PracticeNavigation({ownerId,studentId,subject,focus=false,busy=false,local}:{ownerId:string;studentId:string;subject:Subject;focus?:boolean;busy?:boolean;local:Local<any>}){
 const leave=(_href:string,proceed:()=>void)=>{if(busy){local.setNotice('原操作正在核对，请稍后再离开。');return;}local.request(proceed);};
 useWorkspaceExitGuard(ownerId,true,{request:leave,isInternal:(next,current)=>{if(!sameWorkspaceActivity(next,current))return false;try{const a=new URL(next,current),b=new URL(current);return !b.searchParams.has('assistantPractice')||a.searchParams.get('question')===b.searchParams.get('question');}catch{return false;}}});
 return <StudioNavigation active="tasks" context={{studentId,subject}} layout={focus?'focus':'default'} activityKey={'assistant-practice:'+local.identity} onRequestNavigate={leave}/>;
}
export function PracticeCopyControls<T>({local,renderCopy,busy=false}:{local:Local<T>;renderCopy:(value:T)=>React.ReactNode;busy?:boolean}){
 return <><section className="cp-recovery" aria-label="对话练习完整副本"><button className="workspace-button" disabled={!local.ready} onClick={local.download}>下载完整练习副本</button><button className="workspace-button" onClick={local.inspect}>查看其他本机副本</button><label>从完整练习副本恢复<input type="file" accept="application/json,.json" onChange={event=>{void local.restore(event.target.files?.[0]);event.target.value='';}}/></label></section>
 {local.notice&&<p role="status" className="cp-notice">{local.notice}</p>}
 {local.alternatives.map((copy,index)=><button className="workspace-button" key={index} disabled={busy} onClick={()=>local.setComparison(copy)}>比较本机练习副本 {index+1}</button>)}
 {local.comparison!==null&&<section className="cp-panel" aria-label="对话练习副本比较"><h2>核对两份完整输入</h2><h3>当前输入</h3>{local.value!==null&&renderCopy(local.value)}<h3>准备采用的输入</h3>{renderCopy(local.comparison)}<div className="cp-actions"><button className="workspace-button" disabled={busy||local.unsafe} onClick={local.adopt}>保留当前副本，采用此输入</button><button className="workspace-button" onClick={()=>local.setComparison(null)}>继续当前输入</button></div></section>}
 {local.waiting&&<WorkspaceDialog onClose={()=>local.setWaiting(null)}><div className="cp-exit-overlay"><section role="dialog" aria-modal="true" aria-label="保留对话练习完整输入" className="cp-panel"><h2>先保留完整输入</h2><p>副本包含当前选择或答案、理由与尚待确认的原操作。保存后继续切换。</p><div className="cp-actions"><button className="workspace-button" onClick={()=>local.setWaiting(null)}>继续编辑</button><button className="workspace-button" onClick={local.download}>下载完整练习副本</button><button className="workspace-button" disabled={busy||local.unsafe} onClick={()=>{const next=local.waiting;local.setWaiting(null);next?.proceed();}}>已保留副本，继续</button></div></section></div></WorkspaceDialog>}
 </>;
}
