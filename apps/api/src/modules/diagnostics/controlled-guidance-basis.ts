import type { DiagnosticGuidancePlan, DiagnosticReport, DiagnosticResponse, DiagnosticSession, GuidancePlanRevision, ControlledGuidanceBasis, PracticeSession } from '@study-agent/contracts';
import { retentionDigest } from './retention-anchor';
import { controlledSessionOf } from './controlled-session-origin';
import { atomDefinitionFingerprint } from './measurement-definition';

export type ControlledGuidanceReportRow={id:string;sessionId:string;version:number;createdAt:string;report:DiagnosticReport};
export const controlledGuidanceReportFingerprint=(row:ControlledGuidanceReportRow)=>retentionDigest({id:row.id,sessionId:row.sessionId,version:row.version,createdAt:row.createdAt,report:row.report});

/** A paired observation supplements an ordinary baseline. It never supplies
 * independent mastery samples, a retention baseline, or a normal hypothesis. */
export function controlledGuidanceBasis(row:ControlledGuidanceReportRow,stateId:string,actionId:string):ControlledGuidanceBasis {
 const state=row.report.controlledCauses?.find(cause=>cause.id===stateId);
 if(!state||!['supported','reopened','inconclusive'].includes(state.status)||state.supportingUnits<2)throw Error('controlled_guidance_support_not_available');
 return {protocol:'controlled-guidance-basis-v1',reportId:row.id,sessionId:row.sessionId,reportVersion:row.version,reportCreatedAt:row.createdAt,
  reportFingerprint:controlledGuidanceReportFingerprint(row),stateId:state.id,atomId:state.atomId,definitionFingerprint:state.definitionFingerprint,cause:state.cause,
  status:state.status,actionId,supportingEvidenceIds:[...state.supportingEvidenceIds],counterEvidenceIds:[...state.counterEvidenceIds]};
}

export function controlledGuidanceBaseline(session:DiagnosticSession,row:ControlledGuidanceReportRow,basis:ControlledGuidanceBasis,responses:readonly DiagnosticResponse[]) {
 if(session.status!=='completed'||controlledSessionOf(session)||row.sessionId!==session.id||row.report.studentId!==session.studentId||row.report.subject!==session.subject)throw Error('controlled_guidance_ordinary_baseline_required');
 const definition=session.atomSnapshots?.find(atom=>atom.id===basis.atomId),estimate=row.report.estimates.find(item=>item.atomId===basis.atomId);
 if(!definition||atomDefinitionFingerprint(definition)!==basis.definitionFingerprint||!estimate)throw Error('controlled_guidance_baseline_definition_mismatch');
 const ids=new Set(estimate.evidenceIds);
 if(!responses.some(answer=>ids.has(answer.id)&&answer.studentId===session.studentId&&answer.atomId===basis.atomId&&answer.evidencePurpose!=='controlled_cause_observation'&&answer.disposition==='answered'&&answer.status==='scored'&&answer.score!==null&&!answer.hintLevel&&!answer.priorExposure))throw Error('controlled_guidance_independent_baseline_evidence_required');
}

export function assertControlledGuidanceRecords(input:{plans:readonly DiagnosticGuidancePlan[];revisions:readonly GuidancePlanRevision[];sessions:readonly DiagnosticSession[];reports:readonly ControlledGuidanceReportRow[];responses:readonly DiagnosticResponse[];practices:readonly PracticeSession[];students:readonly {id:string;userId:string}[];users:readonly {id:string;role:string}[]}) {
 const check=(plan:DiagnosticGuidancePlan)=>{
  const basis=plan.controlledBasis;if(!basis)return;
  const source=input.reports.find(row=>row.id===basis.reportId&&row.sessionId===basis.sessionId&&row.version===basis.reportVersion),sourceSession=input.sessions.find(row=>row.id===basis.sessionId);
  const baseline=input.sessions.find(row=>row.id===plan.baselineSessionId),baselineReport=input.reports.find(row=>row.sessionId===plan.baselineSessionId&&row.version===plan.baselineReportVersion);
  if(!source||!sourceSession||!baseline||!baselineReport||baseline.studentId!==plan.studentId||baseline.subject!==plan.subject||sourceSession.studentId!==plan.studentId||sourceSession.subject!==plan.subject||source.report.studentId!==plan.studentId||source.report.subject!==plan.subject||Date.parse(source.createdAt)>Date.parse(plan.createdAt)||!plan.actions.some(action=>action.id===basis.actionId&&action.atomId===basis.atomId&&action.hypothesisId===null)||retentionDigest(controlledGuidanceBasis(source,basis.stateId,basis.actionId))!==retentionDigest(basis))throw Error('controlled_guidance_saved_source_mismatch');
  controlledGuidanceBaseline(baseline,baselineReport,basis,input.responses);
 };
 for(const plan of input.plans){check(plan);const originals=input.revisions.filter(row=>row.planId===plan.id&&row.snapshot.controlledBasis);for(const original of originals){check(original.snapshot);if(retentionDigest(original.snapshot.controlledBasis)!==retentionDigest(plan.controlledBasis))throw Error('controlled_guidance_original_basis_replaced');}}
 for(const revision of input.revisions)if(revision.snapshot.controlledBasis&&!input.plans.some(plan=>plan.id===revision.planId))throw Error('controlled_guidance_original_plan_missing');
 for(const practice of input.practices){const origin=practice.controlledGuidanceOrigin,plan=input.plans.find(row=>row.id===practice.planId);if(!origin&&!plan?.controlledBasis)continue;
  const original=input.revisions.find(row=>row.planId===practice.planId&&row.revision===practice.planRevision)?.snapshot;
  if(!origin||!original?.controlledBasis||origin.planId!==practice.planId||origin.planRevision!==practice.planRevision||practice.studentId!==original.studentId||practice.subject!==original.subject||practice.atomId!==original.controlledBasis.atomId||practice.actionId!==original.controlledBasis.actionId||origin.basisFingerprint!==retentionDigest(original.controlledBasis)||!input.students.some(row=>row.id===practice.studentId&&row.userId===origin.actorId)||!input.users.some(row=>row.id===origin.actorId&&row.role==='student')||retentionDigest(practice.actionSnapshot)!==retentionDigest(original.actions.find(row=>row.id===practice.actionId)))throw Error('controlled_guidance_actual_learner_origin_missing');
 }
}
