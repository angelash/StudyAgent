import type { SourceCourseCheckContent } from '@study-agent/contracts';
import type { PreparedSourceCheck } from './source-course-check-content';

export type SourceCourseCheckRecord={id:string;ownerUserId:string;studentId:string|null;courseId:string;courseFingerprint:string;
  requestKey:string;requestHash:string;prepared:PreparedSourceCheck;revision:number;taskId:string;
  status:'queued'|'generating'|'ready'|'failed'|'cancel_requested'|'cancelled'|'published'|'superseded'|'withdrawn';
  content:SourceCourseCheckContent|null;originalContent:SourceCourseCheckContent|null;
  modelReview:{decision:'pass'|'revised'|'uncertain';inputFingerprint:string;outputFingerprint:string;modelId:string;at:string;issues:string[]}|null;
  createdAt:string;updatedAt:string;publishedAt:string|null;withdrawnAt:string|null;
  commands:Array<{key:string;kind:string;hash:string;effectiveRevision:number;at:string}>};
export type SourceCourseCheckPublication={id:string;courseId:string;checkId:string;definitionFingerprint:string;revision:number;updatedAt:string};
