import {z} from 'zod';
import {paperCaptureScopeSchema} from './paper-capture';
const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const paperCaptureFileTargetSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('page'),pageId:id,versionFingerprint:hash}).strict(),
 z.object({kind:z.literal('derivation'),derivationId:id,pdfFingerprint:hash}).strict(),
]);
export type PaperCaptureFileTarget=z.infer<typeof paperCaptureFileTargetSchema>;
export const paperCaptureFileCheckSchema=z.object({role:z.enum(['original','baseline','derived','pdf','material_pdf']),sha256:hash,bytes:z.number().int().positive().max(80*1024*1024),mediaType:z.enum(['image/png','image/jpeg','application/pdf']),assetGeneration:z.number().int().positive(),assetState:z.enum(['available','deleting','deleted','repairing']),status:z.enum(['verified','missing','changed','busy','unavailable']),actualSha256:hash.nullable(),actualBytes:z.number().int().nonnegative().max(80*1024*1024).nullable(),observationFingerprint:hash}).strict();
export type PaperCaptureFileCheck=z.infer<typeof paperCaptureFileCheckSchema>;
export const paperCaptureFileReportSchema=z.object({protocol:z.literal('paper-capture-file-report-v1'),target:paperCaptureFileTargetSchema,scope:paperCaptureScopeSchema,sourceFingerprint:hash,files:z.array(paperCaptureFileCheckSchema).min(2).max(3),relation:z.enum(['verified','unavailable','changed','review_required']),relationCode:z.enum(['source_files_unavailable','source_mapping_changed','renderer_review_required']).nullable(),canRestore:z.boolean(),checkedAt:z.string().datetime({offset:true}),fingerprint:hash}).strict();
export type PaperCaptureFileReport=z.infer<typeof paperCaptureFileReportSchema>;
