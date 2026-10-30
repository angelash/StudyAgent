import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common';
import { assistantTeachingAssignSchema,assistantTeachingAssignmentWithdrawSchema,assistantTeachingAssignmentsQuerySchema } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { DomainWriteConflict } from '../../infrastructure/domain-write-conflict';
import { StudentsService } from '../students/students.service';
import { AssistantTeachingSourceService } from './assistant-teaching-source.service';
import { captureWhiteboardActorAuthorization } from './topic-whiteboard-access';
import { assertAssistantPracticeLearner } from './assistant-practice-learner-policy';
import { assertCourseAssessmentAvailable } from '../ai/assistant-course-context';
import { assertTeachingAssignment,cleanSharedTeachingContent,teachingAssignmentPayload,teachingAssignmentRequestHash,teachingWithdrawalRequestHash,teachingPublisherFingerprint,teachingPrivatePracticeIdentity,teachingAssignmentView,type TeachingAssignmentRecord } from './assistant-teaching-assignment-record';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

@Injectable()
export class AssistantTeachingAssignmentService{
 constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,private readonly source:AssistantTeachingSourceService){}
 private async write<T>(operation:()=>T|Promise<T>){for(let attempt=0;attempt<3;attempt++)try{return await this.store.transaction(operation);}catch(error){if(!(error instanceof DomainWriteConflict)||attempt===2)throw error;}throw new ConflictException('原AI教学安排发生并发变化，请保留完整输入。');}
 authority(user:InMemoryUserAccount,studentId:string,auth:InMemoryAuthSession){return captureWhiteboardActorAuthorization(this.store,this.students,user,studentId,auth);}
 read(user:InMemoryUserAccount,id:string,auth:InMemoryAuthSession){const row=this.store.find('assistantTeachingAssignments',{id});if(!row)throw new NotFoundException('这份共享AI教学安排不存在。');this.authority(user,row.studentId,auth);assertTeachingAssignment(row);return row;}
 current(row:TeachingAssignmentRecord){
  if(row.withdrawal)throw new ConflictException('原AI教学安排已撤回，原回答和理由保持只读，请查看撤回说明。');
  if(!row.privateOrigin||!row.publisherUserId)throw new ConflictException('原作者账号已删除，共享教学及原回答历史保持只读。');
  const publisher=this.store.find('users',{id:row.publisherUserId,status:'active'}),practice=this.store.find('assistantTeachingPractices',{id:row.privateOrigin.practiceId,ownerUserId:row.publisherUserId}),draft=practice&&this.store.find('assistantTeachingPracticeDrafts',{id:practice.sourceDraftId,ownerUserId:row.publisherUserId});
  if(!publisher||!practice||!draft||publisher.role!==draft.ownerRole||practice.targetScope.kind!=='student'||practice.studentId!==row.studentId||practice.subject!==row.subject||practice.contentFingerprint!==row.originalContentFingerprint||digest(practice.targetScope)!==digest(row.targetScope)||digest(cleanSharedTeachingContent(practice.content))!==row.contentFingerprint)throw new ConflictException('原采用稿、当前作者或教学范围已有变化，原历史保持只读。');
  this.source.assertCurrent(publisher,draft.prepared);assertCourseAssessmentAvailable(this.store,row.studentId,'student');
 }
 assertLearner(user:InMemoryUserAccount,row:TeachingAssignmentRecord,auth:InMemoryAuthSession){assertAssistantPracticeLearner(this.store,this.students,user,row.studentId,auth);this.current(row);if(row.sessionId){const session=this.store.find('assistantTeachingSessions',{id:row.sessionId});if(!session||session.protocol!=='assistant-generated-student-session-v1'||session.ownerUserId!==user.id)throw new ForbiddenException('这份教学安排属于原作答身份，请保留历史后核对本人学习入口。');}}
 eligibility(user:InMemoryUserAccount,row:TeachingAssignmentRecord,auth:InMemoryAuthSession){try{this.assertLearner(user,row,auth);return{writable:true,blocked:null};}catch(error){return{writable:false,blocked:error instanceof Error?error.message:'原教学安排当前保持只读。'};}}
 async assign(user:InMemoryUserAccount,practiceId:string,value:unknown,auth:InMemoryAuthSession){
  const input=validate(assistantTeachingAssignSchema,value),publisherFingerprint=teachingPublisherFingerprint(user.id),practiceIdentityHash=teachingPrivatePracticeIdentity(practiceId),requestHash=teachingAssignmentRequestHash(publisherFingerprint,practiceIdentityHash,input);
  return this.write(()=>{
   if(user.role!=='parent'&&user.role!=='student'&&user.role!=='admin')throw new ForbiddenException('当前AI教学安排只供合法监护人或本人学习入口。');
   const practice=this.store.find('assistantTeachingPractices',{id:practiceId,ownerUserId:user.id}),draft=practice&&this.store.find('assistantTeachingPracticeDrafts',{id:practice.sourceDraftId,ownerUserId:user.id});if(!practice||!draft)throw new NotFoundException('这份私人采用稿不存在或不属于当前作者。');this.source.capture(user,draft.sourceSessionId,auth,draft.studentId);this.authority(user,input.studentId,auth);
   const prior=this.store.find('assistantTeachingAssignments',{publisherFingerprint,requestKey:input.requestKey});if(prior){if(prior.requestHash!==requestHash)throw new ConflictException('原安排键已经用于不同的完整内容。');assertTeachingAssignment(prior);return structuredClone(prior.receipt);}
   if(practice.targetScope.kind!=='student'||practice.studentId!==input.studentId||practice.contentFingerprint!==input.contentFingerprint)throw new ConflictException('原采用稿与明确选择的孩子、内容版本不一致。');
   this.source.assertCurrent(user,draft.prepared);assertCourseAssessmentAvailable(this.store,input.studentId,'student');
   const id=this.store.nextId('teaching_assignment'),at=new Date().toISOString(),content=cleanSharedTeachingContent(practice.content),candidate={protocol:'assistant-generated-teaching-assignment-v1' as const,id,studentId:input.studentId,subject:practice.targetScope.subject,publisherUserId:user.id,publisherRole:user.role,publisherFingerprint,privateOrigin:{practiceId,publisherUserId:user.id},practiceIdentityHash,originalContentFingerprint:practice.contentFingerprint,content,contentFingerprint:digest(content),targetScope:structuredClone(practice.targetScope),modelId:practice.modelId,modelName:practice.modelName,instructions:input.instructions,createInput:structuredClone(input),requestKey:input.requestKey,requestHash,createdAt:at,stateVersion:0 as const,sessionId:null,withdrawal:null},payloadFingerprint=digest(teachingAssignmentPayload(candidate)),receipt={assignmentId:id,payloadFingerprint,at},row:TeachingAssignmentRecord={...candidate,payloadFingerprint,receipt};
   assertTeachingAssignment(row);this.store.append('assistantTeachingAssignments',row);return structuredClone(receipt);
  });
 }
 get(user:InMemoryUserAccount,id:string,auth:InMemoryAuthSession){const row=this.read(user,id,auth),eligibility=this.eligibility(user,row,auth);return teachingAssignmentView(row,eligibility.writable,eligibility.blocked);}
 list(user:InMemoryUserAccount,value:unknown,auth:InMemoryAuthSession){
  const query=validate(assistantTeachingAssignmentsQuerySchema,value??{});this.authority(user,query.studentId,auth);const actor=teachingPublisherFingerprint(user.id);let cursor:{actor:string;studentId:string;subject:string;at:string;id:string}|null=null;
  if(query.cursor)try{cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));if(!cursor||Object.keys(cursor).sort().join()!=='actor,at,id,studentId,subject'||cursor.actor!==actor||cursor.studentId!==query.studentId||cursor.subject!==query.subject||typeof cursor.id!=='string'||!Number.isFinite(Date.parse(cursor.at)))throw Error();}catch{throw new BadRequestException('共享教学安排分页位置不属于当前账号或范围。');}
  const rows=this.store.select('assistantTeachingAssignments',{studentId:query.studentId,subject:query.subject}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).filter(row=>!cursor||row.createdAt<cursor.at||row.createdAt===cursor.at&&row.id<cursor.id),selected=rows.slice(0,query.pageSize),last=selected.at(-1);
  return{items:selected.map(row=>{assertTeachingAssignment(row);const eligibility=this.eligibility(user,row,auth),{questions,...view}=teachingAssignmentView(row,eligibility.writable,eligibility.blocked);return{...view,questionCount:questions.length};}),nextCursor:rows.length>query.pageSize&&last?Buffer.from(JSON.stringify({actor,studentId:query.studentId,subject:query.subject,at:last.createdAt,id:last.id})).toString('base64url'):null};
 }
 async withdraw(user:InMemoryUserAccount,id:string,value:unknown,auth:InMemoryAuthSession){const input=validate(assistantTeachingAssignmentWithdrawSchema,value),actorFingerprint=teachingPublisherFingerprint(user.id),requestHash=teachingWithdrawalRequestHash(actorFingerprint,id,input);return this.write(()=>{
  const row=this.read(user,id,auth);if(user.role!=='parent'&&user.role!=='admin')throw new ForbiddenException('请由合法监护人明确撤回；本人历史保持。');
  const previous=this.store.select('assistantTeachingAssignments',{}).find(other=>other.withdrawal?.actorFingerprint===actorFingerprint&&other.withdrawal.input.requestKey===input.requestKey);if(previous){if(previous.id!==id||previous.withdrawal!.requestHash!==requestHash)throw new ConflictException('原撤回键已经用于不同的完整原因或安排。');return structuredClone(previous.withdrawal!.receipt);}
  if(row.stateVersion!==input.expectedStateVersion||row.payloadFingerprint!==input.assignmentFingerprint||row.withdrawal)throw new ConflictException('原教学安排状态已有变化，请保留自己的撤回说明并核对。');
  const at=new Date(Math.max(Date.now(),Date.parse(row.createdAt))).toISOString(),receipt={assignmentId:id,payloadFingerprint:row.payloadFingerprint,stateVersion:1 as const,withdrawnAt:at};row.stateVersion=1;row.withdrawal={actorUserId:user.id,actorRole:user.role,actorFingerprint,input:structuredClone(input),requestHash,at,receipt};assertTeachingAssignment(row);return structuredClone(receipt);
 });}
 reference(user:InMemoryUserAccount,id:string,questionId:string,auth:InMemoryAuthSession){const row=this.read(user,id,auth);if(user.role==='student')throw new ForbiddenException('请在本人活动内明确使用教学帮助，再读取对应原参考。');const question=row.content.questions.find(item=>item.id===questionId);if(!question)throw new NotFoundException('原题不属于此共享教学安排。');return{assignmentId:id,questionId,referenceOptionId:question.referenceOptionId,referenceExplanation:question.referenceExplanation,applicableConditions:question.applicableConditions,reasoningCriteria:question.reasoningCriteria,contrast:question.contrast,isTeachingOnly:true,formalEvidenceCreated:false};}
}
