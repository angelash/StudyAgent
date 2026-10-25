import type { ClassroomPracticeSummary } from './classroom';
export type CourseLessonActivity={lessonId:string;kind:'lecture'|'unit_check';
  reading:{state:'not_started'|'reading'|'read';sessionId:string|null;cursor:number;sentenceCursor:number;resuming:boolean;contentCurrent:boolean};
  practice:{state:'not_started'|'in_progress'|'answered';sessionId:string|null;summary:ClassroomPracticeSummary}};
export type CourseProjectActivity={projectId:string;unitId:string;title:string;definitionFingerprint:string;definitionCurrent:boolean;stageId:string;
  totalStages:number;draftStages:number;submittedStages:number;reviewedStages:number;readyStages:number;updatedAt:string};
export type SourceCourseJourney={lessons:CourseLessonActivity[];projects:CourseProjectActivity[];unitCheck:'not_configured'};
