import type { CourseSourceSnapshot, SourceCourseInput, SourceCourseLessonContent } from './source-course';

export const sourceCompilationLimits = { pages: 120, characters: 180000, chunks: 180, lessons: 24, chunkTarget: 4000, chunkMaximum: 6000, contextCharacters: 18000 } as const;
export const sourceCompilationVersion = 'source-course-v3' as const;
export type SourceChunkSummary = {
  key: string; sourceKey: string; start: number; end: number; characters: number; sha256: string;
  warnings: string[];
};
export type SourceCoursePreflight = {
  version: typeof sourceCompilationVersion; fingerprint: string; valid: boolean; requiresLongMode: boolean;
  characters: number; pages: number; chunks: SourceChunkSummary[]; serializedBytes: number;
  sources: Array<{key:string;title:string;page:number;kind:CourseSourceSnapshot['kind'];characters:number;reviewRequired:boolean}>;
  issues: string[]; warnings: string[];
};
export type SourceCoverage = SourceChunkSummary & {
  title: string; page: number; plannedLessonIds: string[]; citedLessonIds: string[];
  omittedReason: string | null; reviewRequired: boolean;
};
export type SourceCompilationView = {
  version: typeof sourceCompilationVersion; stage: 'indexing'|'planning'|'writing'|'reviewing'|'integrating'|'completed';
  chunks: number; indexedChunks: number; planGroups: number; plannedGroups: number;
  draftedLessons: number; reviewedLessons: number; plannedLessons: number | null;
  modelId: string | null; modelName: string | null; input: SourceCourseInput | null; reviewCurrent: boolean;
  reviews:Array<{lessonIndex:number;lessonTitle:string;decision:'pass'|'revised'|'uncertain';issueCount:number}>;
  coverage: SourceCoverage[]; scopeNote: string | null;
};
export type SourceLessonAuthoring = {
  courseId: string; lessonId: string; revision: number; title: string; overview: string;
  content: SourceCourseLessonContent; originalContent: SourceCourseLessonContent;
  sources: CourseSourceSnapshot[]; reviewCurrent: boolean;
};
