import {z} from 'zod';
import {paperCaptureScopeSchema} from './paper-capture';
import {paperCaptureFileTargetSchema} from './paper-capture-integrity';

const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),key=z.string().min(8).max(180),time=z.string().datetime({offset:true});
export const paperCaptureRepairSelectionSchema=z.object({target:paperCaptureFileTargetSchema,sourceFingerprint:hash,role:z.enum(['original','baseline','derived','pdf','material_pdf']),sha256:hash,bytes:z.number().int().positive().max(80*1024*1024),mediaType:z.enum(['image/png','image/jpeg','application/pdf']),assetGeneration:z.number().int().positive(),observationFingerprint:hash}).strict().superRefine((value,context)=>{
 const pdf=value.role==='pdf'||value.role==='material_pdf',limit=value.role==='original'?12*1024*1024:pdf?80*1024*1024:40*1024*1024;
 if(value.bytes>limit||pdf!==(value.mediaType==='application/pdf')||!['original','pdf','material_pdf'].includes(value.role)&&value.mediaType!=='image/png'||(value.target.kind==='derivation')!==pdf)context.addIssue({code:'custom',message:'The exact target role, MIME and byte budget must agree.'});
});
export type PaperCaptureRepairSelection=z.infer<typeof paperCaptureRepairSelectionSchema>;
export const paperCaptureRepairCandidateSchema=z.object({protocol:z.literal('paper-capture-repair-candidate-v1'),selection:paperCaptureRepairSelectionSchema,strategy:z.enum(['source_rebuild','other_pdf']),
 basis:z.discriminatedUnion('kind',[
  z.object({kind:z.literal('page'),pageId:id,versionFingerprint:hash,originalSha256:hash,originalBytes:z.number().int().min(5).max(12*1024*1024),originalMediaType:z.enum(['image/png','image/jpeg']),renderer:z.string().min(1).max(180)}).strict(),
  z.object({kind:z.literal('group'),groupId:id,revision:z.number().int().positive(),fingerprint:hash,pdfFingerprint:hash,renderer:z.string().min(1).max(180)}).strict(),
  z.object({kind:z.literal('pdf'),role:z.enum(['pdf','material_pdf']),sha256:hash,bytes:z.number().int().positive().max(80*1024*1024),pdfFingerprint:hash}).strict(),
 ]),fingerprint:hash}).strict().superRefine((value,context)=>{
 const {selection:s,basis:b}=value;
 if(value.strategy==='other_pdf'?(s.target.kind!=='derivation'||b.kind!=='pdf'||b.role===s.role||b.sha256!==s.sha256||b.bytes!==s.bytes||b.pdfFingerprint!==s.target.pdfFingerprint):s.target.kind==='page'?(b.kind!=='page'||s.role==='original'||b.pageId!==s.target.pageId||b.versionFingerprint!==s.target.versionFingerprint):(b.kind!=='group'||b.pdfFingerprint!==s.target.pdfFingerprint))context.addIssue({code:'custom',message:'The candidate must retain the actual original page, frozen group or other PDF source.'});
});
export type PaperCaptureRepairCandidate=z.infer<typeof paperCaptureRepairCandidateSchema>;
export const paperCaptureRepairCandidateRequestSchema=z.object({selection:paperCaptureRepairSelectionSchema,strategy:z.enum(['source_rebuild','other_pdf'])}).strict();
export const paperCaptureRepairCommandSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('upload'),requestKey:key,input:z.object({protocol:z.literal('paper-repair-upload-input-v1'),scope:paperCaptureScopeSchema,selection:paperCaptureRepairSelectionSchema,name:z.string().min(1).max(255),candidate:paperCaptureRepairCandidateSchema.optional()}).strict()}).strict(),
 z.object({kind:z.literal('start'),requestKey:key,input:z.object({protocol:z.literal('paper-repair-start-input-v1'),uploadId:id,expectedRevision:z.number().int().min(0).max(80),selection:paperCaptureRepairSelectionSchema,strategy:z.enum(['exact_upload','source_rebuild','other_pdf']),candidateFingerprint:hash.optional()}).strict().superRefine((value,context)=>{if((value.strategy==='exact_upload')===(value.candidateFingerprint!==undefined))context.addIssue({code:'custom',message:'A rebuilt candidate requires its exact original provenance.'});})}).strict(),
 z.object({kind:z.literal('cancelUpload'),requestKey:key,uploadId:id,expectedRevision:z.number().int().min(0).max(80)}).strict(),
 ...(['cancel','retry']as const).map(kind=>z.object({kind:z.literal(kind),requestKey:key,repairId:id,expectedTaskVersion:z.number().int().positive(),expectedTaskGeneration:z.number().int().positive()}).strict()),
]);
export type PaperCaptureRepairCommand=z.infer<typeof paperCaptureRepairCommandSchema>;
export const paperCaptureRepairCommandResultSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('upload'),uploadId:id,chunkSize:z.literal(1024*1024),createdAt:time,expiresAt:time}).strict(),
 z.object({kind:z.literal('cancelUpload'),uploadId:id,revision:z.number().int().positive().max(81),cancelledAt:time}).strict(),
 z.object({kind:z.literal('start'),repairId:id,uploadId:id,taskId:id,taskVersion:z.literal(1),taskGeneration:z.literal(1),createdAt:time}).strict(),
 ...(['cancel','retry']as const).map(kind=>z.object({kind:z.literal(kind),repairId:id,taskId:id,taskVersion:z.number().int().positive(),taskGeneration:z.number().int().positive(),acceptedAt:time}).strict()),
]);
export type PaperCaptureRepairCommandResult=z.infer<typeof paperCaptureRepairCommandResultSchema>;
export const paperCaptureRepairCommandLookupSchema=z.discriminatedUnion('state',[
 z.object({state:z.literal('unknown'),requestKey:key}).strict(),
 ...(['committed','rejected']as const).map(state=>z.object({state:z.literal(state),requestKey:key,input:paperCaptureRepairCommandSchema,scope:paperCaptureScopeSchema,result:paperCaptureRepairCommandResultSchema.nullable(),errorCode:z.string().nullable()}).strict()),
]);
export const paperCaptureRepairUploadViewSchema=z.object({id,scope:paperCaptureScopeSchema,selection:paperCaptureRepairSelectionSchema,name:z.string().min(1).max(255),candidate:paperCaptureRepairCandidateSchema.optional(),chunkSize:z.literal(1024*1024),chunks:z.array(z.object({index:z.number().int().min(0).max(79),sha256:hash,bytes:z.number().int().positive().max(1024*1024)}).strict()).max(80),revision:z.number().int().min(0).max(81),status:z.enum(['uploading','consumed','cancelled']),createdAt:time,expiresAt:time,endedAt:time.nullable(),repairId:id.nullable()}).strict();
export type PaperCaptureRepairUploadView=z.infer<typeof paperCaptureRepairUploadViewSchema>;
export const paperCaptureRepairPublicationSchema=z.object({protocol:z.literal('paper-capture-repair-publication-v1'),repairId:id,target:paperCaptureFileTargetSchema,sourceFingerprint:hash,role:z.enum(['original','baseline','derived','pdf','material_pdf']),sha256:hash,bytes:z.number().int().positive().max(80*1024*1024),assetGeneration:z.number().int().positive(),taskGeneration:z.number().int().positive(),restoredAt:time,fingerprint:hash}).strict();
export type PaperCaptureRepairPublication=z.infer<typeof paperCaptureRepairPublicationSchema>;
export const paperCaptureRepairViewSchema=z.object({id,scope:paperCaptureScopeSchema,selection:paperCaptureRepairSelectionSchema,createdAt:time,ownerClosed:z.boolean(),canCancel:z.boolean(),canRetry:z.boolean(),publication:paperCaptureRepairPublicationSchema.nullable(),task:z.object({id,state:z.enum(['queued','running','retry_wait','cancel_requested','cancelled','succeeded','failed']),generation:z.number().int().positive(),version:z.number().int().positive(),errorCode:z.string().nullable(),stage:z.string().nullable()}).strict()}).strict();
export type PaperCaptureRepairView=z.infer<typeof paperCaptureRepairViewSchema>;
