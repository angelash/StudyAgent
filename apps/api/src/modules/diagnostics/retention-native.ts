import { z } from 'zod';
import { measureRetentionAnchor,retentionDigest,retentionExposureKinds,type RetentionAnchorInput,type RetentionAnchorResult } from './retention-anchor';
import { collectRetentionExposures,type RetentionRetainedRecords } from './retention-source';
const id=z.string().min(1).max(650),hash=z.string().regex(/^[a-f0-9]{64}$/),at=z.string().datetime(),subject=z.enum(['math','chinese','english','chemistry']);
export const retentionExposureRecordSchema=z.object({protocol:z.literal('retention-exposure-v1'),id,studentId:id,subject,atomId:id,
 definitionFingerprint:hash,kind:z.enum(retentionExposureKinds),sourceId:id,sourceExposureId:id,sourceFingerprint:hash,at,createdAt:at}).strict();
export type RetentionExposureRecord=z.infer<typeof retentionExposureRecordSchema>;
export const retentionEventId=(sourceExposureId:string,studentId:string,atomId:string)=>'retention_exposure:'+retentionDigest({sourceExposureId,studentId,atomId});
export function assertRetentionExposureRecords(values:RetentionRetainedRecords){
 try{
  const events=values.retentionExposureEvents??[],seen=new Set<string>();
  for(const value of events){const row=retentionExposureRecordSchema.parse(value);if(retentionDigest(row)!==retentionDigest(value)||row.id!==retentionEventId(row.sourceExposureId,row.studentId,row.atomId)||Date.parse(row.createdAt)<Date.parse(row.at)||seen.has(row.id))throw Error();seen.add(row.id);
   if(!(values.students??[]).some(student=>student.id===row.studentId))throw Error();
   const actual=collectRetentionExposures(values,{studentId:row.studentId,subject:row.subject,atomId:row.atomId,definitionFingerprint:row.definitionFingerprint}).find(source=>source.id===row.sourceExposureId);
   if(!actual||!actual.sourceRetained||actual.sourceId!==row.sourceId||actual.kind!==row.kind||actual.at!==row.at||actual.definitionFingerprint!==row.definitionFingerprint||actual.operationFingerprint!==row.sourceFingerprint)throw Error();
  }
 }catch(error){throw Error('retention_exposure_saved_integrity_failed',{cause:error});}
}
/** Verify a new frozen answer against retained sources and its original server cutoff. */
export function assertRetentionEvidence(snapshot:unknown,originalInput:RetentionAnchorInput):RetentionAnchorResult{
 const result=measureRetentionAnchor(originalInput);if(retentionDigest(snapshot)!==retentionDigest(result))throw Error('retention_evidence_saved_integrity_failed');return result;
}
