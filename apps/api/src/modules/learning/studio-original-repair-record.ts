import type { StudioOriginalRepair,StudioSubject } from '@study-agent/contracts';
import type { OriginalRepairIdentity,OriginalRepairObservation } from '../../infrastructure/studio-original-repair';

export type StudioOriginalRepairRecord=Omit<StudioOriginalRepair,'task'|'canManage'>&{
 ownerUserId:string;studentId:string|null;subject:StudioSubject|null;materialOwnerUserId:string|null;materialVersion:string;uploadRevision:number;taskId:string;
 identity:OriginalRepairIdentity;baseline:OriginalRepairObservation;
 authorization:{role:string;bindingId?:string;guardianId?:string;accessVersion?:number;accessId?:string};
 requests:Array<{key:string;kind:'start'|'cancel'|'retry';hash:string}>;
};
