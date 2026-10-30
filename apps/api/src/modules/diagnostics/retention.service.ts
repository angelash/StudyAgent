import { independentSessionRetainedAt } from './retention-evidence-projection';
import { ConflictException,Injectable } from '@nestjs/common';
import { InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { captureWhiteboardActorAuthorization } from '../learning/topic-whiteboard-access';
import { collectRetentionExposures,type RetentionRetainedRecords } from './retention-source';
import { retentionExposureRecordSchema,retentionEventId,assertRetentionExposureRecords,type RetentionExposureRecord } from './retention-native';
import { retentionDigest } from './retention-anchor';
import { measureRetentionAnchor,type RetentionAnchorResult } from './retention-anchor';
import { atomDefinitionFingerprint,responseDefinitionFingerprint } from './measurement-definition';
import { retentionReviewGate } from './retention-review-gate';
import type { DiagnosticSession,DiagnosticResponse,ReviewTask } from '@study-agent/contracts';
import type { ClassroomSessionRecord } from '../learning/classroom.service';
import { assertClassroomRetentionRecord,classroomRetentionDisplayInputSchema,classroomDisplayHash,classroomDisplayId,type ClassroomRetentionContext,type ClassroomRetentionDisplay } from './classroom-retention-record';
import { resolveClassroomRetentionContext,CLASSROOM_COURSE_HISTORY_EVENTS } from './classroom-retention-origin';
import { sessionPresentation } from '../learning/classroom-presentation';
import { DomainWriteConflict } from '../../infrastructure/domain-write-conflict';
import { validate } from '../../common/validation';
type Subject='math'|'chinese'|'english'|'chemistry';
type StoreClassroom=ClassroomSessionRecord&{retentionContext?:ClassroomRetentionContext;retentionDisplays?:ClassroomRetentionDisplay[]};
@Injectable()
export class RetentionService{
 constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService){}
 records(studentId:string):RetentionRetainedRecords{
  const practice=this.store.select('practiceSessions',{studentId}),diagnostics=this.store.select('diagnosticSessions',{studentId}),classrooms=this.store.select('classroomSessions',{studentId}),child=this.store.find('students',{id:studentId});
  return{students:child?[child]:[],users:child?.userId?this.store.select('users',{id:child.userId}):[],practiceSessions:practice,practiceAttempts:this.store.select('practiceAttempts',{sessionId:practice.map(row=>row.id)}),practiceHints:this.store.select('practiceHints',{sessionId:practice.map(row=>row.id)}),assistantPracticeGroupStarts:this.store.select('assistantPracticeGroupStarts',{studentId}),diagnosticSessions:diagnostics,diagnosticHints:this.store.select('diagnosticHints',{sessionId:diagnostics.map(row=>row.id)}),assistantTeachingAssignments:this.store.select('assistantTeachingAssignments',{studentId}),assistantTeachingSessions:this.store.select('assistantTeachingSessions',{studentId}),classroomSessions:classrooms,events:this.store.select('events',{eventName:CLASSROOM_COURSE_HISTORY_EVENTS,'payload.courseId':classrooms.flatMap(row=>row.studioCourseId?[row.studioCourseId]:[])}),studioCourses:this.store.select('studioCourses',{id:classrooms.flatMap(row=>row.studioCourseId?[row.studioCourseId]:[])}),sourceCourses:this.store.select('sourceCourses',{id:classrooms.flatMap(row=>row.sourceCourseId?[row.sourceCourseId]:[])}),diagnosticPlans:this.store.select('diagnosticPlans',{studentId}),reviewTasks:this.store.select('reviewTasks',{studentId}),retentionExposureEvents:this.store.select('retentionExposureEvents',{studentId})};
 }
 /** Called inside the same transaction that saved a specific real operation. */
 capture(studentId:string,subject:Subject,targets:readonly{atomId:string;definitionFingerprint:string}[],sourceIds:readonly string[]){
  const records=this.records(studentId),wanted=new Set(sourceIds),matched=new Set<string>(),saved:RetentionExposureRecord[]=[];
  for(const target of targets)for(const source of collectRetentionExposures(records,{studentId,subject,...target}).filter(source=>wanted.has(source.id))){
   if(!source.sourceRetained||source.atomId===null||source.definitionFingerprint!==target.definitionFingerprint)throw new ConflictException('实际教学来源或冻结知识定义无法核对，原输入保持。');
   matched.add(source.id);
   const id=retentionEventId(source.id,studentId,target.atomId),previous=this.store.find('retentionExposureEvents',{id});
   const input={protocol:'retention-exposure-v1' as const,id,studentId,subject,atomId:target.atomId,definitionFingerprint:target.definitionFingerprint,kind:source.kind,sourceId:source.sourceId,sourceExposureId:source.id,sourceFingerprint:source.operationFingerprint,at:source.at};
   if(previous){const{createdAt:_created,...original}=previous;if(retentionDigest(original)!==retentionDigest(input))throw new ConflictException('原教学时间回执已对应不同的完整来源，不能覆盖。');saved.push(previous);continue;}
   const row=retentionExposureRecordSchema.parse({...input,createdAt:new Date().toISOString()});this.store.append('retentionExposureEvents',row);saved.push(row);
  }
  if([...wanted].some(id=>!matched.has(id)))throw new ConflictException('原教学操作没有可核对的知识来源，不能保存伪造时间。');
  return saved;
 }
 capturePractice(session:import('@study-agent/contracts').PracticeSession,sourceIds:readonly string[]){
  if(!session.atomSnapshot)return[];
  return this.capture(session.studentId,session.subject,[{atomId:session.atomId,definitionFingerprint:atomDefinitionFingerprint(session.atomSnapshot)}],sourceIds);
 }
 captureGenerated(session:{id:string;assignmentId:string;studentId:string;subject:Subject},sourceIds:readonly string[]){
  const assignment=this.store.find('assistantTeachingAssignments',{id:session.assignmentId});
  if(!assignment||assignment.targetScope.kind!=='student')throw new ConflictException('原孩子教学目标无法核对，保留完整输入。');
  const records=this.records(session.studentId),targets=assignment.targetScope.targets.filter(target=>target.subject===session.subject&&collectRetentionExposures(records,{studentId:session.studentId,subject:session.subject,atomId:target.atomId,definitionFingerprint:target.definitionFingerprint}).some(source=>sourceIds.includes(source.id)));
  return targets.length?this.capture(session.studentId,session.subject,targets,sourceIds):[];
 }
 /** Freeze an old possible teaching range before any new real child write changes updatedAt. */
 prepareClassroom(session:StoreClassroom,now=new Date().toISOString()){
  const actor=this.store.find('users',{id:session.ownerUserId});if(actor?.role!=='student')return;
  if(!session.studentId||!this.store.find('students',{id:session.studentId,userId:actor.id}))throw new ConflictException('原课堂的孩子身份无法核对，请保留原课堂。');
  assertClassroomRetentionRecord(session);if(session.retentionContext)return;
  const context=resolveClassroomRetentionContext({studioCourses:session.studioCourseId?this.store.select('studioCourses',{id:session.studioCourseId}):[],sourceCourses:session.sourceCourseId?this.store.select('sourceCourses',{id:session.sourceCourseId}):[],knowledgeAtoms:this.store.inspect('knowledgeAtoms'),curriculumRevisions:this.store.inspect('curriculumRevisions'),events:this.store.select('events',{eventName:CLASSROOM_COURSE_HISTORY_EVENTS})},session);
  if(!context)throw new ConflictException('这份历史课堂的原课程和学科无法核对，教学时间仍未知，请保留原课堂后核查来源。');
  const oldTeaching=session.revealed>0||Boolean(session.hintReceipts?.length)||session.messages.some(row=>row.role==='assistant')||session.answers.length>0;
  if(oldTeaching){
   if(!Number.isFinite(Date.parse(session.createdAt))||!Number.isFinite(Date.parse(session.updatedAt))||Date.parse(session.createdAt)>Date.parse(session.updatedAt)||Date.parse(session.updatedAt)>Date.parse(now))throw new ConflictException('历史课堂的可能教学时间范围无法核对，请保留原课堂。');
   session.retentionLegacyGap={protocol:'legacy-classroom-source-gap-v1',studentId:context.studentId,subject:context.subject,contentFingerprint:session.contentFingerprint,fromAt:session.createdAt,throughAt:session.updatedAt,preparedAt:now,previousRevealed:session.revealed,previousHintCount:session.hintReceipts?.length??0,previousMessageCount:session.messages.length,previousAnswerCount:session.answers.length};
  }
  session.retentionContext=context;assertClassroomRetentionRecord(session);
 }
 captureClassroomHelp(session:StoreClassroom,sourcePrefix:string){
  const context=session.retentionContext;if(!context||!context.targets.length)return[];
  return this.capture(context.studentId,context.subject,context.targets,context.targets.map(target=>sourcePrefix+':'+target.atomId));
 }
 captureClassroomProvision(session:StoreClassroom){
  const context=session.retentionContext;if(!context||session.revealed<=session.cursor)return;
  const step=session.lesson.steps[session.cursor],presentation=sessionPresentation(session),sentence=session.sentenceCursor??0,unit=presentation.tracks[step.id].units[sentence];
  const input={protocol:'classroom-retention-display-v1' as const,contentFingerprint:session.contentFingerprint,stepId:step.id,sentence,presentationVersion:presentation.version,unitId:unit.id,requestKey:'classroom-progress:'+session.revision};
  const display:ClassroomRetentionDisplay={id:classroomDisplayId(session.ownerUserId,session.id,input.requestKey),sessionId:session.id,actorId:session.ownerUserId,studentId:context.studentId,subject:context.subject,contentFingerprint:session.contentFingerprint,lessonId:session.lessonId,stepId:step.id,sentence,presentationVersion:presentation.version,unitId:unit.id,requestKey:input.requestKey,input,requestHash:classroomDisplayHash(session.ownerUserId,session.id,input),at:session.updatedAt,targets:structuredClone(context.targets),unmappedTarget:context.unmappedTarget};
  (session.retentionDisplays??=[]).push(display);assertClassroomRetentionRecord(session);
  if(context.targets.length)this.capture(context.studentId,context.subject,context.targets,context.targets.map(target=>'classroom-display:'+display.id+':'+target.atomId));
 }
 private actual(user:InMemoryUserAccount,row:StoreClassroom,auth:InMemoryAuthSession){
  if(user.role!=='student'||!row.studentId||row.ownerUserId!==user.id)throw new ConflictException('教学显示时间只由这份课堂的实际孩子本人确认。');captureWhiteboardActorAuthorization(this.store,this.students,user,row.studentId,auth);
 }
 async classroomDisplay(user:InMemoryUserAccount,id:string,value:unknown,auth:InMemoryAuthSession){
  const input=validate(classroomRetentionDisplayInputSchema,value);
  for(let attempt=0;attempt<3;attempt++)try{return await this.store.transaction(()=>{
   const row=this.store.find('classroomSessions',{id})as StoreClassroom|undefined;if(!row)throw new ConflictException('原课堂无法核对。');this.actual(user,row,auth);assertClassroomRetentionRecord(row);
   this.prepareClassroom(row);const context=row.retentionContext;if(!context)throw new ConflictException('这份历史课堂没有可核对的孩子教学目标，保留原课堂后另行核对。');
   const hash=classroomDisplayHash(user.id,id,input),previous=row.retentionDisplays?.find(display=>display.requestKey===input.requestKey);
   if(previous){if(previous.requestHash!==hash)throw new ConflictException('原教学显示键已用于另一份原句命令。');return{receipt:structuredClone(previous),recordedTargets:previous.targets.length};}
   if(input.contentFingerprint!==row.contentFingerprint)throw new ConflictException('原课堂正文已变化，请保留全文后重新读取。');
   const step=row.lesson.steps[row.cursor],presentation=sessionPresentation(row),units=step?presentation.tracks[step.id].units:[];
   if(!step||row.revealed<=row.cursor||step.id!==input.stepId||(row.sentenceCursor??0)!==input.sentence||presentation.version!==input.presentationVersion||units[input.sentence]?.id!==input.unitId)throw new ConflictException('只能确认这份原课堂当前实际显示的原句位置。');
   const display:ClassroomRetentionDisplay={id:classroomDisplayId(user.id,id,input.requestKey),sessionId:id,actorId:user.id,studentId:context.studentId,subject:context.subject,contentFingerprint:row.contentFingerprint,lessonId:row.lessonId,stepId:input.stepId,sentence:input.sentence,presentationVersion:input.presentationVersion,unitId:input.unitId,requestKey:input.requestKey,input,requestHash:hash,at:new Date().toISOString(),targets:structuredClone(context.targets),unmappedTarget:context.unmappedTarget};
   (row.retentionDisplays??=[]).push(display);assertClassroomRetentionRecord(row);
   if(context.targets.length)this.capture(context.studentId,context.subject,context.targets,context.targets.map(target=>'classroom-display:'+display.id+':'+target.atomId));
   return{receipt:structuredClone(display),recordedTargets:context.targets.length};
  });}catch(error){if(!(error instanceof DomainWriteConflict)||attempt===2)throw error;}
  throw new ConflictException('原课堂显示发生并发变化，请保留原命令后核对。');
 }
 assertNative(studentId:string){assertRetentionExposureRecords(this.records(studentId));}
 reviewReadiness(task:ReviewTask,plan:{status:string;impact?:{needsReview:boolean}},baseline:DiagnosticSession,responses:readonly DiagnosticResponse[],now=new Date().toISOString()){
  if(![1,3,7,14].includes(task.intervalDays))throw new ConflictException('原复测间隔协议无法核对，请保留原任务。');const intervalDays=task.intervalDays as 1|3|7|14;
  const records=this.records(task.studentId),sessions=(records.diagnosticSessions??[])as unknown as DiagnosticSession[],sessionMap=new Map(sessions.map(row=>[row.id,row])),atom=baseline.atomSnapshots?.find(atom=>atom.id===task.atomId);
  if(!atom){const anchor:RetentionAnchorResult={protocol:'teaching-retention-v1',studentId:task.studentId,subject:task.subject,atomId:task.atomId,definitionFingerprint:'0'.repeat(64),sessionId:task.sessionId??'preflight:'+task.id,startedAt:now,answeredAt:now,requiredIntervalDays:intervalDays,baseline:null,anchor:null,sources:[],unresolvedSourceIds:['original-target-definition'],elapsedMs:null,elapsedDays:null,earliestEligibleAt:null,status:'unknown_source',eligible:false,fingerprint:'0'.repeat(64)};return retentionReviewGate({now,planStatus:plan.status,needsReview:plan.impact?.needsReview??false,taskStatus:task.status,sessionId:task.sessionId,dueAt:task.dueAt,earliestDueAt:task.earliestDueAt??task.dueAt,anchor});}
  const definition=atomDefinitionFingerprint(atom),anchor=measureRetentionAnchor({studentId:task.studentId,subject:task.subject,atomId:task.atomId,definitionFingerprint:definition,sessionId:task.sessionId??'preflight:'+task.id,startedAt:now,answeredAt:now,intervalDays,answer:{status:'scored',disposition:'answered',hintLevel:0,priorExposure:false},baselines:responses.flatMap(original=>{
   const source=sessionMap.get(original.sessionId);if(original.sessionId!==baseline.id||!source||source.studentId!==task.studentId||source.subject!==task.subject||original.atomId!==task.atomId)return[];return[{id:original.id,sessionId:original.sessionId,studentId:original.studentId,subject:source.subject,atomId:original.atomId,definitionFingerprint:responseDefinitionFingerprint(original,sessionMap)??'',submittedAt:original.submittedAt,correct:original.correct,status:original.status,disposition:original.disposition,hintLevel:original.hintLevel,priorExposure:!!original.priorExposure,sourceRetained:independentSessionRetainedAt(source,now)&&source.questionSnapshots.some(question=>question.id===original.questionId)&&source.itemSnapshots.some(item=>item.id===original.itemId)}];
  }),exposures:collectRetentionExposures(records,{studentId:task.studentId,subject:task.subject,atomId:task.atomId,definitionFingerprint:definition})});
  return retentionReviewGate({now,planStatus:plan.status,needsReview:plan.impact?.needsReview??false,taskStatus:task.status,sessionId:task.sessionId,dueAt:task.dueAt,earliestDueAt:task.earliestDueAt??task.dueAt,anchor});
 }
}
