'use client';
import * as React from 'react';
import type { ClassroomRetentionDisplayInput,ClassroomSessionView } from '@study-agent/contracts';
import { classroomStepUnits } from '@study-agent/contracts';
import { z } from 'zod';
import { apiRequest } from '../../../lib/api';
import { useSessionUser } from '../../../lib/session-user';
import { usePracticeLocalCopy } from '../../../lib/use-practice-local-copy';
import { PracticeCopyControls } from '../../../components/practice-copy-controls';
const input=z.object({protocol:z.literal('classroom-retention-display-v1'),contentFingerprint:z.string().regex(/^[a-f0-9]{64}$/),stepId:z.string().min(1),sentence:z.number().int().min(0),presentationVersion:z.enum(['legacy-v1','speech-v2']),unitId:z.string().min(1),requestKey:z.string().min(8)}).strict();
const copySchema=z.object({format:z.literal('classroom-teaching-time-copy-v1'),ownerId:z.string().min(1),sessionId:z.string().min(1),pending:input.nullable(),rejected:z.array(input).max(200),lastReceipt:z.unknown().nullable()}).strict();
type Copy=z.infer<typeof copySchema>;
export function ClassroomRetentionDisplay({session,onProtectionChange}:{session:ClassroomSessionView;onProtectionChange:(unsafe:boolean)=>void}){
 const user=useSessionUser();if(!user||user.role!=='student'||user.id!==session.ownerUserId||!session.retentionContext)return null;
 return <Display key={user.id+':'+session.id} session={session} ownerId={user.id} onProtectionChange={onProtectionChange}/>;
}
function Display({session,ownerId,onProtectionChange}:{session:ClassroomSessionView;ownerId:string;onProtectionChange:(unsafe:boolean)=>void}){
 const initial:Copy={format:'classroom-teaching-time-copy-v1',ownerId,sessionId:session.id,pending:null,rejected:[],lastReceipt:null};
 const local=usePracticeLocalCopy({identity:JSON.stringify([ownerId,'classroom-teaching-time',session.id]),initial,decode(value){const copy=copySchema.parse(value);if(copy.ownerId!==ownerId||copy.sessionId!==session.id)throw Error('完整副本不属于这份本人课堂。');return copy;},filename:'原课堂教学时间完整副本.json'});
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),running=React.useRef(false),latest=React.useRef(session);latest.current=session;
 React.useEffect(()=>{onProtectionChange(local.unsafe||busy);return()=>onProtectionChange(false);},[local.unsafe,busy,onProtectionChange]);
 async function confirm(){if(running.current||!local.current.current)return;const current=local.current.current,row=latest.current,step=row.lesson.steps[row.cursor],sentence=row.sentenceCursor??0,unit=step?classroomStepUnits(row,step)[sentence]:null;
  if(!current.pending&&(!step||!unit||row.revealed<=row.cursor)){setError('先在原课堂开始并显示教学内容，再确认这句的提供时间。');return;}
  const command:ClassroomRetentionDisplayInput=current.pending??{protocol:'classroom-retention-display-v1',contentFingerprint:row.contentFingerprint,stepId:step.id,sentence,presentationVersion:row.presentation?.version??'legacy-v1',unitId:unit!.id,requestKey:crypto.randomUUID()};
  if(!current.pending&&!local.update({...current,pending:command})){setError('请先下载完整教学时间副本，再核对并继续原命令。');return;}
  if(current.pending&&local.unsafe){setError('原教学时间命令尚未完整保留，请先下载副本，再继续。');return;}
  running.current=true;setBusy(true);setError('');
  try{const receipt=await apiRequest('/learning/classroom/sessions/'+encodeURIComponent(row.id)+'/retention-displays',{method:'POST',body:JSON.stringify(command)});local.update({...local.current.current!,pending:null,lastReceipt:receipt});setNotice('已保存这句原教学内容的实际提供时间；重复原命令保留原时间。');}
  catch(error){setError(error instanceof Error?error.message:'原教学时间回执尚未收到。');}finally{running.current=false;setBusy(false);}
 }
 return <details className="cl-retention-time" aria-label="本人课堂教学时间"><summary>教学时间与复测间隔</summary><p>开始或切换讲解时，会保留原句教学内容的提供时间。独立复测从最近教学或帮助后重新核对间隔。{session.retentionContext?.unmappedTarget?'这份课堂尚无可核对的知识点映射，保持资格仍待核查。':'时间回执表示内容已提供，不表示看懂或掌握。'}</p>
 <button type="button" className="studio-secondary" disabled={busy||!local.ready||!local.value?.pending&&session.revealed<=session.cursor} onClick={()=>void confirm()}>{local.value?.pending?'核对原教学时间回执':'确认本句教学已提供'}</button>
 {local.value?.pending&&<button type="button" className="studio-text-button" disabled={busy||local.unsafe||local.value.rejected.length>=200} onClick={()=>{const copy=local.current.current;if(copy?.pending){local.update({...copy,pending:null,rejected:[...copy.rejected,copy.pending]});setError('');setNotice('原命令已保留在完整副本中，可核对当前显示句后重新确认。');}}}>保留原命令，核对当前句</button>}
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error} 原命令仍完整保留，可先下载后从原课堂核对。</p>}
 <details><summary>保留原教学时间命令</summary><PracticeCopyControls local={local} busy={busy} noun="教学时间" renderCopy={copy=><pre>{JSON.stringify(copy,null,2)}</pre>}/></details></details>;
}
