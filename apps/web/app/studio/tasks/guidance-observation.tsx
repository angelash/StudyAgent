'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiRequest,ApiRequestError } from '../../../lib/api';
import { refreshSessionUser,type SessionUser } from '../../../lib/session-user';
import { readGuidanceIntentLocation,type GuidanceIntentView } from '../../../lib/guidance-intent-workspace';
import { AssistantGuidancePanel } from '../../../components/assistant-guidance';
import { StudioNavigation } from '../studio-navigation';

export function GuidanceObservationWorkspace({user}:{user:SessionUser}){
 const search=useSearchParams(),[row,setRow]=React.useState<GuidanceIntentView|null>(null),[error,setError]=React.useState(''),[retry,setRetry]=React.useState(0),query=search.toString();
 React.useEffect(()=>{const abort=new AbortController();setRow(null);setError('');void(async()=>{try{const location=readGuidanceIntentLocation('?'+query,user.role==='student'?user.studentId:undefined),value=await apiRequest<GuidanceIntentView>('/learning/assistant-guidance/intents/'+encodeURIComponent(location.intentId),{signal:abort.signal});if(abort.signal.aborted)return;if(value.id!==location.intentId||location.adult!==(value.audience.kind==='adult')||value.audience.kind==='student'&&(value.audience.studentId!==location.studentId||value.audience.subject!==location.subject))throw Error('原观察与链接中的学习对象或学科不一致。');setRow(value);}catch(reason){if(!abort.signal.aborted){setError((reason as Error).message);if(reason instanceof ApiRequestError&&[401,403].includes(reason.status))void refreshSessionUser();}}})();return()=>abort.abort();},[query,user.id,user.role,user.studentId,retry]);
 const context=row?.audience.kind==='student'?{studentId:row.audience.studentId,subject:row.audience.subject}:row?{audience:'self' as const,subject:'math' as const}:undefined;
 return <main className="learning-studio"><StudioNavigation active="tasks" context={context}/>{error?<section className="workspace-page"><h1>原观察与指导</h1><p role="alert">{error}</p><button className="workspace-button" onClick={()=>setRetry(value=>value+1)}>重新核对原观察</button><Link className="workspace-button" href="/studio">回到学习工作台</Link></section>:!row?<section className="workspace-page"><h1>原观察与指导</h1><p role="status">正在核对原作者、观察与学习范围…</p></section>:<AssistantGuidancePanel key={user.id+':'+row.id} ownerId={user.id} sessionId={row.sourceSessionId} studentId={row.audience.kind==='student'?row.audience.studentId:null} subject={row.audience.kind==='student'?row.audience.subject:null} initialIds={[]} messages={[]} hasOlder={false} loadOlder={async()=>{}} searchMessages={async()=>{}} resetMessages={async()=>{}} onClose={()=>{}} initialIntent={row} embedded onLocate={id=>{const href=row.origin.location.href;if(href&&href.startsWith('/')&&!href.startsWith('//'))window.location.assign(href+'#assistant-message-'+encodeURIComponent(id));}}/>}</main>;
}
