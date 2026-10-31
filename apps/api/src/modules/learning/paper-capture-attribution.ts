import {z} from 'zod';
import type {PrivacyReceipt} from '@study-agent/contracts';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {paperCaptureScopeSchema} from './paper-capture-scope';

const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(180);
export const paperCaptureAttributionSchema=z.object({protocol:z.literal('paper-capture-attribution-v1'),scope:paperCaptureScopeSchema,ownerUserId:id.nullable(),createdAt:z.string().datetime({offset:true}),ownerDeletionHash:hash.optional()}).strict();
export type PaperCaptureAttribution=z.infer<typeof paperCaptureAttributionSchema>;
const fingerprint=(id:string)=>retentionDigest({id});
function receiptMatches(row:PaperCaptureAttribution,receipt:PrivacyReceipt){
 const child=row.scope.studentId&&fingerprint(row.scope.studentId);
 return receipt.kind==='account_delete'&&fingerprint(receipt.actorId)===row.scope.creatorFingerprint&&receipt.subjectHash===row.scope.creatorFingerprint&&
  Number.isFinite(Date.parse(receipt.completedAt))&&Date.parse(receipt.completedAt)>=Date.parse(row.createdAt)&&Boolean(child)&&
  Boolean(receipt.retainedStudentHashes?.includes(child!))&&!receipt.erasedStudentHashes?.includes(child!);
}
/** The native caller supplies actual retained users and deletion receipts. */
export function assertPaperCaptureAttribution(value:PaperCaptureAttribution,users:readonly {id:string}[],receipts:readonly PrivacyReceipt[]){
 const row=paperCaptureAttributionSchema.parse(value);if(retentionDigest(row)!==retentionDigest(value))throw Error('paper_capture_attribution_full_record_required');
 if(row.ownerUserId!==null){
  if(row.ownerDeletionHash!==undefined||fingerprint(row.ownerUserId)!==row.scope.creatorFingerprint||!users.some(user=>user.id===row.ownerUserId))throw Error('paper_capture_original_author_missing');
 }else if(row.ownerDeletionHash!==row.scope.creatorFingerprint||users.some(user=>fingerprint(user.id)===row.scope.creatorFingerprint)||!receipts.some(receipt=>receiptMatches(row,receipt)))throw Error('paper_capture_actual_shared_deletion_receipt_required');
 return row;
}
/** Private commands are removed separately in the actual account transaction.
 * Returning null means this personal/erased-child source must also be removed.
 * Retained child source scopes and their image/group fingerprints do not change.
 */
export function anonymizePaperCaptureAttribution(value:PaperCaptureAttribution,actorId:string,receipt:PrivacyReceipt):PaperCaptureAttribution|null{
 const row=paperCaptureAttributionSchema.parse(value);
 if(retentionDigest(row)!==retentionDigest(value)||receipt.kind!=='account_delete'||receipt.actorId!==actorId||receipt.subjectHash!==fingerprint(actorId)||!Number.isFinite(Date.parse(receipt.completedAt))||Date.parse(receipt.completedAt)<Date.parse(row.createdAt))throw Error('paper_capture_original_deletion_receipt_required');
 if(row.ownerUserId!==actorId)return structuredClone(row);
 if(row.scope.creatorFingerprint!==fingerprint(actorId)||row.ownerDeletionHash!==undefined)throw Error('paper_capture_original_author_missing');
 if(!row.scope.studentId)return null;
 if(receipt.erasedStudentHashes?.includes(fingerprint(row.scope.studentId)))return null;
 if(!receiptMatches(row,receipt))throw Error('paper_capture_actual_shared_deletion_receipt_required');
 return{...structuredClone(row),ownerUserId:null,ownerDeletionHash:row.scope.creatorFingerprint};
}
