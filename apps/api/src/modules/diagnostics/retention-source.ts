import { atomDefinitionFingerprint } from './measurement-definition';
import { resolveClassroomRetentionContext } from './classroom-retention-origin';
import { retentionDigest,type RetentionExposure } from './retention-anchor';

type Row=Record<string,any>;
export type RetentionRetainedRecords=Record<string,readonly Row[]|undefined>;
type Target={studentId:string;subject:'math'|'chinese'|'english'|'chemistry';atomId:string;definitionFingerprint:string};
/** Derive only necessary source identities. Never return questions, private text or answers. */
export function collectRetentionExposures(records:RetentionRetainedRecords,target:Target):RetentionExposure[]{
 const rows=(name:string)=>records[name]??[],result:RetentionExposure[]=[];
 const scoped=(row:Row)=>row.studentId===target.studentId&&row.subject===target.subject;
 const add=(id:string,kind:RetentionExposure['kind'],sourceId:string,at:string,definitionFingerprint:string|null,proof:unknown,sourceRetained=true,atomId:string|null=target.atomId)=>result.push({id,studentId:target.studentId,subject:target.subject,atomId,definitionFingerprint,kind,sourceId,at,sourceRetained,operationFingerprint:retentionDigest(proof)});
 const definition=(atom:Row|undefined)=>{try{return atom?atomDefinitionFingerprint(atom as any):null;}catch{return null;}};
 const practices=rows('practiceSessions').filter(row=>scoped(row)&&row.atomId===target.atomId);
 for(const session of practices){
  const fingerprint=definition(session.atomSnapshot);
  add('practice:'+session.id+':opened','practice_opened',session.id,session.createdAt,fingerprint,{id:session.id,at:session.createdAt,atomId:session.atomId,definitionFingerprint:fingerprint,snapshotOrigin:session.snapshotOrigin});
  for(const attempt of rows('practiceAttempts').filter(row=>row.sessionId===session.id))add('practice-attempt:'+attempt.id,'practice_attempt',attempt.id,attempt.submittedAt,fingerprint,{id:attempt.id,sessionId:session.id,questionId:attempt.questionId,at:attempt.submittedAt,attempt:attempt.attempt},session.questionIds?.includes(attempt.questionId)===true);
  for(const hint of rows('practiceHints').filter(row=>row.sessionId===session.id))add('practice-hint:'+hint.id,'practice_hint',hint.id,hint.at,fingerprint,{id:hint.id,sessionId:session.id,questionId:hint.questionId,level:hint.level,at:hint.at},session.questionIds?.includes(hint.questionId)===true);
  for(const start of rows('assistantPracticeGroupStarts').filter(row=>row.practiceSessionId===session.id&&row.studentId===target.studentId&&row.atomId===target.atomId))for(const command of start.commands??[]){
   if(!['solution','guardian_demonstration'].includes(command.kind))continue;
   const retained=session.sourceGroupId===start.id&&session.assistantAssignmentId===start.assignmentId&&session.questionIds?.includes(command.questionId)===true&&command.receipt?.providedAt===command.providedAt;
   add('practice-help:'+start.id+':'+command.key,command.kind==='solution'?'practice_reference':'practice_demonstration',start.id,command.providedAt,fingerprint,{startId:start.id,key:command.key,kind:command.kind,requestHash:command.requestHash,sequence:command.sequence,providedAt:command.providedAt},retained);
  }
 }
 for(const session of rows('diagnosticSessions').filter(scoped)){
  for(const hint of rows('diagnosticHints').filter(row=>row.sessionId===session.id)){
   const mapping=session.itemSnapshots?.find((row:Row)=>row.id===hint.itemId);if(mapping&&mapping.atomId!==target.atomId)continue;
   const fingerprint=definition(session.atomSnapshots?.find((row:Row)=>row.id===target.atomId));add('diagnostic-hint:'+hint.id,'diagnostic_hint',hint.id,hint.at,fingerprint,{id:hint.id,sessionId:session.id,itemId:hint.itemId,level:hint.level,at:hint.at},!!mapping,mapping?target.atomId:null);
  }
 }
 for(const session of rows('assistantTeachingSessions').filter(row=>scoped(row)&&row.protocol==='assistant-generated-student-session-v1')){
  const assignment=rows('assistantTeachingAssignments').find(row=>row.id===session.assignmentId&&scoped(row)),targetSnapshot=assignment?.targetScope?.kind==='student'?assignment.targetScope.targets?.find((row:Row)=>row.atomId===target.atomId):null;
  const relevant=session.contentSnapshot?.questions?.filter((row:Row)=>row.targetAtomIds?.includes(target.atomId))??[];if(!relevant.length)continue;
  const fingerprint=targetSnapshot?.definitionFingerprint??null,retained=!!assignment&&assignment.sessionId===session.id&&assignment.payloadFingerprint===session.assignmentFingerprint;
  add('generated:'+session.id+':opened','generated_teaching_opened',session.id,session.createdAt,fingerprint,{id:session.id,at:session.createdAt,assignmentFingerprint:session.assignmentFingerprint,contentFingerprint:session.contentFingerprint,definitionFingerprint:fingerprint},retained);
  for(const attempt of session.attempts??[])if(relevant.some((question:Row)=>question.id===attempt.questionId))add('generated-attempt:'+attempt.id,'generated_teaching_attempt',attempt.id,attempt.submittedAt,fingerprint,{id:attempt.id,sessionId:session.id,questionId:attempt.questionId,at:attempt.submittedAt,attempt:attempt.attempt},retained);
  for(const help of session.helps??[])if(relevant.some((question:Row)=>question.id===help.questionId))add('generated-help:'+help.id,'generated_teaching_help',help.id,help.providedAt,fingerprint,{id:help.id,sessionId:session.id,questionId:help.questionId,at:help.providedAt,kind:help.kind,level:help.level},retained);
 }
 for(const session of rows('classroomSessions').filter(row=>row.studentId===target.studentId))for(const display of session.retentionDisplays??[]){
  if(display.subject!==target.subject)continue;const snapshot=display.targets?.find((row:Row)=>row.atomId===target.atomId);if(!snapshot&&!display.unmappedTarget)continue;
  const actor=rows('users').find(row=>row.id===display.actorId&&row.role==='student'),authorization=rows('students').some(row=>row.id===target.studentId&&row.userId===display.actorId),definitionFingerprint=snapshot?.definitionFingerprint??null;
  const retained=!!actor&&authorization&&session.ownerUserId===display.actorId&&session.contentFingerprint===display.contentFingerprint&&session.lessonId===display.lessonId&&session.lesson.steps.some((step:Row)=>step.id===display.stepId);
  add('classroom-display:'+display.id+':'+target.atomId,'classroom_teaching_displayed',session.id,display.at,definitionFingerprint,{id:display.id,sourceId:session.id,sourceFingerprint:display.contentFingerprint,sourceLessonId:display.lessonId,stepId:display.stepId,sentence:display.sentence,at:display.at,definitionFingerprint},retained,snapshot?target.atomId:null);
 }
 for(const session of rows('classroomSessions').filter(row=>row.studentId===target.studentId)){
  const gap=session.retentionLegacyGap,old=!session.retentionContext&&(session.revealed>0||(session.hintReceipts??[]).length||(session.answers??[]).length||(session.messages??[]).some((row:Row)=>row.role==='assistant'));
  if(!gap&&!old)continue;
  const actor=rows('users').find(row=>row.id===session.ownerUserId&&row.role==='student'),actual=rows('students').some(row=>row.id===target.studentId&&row.userId===session.ownerUserId);if(!actor||!actual)continue;
  const subject=gap?.subject??resolveClassroomRetentionContext(records,session as any)?.subject;
  if(subject&&subject!==target.subject)continue;
  const fromAt=gap?.fromAt??session.createdAt,throughAt=gap?.throughAt??session.updatedAt;
  add('legacy-classroom-unverified:'+session.id,'classroom_teaching_displayed',session.id,'',null,{sessionId:session.id,contentFingerprint:session.contentFingerprint,fromAt,throughAt},false,null);
  result.at(-1)!.possibleAtRange={fromAt,throughAt};
 }
 for(const session of rows('classroomSessions').filter(row=>row.studentId===target.studentId&&row.retentionContext?.subject===target.subject)){
  const context=session.retentionContext,snapshot=context.targets.find((row:Row)=>row.atomId===target.atomId);if(!snapshot&&!context.unmappedTarget)continue;
  const fingerprint=snapshot?.definitionFingerprint??null,retained=rows('users').some(row=>row.id===session.ownerUserId&&row.role==='student')&&rows('students').some(row=>row.id===target.studentId&&row.userId===session.ownerUserId)&&context.contentFingerprint===session.contentFingerprint;
  for(const hint of (session.hintReceipts??[]).slice(session.retentionLegacyGap?.previousHintCount??0))add('classroom-hint:'+session.id+':'+hint.questionId+':'+hint.level+':'+target.atomId,'classroom_hint',session.id,hint.at,fingerprint,{sessionId:session.id,questionId:hint.questionId,level:hint.level,at:hint.at,contentFingerprint:session.contentFingerprint},retained&&session.lesson.questions.some((question:Row)=>question.id===hint.questionId),snapshot?target.atomId:null);
  for(const message of (session.messages??[]).slice(session.retentionLegacyGap?.previousMessageCount??0).filter((row:Row)=>row.role==='assistant'))add('classroom-message:'+message.id+':'+target.atomId,'classroom_hint',session.id,message.at,fingerprint,{sessionId:session.id,messageId:message.id,at:message.at,contentDigest:retentionDigest(message.content),contentFingerprint:session.contentFingerprint},retained,snapshot?target.atomId:null);
  for(const answer of (session.answers??[]).slice(session.retentionLegacyGap?.previousAnswerCount??0))add('classroom-feedback:'+session.id+':'+answer.questionId+':'+target.atomId,'classroom_feedback',session.id,answer.at,fingerprint,{sessionId:session.id,questionId:answer.questionId,at:answer.at,feedbackDigest:retentionDigest({explanation:answer.explanation,correctIndices:answer.correctIndices,optionExplanations:answer.optionExplanations}),contentFingerprint:session.contentFingerprint},retained&&session.lesson.questions.some((question:Row)=>question.id===answer.questionId),snapshot?target.atomId:null);
 }
 for(const source of result){
  if(source.kind.startsWith('practice_')){const original=source.kind==='practice_attempt'?rows('practiceAttempts').find(row=>row.id===source.sourceId):source.kind==='practice_hint'?rows('practiceHints').find(row=>row.id===source.sourceId):null,start=['practice_reference','practice_demonstration'].includes(source.kind)?rows('assistantPracticeGroupStarts').find(row=>row.id===source.sourceId):null,session=practices.find(row=>row.id===(original?.sessionId??start?.practiceSessionId??source.sourceId));if(session)source.navigation={sessionId:session.id,...(original?.questionId?{questionId:original.questionId}:{}),...(session.assistantAssignmentId?{assignmentId:session.assistantAssignmentId}:{}),origin:session.origin??'guidance'};}
  else if(source.kind.startsWith('generated_teaching_')){const session=rows('assistantTeachingSessions').find(row=>row.id===source.sourceId||(row.attempts??[]).some((row:Row)=>row.id===source.sourceId)||(row.helps??[]).some((row:Row)=>row.id===source.sourceId));if(session)source.navigation={sessionId:session.id,assignmentId:session.assignmentId,...((session.attempts??[]).find((row:Row)=>row.id===source.sourceId)?.questionId?{questionId:(session.attempts??[]).find((row:Row)=>row.id===source.sourceId).questionId}:{})};}
  else if(source.kind==='diagnostic_hint'){const hint=rows('diagnosticHints').find(row=>row.id===source.sourceId);if(hint)source.navigation={sessionId:hint.sessionId};}
  else if(source.kind==='classroom_hint'||source.kind==='classroom_feedback'||source.kind==='classroom_teaching_displayed')source.navigation={sessionId:source.sourceId};
 }
 return result.sort((a,b)=>String(a.at).localeCompare(String(b.at))||a.id.localeCompare(b.id));
}
