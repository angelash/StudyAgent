import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import type { SourceCourseCheckView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import type { TaskRow } from '../../infrastructure/task-repository';
import { StudentsService } from '../students/students.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { sourceCheckCourse,captureSourceCheckAuthorization } from './source-course-check-access';
import { prepareSourceCourseCheck,sourceCheckDigest,SOURCE_CHECK_CONTEXT_LIMIT } from './source-course-check-content';
import type { SourceCourseCheckRecord } from './source-course-check-record';

export const sourceCheckTaskKind='learning.source-check.generate';
const key=z.string().min(8).max(180),revision=z.number().int().min(0);
const selection={modelId:z.string().trim().min(1).max(120).default('auto'),lessonIds:z.array(z.string().min(1).max(400)).min(2).max(6)};
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
  private record(user:InMemoryUserAccount,courseId:string,id:string){
    const course=sourceCheckCourse(this.store,this.students,user,courseId),row=this.store.find('sourceCourseChecks',{id,courseId,ownerUserId:user.id});
    if(!row)throw new NotFoundException('核查题组候选不存在');return{course,row};
  }
  async view(row:SourceCourseCheckRecord,taskOverride?:TaskRow,receipt?:SourceCourseCheckRecord['commands'][number]):Promise<SourceCourseCheckView>{
    const task=taskOverride??await this.store.tasks.get(row.taskId),status=['published','superseded','withdrawn','ready'].includes(row.status)?row.status:task?.state==='failed'?'failed':task?.state==='cancelled'?'cancelled':task?.state==='cancel_requested'?'cancelling':row.status==='cancel_requested'?'cancelling':row.status;
    return{id:row.id,courseId:row.courseId,revision:row.revision,courseCurrent:this.store.find('sourceCourses',{id:row.courseId})?.fingerprint===row.courseFingerprint,
      status:status as SourceCourseCheckView['status'],title:row.content?.title??null,modelId:row.prepared.modelId,modelName:row.modelName??row.prepared.modelId,
      questionCount:row.content?.questions.length??0,contentFingerprint:row.contentFingerprint??null,targets:row.prepared.targets.map(({lessonId,title,objective})=>({lessonId,title,objective})),stage:row.generationStage??'writing',
      review:row.modelReview?{decision:row.modelReview.decision,issueCount:row.modelReview.issues.length,current:row.modelReview.outputFingerprint===row.contentFingerprint}:null,
      task:task?{id:task.id,state:task.state,generation:task.generation,version:task.version,errorCode:task.errorCode}:null,createdAt:row.createdAt,updatedAt:row.updatedAt,
      ...(receipt?.actorUserId?{receipt:{key:receipt.key,kind:receipt.kind,actorUserId:receipt.actorUserId,effectiveRevision:receipt.effectiveRevision,at:receipt.at}}:{})};
  }
  async list(user:InMemoryUserAccount,courseId:string){sourceCheckCourse(this.store,this.students,user,courseId);return Promise.all(this.store.select('sourceCourseChecks',{courseId,ownerUserId:user.id}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(row=>this.view(row)));}
  async get(user:InMemoryUserAccount,courseId:string,id:string){return this.view(this.record(user,courseId,id).row);}
  async receipt(user:InMemoryUserAccount,courseId:string,id:string,requestKey:string){const {row}=this.record(user,courseId,id),receipt=row.commands.find(command=>command.key===requestKey);if(!receipt)throw new NotFoundException('原操作回执不存在');return this.view(row,undefined,receipt);}
  preflight(user:InMemoryUserAccount,courseId:string,input:unknown){
    const course=sourceCheckCourse(this.store,this.students,user,courseId),command=validate(z.object(selection).strict(),input),model=this.models.resolve(command.modelId);
    try{const prepared=prepareSourceCourseCheck(course,{...command,modelId:model.id});return{valid:true,available:this.chat.enabled,courseRevision:course.revision,courseFingerprint:course.fingerprint,modelId:model.id,modelName:model.label,contextCharacters:prepared.contextCharacters,maxContextCharacters:SOURCE_CHECK_CONTEXT_LIMIT,targets:prepared.targets.map(({lessonId,title,objective})=>({lessonId,title,objective})),errorCode:null};}
    catch(error){return{valid:false,available:this.chat.enabled,courseRevision:course.revision,courseFingerprint:course.fingerprint,modelId:model.id,modelName:model.label,contextCharacters:null,maxContextCharacters:SOURCE_CHECK_CONTEXT_LIMIT,targets:[],errorCode:error instanceof Error&&error.message.startsWith('source_check_')?error.message:'source_check_selection_invalid'};}
  }
  async prepare(user:InMemoryUserAccount,courseId:string,input:unknown,session:InMemoryAuthSession){
    const command=validate(prepareSchema,input),hash=sourceCheckDigest({courseId,...command,requestKey:undefined});
    return this.store.transaction(async()=>{
      const course=sourceCheckCourse(this.store,this.students,user,courseId),previous=this.store.find('sourceCourseChecks',{ownerUserId:user.id,requestKey:command.requestKey});
      if(previous){if(previous.courseId!==courseId||previous.requestHash!==hash)throw new ConflictException('原请求已用于其他核查题组');return this.view(previous);}
      if(course.revision!==command.expectedRevision||course.fingerprint!==command.courseFingerprint)throw new ConflictException('课程内容已更新，请重新读取目标');
      const model=this.models.resolve(command.modelId);if(!this.chat.enabled)throw new ServiceUnavailableException('小九AI当前未启用，请先连接模型再准备核查');
      let prepared;try{prepared=prepareSourceCourseCheck(course,{modelId:model.id,lessonIds:command.lessonIds});}catch{throw new BadRequestException('所选目标或来源不满足独立核查条件，请先查看准备预览');}
      const authorization=captureSourceCheckAuthorization(this.store,this.students,user,course,session);
      for(const row of this.store.select('sourceCourseChecks',{ownerUserId:user.id,courseId})){const task=await this.store.tasks.get(row.taskId);reconcileSourceCheck(row,task);if(['queued','generating','cancel_requested'].includes(row.status)||task&&active.has(task.state))throw new ConflictException('这门课程已有出题任务，请先查看或结束原任务');}
      const now=new Date().toISOString(),row:SourceCourseCheckRecord={id:this.store.nextId('source_check'),ownerUserId:user.id,studentId:course.studentId,courseId,courseFingerprint:command.courseFingerprint,requestKey:command.requestKey,requestHash:hash,prepared,authorization,revision:0,taskId:this.store.nextId('task'),status:'queued',generationStage:'writing',modelName:model.label,content:null,originalContent:null,contentFingerprint:null,modelReview:null,createdAt:now,updatedAt:now,publishedAt:null,withdrawnAt:null,commands:[]};
      this.store.append('sourceCourseChecks',row);await this.store.enqueueTask({id:row.taskId,kind:sourceCheckTaskKind,ownerUserId:user.id,requestKey:'source-check:'+row.id,payloadHash:hash,payload:{checkId:row.id,courseId},createdAt:now,maxAttempts:2});
      return this.view(row,{id:row.taskId,kind:sourceCheckTaskKind,ownerUserId:user.id,requestKey:'source-check:'+row.id,payloadHash:hash,payload:{checkId:row.id,courseId},createdAt:now,updatedAt:now,state:'queued',attempts:0,maxAttempts:2,generation:1,version:1,availableAt:Date.now(),leaseToken:null,leaseUntil:null,progress:{},result:null,errorCode:null});
    });
  }
  async control(user:InMemoryUserAccount,courseId:string,id:string,action:'cancel'|'retry',input:unknown,session:InMemoryAuthSession){
    const command=validate(z.object({expectedRevision:revision,generation:z.number().int().min(1),taskVersion:z.number().int().min(1),requestKey:key}).strict(),input),hash=sourceCheckDigest({action,...command,requestKey:undefined});
    return this.store.transaction(async()=>{
      const {course,row}=this.record(user,courseId,id),prior=row.commands.find(item=>item.key===command.requestKey);if(prior){if(prior.hash!==hash||prior.kind!==action)throw new ConflictException('请求标识已用于不同操作');return this.view(row,undefined,prior);}
      const task=await this.store.tasks.get(row.taskId);if(!task||task.generation!==command.generation||task.version!==command.taskVersion||row.revision!==command.expectedRevision)throw new ConflictException('题组或任务已更新，请读取原操作状态后继续');
      if(['ready','published','superseded','withdrawn'].includes(row.status))throw new ConflictException('候选已完成生成，请在审阅流程中处理');
      reconcileSourceCheck(row,task);
      if(action==='retry'){
        if(!['failed','cancelled'].includes(task.state))throw new ConflictException('原任务还未结束');
        const prepared=prepareSourceCourseCheck(course,{modelId:row.prepared.modelId,lessonIds:row.prepared.targets.map(target=>target.lessonId)});if(prepared.inputFingerprint!==row.prepared.inputFingerprint)throw new ConflictException('原课程已变化，请准备新的核查定义');
        row.authorization=captureSourceCheckAuthorization(this.store,this.students,user,course,session);row.status='queued';
      }else{if(!active.has(task.state))throw new ConflictException('原任务已经结束');row.status=task.state==='running'||task.state==='cancel_requested'?'cancel_requested':'cancelled';}
      await this.store.controlTask({id:task.id,action,expectedVersion:command.taskVersion,actorId:user.id});row.revision++;row.updatedAt=new Date().toISOString();const receipt={key:command.requestKey,kind:action,hash,effectiveRevision:row.revision,at:row.updatedAt,actorUserId:user.id};row.commands.push(receipt);
      const provisional={...task,state:action==='retry'?'queued':row.status==='cancelled'?'cancelled':'cancel_requested',generation:task.generation+(action==='retry'?1:0),version:task.version+1,errorCode:null} as TaskRow;
      return this.view(row,provisional,receipt);
    });
  }
}
