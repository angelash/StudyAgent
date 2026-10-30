import type { DiagnosticSession, DiagnosticResponse, DiagnosticReport, ScoringRevision } from '@study-agent/contracts';
import { controlledSessionOf } from './controlled-session-origin';
import type { ControlledContrastPublication } from './controlled-contrast-publication';
import type { RetentionRetainedRecords } from './retention-source';
import { deriveControlledCause } from './controlled-cause-lifecycle';
import { evaluateControlledContrasts } from './controlled-contrast-result';
import { retentionDigest } from './retention-anchor';

type ReportRow = {id:string;sessionId:string;version:number;createdAt:string;report:DiagnosticReport};
/** Rebuild saved paired reports from actual first responses, scoring revisions,
 * original publications and retained teaching. Old report snapshots stay intact.
 */
export function assertControlledReportRecords(input:{sessions:readonly DiagnosticSession[];responses:readonly DiagnosticResponse[];reports:readonly ReportRow[];
  publications:readonly ControlledContrastPublication[];revisions:readonly ScoringRevision[];records:RetentionRetainedRecords}){
 try{
  const same=(left:unknown,right:unknown)=>retentionDigest(left)===retentionDigest(right),bySession=new Map(input.sessions.map(row=>[row.id,row]));
  for(const saved of input.reports){
   const session=bySession.get(saved.sessionId),controlled=session&&controlledSessionOf(session),report=saved.report;
   if(!controlled&&report.controlledContrast)throw Error();
   if(!controlled&&report.controlledCauses===undefined)continue;
   const at=session?.completedAt??session?.endedAt;
   if(!session||!at||!['completed','aborted'].includes(session.status)||!Number.isFinite(Date.parse(saved.createdAt))||Date.parse(saved.createdAt)<Date.parse(at)||
      report.sessionId!==session.id||report.studentId!==session.studentId||report.subject!==session.subject)throw Error();
   const history=input.sessions.filter(row=>row.studentId===session.studentId&&row.subject===session.subject),starts=new Map(history.map(row=>[row.id,Date.parse(row.startedAt)])),firstSeen=new Map<string,number>();
   for(const origin of history)for(const question of origin.questionSnapshots??[]){const start=starts.get(origin.id)!;if(Number.isFinite(start)&&start<(firstSeen.get(question.id)??Infinity))firstSeen.set(question.id,start);}
   const responses=input.responses.filter(row=>row.studentId===session.studentId&&history.some(origin=>origin.id===row.sessionId&&['completed','aborted'].includes(origin.status))).map(original=>{
    const knownEarlier=(firstSeen.get(original.questionId)??Infinity)<(starts.get(original.sessionId)??-Infinity),row=knownEarlier&&!original.priorExposure?{...original,priorExposure:true}:original;
    const revision=input.revisions.filter(revision=>revision.responseId===row.id&&Date.parse(revision.createdAt)<=Date.parse(saved.createdAt)).sort((a,b)=>b.version-a.version)[0];
    return revision?{...row,score:revision.score,correct:revision.score===1,status:'scored' as const,gradingReason:revision.reason,gradingVersion:`review-v${revision.version}`,
      scoreDetails:revision.ratings?.map(rating=>({key:`criterion-${rating.criterionIndex}`,label:revision.rubricSnapshot?.[rating.criterionIndex]?.criterion??`量规${rating.criterionIndex+1}`,score:rating.score,origin:'review' as const,observation:rating.observation}))}:row;
   });
   if(controlled){
    const evidence=responses.filter(row=>row.sessionId===session.id&&Date.parse(row.submittedAt)<=Date.parse(at)).sort((a,b)=>session.itemIds.indexOf(a.itemId)-session.itemIds.indexOf(b.itemId)),scored=evidence.filter(row=>row.status==='scored'&&row.score!==null);
    if(!same(report.evidence,evidence))throw Error('controlled_report_first_evidence_changed');
    if(report.answeredCount!==evidence.length||report.totalCount!==session.itemIds.length||report.scoredCount!==scored.length||report.pendingReviewCount!==evidence.filter(row=>row.status==='pending_review').length||
       report.rawScore!==(scored.length?Math.round(scored.reduce((sum,row)=>sum+row.score!,0)/scored.length*100):null))throw Error('controlled_report_raw_counts_changed');
    if(!same(report.controlledContrast,evaluateControlledContrasts(controlled.controlledContrast,evidence,session.id,{sourceScope:'retained-platform-sources-v1',startedAt:session.startedAt,records:input.records})))throw Error('controlled_report_actual_pair_result_changed');
   }
   const observations=history.flatMap(source=>{
    const origin=controlledSessionOf(source),end=origin?.completedAt??origin?.endedAt;if(!origin||!end||!['completed','aborted'].includes(origin.status)||Date.parse(end)>Date.parse(at))return[];
    const publication=input.publications.find(row=>row.id===origin.controlledOrigin.publicationId);if(!publication)throw Error();
    return[{sessionId:origin.id,studentId:session.studentId,subject:session.subject,status:origin.status as 'completed'|'aborted',startedAt:origin.startedAt,endedAt:end,publication,blueprint:origin.controlledContrast,responses:responses.filter(row=>row.sessionId===origin.id)}];
   });
   const groups=new Map(observations.map(row=>[retentionDigest({atomId:row.blueprint.atomId,definitionFingerprint:row.blueprint.definitionFingerprint,cause:row.blueprint.cause}),row]));
   const previous=input.reports.filter(row=>row.id!==saved.id&&row.report.studentId===session.studentId&&row.report.subject===session.subject&&Date.parse(row.createdAt)<=Date.parse(at))
     .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.version-b.version||a.id.localeCompare(b.id)).flatMap(row=>row.report.controlledCauses??[]);
   const expected=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,row])=>{const blueprint=row.blueprint,old=previous.filter(state=>state.atomId===blueprint.atomId&&state.definitionFingerprint===blueprint.definitionFingerprint&&state.cause===blueprint.cause).at(-1);
    return deriveControlledCause({studentId:session.studentId,subject:session.subject,atomId:blueprint.atomId,definitionFingerprint:blueprint.definitionFingerprint,cause:blueprint.cause,observations,records:input.records,at,...(old?{previous:old}:{})}).state;});
   if(!same(report.controlledCauses,expected))throw Error();
  }
  if(input.sessions.some(session=>controlledSessionOf(session)&&['completed','aborted'].includes(session.status)&&!input.reports.some(row=>row.sessionId===session.id)))throw Error();
 }catch(error){throw Error('controlled_report_saved_original_integrity_failed',{cause:error});}
}
