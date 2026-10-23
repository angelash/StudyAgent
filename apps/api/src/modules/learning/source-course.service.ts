import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { sourceCourseContentSchema, type SourceCourseAuthoring } from '@study-agent/contracts';
import type { CourseSourceSnapshot, SourceCourseSummary, SourceCourseView, StudioSourceMaterial } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { assertMaterialAccess, studioMaterialView } from './studio-material-access';
import { SOURCE_COURSE_PIPELINE, generationFingerprint, generationView, newCourseGeneration } from './source-course-pipeline';
import { sourceCourseLesson, checkGeneratedCourse, sourceDigest, sourceCourseModelContext, SourceCourseRecord } from './source-course-content';

const id=z.string().min(1).max(180),key=z.string().min(8).max(180),revision=z.number().int().min(0);
export function materialVersion(material:StudioSourceMaterial){return sourceDigest({sha256:material.sha256,updatedAt:material.updatedAt??material.createdAt,pages:material.pages,structure:material.structure});}
export function assertSourceCourseAccess(user:InMemoryUserAccount,row:SourceCourseRecord,students:StudentsService,editing=false){
  if(row.ownerUserId!==user.id&&(editing||!row.studentId||!['active','archived'].includes(row.status)))throw new ForbiddenException('无法访问其他账号的资料课程');
  if(row.studentId)students.assertCanAccessStudent(user,row.studentId);else if(user.role==='student')throw new ForbiddenException('请从自己的学习课程进入');
}
@Injectable()
export class SourceCourseService {
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService){}
  private record(user:InMemoryUserAccount,courseId:string,editing=false){const row=this.store.find('sourceCourses',{id:courseId});if(!row)throw new NotFoundException('资料课程不存在');assertSourceCourseAccess(user,row,this.students,editing);return row;}
  materials(user:InMemoryUserAccount,input:unknown){
    const query=validate(z.object({studentId:id.optional(),subject:z.enum(['math','chinese','english']).optional()}).strict(),input);
    if(query.studentId)this.students.assertCanAccessStudent(user,query.studentId);
    if(user.role==='student'&&!query.studentId)throw new BadRequestException('请先选择自己的学习档案');
    const rows=[...(query.studentId?this.store.select('studioSourceMaterials',{studentId:query.studentId,...(query.subject?{subject:query.subject}:{})}):[]),
      ...(user.role!=='student'?this.store.select('studioSourceMaterials',{studentId:null,ownerUserId:user.id}):[])];
    return rows
      .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(row=>({material:studioMaterialView(row),version:materialVersion(row)}));
  }
  addText(user:InMemoryUserAccount,input:unknown){
    const command=validate(z.object({title:z.string().trim().min(1).max(180),sections:z.array(z.string().trim().min(20).max(8000)).min(1).max(8),
      studentId:id.optional(),subject:z.enum(['math','chinese','english']).optional(),requestKey:key}).strict().refine(value=>Boolean(value.studentId)===Boolean(value.subject),'档案和学科需要同时选择'),input);
    if(command.studentId)this.students.assertCanAccessStudent(user,command.studentId);else if(user.role==='student')throw new ForbiddenException('请从自己的学习档案添加资料');
    const hash=sourceDigest({title:command.title,sections:command.sections,studentId:command.studentId??null,subject:command.subject??null});
    const previous=this.store.select('studioSourceMaterials',{ownerUserId:user.id}).find(row=>(row as any).requestKey===command.requestKey) as any;
    if(previous){if(previous.requestHash!==hash)throw new ConflictException('请求标识已用于不同资料');return{material:studioMaterialView(previous),version:materialVersion(previous)};}
    const now=new Date().toISOString(),row={id:this.store.nextId('source_text'),ownerUserId:user.id,kind:'text' as const,studentId:command.studentId??null,subject:command.subject??null,
      title:command.title,filename:command.title+'.txt',pageCount:command.sections.length,pages:command.sections.map((text,index)=>({page:index+1,text})),
      sha256:sourceDigest(command.sections),byteSize:Buffer.byteLength(command.sections.join('\n')),status:'ready' as const,hasPageImages:false,
      createdAt:now,updatedAt:now,requestKey:command.requestKey,requestHash:hash};
    this.store.append('studioSourceMaterials',row);return{material:studioMaterialView(row),version:materialVersion(row)};
  }
  private sourceStatus(row:SourceCourseRecord):SourceCourseView['sourceStatus']{
    let changed=false;for(const source of row.sources){const current=this.store.find('studioSourceMaterials',{id:source.materialId});if(!current)return'unavailable';if(materialVersion(current)!==source.version)changed=true;}return changed?'changed':'current';
  }
  private async view(row:SourceCourseRecord,provisional?:{state:string;version:number;generation:number;errorCode:string|null},viewerId=row.ownerUserId):Promise<SourceCourseView>{
    const task=provisional??await this.store.tasks.get(row.taskId),status=['active','archived','ready','cancelled'].includes(row.status)?row.status:
      !task?'failed':task.state==='failed'?'failed':task.state==='cancelled'||task.state==='cancel_requested'?'cancelled':task.state==='running'?'generating':row.status;
    const sessions=this.store.select('classroomSessions',{ownerUserId:viewerId,courseId:row.id}),lessons=row.result?.lessons.map((_,index)=>sourceCourseLesson(row,index)!)??[];
    const viewed=new Set(sessions.filter(session=>session.status==='completed').map(session=>session.lessonId));
    const recent=sessions.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    const next=lessons.find(lesson=>lesson.id===recent?.lessonId&&!viewed.has(lesson.id))??lessons.find(lesson=>!viewed.has(lesson.id))??lessons[0];
    return{id:row.id,studentId:row.studentId,subject:row.subject,title:row.result?.title??row.input.title,goal:row.input.goal,status:status as SourceCourseView['status'],
      lessonCount:lessons.length,viewed:lessons.filter(lesson=>viewed.has(lesson.id)).length,lastLessonId:recent?.lessonId??null,nextLessonId:next?.id??null,nextLessonTitle:next?.title??null,lastStudied:recent?.updatedAt??null,
      revision:row.revision,generation:generationView(row),generationInput:viewerId===row.ownerUserId?structuredClone(row.generation?.input??null):null,overview:row.result?.overview??null,input:structuredClone(row.input),sources:structuredClone(row.sources),permissions:{manage:viewerId===row.ownerUserId},contentReview:'pending',formalMeasurementEligible:false,
      sourceStatus:this.sourceStatus(row),fingerprint:row.fingerprint,modelName:row.modelName,lessons,
      task:task?{id:row.taskId,state:task.state,version:task.version,generation:task.generation,errorCode:task.errorCode}:null,
      confirmedAt:row.confirmedAt,createdAt:row.createdAt,updatedAt:row.updatedAt};
  }
  async get(user:InMemoryUserAccount,courseId:string){return this.view(this.record(user,courseId),undefined,user.id);}
  async list(user:InMemoryUserAccount,input:unknown):Promise<SourceCourseSummary[]>{
    const query=validate(z.object({studentId:id.optional(),subject:z.enum(['math','chinese','english']).optional()}).strict(),input);
    if(query.studentId)this.students.assertCanAccessStudent(user,query.studentId);
    const candidates=[...(query.studentId?this.store.select('sourceCourses',{studentId:query.studentId}):[]),...(user.role!=='student'?this.store.select('sourceCourses',{ownerUserId:user.id,studentId:null}):[])];
    const rows=[...new Map(candidates.map(row=>[row.id,row])).values()].filter(row=>query.studentId?row.studentId===query.studentId&&(!query.subject||row.subject===query.subject)||user.role!=='student'&&!row.studentId:!row.studentId&&user.role!=='student')
      .filter(row=>row.ownerUserId===user.id||['active','archived'].includes(row.status))
      .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    const output:SourceCourseSummary[]=[];for(const row of rows){assertSourceCourseAccess(user,row,this.students);const {revision:_r,generation:_generation,generationInput:_generationInput,overview:_overview,input:_i,sources:_s,lessons:_l,permissions:_p,contentReview:_c,formalMeasurementEligible:_f,sourceStatus:_ss,fingerprint:_fp,modelName:_m,task:_t,confirmedAt:_ct,...summary}=await this.view(row,undefined,user.id);output.push(summary);}return output;
  }
  async create(user:InMemoryUserAccount,input:unknown){
    const command=validate(z.object({title:z.string().trim().min(1).max(180),goal:z.string().trim().min(5).max(1000),language:z.enum(['source','zh-CN','en']),minutesPerSession:z.number().int().min(5).max(60),
      modelId:z.string().min(1).max(180).default('auto'),targetAtomIds:z.array(id).max(30).default([]),studentId:id.optional(),subject:z.enum(['math','chinese','english']).optional(),
      selections:z.array(z.object({materialId:id,version:z.string().regex(/^[a-f0-9]{64}$/),pages:z.array(z.number().int().min(1).max(30)).min(1).max(10)}).strict()).min(1).max(5),requestKey:key
    }).strict().refine(value=>Boolean(value.studentId)===Boolean(value.subject),'档案和学科需要同时选择'),input);
    const {requestKey,...body}=command,hash=sourceDigest(body),previous=this.store.select('sourceCourses',{ownerUserId:user.id}).find(row=>row.requests.some(request=>request.key===requestKey));
    if(previous){assertSourceCourseAccess(user,previous,this.students);const request=previous.requests.find(request=>request.key===requestKey)!;if(request.hash!==hash||request.kind!=='generate')throw new ConflictException('生成标识已用于其他内容');return this.view(previous);}
    if(command.studentId){this.students.assertCanAccessStudent(user,command.studentId);if(!this.store.find('students',{id:command.studentId}))throw new NotFoundException('学习档案不存在');}else if(user.role==='student')throw new ForbiddenException('请从自己的学习档案生成课程');
    if(command.targetAtomIds.length){const scope=command.studentId&&this.store.find('learningScopes',{studentId:command.studentId,subject:command.subject});if(!scope||command.targetAtomIds.some(atomId=>!scope.learnedAtomIds.includes(atomId)||!this.store.find('knowledgeAtoms',{id:atomId,status:'published'})))throw new BadRequestException('知识目标需要来自当前已确认范围');}
    const sources:CourseSourceSnapshot[]=[];let textLength=0;
    for(const [materialIndex,selection]of command.selections.entries()){
      const material=this.store.find('studioSourceMaterials',{id:selection.materialId});if(!material)throw new NotFoundException('来源资料不存在');assertMaterialAccess(user,material,this.students);
      if(material.studentId!==(command.studentId??null)||material.subject!==(command.subject??null))throw new BadRequestException('请只选择同一学习档案和学科的资料');
      if(!['ready','needs_review'].includes(material.status??'ready'))throw new BadRequestException('请等待资料处理完成后再选择原页');
      if(materialVersion(material)!==selection.version)throw new ConflictException('来源资料已更新，请重新核对原页');
      for(const pageNumber of selection.pages){const page=material.pages.find(page=>page.page===pageNumber);if(!page||page.text.trim().length<20)throw new BadRequestException('所选原页缺少可读正文，请先完成识别与核对');
        if(sources.some(source=>source.materialId===material.id&&source.page===pageNumber))throw new BadRequestException('来源页重复选择');
        textLength+=page.text.length;sources.push({key:`src-${materialIndex+1}-${pageNumber}`,materialId:material.id,page:pageNumber,title:material.title,kind:material.kind??'pdf',text:page.text,blocks:structuredClone(page.blocks??[]),sha256:material.sha256,version:selection.version,
          fingerprint:sourceDigest(page),structureReviewRequired:material.structure?.reviewRequired??false});
      }
    }
    if(sources.length>10||textLength>12000)throw new BadRequestException('一次生成最多选择10页或段，正文合计12000字。请缩小选择，系统不会截断资料。');
    const targetGoals=command.targetAtomIds.map(atomId=>{const atom=this.store.find('knowledgeAtoms',{id:atomId})!;return{id:atom.id,name:atom.name,objective:atom.objective,version:atom.version};});
    const now=new Date().toISOString(),row:SourceCourseRecord={id:this.store.nextId('source_course'),ownerUserId:user.id,studentId:command.studentId??null,subject:command.subject??null,
      audience:command.studentId?`${this.store.find('students',{id:command.studentId})!.grade}年级学生`:'成人自主学习',targetGoals,
      input:{title:command.title,goal:command.goal,language:command.language,minutesPerSession:command.minutesPerSession,modelId:command.modelId,targetAtomIds:command.targetAtomIds},sources,
      revision:0,status:'queued',taskId:this.store.nextId('task'),result:null,originalResult:null,edits:[],fingerprint:null,modelName:null,confirmedAt:null,createdAt:now,updatedAt:now,requests:[{key:requestKey,hash,kind:'generate'}]};
    if(sourceCourseModelContext(row).length>18000)throw new BadRequestException('所选内容含较多格式字符，超出一次可完整读取的范围，请进一步缩小选择；系统不会截断来源。');
    row.generation=newCourseGeneration(row,'creation');
    this.store.append('sourceCourses',row);await this.store.enqueueTask({id:row.taskId,kind:'learning.source-course.generate',ownerUserId:user.id,requestKey,payloadHash:sourceDigest({courseId:row.id}),payload:{courseId:row.id},createdAt:now,maxAttempts:2});
    return this.view(row,{state:'queued',version:1,generation:1,errorCode:null});
  }
  private replay(row:SourceCourseRecord,command:{expectedRevision:number;requestKey:string},kind:string){
    const {requestKey,...body}=command,previous=row.requests.find(request=>request.key===requestKey);
    if(previous){if(previous.kind!==kind||previous.hash!==sourceDigest(body))throw new ConflictException('请求标识已用于其他操作');return true;}
    if(command.expectedRevision!==row.revision)throw new ConflictException('课程已在其他页面更新，请读取已保存版本');return false;
  }
  private finish(row:SourceCourseRecord,command:{requestKey:string},kind:string){const{requestKey,...body}=command;row.requests.push({key:requestKey,hash:sourceDigest(body),kind});row.revision++;row.updatedAt=new Date().toISOString();}
  async edit(user:InMemoryUserAccount,courseId:string,input:unknown){
    const row=this.record(user,courseId,true),command=validate(z.object({expectedRevision:revision,requestKey:key,title:z.string().trim().min(1).max(180),goal:z.string().trim().min(5).max(1000),
      lessons:z.array(z.object({id, title:z.string().trim().min(1).max(100),objective:z.string().trim().min(1).max(350)}).strict()).min(1).max(6)}).strict(),input);
    if(!this.replay(row,command,'edit')){if(row.status!=='ready'||!row.result)throw new ConflictException('只有等待审阅的候选可以修改，已确认内容请重新生成新版本');
      const ids=row.result.lessons.map((_,index)=>sourceCourseLesson(row,index)!.id);if(new Set(command.lessons.map(item=>item.id)).size!==command.lessons.length||command.lessons.some(item=>!ids.includes(item.id)))throw new BadRequestException('课时标识与当前候选不一致');
      row.result={...row.result,title:command.title,lessons:command.lessons.map(edit=>({...row.result!.lessons[ids.indexOf(edit.id)],title:edit.title,objective:edit.objective}))};
      row.input.title=command.title;row.input.goal=command.goal;row.edits.push({at:new Date().toISOString(),changes:structuredClone(command)});row.fingerprint=sourceDigest({input:row.input,sources:row.sources,result:row.result});this.finish(row,command,'edit');}
    return this.view(row);
  }
  authoring(user:InMemoryUserAccount,courseId:string):SourceCourseAuthoring {
    if(user.role==='student')throw new ForbiddenException('完整教学稿请由成人创建者打开');
    const row=this.record(user,courseId,true);
    if(row.status!=='ready'||!row.result)throw new ConflictException('只有等待审阅的候选可以打开完整教学稿');
    row.authoringExposedAt??=new Date().toISOString();
    return{courseId:row.id,revision:row.revision,content:structuredClone(row.result),originalContent:structuredClone(row.originalResult??row.result),contentReview:'pending',generationInput:structuredClone(row.generation?.input??null),generationReviews:row.generation?.lessons.flatMap((lesson,index)=>lesson.review?[{lessonIndex:index,lessonTitle:row.generation!.outline!.lessons[index].title,review:structuredClone(lesson.review)}]:[])??[],reviewCurrent:generationView(row)?.reviewCurrent??false};
  }
  async editContent(user:InMemoryUserAccount,courseId:string,input:unknown){
    if(user.role==='student')throw new ForbiddenException('完整教学稿请由成人创建者修订');
    const row=this.record(user,courseId,true),command=validate(z.object({expectedRevision:revision,requestKey:key,content:sourceCourseContentSchema}).strict(),input);
    if(!this.replay(row,command,'content-edit')){
      if(row.status!=='ready'||!row.result)throw new ConflictException('只有等待审阅的候选可以修改完整内容；已确认课程需另建候选');
      if(this.sourceStatus(row)!=='current')throw new ConflictException('来源资料已变化，请重新选页生成，当前编辑稿可先导出保留');
      let content;try{content=checkGeneratedCourse(command.content,row.sources);}catch(error){throw new BadRequestException(error instanceof Error?error.message:'课程内容未通过核对');}
      row.authoringExposedAt??=new Date().toISOString();row.result=structuredClone(content);row.input.title=content.title;
      row.edits.push({at:new Date().toISOString(),changes:{kind:'content-edit',content:structuredClone(content)}});
      row.fingerprint=sourceDigest({input:row.input,sources:row.sources,result:row.result});this.finish(row,command,'content-edit');
    }
    return this.view(row);
  }
  async confirm(user:InMemoryUserAccount,courseId:string,input:unknown){
    const row=this.record(user,courseId,true),command=validate(z.object({expectedRevision:revision,requestKey:key,fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),input);
    if(!this.replay(row,command,'confirm')){if(row.status!=='ready'||row.fingerprint!==command.fingerprint||!row.result)throw new ConflictException('请重新审阅当前课程候选');
      if(this.sourceStatus(row)!=='current')throw new ConflictException('来源资料已经更新或不可用，请重新选择原页生成，旧预览不能直接确认');
      row.status='active';row.confirmedAt=new Date().toISOString();this.finish(row,command,'confirm');}
    return this.view(row);
  }
  async control(user:InMemoryUserAccount,courseId:string,action:'cancel'|'retry'|'archive',input:unknown){
    const row=this.record(user,courseId,true),command=validate(z.object({expectedRevision:revision,requestKey:key,expectedTaskVersion:z.number().int().min(1).optional()}).strict(),input);
    if(this.replay(row,command,action))return this.view(row);
    if(action==='archive'){if(row.status!=='active')throw new ConflictException('只有已确认课程可以归档');row.status='archived';this.finish(row,command,action);return this.view(row);}
    const task=await this.store.tasks.get(row.taskId);if(!task||task.version!==command.expectedTaskVersion)throw new ConflictException('生成任务已变化，请刷新状态');
    if(action==='cancel'){if(!['queued','running','retry_wait','cancel_requested'].includes(task.state)||['active','archived'].includes(row.status))throw new ConflictException('当前任务不能取消');row.status='cancelled';}
    else{if(!['failed','cancelled'].includes(task.state)||this.sourceStatus(row)!=='current')throw new ConflictException('请先核对失败/取消状态及当前来源，再重试');if(row.generation&&(row.generation.version!==SOURCE_COURSE_PIPELINE||row.generation.inputFingerprint!==generationFingerprint(row,row.generation.input)))throw new ConflictException('生成进度与当前流水线不兼容，请按原始目标重新创建课程。来源快照仍保留。');row.status='queued';}
    await this.store.controlTask({id:task.id,action,expectedVersion:task.version,actorId:user.id});this.finish(row,command,action);
    return this.view(row,{state:action==='retry'?'queued':task.state==='running'?'cancel_requested':'cancelled',version:task.version+1,generation:task.generation+(action==='retry'?1:0),errorCode:null});
  }
}
