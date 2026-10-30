import { atomDefinitionFingerprint } from './measurement-definition';
import { assertRetentionExposureRecords,retentionEventId } from './retention-native';
import { collectRetentionExposures } from './retention-source';
import { assertClassroomRetentionRecord } from './classroom-retention-record';
import { projectRetentionEvidence } from './retention-evidence-projection';
import { retentionDigest } from './retention-anchor';
import type { RetentionRetainedRecords } from './retention-source';
import { assertClassroomRetentionOrigins } from './classroom-retention-origin';
type NativeRow={collection:string;record_id?:string;body:unknown};
/** Replay at the original server cutoff; later teaching or scoring cannot rewrite a prior answer. */
export function assertRetentionNativeRows(rows:NativeRow[]){
 try{
  const values:RetentionRetainedRecords={};for(const row of rows){const body=typeof row.body==='string'?JSON.parse(row.body):row.body;if(!body||typeof body!=='object'||row.record_id!==undefined&&(body as any).id!==row.record_id)throw Error();values[row.collection]??=[];(values[row.collection]as any[]).push(body);}
  if(!(values.retentionExposureEvents?.length||values.practiceSessions?.some(row=>row.retentionProtocol)||values.assistantTeachingSessions?.some(row=>row.retentionProtocol)||values.diagnosticResponses?.some(row=>row.retentionEvidence)||values.diagnosticSessions?.some(row=>row.retentionProtocol)||values.classroomSessions?.some(row=>row.retentionContext||row.retentionDisplays?.length||row.retentionLegacyGap)))return;
  for(const row of values.classroomSessions??[])assertClassroomRetentionRecord(row as any);
  assertClassroomRetentionOrigins(values);
  assertRetentionExposureRecords(values);
  for(const session of [...(values.practiceSessions??[]),...(values.assistantTeachingSessions??[])]){
   if(!session.retentionProtocol)continue;if(session.retentionProtocol!=='teaching-retention-v1')throw Error();
   const assignment=(values.assistantTeachingAssignments??[]).find(row=>row.id===session.assignmentId);
   const targets=session.atomSnapshot?[{atomId:session.atomId,definitionFingerprint:atomDefinitionFingerprint(session.atomSnapshot)}]:assignment?.targetScope.kind==='student'?assignment.targetScope.targets:[];
   if(!targets.length)throw Error();
   for(const target of targets)for(const source of collectRetentionExposures(values,{studentId:session.studentId,subject:session.subject,atomId:target.atomId,definitionFingerprint:target.definitionFingerprint}).filter(source=>source.navigation?.sessionId===session.id)){
    if(!(values.retentionExposureEvents??[]).some(row=>row.id===retentionEventId(source.id,session.studentId,target.atomId)))throw Error();
   }
  }
  for(const session of values.classroomSessions??[]){
   const context=session.retentionContext;if(!context)continue;
   for(const target of context.targets)for(const source of collectRetentionExposures(values,{studentId:context.studentId,subject:context.subject,...target}).filter(source=>source.sourceId===session.id&&!source.possibleAtRange)){
    if(!(values.retentionExposureEvents??[]).some(row=>row.id===retentionEventId(source.id,context.studentId,target.atomId)))throw Error();
   }
  }
  for(const session of values.diagnosticSessions??[]){
   if(session.retentionProtocol&&session.retentionProtocol!=='teaching-retention-v1')throw Error();
   if(session.retentionProtocol==='teaching-retention-v1'&&session.intent==='retest'&&(values.diagnosticResponses??[]).some(row=>row.sessionId===session.id&&!row.retentionEvidence))throw Error();
  }
  for(const row of values.diagnosticResponses??[]){
   if(!row.retentionEvidence)continue;const session=values.diagnosticSessions?.find(session=>session.id===row.sessionId&&session.studentId===row.studentId),atom=session?.atomSnapshots?.find((atom:any)=>atom.id===row.atomId);
   const mapping=session?.itemSnapshots?.find((item:any)=>item.id===row.itemId&&item.atomId===row.atomId&&item.version===row.mappingVersion);
   if(!session||session.intent!=='retest'||!mapping||mapping.questionId&&mapping.questionId!==row.questionId||!session.questionSnapshots?.some((question:any)=>question.id===row.questionId)||!atom||atomDefinitionFingerprint(atom)!==row.retentionEvidence.definitionFingerprint||row.retentionEvidence.answeredAt!==row.submittedAt||row.retentionEvidence.sessionId!==row.sessionId||row.retentionEvidence.studentId!==row.studentId||row.retentionEvidence.atomId!==row.atomId)throw Error();
   const cutoff=row.submittedAt,responses=(values.diagnosticResponses??[]).map(original=>{
    const revision=values.scoringRevisions?.filter(revision=>revision.responseId===original.id&&revision.createdAt<=cutoff).sort((a,b)=>b.version-a.version)[0];
    return revision?{...original,score:revision.score,correct:revision.score===1,status:'scored',gradingVersion:'review-v'+revision.version}:original;
   });
   // The current answer itself retains its original status/score; later review
   // creates a method projection and a new report, not another original answer.
   const projected=projectRetentionEvidence(row as any,{records:values,sessions:(values.diagnosticSessions??[])as any,responses:responses as any});
   if(!projected.retentionEvidence||projected.dimension!==row.dimension||retentionDigest(projected.retentionEvidence)!==retentionDigest(row.retentionEvidence)||row.retentionDelayDays!==projected.retentionEvidence.elapsedDays)throw Error();
  }
 }catch(error){throw Error('retention_saved_integrity_failed',{cause:error});}
}
