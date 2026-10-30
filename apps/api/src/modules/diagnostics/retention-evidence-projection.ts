import type { DiagnosticResponse,DiagnosticSession,KnowledgeAtom } from '@study-agent/contracts';
import { atomDefinitionFingerprint,responseDefinitionFingerprint } from './measurement-definition';
import { collectRetentionExposures,type RetentionRetainedRecords } from './retention-source';
import { measureRetentionAnchor,RETENTION_PROTOCOL,type RetentionAnchorResult } from './retention-anchor';
type Subject='math'|'chinese'|'english'|'chemistry';
export type RetentionResponse=DiagnosticResponse&{retentionEvidence?:RetentionAnchorResult};
type Context={records:RetentionRetainedRecords;sessions:readonly DiagnosticSession[];responses:readonly DiagnosticResponse[]};
export function independentSessionRetainedAt(source:DiagnosticSession,cutoff:string){
 const ended=source.completedAt??source.endedAt;
 return ['completed','aborted'].includes(source.status)&&!!ended&&Number.isFinite(Date.parse(ended))&&Date.parse(ended)<=Date.parse(cutoff);
}
/** Current-method view; every stored raw response and old report remains untouched. */
export function projectRetentionEvidence(response:DiagnosticResponse,context:Context):RetentionResponse{
 const session=context.sessions.find(row=>row.id===response.sessionId&&row.studentId===response.studentId);
 if(!session||session.intent!=='retest')return response;
 const mapping=session.itemSnapshots.find(row=>row.id===response.itemId&&row.atomId===response.atomId),atom=session.atomSnapshots?.find(row=>row.id===response.atomId);
 if(!mapping||!atom)return{...response,retentionDelayDays:null};
 const sessions=new Map(context.sessions.map(row=>[row.id,row])),fingerprint=atomDefinitionFingerprint(atom),review=(context.records.reviewTasks??[]).find(row=>row.id===session.reviewTaskId&&row.planId===session.planId&&row.studentId===response.studentId&&row.atomId===response.atomId),intervalDays=[1,3,7,14].includes(review?.intervalDays)?review!.intervalDays:1;
 const originalPlan=review?(context.records.diagnosticPlans??[]).find(row=>row.id===review.planId&&row.studentId===session.studentId):null;
 const baselines=context.responses.flatMap(original=>{
  if(originalPlan&&original.sessionId!==originalPlan.baselineSessionId)return[];
  const source=sessions.get(original.sessionId);if(!source||source.subject!==session.subject||source.studentId!==session.studentId||original.atomId!==response.atomId)return[];
  return[{id:original.id,sessionId:original.sessionId,studentId:original.studentId,subject:source.subject as Subject,atomId:original.atomId,definitionFingerprint:responseDefinitionFingerprint(original,sessions)??'',submittedAt:original.submittedAt,correct:original.correct,status:original.status,disposition:original.disposition,hintLevel:original.hintLevel,priorExposure:!!original.priorExposure,
   sourceRetained:independentSessionRetainedAt(source,session.startedAt)&&!!source.questionSnapshots?.some(row=>row.id===original.questionId)&&!!source.itemSnapshots?.some(row=>row.id===original.itemId&&row.atomId===original.atomId&&row.version===original.mappingVersion)}];
 });
 const sources=collectRetentionExposures(context.records,{studentId:session.studentId,subject:session.subject,atomId:atom.id,definitionFingerprint:fingerprint}),snapshot=measureRetentionAnchor({studentId:session.studentId,subject:session.subject,atomId:atom.id,definitionFingerprint:fingerprint,sessionId:session.id,startedAt:session.startedAt,answeredAt:response.submittedAt,intervalDays,
  answer:{status:response.status,disposition:response.disposition,hintLevel:response.hintLevel,priorExposure:!!response.priorExposure},baselines,exposures:sources});
 return{...response,dimension:snapshot.eligible?'retention':mapping.dimension??response.dimension,retentionEvidence:snapshot,retentionDelayDays:snapshot.elapsedDays};
}
export function isIndependentRetention(response:RetentionResponse){return response.dimension==='retention'&&response.retentionEvidence?.protocol===RETENTION_PROTOCOL&&response.retentionEvidence.eligible===true&&response.status==='scored'&&response.disposition==='answered'&&response.hintLevel===0&&!response.priorExposure;}
export function retentionMethodAffectsReport(report:{evidence?:DiagnosticResponse[];estimates?:Array<{retentionVerified:boolean}>;retentionProtocol?:string}){
 return report.retentionProtocol!==RETENTION_PROTOCOL&&((report.evidence??[]).some(row=>row.dimension==='retention'||row.retentionDelayDays!=null)||(report.estimates??[]).some(row=>row.retentionVerified));
}
