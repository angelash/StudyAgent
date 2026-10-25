import type { SourceCourseCheckContent } from '@study-agent/contracts';
import type { PreparedSourceCheck } from './source-course-check-content';
import type { InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';

export type SourceCheckAuthorization={role:InMemoryUserAccount['role'];sessionTokenHash:string;bindingId?:string;bindingHash?:string;
  guardianId?:string;accessId?:string;accessVersion?:number};

export type SourceCourseCheckRecord={id:string;ownerUserId:string;studentId:string|null;courseId:string;courseFingerprint:string;
  requestKey:string;requestHash:string;prepared:PreparedSourceCheck;revision:number;taskId:string;
  authorization?:SourceCheckAuthorization;generationStage?:'writing'|'reviewing'|'completed';modelName?:string;contentFingerprint?:string|null;draftFingerprint?:string;
  contentVersion?:number;contentUpdatedAt?:string;contentActorId?:string|null;
  contentHistory?:Array<{contentVersion:number;contentFingerprint:string;content:SourceCourseCheckContent;at:string|null;actorId:string|null;modelId?:string}>;
  authoringExposures?:Array<{actorId:string;contentFingerprint:string;at:string}>;
  status:'queued'|'generating'|'ready'|'failed'|'cancel_requested'|'cancelled'|'published'|'superseded'|'withdrawn';
  content:SourceCourseCheckContent|null;originalContent:SourceCourseCheckContent|null;
  modelReview:{decision:'pass'|'revised'|'uncertain';inputFingerprint:string;outputFingerprint:string;modelId:string;at:string;issues:string[]}|null;
  createdAt:string;updatedAt:string;publishedAt:string|null;withdrawnAt:string|null;
  commands:Array<{key:string;kind:string;hash:string;effectiveRevision:number;at:string;actorUserId?:string;contentFingerprint?:string;contentVersion?:number;publicationRevision?:number}>};
export type SourceCourseCheckPublication={id:string;courseId:string;ownerUserId:string;studentId:string|null;checkId:string|null;definitionFingerprint:string|null;revision:number;updatedAt:string};
