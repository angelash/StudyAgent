import { z } from 'zod';
import type { ClassroomLesson } from './classroom';
import type { StudioPdfStructureBlock, StudioSubject } from './studio';
import type { SourceCourseVersioning } from './source-course-lifecycle';
import type { SourceCompilationView } from './source-course-compilation';
import type { SourceCourseJourney } from './course-journey';
const text = (max: number) => z.string().trim().min(1).max(max);
export const sourceCourseLessonContentSchema = z.object({ title: text(100), objective: text(350), introduction: text(400), concept: text(900),
  notes: z.array(text(80)).min(2).max(5), example: z.object({ scenario: text(500), steps: z.array(text(200)).min(2).max(6), board: z.array(text(80)).min(2).max(6), conclusion: text(350) }).strict(),
  misconception: z.object({ claim: text(250), correction: text(500),board:z.array(text(80)).min(2).max(3) }).strict(), transfer: text(500), summary: text(300),takeaways:z.array(text(80)).min(2).max(4),
  citations: z.array(z.object({ sourceKey: text(100), quote: text(500) }).strict()).min(1).max(5),
  questions: z.array(z.object({ prompt: text(700), options: z.array(text(220)).length(4), answer: z.number().int().min(0).max(3),
    explanation: text(600), hints: z.array(text(200)).length(2) }).strict()).min(2).max(4),
}).strict();
export const sourceCourseContentSchema = z.object({ title: text(180), overview: text(700), lessons: z.array(sourceCourseLessonContentSchema).min(1).max(6) }).strict();
export const compiledSourceCourseContentSchema = sourceCourseContentSchema.extend({lessons:z.array(sourceCourseLessonContentSchema).min(1).max(24)});
export type SourceCourseContent = z.infer<typeof sourceCourseContentSchema>;
export type SourceCourseLessonContent = z.infer<typeof sourceCourseLessonContentSchema>;
export type SourceCourseReviewField = 'title'|'objective'|'introduction'|'concept'|'notes'|'example'|'misconception'|'transfer'|'summary'|'takeaways'|'questions'|'citations';
export type SourceCourseReviewIssue = { field: SourceCourseReviewField; questionIndex: number | null; quote: string; detail: string };
export type SourceCourseLessonReview = { decision: 'pass'|'revised'|'uncertain'; issues: SourceCourseReviewIssue[]; at: string; modelId: string; modelName: string; inputFingerprint: string; outputFingerprint: string };
export type SourceCourseGenerationView = { version: string; inputCapture: 'creation'|'worker-start'; stage: 'planning'|'writing'|'reviewing'|'integrating'|'completed';
  plannedLessons: number | null; draftedLessons: number; reviewedLessons: number; scopeNote: string | null; uncoveredSourceKeys: string[];
  modelId: string | null; modelName: string | null; reviewCurrent: boolean;
  reviews: Array<{ lessonIndex: number; lessonTitle: string; decision: SourceCourseLessonReview['decision']; issueCount: number }> };

export type CourseSourceSnapshot = { key: string; materialId: string; page: number; title: string; kind: 'pdf' | 'text';
  text: string; blocks: StudioPdfStructureBlock[]; sha256: string; version: string; fingerprint: string; structureReviewRequired: boolean;
  textCharacters?:number;range?:{sourceKey:string;start:number;end:number} };
export type SourceCourseInput = { title: string; goal: string; language: 'source' | 'zh-CN' | 'en'; minutesPerSession: number;
  modelId: string; targetAtomIds: string[] };
export type SourceCourseSummary = { id: string; studentId: string | null; subject: StudioSubject | null; title: string;
  goal: string; versioning?: SourceCourseVersioning; status: 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled' | 'active' | 'archived';
  lessonCount: number; viewed: number; lastLessonId: string | null; lastSessionId?: string | null; nextLessonId?: string | null; nextLessonTitle?: string | null; lastStudied: string | null; createdAt: string; updatedAt: string };
export type SourceCourseView = SourceCourseSummary & { revision: number; input: SourceCourseInput; sources: CourseSourceSnapshot[];
  journey?:SourceCourseJourney;
  compilation?: SourceCompilationView;
  permissions: { manage: boolean }; overview: string | null;
  generation: SourceCourseGenerationView | null;
  generationInput: SourceCourseInput | null;
  contentReview: 'pending'; formalMeasurementEligible: false; sourceStatus: 'current' | 'changed' | 'unavailable';
  fingerprint: string | null; modelName: string | null; lessons: ClassroomLesson[];
  task: { id: string; state: string; version: number; generation: number; errorCode: string | null } | null;
  confirmedAt: string | null };

export type SourceCourseAuthoring = { courseId: string; revision: number; content: SourceCourseContent; originalContent: SourceCourseContent; contentReview: 'pending';
  lessonId?:string;
  sources?:CourseSourceSnapshot[];
  generationInput: SourceCourseInput | null; generationReviews: Array<{ lessonIndex: number; lessonTitle: string; review: SourceCourseLessonReview }>; reviewCurrent: boolean };
