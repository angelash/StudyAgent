import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import type { DiagnosticGuidancePlan, GuidanceModelOriginal, GuidanceModelSuggestionView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { DiagnosticsService } from './diagnostics.service';
import { GuidanceService } from './guidance.service';
import { guidanceDigest, guidanceModelKind, validateGuidanceText, type GuidanceModelSuggestionRecord } from './guidance-model-record';

const active = new Set(['queued','running','retry_wait','cancel_requested']);
const requestSchema = z.object({ requestKey:z.string().min(8).max(180),modelId:z.string().trim().min(1).max(180),expectedRevision:z.number().int().positive() }).strict();
function originalPlan(plan: DiagnosticGuidancePlan): GuidanceModelOriginal {
  return {summary:plan.summary,minutesPerDay:plan.minutesPerDay,actions:plan.actions.map(({id,atomId,hypothesisId,title,activity,minutes,successCriterion,retestAt,evidenceIds}) =>
    ({id,atomId,hypothesisId,title,activity,minutes,successCriterion,retestAt,evidenceIds:[...evidenceIds]}))};
}
export const guidancePlanHash = (plan: DiagnosticGuidancePlan) => guidanceDigest({ revision:plan.revision ?? 1,status:plan.status,source:plan.source,baselineSessionId:plan.baselineSessionId,
  baselineReportVersion:plan.baselineReportVersion,summary:plan.summary,minutesPerDay:plan.minutesPerDay,actions:plan.actions,evidenceIds:plan.evidenceIds });

@Injectable()
export class GuidanceModelService {
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly guidance:GuidanceService,
    private readonly diagnostics:DiagnosticsService,private readonly models:XiaojiuModelsService,private readonly provider:XiaojiuChatService) {}
  modelAvailable(){return this.provider.enabled;}
  private plan(user:InMemoryUserAccount,planId:string) {
    const plan=this.guidance.get(user,planId);this.students.assertGuardian(user,plan.studentId);
    if(plan.status!=='proposed')throw new ConflictException('只对待确认计划生成或采用新说明；当前计划保持原版本');
    if(plan.impact.needsReview)throw new ConflictException('指导依据已变化，请先核对原评测与知识定义');
    return plan;
  }
  private definitionHash(user:InMemoryUserAccount,plan:DiagnosticGuidancePlan) {
    const baseline=this.diagnostics.requireSession(user,plan.baselineSessionId);
    if(!baseline.atomSnapshots)throw new ConflictException('历史计划缺少冻结知识定义，请重新评测');
    return guidanceDigest(baseline.atomSnapshots);
  }
  authority(row:GuidanceModelSuggestionRecord) {
    const user=this.store.find('users',{id:row.ownerUserId,status:'active',role:row.authorizationRole});
    if(!user)throw new ForbiddenException('原制定计划的身份已不可用');
    if(row.authorizationRole==='parent'&&(!row.bindingId||!this.store.find('bindings',{id:row.bindingId,studentId:row.studentId,parentUserId:user.id,status:'active'})))throw new ForbiddenException('原监护授权已撤回');
    const plan=this.plan(user,row.planId);
    if(plan.studentId!==row.studentId||plan.baselineSessionId!==row.baselineSessionId||plan.revision!==row.planRevision||
      plan.baselineReportVersion!==row.baselineReportVersion||guidancePlanHash(plan)!==row.planHash||this.definitionHash(user,plan)!==row.definitionHash)
      throw new ConflictException('原计划或指导依据已变化，请核对当前版本后再请求建议');
    return {user,plan};
  }
  private record(user:InMemoryUserAccount,planId:string,id:string) {
    const row=this.store.find('guidanceModelSuggestions',{id,planId,ownerUserId:user.id});
    if(!row)throw new NotFoundException('指导建议记录不存在');
    this.students.assertGuardian(user,row.studentId);return row;
  }
  async view(row:GuidanceModelSuggestionRecord,provisional?:GuidanceModelSuggestionView['task']):Promise<GuidanceModelSuggestionView> {
    const task=provisional??await this.store.tasks.get(row.taskId),status=row.status==='completed'?'completed':task?.state==='failed'?'failed':task?.state==='cancelled'?'cancelled':task?.state==='cancel_requested'?'cancelling':row.status;
    let reason='',eligible=false;
    if(row.adoptedRevision!==null)reason='这份建议已采用，原建议及当时说明保留在历史中';
    else if(status!=='completed'||!row.result)reason='建议尚未完成校验';
    else try {this.authority(row);eligible=true;}catch(error){reason=error instanceof Error?error.message:'原依据暂不可核对';}
    const {id,planId,studentId,requestKey,requestedModelId,modelId,modelName,planRevision,baselineReportVersion,revision,original,result,createdAt,updatedAt,adoptedRevision}=row;
    return {id,planId,studentId,requestKey,requestedModelId,modelId,modelName,planRevision,baselineReportVersion,revision,original:structuredClone(original),result:result?structuredClone(result):null,
      createdAt,updatedAt,adoptedRevision,status,eligibility:{canAdopt:eligible,reason},task:task?{state:task.state,generation:task.generation,version:task.version,errorCode:task.errorCode}:null};
  }
  async get(user:InMemoryUserAccount,planId:string,id:string) {return this.view(this.record(user,planId,id));}
  async list(user:InMemoryUserAccount,planId:string,input:unknown={}) {
    const plan=this.guidance.get(user,planId);this.students.assertGuardian(user,plan.studentId);
    const c=validate(z.object({page:z.coerce.number().int().min(1).max(200).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20),requestKey:z.string().min(8).max(180).optional()}).strict(),input);
    const rows=this.store.select('guidanceModelSuggestions',{ownerUserId:user.id,planId,...(c.requestKey?{requestKey:c.requestKey}:{})}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
    if(rows.length>10000)throw new BadRequestException('建议记录超过当前读取预算，请按原请求定位');
    return {suggestions:await Promise.all(rows.slice((c.page-1)*c.pageSize,c.page*c.pageSize).map(row=>this.view(row))),page:c.page,pageSize:c.pageSize,hasMore:rows.length>c.page*c.pageSize};
  }
  private async idle(planId:string,except?:string) {
    for(const row of this.store.select('guidanceModelSuggestions',{planId}))if(row.id!==except&&row.status!=='completed') {
      const task=await this.store.tasks.get(row.taskId);if(task&&active.has(task.state))throw new ConflictException('本计划已有建议正在生成，请先读取或取消原任务');
    }
  }
  async create(user:InMemoryUserAccount,planId:string,input:unknown) {
    validate(requestSchema,input);
    for(let attempt=0;attempt<2;attempt++)try{return await this.store.transaction(()=>this.createInCurrentTransaction(user,planId,input));}
    catch(error){if(!(error instanceof ConflictException)||attempt===1)throw error;}
    throw new ConflictException('请读取最新指导建议状态');
  }
  /** Only the rule-plan creator calls this inside its existing transaction. Never opens a second store snapshot. */
  async createInCurrentTransaction(user:InMemoryUserAccount,planId:string,input:unknown) {
    const c=validate(requestSchema,input),commandHash=guidanceDigest(['guidance-model-v1',planId,c]);
      const ownedPlan=this.guidance.get(user,planId);this.students.assertGuardian(user,ownedPlan.studentId);
      const previous=this.store.find('guidanceModelSuggestions',{ownerUserId:user.id,requestKey:c.requestKey});
      if(previous){if(previous.planId!==planId||previous.commandHash!==commandHash)throw new ConflictException('请求键已用于不同的计划、模型或版本');return this.view(previous);}
      const plan=this.plan(user,planId);if(plan.revision!==c.expectedRevision)throw new ConflictException('计划已在其他页面更新，请核对当前版本');
      if(!this.modelAvailable())throw new ServiceUnavailableException('小九模型当前未启用，原规则计划仍可使用');
      const model=this.models.resolve(c.modelId);await this.idle(planId);
      const today=new Date().toISOString().slice(0,10);if(this.store.select('guidanceModelSuggestions',{ownerUserId:user.id}).filter(row=>row.createdAt.startsWith(today)).length>=50)throw new BadRequestException('今天已请求50条指导建议，原计划与历史仍可使用');
      if(user.role!=='parent'&&user.role!=='admin')throw new ForbiddenException('请由监护身份制定计划');
      const binding=user.role==='parent'?this.store.find('bindings',{parentUserId:user.id,studentId:plan.studentId,status:'active'}):null;
      if(user.role==='parent'&&!binding)throw new ForbiddenException('监护授权已变化');
      const report=this.diagnostics.report(user,plan.baselineSessionId),original=originalPlan(plan),atomIds=new Set(plan.actions.map(a=>a.atomId));
      const context=JSON.stringify({original,scope:{subject:plan.subject},observations:report.estimates.filter(e=>atomIds.has(e.atomId)).map(e=>({atomId:e.atomId,status:e.status,mastery:e.mastery,evidenceIds:e.evidenceIds})),
        hypotheses:report.hypotheses.filter(h=>atomIds.has(h.atomId)).map(({id,atomId,status,cause,observation,alternatives,supportingEvidenceIds,counterEvidenceIds,nextAction})=>({id,atomId,status,cause,observation,alternatives,supportingEvidenceIds,counterEvidenceIds,nextAction}))});
      if(context.length>60000)throw new BadRequestException('指导依据超过当前模型预算，原计划已保留；请缩小行动范围后请求建议');
      const now=new Date().toISOString(),id=this.store.nextId('guidance_suggestion'),definitionHash=this.definitionHash(user,plan),planHash=guidancePlanHash(plan),inputHash=guidanceDigest({commandHash,modelId:model.id,context,definitionHash,planHash});
      const row:GuidanceModelSuggestionRecord={id,planId,studentId:plan.studentId,ownerUserId:user.id,requestKey:c.requestKey,requestedModelId:c.modelId,modelId:model.id,modelName:model.label,
        planRevision:plan.revision!,baselineReportVersion:plan.baselineReportVersion!,original,result:null,adoptedRevision:null,status:'queued',revision:0,createdAt:now,updatedAt:now,
        commandHash,inputHash,definitionHash,planHash,context,baselineSessionId:plan.baselineSessionId,bindingId:binding?.id??null,authorizationRole:user.role,taskId:this.store.nextId('task'),requests:[]};
      this.store.append('guidanceModelSuggestions',row);await this.store.enqueueTask({id:row.taskId,kind:guidanceModelKind,ownerUserId:user.id,requestKey:'guidance-model:'+id,payloadHash:inputHash,payload:{suggestionId:id,planId},maxAttempts:2,createdAt:now});
      return this.view(row,{state:'queued',generation:1,version:1,errorCode:null});
  }
  async control(user:InMemoryUserAccount,planId:string,id:string,action:'cancel'|'retry',input:unknown) {
    const c=validate(z.object({generation:z.number().int().positive(),version:z.number().int().positive()}).strict(),input);
    return this.store.transaction(async()=>{
      const row=this.record(user,planId,id),task=await this.store.tasks.get(row.taskId);
      if(!task||task.generation!==c.generation)throw new ConflictException('建议状态已变化，请读取当前任务');
      if(row.status==='completed'||action==='cancel'&&task.state==='cancelled')return this.view(row);
      if(task.version!==c.version)throw new ConflictException('建议状态已变化，请读取当前任务');
      if(action==='retry') {
        if(!['failed','cancelled'].includes(task.state))throw new ConflictException('请先读取失败或取消终态');
        this.authority(row);await this.idle(planId,id);row.status='queued';row.revision++;row.updatedAt=new Date().toISOString();
      } else if(!active.has(task.state))return this.view(row);
      await this.store.controlTask({id:task.id,action,expectedVersion:task.version,actorId:user.id});
      return this.view(row,{state:action==='retry'?'queued':['running','cancel_requested'].includes(task.state)?'cancel_requested':'cancelled',generation:task.generation+(action==='retry'?1:0),version:task.version+1,errorCode:null});
    });
  }
  async adopt(user:InMemoryUserAccount,planId:string,id:string,input:unknown) {
    const c=validate(z.object({requestKey:z.string().min(8).max(180),expectedRevision:z.number().int().positive(),suggestionRevision:z.number().int().min(0)}).strict(),input);
    const hash=guidanceDigest(['adopt',planId,id,c]);
    return this.store.transaction(()=>{
      const row=this.record(user,planId,id),previous=row.requests.find(request=>request.key===c.requestKey);
      if(previous){if(previous.hash!==hash)throw new ConflictException('请求键已用于其他采用操作');return this.guidance.get(user,planId);}
      if(row.status!=='completed'||!row.result)throw new ConflictException('请等待建议完成校验后再采用');
      if(row.adoptedRevision!==null)throw new ConflictException('这份建议已被采用，原修订继续保留');
      if(row.revision!==c.suggestionRevision||row.planRevision!==c.expectedRevision)throw new ConflictException('建议或计划版本已变化，请重新读取对照');
      this.authority(row);const result=validateGuidanceText(row.result,row.original);
      const now=new Date().toISOString(),plan=this.guidance.adoptModelText(user,planId,c.expectedRevision,result,
        {suggestionId:id,modelId:row.modelId,modelName:row.modelName,basedOnRevision:row.planRevision,adoptedAt:now},c.requestKey);
      row.adoptedRevision=plan.revision!;row.requests.push({key:c.requestKey,hash,kind:'adopt'});row.revision++;row.updatedAt=now;return plan;
    });
  }
}
