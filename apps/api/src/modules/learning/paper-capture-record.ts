import {z} from 'zod';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {paperCaptureScopeSchema,type PaperCaptureScope} from './paper-capture-scope';
import {paperCapturePendingCommandSchema,type PaperCapturePendingCommand} from './paper-capture-command';
import {paperRepairAssetIntentSchema} from './paper-capture-repair-record';

const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.string().datetime({offset:true});
export const PAPER_IMAGE_CHUNK_BYTES=1024*1024;
export const PAPER_IMAGE_UPLOAD_EXPIRES_MS=24*3600*1000;
export const paperImageUploadRecordSchema=z.object({protocol:z.literal('paper-image-upload-record-v1'),id,actorId:id,scope:paperCaptureScopeSchema,pageId:id,
 name:z.string().min(1).max(255),size:z.number().int().min(5).max(12*1024*1024),sha256:hash,mediaType:z.enum(['image/png','image/jpeg']),
 requestKey:z.string().min(8).max(180),commandId:id,chunkSize:z.literal(PAPER_IMAGE_CHUNK_BYTES),chunks:z.array(z.object({index:z.number().int().min(0).max(11),sha256:hash,bytes:z.number().int().positive().max(PAPER_IMAGE_CHUNK_BYTES)}).strict()).max(12),
 revision:z.number().int().min(0).max(13),status:z.enum(['uploading','completed','cancelled']),createdAt:time,expiresAt:time,endedAt:time.nullable(),terminalCommandId:id.nullable(),
 preparedFileIds:z.array(hash).max(3),filesCollectedAt:time.optional(),systemClosure:z.literal('expired').optional(),learningAccess:z.object({guardianId:id,accessVersion:z.number().int().positive()}).strict().optional(),guardianDeletionHash:hash.optional()}).strict();
export type PaperImageUploadRecord=z.infer<typeof paperImageUploadRecordSchema>;
export const paperCaptureCommandRecordSchema=z.object({protocol:z.literal('paper-capture-command-record-v1'),id,actorId:id,scope:paperCaptureScopeSchema,
 requestKey:z.string().min(8).max(180),input:paperCapturePendingCommandSchema,requestHash:hash,status:z.enum(['preparing','committed','rejected']),generation:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),preparedAt:time,at:time,fileIds:z.array(hash).max(3),errorCode:z.string().min(1).max(180).nullable(),result:z.record(z.string(),z.unknown()).nullable(),resultHash:hash.nullable(),
 authorization:z.object({actorRole:z.enum(['parent','admin','teacher','operator','student']),actorVersion:z.number().int().min(0),learningAccess:z.object({guardianId:id,accessVersion:z.number().int().positive()}).strict().optional(),guardianDeletionHash:hash.optional()}).strict().optional()}).strict();
export type PaperCaptureCommandRecord=z.infer<typeof paperCaptureCommandRecordSchema>;
export type CommittedPaperCaptureCommandRecord=PaperCaptureCommandRecord&{status:'committed';result:Record<string,unknown>;resultHash:string};
export const paperCaptureFileAssetSchema=z.object({protocol:z.literal('paper-capture-file-asset-v1'),id:hash,role:z.enum(['original','baseline','derived','pdf']),sha256:hash,bytes:z.number().int().positive().max(80*1024*1024),mediaType:z.enum(['image/png','image/jpeg','application/pdf']),
 state:z.enum(['available','deleting','deleted','repairing']),generation:z.number().int().positive(),createdAt:time,updatedAt:time,cleanupTaskId:id.nullable(),paperCaptureRepair:paperRepairAssetIntentSchema.optional()}).strict();
export type PaperCaptureFileAsset=z.infer<typeof paperCaptureFileAssetSchema>;
export type PaperCaptureGroupRecord=import('./paper-capture-group-record').PaperCaptureGroupRecord;
export type PaperCaptureDerivationRecord=import('./paper-capture-derivation-record').PaperCaptureDerivationRecord;

export const paperCaptureCommandId=(actorId:string,requestKey:string)=>'paper_command_'+retentionDigest({actorId,requestKey});
export const paperCaptureCommandHash=(actorId:string,scope:PaperCaptureScope,input:PaperCapturePendingCommand)=>retentionDigest({actorId,scope,input});
export const paperCaptureFileId=(role:PaperCaptureFileAsset['role'],sha256:string)=>retentionDigest({role,sha256});
export function preparePaperCaptureCommand(actorId:string,scope:PaperCaptureScope,input:PaperCapturePendingCommand,result:Record<string,unknown>,at:string):CommittedPaperCaptureCommandRecord{
 const parsed=paperCapturePendingCommandSchema.parse(input);if(retentionDigest(parsed)!==retentionDigest(input))throw Error('paper_capture_complete_command_required');
 return assertPaperCaptureCommand({protocol:'paper-capture-command-record-v1',id:paperCaptureCommandId(actorId,input.requestKey),actorId,scope:structuredClone(scope),requestKey:input.requestKey,input:structuredClone(input),requestHash:paperCaptureCommandHash(actorId,scope,input),status:'committed',generation:1,preparedAt:at,at,fileIds:[],errorCode:null,result:structuredClone(result),resultHash:retentionDigest(result)})as CommittedPaperCaptureCommandRecord;
}
export function assertPaperCaptureCommand(value:PaperCaptureCommandRecord){
 if(value.authorization&&(value.authorization.learningAccess&&value.authorization.guardianDeletionHash||value.authorization.actorRole==='student'&&(!value.scope.studentId||!value.authorization.learningAccess&&!value.authorization.guardianDeletionHash)||value.authorization.actorRole!=='student'&&(value.authorization.learningAccess||value.authorization.guardianDeletionHash)||!['recognize','cancelDerivation','retryDerivation'].includes(value.input.kind)))throw Error('paper_capture_original_authorization_changed');
 const row=paperCaptureCommandRecordSchema.parse(value);if(retentionDigest(row)!==retentionDigest(value)||row.id!==paperCaptureCommandId(row.actorId,row.requestKey)||row.requestKey!==row.input.requestKey||row.requestHash!==paperCaptureCommandHash(row.actorId,row.scope,row.input)||row.scope.creatorFingerprint!==retentionDigest({id:row.actorId})||Date.parse(row.at)<Date.parse(row.preparedAt)||new Set(row.fileIds).size!==row.fileIds.length||row.status==='committed'&&(!row.result||row.resultHash!==retentionDigest(row.result)||row.errorCode!==null)||row.status!=='committed'&&(row.result!==null||row.resultHash!==null)||row.status==='preparing'&&row.errorCode!==null||row.status==='rejected'&&row.errorCode===null)throw Error('paper_capture_original_command_changed');return row;
}
export function pendingPaperCaptureCommand(actorId:string,scope:PaperCaptureScope,input:PaperCapturePendingCommand,at:string):PaperCaptureCommandRecord{
 return assertPaperCaptureCommand({...preparePaperCaptureCommand(actorId,scope,input,{},at),status:'preparing',result:null,resultHash:null});
}
export function assertPaperImageUpload(value:PaperImageUploadRecord){
 const row=paperImageUploadRecordSchema.parse(value),chunks=Math.ceil(row.size/row.chunkSize);
 if(retentionDigest(row)!==retentionDigest(value)||row.scope.creatorFingerprint!==retentionDigest({id:row.actorId})||row.commandId!==paperCaptureCommandId(row.actorId,row.requestKey)||Date.parse(row.expiresAt)-Date.parse(row.createdAt)!==PAPER_IMAGE_UPLOAD_EXPIRES_MS||new Set(row.preparedFileIds).size!==row.preparedFileIds.length||new Set(row.chunks.map(chunk=>chunk.index)).size!==row.chunks.length||row.chunks.some((chunk,index)=>chunk.index>=chunks||chunk.bytes!==Math.min(row.chunkSize,row.size-chunk.index*row.chunkSize)||index>0&&row.chunks[index-1].index>=chunk.index))throw Error('paper_capture_original_upload_changed');
 if(row.status==='uploading'&&(row.endedAt!==null||row.terminalCommandId!==null||row.guardianDeletionHash!==undefined||row.systemClosure!==undefined||row.revision!==row.chunks.length||row.filesCollectedAt!==undefined)||row.status!=='uploading'&&(!row.endedAt||!row.terminalCommandId&&!row.guardianDeletionHash&&!row.systemClosure||Date.parse(row.endedAt)<Date.parse(row.createdAt)||row.revision!==row.chunks.length+1)||row.status==='completed'&&row.chunks.length!==chunks||row.systemClosure&&(row.status!=='cancelled'||row.terminalCommandId!==null||Date.parse(row.endedAt!)<Date.parse(row.expiresAt))||row.filesCollectedAt&&Date.parse(row.filesCollectedAt)<Date.parse(row.endedAt!))throw Error('paper_capture_original_upload_state_changed');
 return row;
}
