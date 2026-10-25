import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { sourceCourseCheckContentSchema,type SourceCourseCheckView,type SourceCourseCheckAuthoring } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { StudentsService } from '../students/students.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { sourceCheckCourse,captureSourceCheckAuthorization,assertSourceCheckInputCurrent } from './source-course-check-access';
import { prepareSourceCourseCheck,sourceCheckDigest,validateSourceCourseCheck,SOURCE_CHECK_CONTEXT_LIMIT } from './source-course-check-content';
import type { SourceCourseCheckRecord } from './source-course-check-record';

export const sourceCheckTaskKind='learning.source-check.generate';
const key=z.string().min(8).max(180),revision=z.number().int().min(0);
const selection={modelId:z.string().trim().min(1).max(120).default('auto'),lessonIds:z.array(z.string().min(1).max(400)).min(1).max(6)};
const prepareSchema=z.object({...selection,expectedRevision:revision,courseFingerprint:z.string().min(1).max(200),requestKey:key}).strict();
const active=new Set(['queued','running','retry_wait','cancel_requested']);
/** Only explicit mutation paths reconcile terminal labels; GET never changes records. */
export function reconcileSourceCheck(row:SourceCourseCheckRecord,task:TaskRow|null|undefined){
  if(task&&task.id===row.taskId&&['queued','generating','cancel_requested'].includes(row.status)&&['failed','cancelled'].includes(task.state)){
    row.status=task.state as 'failed'|'cancelled';row.revision++;row.updatedAt=new Date().toISOString();return true;
  }
  return false;
}
@Injectable()
export class SourceCourseCheckService{
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly models:XiaojiuModelsService,private readonly chat:XiaojiuChatService){}
  modelAvailable(){return this.chat.enabled;}
  private record(user:InMemoryUserAccount,courseId:string,id:string){
    const course=sourceCheckCourse(this.store,this.students,user,courseId),row=this.store.find('sourceCourseChecks',{id,courseId,ownerUserId:user.id});
    if(!row)throw new NotFoundException('核查题组候选不存在');return{course,row};
  }
  async view(row:SourceCourseCheckRecord,taskOverride?:TaskRow,receipt?:SourceCourseCheckRecord['commands'][number]):Promise<SourceCourseCheckView>{
    const task=taskOverride??await this.store.tasks.get(row.taskId),status=['published','superseded','withdrawn','ready'].includes(row.status)?row.status:task?.state==='failed'?'failed':task?.state==='cancelled'?'cancelled':task?.state==='cancel_requested'?'cancelling':row.status==='cancel_requested'?'cancelling':row.status;
    const course=this.store.find('sourceCourses',{id:row.courseId}),publication=this.store.find('sourceCourseCheckPublications',{id:row.courseId}),courseCurrent=Boolean(course?.status==='active'&&course.fingerprint===row.courseFingerprint);
    return{id:row.id,courseId:row.courseId,revision:row.revision,courseCurrent,
      status:status as SourceCourseCheckView['status'],title:row.content?.title??null,modelId:row.prepared.modelId,modelName:row.modelName??row.prepared.modelId,
      questionCount:row.content?.questions.length??0,contentFingerprint:row.contentFingerprint??null,contentVersion:row.content?row.contentVersion??1:null,targets:row.prepared.targets.map(({lessonId,title,objective})=>({lessonId,title,objective})),stage:row.generationStage??'writing',
      review:row.modelReview?{decision:row.modelReview.decision,issueCount:row.modelReview.issues.length,current:row.modelReview.outputFingerprint===row.contentFingerprint}:null,
      publication:publication?{checkId:publication.checkId,revision:publication.revision,current:publication.checkId===row.id&&row.status==='published'&&courseCurrent}:null,contentReview:'pending',formalMeasurementEligible:false,
      task:task?{id:task.id,state:task.state,generation:task.generation,version:task.version,errorCode:task.errorCode}:null,createdAt:row.createdAt,updatedAt:row.updatedAt,
      ...(receipt?.actorUserId?{receipt:{key:receipt.key,kind:receipt.kind,actorUserId:receipt.actorUserId,effectiveRevision:receipt.effectiveRevision,at:receipt.at,...(receipt.contentFingerprint?{contentFingerprint:receipt.contentFingerprint,contentVersion:receipt.contentVersion}:{}),...(receipt.publicationRevision!==undefined?{publicationRevision:receipt.publicationRevision}:{})}}:{})};
  }
  async list(user:InMemoryUserAccount,courseId:string){sourceCheckCourse(this.store,this.students,user,courseId);return Promise.all(this.store.select('sourceCourseChecks',{courseId,ownerUserId:user.id}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(row=>this.view(row)));}
  async get(user:InMemoryUserAccount,courseId:string,id:string){return this.view(this.record(user,courseId,id).row);}
  async receipt(user:InMemoryUserAccount,courseId:string,id:string,requestKey:string){const {row}=this.record(user,courseId,id),receipt=row.commands.find(command=>command.key===requestKey);if(!receipt)throw new NotFoundException('原操作回执不存在');return this.view(row,undefined,receipt);}
  preflight(user:InMemoryUserAccount,courseId:string,input:unknown){
    const course=sourceCheckCourse(this.store,this.students,user,courseId),command=validate(z.object(selection).strict(),input),model=this.models.resolve(command.modelId);
    try{const prepared=prepareSourceCourseCheck(course,{...command,modelId:model.id});return{valid:true,available:this.modelAvailable(),courseRevision:course.revision,courseFingerprint:course.fingerprint,modelId:model.id,modelName:model.label,contextCharacters:prepared.contextCharacters,maxContextCharacters:SOURCE_CHECK_CONTEXT_LIMIT,targets:prepared.targets.map(({lessonId,title,objective})=>({lessonId,title,objective})),errorCode:null};}
    catch(error){return{valid:false,available:this.modelAvailable(),courseRevision:course.revision,courseFingerprint:course.fingerprint,modelId:model.id,modelName:model.label,contextCharacters:null,maxContextCharacters:SOURCE_CHECK_CONTEXT_LIMIT,targets:[],errorCode:error instanceof Error&&error.message.startsWith('source_check_')?error.message:'source_check_selection_invalid'};}
  }
  async prepare(user:InMemoryUserAccount,courseId:string,input:unknown,session:InMemoryAuthSession){
    const command=validate(prepareSchema,input),hash=sourceCheckDigest({courseId,...command,requestKey:undefined});
    return this.store.transaction(async()=>{
      const course=sourceCheckCourse(this.store,this.students,user,courseId),previous=this.store.find('sourceCourseChecks',{ownerUserId:user.id,requestKey:command.requestKey});
      if(previous){if(previous.courseId!==courseId||previous.requestHash!==hash)throw new ConflictException('原请求已用于其他核查题组');return this.view(previous,undefined,previous.commands.find(item=>item.key===command.requestKey&&item.kind==='prepare'));}
      if(course.revision!==command.expectedRevision||course.fingerprint!==command.courseFingerprint)throw new ConflictException('课程内容已更新，请重新读取目标');
      const model=this.models.resolve(command.modelId);if(!this.modelAvailable())throw new ServiceUnavailableException('小九AI当前未启用，请先连接模型再准备核查');
      let prepared;try{prepared=prepareSourceCourseCheck(course,{modelId:model.id,lessonIds:command.lessonIds});}catch{throw new BadRequestException('所选目标或来源不满足独立核查条件，请先查看准备预览');}
      const authorization=captureSourceCheckAuthorization(this.store,this.students,user,course,session);
      for(const row of this.store.select('sourceCourseChecks',{ownerUserId:user.id,courseId})){const task=await this.store.tasks.get(row.taskId);reconcileSourceCheck(row,task);if(['queued','generating','cancel_requested'].includes(row.status)||task&&active.has(task.state))throw new ConflictException('这门课程已有出题任务，请先查看或结束原任务');}
      const now=new Date().toISOString(),row:SourceCourseCheckRecord={id:this.store.nextId('source_check'),ownerUserId:user.id,studentId:course.studentId,courseId,courseFingerprint:command.courseFingerprint,requestKey:command.requestKey,requestHash:hash,prepared,authorization,revision:0,taskId:this.store.nextId('task'),status:'queued',generationStage:'writing',modelName:model.label,content:null,originalContent:null,contentFingerprint:null,modelReview:null,createdAt:now,updatedAt:now,publishedAt:null,withdrawnAt:null,commands:[]};
      row.commands.push({key:command.requestKey,kind:'prepare',hash,effectiveRevision:0,at:now,actorUserId:user.id});this.store.append('sourceCourseChecks',row);await this.store.enqueueTask({id:row.taskId,kind:sourceCheckTaskKind,ownerUserId:user.id,requestKey:'source-check:'+row.id,payloadHash:hash,payload:{checkId:row.id,courseId},createdAt:now,maxAttempts:2});
      return this.view(row,{id:row.taskId,kind:sourceCheckTaskKind,ownerUserId:user.id,requestKey:'source-check:'+row.id,payloadHash:hash,payload:{checkId:row.id,courseId},createdAt:now,updatedAt:now,state:'queued',attempts:0,maxAttempts:2,generation:1,version:1,availableAt:Date.now(),leaseToken:null,leaseUntil:null,progress:{},result:null,errorCode:null},row.commands[0]);
    });
  }
  async control(user:InMemoryUserAccount,courseId:string,id:string,action:'cancel'|'retry',input:unknown,session:InMemoryAuthSession){
    const command=validate(z.object({expectedRevision:revision,generation:z.number().int().min(1),taskVersion:z.number().int().min(1),requestKey:key}).strict(),input),hash=sourceCheckDigest({action,...command,requestKey:undefined});
    return this.store.transaction(async()=>{
      const {course,row}=this.record(user,courseId,id),prior=row.commands.find(item=>item.key===command.requestKey);if(prior){if(prior.hash!==hash||prior.kind!==action)throw new ConflictException('请求标识已用于不同操作');return this.view(row,undefined,prior);}
      const task=await this.store.tasks.get(row.taskId);
      if(!task||task.generation!==command.generation)throw new ConflictException('题组或任务已更新，请读取原操作状态后继续');
      const exact=task.version===command.taskVersion&&row.revision===command.expectedRevision;
      // Starting/checkpointing this generation must not invalidate its original
      // cancellation intent. A later control or a newer generation still fences it.
      const progressOnly=action==='cancel'&&command.taskVersion<=task.version&&command.expectedRevision<=row.revision&&
        ['queued','generating'].includes(row.status)&&['queued','running','retry_wait'].includes(task.state)&&
        !row.commands.some(item=>item.effectiveRevision>command.expectedRevision&&['cancel','retry'].includes(item.kind));
      if(!exact&&!progressOnly)throw new ConflictException('题组或任务已更新，请读取原操作状态后继续');
      if(['ready','published','superseded','withdrawn'].includes(row.status))throw new ConflictException('候选已完成生成，请在审阅流程中处理');
      if(action==='cancel'&&(row.status==='cancel_requested'||task.state==='cancel_requested'))throw new ConflictException('原任务正在取消，请查看原操作状态');
      reconcileSourceCheck(row,task);
      if(action==='retry'){
        if(!['failed','cancelled'].includes(task.state))throw new ConflictException('原任务还未结束');
        const prepared=prepareSourceCourseCheck(course,{modelId:row.prepared.modelId,lessonIds:row.prepared.targets.map(target=>target.lessonId)});if(prepared.inputFingerprint!==row.prepared.inputFingerprint)throw new ConflictException('原课程已变化，请准备新的核查定义');
        row.authorization=captureSourceCheckAuthorization(this.store,this.students,user,course,session);row.status='queued';
      }else{if(!active.has(task.state))throw new ConflictException('原任务已经结束');row.status=task.state==='running'||task.state==='cancel_requested'?'cancel_requested':'cancelled';}
      await this.store.controlTask({id:task.id,action,expectedVersion:task.version,actorId:user.id});row.revision++;row.updatedAt=new Date().toISOString();const receipt={key:command.requestKey,kind:action,hash,effectiveRevision:row.revision,at:row.updatedAt,actorUserId:user.id};row.commands.push(receipt);
      const provisional={...task,state:action==='retry'?'queued':row.status==='cancelled'?'cancelled':'cancel_requested',generation:task.generation+(action==='retry'?1:0),version:task.version+1,errorCode:null} as TaskRow;
      return this.view(row,provisional,receipt);
    });
  }
  private prior(row:SourceCourseCheckRecord,key:string,kind:string,hash:string){const prior=row.commands.find(command=>command.key===key);if(prior&&(prior.kind!==kind||prior.hash!==hash))throw new ConflictException('原请求标识已用于其他操作');return prior;}
  private confirmCurrent(course:ReturnType<typeof sourceCheckCourse>,row:SourceCourseCheckRecord,user:InMemoryUserAccount,session:InMemoryAuthSession){
    captureSourceCheckAuthorization(this.store,this.students,user,course,session);try{assertSourceCheckInputCurrent(course,row);}catch{throw new ConflictException('原课程或来源已变化，请保留旧稿并准备当前版本');}
  }
  private command(row:SourceCourseCheckRecord,user:InMemoryUserAccount,key:string,kind:string,hash:string,detail:Partial<SourceCourseCheckRecord['commands'][number]>={}){
    row.revision++;row.updatedAt=new Date().toISOString();const receipt={key,kind,hash,effectiveRevision:row.revision,at:row.updatedAt,actorUserId:user.id,...detail};row.commands.push(receipt);return receipt;
  }
  private expose(row:SourceCourseCheckRecord,user:InMemoryUserAccount,fingerprint:string){row.authoringExposures??=[];if(!row.authoringExposures.some(value=>value.actorId===user.id&&value.contentFingerprint===fingerprint))row.authoringExposures.push({actorId:user.id,contentFingerprint:fingerprint,at:new Date().toISOString()});}
  private async authoringView(row:SourceCourseCheckRecord,receipt:SourceCourseCheckRecord['commands'][number]):Promise<SourceCourseCheckAuthoring>{
    const fingerprint=receipt.contentFingerprint,version=receipt.contentVersion;if(!fingerprint||version===undefined)throw new ConflictException('旧审阅回执缺少内容版本，请重新发起审阅');
    const content=row.contentFingerprint===fingerprint&&(row.contentVersion??1)===version?row.content:row.contentHistory?.find(item=>item.contentFingerprint===fingerprint&&item.contentVersion===version)?.content;
    if(!content||sourceCheckDigest(content)!==fingerprint)throw new ConflictException('原审阅版本不可用，请保留本机副本后重新读取');
    return{view:await this.view(row,undefined,receipt),content:structuredClone(content),sources:structuredClone(row.prepared.sources),contentFingerprint:fingerprint,contentVersion:version,historical:fingerprint!==row.contentFingerprint||version!==(row.contentVersion??1),originalContent:row.originalContent?structuredClone(row.originalContent):null,
      review:row.modelReview?{decision:row.modelReview.decision,issues:structuredClone(row.modelReview.issues),modelId:row.modelReview.modelId,at:row.modelReview.at,current:row.modelReview.outputFingerprint===fingerprint}:null};
  }
  async authoring(user:InMemoryUserAccount,courseId:string,id:string,input:unknown,session:InMemoryAuthSession){
    const command=validate(z.object({expectedRevision:revision,contentFingerprint:z.string().min(1).max(200),requestKey:key}).strict(),input),hash=sourceCheckDigest({...command,requestKey:undefined});
    return this.store.transaction(async()=>{const {course,row}=this.record(user,courseId,id);captureSourceCheckAuthorization(this.store,this.students,user,course,session);const prior=this.prior(row,command.requestKey,'authoring',hash);if(prior)return this.authoringView(row,prior);
      if(row.revision!==command.expectedRevision||row.contentFingerprint!==command.contentFingerprint||!row.content||!['ready','published','superseded','withdrawn'].includes(row.status))throw new ConflictException('候选或审阅版本已变化，请先读取状态');
      this.expose(row,user,command.contentFingerprint);const receipt=this.command(row,user,command.requestKey,'authoring',hash,{contentFingerprint:command.contentFingerprint,contentVersion:row.contentVersion??1});return this.authoringView(row,receipt);
    });
  }
  async edit(user:InMemoryUserAccount,courseId:string,id:string,input:unknown,session:InMemoryAuthSession){
    const command=validate(z.object({expectedRevision:revision,contentFingerprint:z.string().min(1).max(200),content:sourceCourseCheckContentSchema,requestKey:key}).strict(),input),hash=sourceCheckDigest({...command,requestKey:undefined});
    return this.store.transaction(async()=>{const {course,row}=this.record(user,courseId,id),prior=this.prior(row,command.requestKey,'edit',hash);if(prior)return this.view(row,undefined,prior);this.confirmCurrent(course,row,user,session);
      if(row.status!=='ready'||row.revision!==command.expectedRevision||row.contentFingerprint!==command.contentFingerprint||!row.content)throw new ConflictException('只能编辑当前未发布候选，请先比较最新版本');
      let content;try{content=validateSourceCourseCheck(row.prepared,command.content);}catch{throw new BadRequestException('题目未满足目标、来源或完整答案结构，请核对后再保存');}const fingerprint=sourceCheckDigest(content);
      if(fingerprint!==row.contentFingerprint){row.contentHistory??=[];row.contentHistory.push({contentVersion:row.contentVersion??1,contentFingerprint:row.contentFingerprint,content:structuredClone(row.content),at:row.contentUpdatedAt??null,actorId:row.contentActorId??null,...(row.contentActorId===null?{modelId:row.prepared.modelId}:{})});row.contentVersion=(row.contentVersion??1)+1;row.content=structuredClone(content);row.contentFingerprint=fingerprint;row.contentUpdatedAt=new Date().toISOString();row.contentActorId=user.id;}
      this.expose(row,user,fingerprint);const receipt=this.command(row,user,command.requestKey,'edit',hash,{contentFingerprint:fingerprint,contentVersion:row.contentVersion??1});return this.view(row,undefined,receipt);
    });
  }
  async publish(user:InMemoryUserAccount,courseId:string,id:string,input:unknown,session:InMemoryAuthSession){
    const command=validate(z.object({expectedRevision:revision,contentFingerprint:z.string().min(1).max(200),publicationRevision:revision,acknowledgeGeneratedContent:z.literal(true),acknowledgeReviewWarnings:z.boolean().default(false),requestKey:key}).strict(),input),hash=sourceCheckDigest({...command,requestKey:undefined});
    return this.store.transaction(async()=>{const {course,row}=this.record(user,courseId,id),prior=this.prior(row,command.requestKey,'confirm',hash);if(prior)return this.view(row,undefined,prior);this.confirmCurrent(course,row,user,session);
      if(row.status!=='ready'||row.revision!==command.expectedRevision||row.contentFingerprint!==command.contentFingerprint||!row.content||row.generationStage!=='completed')throw new ConflictException('只能确认当前已完成的候选版本');
      const task=await this.store.tasks.get(row.taskId);if(task?.state!=='succeeded'||task.ownerUserId!==user.id||task.kind!==sourceCheckTaskKind)throw new ConflictException('原生成任务尚未完成');
      validateSourceCourseCheck(row.prepared,row.content);const warning=!row.modelReview||row.modelReview.decision==='uncertain'||row.modelReview.outputFingerprint!==row.contentFingerprint;if(warning&&!command.acknowledgeReviewWarnings)throw new BadRequestException('仍有待核查问题，请明确选择是否用于练习');
      const pointer=this.store.find('sourceCourseCheckPublications',{id:courseId});if((pointer?.revision??0)!==command.publicationRevision)throw new ConflictException('当前题组已更新，请读取发布版本后重新确认');
      if(pointer?.checkId){const old=this.store.find('sourceCourseChecks',{id:pointer.checkId,courseId,status:'published'});if(!old)throw new ConflictException('当前发布记录缺失，请先核对原版本');old.status='superseded';old.revision++;old.updatedAt=new Date().toISOString();}
      const now=new Date().toISOString(),nextRevision=(pointer?.revision??0)+1;if(pointer){pointer.checkId=row.id;pointer.definitionFingerprint=row.contentFingerprint;pointer.revision=nextRevision;pointer.updatedAt=now;}else this.store.append('sourceCourseCheckPublications',{id:courseId,courseId,ownerUserId:user.id,studentId:row.studentId,checkId:row.id,definitionFingerprint:row.contentFingerprint,revision:nextRevision,updatedAt:now});
      row.status='published';row.publishedAt=now;const receipt=this.command(row,user,command.requestKey,'confirm',hash,{contentFingerprint:row.contentFingerprint,contentVersion:row.contentVersion??1,publicationRevision:nextRevision});return this.view(row,undefined,receipt);
    });
  }
  async withdraw(user:InMemoryUserAccount,courseId:string,id:string,input:unknown,session:InMemoryAuthSession){
    const command=validate(z.object({expectedRevision:revision,contentFingerprint:z.string().min(1).max(200),publicationRevision:revision,requestKey:key}).strict(),input),hash=sourceCheckDigest({...command,requestKey:undefined});
    return this.store.transaction(async()=>{const {course,row}=this.record(user,courseId,id),prior=this.prior(row,command.requestKey,'withdraw',hash);if(prior)return this.view(row,undefined,prior);captureSourceCheckAuthorization(this.store,this.students,user,course,session);
      const pointer=this.store.find('sourceCourseCheckPublications',{id:courseId});if(row.status!=='published'||row.revision!==command.expectedRevision||row.contentFingerprint!==command.contentFingerprint||!pointer||pointer.checkId!==row.id||pointer.revision!==command.publicationRevision)throw new ConflictException('当前发布版本已变化，请先读取原操作状态');
      const now=new Date().toISOString();pointer.checkId=null;pointer.definitionFingerprint=null;pointer.revision++;pointer.updatedAt=now;row.status='withdrawn';row.withdrawnAt=now;const receipt=this.command(row,user,command.requestKey,'withdraw',hash,{contentFingerprint:command.contentFingerprint,contentVersion:row.contentVersion??1,publicationRevision:pointer.revision});return this.view(row,undefined,receipt);
    });
  }
}
