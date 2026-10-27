'use client';
import * as React from 'react';
import { AssistantDock } from '@study-agent/ui';
import type { AssistantHistorySearch,AssistantTurnView } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import { useSessionUser } from '../lib/session-user';
import { useAssistantConversation } from '../lib/assistant-conversation';
import { XiaojiuModelPicker,useXiaojiuModels } from './xiaojiu-model-picker';
import './assistant-widget.css';

export type AssistantComposerContext={conversation:ReturnType<typeof useAssistantConversation>;models:ReturnType<typeof useXiaojiuModels>;blocked:boolean};
type AssistantWidgetProps={userRole:'student'|'parent';studentId:string|null;subject?:'math'|'chinese'|'english'|null;
  pageContext:'student_home'|'assessment'|'mission'|'review'|'weekly_report'|'classroom'|'studio';contextRefType?:'practice'|'diagnostic'|'plan'|'classroom_lecture'|null;
  contextRefId?:string|null;contextItemId?:string|null;title:string;subtitle:string;inline?:boolean;readOnly?:boolean;frozenLectureSessionId?:string;
  renderComposer?:(context:AssistantComposerContext)=>React.ReactNode};
const labels={queued:'已排队',running:'正在生成',validating:'正在检查回答',completed:'回答已保存',failed:'本次未完成',cancelled:'已取消',cancelling:'正在取消'};
const status=(turn:AssistantTurnView)=>turn.task?.state==='retry_wait'?'等待恢复':labels[turn.status];
function InlineAssistantFrame(props:React.ComponentProps<typeof AssistantDock>){return <section className="sa-inline-assistant" aria-label={props.title}>{props.children}</section>;}

export function AssistantWidget(props:AssistantWidgetProps){
  const identity=useSessionUser(),[open,setOpen]=React.useState(Boolean(props.inline)),[historyOpen,setHistoryOpen]=React.useState(false);
  const [history,setHistory]=React.useState<AssistantHistorySearch|null>(null),[historyQuery,setHistoryQuery]=React.useState(''),[historyBusy,setHistoryBusy]=React.useState(false),[historyError,setHistoryError]=React.useState('');
  const [messageQuery,setMessageQuery]=React.useState('');
  const historyEpoch=React.useRef(0),historyAbort=React.useRef<AbortController|null>(null),log=React.useRef<HTMLDivElement>(null),follow=React.useRef(true);
  const currentIdentity=React.useRef(identity?.id);currentIdentity.current=identity?.id;
  const locateEpoch=React.useRef(0);
  const context=JSON.stringify({userRole:props.userRole,studentId:props.studentId,subject:props.subject??null,pageContext:props.pageContext,
    contextRefType:props.contextRefType??null,contextRefId:props.contextRefId??null,contextItemId:props.contextItemId??null});
  const conversation=useAssistantConversation({open,ownerId:identity?.id??null,scope:context,context,readOnly:props.readOnly,frozenLectureSessionId:props.frozenLectureSessionId});
  const models=useXiaojiuModels(open&&!!identity),{catalog,modelId,setModelId,error:modelError,reload:reloadModels}=models;
  const locationSessionId=conversation.historical??conversation.viewSessionId;
  const locationKey=JSON.stringify([identity?.id,context,conversation.historical,locationSessionId,open]);
  const locationBoundary=React.useRef({key:locationKey,version:0});
  if(locationBoundary.current.key!==locationKey)locationBoundary.current={key:locationKey,version:locationBoundary.current.version+1};
  React.useEffect(()=>()=>{locateEpoch.current++;},[]);
  React.useEffect(()=>{historyEpoch.current++;historyAbort.current?.abort();setHistoryOpen(false);setHistory(null);setHistoryError('');setHistoryQuery('');setMessageQuery('');},[identity?.id,context]);
  React.useEffect(()=>()=>historyAbort.current?.abort(),[]);
  React.useEffect(()=>{if(follow.current)log.current?.scrollTo({top:log.current.scrollHeight,behavior:'instant'});},[conversation.messages.length,conversation.viewSessionId]);
  React.useEffect(()=>{if(conversation.messageAnchor)log.current?.querySelector<HTMLElement>('[data-message-id="'+CSS.escape(conversation.messageAnchor)+'"]')?.scrollIntoView({block:'center',behavior:'instant'});},[conversation.messages.length,conversation.messageAnchor]);
  async function searchHistory(page=1){
    const revision=++historyEpoch.current;historyAbort.current?.abort();const c=new AbortController();historyAbort.current=c;setHistoryBusy(true);setHistoryError('');
    try{const result=await apiRequest<AssistantHistorySearch>('/ai/assistant/history?query='+encodeURIComponent(historyQuery)+'&page='+page,{signal:c.signal});if(revision===historyEpoch.current)setHistory(result);}
    catch(e){if(revision===historyEpoch.current&&!c.signal.aborted)setHistoryError((e as Error).message);}
    finally{if(revision===historyEpoch.current)setHistoryBusy(false);}
  }
  function toggleHistory(){setHistoryOpen(v=>!v);if(!historyOpen)void searchHistory();}
  async function locate(){
    if(!locationSessionId)return;setHistoryError('');const owner=identity?.id,revision=++locateEpoch.current,boundary=locationBoundary.current.version;
    try{const page=await apiRequest<{location:{href:string|null}}>('/ai/assistant/sessions/'+locationSessionId+'/messages/page?pageSize=1');
      const href=page.location.href;if(owner!==currentIdentity.current||revision!==locateEpoch.current||boundary!==locationBoundary.current.version)return;if(href&&(/^\/(student|parent)\//.test(href)||/^\/studio(?:\/classroom)?(?:\?|$)/.test(href)))window.location.assign(href);else setHistoryError('这段对话没有可直接打开的学习活动。');
    }catch(e){if(owner===currentIdentity.current&&revision===locateEpoch.current&&boundary===locationBoundary.current.version)setHistoryError((e as Error).message);}
  }
  const t=conversation.turn,canCancel=!!t&&['queued','running','validating'].includes(t.status),canRetry=!props.readOnly&&!!t&&['failed','cancelled'].includes(t.status)&&t.task?.errorCode!=='assistant_context_changed';
  const blocked=conversation.loading||conversation.busy||conversation.waiting||!!conversation.pending||!!conversation.historical||conversation.mismatch||!conversation.sessionId||Boolean(props.readOnly);
  const Frame=props.inline?InlineAssistantFrame:AssistantDock;
  return <Frame title={props.title} subtitle={props.subtitle} open={open} compact onToggle={()=>setOpen(v=>!v)}>
    {!identity?<p role="status">{identity===undefined?'正在确认学习身份…':'请先进入学习或登录家长账号，再使用助教。'}</p>:!conversation.matches?<p role="status">正在切换到当前学习对话…</p>:
    <div className="learning-assistant" data-history={!!conversation.historical} data-empty={!conversation.messages.length&&!t&&!conversation.pending}>
      <div className="assistant-toolbar"><span>{conversation.historical?'历史对话':'当前学习对话'}</span><button type="button" aria-expanded={historyOpen} onClick={toggleHistory}>查找历史</button></div>
      {historyOpen&&<section className="assistant-search" aria-label="助教历史检索"><form onSubmit={e=>{e.preventDefault();void searchHistory();}}>
        <label>检索我的学习对话<input aria-label="检索历史关键词" value={historyQuery} maxLength={120} onChange={e=>setHistoryQuery(e.target.value)} placeholder="问题、解释或关键词"/></label>
        <button disabled={historyBusy}>{historyBusy?'正在检索…':'搜索历史'}</button></form>
        {historyError&&<p role="alert" className="assistant-error">{historyError}</p>}
        {history&&!historyBusy&&<><p className="assistant-search-count">找到 {history.total} 段对话</p><ol>{history.sessions.map(row=><li key={row.sessionId}>
          <button type="button" onClick={()=>{follow.current=!row.matchId;conversation.browse(row.sessionId,row.lastTurnId,row.matchId);setHistoryOpen(false);setMessageQuery('');}}><span>{row.preview}</span>
            <small>{row.lastTurn?status(row.lastTurn)+' · ':''}{row.messageCount} 条已保存消息</small></button></li>)}</ol>
          <div className="assistant-history-pages"><button disabled={history.page===1||historyBusy} onClick={()=>void searchHistory(history.page-1)}>上一页会话</button><span>第 {history.page} 页</span><button disabled={history.page*history.pageSize>=history.total||historyBusy} onClick={()=>void searchHistory(history.page+1)}>下一页会话</button></div></>}
      </section>}
      {conversation.historical?<aside className="assistant-history-banner"><p>正在回看已保存的提问和回答。</p><div><button onClick={()=>{follow.current=true;conversation.browse(null);setMessageQuery('');}}>返回当前学习对话</button><button onClick={()=>void locate()}>回到相关学习位置</button></div></aside>:
        <p className="assistant-intro">{props.pageContext==='classroom'||props.pageContext==='studio'?'围绕具体问题讲解，用例子、反例和新情境核对理解。':props.contextItemId?'围绕当前题目理清下一步；得到帮助后的表现会单独记录。':props.userRole==='student'?'告诉我卡住的一步，我们一起理清思路。':'根据已有学习证据，一起商量怎样陪伴。'}</p>}
      {props.readOnly&&!conversation.historical&&<p className="assistant-notice" role="status">正在只读原讲座版本。原问题与草稿保留，请打开当前版本后再提问。</p>}
      {historyError&&!historyOpen&&<p role="alert" className="assistant-error">{historyError}</p>}
      {conversation.loading&&<p role="status">正在取回对话与提问状态…</p>}
      {(conversation.messages.length>0||messageQuery||conversation.messageAnchor)&&<form className="assistant-message-search" onSubmit={e=>{e.preventDefault();follow.current=false;void conversation.searchMessages(messageQuery);}}>
        <label>当前会话关键词<input aria-label="检索当前对话" value={messageQuery} onChange={e=>setMessageQuery(e.target.value)} maxLength={120}/></label>
        <button disabled={conversation.busy||!messageQuery.trim()}>查找这段对话</button>{(messageQuery||conversation.messageAnchor)&&<button type="button" onClick={()=>{setMessageQuery('');follow.current=true;void conversation.resetMessages();}}>恢复最近消息</button>}
      </form>}
      <div ref={log} className="assistant-history" role="log" aria-live="polite" aria-label="当前学习对话" onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<40;}}>
        {conversation.cursor&&<button className="assistant-load-older" disabled={conversation.busy} onClick={()=>{follow.current=false;void conversation.older();}}>更早的消息</button>}
        {conversation.messages.map(m=><article className={'assistant-message from-'+m.sender} key={m.id} data-message-id={m.id}><strong>{m.sender==='assistant'?'学习助教':'我'}</strong><p>{m.content}</p>
          {m.sender==='assistant'&&<small>{m.source==='xiaojiu'?(m.modelName??m.modelId??'小九AI模型')+' · 小九AI建议':m.source==='openai'?'AI建议，请结合具体表现核对':m.source==='rules'?'根据学习记录给出的引导':'已保存的对话'}{m.evidenceIds?.length?' · 引用 '+m.evidenceIds.length+' 条学习证据':''}{m.assistanceRecorded&&<span>本题已记录使用助教提示。</span>}</small>}</article>)}
        {!conversation.loading&&!conversation.messages.length&&<p className="assistant-empty">{conversation.pending?'原提问已在本机保留，发送结果仍需核对。':conversation.historical?'这段会话暂无已保存回答，可以查看下方提问记录。':'可以先写下卡住的一步，再一起核对已有证据。'}</p>}
      </div>
      {conversation.pending&&!conversation.historical&&<aside className="assistant-turn" aria-label="待确认提问"><strong>发送结果尚未确认</strong><p>{conversation.pending.message}</p><small>已保留原请求和模型：{conversation.pending.modelId}</small>
        <button disabled={conversation.busy||conversation.mismatch||props.readOnly} onClick={()=>void conversation.submit(modelId,true)}>核对原请求</button></aside>}
      {t&&<section className="assistant-turn" aria-label="提问任务" data-status={t.status}><div className="assistant-turn-heading"><strong role="status">{status(t)}</strong><small>{t.modelName}</small></div>
        <details open={['queued','running','validating','cancelling','failed','cancelled'].includes(t.status)}><summary>原问题与记录</summary><p>{t.message}</p><small>第 {t.task?.generation??1} 次处理 · {new Date(t.createdAt).toLocaleString('zh-CN')}</small></details>
        {t.task?.errorCode==='assistant_context_changed'&&<p>学习位置、作答或授权已变化。请回到当前上下文重新提问。</p>}
        <div className="assistant-task-controls">{canCancel&&<button disabled={conversation.busy} onClick={()=>void conversation.control('cancel')}>取消生成</button>}
          {canRetry&&<button disabled={conversation.busy||conversation.waiting} onClick={()=>void conversation.control('retry')}>重试原任务</button>}
          {!props.readOnly&&!conversation.historical&&!conversation.waiting&&!conversation.pending&&['failed','cancelled'].includes(t.status)&&<button onClick={conversation.editOriginal}>{conversation.input&&conversation.input.trim()!==t.message?'保留草稿并编辑原问题':'作为新问题编辑'}</button>}</div>
      </section>}
      {!!conversation.turns?.turns.length&&<details className="assistant-task-history"><summary>提问记录（已读取 {conversation.turns.turns.length} 条）</summary><ol>{conversation.turns.turns.map(row=><li key={row.id}><button onClick={()=>conversation.selectTurn(row)} aria-current={t?.id===row.id?'true':undefined}><span>{row.message}</span><small>{status(row)} · {row.modelName}</small></button></li>)}</ol>
        {conversation.turns.hasMore&&<button disabled={conversation.busy} onClick={()=>void conversation.moreTurns()}>更早的提问记录</button>}</details>}
      {conversation.storageNotice&&<p className="assistant-storage-notice" role="status">{conversation.storageNotice}</p>}
      {conversation.notice&&<p className="assistant-notice" role="status">{conversation.notice}</p>}{conversation.error&&<p className="assistant-error" role="alert">{conversation.error}</p>}
      {(conversation.busy||conversation.waiting)&&!conversation.suspended&&<button className="assistant-stop-waiting" onClick={conversation.stopWaiting}>停止等待</button>}
      {(conversation.suspended||conversation.error)&&<button className="assistant-stop-waiting" disabled={conversation.busy} onClick={()=>void conversation.resume()}>读取最新状态</button>}
      {!conversation.historical&&(props.renderComposer?props.renderComposer({conversation,models,blocked}):<form onSubmit={e=>{e.preventDefault();void conversation.submit(modelId);}}><label>想一起看看什么<textarea aria-label="想一起看看什么" value={conversation.input} onChange={e=>conversation.change(e.target.value)} rows={3}
        placeholder="写下卡住的一步，或想核对的学习表现" maxLength={3000} disabled={blocked}/></label>
        <XiaojiuModelPicker error={modelError} onRetry={reloadModels} catalog={catalog} value={modelId} onChange={setModelId} compact disabled={blocked}/>{modelError&&<p className="assistant-error" role="status">模型目录加载失败：{modelError}</p>}
        <div className="assistant-controls"><small>收起后任务仍会保留，重新打开可恢复。</small><button disabled={blocked||!catalog||!conversation.input.trim()}>{conversation.busy?'正在确认…':'一起想一想 →'}</button></div>
      </form>)}
      {conversation.mismatch&&!props.readOnly&&<button className="assistant-stop-waiting" onClick={conversation.newScope}>下载原稿并转为新提问</button>}
      {(!props.inline||conversation.input||conversation.messages.length||conversation.pending||t)&&<button className="assistant-export" onClick={conversation.download}>下载提问副本</button>}
    </div>}
  </Frame>;
}
