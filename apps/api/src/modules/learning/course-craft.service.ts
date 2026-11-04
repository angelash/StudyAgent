import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { courseCraftStartSchema, courseCraftAnswerSchema, courseCraftControlSchema, type CourseCraftView } from '@study-agent/contracts';
import { InMemoryStoreService, type InMemoryUserAccount, type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { validate } from '../../common/validation';
import { captureWhiteboardActorAuthorization } from './topic-whiteboard-access';
import { generationDigest, newCourseGeneration } from './source-course-pipeline';
import { sourceDigest, type SourceCourseRecord } from './source-course-content';
import { materialVersion } from './source-course-selection';
import { craftTaskKind, courseCraftPublic, type CourseCraftRecord } from './course-craft-record';

export function craftAuthority(store:InMemoryStoreService,students:StudentsService,row:CourseCraftRecord) {
  const user=store.find('users',{id:row.ownerUserId,status:'active',role:row.authorization.role}),session=store.find('sessions',{userId:row.ownerUserId,tokenHash:row.authorization.sessionTokenHash});
  if(!user||!session||generationDigest(captureWhiteboardActorAuthorization(store,students,user,row.studentId,session))!==generationDigest(row.authorization))throw new ForbiddenException('原课程生成授权已变化，请重新登录后明确重试。');
  if(user.role==='student'&&row.studentId&&store.find('diagnosticSessions',{studentId:row.studentId,status:['in_progress','paused']}))throw new ConflictException('请先完成当前评测，再继续生成课程。');
  return user;
}
@Injectable()
export class CourseCraftService {
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly chat:XiaojiuChatService,private readonly models:XiaojiuModelsService){}
  private record(user:InMemoryUserAccount,id:string){const row=this.store.find('courseCraftRuns',{id,ownerUserId:user.id});if(!row)throw new NotFoundException('这次课程生成不存在或无法访问');if(row.studentId)this.students.assertCanAccessStudent(user,row.studentId);return row;}
  private async view(row:CourseCraftRecord):Promise<CourseCraftView>{const result=courseCraftPublic(row),task=await this.store.tasks.get(row.taskId);
    if(!['building','completed','cancelled'].includes(row.status)&&task&&['failed','cancelled'].includes(task.state)) {result.status=task.state==='failed'?'failed':'cancelled';result.error=task.state==='failed'?'这次生成未完成，已保存来源和进度。可以重试。':null;}
    if(row.courseId){const course=this.store.find('sourceCourses',{id:row.courseId,ownerUserId:row.ownerUserId});if(course){const work=course.taskId?await this.store.tasks.get(course.taskId):null;result.status=['ready','active','archived'].includes(course.status)?'completed':course.status==='cancelled'||work?.state==='cancelled'?'cancelled':work?.state==='failed'?'failed':'building';if(course.craft&&!course.craft.outlineConfirmed&&course.generation?.outline&&result.status!=='cancelled'&&result.status!=='failed'){result.status='awaiting_blueprint';result.blueprint={...course.generation.outline,fingerprint:generationDigest(course.generation.outline),lessons:course.generation.outline.lessons.map(({title,objective})=>({title,objective}))};}if(result.status==='failed')result.error='课程编写暂未完成，已写课时保留。可以从断点重试。';}}
    return result;}
  async list(user:InMemoryUserAccount){return Promise.all(this.store.select('courseCraftRuns',{ownerUserId:user.id}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,30).map(row=>this.view(row)));}
  async get(user:InMemoryUserAccount,id:string){return this.view(this.record(user,id));}
  async start(user:InMemoryUserAccount,input:unknown,session:InMemoryAuthSession){const command=validate(courseCraftStartSchema,input),hash=generationDigest({...command,requestKey:undefined});
    return this.store.transaction(async()=>{const previous=this.store.find('courseCraftRuns',{ownerUserId:user.id,requestKey:command.requestKey});if(previous){this.record(user,previous.id);if(previous.requestHash!==hash)throw new ConflictException('这个请求已用于其他主题或模型');return this.view(previous);}
      if(!this.chat.enabled)throw new ServiceUnavailableException('请先连接小九AI模型后再生成课程。');
      const model=this.models.resolve(command.modelId),authorization=captureWhiteboardActorAuthorization(this.store,this.students,user,command.studentId??null,session),now=new Date().toISOString();
      if(user.role==='student'&&command.studentId&&this.store.find('diagnosticSessions',{studentId:command.studentId,status:['in_progress','paused']}))throw new ConflictException('请先完成当前评测，再生成课程。');
      const row:CourseCraftRecord={id:this.store.nextId('course_craft'),ownerUserId:user.id,studentId:command.studentId??null,subject:command.subject??null,prompt:command.prompt,modelId:model.id,modelName:model.label,
        requestKey:command.requestKey,requestHash:hash,authorization,revision:0,taskId:this.store.nextId('task'),status:'queued',title:null,overview:null,sources:[],questions:[],answers:null,scale:null,courseId:null,createdAt:now,updatedAt:now,commands:[]};
      this.store.append('courseCraftRuns',row);await this.store.enqueueTask({id:row.taskId,kind:craftTaskKind,ownerUserId:user.id,requestKey:'craft:'+row.id,payloadHash:hash,payload:{runId:row.id},createdAt:now,maxAttempts:2});return this.view(row);
    });}
  async answer(user:InMemoryUserAccount,id:string,input:unknown,session:InMemoryAuthSession){const command=validate(courseCraftAnswerSchema,input),hash=generationDigest({...command,requestKey:undefined});
    return this.store.transaction(async()=>{const row=this.record(user,id),previous=row.commands.find(v=>v.key===command.requestKey);if(previous){if(previous.hash!==hash||previous.kind!=='answer')throw new ConflictException('原回答请求已用于其他内容');return this.view(row);}
      row.authorization=captureWhiteboardActorAuthorization(this.store,this.students,user,row.studentId,session);craftAuthority(this.store,this.students,row);if(row.revision!==command.expectedRevision||row.status!=='awaiting_answers'||row.courseId)throw new ConflictException('当前问题已更新，请读取原任务后继续');
      if(new Set(command.answers.map(a=>a.questionId)).size!==row.questions.length||command.answers.length!==row.questions.length)throw new BadRequestException('请回答或跳过每个问题');
      for(const answer of command.answers){const question=row.questions.find(q=>q.id===answer.questionId);if(!question||answer.selected.some(id=>!question.options.some(o=>o.id===id))||new Set(answer.selected).size!==answer.selected.length||question.kind==='single'&&answer.selected.length>1||question.kind==='text'&&answer.selected.length||answer.skipped&&(answer.selected.length||answer.text)||!answer.skipped&&!answer.selected.length&&!answer.text)throw new BadRequestException('请核对回答选项，或明确跳过该问题');}
      row.authorization=captureWhiteboardActorAuthorization(this.store,this.students,user,row.studentId,session);row.answers=structuredClone(command.answers);row.scale=command.scale;
      const now=new Date().toISOString(),minutes=15,goal=(row.overview??row.prompt).slice(0,1000),maxLessons={brief:20,standard:50,deep:60}[command.scale];
      // Snapshots contain actual search excerpts, explicitly labelled; no invented textbook pages.
      const materialId=this.store.nextId('source_text'),pages=row.sources.map((source,index)=>({page:index+1,text:source.content})),material={id:materialId,ownerUserId:user.id,studentId:row.studentId,subject:row.subject,kind:'text' as const,title:(row.title??row.prompt).slice(0,180)+' · 网络检索摘要',filename:'research-excerpts.txt',sha256:sourceDigest(pages),byteSize:Buffer.byteLength(JSON.stringify(pages)),pageCount:pages.length,pages,status:'ready' as const,hasPageImages:false,createdAt:now,updatedAt:now};
      this.store.append('studioSourceMaterials',material);const version=materialVersion(material);
      const course:SourceCourseRecord={id:this.store.nextId('source_course'),ownerUserId:user.id,studentId:row.studentId,subject:row.subject,audience:'按用户主题指定的学习者；档案年级与课程年级分开',targetGoals:[],
        input:{title:(row.title??row.prompt).slice(0,180),goal,language:'zh-CN',minutesPerSession:minutes,modelId:row.modelId,targetAtomIds:[]},
        sources:row.sources.map((source,index)=>({key:'src-1-'+(index+1),materialId,page:index+1,title:source.title+'（检索摘要）',kind:'text',text:source.content,blocks:[],sha256:material.sha256,version,fingerprint:sourceDigest(pages[index]),structureReviewRequired:false})),
        craft:{runId:row.id,maxLessons,authorization:structuredClone(row.authorization),prompt:row.prompt,answers:structuredClone(command.answers),questions:structuredClone(row.questions),scale:command.scale,sources:structuredClone(row.sources)},
        revision:0,status:'queued',taskId:this.store.nextId('task'),result:null,originalResult:null,edits:[],fingerprint:null,modelName:row.modelName,confirmedAt:null,createdAt:now,updatedAt:now,requests:[]};
      course.generation=newCourseGeneration(course,'creation');this.store.append('sourceCourses',course);await this.store.enqueueTask({id:course.taskId!,kind:'learning.source-course.generate',ownerUserId:user.id,requestKey:'craft-course:'+row.id,payloadHash:sourceDigest({courseId:course.id}),payload:{courseId:course.id},createdAt:now,maxAttempts:2});
      row.courseId=course.id;row.status='building';row.revision++;row.updatedAt=now;row.commands.push({key:command.requestKey,hash,kind:'answer'});return this.view(row);
    });}
  async reviseOutline(user:InMemoryUserAccount,id:string,input:unknown,session:InMemoryAuthSession){const command=validate(z.object({expectedRevision:z.number().int().nonnegative(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),instruction:z.string().trim().min(3).max(1000),requestKey:z.string().min(8).max(180)}).strict(),input),hash=generationDigest({...command,requestKey:undefined});
    return this.store.transaction(async()=>{const row=this.record(user,id),previous=row.commands.find(v=>v.key===command.requestKey);if(previous){if(previous.kind!=='revise-outline'||previous.hash!==hash)throw new ConflictException('原调整请求已用于其他内容');return this.view(row);}
      row.authorization=captureWhiteboardActorAuthorization(this.store,this.students,user,row.studentId,session);craftAuthority(this.store,this.students,row);const course=row.courseId?this.store.find('sourceCourses',{id:row.courseId,ownerUserId:user.id}):null;
      if(row.revision!==command.expectedRevision||!course?.craft||course.status==='cancelled'||course.craft.outlineConfirmed||!course.generation?.outline||generationDigest(course.generation.outline)!==command.fingerprint)throw new ConflictException('蓝图已更新，请重新读取');
      const old=course.taskId?await this.store.tasks.get(course.taskId):null;if(old?.state!=='succeeded')throw new ConflictException('请等待当前蓝图保存完成');
      if((course.craft.adjustments?.length??0)>=5)throw new BadRequestException('本次已调整五轮，请明确另开学习主题以保留完整调整记录。');
      course.edits.push({at:new Date().toISOString(),changes:{kind:'craft-outline',outline:structuredClone(course.generation.outline),instruction:command.instruction}});
      course.craft.adjustments=[...(course.craft.adjustments??[]),command.instruction];course.craft.authorization=structuredClone(row.authorization);course.generation=newCourseGeneration(course,'creation');course.taskId=this.store.nextId('task');course.status='queued';const now=new Date().toISOString();
      await this.store.enqueueTask({id:course.taskId,kind:'learning.source-course.generate',ownerUserId:user.id,requestKey:'craft-outline:'+row.id+':'+course.craft.adjustments.length,payloadHash:sourceDigest({courseId:course.id}),payload:{courseId:course.id},createdAt:now,maxAttempts:2});row.revision++;row.status='building';row.updatedAt=now;row.commands.push({key:command.requestKey,hash,kind:'revise-outline'});return this.view(row);
    });}
  async confirmOutline(user:InMemoryUserAccount,id:string,input:unknown,session:InMemoryAuthSession){const command=validate(z.object({expectedRevision:z.number().int().nonnegative(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),requestKey:z.string().min(8).max(180)}).strict(),input),hash=generationDigest({...command,requestKey:undefined});
    return this.store.transaction(async()=>{const row=this.record(user,id),previous=row.commands.find(v=>v.key===command.requestKey);if(previous){if(previous.kind!=='outline'||previous.hash!==hash)throw new ConflictException('原确认请求已用于其他操作');return this.view(row);}
      row.authorization=captureWhiteboardActorAuthorization(this.store,this.students,user,row.studentId,session);craftAuthority(this.store,this.students,row);const course=row.courseId?this.store.find('sourceCourses',{id:row.courseId,ownerUserId:user.id}):null;
      if(row.revision!==command.expectedRevision||!course?.craft||course.status==='cancelled'||course.craft.outlineConfirmed||!course.generation?.outline||generationDigest(course.generation.outline)!==command.fingerprint)throw new ConflictException('课程蓝图已更新，请重新读取后确认');
      const task=course.taskId?await this.store.tasks.get(course.taskId):null;if(task?.state!=='succeeded')throw new ConflictException('请等待蓝图保存完成');
      course.craft.outlineConfirmed=true;course.craft.authorization=structuredClone(row.authorization);course.taskId=this.store.nextId('task');course.status='queued';const now=new Date().toISOString();
      await this.store.enqueueTask({id:course.taskId,kind:'learning.source-course.generate',ownerUserId:user.id,requestKey:'craft-details:'+row.id,payloadHash:sourceDigest({courseId:course.id}),payload:{courseId:course.id},createdAt:now,maxAttempts:2});
      row.revision++;row.status='building';row.updatedAt=now;row.commands.push({key:command.requestKey,hash,kind:'outline'});return this.view(row);
    });}
  async control(user:InMemoryUserAccount,id:string,action:'cancel'|'retry',input:unknown,session:InMemoryAuthSession){const command=validate(courseCraftControlSchema,input),hash=generationDigest({...command,requestKey:undefined});
    return this.store.transaction(async()=>{const row=this.record(user,id),previous=row.commands.find(v=>v.key===command.requestKey);if(previous){if(previous.kind!==action||previous.hash!==hash)throw new ConflictException('原请求不能用于不同操作');return this.view(row);}if(row.revision!==command.expectedRevision)throw new ConflictException('任务已更新，请刷新');
      const course=row.courseId?this.store.find('sourceCourses',{id:row.courseId,ownerUserId:user.id}):null,task=await this.store.tasks.get(course?.taskId??row.taskId);if(!task)throw new ConflictException('原任务不可用');
      if(action==='retry'){if(task.state==='succeeded'&&course?.status==='cancelled'&&course.craft&&!course.craft.outlineConfirmed){row.authorization=captureWhiteboardActorAuthorization(this.store,this.students,user,row.studentId,session);craftAuthority(this.store,this.students,row);course.status='queued';course.craft.authorization=structuredClone(row.authorization);row.status='building';row.revision++;row.updatedAt=new Date().toISOString();row.commands.push({key:command.requestKey,hash,kind:action});return this.view(row);}
        if(!['failed','cancelled'].includes(task.state))throw new ConflictException('只有失败或取消的任务可以重试');if(!this.chat.enabled)throw new ServiceUnavailableException('请先连接模型');row.authorization=captureWhiteboardActorAuthorization(this.store,this.students,user,row.studentId,session);if(course?.craft){course.craft.authorization=structuredClone(row.authorization);course.status='queued';}row.status=course?'building':'queued';}
      else{if(course&&['ready','active','archived'].includes(course.status))throw new ConflictException('课程已完成，请打开结果');if(['queued','running','retry_wait','cancel_requested'].includes(task.state))await this.store.controlTask({id:task.id,action,expectedVersion:task.version,actorId:user.id});if(course)course.status='cancelled';row.status='cancelled';}
      if(action==='retry'){craftAuthority(this.store,this.students,row);}
      if(action==='retry')await this.store.controlTask({id:task.id,action,expectedVersion:task.version,actorId:user.id});row.revision++;row.updatedAt=new Date().toISOString();row.commands.push({key:command.requestKey,hash,kind:action});return this.view(row);
    });}
}
