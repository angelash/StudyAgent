import type { ProjectAssetUpload,ProjectAssetView } from '@study-agent/contracts';

export type ProjectFileAuthorization={role:string;bindingId?:string;guardianId?:string;accessId?:string;accessVersion?:number;teacherAssignmentId?:string};
export type ProjectUploadRecord=ProjectAssetUpload&{ownerUserId:string;studentId:string|null;requestKey:string;inputHash:string;
  definitionHash:string;authorization:ProjectFileAuthorization;cleanupTaskId?:string;filesCollectedAt?:string};
export type ProjectAssetRecord=Omit<ProjectAssetView,'status'|'task'>&{ownerUserId:string;studentId:string|null;uploadId:string;definitionFingerprint:string;definitionHash:string;
  authorization:ProjectFileAuthorization;taskId:string;inputHash:string;status:'queued'|'processing'|'ready'|'cancelled'|'deleting'|'deleted';
  commands:Array<{key:string;hash:string;kind:string}>;cleanupTaskId?:string;filesCollectedAt?:string};
