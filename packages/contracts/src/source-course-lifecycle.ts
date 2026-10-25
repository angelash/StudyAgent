import type { SourceCourseSummary } from './source-course';

export type SourceCourseLifecycleAction = 'publish'|'archive'|'withdraw'|'restore'|'discard';
export type SourceCourseLifecycleState = 'draft'|'published'|'archived'|'withdrawn'|'discarded';
export type SourceCourseLifecycleEvent = { id:string; action:SourceCourseLifecycleAction|'revise'; at:string; actorId:string;
  reason:string; fromStatus:SourceCourseSummary['status']; toStatus:SourceCourseSummary['status']; relatedCourseIds:string[] };
export type SourceCourseVersioning = { familyId:string; parentCourseId:string|null; number:number; state:SourceCourseLifecycleState;
  copiedAt?:string; events:SourceCourseLifecycleEvent[] };
export type SourceCourseVersionSummary = { id:string; title:string; number:number; parentCourseId:string|null;
  status:SourceCourseSummary['status']; state:SourceCourseLifecycleState; revision:number; confirmedAt:string|null };
export type SourceCourseLifecyclePreview = { courseId:string; action:SourceCourseLifecycleAction; expectedRevision:number;
  fingerprint:string; impactFingerprint:string; requiresReason:boolean; sourceStatus:'current'|'changed'|'unavailable';
  versions:SourceCourseVersionSummary[]; changes:Array<{courseId:string; title:string; fromStatus:SourceCourseSummary['status']; toStatus:SourceCourseSummary['status']}>;
  existing:{sessions:number; completedLectures:number; answeredQuestions:number};
  effects:{newClassrooms:'allowed'|'blocked'; existingClassrooms:'frozen-and-retained'; priorLearning:'not-transferred'} };
