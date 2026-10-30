import type { DiagnosticResponse,ControlledCause,ControlledContrastResult,ControlledCauseState } from '@study-agent/contracts';
import { assertControlledContrastSource } from './controlled-contrast-source';
import type { ControlledContrastBlueprint } from './controlled-contrast-selection';
import { assertControlledPublication,type ControlledContrastPublication } from './controlled-contrast-publication';
import { evaluateControlledContrasts } from './controlled-contrast-result';
import { collectRetentionExposures,type RetentionRetainedRecords } from './retention-source';
import { retentionDigest } from './retention-anchor';

export const CONTROLLED_CAUSE_RULE_VERSION='controlled-cause-rules-v1';
export type { ControlledCauseState } from '@study-agent/contracts';
type OriginalObservation={sessionId:string;studentId:string;subject:ControlledContrastBlueprint['subject'];status:'completed'|'aborted';startedAt:string;endedAt:string;publication:ControlledContrastPublication;blueprint:ControlledContrastBlueprint;responses:readonly DiagnosticResponse[]};

/** Rebuild actual ended observations; a caller-supplied result hash is never a diagnosis input. */
export function deriveControlledCause(input:{studentId:string;subject:ControlledContrastBlueprint['subject'];atomId:string;definitionFingerprint:string;cause:ControlledCause;observations:readonly OriginalObservation[];records:RetentionRetainedRecords;at:string;previous?:ControlledCauseState}){
 const cutoff=Date.parse(input.at);if(!Number.isFinite(cutoff))throw Error('invalid_controlled_cause_analysis_time');
 const id='controlled_hypothesis:'+retentionDigest({studentId:input.studentId,atomId:input.atomId,cause:input.cause,definitionFingerprint:input.definitionFingerprint}),previous=input.previous;
 if(previous&&(previous.id!==id||previous.studentId!==input.studentId||previous.subject!==input.subject||previous.atomId!==input.atomId||previous.cause!==input.cause||previous.definitionFingerprint!==input.definitionFingerprint))throw Error('controlled_cause_original_scope_mismatch');
 const observations=input.observations.filter(row=>row.studentId===input.studentId&&row.subject===input.subject&&row.blueprint.atomId===input.atomId&&row.blueprint.definitionFingerprint===input.definitionFingerprint&&row.blueprint.cause===input.cause&&['completed','aborted'].includes(row.status)&&Number.isFinite(Date.parse(row.startedAt))&&Number.isFinite(Date.parse(row.endedAt))&&Date.parse(row.startedAt)<=Date.parse(row.endedAt)&&Date.parse(row.endedAt)<=cutoff).sort((a,b)=>a.endedAt.localeCompare(b.endedAt)||a.sessionId.localeCompare(b.sessionId));
 const seenSessions=new Set<string>(),seenFamilies=new Set<string>(),results:Array<{sessionId:string;startedAt:string;endedAt:string;result:ControlledContrastResult}>=[],supports:Array<{at:string;ids:string[];family:string}>=[],counters:Array<{at:string;startedAt:string;ids:string[];family:string}>=[];
 for(const original of observations){
  if(seenSessions.has(original.sessionId))throw Error('controlled_cause_duplicate_original_session');seenSessions.add(original.sessionId);assertControlledPublication(original.publication);assertControlledContrastSource(original.blueprint,original.publication.content,packet=>original.publication.originals.some(value=>retentionDigest(value.packet)===retentionDigest(packet)));
  if(original.responses.some(row=>row.sessionId===original.sessionId&&Date.parse(row.submittedAt)>Date.parse(original.endedAt)))throw Error('controlled_cause_original_answer_after_end');
  const result=evaluateControlledContrasts(original.blueprint,original.responses,original.sessionId,{sourceScope:'retained-platform-sources-v1',startedAt:original.startedAt,records:input.records});results.push({sessionId:original.sessionId,startedAt:original.startedAt,endedAt:original.endedAt,result});
  for(const unit of result.units){if(seenFamilies.has(unit.familyKey))continue;seenFamilies.add(unit.familyKey);if(unit.status==='directional_difference')supports.push({at:original.endedAt,ids:unit.evidenceIds,family:unit.familyKey});else if(['counterevidence','reverse_difference'].includes(unit.status))counters.push({at:original.endedAt,startedAt:original.startedAt,ids:unit.evidenceIds,family:unit.familyKey});}
 }
 const supportingUnits=supports.length,counterUnits=counters.length,supported=supportingUnits>=2,contradicted=counterUnits>=2;
 let status:ControlledCauseState['status']=supported&&contradicted?'inconclusive':supported?'supported':contradicted?'contradicted':'proposed';
 const sameRules=previous?.ruleVersion===CONTROLLED_CAUSE_RULE_VERSION,lastSupport=supports.at(-1)?.at,teaching=collectRetentionExposures(input.records,{studentId:input.studentId,subject:input.subject,atomId:input.atomId,definitionFingerprint:input.definitionFingerprint}).filter(source=>{
  if(!source.kind.startsWith('practice_'))return true;
  const practice=(input.records.practiceSessions??[]).find(row=>row.id===source.sourceId||(input.records.practiceAttempts??[]).some(answer=>answer.id===source.sourceId&&answer.sessionId===row.id)||(input.records.practiceHints??[]).some(hint=>hint.id===source.sourceId&&hint.sessionId===row.id));
  const actor=practice?.controlledGuidanceOrigin?.actorId;return !!actor&&(input.records.students??[]).some(row=>row.id===input.studentId&&row.userId===actor)&&(input.records.users??[]).some(row=>row.id===actor&&row.role==='student');
 });
 const sameRuleHistory=previous?.history.filter(row=>row.ruleVersion===CONTROLLED_CAUSE_RULE_VERSION&&Number.isFinite(Date.parse(row.at))&&Date.parse(row.at)<=cutoff)??[];
 const previouslySupported=previous&&(['supported','reopened','resolved'].includes(previous.status)||sameRuleHistory.some(row=>['supported','reopened','resolved'].includes(row.status)));
 let resolvedAfterIntervention=false;
 // Resolution requires new independent counterpairs after a retained actual
 // intervention. Completed plan/calendar rows do not supply such an event.
 if(sameRules&&previous&&previouslySupported&&lastSupport){
  const postIntervention=counters.filter(counter=>Date.parse(counter.startedAt)>Date.parse(lastSupport)&&teaching.some(source=>source.sourceRetained&&source.atomId===input.atomId&&source.definitionFingerprint===input.definitionFingerprint&&Number.isFinite(Date.parse(source.at))&&Date.parse(source.at)>Date.parse(lastSupport)&&Date.parse(source.at)<Date.parse(counter.startedAt)));
  if(postIntervention.length>=2){status='resolved';resolvedAfterIntervention=true;}
 }
 // An intermediate one-pair analysis may be inconclusive. It cannot erase the
 // actual prior resolution milestone or prevent a second later independent
 // support from reopening the same cause. Reanalysis timestamps are not that milestone.
 const lastResolved=sameRuleHistory.filter(row=>row.status==='resolved').at(-1)?.at??(previous?.status==='resolved'&&Date.parse(previous.updatedAt)<=cutoff?previous.updatedAt:undefined);
 if(sameRules&&lastResolved&&!resolvedAfterIntervention&&supports.filter(row=>Date.parse(row.at)>Date.parse(lastResolved)).length>=2)status='reopened';
 const history=[...(previous?.history??[])];if(!previous||previous.status!==status||!sameRules)history.push({at:input.at,status,ruleVersion:CONTROLLED_CAUSE_RULE_VERSION,reason:previous&&!sameRules?'对照规则变化，重新核对原配对；方法变化不表示学习改善。':status==='resolved'?'实际教学之后，新的独立配对形成反证。':status==='reopened'?'原关闭之后，新的独立配对再次出现同方向差异。':'依据实际独立配对同时保留支持、反证和未知条件。'});
 const state:ControlledCauseState={id,studentId:input.studentId,subject:input.subject,atomId:input.atomId,definitionFingerprint:input.definitionFingerprint,cause:input.cause,ruleVersion:CONTROLLED_CAUSE_RULE_VERSION,status,supportingEvidenceIds:[...new Set(supports.flatMap(row=>row.ids))],counterEvidenceIds:[...new Set(counters.flatMap(row=>row.ids))],supportingUnits,counterUnits,updatedAt:input.at,history};
 return{state,results};
}
