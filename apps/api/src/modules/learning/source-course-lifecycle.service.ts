import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { SourceCourseLifecycleAction, SourceCourseLifecyclePreview, SourceCourseVersioning, SourceCourseVersionSummary } from '@study-agent/contracts';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { SourceCourseService, assertSourceCourseAccess } from './source-course.service';
import { checkGeneratedCourse, courseCitationSources, sourceCourseLesson, sourceDigest, type SourceCourseRecord } from './source-course-content';
import { generationDigest, generationFingerprint } from './source-course-pipeline';
import { checkLongLesson, stageId, verifyCompilation, verifySavedReview, verifySavedStage } from './source-course-compilation';

const requestKey=z.string().min(8).max(180), revision=z.number().int().min(0), fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
const action=z.enum(['publish','archive','withdraw','restore','discard']);
const commandSchema=z.object({requestKey,expectedRevision:revision,fingerprint,impactFingerprint:fingerprint,action,reason:z.string().trim().max(1000)}).strict();
type Command=z.infer<typeof commandSchema>;
function version(row:SourceCourseRecord):SourceCourseVersioning {
  return structuredClone(row.versioning??{familyId:row.id,parentCourseId:null,number:1,state:row.status==='active'?'published':row.status==='archived'?'archived':'draft',events:[]});
}
@Injectable()
export class SourceCourseLifecycleService {
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly courses:SourceCourseService){}
  private record(user:InMemoryUserAccount,id:string,manage=false){
    const row=this.store.find('sourceCourses',{id});if(!row)throw new NotFoundException('资料课程不存在');
    assertSourceCourseAccess(user,row,this.students,manage);
    if(manage&&(row.ownerUserId!==user.id||user.role==='student'))throw new ForbiddenException('课程版本变更请由成人创建者操作');return row;
  }
  private family(row:SourceCourseRecord){const id=version(row).familyId;return this.store.inspect('sourceCourses').filter(candidate=>version(candidate).familyId===id).sort((a,b)=>version(a).number-version(b).number||a.id.localeCompare(b.id));}
  versions(user:InMemoryUserAccount,id:string):SourceCourseVersionSummary[]{
    const row=this.record(user,id);return this.family(row).filter(candidate=>candidate.ownerUserId===user.id||candidate.confirmedAt&&['active','archived'].includes(candidate.status)).map(candidate=>{
      assertSourceCourseAccess(user,candidate,this.students);const info=version(candidate);return{id:candidate.id,title:candidate.result?.title??candidate.input.title,number:info.number,parentCourseId:info.parentCourseId,status:candidate.status,state:info.state,revision:candidate.revision,confirmedAt:candidate.confirmedAt};
    });
  }
  private event(row:SourceCourseRecord,user:InMemoryUserAccount,kind:SourceCourseLifecycleAction|'revise',reason:string,next:SourceCourseRecord['status'],related:string[]=[]) {
    row.versioning??=version(row);const fromStatus=row.status;row.status=next;row.revision++;row.updatedAt=new Date().toISOString();
    row.versioning.state=kind==='revise'?row.versioning.state:kind==='withdraw'?'withdrawn':kind==='discard'?'discarded':next==='active'?'published':next==='archived'?'archived':'draft';
    row.versioning.events.push({id:this.store.nextId('course_event'),action:kind,at:row.updatedAt,actorId:user.id,reason,fromStatus,toStatus:next,relatedCourseIds:related});
  }
  /** Verify the actual originals before copying their provenance; copies are never new model runs. */
  private verifyOriginal(row:SourceCourseRecord){
    if(!row.result)throw new ConflictException('课程尚无可修订的教学稿');
    try{
      checkGeneratedCourse(row.result,courseCitationSources(row),row.compilation?24:6);
      if(row.originalResult)checkGeneratedCourse(row.originalResult,courseCitationSources(row),row.compilation?24:6);
      if(row.compilation){const chunks=verifyCompilation(row);
        for(const lessonId of row.lessonIds??[]){const target=row.compilation.outline?.lessons.find(lesson=>lesson.id===lessonId);if(!target)throw new Error('missing original target');
          const assigned=target.sourceKeys.map(key=>{const chunk=chunks.find(part=>part.key===key);if(!chunk)throw new Error('missing chunk');return chunk;}),input={target,input:row.compilation.input,sources:assigned.map(chunk=>[chunk.key,chunk.sha256])},parse=(raw:unknown)=>checkLongLesson(raw,row,target,assigned);
          const draft=this.store.find('sourceCourseStages',{id:stageId(row.id,'draft',lessonId)}),review=this.store.find('sourceCourseStages',{id:stageId(row.id,'review',lessonId)});if(!draft||!review)throw new Error('missing original stage');
          const original=verifySavedStage(draft,row,'draft',lessonId,input,parse);
          verifySavedStage(review,row,'review',lessonId,{...input,draft:generationDigest(original)},raw=>verifySavedReview(raw,row,original,parse));
        }
      }else if(row.generation&&row.generation.inputFingerprint!==generationFingerprint(row,row.generation.input))throw new Error('changed original input');
    }catch{throw new ConflictException('原始教学稿或生成证据未通过完整性核对，请先保留现有课程并核对来源');}
  }
  async revise(user:InMemoryUserAccount,id:string,input:unknown){
    const row=this.record(user,id,true),command=validate(z.object({requestKey,expectedRevision:revision,fingerprint}).strict(),input),hash=generationDigest(command),previous=row.requests.find(item=>item.key===command.requestKey);
    if(previous){if(previous.kind!=='revise'||previous.hash!==hash||!previous.courseId)throw new ConflictException('请求标识已用于其他课程操作');this.record(user,previous.courseId,true);return this.courses.get(user,previous.courseId);}
    if(row.revision!==command.expectedRevision||row.fingerprint!==command.fingerprint||!row.confirmedAt||!['active','archived'].includes(row.status))throw new ConflictException('请重新读取要修订的已发布课程');
    if((await this.courses.get(user,id)).sourceStatus!=='current')throw new ConflictException('来源已变化或缺失，请先核对原页；旧课程仍保留');
    this.verifyOriginal(row);const now=new Date().toISOString(),info=version(row),family=this.family(row),next=structuredClone(row),stages=this.store.select('sourceCourseStages',{courseId:row.id});
    next.id=this.store.nextId('source_course');next.taskId=null;next.status='ready';next.revision=0;next.confirmedAt=null;next.createdAt=now;next.updatedAt=now;next.requests=[];next.edits=[];
    next.lessonIds=row.result!.lessons.map((_,index)=>sourceCourseLesson(row,index)!.id);
    next.versioning={familyId:info.familyId,parentCourseId:row.id,number:Math.max(...family.map(candidate=>version(candidate).number))+1,state:'draft',copiedAt:now,events:[]};
    next.authoringExposedAt=now;next.fingerprint=sourceDigest({input:next.input,sources:next.sources,result:next.result});
    for(const stage of stages){if(stage.ownerUserId!==row.ownerUserId||stage.id!==stageId(row.id,stage.kind,stage.key)||stage.outputFingerprint!==generationDigest(stage.payload))throw new ConflictException('来源阶段身份或内容已变化，未创建修订稿');}
    this.event(row,user,'revise','创建独立修订稿，保留原正式课程',row.status,[next.id]);row.authoringExposedAt??=now;
    next.versioning.events.push({id:this.store.nextId('course_event'),action:'revise',at:now,actorId:user.id,reason:'从已发布课程复制教学稿；保留原生成来历',fromStatus:row.status,toStatus:'ready',relatedCourseIds:[row.id]});
    this.store.append('sourceCourses',next);
    for(const stage of stages)this.store.append('sourceCourseStages',{...structuredClone(stage),id:stageId(next.id,stage.kind,stage.key),courseId:next.id,copiedFrom:{courseId:row.id,stageId:stage.id,at:now}});
    row.requests.push({key:command.requestKey,hash,kind:'revise',courseId:next.id});return this.courses.get(user,next.id);
  }
  private assertAction(row:SourceCourseRecord,kind:SourceCourseLifecycleAction){
    const state=version(row).state;
    if(kind==='publish'&&(row.status!=='ready'||!row.result||state!=='draft')||kind==='archive'&&row.status!=='active'||kind==='withdraw'&&(!row.confirmedAt||!['active','archived'].includes(row.status))||kind==='restore'&&(!row.confirmedAt||row.status!=='archived'||state==='discarded')||kind==='discard'&&(row.confirmedAt!==null||row.status!=='ready'||!row.versioning?.parentCourseId))throw new ConflictException('当前课程状态已变化，请重新读取');
  }
  async preview(user:InMemoryUserAccount,id:string,input:unknown):Promise<SourceCourseLifecyclePreview>{
    const row=this.record(user,id,true),command=validate(z.object({action}).strict(),input);this.assertAction(row,command.action);
    const sourceStatus=(await this.courses.get(user,id)).sourceStatus;
    if(['publish','restore'].includes(command.action)&&sourceStatus!=='current')throw new ConflictException('来源资料已变化或不可用，请先核对当前原页');
    const family=this.family(row),replaced=['publish','restore'].includes(command.action)?family.filter(candidate=>candidate.id!==row.id&&candidate.status==='active'):[];
    if(replaced.some(candidate=>candidate.ownerUserId!==user.id))throw new ForbiddenException('当前正式版本不属于此创建者，请先核对课程权限');
    const next=['publish','restore'].includes(command.action)?'active':'archived',changes=[...replaced.map(candidate=>({courseId:candidate.id,title:candidate.result?.title??candidate.input.title,fromStatus:candidate.status,toStatus:'archived' as const})),{courseId:row.id,title:row.result?.title??row.input.title,fromStatus:row.status,toStatus:next as SourceCourseRecord['status']}];
    const affected=new Set(changes.map(change=>change.courseId)),sessions=this.store.inspect('classroomSessions').filter(session=>affected.has(session.courseId));
    const impactFingerprint=generationDigest({action:command.action,courses:family.map(candidate=>({id:candidate.id,revision:candidate.revision,status:candidate.status,versioning:version(candidate),content:generationDigest([candidate.input,candidate.sources,candidate.result])})),sourceStatus});
    if(!row.fingerprint)throw new ConflictException('当前课程缺少内容版本，请保留并重新核对');
    return{courseId:id,action:command.action,expectedRevision:row.revision,fingerprint:row.fingerprint,impactFingerprint,requiresReason:command.action==='withdraw'||replaced.length>0,sourceStatus,versions:this.versions(user,id),changes,
      existing:{sessions:sessions.length,completedLectures:sessions.filter(session=>session.status==='completed').length,answeredQuestions:sessions.reduce((sum,session)=>sum+session.answers.length,0)},
      effects:{newClassrooms:next==='active'?'allowed':'blocked',existingClassrooms:'frozen-and-retained',priorLearning:'not-transferred'}};
  }
  async apply(user:InMemoryUserAccount,id:string,input:unknown){
    const row=this.record(user,id,true),command:Command=validate(commandSchema,input),hash=generationDigest(command),previous=row.requests.find(item=>item.key===command.requestKey);
    if(previous){if(previous.kind!=='lifecycle:'+command.action||previous.hash!==hash)throw new ConflictException('请求标识已用于其他课程操作');return this.courses.get(user,id);}
    const preview=await this.preview(user,id,{action:command.action});
    if(preview.expectedRevision!==command.expectedRevision||preview.fingerprint!==command.fingerprint||preview.impactFingerprint!==command.impactFingerprint)throw new ConflictException('课程或版本影响已变化，请重新预览；现有学习记录未改变');
    if(preview.requiresReason&&command.reason.length<3)throw new BadRequestException('请填写至少三个字的撤回或版本替换原因');
    if(command.action==='publish'||command.action==='restore')this.verifyOriginal(row);
    for(const change of preview.changes){const target=this.record(user,change.courseId,true);this.event(target,user,command.action,command.reason||({publish:'确认教学稿',archive:'主动归档',restore:'恢复使用',discard:'放弃未发布修订稿',withdraw:'撤回课程'}[command.action]),change.toStatus,preview.changes.filter(item=>item.courseId!==target.id).map(item=>item.courseId));
      if(target.id===id&&change.toStatus==='active')target.confirmedAt??=target.updatedAt;
    }
    row.requests.push({key:command.requestKey,hash,kind:'lifecycle:'+command.action});return this.courses.get(user,id);
  }
}
