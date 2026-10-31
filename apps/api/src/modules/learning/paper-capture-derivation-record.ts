import {z} from 'zod';
import type {PaperCapturePdfReceipt,PaperCaptureMaterialOrigin} from '@study-agent/contracts';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {paperCaptureAttributionSchema} from './paper-capture-attribution';
import {paperCaptureScopeSchema} from './paper-capture-scope';
import type {PaperCaptureGroupVersion} from './paper-capture-group';
import {PAPER_DERIVED_PDF_LIMITS} from './paper-capture-derived-pdf';

const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.string().datetime({offset:true});
import {paperCapturePdfReceiptSchema} from '@study-agent/contracts';
export {paperCapturePdfReceiptSchema} from '@study-agent/contracts';
/** The original task intent is immutable. Current running/cancelled/retry
 * state comes from the existing durable task, not a second shadow state.
 * Publication is committed once with that task's actual completion fence.
 */
export const paperCaptureDerivationSchema=z.object({protocol:z.literal('paper-capture-derivation-record-v1'),id,attribution:paperCaptureAttributionSchema,groupId:id,groupRevision:z.number().int().positive(),groupFingerprint:hash,taskId:id,createdAt:time,
 pdf:paperCapturePdfReceiptSchema.nullable(),materialId:id.nullable(),publishedAt:time.nullable(),publishedGeneration:z.number().int().positive().nullable()}).strict();
export type PaperCaptureDerivationRecord=z.infer<typeof paperCaptureDerivationSchema>;
export const paperCaptureDerivationKind='learning.paper-capture.derive';
export const paperCaptureDerivationPayload=(row:Pick<PaperCaptureDerivationRecord,'id'|'groupId'|'groupRevision'|'groupFingerprint'>)=>({derivationId:row.id,groupId:row.groupId,groupRevision:row.groupRevision,groupFingerprint:row.groupFingerprint});
export function assertPaperCapturePdfReceipt(group:PaperCaptureGroupVersion,value:PaperCapturePdfReceipt){
 const row=paperCapturePdfReceiptSchema.parse(value),{fingerprint,...body}=row;
 if(retentionDigest(row)!==retentionDigest(value)||retentionDigest(body)!==fingerprint||row.groupId!==group.groupId||row.groupRevision!==group.revision||row.groupFingerprint!==group.fingerprint||row.pages.length!==group.pages.length||row.pages.reduce((sum,page)=>sum+page.width*page.height,0)>PAPER_DERIVED_PDF_LIMITS.pixels)throw Error('paper_capture_pdf_original_group_changed');
 for(const [index,page]of row.pages.entries()){
  const reference=group.pages[index],[pdfWidth,pdfHeight]=reference.width>reference.height?[841.89,595.28]:[595.28,841.89],scale=Math.min((pdfWidth-48)/reference.width,(pdfHeight-48)/reference.height),width=reference.width*scale,height=reference.height*scale;
  const expected={...reference,page:index+1,pdfWidth,pdfHeight,imageBox:{x:(pdfWidth-width)/2,y:(pdfHeight-height)/2,width,height},coordinateSpace:'pdf-bottom-left-points-v1'};
  if(retentionDigest(page)!==retentionDigest(expected))throw Error('paper_capture_pdf_original_page_mapping_changed');
 }
 return row;
}
export function assertPaperCaptureDerivation(value:PaperCaptureDerivationRecord,group:PaperCaptureGroupVersion){
 const row=paperCaptureDerivationSchema.parse(value);if(retentionDigest(row)!==retentionDigest(value)||row.attribution.createdAt!==row.createdAt||row.groupId!==group.groupId||row.groupRevision!==group.revision||row.groupFingerprint!==group.fingerprint||row.attribution.scope.studentId!==group.scope.studentId||row.attribution.scope.subject!==group.scope.subject||row.attribution.scope.studentId===null&&row.attribution.scope.creatorFingerprint!==group.scope.creatorFingerprint)throw Error('paper_capture_original_derivation_changed');
 if(row.pdf===null){if(row.materialId!==null||row.publishedAt!==null||row.publishedGeneration!==null)throw Error('paper_capture_derivation_publication_incomplete');}
 else{if(!row.materialId||!row.publishedAt||!row.publishedGeneration||Date.parse(row.publishedAt)<Date.parse(row.createdAt))throw Error('paper_capture_derivation_publication_incomplete');assertPaperCapturePdfReceipt(group,row.pdf);}
 return row;
}
export function paperCaptureMaterialOrigin(row:PaperCaptureDerivationRecord,group:PaperCaptureGroupVersion):PaperCaptureMaterialOrigin{
 assertPaperCaptureDerivation(row,group);if(!row.pdf||!row.materialId)throw Error('paper_capture_derivation_not_published');
 const body={protocol:'paper-capture-material-origin-v1' as const,derivationId:row.id,sourceGroupScope:structuredClone(group.scope),pdf:structuredClone(row.pdf)};return{...body,fingerprint:retentionDigest(body)};
}
export function assertPaperCaptureMaterialOrigin(value:PaperCaptureMaterialOrigin,row:PaperCaptureDerivationRecord,group:PaperCaptureGroupVersion){
 paperCaptureScopeSchema.parse(value.sourceGroupScope);if(retentionDigest(value)!==retentionDigest(paperCaptureMaterialOrigin(row,group)))throw Error('paper_capture_material_original_source_changed');return value;
}
