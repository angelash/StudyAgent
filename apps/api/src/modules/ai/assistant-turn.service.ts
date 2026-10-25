import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AssistantContextView, AssistantHistoryPage, AssistantLocation, AssistantTurnView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { AiService } from './ai.service';
import { routedItemAvailable } from '../diagnostics/adaptive-routing';
import { assistantDigest, assistantTurnKind, assistantWorkerPort, type AssistantChatCommand, type AssistantLegacyResult, type AssistantTurnRecord, type AssistantWorkerPort } from './assistant-turn-record';

const commandSchema=z.object({requestKey:z.string().min(8).max(180),message:z.string().trim().min(1).max(3000),modelId:z.string().trim().min(1).max(180),contextVersion:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const activeStates=new Set(['queued','running','retry_wait','cancel_requested']);
const compare=(a:string,b:string)=>a===b?0:a>b?1:-1;

export function assistantAuthority(store:InMemoryStoreService,students:StudentsService,ai:AiService,turn:AssistantTurnRecord) {
  const user=store.find('users',{id:turn.ownerUserId,status:'active',role:turn.authorization.role});
  if(!user)throw new ForbiddenException('原助教身份已不可用');
  const session=ai.assertSessionOwner(turn.sessionId,user), auth=turn.authorization;
  if(session.status!=='active'||session.studentId!==turn.studentId)throw new ForbiddenException('原助教会话已不可用');
  if(auth.bindingId&&!store.find('bindings',{id:auth.bindingId,studentId:turn.studentId,parentUserId:auth.guardianId??user.id,status:'active'}))throw new ForbiddenException('原监护授权已撤回');
  if(user.role==='student'){
    const guardian=store.find('users',{id:auth.guardianId,status:'active',role:['parent','admin']});
    if(!guardian||!store.find('studentLearningAccess',{id:auth.accessId,studentId:turn.studentId,userId:user.id,status:'enabled',version:auth.accessVersion}))throw new ForbiddenException('原学习授权已变化');
    if(turn.studentId)students.assertCanAccessStudent(user,turn.studentId);
  }
  if(ai.assistantSnapshot(session).bindingHash!==turn.prepared.bindingHash)throw new ConflictException('原题目、作答代次或学习依据已变化，请在当前上下文重新提问');
  return session;
}

@Injectable()
export class AssistantTurnService {
  constructor(private readonly store:InMemoryStoreService,private readonly ai:AiService,private readonly students:StudentsService,private readonly moduleRef:ModuleRef){}
  private location(sessionId:string,user:InMemoryUserAccount):AssistantLocation {
    const s=this.ai.assertSessionOwner(sessionId,user,false), params=new URLSearchParams();
    if(s.studentId)params.set('studentId',s.studentId);if(s.subject)params.set('subject',s.subject);
    let path='/student/assessment',available=true;
    if(s.contextRefType==='practice') {const activity=this.store.find('practiceSessions',{id:s.contextRefId!,studentId:s.studentId!,subject:s.subject!});
      available=!!activity&&!!s.contextItemId&&activity.snapshots.some(q=>q.id===s.contextItemId);path='/student/today';params.set('practice',s.contextRefId!);if(s.contextItemId)params.set('question',s.contextItemId);}
    else if(s.contextRefType==='diagnostic') {const activity=this.store.find('diagnosticSessions',{id:s.contextRefId!,studentId:s.studentId!,subject:s.subject!});
      available=!!activity&&(!s.contextItemId||activity.itemSnapshots.some(item=>item.id===s.contextItemId)&&routedItemAvailable(activity,s.contextItemId));params.set('session',s.contextRefId!);if(s.contextItemId)params.set('item',s.contextItemId);}
    else if(s.contextRefType==='plan'){available=!!this.store.find('diagnosticPlans',{id:s.contextRefId!,studentId:s.studentId!,subject:s.subject!});params.set('view','plan');params.set('planId',s.contextRefId!);}
    else if(s.pageContext==='weekly_report')path='/parent/dashboard';
    else if(s.pageContext==='student_home')path='/student/today';
    return {sessionId:s.id,pageContext:s.pageContext,studentId:s.studentId,subject:s.subject??null,contextRefType:s.contextRefType??null,contextRefId:s.contextRefId??null,
      contextItemId:s.contextItemId??null,href:s.studentId&&available?path+'?'+params.toString():null};
  }
  context(user:InMemoryUserAccount,sessionId:string):AssistantContextView {
    const session=this.ai.assertSessionOwner(sessionId,user,false);return {contextVersion:this.ai.assistantSnapshot(session).contextVersion,location:this.location(sessionId,user)};
  }
  async view(turn:AssistantTurnRecord,provisional?:AssistantTurnView['task']):Promise<AssistantTurnView> {
    const task=provisional??await this.store.tasks.get(turn.taskId);
    const status=turn.status==='completed'?'completed':task?.state==='failed'?'failed':task?.state==='cancelled'?'cancelled':task?.state==='cancel_requested'?'cancelling':turn.status;
    const {id,sessionId,requestKey,message,requestedModelId,modelId,modelName,source,contextVersion,location,revision,createdAt,updatedAt,userMessageId,assistantMessageId}=turn;
    return {id,sessionId,requestKey,message,requestedModelId,modelId,modelName,source,contextVersion,location,revision,createdAt,updatedAt,userMessageId,assistantMessageId,status,
      task:task?{state:task.state,generation:task.generation,version:task.version,errorCode:task.errorCode}:null};
  }
  private record(user:InMemoryUserAccount,sessionId:string,id:string){
    this.ai.assertSessionOwner(sessionId,user,false);const turn=this.store.find('assistantTurns',{id,sessionId,ownerUserId:user.id});if(!turn)throw new NotFoundException('提问记录不存在');return turn;
  }
  async get(user:InMemoryUserAccount,sessionId:string,id:string){return this.view(this.record(user,sessionId,id));}
  async list(user:InMemoryUserAccount,sessionId:string,input:unknown={}){
    this.ai.assertSessionOwner(sessionId,user,false);
    const c=validate(z.object({page:z.coerce.number().int().min(1).max(200).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25),requestKey:z.string().min(8).max(180).optional()}).strict(),input);
    // New task history is paged separately from the legacy message array.
    const rows=this.store.select('assistantTurns',{ownerUserId:user.id,sessionId,...(c.requestKey?{requestKey:c.requestKey}:{})}).sort((a,b)=>compare(b.createdAt,a.createdAt)||compare(b.id,a.id));
    if(rows.length>10000)throw new BadRequestException('提问记录超出当前检索预算，请从具体学习活动进入');
    return {turns:await Promise.all(rows.slice((c.page-1)*c.pageSize,c.page*c.pageSize).map(row=>this.view(row))),hasMore:rows.length>c.page*c.pageSize,page:c.page,pageSize:c.pageSize};
  }
  private async assertIdle(ownerUserId:string,except?:string){
    for(const row of this.store.select('assistantTurns',{ownerUserId}))if(row.id!==except&&row.status!=='completed'){
      const task=await this.store.tasks.get(row.taskId);if(task&&activeStates.has(task.state))throw new ConflictException('上一条提问仍在处理，请先完成或取消后重试');
    }
  }
  private authorization(user:InMemoryUserAccount,studentId:string|null,authSession?:InMemoryAuthSession):AssistantTurnRecord['authorization']{
    const auth:AssistantTurnRecord['authorization']={role:user.role};if(!studentId)return auth;
    if(user.role==='student'){
      const session=authSession??this.store.select('sessions',{userId:user.id,studentId}).find(s=>s.accessVersion!==undefined&&s.revokedAt===null&&Date.parse(s.expiresAt)>Date.now());
      if(!session)throw new ForbiddenException('请用当前学习授权重新登录');
      const access=this.store.find('studentLearningAccess',{studentId,userId:user.id,status:'enabled',version:session.accessVersion}),guardian=this.store.find('users',{id:session.guardianId,status:'active',role:['parent','admin']});
      if(!access||!guardian)throw new ForbiddenException('学习授权已变化');
      Object.assign(auth,{guardianId:guardian.id,accessId:access.id,accessVersion:access.version});
      if(guardian.role==='admin')return auth;
    }else if(user.role==='admin')return auth;
    const binding=this.store.find('bindings',{studentId,parentUserId:auth.guardianId??user.id,status:'active'});
    if(!binding)throw new ForbiddenException('监护授权不存在');auth.bindingId=binding.id;return auth;
  }
  async create(user:InMemoryUserAccount,sessionId:string,input:unknown,authSession?:InMemoryAuthSession,legacy=false){
    const c=legacy?validate(commandSchema.extend({modelId:commandSchema.shape.modelId.nullable()}),input):validate(commandSchema,input);
    const commandHash=assistantDigest([sessionId,c.message,c.modelId,c.contextVersion]);
    for(let attempt=0;attempt<2;attempt++)try{return await this.store.transaction(async()=>{
      const session=this.ai.assertSessionOwner(sessionId,user,false), previous=this.store.find('assistantTurns',{ownerUserId:user.id,requestKey:c.requestKey});
      if(previous){if(previous.sessionId!==sessionId||previous.commandHash!==commandHash)throw new ConflictException('请求标识已用于另一条问题、模型或上下文');return this.view(previous);}
      if(this.store.find('assistantMessages',{sessionId,requestKey:c.requestKey,sender:'user'}))throw new ConflictException('该请求对应历史消息，请从历史读取');
      await this.assertIdle(user.id);
      const prepared=this.ai.prepareAssistant(sessionId,c.message,c.modelId??undefined);
      if(prepared.contextVersion!==c.contextVersion)throw new ConflictException('学习上下文已变化，请先读取当前状态并核对问题');
      const turns=this.store.select('assistantTurns',{ownerUserId:user.id}),today=new Date().toISOString().slice(0,10),paired=new Set(turns.map(t=>t.userMessageId));
      const sessions=new Set(this.store.select('assistantSessions',{ownerUserId:user.id}).map(s=>s.id));
      const legacyCount=this.store.assistantMessages.filter(m=>sessions.has(m.sessionId)&&m.sender==='user'&&!paired.has(m.id)&&m.createdAt.startsWith(today)).length;
      if(legacyCount+turns.filter(t=>t.createdAt.startsWith(today)).length>=100)throw new BadRequestException('今天的助教对话已达到100条，可以继续使用评测与指导计划');
      const now=new Date().toISOString(),id=this.store.nextId('assistant_turn'),inputHash=assistantDigest([commandHash,prepared]),authorization=this.authorization(user,session.studentId,authSession);
      const turn:AssistantTurnRecord={id,sessionId,ownerUserId:user.id,studentId:session.studentId,requestKey:c.requestKey,message:c.message,requestedModelId:c.modelId,
        modelId:prepared.modelId,modelName:prepared.modelName,source:prepared.execution,contextVersion:c.contextVersion,location:this.location(sessionId,user),
        status:'queued',revision:0,createdAt:now,updatedAt:now,taskId:this.store.nextId('task'),inputHash,commandHash,prepared,authorization};
      this.store.append('assistantTurns',turn);
      await this.store.enqueueTask({id:turn.taskId,kind:assistantTurnKind,ownerUserId:user.id,requestKey:'assistant-turn:'+assistantDigest([user.id,c.requestKey]),payloadHash:inputHash,payload:{turnId:id},maxAttempts:2,createdAt:now});
      return this.view(turn,{state:'queued',generation:1,version:1,errorCode:null});
    });}catch(error){if(!(error instanceof ConflictException)||attempt===1)throw error;}
    throw new ConflictException('请读取最新提问状态');
  }
  async control(user:InMemoryUserAccount,sessionId:string,id:string,action:'cancel'|'retry',input:unknown){
    const c=validate(z.object({generation:z.number().int().min(1),version:z.number().int().min(1)}).strict(),input);
    return this.store.transaction(async()=>{
      const turn=this.record(user,sessionId,id),task=await this.store.tasks.get(turn.taskId);
      if(!task||task.generation!==c.generation)throw new ConflictException('提问状态已变化，请刷新');
      if(turn.status==='completed'||action==='cancel'&&task.state==='cancelled')return this.view(turn);
      if(c.version!==task.version)throw new ConflictException('提问状态已变化，请刷新');
      if(action==='retry'){
        if(!['failed','cancelled'].includes(task.state))throw new ConflictException('请读取失败或取消状态后重试');
        assistantAuthority(this.store,this.students,this.ai,turn);await this.assertIdle(user.id,id);turn.status='queued';turn.revision++;turn.updatedAt=new Date().toISOString();
      }else if(!activeStates.has(task.state))return this.view(turn);
      await this.store.controlTask({id:task.id,action,expectedVersion:task.version,actorId:user.id});
      return this.view(turn,{state:action==='retry'?'queued':['running','cancel_requested'].includes(task.state)?'cancel_requested':'cancelled',version:task.version+1,generation:task.generation+(action==='retry'?1:0),errorCode:null});
    });
  }
  page(user:InMemoryUserAccount,sessionId:string,input:unknown):AssistantHistoryPage {
    const c=validate(z.object({query:z.string().trim().max(120).default(''),pageSize:z.coerce.number().int().min(1).max(50).default(25),cursor:z.string().max(1600).optional(),anchor:z.string().min(1).max(180).optional()}).strict(),input);
    if(c.anchor&&c.cursor)throw new BadRequestException('定位消息时请重新读取，不同时使用历史游标');
    const location=this.location(sessionId,user),rows=this.store.select('assistantMessages',{sessionId});
    if(rows.length>10000)throw new BadRequestException('本会话已超出当前检索预算，请选择其他会话；没有截断或省略检索结果');
    let before:{at:string;id:string}|null=null;
    if(c.cursor){try{const v=z.object({sessionId:z.literal(sessionId),query:z.literal(c.query),at:z.string(),id:z.string()}).strict().parse(JSON.parse(Buffer.from(c.cursor,'base64url').toString('utf8')));before={at:v.at,id:v.id};}catch{throw new BadRequestException('历史游标无效，请重新检索');}}
    // Frozen collection positions preserve causality when user and reply share a millisecond.
    const entries=rows.map((message,sequence)=>({...message,sequence})),marker=before?entries.find(m=>m.id===before!.id&&m.createdAt===before!.at):null;
    if(before&&!marker)throw new BadRequestException('历史游标对应消息已不可用，请重新检索');
    const selected=entries.filter(m=>(!c.query||m.content.toLocaleLowerCase().includes(c.query.toLocaleLowerCase()))&&(!marker||m.createdAt<marker.createdAt||m.createdAt===marker.createdAt&&m.sequence<marker.sequence))
      .sort((a,b)=>compare(b.createdAt,a.createdAt)||b.sequence-a.sequence);
    const anchor=c.anchor?selected.findIndex(m=>m.id===c.anchor):0;if(c.anchor&&anchor<0)throw new NotFoundException('历史消息已不可用或不属于当前会话');
    const offset=c.anchor?Math.max(0,anchor-Math.floor(c.pageSize/2)):0,page=selected.slice(offset,offset+c.pageSize),last=page.at(-1);
    return {messages:page.map(({requestKey:_key,...m})=>m),location,nextCursor:selected.length>offset+c.pageSize&&last?Buffer.from(JSON.stringify({sessionId,query:c.query,at:last.createdAt,id:last.id})).toString('base64url'):null};
  }
  async history(user:InMemoryUserAccount,input:unknown){
    const c=validate(z.object({query:z.string().trim().max(120).default(''),page:z.coerce.number().int().min(1).max(200).default(1),pageSize:z.coerce.number().int().min(1).max(30).default(15)}).strict(),input);
    const sessions=this.store.select('assistantSessions',{ownerUserId:user.id,status:'active'});
    if(sessions.length>3000)throw new BadRequestException('会话数量超出本次检索预算，请从具体学习活动进入');
    let scanned=0;
    const selected=sessions.flatMap(s=>{try{const location=this.location(s.id,user),messages=this.store.select('assistantMessages',{sessionId:s.id}),turns=this.store.select('assistantTurns',{sessionId:s.id,ownerUserId:user.id});
      scanned+=messages.length+turns.length;if(scanned>10000)throw new BadRequestException('历史超出本次检索预算，请从具体学习活动进入');
      const matching=c.query?messages.filter(m=>m.content.toLocaleLowerCase().includes(c.query.toLocaleLowerCase())):messages;
      const turnMatches=(c.query?turns.filter(t=>t.message.toLocaleLowerCase().includes(c.query.toLocaleLowerCase())):turns).sort((a,b)=>compare(a.updatedAt,b.updatedAt)||compare(a.id,b.id));
      if(c.query&&!matching.length&&!turnMatches.length)return [];const last=matching.at(-1),turn=turnMatches.at(-1),useTurn=!!turn&&(!last||turn.updatedAt>last.createdAt);
      return [{sessionId:s.id,location,lastAt:useTurn?turn!.updatedAt:last?.createdAt??'',messageCount:messages.length,matchId:last?.id??null,lastTurnId:turn?.id??null,
        preview:(useTurn?turn!.message:last?.content??'尚未保存回答').slice(0,180)}];
    }catch(error){if(error instanceof ForbiddenException||error instanceof NotFoundException)return [];throw error;}}).sort((a,b)=>compare(b.lastAt,a.lastAt)||compare(b.sessionId,a.sessionId));
    const page=await Promise.all(selected.slice((c.page-1)*c.pageSize,c.page*c.pageSize).map(async row=>({...row,lastTurn:row.lastTurnId?await this.get(user,row.sessionId,row.lastTurnId):null})));
    return {sessions:page,total:selected.length,page:c.page,pageSize:c.pageSize};
  }
  private async cancelLatest(user:InMemoryUserAccount,sessionId:string,id:string){
    for(let retry=0;retry<3;retry++){
      const latest=await this.store.requestContext(()=>this.get(user,sessionId,id));
      if(!latest.task||!activeStates.has(latest.task.state))return latest;
      try{return await this.control(user,sessionId,id,'cancel',{generation:latest.task.generation,version:latest.task.version});}
      catch(error){if(!(error instanceof ConflictException)||retry===2)throw error;}
    }
  }
  async legacy(command:AssistantChatCommand):Promise<AssistantLegacyResult>{
    if(command.signal?.aborted)throw new BadRequestException('本次对话已取消');
    // Flush an enclosing HTTP or server-side workspace before starting independently fenced work.
    await this.store.commitRequest();
    const initial=await this.store.requestContext(()=>{const s=this.store.find('assistantSessions',{id:command.sessionId,status:'active'});if(!s)throw new NotFoundException('助教会话不存在');
      const user=this.store.find('users',{id:s.ownerUserId,status:'active'});if(!user)throw new ForbiddenException();this.ai.assertSessionOwner(s.id,user,false);
      const previous=command.requestKey?this.store.find('assistantMessages',{sessionId:s.id,requestKey:command.requestKey,sender:'user'}):null;
      const durable=command.requestKey?this.store.find('assistantTurns',{ownerUserId:user.id,requestKey:command.requestKey}):null;
      if(previous&&!durable){if(previous.content!==command.message.trim())throw new ConflictException('请求键已用于另一条提问');const reply=this.store.find('assistantMessages',{sessionId:s.id,inReplyTo:previous.id});
        if(!reply)throw new ConflictException('历史回答暂不可用');if(command.modelId&&reply.modelId!==command.modelId)throw new ConflictException('历史请求的模型不同');
        return {user,previousResult:{reply:reply.content,source:reply.source??'rules',modelId:reply.modelId??null,modelName:reply.modelName??null,evidenceIds:reply.evidenceIds??[],assistanceRecorded:reply.assistanceRecorded??false,messages:this.ai.listMessages(s.id)} as AssistantLegacyResult,contextVersion:''};}
      return {user,previousResult:null,contextVersion:durable?.contextVersion??this.ai.assistantSnapshot(s).contextVersion};});
    if(initial.previousResult)return initial.previousResult;
    let turn=await this.create(initial.user,command.sessionId,{requestKey:command.requestKey??randomUUID(),message:command.message,modelId:command.modelId??null,contextVersion:initial.contextVersion},command.authSession,true);
    const worker=this.moduleRef.get<AssistantWorkerPort>(assistantWorkerPort,{strict:false}),deadline=Date.now()+180000;
    while(Date.now()<deadline){
      if(command.signal?.aborted){const cancelled=await this.cancelLatest(initial.user,turn.sessionId,turn.id).catch(()=>null);
        throw new BadRequestException(cancelled&&['cancelling','cancelled'].includes(cancelled.status)?'本次对话已请求取消，请读取实际终态':'本次等待已停止，取消尚未确认，请读取实际提问状态');}
      if(turn.status==='completed')return this.store.requestContext(()=>{this.ai.assertSessionOwner(turn.sessionId,initial.user,false);const m=this.store.find('assistantMessages',{id:turn.assistantMessageId,sessionId:turn.sessionId});if(!m)throw new NotFoundException('回答已不可用');return {reply:m.content,source:m.source??'rules',evidenceIds:m.evidenceIds??[],modelId:m.modelId??null,modelName:m.modelName??null,assistanceRecorded:m.assistanceRecorded??false,messages:this.ai.listMessages(turn.sessionId)};});
      if(['failed','cancelled'].includes(turn.status))throw new ServiceUnavailableException(turn.status==='cancelled'?'本次对话已取消':'提问未完成，可从已保存任务重试或在当前上下文重新提问');
      void worker.runNext().catch(()=>{});await new Promise(resolve=>setTimeout(resolve,80));turn=await this.store.requestContext(()=>this.get(initial.user,turn.sessionId,turn.id));
    }
    throw new ServiceUnavailableException('提问已保存，等待超时；请重新打开助教读取实际状态');
  }
}
