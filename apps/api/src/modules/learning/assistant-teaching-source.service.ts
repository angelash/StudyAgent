import { ConflictException,ForbiddenException,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { assistantPracticeContentInputSchema,type AssistantPracticeContentInput,type AssistantPracticeTargetScope } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { AssistantArtifactService } from '../ai/assistant-artifact.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { StudentsService } from '../students/students.service';
import { CurriculumService } from '../diagnostics/curriculum.service';
import { atomDefinitionFingerprint } from '../diagnostics/measurement-definition';
import { AssistantPracticePreflightService } from './assistant-practice-preflight.service';
import { prepareAssistantTeachingPractice,assertPreparedAssistantPractice,type PreparedAssistantPractice } from './assistant-practice-source';
import { captureWhiteboardActorAuthorization } from './topic-whiteboard-access';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';
import type { TopicWhiteboardAuthorization } from './topic-whiteboard-record';
import type { TeachingDraftRecord } from './assistant-teaching-record';

@Injectable()
export class AssistantTeachingSourceService{
 constructor(private readonly store:InMemoryStoreService,private readonly source:AssistantArtifactService,private readonly preflight:AssistantPracticePreflightService,private readonly curriculum:CurriculumService,private readonly students:StudentsService,private readonly models:XiaojiuModelsService,private readonly chat:XiaojiuChatService){}
 private prepare(user:InMemoryUserAccount,sessionId:string,input:AssistantPracticeContentInput){
  const {modelId:_modelId,...sourceInput}=input,checked=this.preflight.preflight(user,sessionId,sourceInput);
  if(checked.blocked&&checked.blocked.code!=='practice_coverage_gap')throw new ConflictException(checked.blocked.message);
  if(input.audience.kind==='student'&&checked.origin.studentId===null&&!input.acknowledgeAudienceTransfer)throw new ConflictException('请明确核对把本人原解释用于这位孩子的教学范围。');
  let targetScope:AssistantPracticeTargetScope={kind:'adult'};
  if(input.audience.kind==='student'){
   const audience=input.audience,scope=this.curriculum.getScope(user,audience.studentId,audience.subject);
   if(!scope?.confirmedAt)throw new ConflictException('请先确认本人教学范围。');
   const targets=audience.targetAtomIds.map(id=>{const atom=this.store.find('knowledgeAtoms',{id});if(!atom)throw new ConflictException('原教学目标已变化。');return{atomId:atom.id,name:atom.name,objective:atom.objective,subject:atom.subject,grade:atom.grade,term:atom.term,definitionFingerprint:atomDefinitionFingerprint(atom)};});
   targetScope={kind:'student',studentId:audience.studentId,subject:audience.subject,scopeGrade:scope.grade,scopeTerm:scope.term,scopeVersion:scope.version,profileGrade:checked.audience.profileGrade!,scopeFingerprint:digest(scope),targets};
  }
  const model=this.models.resolve(input.modelId);
  // D1 has no model field. The strict source adapter receives only its actual input.
  const prepared=prepareAssistantTeachingPractice(checked.origin,input,targetScope,model,true);
  return{prepared,checked,model};
 }
 capture(user:InMemoryUserAccount,sessionId:string,auth:InMemoryAuthSession,studentId:string|null){
  const original=this.source.assertReadableSession(user,sessionId);
  if(original.studentId!==null&&original.studentId!==studentId)throw new ForbiddenException('原对话与当前教学受众不一致。');
  return captureWhiteboardActorAuthorization(this.store,this.students,user,studentId,auth);
 }
 preview(user:InMemoryUserAccount,sessionId:string,value:unknown,auth:InMemoryAuthSession){
  const input=validate(assistantPracticeContentInputSchema,value),{prepared,checked,model}=this.prepare(user,sessionId,input);
  this.capture(user,sessionId,auth,input.audience.kind==='student'?input.audience.studentId:null);
  return{protocol:'assistant-generated-practice-preflight-v1',origin:prepared.source.origin,sourceFingerprint:prepared.source.sourceFingerprint,audience:prepared.targetScope,coverage:checked.coverage,fingerprint:prepared.fingerprint,modelId:model.id,modelName:model.label,contextCharacters:prepared.context.length,maxContextCharacters:18000,available:this.chat.enabled,canGenerate:this.chat.enabled,isTeachingOnly:true,formalEvidenceCreated:false,...(!this.chat.enabled?{blocked:{code:'model_unavailable',message:'模型暂不可用，完整来源与目标保持。'}}:{})};
 }
 create(user:InMemoryUserAccount,sessionId:string,input:AssistantPracticeContentInput,auth:InMemoryAuthSession){
  const {prepared}=this.prepare(user,sessionId,input),authorization=this.capture(user,sessionId,auth,input.audience.kind==='student'?input.audience.studentId:null);
  if(!this.chat.enabled)throw new ServiceUnavailableException('模型暂不可用，请保留完整输入后重试。');return{prepared,authorization};
 }
 assertCurrent(user:InMemoryUserAccount,prepared:PreparedAssistantPractice){
  assertPreparedAssistantPractice(prepared);const current=this.prepare(user,prepared.source.origin.sessionId,{...prepared.input,modelId:prepared.modelId});
  // The initial command may omit Auto's resolved model; compare its source/scope
  // with the exact same saved input so a later default cannot change the model.
  const rebuilt=prepareAssistantTeachingPractice(current.prepared.source.origin,prepared.input,current.prepared.targetScope,{id:prepared.modelId,label:prepared.modelName},true);
  if(rebuilt.fingerprint!==prepared.fingerprint)throw new ConflictException('原消息、当前范围或教学目标已有变化，请保留原稿并重新核对。');
 }
 authority(row:TeachingDraftRecord){
  const actor=this.store.find('users',{id:row.ownerUserId,role:row.ownerRole,status:'active'}),session=this.store.find('sessions',{userId:row.ownerUserId,tokenHash:row.authorization.sessionTokenHash});
  if(!actor||!session)throw new ForbiddenException('原教学授权已变化。');const current=this.capture(actor,row.sourceSessionId,session,row.studentId);
  if(digest(current)!==digest(row.authorization))throw new ForbiddenException('原教学授权已撤回。');this.assertCurrent(actor,row.prepared);return actor;
 }
}
