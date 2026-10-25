import { z } from 'zod';
import type { CourseSourceSnapshot } from './source-course';

const text=(max:number)=>z.string().trim().min(1).max(max);
export const sourceCourseCheckSelectionSchema=z.object({modelId:text(120),lessonIds:z.array(text(400)).min(2).max(6)}).strict().superRefine((value,context)=>{
  if(new Set(value.lessonIds).size!==value.lessonIds.length)context.addIssue({code:'custom',message:'核查目标不能重复',path:['lessonIds']});
});
export type SourceCourseCheckSelection=z.infer<typeof sourceCourseCheckSelectionSchema>;
export const sourceCourseCheckQuestionSchema=z.object({prompt:text(700),targetLessonIds:z.array(text(400)).min(1).max(2),
  options:z.array(text(220)).min(4).max(6),selectionMode:z.enum(['single','multiple']),correctIndices:z.array(z.number().int().min(0).max(5)).min(1).max(5),
  optionExplanations:z.array(text(400)).min(4).max(6),explanation:text(700),hints:z.array(text(200)).length(2),
  citations:z.array(z.object({sourceKey:text(100),quote:text(500)}).strict()).min(1).max(3),
}).strict();
export const sourceCourseCheckContentSchema=z.object({title:text(180),instructions:text(700),questions:z.array(sourceCourseCheckQuestionSchema).min(4).max(8)}).strict();
export type SourceCourseCheckContent=z.infer<typeof sourceCourseCheckContentSchema>;
export type SourceCourseCheckQuestion=z.infer<typeof sourceCourseCheckQuestionSchema>;
export type SourceCourseCheckView={id:string;courseId:string;revision:number;courseCurrent:boolean;
  status:'queued'|'generating'|'ready'|'failed'|'cancelling'|'cancelled'|'published'|'superseded'|'withdrawn';
  title:string|null;modelId:string;modelName:string;questionCount:number;contentFingerprint:string|null;contentVersion:number|null;
  targets:Array<{lessonId:string;title:string;objective:string}>;stage:'writing'|'reviewing'|'completed';
  review:{decision:'pass'|'revised'|'uncertain';issueCount:number;current:boolean}|null;
  publication:{checkId:string|null;revision:number;current:boolean}|null;contentReview:'pending';formalMeasurementEligible:false;
  task:{id:string;state:string;generation:number;version:number;errorCode:string|null}|null;
  createdAt:string;updatedAt:string;receipt?:{key:string;kind:string;actorUserId:string;effectiveRevision:number;at:string;contentFingerprint?:string;contentVersion?:number;publicationRevision?:number}};
export type SourceCourseCheckAuthoring={view:SourceCourseCheckView;content:SourceCourseCheckContent;contentFingerprint:string;contentVersion:number;
  sources?:CourseSourceSnapshot[];
  historical:boolean;originalContent:SourceCourseCheckContent|null;review:{decision:'pass'|'revised'|'uncertain';issues:string[];modelId:string;at:string;current:boolean}|null};
