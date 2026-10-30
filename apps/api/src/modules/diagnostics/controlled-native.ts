import { assertControlledEditorialRecords } from './controlled-editorial-integrity';
import type { ControlledReviewRecord,ControlledReleaseRecord,ControlledEditorialCommand } from './controlled-editorial-workflow';
import type { ControlledContrastPublication } from './controlled-contrast-publication';
import type { PrivacyReceipt } from '@study-agent/contracts';
import { assertControlledPreviewRecords } from './controlled-preview-integrity';
import { assertControlledResponseRecords } from './controlled-response-origin';
import { assertControlledReportRecords } from './controlled-report-integrity';
import { controlledSessionOf } from './controlled-session-origin';
import { controlledActorFingerprint } from './controlled-actor-identity';
import { assertControlledGuidanceRecords } from './controlled-guidance-basis';

type Row={collection:string;record_id?:string;body:unknown};
export const CONTROLLED_SESSION_NATIVE_READY=true;
/** First30 storage stage: real editorial originals are checked on every native
 * open/restore, including original preview, child, first-response and report
 * relations. HTTP registration is a separate application integration gate.
 */
export function assertControlledNativeRows(rows:Row[]){
 try{
  const values:Record<string,any[]>={};for(const row of rows){const body=typeof row.body==='string'?JSON.parse(row.body):row.body;if(!body||typeof body!=='object'||row.record_id!==undefined&&((body as any).id??(body as any).eventId??(body as any).questionId??(body as any).sessionId)!==row.record_id)throw Error();values[row.collection]??=[];values[row.collection].push(body);}
  const records=(name:string)=>values[name]??[];
  if(!records('controlledMaterialReviews').length&&!records('controlledContrastPublications').length&&!records('controlledContrastReleases').length&&!records('controlledEditorialCommands').length&&!records('controlledContrastPreviews').length&&!records('diagnosticSessions').some(row=>row.controlledContrast||row.controlledOrigin)&&!records('diagnosticResponses').some(row=>row.controlledOrigin||row.controlledInput||row.evidencePurpose==='controlled_cause_observation')&&!records('diagnosticReports').some(row=>row.report?.controlledContrast||row.report?.controlledCauses?.length)&&!records('diagnosticPlans').some(row=>row.controlledBasis)&&!records('guidancePlanRevisions').some(row=>row.snapshot?.controlledBasis)&&!records('practiceSessions').some(row=>row.controlledGuidanceOrigin))return;
  assertControlledEditorialRecords({reviews:records('controlledMaterialReviews')as ControlledReviewRecord[],publications:records('controlledContrastPublications')as ControlledContrastPublication[],releases:records('controlledContrastReleases')as ControlledReleaseRecord[],commands:records('controlledEditorialCommands')as ControlledEditorialCommand[]},records('privacyRequests')as PrivacyReceipt[]);
  const users=new Set(records('users').map(row=>row.id));
  if(records('controlledEditorialCommands').some(row=>!users.has(row.actorId))||records('controlledMaterialReviews').some(row=>row.actorId!==null&&!users.has(row.actorId)))throw Error('controlled_original_private_author_missing');
  const deletionHashes=new Set([...records('controlledMaterialReviews').map(row=>row.actorDeletionHash),...records('controlledContrastReleases').flatMap(row=>row.history.map((event:any)=>event.actorDeletionHash)),...records('controlledContrastPreviews').map(row=>row.arrangerDeletionHash)].filter(Boolean));
  if(records('users').some(row=>deletionHashes.has(controlledActorFingerprint(row.id))))throw Error('controlled_original_deleted_author_still_present');
  if(!CONTROLLED_SESSION_NATIVE_READY&&(records('controlledContrastPreviews').length||records('diagnosticSessions').some(row=>row.controlledContrast||row.controlledOrigin)))throw Error('controlled_session_native_validation_not_ready');
  const sessions=records('diagnosticSessions').flatMap(row=>{const controlled=controlledSessionOf(row);return controlled?[controlled]:[];});
  assertControlledPreviewRecords({previews:records('controlledContrastPreviews'),publications:records('controlledContrastPublications'),sessions,students:records('students'),users:records('users'),receipts:records('privacyRequests')});
  assertControlledResponseRecords({sessions,responses:records('diagnosticResponses'),students:records('students'),users:records('users'),receipts:records('privacyRequests'),drafts:records('diagnosticDrafts'),hints:records('diagnosticHints')});
  assertControlledReportRecords({sessions:records('diagnosticSessions'),responses:records('diagnosticResponses'),reports:records('diagnosticReports'),publications:records('controlledContrastPublications'),revisions:records('scoringRevisions'),records:values});
  assertControlledGuidanceRecords({plans:records('diagnosticPlans'),revisions:records('guidancePlanRevisions'),sessions:records('diagnosticSessions'),reports:records('diagnosticReports'),responses:records('diagnosticResponses'),practices:records('practiceSessions'),students:records('students'),users:records('users')});
 }catch(error){throw Error('controlled_contrast_saved_integrity_failed',{cause:error});}
}
