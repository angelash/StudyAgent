import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { sourceCourseContentSchema, sourceCourseLessonContentSchema, compiledSourceCourseContentSchema, type SourceCourseAuthoring } from '@study-agent/contracts';
import type { CourseSourceSnapshot, SourceCourseSummary, SourceCourseView, StudioSourceMaterial,SourceCourseLessonContent } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { assertMaterialAccess, studioMaterialView,materialTaskStatus } from './studio-material-access';
import { SOURCE_COURSE_PIPELINE, generationDigest,generationFingerprint, generationView, newCourseGeneration } from './source-course-pipeline';
import { sourceCourseLesson, sourceCourseVersioningView, courseCitationSources, checkGeneratedCourse, sourceDigest, sourceCourseModelContext, SourceCourseRecord } from './source-course-content';

import { newCompilation,compilationView,verifyCompilation,stageId,checkLongLesson,verifySavedStage,verifySavedReview,type SavedLongReview } from './source-course-compilation';
import { courseSelectionShape,courseSelectionSchema,readCourseSelection,coursePreflight,materialVersion } from './source-course-selection';
import { compileSourceChunks } from './source-course-chunks';
import { persistStudioMaterial } from './studio-material-storage';
export { materialVersion } from './source-course-selection';

const id=z.string().min(1).max(180),key=z.string().min(8).max(180),revision=z.number().int().min(0);
export function assertSourceCourseAccess(user:InMemoryUserAccount,row:SourceCourseRecord,students:StudentsService,editing=false){
  if(row.ownerUserId!==user.id&&(['draft','discarded'].includes(row.versioning?.state??'')||editing||!row.studentId||!['active','archived'].includes(row.status)))throw new ForbiddenException('无法访问其他账号的资料课程');
  if(row.studentId)students.assertCanAccessStudent(user,row.studentId);else if(user.role==='student')throw new ForbiddenException('请从自己的学习课程进入');
}
@Injectable()
export class SourceCourseService {
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService){}
  private record(user:InMemoryUserAccount,courseId:string,editing=false){const row=this.store.find('sourceCourses',{id:courseId});if(!row)throw new NotFoundException('资料课程不存在');assertSourceCourseAccess(user,row,this.students,editing);return row;}
  async materials(user:InMemoryUserAccount,input:unknown){
    const query=validate(z.object({studentId:id.optional(),subject:z.enum(['math','chinese','english']).optional(),view:z.literal('catalog').optional()}).strict(),input);
    if(query.studentId)this.students.assertCanAccessStudent(user,query.studentId);
    if(user.role==='student'&&!query.studentId)throw new BadRequestException('请先选择自己的学习档案');
    const rows=[...(query.studentId?this.store.select('studioSourceMaterials',{studentId:query.studentId,...(query.subject?{subject:query.subject}:{})}):[]),
      ...(user.role!=='student'?this.store.select('studioSourceMaterials',{studentId:null,ownerUserId:user.id}):[])];
    return Promise.all(rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(async row=>{const view=studioMaterialView(row,query.view==='catalog');if(query.view==='catalog'&&row.processingTaskId)view.status=materialTaskStatus(row,(await this.store.tasks.get(row.processingTaskId))?.state);return{material:view,version:materialVersion(row)};}));
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
  async addTextFile(user:InMemoryUserAccount,file:Express.Multer.File|undefined,input:unknown){
    if(!file||!Buffer.isBuffer(file.buffer)||file.size<20||file.size>1024*1024||!/\.(txt|md)$/iu.test(file.originalname))throw new BadRequestException('请选择1MB以内的UTF-8 TXT或Markdown文件');
    const command=validate(z.object({title:z.string().trim().min(1).max(180),studentId:id.optional(),subject:z.enum(['math','chinese','english']).optional(),requestKey:key}).strict().refine(value=>Boolean(value.studentId)===Boolean(value.subject),'档案和学科需要同时选择'),input);
    if(command.studentId)this.students.assertCanAccessStudent(user,command.studentId);else if(user.role==='student')throw new ForbiddenException('请从自己的学习档案添加资料');
    let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(file.buffer);}catch{throw new BadRequestException('文字文件需要使用UTF-8编码；原文件不会被改写');}
    if(text.trim().length<20||text.length>180000||text.includes('\u0000'))throw new BadRequestException('正文需要20至180000字，且不能包含二进制空字符');
    const decodedName=Buffer.from(file.originalname,'latin1').toString('utf8'),filename=(decodedName.includes('\ufffd')?file.originalname:decodedName).replace(/[\\/]/g,'').slice(0,255);
    const sha256=createHash('sha256').update(file.buffer).digest('hex'),hash=sourceDigest({sha256,filename,title:command.title,studentId:command.studentId??null,subject:command.subject??null}),previous=this.store.select('studioSourceMaterials',{ownerUserId:user.id}).find(row=>(row as any).requestKey===command.requestKey) as any;
    if(previous){if(previous.requestHash!==hash)throw new ConflictException('上传标识已用于不同文字资料');return{material:studioMaterialView(previous),version:materialVersion(previous)};}
    const chunks=compileSourceChunks({key:'text-file',materialId:'upload',page:1,title:command.title,kind:'text',text,blocks:[],sha256,version:sha256,fingerprint:sha256,structureReviewRequired:false});
    if(chunks.length>120)throw new BadRequestException('正文分段超过120段，请拆成相邻资料，原文不会截断');
    await persistStudioMaterial(this.store,sha256,file.buffer,'txt');const now=new Date().toISOString(),warnings=[...new Set(chunks.flatMap(chunk=>chunk.warnings))],row={id:this.store.nextId('source_text'),ownerUserId:user.id,studentId:command.studentId??null,subject:command.subject??null,kind:'text' as const,originalFormat:'txt' as const,
      filename,title:command.title,pageCount:chunks.length,pages:chunks.map((chunk,index)=>({page:index+1,text:chunk.text})),sha256,byteSize:file.buffer.length,hasPageImages:false,status:warnings.length?'needs_review' as const:'ready' as const,
      structure:{method:'native_text' as const,ocrPageCount:0,tableCount:0,formulaCount:0,confidence:null,reviewRequired:warnings.length>0,modelAssisted:false,modelSource:null,warnings},createdAt:now,updatedAt:now,requestKey:command.requestKey,requestHash:hash};
    this.store.append('studioSourceMaterials',row);return{material:studioMaterialView(row),version:materialVersion(row)};
  }
  private sourceStatus(row:SourceCourseRecord):SourceCourseView['sourceStatus']{
    let changed=false;const versions=new Map<string,string>();for(const source of row.sources){if(!versions.has(source.materialId)){const current=this.store.find('studioSourceMaterials',{id:source.materialId});if(!current)return'unavailable';versions.set(source.materialId,materialVersion(current));}if(versions.get(source.materialId)!==source.version)changed=true;}return changed?'changed':'current';
  }
  private async view(row:SourceCourseRecord,provisional?:{state:string;version:number;generation:number;errorCode:string|null},viewerId=row.ownerUserId,compact=false):Promise<SourceCourseView>{
    const task=provisional??(row.taskId?await this.store.tasks.get(row.taskId):null),status=['active','archived','ready','cancelled'].includes(row.status)?row.status:
      !task?'failed':task.state==='failed'?'failed':task.state==='cancelled'||task.state==='cancel_requested'?'cancelled':task.state==='running'?'generating':row.status;
    const sessions=this.store.select('classroomSessions',{ownerUserId:viewerId,courseId:row.id}),citationSources=row.result&&!compact?courseCitationSources(row):[],lessons=compact?[]:row.result?.lessons.map((_,index)=>sourceCourseLesson(row,index,citationSources)!)??[];
    const lessonList=row.result?.lessons.map((lesson,index)=>({id:row.lessonIds?.[index]??`source:${row.id}:${index+1}`,title:lesson.title}))??[];
    const viewed=new Set(sessions.filter(session=>session.status==='completed').map(session=>session.lessonId));
    const recent=sessions.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    const next=lessonList.find(lesson=>lesson.id===recent?.lessonId&&!viewed.has(lesson.id))??lessonList.find(lesson=>!viewed.has(lesson.id))??lessonList[0];
    return{id:row.id,studentId:row.studentId,subject:row.subject,title:row.result?.title??row.input.title,goal:row.input.goal,...(row.versioning?{versioning:sourceCourseVersioningView(row,viewerId,new Set(this.store.inspect('sourceCourses').filter(candidate=>candidate.confirmedAt&&['active','archived'].includes(candidate.status)).map(candidate=>candidate.id)))}:{}),status:status as SourceCourseView['status'],
      lessonCount:lessonList.length,viewed:lessonList.filter(lesson=>viewed.has(lesson.id)).length,lastLessonId:recent?.lessonId??null,lastSessionId:recent?.id??null,nextLessonId:next?.id??null,nextLessonTitle:next?.title??null,lastStudied:recent?.updatedAt??null,
      revision:row.revision,...(row.compilation?{compilation:compact?{...compilationView(row,viewerId)!,coverage:[]}:compilationView(row,viewerId)}:{}),generation:generationView(row),generationInput:viewerId===row.ownerUserId?structuredClone(row.compilation?.input??row.generation?.input??null):null,overview:row.result?.overview??null,input:structuredClone(row.input),sources:compact?[]:structuredClone(row.compilation?row.sources.map(source=>({...source,text:'',blocks:[],textCharacters:source.text.length})):row.sources),permissions:{manage:viewerId===row.ownerUserId},contentReview:'pending',formalMeasurementEligible:false,
      sourceStatus:this.sourceStatus(row),fingerprint:row.fingerprint,modelName:row.modelName,lessons,
      task:task?{id:row.taskId!,state:task.state,version:task.version,generation:task.generation,errorCode:task.errorCode}:null,
      confirmedAt:row.confirmedAt,createdAt:row.createdAt,updatedAt:row.updatedAt};
  }
  async get(user:InMemoryUserAccount,courseId:string){return this.view(this.record(user,courseId),undefined,user.id);}
  async progress(user:InMemoryUserAccount,courseId:string){return this.view(this.record(user,courseId),undefined,user.id,true);}
  source(user:InMemoryUserAccount,courseId:string,sourceKey:string){const row=this.record(user,courseId),source=row.sources.find(source=>source.key===sourceKey)??courseCitationSources(row).find(source=>source.key===sourceKey);if(!source)throw new NotFoundException('原文范围不存在');return structuredClone(source);}
  async list(user:InMemoryUserAccount,input:unknown):Promise<SourceCourseSummary[]>{
    const query=validate(z.object({studentId:id.optional(),subject:z.enum(['math','chinese','english']).optional()}).strict(),input);
    if(query.studentId)this.students.assertCanAccessStudent(user,query.studentId);
    const candidates=[...(query.studentId?this.store.select('sourceCourses',{studentId:query.studentId}):[]),...(user.role!=='student'?this.store.select('sourceCourses',{ownerUserId:user.id,studentId:null}):[])];
    const rows=[...new Map(candidates.map(row=>[row.id,row])).values()].filter(row=>query.studentId?row.studentId===query.studentId&&(!query.subject||row.subject===query.subject)||user.role!=='student'&&!row.studentId:!row.studentId&&user.role!=='student')
      .filter(row=>row.ownerUserId===user.id||['active','archived'].includes(row.status)&&!['draft','discarded'].includes(row.versioning?.state??''))
      .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    const output:SourceCourseSummary[]=[];for(const row of rows){assertSourceCourseAccess(user,row,this.students);const {compilation:_compilation,revision:_r,generation:_generation,generationInput:_generationInput,overview:_overview,input:_i,sources:_s,lessons:_l,permissions:_p,contentReview:_c,formalMeasurementEligible:_f,sourceStatus:_ss,fingerprint:_fp,modelName:_m,task:_t,confirmedAt:_ct,...summary}=await this.view(row,undefined,user.id,true);output.push(summary);}return output;
  }
  preflight(user:InMemoryUserAccount,input:unknown){const command=validate(courseSelectionSchema,input);return coursePreflight(user,command,readCourseSelection(this.store,this.students,user,command));}
  async create(user:InMemoryUserAccount,input:unknown){
    const command=validate(z.object({...courseSelectionShape,mode:z.literal('long').optional(),previewFingerprint:z.string().regex(/^[a-f0-9]{64}$/).optional(),requestKey:key
    }).strict().refine(value=>Boolean(value.studentId)===Boolean(value.subject),'档案和学科需要同时选择'),input);
    const {requestKey,...body}=command,hash=sourceDigest(body),previous=this.store.select('sourceCourses',{ownerUserId:user.id}).find(row=>row.requests.some(request=>request.key===requestKey));
    if(previous){assertSourceCourseAccess(user,previous,this.students);const request=previous.requests.find(request=>request.key===requestKey)!;if(request.hash!==hash||request.kind!=='generate')throw new ConflictException('生成标识已用于其他内容');return this.view(previous);}
    const selected=readCourseSelection(this.store,this.students,user,command),{sources,targetGoals,audience}=selected,preflight=coursePreflight(user,command,selected);
    if(command.mode==='long'){
      if(!command.previewFingerprint)throw new BadRequestException('请先审阅长资料编排范围');
      if(command.previewFingerprint!==preflight.fingerprint)throw new ConflictException('资料或目标已变化，请重新预检');
      if(!preflight.valid)throw new BadRequestException(preflight.issues.join(' '));
    }else if(preflight.requiresLongMode)throw new BadRequestException('本次超出小课程范围，请先预检并确认长资料编排；系统不会截断原文。');
    if(command.previewFingerprint&&command.previewFingerprint!==preflight.fingerprint)throw new ConflictException('资料或目标已变化，请重新预检');
    const now=new Date().toISOString(),row:SourceCourseRecord={id:this.store.nextId('source_course'),ownerUserId:user.id,studentId:command.studentId??null,subject:command.subject??null,
      audience,targetGoals,
      input:{title:command.title,goal:command.goal,language:command.language,minutesPerSession:command.minutesPerSession,modelId:command.modelId,targetAtomIds:command.targetAtomIds},sources,
      revision:0,status:'queued',taskId:this.store.nextId('task'),result:null,originalResult:null,edits:[],fingerprint:null,modelName:null,confirmedAt:null,createdAt:now,updatedAt:now,requests:[{key:requestKey,hash,kind:'generate'}]};
    if(command.mode!=='long'&&sourceCourseModelContext(row).length>18000)throw new BadRequestException('所选内容含较多格式字符，超出一次可完整读取的范围，请进一步缩小选择；系统不会截断来源。');
    if(command.mode==='long')row.compilation=newCompilation(row);else row.generation=newCourseGeneration(row,'creation');
    this.store.append('sourceCourses',row);await this.store.enqueueTask({id:row.taskId!,kind:'learning.source-course.generate',ownerUserId:user.id,requestKey,payloadHash:sourceDigest({courseId:row.id}),payload:{courseId:row.id},createdAt:now,maxAttempts:2});
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
      lessons:z.array(z.object({id, title:z.string().trim().min(1).max(100),objective:z.string().trim().min(1).max(350)}).strict()).min(1).max(row.compilation?24:6)}).strict(),input);
    if(!this.replay(row,command,'edit')){if(row.status!=='ready'||!row.result)throw new ConflictException('只有等待审阅的候选可以修改，已确认内容请重新生成新版本');
      const ids=row.result.lessons.map((_,index)=>sourceCourseLesson(row,index)!.id);if(new Set(command.lessons.map(item=>item.id)).size!==command.lessons.length||command.lessons.some(item=>!ids.includes(item.id)))throw new BadRequestException('课时标识与当前候选不一致');
      row.result={...row.result,title:command.title,lessons:command.lessons.map(edit=>({...row.result!.lessons[ids.indexOf(edit.id)],title:edit.title,objective:edit.objective}))};
      if(row.lessonIds)row.lessonIds=command.lessons.map(lesson=>lesson.id);
      row.input.title=command.title;row.input.goal=command.goal;row.edits.push({at:new Date().toISOString(),changes:structuredClone(command)});row.fingerprint=sourceDigest({input:row.input,sources:row.sources,result:row.result});this.finish(row,command,'edit');}
    return this.view(row);
  }
  authoring(user:InMemoryUserAccount,courseId:string):SourceCourseAuthoring {
    if(user.role==='student')throw new ForbiddenException('完整教学稿请由成人创建者打开');
    const row=this.record(user,courseId,true);
    if(row.status!=='ready'||!row.result)throw new ConflictException('只有等待审阅的候选可以打开完整教学稿');
    if(row.compilation)return this.lessonAuthoring(user,courseId,row.lessonIds![0]);
    row.authoringExposedAt??=new Date().toISOString();
    return{courseId:row.id,revision:row.revision,content:structuredClone(row.result),originalContent:structuredClone(row.originalResult??row.result),contentReview:'pending',generationInput:structuredClone(row.generation?.input??null),generationReviews:row.generation?.lessons.flatMap((lesson,index)=>lesson.review?[{lessonIndex:index,lessonTitle:row.generation!.outline!.lessons[index].title,review:structuredClone(lesson.review)}]:[])??[],reviewCurrent:generationView(row)?.reviewCurrent??false};
  }
  lessonAuthoring(user:InMemoryUserAccount,courseId:string,lessonId:string):SourceCourseAuthoring {
    if(user.role==='student')throw new ForbiddenException('完整教学稿请由成人创建者打开');
    const row=this.record(user,courseId,true),index=row.lessonIds?.indexOf(lessonId)??-1;
    if(row.status!=='ready'||!row.result||!row.compilation||index<0)throw new ConflictException('请从当前长课程的待审课时打开教学稿');
    let original:SourceCourseLessonContent,review:SavedLongReview;
    try{
      const chunks=verifyCompilation(row),target=row.compilation.outline?.lessons.find(lesson=>lesson.id===lessonId);
      if(!target)throw new Error('course_checkpoint_incompatible');
      const assigned=target.sourceKeys.map(key=>{const chunk=chunks.find(chunk=>chunk.key===key);if(!chunk)throw new Error('course_checkpoint_incompatible');return chunk;}),input={target,input:row.compilation.input,sources:assigned.map(chunk=>[chunk.key,chunk.sha256])},parse=(payload:unknown)=>checkLongLesson(payload,row,target,assigned);
      const draftStage=this.store.find('sourceCourseStages',{id:stageId(row.id,'draft',lessonId)}),reviewStage=this.store.find('sourceCourseStages',{id:stageId(row.id,'review',lessonId)});
      if(!draftStage||!reviewStage)throw new Error('course_checkpoint_incompatible');
      original=verifySavedStage(draftStage,row,'draft',lessonId,input,parse);
      review=verifySavedStage(reviewStage,row,'review',lessonId,{...input,draft:generationDigest(original)},payload=>verifySavedReview(payload,row,original,parse));
    }catch{throw new ConflictException('原始课时稿或复核记录未通过完整性核对，请保留当前内容并重新创建候选。');}
    row.authoringExposedAt??=new Date().toISOString();
    const keys=new Set([...(row.compilation.outline?.lessons.find(lesson=>lesson.id===lessonId)?.sourceKeys??[]),...row.result.lessons[index].citations.map(citation=>citation.sourceKey)]);
    const content={title:row.result.title,overview:row.result.overview,lessons:[structuredClone(row.result.lessons[index])]},originalContent={...content,lessons:[original]};
    return{courseId:row.id,lessonId,revision:row.revision,content,originalContent,contentReview:'pending',generationInput:structuredClone(row.compilation.input),generationReviews:review?[{lessonIndex:0,lessonTitle:content.lessons[0].title,review:structuredClone(review.review)}]:[],reviewCurrent:compilationView(row)?.reviewCurrent??false,sources:courseCitationSources(row).filter(source=>keys.has(source.key))} as SourceCourseAuthoring;
  }
  async editLesson(user:InMemoryUserAccount,courseId:string,lessonId:string,input:unknown){
    if(user.role==='student')throw new ForbiddenException('完整教学稿请由成人创建者修订');
    const row=this.record(user,courseId,true),command=validate(z.object({expectedRevision:revision,requestKey:key,title:z.string().trim().min(1).max(180),overview:z.string().trim().min(1).max(700),content:sourceCourseLessonContentSchema}).strict(),input);
    if(!this.replay(row,command,'lesson-edit:'+lessonId)){
      const index=row.lessonIds?.indexOf(lessonId)??-1;if(!row.compilation||row.status!=='ready'||!row.result||index<0)throw new ConflictException('请重新读取待审课时');
      if(this.sourceStatus(row)!=='current')throw new ConflictException('来源资料已变化，请先导出本地编辑稿后重新编排');
      let lesson;try{lesson=checkGeneratedCourse({title:command.title,overview:command.overview,lessons:[command.content]},courseCitationSources(row)).lessons[0];}catch(error){throw new BadRequestException(error instanceof Error?error.message:'课时内容未通过核对');}
      row.authoringExposedAt??=new Date().toISOString();row.result={...row.result,title:command.title,overview:command.overview,lessons:row.result.lessons.map((value,index2)=>index2===index?lesson:value)};
      row.input.title=command.title;row.edits.push({at:new Date().toISOString(),changes:{kind:'lesson-edit',lessonId,content:structuredClone(lesson)}});row.fingerprint=sourceDigest({input:row.input,sources:row.sources,result:row.result});this.finish(row,command,'lesson-edit:'+lessonId);
    }return this.view(row);
  }
  async editContent(user:InMemoryUserAccount,courseId:string,input:unknown){
    if(user.role==='student')throw new ForbiddenException('完整教学稿请由成人创建者修订');
    const row=this.record(user,courseId,true);if(row.compilation)throw new BadRequestException('长课程请按稳定课时打开并保存教学稿，完整原稿仍保留。');
    const command=validate(z.object({expectedRevision:revision,requestKey:key,content:sourceCourseContentSchema}).strict(),input);
    if(!this.replay(row,command,'content-edit')){
      if(row.status!=='ready'||!row.result)throw new ConflictException('只有等待审阅的候选可以修改完整内容；已确认课程需另建候选');
      if(this.sourceStatus(row)!=='current')throw new ConflictException('来源资料已变化，请重新选页生成，当前编辑稿可先导出保留');
      let content;try{content=checkGeneratedCourse(command.content,courseCitationSources(row),row.compilation?24:6);}catch(error){throw new BadRequestException(error instanceof Error?error.message:'课程内容未通过核对');}
      row.authoringExposedAt??=new Date().toISOString();row.result=structuredClone(content);row.input.title=content.title;
      row.edits.push({at:new Date().toISOString(),changes:{kind:'content-edit',content:structuredClone(content)}});
      row.fingerprint=sourceDigest({input:row.input,sources:row.sources,result:row.result});this.finish(row,command,'content-edit');
    }
    return this.view(row);
  }
  async confirm(user:InMemoryUserAccount,courseId:string,input:unknown){
    const row=this.record(user,courseId,true),command=validate(z.object({expectedRevision:revision,requestKey:key,fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),input);
    if(!this.replay(row,command,'confirm')){if(row.versioning?.parentCourseId)throw new ConflictException('请先预览修订发布对旧版本的影响');if(row.status!=='ready'||row.fingerprint!==command.fingerprint||!row.result)throw new ConflictException('请重新审阅当前课程候选');
      if(this.sourceStatus(row)!=='current')throw new ConflictException('来源资料已经更新或不可用，请重新选择原页生成，旧预览不能直接确认');
      row.status='active';row.confirmedAt=new Date().toISOString();this.finish(row,command,'confirm');}
    return this.view(row);
  }
  async control(user:InMemoryUserAccount,courseId:string,action:'cancel'|'retry'|'archive',input:unknown){
    const row=this.record(user,courseId,true),command=validate(z.object({expectedRevision:revision,requestKey:key,expectedTaskVersion:z.number().int().min(1).optional()}).strict(),input);
    if(this.replay(row,command,action))return this.view(row);
    if(action==='archive'){if(row.versioning)throw new ConflictException('请先预览课程版本归档影响');if(row.status!=='active')throw new ConflictException('只有已确认课程可以归档');row.status='archived';this.finish(row,command,action);return this.view(row);}
    if(!row.taskId)throw new ConflictException('这是人工修订候选，没有可取消或重试的生成任务');
    const task=await this.store.tasks.get(row.taskId);if(!task||task.version!==command.expectedTaskVersion)throw new ConflictException('生成任务已变化，请刷新状态');
    if(action==='cancel'){if(!['queued','running','retry_wait','cancel_requested'].includes(task.state)||['active','archived'].includes(row.status))throw new ConflictException('当前任务不能取消');row.status='cancelled';}
    else{if(!['failed','cancelled'].includes(task.state)||this.sourceStatus(row)!=='current')throw new ConflictException('请先核对失败/取消状态及当前来源，再重试');if(row.generation&&(row.generation.version!==SOURCE_COURSE_PIPELINE||row.generation.inputFingerprint!==generationFingerprint(row,row.generation.input)))throw new ConflictException('生成进度与当前流水线不兼容，请按原始目标重新创建课程。来源快照仍保留。');if(row.compilation){if(task.errorCode==='course_checkpoint_incompatible')throw new ConflictException('已保存阶段未通过完整性核对，请保留原稿并重新创建课程。');try{verifyCompilation(row);}catch{throw new ConflictException('长资料进度与原始来源不兼容，请保留原稿并重新创建。');}}row.status='queued';}
    await this.store.controlTask({id:task.id,action,expectedVersion:task.version,actorId:user.id});this.finish(row,command,action);
    return this.view(row,{state:action==='retry'?'queued':task.state==='running'?'cancel_requested':'cancelled',version:task.version+1,generation:task.generation+(action==='retry'?1:0),errorCode:null});
  }
}
