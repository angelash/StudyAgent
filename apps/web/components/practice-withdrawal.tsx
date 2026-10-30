'use client';
import * as React from 'react';
import { assistantPracticeAssignmentWithdrawSchema, type AssistantPracticeAssignmentWithdrawInput, type AssistantPracticeAssignmentWithdrawalReceipt } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../lib/api';
import { refreshSessionUser, type SessionUser } from '../lib/session-user';
import { usePracticeLocalCopy } from '../lib/use-practice-local-copy';
import { useWorkspaceExitGuard } from '../lib/use-workspace-exit-guard';
import { withdrawalCopySchema, type PracticeAssignment, type PracticeWithdrawal, type WithdrawalCopy } from '../lib/assistant-practice-workspace';
import { WorkspaceDialog } from '../app/studio/workspace-dialog';
import { PracticeCopyControls } from './practice-copy-controls';

export function PracticeWithdrawalNotice({withdrawal}:{withdrawal:PracticeWithdrawal|null|undefined}) {
  return withdrawal ? <section className="cp-notice" aria-label="原安排撤回说明"><h2>这份教学安排已撤回</h2><p>{withdrawal.reason}</p><p>{new Date(withdrawal.withdrawnAt).toLocaleString('zh-CN')}</p><p>已经发生的答案、理由、帮助与媒体保留。未提交的本人输入仍可下载；原活动保持只读。</p></section> : null;
}
export function PracticeWithdrawalPanel({user,assignment,onRead}:{user:SessionUser;assignment:PracticeAssignment;onRead:(value:PracticeAssignment)=>void}) {
  const initial:WithdrawalCopy={format:'assistant-practice-workspace-copy-v1',phase:'withdraw',ownerId:user.id,studentId:assignment.studentId,subject:assignment.subject,assignmentId:assignment.id,payloadFingerprint:assignment.payloadFingerprint,reason:'',pending:null,receipt:null};
  const decode=(value:unknown)=>{
    const copy=withdrawalCopySchema.parse(value);
    for(const key of ['ownerId','studentId','subject','assignmentId','payloadFingerprint'] as const)if(copy[key]!==initial[key])throw Error('这份撤回副本不属于当前账号或原教学安排。');
    return copy;
  };
  const local=usePracticeLocalCopy({identity:JSON.stringify([user.id,'withdraw',assignment.id]),initial,decode}),value=local.value;
  const [open,setOpen]=React.useState(false),[confirm,setConfirm]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  const request=React.useRef<AbortController|null>(null),running=React.useRef(false);
  React.useEffect(()=>()=>request.current?.abort(),[]);
  function close(){if(busy)return;local.request(()=>{setOpen(false);setConfirm(false);});}
  useWorkspaceExitGuard(user.id,open||busy||!!value?.pending||local.unsafe,{request:(_href,proceed)=>{
    if(busy){local.setNotice('原撤回操作正在核对，请稍后再离开。');return;}
    local.request(()=>{setOpen(false);setConfirm(false);proceed();});
  },isInternal:(next,current)=>{const a=new URL(next,current),b=new URL(current);return a.origin===b.origin&&a.pathname===b.pathname&&a.search===b.search;}});
  async function read(signal:AbortSignal){
    const current=await apiRequest<PracticeAssignment>('/learning/assistant-practice/assignments/'+encodeURIComponent(assignment.id),{signal});
    if(signal.aborted)return;
    if(current.id!==assignment.id||current.studentId!==assignment.studentId||current.subject!==assignment.subject||current.payloadFingerprint!==assignment.payloadFingerprint)throw Error('原安排当前投影与完整副本身份不一致。');
    onRead(current);return current;
  }
  async function execute(command:AssistantPracticeAssignmentWithdrawInput,protectedNow=false){
    if(running.current||local.unsafe&&!protectedNow)return;
    running.current=true;setBusy(true);setError('');const operation=new AbortController();request.current=operation;
    try{
      const receipt=await apiRequest<AssistantPracticeAssignmentWithdrawalReceipt>('/learning/assistant-practice/assignments/'+encodeURIComponent(assignment.id)+'/withdraw',{method:'POST',body:JSON.stringify(command),signal:operation.signal});
      if(operation.signal.aborted)return;
      if(!receipt.withdrawalId||receipt.assignmentId!==assignment.id||receipt.stateVersion!==1||receipt.payloadFingerprint!==command.assignmentFingerprint||!Number.isFinite(Date.parse(receipt.withdrawnAt)))throw Error('原撤回回执与教学安排不一致。');
      local.update({...local.current.current!,pending:null,receipt});local.setNotice('原撤回已确认。已经发生的教学历史保持。');setConfirm(false);
      await read(operation.signal);
    }catch(reason){
      if(!operation.signal.aborted){
        setError((reason as Error).message);
        if(reason instanceof ApiRequestError&&reason.status===409)try{await read(operation.signal);}catch{/* Keep the original input and command. */}
        if(reason instanceof ApiRequestError&&[401,403].includes(reason.status))void refreshSessionUser();
      }
    }finally{running.current=false;if(!operation.signal.aborted)setBusy(false);}
  }
  function prepare(){
    if(!value||value.pending||assignment.withdrawal||busy)return;
    const parsed=assistantPracticeAssignmentWithdrawSchema.safeParse({expectedStateVersion:0,assignmentFingerprint:assignment.payloadFingerprint,reason:value.reason,requestKey:crypto.randomUUID()});
    if(!parsed.success){setError('请完整填写5至500字的撤回说明。');return;}
    const protectedNow=local.update({...value,pending:parsed.data});
    if(protectedNow)void execute(parsed.data,true);
  }
  const copyControls=<PracticeCopyControls local={local} busy={busy} renderCopy={copy=><><p>撤回说明：{copy.reason||'尚未填写'}</p><p>{copy.pending?'包含待核对的原撤回操作':copy.receipt?'包含先前回执，可读回原安排核对':'尚未发送撤回'}</p></>}/>;
  return <section className="cp-withdrawal-controls">
    <div className="cp-actions">{!assignment.withdrawal&&<button className="workspace-button" disabled={!local.ready||busy} onClick={()=>{setOpen(true);setConfirm(false);}}>撤回这份安排</button>}
      {(value?.pending||value?.receipt)&&<button className="workspace-button" disabled={busy} onClick={()=>setOpen(true)}>核对原撤回操作</button>}</div>
    {!open&&(value?.pending||value?.receipt||local.waiting)&&<section className="cp-panel"><h2>{value?.pending?'原撤回结果尚待确认':'原撤回已确认'}</h2>{copyControls}{value?.pending&&<button className="workspace-button" disabled={busy||local.unsafe} onClick={()=>void execute(value.pending!)}>用原操作核对撤回结果</button>}{error&&<p className="cp-error" role="alert">{error}</p>}</section>}
    {open&&<WorkspaceDialog busy={busy} onClose={close}><div className="cp-exit-overlay"><section className="cp-panel cp-withdrawal-dialog" role="dialog" aria-modal="true" aria-label="撤回教学安排">
      <header className="cp-actions"><h2>明确撤回这份安排</h2><button className="workspace-button" disabled={busy} onClick={close}>关闭</button></header>
      <p>说明会提供给孩子及合法监护人。撤回后不能开始新组，已开始活动停止新写入；原答案、理由、帮助、完成记录及原件继续保留。</p>
      <label className="cp-explanation">撤回说明<textarea aria-label="撤回教学安排说明" maxLength={500} rows={5} value={value?.reason??''} disabled={busy||!!value?.pending||!!assignment.withdrawal} onChange={event=>{if(value)local.update({...value,reason:event.target.value,receipt:null});setConfirm(false);}}/></label>
      {copyControls}{error&&<p className="cp-error" role="alert">{error}</p>}
      {assignment.withdrawal&&<PracticeWithdrawalNotice withdrawal={assignment.withdrawal}/>}
      {value?.pending?<aside className="cp-notice"><h3>核对原撤回结果</h3><p>沿用原完整说明和版本，不重新创建操作。</p><button className="workspace-button" disabled={busy||local.unsafe} onClick={()=>void execute(value.pending!)}>用原操作核对撤回结果</button></aside>:!assignment.withdrawal&&<>
        {confirm&&<p className="cp-readonly">请确认：这是撤回整份安排，包含全部原知识点。没有把未完成组记为完成或失败。</p>}
        <div className="cp-actions"><button className="workspace-button" disabled={busy} onClick={close}>保留安排，返回</button>
          <button className="workspace-button" disabled={busy||!value||value.reason.trim().length<5} onClick={()=>{if(confirm)prepare();else setConfirm(true);}}>{confirm?'确认撤回，保留历史':'核对撤回影响'}</button></div>
      </>}
    </section></div></WorkspaceDialog>}
  </section>;
}
