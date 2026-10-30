import { z } from 'zod';
import type { ClassroomSession } from '@study-agent/contracts';
import { freezeClassroomPresentation,sessionPresentation } from '../learning/classroom-presentation';
import { retentionDigest } from './retention-anchor';
const id=z.string().min(1).max(650),hash=z.string().regex(/^[a-f0-9]{64}$/),at=z.string().datetime();
export const classroomRetentionContextSchema=z.object({protocol:z.literal('classroom-retention-context-v1'),studentId:id,subject:z.enum(['math','chinese','english','chemistry']),
 contentFingerprint:hash,lessonId:id,targets:z.array(z.object({atomId:id,definitionFingerprint:hash}).strict()).max(100),unmappedTarget:z.boolean()}).strict();
export const classroomRetentionDisplayInputSchema=z.object({protocol:z.literal('classroom-retention-display-v1'),contentFingerprint:hash,stepId:id,sentence:z.number().int().min(0),presentationVersion:z.enum(['legacy-v1','speech-v2']),unitId:id,requestKey:z.string().min(8).max(180)}).strict();
export const classroomRetentionDisplayRecordSchema=z.object({id,sessionId:id,actorId:id,studentId:id,subject:z.enum(['math','chinese','english','chemistry']),
 contentFingerprint:hash,lessonId:id,stepId:id,sentence:z.number().int().min(0),presentationVersion:z.enum(['legacy-v1','speech-v2']),unitId:id,requestKey:id,input:classroomRetentionDisplayInputSchema,
 requestHash:hash,at,targets:z.array(z.object({atomId:id,definitionFingerprint:hash}).strict()).max(100),unmappedTarget:z.boolean()}).strict();
export type ClassroomRetentionContext=z.infer<typeof classroomRetentionContextSchema>;
export type ClassroomRetentionDisplay=z.infer<typeof classroomRetentionDisplayRecordSchema>;
export const classroomLegacyGapSchema=z.object({protocol:z.literal('legacy-classroom-source-gap-v1'),studentId:id,subject:z.enum(['math','chinese','english','chemistry']),contentFingerprint:hash,fromAt:at,throughAt:at,preparedAt:at,previousRevealed:z.number().int().min(0),previousHintCount:z.number().int().min(0),previousMessageCount:z.number().int().min(0),previousAnswerCount:z.number().int().min(0)}).strict();
export type ClassroomLegacyGap=z.infer<typeof classroomLegacyGapSchema>;
export const classroomDisplayHash=(actorId:string,sessionId:string,input:unknown)=>retentionDigest({protocol:'classroom-retention-display-v1',actorId,sessionId,input});
export const classroomDisplayId=(actorId:string,sessionId:string,requestKey:string)=>'classroom_display:'+retentionDigest({actorId,sessionId,requestKey});
export function assertClassroomRetentionRecord(session:{id:string;studentId:string|null;ownerUserId:string;contentFingerprint:string;lessonId:string;lesson:{steps:Array<{id:string;narration:string}>};createdAt:string;revealed?:number;hintReceipts?:Array<{at:string}>;messages?:Array<{at:string}>;answers?:Array<{at:string}>;presentation?:ClassroomSession['presentation'];retentionContext?:unknown;retentionDisplays?:unknown[];retentionLegacyGap?:unknown}){
 try{
  if(!session.retentionContext){if(session.retentionDisplays?.length||session.retentionLegacyGap)throw Error();return;}
  const context=classroomRetentionContextSchema.parse(session.retentionContext);if(context.studentId!==session.studentId||context.contentFingerprint!==session.contentFingerprint||context.lessonId!==session.lessonId||(!context.targets.length)!==context.unmappedTarget||new Set(context.targets.map(target=>target.atomId)).size!==context.targets.length)throw Error();
  if(session.retentionLegacyGap){
   const gap=classroomLegacyGapSchema.parse(session.retentionLegacyGap);
   if(retentionDigest(gap)!==retentionDigest(session.retentionLegacyGap)||gap.studentId!==context.studentId||gap.subject!==context.subject||gap.contentFingerprint!==context.contentFingerprint||gap.fromAt!==session.createdAt||Date.parse(gap.throughAt)<Date.parse(gap.fromAt)||Date.parse(gap.preparedAt)<Date.parse(gap.throughAt)||gap.previousRevealed>(session.revealed??0))throw Error();
   for(const [rows,count]of [[session.hintReceipts??[],gap.previousHintCount],[session.messages??[],gap.previousMessageCount],[session.answers??[],gap.previousAnswerCount]]as const){
    if(count>rows.length||rows.slice(0,count).some(row=>Date.parse(row.at)<Date.parse(gap.fromAt)||Date.parse(row.at)>Date.parse(gap.throughAt))||rows.slice(count).some(row=>Date.parse(row.at)<Date.parse(gap.preparedAt)))throw Error();
   }
  }
  sessionPresentation(session as ClassroomSession);const keys=new Set<string>();for(const value of session.retentionDisplays??[]){const row=classroomRetentionDisplayRecordSchema.parse(value),step=session.lesson.steps.find(step=>step.id===row.stepId),presentation=freezeClassroomPresentation(session.lesson as ClassroomSession['lesson'],session.createdAt,row.presentationVersion),unit=step?presentation.tracks[step.id].units[row.sentence]:null;if(retentionDigest(row)!==retentionDigest(value)||row.id!==classroomDisplayId(row.actorId,session.id,row.requestKey)||row.sessionId!==session.id||row.actorId!==session.ownerUserId||row.studentId!==context.studentId||row.subject!==context.subject||row.contentFingerprint!==context.contentFingerprint||row.lessonId!==context.lessonId||row.input.requestKey!==row.requestKey||row.input.contentFingerprint!==row.contentFingerprint||row.input.stepId!==row.stepId||row.input.sentence!==row.sentence||row.input.presentationVersion!==row.presentationVersion||row.input.unitId!==row.unitId||row.requestHash!==classroomDisplayHash(row.actorId,session.id,row.input)||retentionDigest(row.targets)!==retentionDigest(context.targets)||row.unmappedTarget!==context.unmappedTarget||!unit||unit.id!==row.unitId||keys.has(row.requestKey))throw Error();keys.add(row.requestKey);}
 }catch(error){throw Error('classroom_retention_display_integrity_failed',{cause:error});}
}
