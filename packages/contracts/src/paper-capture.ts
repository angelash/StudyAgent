import {z} from 'zod';
import {paperCapturePdfReceiptSchema} from './paper-capture-origin';

const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.string().datetime({offset:true}),dimension=z.number().int().min(1).max(6000),requestKey=z.string().min(8).max(180);
export const paperCaptureIntentSchema=z.enum(['single_question','whole_page','material_collection']);
export type PaperCaptureIntent=z.infer<typeof paperCaptureIntentSchema>;
const audience={studentId:id.nullable(),subject:z.enum(['math','chinese','english','chemistry']).nullable()};
export const paperCapturePrivateScopeSchema=z.object({actorId:id,...audience}).strict().refine(value=>Boolean(value.studentId)===Boolean(value.subject));
/** Shared sources carry a stable author fingerprint, never a private account ID. */
export const paperCaptureScopeSchema=z.object({creatorFingerprint:hash,...audience}).strict().refine(value=>Boolean(value.studentId)===Boolean(value.subject));
export type PaperCapturePrivateScope=z.infer<typeof paperCapturePrivateScopeSchema>;
export type PaperCaptureScope=z.infer<typeof paperCaptureScopeSchema>;

export const paperImageSourceSchema=z.object({protocol:z.literal('paper-image-source-v1'),pageId:id,originalSha256:hash,originalBytes:z.number().int().min(5).max(12*1024*1024),originalMediaType:z.enum(['image/png','image/jpeg']),baselineSha256:hash,width:dimension,height:dimension}).strict();
export const paperImageTransformSchema=z.object({crop:z.object({x:z.number().int().min(0),y:z.number().int().min(0),width:dimension,height:dimension}).strict(),rotation:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)])}).strict();
export type PaperImageSource=z.infer<typeof paperImageSourceSchema>;
export type PaperImageTransform=z.infer<typeof paperImageTransformSchema>;
export const paperImageVersionSchema=z.object({protocol:z.literal('paper-image-version-v1'),pageId:id,originalSha256:hash,baselineSha256:hash,coordinateSpace:z.literal('normalized-original-pixels-v1'),transform:paperImageTransformSchema,width:dimension,height:dimension,fingerprint:hash}).strict();
export type PaperImageVersion=z.infer<typeof paperImageVersionSchema>;
export const paperCaptureGroupInputSchema=z.object({protocol:z.literal('paper-capture-group-input-v1'),title:z.string().trim().min(1).max(180),intent:paperCaptureIntentSchema,expectedRevision:z.number().int().min(0),pages:z.array(z.object({pageId:id,versionFingerprint:hash}).strict()).min(1).max(120)}).strict();
export type PaperCaptureGroupInput=z.infer<typeof paperCaptureGroupInputSchema>;
export const paperCaptureGroupVersionSchema=z.object({protocol:z.literal('paper-capture-group-version-v1'),groupId:id,scope:paperCaptureScopeSchema,revision:z.number().int().positive(),previousFingerprint:hash.nullable(),title:z.string().trim().min(1).max(180),intent:paperCaptureIntentSchema,pages:z.array(z.object({pageId:id,originalSha256:hash,baselineSha256:hash,versionFingerprint:hash,renderedSha256:hash,width:dimension,height:dimension}).strict()).min(1).max(120),originalBytes:z.number().int().min(5).max(50*1024*1024),fingerprint:hash}).strict();
export type PaperCaptureGroupVersion=z.infer<typeof paperCaptureGroupVersionSchema>;

/** Full original input is retained for lookup and explicit replay after a lost
 * response. A different input must receive a new request key. */
export const paperCapturePendingCommandSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('upload'),requestKey,input:z.object({protocol:z.literal('paper-image-upload-input-v1'),scope:paperCaptureScopeSchema,pageId:id,name:z.string().min(1).max(255),size:z.number().int().min(5).max(12*1024*1024),sha256:hash,mediaType:z.enum(['image/png','image/jpeg'])}).strict()}).strict(),
 z.object({kind:z.literal('completeUpload'),requestKey,uploadId:id,input:z.object({protocol:z.literal('paper-image-upload-complete-v1'),expectedRevision:z.number().int().min(0)}).strict()}).strict(),
 z.object({kind:z.literal('cancelUpload'),requestKey,uploadId:id,input:z.object({protocol:z.literal('paper-image-upload-cancel-v1'),expectedRevision:z.number().int().min(0)}).strict()}).strict(),
 z.object({kind:z.literal('pageRevision'),requestKey,pageId:id,input:z.object({protocol:z.literal('paper-image-revision-input-v1'),expectedRevision:z.number().int().positive(),expectedVersionFingerprint:hash,transform:paperImageTransformSchema}).strict()}).strict(),
 z.object({kind:z.literal('groupRevision'),requestKey,groupId:id,input:paperCaptureGroupInputSchema}).strict(),
 z.object({kind:z.literal('recognize'),requestKey,groupId:id,input:z.object({protocol:z.literal('paper-capture-recognize-input-v1'),expectedRevision:z.number().int().positive(),expectedFingerprint:hash,acknowledgePageOrder:z.literal(true)}).strict()}).strict(),
 z.object({kind:z.literal('cancelDerivation'),requestKey,groupId:id,derivationId:id,input:z.object({protocol:z.literal('paper-capture-derivation-cancel-v1'),expectedTaskVersion:z.number().int().positive(),expectedGeneration:z.number().int().positive()}).strict()}).strict(),
 z.object({kind:z.literal('retryDerivation'),requestKey,groupId:id,derivationId:id,input:z.object({protocol:z.literal('paper-capture-derivation-retry-v1'),expectedTaskVersion:z.number().int().positive(),expectedGeneration:z.number().int().positive()}).strict()}).strict(),
]);
export type PaperCapturePendingCommand=z.infer<typeof paperCapturePendingCommandSchema>;
export const paperCaptureCommandResultSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('upload'),uploadId:id,pageId:id,chunkSize:z.literal(1024*1024),createdAt:time,expiresAt:time}).strict(),
 z.object({kind:z.literal('completeUpload'),uploadId:id,pageId:id,revision:z.literal(1),versionFingerprint:hash,completedAt:time}).strict(),
 z.object({kind:z.literal('cancelUpload'),uploadId:id,revision:z.number().int().positive(),cancelledAt:time}).strict(),
 z.object({kind:z.literal('pageRevision'),pageId:id,revision:z.number().int().positive(),versionFingerprint:hash,savedAt:time}).strict(),
 z.object({kind:z.literal('groupRevision'),groupId:id,revision:z.number().int().positive(),fingerprint:hash,savedAt:time}).strict(),
 z.object({kind:z.literal('recognize'),derivationId:id,groupId:id,groupRevision:z.number().int().positive(),groupFingerprint:hash,taskId:id,taskVersion:z.literal(1),taskGeneration:z.literal(1),createdAt:time}).strict(),
 z.object({kind:z.literal('cancelDerivation'),derivationId:id,groupId:id,taskId:id,taskVersion:z.number().int().positive(),taskGeneration:z.number().int().positive(),acceptedAt:time}).strict(),
 z.object({kind:z.literal('retryDerivation'),derivationId:id,groupId:id,taskId:id,taskVersion:z.number().int().positive(),taskGeneration:z.number().int().positive(),acceptedAt:time}).strict(),
]);
export type PaperCaptureCommandResult=z.infer<typeof paperCaptureCommandResultSchema>;
export type PaperCaptureResult<K extends PaperCaptureCommandResult['kind']>=Extract<PaperCaptureCommandResult,{kind:K}>;
export const paperCaptureCommandLookupSchema=z.discriminatedUnion('state',[
 z.object({state:z.literal('unknown'),requestKey}).strict(),
 ...(['preparing','committed','rejected']as const).map(state=>z.object({state:z.literal(state),requestKey,input:paperCapturePendingCommandSchema,scope:paperCaptureScopeSchema,result:paperCaptureCommandResultSchema.nullable(),errorCode:z.string().nullable(),generation:z.number().int().positive()}).strict()),
]);
export type PaperCaptureCommandLookup=z.infer<typeof paperCaptureCommandLookupSchema>;
export const paperCaptureUploadCommandsSchema=z.object({uploadId:id,initialization:paperCaptureCommandLookupSchema,terminal:paperCaptureCommandLookupSchema.nullable()}).strict();
export type PaperCaptureUploadCommands=z.infer<typeof paperCaptureUploadCommandsSchema>;
export const paperCaptureUploadViewSchema=z.object({id,pageId:id,scope:paperCaptureScopeSchema,name:z.string().min(1).max(255),size:z.number().int().min(5).max(12*1024*1024),sha256:hash,mediaType:z.enum(['image/png','image/jpeg']),chunkSize:z.literal(1024*1024),chunks:z.array(z.object({index:z.number().int().min(0).max(11),sha256:hash,bytes:z.number().int().positive().max(1024*1024)}).strict()).max(12),revision:z.number().int().min(0).max(13),status:z.enum(['uploading','completed','cancelled']),createdAt:time,expiresAt:time,endedAt:time.nullable()}).strict();
export type PaperCaptureUploadView=z.infer<typeof paperCaptureUploadViewSchema>;
export const paperCapturePageViewSchema=z.object({id,filename:z.string().min(1).max(255),scope:paperCaptureScopeSchema,revision:z.number().int().positive(),selectedVersionFingerprint:hash,canEdit:z.boolean(),ownerClosed:z.boolean(),source:paperImageSourceSchema,versions:z.array(z.object({version:paperImageVersionSchema,createdAt:time}).strict()).min(1)}).strict();
export type PaperCapturePageView=z.infer<typeof paperCapturePageViewSchema>;
export const paperCaptureGroupViewSchema=z.object({id,scope:paperCaptureScopeSchema,revision:z.number().int().positive(),createdAt:time,ownerClosed:z.boolean(),canEdit:z.boolean(),history:z.array(z.object({version:paperCaptureGroupVersionSchema,at:time}).strict()).min(1).max(1000),current:paperCaptureGroupVersionSchema}).strict();
export type PaperCaptureGroupView=z.infer<typeof paperCaptureGroupViewSchema>;
export const paperCaptureDerivationViewSchema=z.object({id,scope:paperCaptureScopeSchema,groupId:id,groupRevision:z.number().int().positive(),groupFingerprint:hash,sourceChanged:z.boolean(),createdAt:time,ownerClosed:z.boolean(),status:z.enum(['pdf_ready','unavailable','processing','cancelling','queued','cancelled','failed','succeeded']),pdf:paperCapturePdfReceiptSchema.nullable(),materialId:id.nullable(),publishedAt:time.nullable(),canCancel:z.boolean(),canRetry:z.boolean(),
 task:z.object({id,state:z.enum(['queued','running','retry_wait','cancel_requested','cancelled','succeeded','failed']),version:z.number().int().positive(),generation:z.number().int().positive(),errorCode:z.string().nullable(),stage:z.string().nullable()}).strict().nullable(),
 recognition:z.object({materialId:id,status:z.enum(['queued','processing','ready','needs_review','failed','cancelled']).optional(),pageCount:z.number().int().min(0),processedPages:z.number().int().min(0),reviewRequired:z.boolean()}).strict().nullable()}).strict();
export type PaperCaptureDerivationView=z.infer<typeof paperCaptureDerivationViewSchema>;
export const paperCaptureLimitsSchema=z.object({mediaTypes:z.array(z.enum(['image/png','image/jpeg'])),imageBytes:z.number().int().positive(),imagePixels:z.number().int().positive(),imageDimension:z.number().int().positive(),chunkBytes:z.number().int().positive(),groupPages:z.number().int().positive(),groupOriginalBytes:z.number().int().positive(),wholePageImages:z.literal(1),singleQuestionImages:z.literal(4),derivedPdfPixels:z.number().int().positive(),derivedPdfBytes:z.number().int().positive()}).strict();
export type PaperCaptureLimits=z.infer<typeof paperCaptureLimitsSchema>;

const copyByteLimit=50*1024*1024;
export const paperCaptureCopyOriginalSchema=z.object({sha256:hash,bytes:z.number().int().min(0).max(copyByteLimit),mediaType:z.string().max(180)}).strict();
export const paperCaptureTransformDraftSchema=z.object({x:z.string().max(10000),y:z.string().max(10000),width:z.string().max(10000),height:z.string().max(10000),rotation:z.string().max(10000)}).strict();
export const paperCaptureCopyUploadBindingSchema=z.object({uploadId:id,pageId:id}).strict();
export const paperCaptureCopyGroupBindingSchema=z.object({groupId:id,pageIds:z.array(id).max(120)}).strict();
export const paperCaptureCopyDerivationBindingSchema=z.object({derivationId:id,groupId:id}).strict();
/** Editing bases are frozen when input starts. Restoring a copy must not replace
 * them with the latest server revisions, even when the selected pixels match. */
export const paperCaptureEditorSchema=z.object({slot:id,activeGroupId:id.nullable(),
 pageBases:z.array(z.object({pageId:id,revision:z.number().int().positive(),selectedVersionFingerprint:hash}).strict()).max(120),
 groupBases:z.array(z.object({groupId:id,revision:z.number().int().positive(),fingerprint:hash}).strict()).max(64)}).strict();
export type PaperCaptureEditor=z.infer<typeof paperCaptureEditorSchema>;
export const paperCaptureCompleteCopySchema=z.object({protocol:z.literal('paper-capture-complete-copy-v1'),actorId:id,scope:paperCaptureScopeSchema,title:z.string().max(180),intent:paperCaptureIntentSchema,
 pages:z.array(z.object({pageId:id,name:z.string().min(1).max(255),original:paperCaptureCopyOriginalSchema,source:paperImageSourceSchema.nullable(),transform:paperImageTransformSchema.nullable(),draft:paperCaptureTransformDraftSchema.nullable(),base64:z.string().max(Math.ceil(copyByteLimit/3)*4)}).strict()).max(120),
 selectedPageIds:z.array(id).max(120),uploads:z.array(paperCaptureCopyUploadBindingSchema).max(240),groups:z.array(paperCaptureCopyGroupBindingSchema).max(64),derivations:z.array(paperCaptureCopyDerivationBindingSchema).max(240).optional(),editor:paperCaptureEditorSchema.optional(),pending:paperCapturePendingCommandSchema.nullable(),rejected:z.array(paperCapturePendingCommandSchema).max(50),requiresOriginalResultLookup:z.boolean(),fingerprint:hash}).strict().superRefine((copy,context)=>{
 const editor=copy.editor;if(!editor)return;
 if(new Set(editor.pageBases.map(base=>base.pageId)).size!==editor.pageBases.length||editor.pageBases.some(base=>!copy.pages.some(page=>page.pageId===base.pageId&&page.source!==null))||
    new Set(editor.groupBases.map(base=>base.groupId)).size!==editor.groupBases.length||editor.groupBases.some(base=>!copy.groups.some(group=>group.groupId===base.groupId))||
    editor.activeGroupId!==null&&!editor.groupBases.some(base=>base.groupId===editor.activeGroupId))context.addIssue({code:z.ZodIssueCode.custom,path:['editor'],message:'编辑依据与副本的原页或采集组不一致，请保留原输入后核对。'});
});
export type PaperCaptureCompleteCopy=z.infer<typeof paperCaptureCompleteCopySchema>;
export type PaperCaptureTransformDraft=z.infer<typeof paperCaptureTransformDraftSchema>;
