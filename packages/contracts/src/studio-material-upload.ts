import type { StudioSourceMaterial,StudioSubject } from './studio';

export const studioMaterialLimits={bytes:50*1024*1024,pages:120,chunkBytes:4*1024*1024,expiresHours:24} as const;
export type StudioMaterialUpload={
  id:string;ownerUserId:string;studentId:string|null;subject:StudioSubject|null;name:string;size:number;sha256:string;
  chunkSize:number;chunks:Array<{index:number;sha256:string;size:number}>;
  status:'uploading'|'completed'|'cancelled';revision:number;createdAt:string;expiresAt:string;completedAt:string|null;materialId:string|null;
};
export type StudioMaterialProgress={
  materialId:string;status:StudioSourceMaterial['status'];pageCount:number|null;processedPages:number;ocrPages:number;unreadablePages:number;
  pages:Array<{page:number;method:'pdf_text'|'ocr'|'hybrid'|'unreadable';warnings:string[];completedAt:string;resumed:boolean}>;
  task:{id:string;state:string;version:number;errorCode:string|null}|null;
};
