import { z } from 'zod';

export const projectAssetLimits={bytes:20*1024*1024,textBytes:1024*1024,chunkBytes:1024*1024,attachments:20,pdfPages:120,audioSeconds:180,expiresHours:24} as const;
export const projectAssetTypes=['image/png','image/jpeg','application/pdf','text/plain','text/markdown','text/csv','text/x-c++src',
  'audio/webm','audio/ogg','audio/wav','audio/mpeg','audio/mp4',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'] as const;
const id=z.string().min(1).max(200),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const projectAssetUploadSchema=z.object({projectId:id,stageId:id,definitionFingerprint:hash,name:z.string().trim().min(1).max(255),size:z.number().int().positive().max(projectAssetLimits.bytes),mediaType:z.enum(projectAssetTypes),sha256:hash,requestKey:z.string().min(8).max(180)}).strict();
export type ProjectAssetType=typeof projectAssetTypes[number];
export type ProjectAssetKind='image'|'pdf'|'text'|'audio'|'office';
export type ProjectAttachmentRef={assetId:string;label:string;caption:string;evidenceId?:string};
export type ProjectAssetFile={name:string;sha256:string;size:number;mediaType:string};
export type ProjectAttachmentSnapshot=ProjectAttachmentRef&{filename:string;kind:ProjectAssetKind;original:ProjectAssetFile;display?:ProjectAssetFile;normalizationVersion:string};
export type ProjectAssetUpload={id:string;projectId:string;stageId:string;definitionFingerprint:string;name:string;size:number;mediaType:ProjectAssetType;sha256:string;chunkSize:number;
  chunks:Array<{index:number;sha256:string;size:number}>;status:'uploading'|'completed'|'cancelled'|'expired';revision:number;assetId:string|null;createdAt:string;expiresAt:string;completedAt:string|null};
export type ProjectAssetView={id:string;projectId:string;stageId:string;name:string;kind:ProjectAssetKind;mediaType:ProjectAssetType;revision:number;
  status:'queued'|'processing'|'ready'|'failed'|'cancelling'|'cancelled'|'deleting'|'deleted';original:ProjectAssetFile;display?:ProjectAssetFile;
  previews:Array<{page:number;file:ProjectAssetFile}>;pageCount:number|null;durationMs:number|null;width:number|null;height:number|null;
  normalizationVersion:string|null;createdAt:string;updatedAt:string;task:{state:string;version:number;generation:number;errorCode:string|null}|null};
export type ProjectFileIntegrity={assetId:string;checkedAt:string;complete:boolean;files:Array<{name:string;sha256:string;size:number;status:'verified'|'unavailable'}>};
