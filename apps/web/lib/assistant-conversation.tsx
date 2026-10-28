'use client';
import * as React from 'react';
import type { AssistantContextView, AssistantHistoryMessage, AssistantHistoryPage, AssistantLocation, AssistantTurnCommand, AssistantTurnList, AssistantTurnView } from '@study-agent/contracts';
import { apiRequest,ApiRequestError } from './api';

type Draft={version:1;ownerId:string;scope:string;sessionId:string;input:string;pending:AssistantTurnCommand|null;lastTurnId:string|null};
const active=(turn:AssistantTurnView|null)=>!!turn&&['queued','running','validating','cancelling'].includes(turn.status);
const order=(a:AssistantHistoryMessage,b:AssistantHistoryMessage)=>a.createdAt===b.createdAt?(a.sequence!==undefined&&b.sequence!==undefined?a.sequence-b.sequence:a.id===b.id?0:a.id>b.id?1:-1):a.createdAt>b.createdAt?1:-1;
function decode(raw:string,ownerId:string,scope:string):Draft|null {
  if(raw.length>20000)return null;const v=JSON.parse(raw) as Draft;
  if(v.version!==1||v.ownerId!==ownerId||v.scope!==scope||typeof v.sessionId!=='string'||v.sessionId.length>180||typeof v.input!=='string'||v.input.length>3000||!(v.lastTurnId===null||typeof v.lastTurnId==='string'&&v.lastTurnId.length<=180))return null;
  if(v.pending!==null&&(!v.pending||typeof v.pending!=='object'))return null;
  if(v.pending){const p=v.pending;if(typeof p.requestKey!=='string'||p.requestKey.length<8||p.requestKey.length>180||typeof p.message!=='string'||!p.message.trim()||p.message.length>3000||typeof p.modelId!=='string'||!p.modelId||p.modelId.length>180||!/^[a-f0-9]{64}$/.test(p.contextVersion))return null;}
  return v;
}
export function useAssistantConversation({open,ownerId,scope,context,readOnly=false,frozenLectureSessionId}:{open:boolean;ownerId:string|null;scope:string;context:string;readOnly?:boolean;frozenLectureSessionId?:string}){
  const [input,setInputState]=React.useState(''),[messages,setMessages]=React.useState<AssistantHistoryMessage[]>([]),[turn,setTurn]=React.useState<AssistantTurnView|null>(null);
  const [turns,setTurns]=React.useState<AssistantTurnList|null>(null),[pending,setPending]=React.useState<AssistantTurnCommand|null>(null);
  const [sessionId,setSessionId]=React.useState(''),[viewSessionId,setViewSessionId]=React.useState(''),[historical,setHistorical]=React.useState<string|null>(null);
  const [historyTarget,setHistoryTarget]=React.useState<string|null>(null),[mismatch,setMismatch]=React.useState(false);
  const [messageAnchor,setMessageAnchor]=React.useState<string|null>(null),activeQuery=React.useRef('');
  const [selectionRevision,setSelectionRevision]=React.useState(0);
  const mismatchRef=React.useRef(false);
  const [ownerScope,setOwnerScope]=React.useState(''),[loading,setLoading]=React.useState(false),[busy,setBusy]=React.useState(false),[suspended,setSuspended]=React.useState(false);
  const [error,setError]=React.useState(''),[storageNotice,setStorageNotice]=React.useState(''),[notice,setNotice]=React.useState('');
  const [cursor,setCursor]=React.useState<string|null>(null),[location,setLocation]=React.useState<AssistantLocation|null>(null);
  const epoch=React.useRef(0),controllers=React.useRef(new Set<AbortController>()),memory=React.useRef(new Map<string,Draft>()),draft=React.useRef<Draft|null>(null),draftKey=React.useRef('');
  const lastScope=React.useRef('');
  const sourceFocus=React.useRef('');
  const key=ownerId?'studyagent.assistant.v1.'+encodeURIComponent(ownerId)+'.'+encodeURIComponent(scope):'';
  const matches=ownerScope===key&&!!ownerId;
  React.useEffect(()=>{
    const hash=window.location.hash, prefix='#assistant-message-';if(!matches||loading||!hash.startsWith(prefix))return;
    let id:string;try{id=decodeURIComponent(hash.slice(prefix.length));}catch{return;}
    const focusKey=JSON.stringify([key,viewSessionId,hash]);if(sourceFocus.current===focusKey||!messages.some(m=>m.id===id))return;
    const target=document.getElementById('assistant-message-'+id);if(target){sourceFocus.current=focusKey;target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:'instant'});}
  },[matches,loading,messages.length,viewSessionId]);
  const write=React.useCallback((patch:Partial<Draft>)=>{
    const value=draft.current;if(!value)return;const next={...value,...patch};draft.current=next;memory.current.set(draftKey.current,next);
    try{localStorage.setItem(draftKey.current,JSON.stringify(next));}catch{setStorageNotice('本机未能暂存提问。当前文字仍在，可下载副本；刷新后会读取服务端已保存的任务。');}
  },[]);
  function controller(){const c=new AbortController();controllers.current.add(c);return c;}
  async function call<T>(path:string,options:RequestInit={}){const c=controller();try{return await apiRequest<T>(path,{...options,signal:c.signal});}finally{controllers.current.delete(c);}}
  function stopRequests(){for(const c of controllers.current)c.abort();controllers.current.clear();}
  function accept(next:AssistantTurnView,save=true,select=true){
    if(select)setTurn(old=>old?.id===next.id&&old.revision===next.revision&&old.task?.version===next.task?.version&&old.status===next.status?old:next);
    setTurns(old=>old?{...old,turns:[next,...old.turns.filter(t=>t.id!==next.id)]}:null);
    if(select&&save&&!historical&&!readOnly&&!mismatchRef.current&&(!draft.current?.pending||draft.current.pending.requestKey===next.requestKey)){const clear=draft.current?.pending?.requestKey===next.requestKey&&draft.current.input.trim()===next.message;
      if(draft.current?.lastTurnId!==next.id||draft.current?.pending)write({lastTurnId:next.id,pending:null,...(clear?{input:''}:{})});if(clear)setInputState('');setPending(null);}
  }
  async function page(id:string,before:string|null=null,query='',replace=false){
    const revision=epoch.current,value=await call<AssistantHistoryPage>('/ai/assistant/sessions/'+id+'/messages/page?pageSize=25'+(before?'&cursor='+encodeURIComponent(before):'')+(query?'&query='+encodeURIComponent(query):''));
    if(revision!==epoch.current)return;setMessages(old=>replace?value.messages.sort(order):[...new Map([...old,...value.messages].map(m=>[m.id,m])).values()].sort(order));
    if(before||replace)setCursor(value.nextCursor);setLocation(value.location);
  }
  async function refresh(id=viewSessionId,replace=false){
    if(!id)return;const revision=epoch.current;
    const [p,list]=await Promise.all([call<AssistantHistoryPage>('/ai/assistant/sessions/'+id+'/messages/page?pageSize=25'),call<AssistantTurnList>('/ai/assistant/sessions/'+id+'/turns?pageSize=25')]);
    if(revision!==epoch.current)return;setMessages(old=>replace?p.messages.sort(order):[...new Map([...old,...p.messages].map(m=>[m.id,m])).values()].sort(order));if(replace)setCursor(p.nextCursor);setLocation(p.location);setTurns(list);
    return list;
  }
  React.useEffect(()=>{
    const revision=++epoch.current;stopRequests();setError('');setNotice('');setBusy(false);setSuspended(false);setSessionId('');
    if(!open||!ownerId){setLoading(false);return;}
    if(lastScope.current!==key){lastScope.current=key;if(historical){setHistorical(null);setHistoryTarget(null);setMessageAnchor(null);setLoading(true);return;}}
    setLoading(true);setMessages([]);setTurn(null);setTurns(null);setCursor(null);setLocation(null);setViewSessionId('');setStorageNotice('');setMismatch(false);mismatchRef.current=false;
    let restored=memory.current.get(key)??null;
    if(!restored)try{const raw=localStorage.getItem(key);if(raw){restored=decode(raw,ownerId,scope);if(!restored)setStorageNotice('本机缓存与当前账号或学习位置不匹配，已保留缓存并忽略恢复。');}}catch{setStorageNotice('本机缓存不可用，当前提问仍可编辑和下载副本。');}
    draftKey.current=key;draft.current=restored??{version:1,ownerId,scope,sessionId:'',input:'',pending:null,lastTurnId:null};
    setOwnerScope(key);setInputState(draft.current.input);setPending(draft.current.pending);
    (async()=>{try{
      let s:{id:string};
      if(readOnly){
        if(historical)s={id:''}; // The selected owner's history is authorized by its read endpoints, independently of an unavailable base lecture.
        else {
        if(!frozenLectureSessionId)throw Error('原讲座版本无法读取。本机草稿仍保留，可下载后打开当前版本。');
        const command=JSON.parse(context),retained=await call<AssistantContextView>('/ai/assistant/sessions/'+frozenLectureSessionId+'/context');
        const location=retained.location;
        const lecture=command.pageContext==='classroom'&&command.contextRefType==='classroom_lecture',course=command.pageContext==='course'&&['primary_unit','material_lesson'].includes(command.contextRefType);
        if((!lecture&&!course)||location.pageContext!==command.pageContext||location.contextRefType!==command.contextRefType||
          location.contextRefId!==command.contextRefId||location.contextItemId!==command.contextItemId||location.studentId!==(command.studentId??null)||location.subject!==(command.subject??null))
          throw Error('原会话与当前学习位置不匹配，已保留本机草稿。');
        s={id:frozenLectureSessionId};
        }
      }else s=await call<{id:string}>('/ai/assistant/sessions',{method:'POST',body:context});
      if(epoch.current!==revision)return;
      setSessionId(s.id);if(!readOnly){if(draft.current!.sessionId&&draft.current!.sessionId!==s.id){setError('本机提问对应另一份学习上下文，原问题与命令仍保留，可下载后转为新提问。');setMismatch(true);mismatchRef.current=true;}else write({sessionId:s.id});}
      const id=historical??s.id;setViewSessionId(id);
      activeQuery.current='';
      let sourceAnchor:string|null=null;try{if(window.location.hash.startsWith('#assistant-message-')){const value=decodeURIComponent(window.location.hash.slice('#assistant-message-'.length));if(value&&value.length<=180)sourceAnchor=value;}}catch{/* Ignore an incomplete fragment, retaining the original draft. */}
      const readAnchor=historical?messageAnchor:sourceAnchor;
      const [p,list]=await Promise.all([call<AssistantHistoryPage>('/ai/assistant/sessions/'+id+'/messages/page?pageSize=25'+(readAnchor?'&anchor='+encodeURIComponent(readAnchor):'')),call<AssistantTurnList>('/ai/assistant/sessions/'+id+'/turns?pageSize=25')]);
      if(epoch.current!==revision)return;setMessages(p.messages.sort(order));setCursor(p.nextCursor);setLocation(p.location);setTurns(list);if(!historical)setMessageAnchor(sourceAnchor);
      // Message and task reads can straddle publication. A completed task is terminal, so polling cannot repair a stale message page.
      async function recoverPublished(next:AssistantTurnView){if(next.status==='completed'&&next.assistantMessageId&&!p.messages.some(message=>message.id===next.assistantMessageId)&&!readAnchor)await page(id,null,'',true);}
      const local=draft.current!,pendingCommand=!historical&&!readOnly&&!mismatchRef.current?local.pending:null;
      if(pendingCommand){const probe=await call<AssistantTurnList>('/ai/assistant/sessions/'+s.id+'/turns?requestKey='+encodeURIComponent(pendingCommand.requestKey));if(epoch.current!==revision)return;
        const found=probe.turns[0];if(found){accept(found);await recoverPublished(found);}else setNotice('原发送结果尚未确认；核对会继续使用同一个请求。');
      }else{const target=historical?historyTarget:readOnly&&local.pending?list.turns.find(turn=>turn.requestKey===local.pending!.requestKey)?.id:!mismatchRef.current?local.lastTurnId:null;
        let latest=list.turns.find(t=>t.id===target);
        if(!latest&&target)try{latest=await call<AssistantTurnView>('/ai/assistant/sessions/'+id+'/turns/'+target);}catch(e){if(!(e instanceof ApiRequestError&&e.status===404))throw e;}
        if(epoch.current!==revision)return;latest??=list.turns.find(active)??list.turns[0];if(latest){accept(latest,!historical);await recoverPublished(latest);}}
    }catch(e){if(epoch.current===revision&&(e as Error).name!=='AbortError')setError((e as Error).message);}finally{if(epoch.current===revision)setLoading(false);}})();
    return()=>{epoch.current++;stopRequests();};
  },[open,ownerId,scope,historical,historyTarget,selectionRevision,readOnly,frozenLectureSessionId]); // Clearing a search highlight does not reopen or resend a conversation.
  const pollingTurn=active(turn)?turn:turns?.turns.find(active)??null;
  React.useEffect(()=>{
    if(!open||!matches||suspended||!pollingTurn||!viewSessionId)return;
    let alive=true,timer:ReturnType<typeof setTimeout>|undefined;
    const revision=epoch.current,id=pollingTurn.id;
    async function poll(){try{const next=await call<AssistantTurnView>('/ai/assistant/sessions/'+viewSessionId+'/turns/'+id);
      if(!alive||revision!==epoch.current)return;accept(next,!historical,id===turn?.id);if(next.status==='completed'){if(activeQuery.current)await page(viewSessionId,null,activeQuery.current,true);else await refresh();}
      if(active(next))timer=setTimeout(()=>void poll(),1500);
    }catch(e){if(alive&&revision===epoch.current&&(e as Error).name!=='AbortError'){setError((e as Error).message);setSuspended(true);}}}
    timer=setTimeout(()=>void poll(),750);return()=>{alive=false;if(timer)clearTimeout(timer);};
  },[open,matches,suspended,pollingTurn?.id,pollingTurn?.status,turn?.id,viewSessionId,historical,readOnly]);
  function change(value:string){setInputState(value);write({input:value});}
  async function submit(modelId:string,recover=false){
    if(!sessionId||busy||historical||mismatch||readOnly)return;setBusy(true);setError('');setNotice('');setSuspended(false);const revision=epoch.current;
    try{
      let command=recover?draft.current?.pending:null;
      if(!command){if(!input.trim())return;const current=await call<AssistantContextView>('/ai/assistant/sessions/'+sessionId+'/context');if(revision!==epoch.current)return;
        command={requestKey:crypto.randomUUID(),message:input.trim(),modelId,contextVersion:current.contextVersion};write({pending:command});setPending(command);}
      const result=await call<AssistantTurnView>('/ai/assistant/sessions/'+sessionId+'/turns',{method:'POST',body:JSON.stringify(command)});if(revision!==epoch.current)return;
      accept(result);if(result.status==='completed')await refresh();
    }catch(e){if(revision===epoch.current&&(e as Error).name!=='AbortError'){
      setError((e as Error).message);
      if(e instanceof ApiRequestError&&[400,409,429,503].includes(e.status)&&draft.current?.pending){
        try{const command=draft.current.pending,list=await call<AssistantTurnList>('/ai/assistant/sessions/'+sessionId+'/turns?requestKey='+encodeURIComponent(command.requestKey));if(revision!==epoch.current)return;
          if(list.turns[0]){accept(list.turns[0]);if(list.turns[0].status==='completed')await refresh();setNotice('已读取服务器保存的原提问；本机文字保留供核对。');}
          else{write({pending:null});setPending(null);setNotice('当前未找到原请求回执，文字已保留；请核对当前上下文后再发送。');}
        }catch{/* Keep the original unacknowledged command on a failed read. */}
      }
    }}finally{if(revision===epoch.current)setBusy(false);}
  }
  async function control(action:'cancel'|'retry'){
    if(!turn||busy||readOnly&&action==='retry')return;const revision=epoch.current,id=turn.id;setBusy(true);setError('');setNotice('');
    try{const latest=await call<AssistantTurnView>('/ai/assistant/sessions/'+viewSessionId+'/turns/'+id);if(revision!==epoch.current)return;
      const next=latest.status==='completed'?latest:await call<AssistantTurnView>('/ai/assistant/sessions/'+viewSessionId+'/turns/'+id+'/'+action,{method:'POST',body:JSON.stringify({generation:latest.task!.generation,version:latest.task!.version})});
      if(revision!==epoch.current)return;accept(next,!historical);setSuspended(false);if(next.status==='completed')await refresh();
    }catch(e){if(revision===epoch.current){setError((e as Error).message);try{const latest=await call<AssistantTurnView>('/ai/assistant/sessions/'+viewSessionId+'/turns/'+id);if(revision===epoch.current)accept(latest,!historical);}catch{}}}
    finally{if(revision===epoch.current)setBusy(false);}
  }
  function stopWaiting(){stopRequests();setSuspended(true);setBusy(false);setNotice('已停止本次等待，服务端任务可能仍在处理；可读取最新状态或明确取消。');}
  async function resume(){const revision=epoch.current;setError('');setSuspended(false);try{const list=await refresh();if(list&&revision===epoch.current){let current=list.turns.find(t=>t.id===turn?.id);if(!current&&turn)current=await call<AssistantTurnView>('/ai/assistant/sessions/'+viewSessionId+'/turns/'+turn.id);if(revision!==epoch.current)return;current??=list.turns.find(active)??list.turns[0];if(current)accept(current,!historical);}}catch(e){if(revision===epoch.current)setError((e as Error).message);}}
  async function older(){if(!viewSessionId||!cursor)return;const revision=epoch.current;setBusy(true);try{await page(viewSessionId,cursor,activeQuery.current);}catch(e){if(revision===epoch.current)setError((e as Error).message);}finally{if(revision===epoch.current)setBusy(false);}}
  async function searchMessages(query:string){const revision=epoch.current;setBusy(true);setError('');try{activeQuery.current=query;await page(viewSessionId,null,query,true);}catch(e){if(revision===epoch.current)setError((e as Error).message);}finally{if(revision===epoch.current)setBusy(false);}}
  async function resetMessages(){const revision=epoch.current;activeQuery.current='';setMessageAnchor(null);setError('');if(window.location.hash.startsWith('#assistant-message-'))window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);try{await refresh(viewSessionId,true);}catch(e){if(revision===epoch.current)setError((e as Error).message);}}
  async function moreTurns(){if(!turns?.hasMore||busy)return;const revision=epoch.current;setBusy(true);try{const next=await call<AssistantTurnList>('/ai/assistant/sessions/'+viewSessionId+'/turns?page='+String(turns.page+1));if(revision===epoch.current)setTurns(old=>old?{...next,turns:[...new Map([...old.turns,...next.turns].map(t=>[t.id,t])).values()]}:next);}catch(e){if(revision===epoch.current)setError((e as Error).message);}finally{if(revision===epoch.current)setBusy(false);}}
  function download(){const value=draft.current;if(!value)return;const href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=href;a.download='学习提问副本.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
  function newScope(){download();if(readOnly){setNotice('原讲座只读。原稿已保留，请打开当前讲座版本后重新提问。');return;}write({sessionId,pending:null,lastTurnId:null});setPending(null);setMismatch(false);mismatchRef.current=false;setError('');setNotice('已发起原提问副本下载，当前文字可在新上下文中重新发送。');}
  function editOriginal(){if(!turn||pending||historical||readOnly||active(turn))return;if(input&&input.trim()!==turn.message){download();setNotice('已发起当前草稿副本下载，原问题已放入输入框。');}change(turn.message);}
  function browse(id:string|null,target:string|null=null,anchor:string|null=null){setHistorical(id);setHistoryTarget(target);setMessageAnchor(anchor);setSelectionRevision(n=>n+1);}
  return {input,change,messages,turn,turns,pending,sessionId,viewSessionId,historical,browse,messageAnchor,matches,loading,busy,suspended,error,storageNotice,notice,cursor,location,mismatch,newScope,readOnly,
    waiting:active(turn)||!!turns?.turns.some(active),submit,control,stopWaiting,resume,older,searchMessages,resetMessages,moreTurns,download,editOriginal,selectTurn:(value:AssistantTurnView)=>{accept(value,!historical);setSuspended(false);}};
}
