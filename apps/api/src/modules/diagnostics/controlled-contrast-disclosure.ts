import type { DiagnosticResponse } from '@study-agent/contracts';
import { assertControlledContrastBlueprint,type ControlledContrastBlueprint } from './controlled-contrast-selection';
import { firstQuestionResponses } from './measurement';

type Session={id:string;studentId:string;status:string;startedAt:string;completedAt?:string|null;endedAt?:string|null;controlledContrast?:ControlledContrastBlueprint};
/** Current measurements and assistant summaries must not reveal the first arm's outcome through another page. */
export function controlledFeedbackHeld(session:Session,cutoff?:string){
 if(!session.controlledContrast)return false;const blueprint=assertControlledContrastBlueprint(session.controlledContrast);
 if(blueprint.studentId!==session.studentId)throw Error('controlled_contrast_original_student_mismatch');
 const end=session.completedAt??session.endedAt;
 if(!['completed','aborted'].includes(session.status)||!end||!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(session.startedAt))return true;
 if(cutoff!==undefined){const at=Date.parse(cutoff);if(!Number.isFinite(at))throw Error('invalid_controlled_contrast_disclosure_cutoff');return Date.parse(end)>at;}
 return false;
}
export function controlledMeasurementResponses(sessions:readonly Session[],responses:readonly DiagnosticResponse[],cutoff?:string){
 const byId=new Map(sessions.map(row=>[row.id,row]));return responses.filter(row=>{const session=byId.get(row.sessionId);return!session||!controlledFeedbackHeld(session,cutoff);});
}

/** First release uses paired tasks for cause observations only. Their raw scores
 * stay available after ending, but neither arm adds ordinary mastery/retention
 * samples. Deduplicate before excluding them so a later reuse of that exact
 * question cannot replace its original controlled first response.
 */
export function controlledAbilityResponses(sessions:readonly Session[],responses:readonly DiagnosticResponse[],cutoff?:string){
 const byId=new Map(sessions.map(row=>[row.id,row]));
 return controlledMeasurementResponses(sessions,firstQuestionResponses([...responses]),cutoff).filter(row=>!byId.get(row.sessionId)?.controlledContrast);
}

/** Local save receipts disclose persistence only, never a paired result before the original group ends. */
export function controlledSubmissionReceipt(session:Session,response:DiagnosticResponse,idempotent:boolean){
 if(!session.controlledContrast)throw Error('controlled_contrast_original_blueprint_required');const blueprint=assertControlledContrastBlueprint(session.controlledContrast);
 if(response.sessionId!==session.id||response.studentId!==session.studentId||!blueprint.units.some(unit=>unit.order.some(arm=>arm.packet.itemId===response.itemId&&arm.packet.questionId===response.questionId)))throw Error('controlled_contrast_original_response_mismatch');
 return{saved:true,responseId:response.id,idempotent,status:response.status,feedbackHeld:controlledFeedbackHeld(session),notice:'首次作答已保存；本组成对任务结束后再查看评分与对照结果。'};
}
